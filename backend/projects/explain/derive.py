"""
Symbolic differentiation that logs each rule it applies as a Step.
Step ids follow the shape of the tree (deriv1, deriv1.r.0, deriv1.r.0.1 …) so
the same function always produces the same ids — the diff view relies on it.
The rule tree is built here; SymPy only tidies each intermediate result and
simplifies the final derivative.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from .latex import to_tex
from .nodes import Node, bin_, call, contains_var, neg, num
from .symbolic import light, simplest

FN_LABEL = {"asin": "arcsin", "acos": "arccos", "atan": "arctan", "sqrt": "√"}

Step = dict[str, Any]


def _outer(fn: str, u: Node, log_base10: bool) -> tuple[Node, str | None]:
    """Derivative of the outer function, evaluated at u."""
    one = num(1)
    sq = lambda a: bin_("^", a, num(2))  # noqa: E731
    table = {
        "sin": lambda: call("cos", u),
        "cos": lambda: neg(call("sin", u)),
        "tan": lambda: sq(call("sec", u)),
        "sec": lambda: bin_("*", call("sec", u), call("tan", u)),
        "csc": lambda: neg(bin_("*", call("csc", u), call("cot", u))),
        "cot": lambda: neg(sq(call("csc", u))),
        "asin": lambda: bin_("/", one, call("sqrt", bin_("-", one, sq(u)))),
        "acos": lambda: neg(bin_("/", one, call("sqrt", bin_("-", one, sq(u))))),
        "atan": lambda: bin_("/", one, bin_("+", one, sq(u))),
        "sinh": lambda: call("cosh", u),
        "cosh": lambda: call("sinh", u),
        "tanh": lambda: bin_("/", one, sq(call("cosh", u))),
        "asinh": lambda: bin_("/", one, call("sqrt", bin_("+", sq(u), one))),
        "acosh": lambda: bin_("/", one, call("sqrt", bin_("-", sq(u), one))),
        "atanh": lambda: bin_("/", one, bin_("-", one, sq(u))),
        "sqrt": lambda: bin_("/", one, bin_("*", num(2), call("sqrt", u))),
        "cbrt": lambda: bin_("/", one, bin_("*", num(3), sq(call("cbrt", u)))),
        "abs": lambda: bin_("/", u, call("abs", u)),
        "exp": lambda: call("exp", u),
        "ln": lambda: bin_("/", one, u),
        "log": lambda: bin_("/", one, bin_("*", u, call("ln", num(10)))) if log_base10 else bin_("/", one, u),
    }
    condition = f"{to_tex(u)} \\neq 0" if fn == "abs" else None
    return table[fn](), condition


@dataclass
class DerivativeResult:
    node: Node
    step: Step


def derivative(f: Node, v: str, step_id: str, title: str, settings: dict[str, Any]) -> DerivativeResult:
    dx = f"\\frac{{d}}{{d{v}}}"
    log_base10 = settings.get("logBase") == "10"

    def has(n: Node) -> bool:
        return contains_var(n, v)

    def is_v(n: Node) -> bool:
        return n["type"] == "var" and n["name"] == v

    def mk(n: Node, d: Node, path: str, rule: str, detail: str | None = None,
           children: list[Step | None] | None = None, condition: str | None = None) -> Step:
        kids = [c for c in (children or []) if c]
        step: Step = {"id": path, "title": rule, "latex": f"{dx}\\left[{to_tex(n)}\\right] = {to_tex(light(d, settings))}"}
        if detail:
            step["detail"] = detail
        if condition:
            step["condition"] = condition
        if kids:
            step["children"] = kids
        return step

    def go(n: Node, path: str) -> tuple[Node, Step | None]:
        if not has(n):
            d = num(0)
            if n["type"] in ("num", "const", "var"):
                return d, None
            return d, mk(n, d, path, "Constant rule", f"Contains no {v}, so its derivative is 0.")

        t = n["type"]
        if t == "var":
            return num(1), None
        if t == "neg":
            a_d, a_s = go(n["arg"], f"{path}.0")
            d = neg(a_d)
            return d, mk(n, d, path, "Constant multiple (−1)", "(−u)′ = −u′", [a_s])
        if t == "call":
            a_d, a_s = go(n["arg"], f"{path}.0")
            o, cond = _outer(n["fn"], n["arg"], log_base10)
            d = o if is_v(n["arg"]) else bin_("*", o, a_d)
            label = FN_LABEL.get(n["fn"], n["fn"])
            return d, mk(
                n, d, path,
                f"Derivative of {label}" if is_v(n["arg"]) else f"Chain rule ({label})",
                None if is_v(n["arg"]) else "Outer derivative at the inside, times the derivative of the inside.",
                [a_s], cond,
            )

        u, w, op = n["left"], n["right"], n["op"]
        if op in ("+", "-"):
            a_d, a_s = go(u, f"{path}.0")
            b_d, b_s = go(w, f"{path}.1")
            d = bin_(op, a_d, b_d)
            return d, mk(n, d, path, "Sum rule" if op == "+" else "Difference rule", "Differentiate each term separately.", [a_s, b_s])
        if op == "*":
            if not has(u):
                b_d, b_s = go(w, f"{path}.1")
                d = bin_("*", u, b_d)
                return d, mk(n, d, path, "Constant multiple rule", "(c·u)′ = c·u′", [b_s])
            if not has(w):
                a_d, a_s = go(u, f"{path}.0")
                d = bin_("*", w, a_d)
                return d, mk(n, d, path, "Constant multiple rule", "(u·c)′ = c·u′", [a_s])
            a_d, a_s = go(u, f"{path}.0")
            b_d, b_s = go(w, f"{path}.1")
            d = bin_("+", bin_("*", a_d, w), bin_("*", u, b_d))
            return d, mk(n, d, path, "Product rule", "(u·v)′ = u′·v + u·v′", [a_s, b_s])
        if op == "/":
            if not has(w):
                a_d, a_s = go(u, f"{path}.0")
                d = bin_("/", a_d, w)
                return d, mk(n, d, path, "Constant divisor", "(u/c)′ = u′/c", [a_s])
            a_d, a_s = go(u, f"{path}.0")
            b_d, b_s = go(w, f"{path}.1")
            d = bin_("/", bin_("-", bin_("*", a_d, w), bin_("*", u, b_d)), bin_("^", w, num(2)))
            return d, mk(n, d, path, "Quotient rule", "(u/v)′ = (u′·v − u·v′) / v²", [a_s, b_s])

        # ^
        if has(u) and not has(w):
            a_d, a_s = go(u, f"{path}.0")
            core = bin_("*", w, bin_("^", u, bin_("-", w, num(1))))
            d = core if is_v(u) else bin_("*", core, a_d)
            return d, mk(
                n, d, path,
                "Power rule" if is_v(u) else "Power rule + chain rule",
                "(xⁿ)′ = n·xⁿ⁻¹" if is_v(u) else "(uⁿ)′ = n·uⁿ⁻¹·u′",
                [a_s],
            )
        if not has(u) and has(w):
            b_d, b_s = go(w, f"{path}.1")
            is_e = u["type"] == "const" and u["name"] == "e"
            core = n if is_e else bin_("*", n, call("ln", u))
            d = core if is_v(w) else bin_("*", core, b_d)
            return d, mk(
                n, d, path,
                "Exponential rule" if is_e else "Exponential rule (aᵘ)",
                "(eᵘ)′ = eᵘ·u′" if is_e else "(aᵘ)′ = aᵘ·ln(a)·u′",
                [b_s],
            )
        a_d, a_s = go(u, f"{path}.0")
        b_d, b_s = go(w, f"{path}.1")
        d = bin_("*", n, bin_("+", bin_("*", b_d, call("ln", u)), bin_("/", bin_("*", w, a_d), u)))
        return d, mk(
            n, d, path, "Logarithmic differentiation", "(fᵍ)′ = fᵍ·(g′·ln f + g·f′/f)",
            [a_s, b_s], f"{to_tex(u)} > 0",
        )

    raw, root = go(f, f"{step_id}.r")
    node = simplest(raw, settings)
    step: Step = {
        "id": step_id,
        "title": title,
        "latex": f"{dx}\\left[{to_tex(f)}\\right] = {to_tex(node)}",
        "form": "simplified",
    }
    if root:
        step["children"] = [root]
    return DerivativeResult(node, step)
