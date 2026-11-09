"""
Bridge between expression trees and SymPy.

SymPy is only ever used to produce a *simplified* form. The original tree is
never replaced, and anything SymPy returns that can't be expressed as a
frontend `Node` (complex numbers, sign(), Piecewise, …) is rejected, so the
caller falls back to the unsimplified tree.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from concurrent.futures import TimeoutError as FutureTimeout
from typing import Any

import sympy as sp

from .latex import to_tex
from .nodes import Node, bin_, call, const, neg, num, size, var

# sp.simplify can be slow on large trig expressions; past this size, or past
# the time limit, the lighter result is used instead.
FULL_SIMPLIFY_MAX_OPS = 60
FULL_SIMPLIFY_TIMEOUT_S = 2.0

_pool = ThreadPoolExecutor(max_workers=2, thread_name_prefix="explain-sympy")


class Unsupported(Exception):
    pass


_SP_FN = {
    "sin": sp.sin, "cos": sp.cos, "tan": sp.tan, "sec": sp.sec, "csc": sp.csc, "cot": sp.cot,
    "asin": sp.asin, "acos": sp.acos, "atan": sp.atan,
    "sinh": sp.sinh, "cosh": sp.cosh, "tanh": sp.tanh,
    "asinh": sp.asinh, "acosh": sp.acosh, "atanh": sp.atanh,
    "abs": sp.Abs, "exp": sp.exp, "ln": sp.log, "sqrt": sp.sqrt,
}
_FROM_SP = {
    sp.sin: "sin", sp.cos: "cos", sp.tan: "tan", sp.sec: "sec", sp.csc: "csc", sp.cot: "cot",
    sp.asin: "asin", sp.acos: "acos", sp.atan: "atan",
    sp.sinh: "sinh", sp.cosh: "cosh", sp.tanh: "tanh",
    sp.asinh: "asinh", sp.acosh: "acosh", sp.atanh: "atanh",
    sp.Abs: "abs", sp.exp: "exp", sp.log: "ln",
}


def _symbol(name: str) -> sp.Symbol:
    return sp.Symbol(name, real=True)


def _number(v: float) -> sp.Expr:
    if float(v).is_integer():
        return sp.Integer(int(v))
    text = repr(float(v))
    # Short decimals the user typed (0.5, 2.25) become exact fractions.
    return sp.Rational(text) if len(text) <= 8 and "e" not in text else sp.Float(v)


def to_sympy(n: Node, settings: dict[str, Any]) -> sp.Expr:
    t = n["type"]
    if t == "num":
        return _number(n["value"])
    if t == "const":
        return sp.pi if n["name"] == "pi" else sp.E
    if t == "var":
        return _symbol(n["name"])
    if t == "neg":
        return -to_sympy(n["arg"], settings)
    if t == "call":
        a = to_sympy(n["arg"], settings)
        fn = n["fn"]
        if fn == "cbrt":
            return a ** sp.Rational(1, 3)
        if fn == "log":
            return sp.log(a, 10) if settings.get("logBase") == "10" else sp.log(a)
        return _SP_FN[fn](a)
    a = to_sympy(n["left"], settings)
    b = to_sympy(n["right"], settings)
    op = n["op"]
    if op == "+":
        return a + b
    if op == "-":
        return a - b
    if op == "*":
        return a * b
    if op == "/":
        return a / b
    return a**b


def _product(factors: list[Node]) -> Node:
    out = factors[0]
    for f in factors[1:]:
        out = bin_("*", out, f)
    return out


def from_sympy(e: sp.Expr) -> Node:
    if e.has(sp.I, sp.zoo, sp.oo, -sp.oo, sp.nan):
        raise Unsupported(str(e))
    if e.is_Integer:
        return num(int(e))
    if e.is_Rational:
        p, q = int(e.p), int(e.q)
        f = bin_("/", num(abs(p)), num(q))
        return neg(f) if p < 0 else f
    if e.is_Float:
        return num(float(e))
    if e is sp.pi:
        return const("pi")
    if e is sp.E:
        return const("e")
    if e.is_Symbol:
        return var(e.name)

    if e.is_Add:
        terms = e.as_ordered_terms()
        out = from_sympy(terms[0])
        for t in terms[1:]:
            if t.could_extract_minus_sign():
                out = bin_("-", out, from_sympy(-t))
            else:
                out = bin_("+", out, from_sympy(t))
        return out

    if e.is_Mul:
        if e.could_extract_minus_sign():
            return neg(from_sympy(-e))
        nums: list[Node] = []
        dens: list[Node] = []
        for f in e.as_ordered_factors():
            if f.is_Rational and not f.is_Integer:
                if f.p != 1:
                    nums.append(num(int(f.p)))
                dens.append(num(int(f.q)))
            elif f.is_Pow and f.exp.is_number and f.exp.is_negative:
                dens.append(from_sympy(f.base ** (-f.exp)))
            else:
                nums.append(from_sympy(f))
        top = _product(nums) if nums else num(1)
        return bin_("/", top, _product(dens)) if dens else top

    if e.is_Pow:
        base, ex = e.base, e.exp
        if ex.is_number and ex.is_negative:
            return bin_("/", num(1), from_sympy(base ** (-ex)))
        if ex == sp.Rational(1, 2):
            return call("sqrt", from_sympy(base))
        if ex == sp.Rational(1, 3):
            return call("cbrt", from_sympy(base))
        return bin_("^", from_sympy(base), from_sympy(ex))

    if isinstance(e, sp.Function):
        name = _FROM_SP.get(e.func)
        if name and len(e.args) == 1:
            return call(name, from_sympy(e.args[0]))

    raise Unsupported(f"{type(e).__name__}: {e}")


def light(n: Node, settings: dict[str, Any]) -> Node:
    """SymPy's automatic tidy-up only (0·u, 1·u, like terms). Cheap."""
    try:
        return from_sympy(to_sympy(n, settings))
    except (Unsupported, TypeError, ValueError, RecursionError):
        return n


def _full(expr: sp.Expr) -> list[sp.Expr]:
    out: list[sp.Expr] = []
    if expr.is_rational_function():
        cancelled = sp.cancel(expr)
        num, den = sp.fraction(cancelled)
        # Cancelled, plus the factored forms people write: (x² + 1)² rather
        # than x⁴ + 2x² + 1 underneath, and a factored numerator when it helps.
        out += [cancelled, sp.factor(cancelled)]
        if den != 1:
            out.append(sp.Mul(sp.expand(num), sp.Pow(sp.factor(den), -1), evaluate=False))
    if sp.count_ops(expr) <= FULL_SIMPLIFY_MAX_OPS:
        out.append(sp.simplify(expr))
    return out


def _fns(n: Node, out: set[str]) -> set[str]:
    t = n["type"]
    if t == "call":
        out.add(n["fn"])
    if t in ("neg", "call"):
        _fns(n["arg"], out)
    elif t == "bin":
        # e^u and exp(u) are the same function; SymPy always writes the latter.
        if n["op"] == "^" and n["left"] == {"type": "const", "name": "e"}:
            out.add("exp")
        _fns(n["left"], out)
        _fns(n["right"], out)
    return out


# Roots and |u| are fair game; anything else (e.g. exp → cosh) would read as
# a different function than the one the user typed.
_ALWAYS_OK = {"abs", "sqrt", "cbrt"}


def simplest(n: Node, settings: dict[str, Any]) -> Node:
    """
    The smallest form among the input, SymPy's tidy-up, cancel and simplify,
    keeping only forms that use the functions already present.
    """
    allowed = _fns(n, set()) | _ALWAYS_OK
    candidates = [n]
    try:
        expr = to_sympy(n, settings)
        exprs = [expr]
        try:
            exprs += _pool.submit(_full, expr).result(timeout=FULL_SIMPLIFY_TIMEOUT_S)
        except FutureTimeout:
            pass
        for e in exprs:
            try:
                c = from_sympy(e)
            except (Unsupported, RecursionError):
                continue
            if _fns(c, set()) <= allowed:
                candidates.append(c)
    except (TypeError, ValueError, RecursionError, sp.SympifyError):
        pass
    # Ties keep the earlier candidate, so an already-simple input stays as typed.
    return min(candidates, key=size)


# ---------------------------------------------------------------------------
# Shown work for rational expressions: the factor / expand / cancel steps a
# person would write out, instead of jumping straight to SymPy's answer.
# ---------------------------------------------------------------------------


@dataclass
class AlgebraStep:
    key: str  # stable id suffix, e.g. "expand"
    title: str
    before: Node
    after: Node
    condition: Node | None = None  # cancelling a factor is only valid where it isn't 0


def _node(e: sp.Expr) -> Node | None:
    try:
        return from_sympy(e)
    except (Unsupported, RecursionError):
        return None


def _fraction_parts(n: Node, settings: dict[str, Any]) -> tuple[sp.Expr, sp.Expr] | None:
    try:
        expr = sp.together(to_sympy(n, settings))
    except (TypeError, ValueError, RecursionError, sp.SympifyError):
        return None
    num, den = sp.fraction(expr)
    return num, den


def _over(num: sp.Expr, den: sp.Expr) -> Node | None:
    """num/den as a node without letting SymPy re-combine it."""
    top, bottom = _node(num), _node(den)
    if top is None or bottom is None:
        return None
    return top if den == 1 else bin_("/", top, bottom)


def factor_and_cancel_steps(n: Node, settings: dict[str, Any]) -> list[AlgebraStep]:
    """
    Before differentiating: factor the numerator and denominator, then cancel
    what they share. Empty unless there is a common factor to cancel.
    """
    parts = _fraction_parts(n, settings)
    if parts is None:
        return []
    num, den = parts
    if den == 1 or not (num.is_polynomial() and den.is_polynomial()):
        return []
    common = sp.gcd(num, den)
    if common.is_number:
        return []

    steps: list[AlgebraStep] = []
    fnum, fden = sp.factor(num), sp.factor(den)
    current = n
    if fnum != num or fden != den:
        factored = _over(fnum, fden)
        if factored is not None:
            steps.append(AlgebraStep("factor", "Factor the numerator and denominator", current, factored))
            current = factored
    cancelled = _over(*sp.fraction(sp.factor(sp.cancel(num / den))))
    condition = _node(sp.factor(common))
    if cancelled is not None and condition is not None:
        steps.append(AlgebraStep("cancel", "Cancel the common factor", current, cancelled, condition))
    return steps


def quotient_cleanup_steps(raw: Node, final: Node, settings: dict[str, Any]) -> list[AlgebraStep]:
    """
    After the quotient rule: expand the numerator and combine like terms,
    factor it, cancel anything shared with the denominator, then any last
    simplification to reach `final`.
    """
    start = light(raw, settings)
    # Split the quotient rule's own (u'v - uv') / v² rather than letting SymPy
    # combine the fraction first, which would quietly cancel factors before
    # the "cancel" step gets to show it.
    if raw["type"] == "bin" and raw["op"] == "/":
        try:
            num, den = to_sympy(raw["left"], settings), to_sympy(raw["right"], settings)
        except (TypeError, ValueError, RecursionError, sp.SympifyError):
            return []
    else:
        parts = _fraction_parts(raw, settings)
        if parts is None:
            return []
        num, den = parts
    steps: list[AlgebraStep] = []
    current = start

    def add(key: str, title: str, after: Node | None, condition: Node | None = None) -> None:
        nonlocal current
        if after is not None and to_tex(after) != to_tex(current):
            steps.append(AlgebraStep(key, title, current, after, condition))
            current = after

    if den != 1:
        expanded = sp.expand(num)
        add("expand", "Expand the numerator and combine like terms", _over(expanded, den))
        factored = sp.factor(expanded)
        add("factor", "Factor the numerator", _over(factored, den))
        common = sp.gcd(expanded, den)
        if not common.is_number:
            reduced = sp.cancel(expanded / den)
            add("cancel", "Cancel factors shared with the denominator", _over(*sp.fraction(sp.factor(reduced))), _node(sp.factor(common)))
    add("simplify", "Simplify", final)
    return steps
