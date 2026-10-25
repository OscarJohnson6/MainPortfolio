"""LaTeX rendering of expression trees, plus JavaScript-style number formatting."""

from __future__ import annotations

import math
import re
from decimal import Decimal

from .nodes import Node

FN_TEX = {
    "sin": "\\sin", "cos": "\\cos", "tan": "\\tan", "sec": "\\sec", "csc": "\\csc", "cot": "\\cot",
    "asin": "\\arcsin", "acos": "\\arccos", "atan": "\\arctan",
    "sinh": "\\sinh", "cosh": "\\cosh", "tanh": "\\tanh",
    "asinh": "\\operatorname{arsinh}", "acosh": "\\operatorname{arcosh}", "atanh": "\\operatorname{artanh}",
    "sqrt": "\\sqrt", "cbrt": "\\sqrt[3]", "abs": "\\operatorname{abs}", "exp": "\\exp", "ln": "\\ln", "log": "\\log",
}


# ---------------------------------------------------------------------------
# JavaScript number formatting. Step ids and labels are built from these
# strings, so they must match what the TypeScript mock produced.
# ---------------------------------------------------------------------------


def js_str(v: float) -> str:
    """`String(v)` from JavaScript (shortest round-trip, JS exponent rules)."""
    if math.isnan(v):
        return "NaN"
    if math.isinf(v):
        return "Infinity" if v > 0 else "-Infinity"
    if v == 0:
        return "0"
    sign = "-" if v < 0 else ""
    d = Decimal(repr(abs(float(v)))).normalize()
    _, digit_tuple, exp = d.as_tuple()
    digits = "".join(map(str, digit_tuple))
    k = len(digits)
    n = exp + k
    if k <= n <= 21:
        return sign + digits + "0" * (n - k)
    if 0 < n <= 21:
        return sign + digits[:n] + "." + digits[n:]
    if -6 < n <= 0:
        return sign + "0." + "0" * (-n) + digits
    e = n - 1
    mant = digits if k == 1 else digits[0] + "." + digits[1:]
    return f"{sign}{mant}e{'+' if e >= 0 else '-'}{abs(e)}"


def to_precision(v: float, sig: int) -> float:
    """`parseFloat(v.toPrecision(sig))`."""
    return float(format(v, f".{sig}g"))


def to_exponential(v: float, digits: int) -> str:
    """`v.toExponential(digits)`."""
    mant, exp = format(v, f".{digits}e").split("e")
    e = int(exp)
    return f"{mant}e{'+' if e >= 0 else '-'}{abs(e)}"


def is_integer(v: float) -> bool:
    return math.isfinite(v) and float(v).is_integer()


def num_tex(v: float) -> str:
    if is_integer(v):
        return js_str(v)
    s = js_str(to_precision(v, 10))
    if "e" in s:
        m, e = s.split("e")
        return f"{m} \\times 10^{{{int(e)}}}"
    return s


# ---------------------------------------------------------------------------
# Tree → LaTeX
# ---------------------------------------------------------------------------


def _wrap(s: str) -> str:
    return f"\\left({s}\\right)"


def _prec(n: Node) -> int:
    t = n["type"]
    if t == "num":
        return 15 if n["value"] < 0 else 100
    if t in ("var", "const", "call"):
        return 100
    if t == "neg":
        return 15
    op = n["op"]
    if op in ("+", "-"):
        return 10
    if op == "^":
        return 30
    if op == "/":
        return 90  # \frac is visually self-contained
    return 20


def _tex(n: Node, ctx: int) -> str:
    s = _raw(n)
    return _wrap(s) if _prec(n) < ctx else s


def _raw(n: Node) -> str:
    t = n["type"]
    if t == "num":
        return num_tex(n["value"])
    if t == "var":
        return n["name"]
    if t == "const":
        return "\\pi" if n["name"] == "pi" else "e"
    if t == "neg":
        return f"-{_tex(n['arg'], 20)}"
    if t == "call":
        a = _tex(n["arg"], 0)
        fn = n["fn"]
        if fn == "sqrt":
            return f"\\sqrt{{{a}}}"
        if fn == "cbrt":
            return f"\\sqrt[3]{{{a}}}"
        if fn == "abs":
            return f"\\left|{a}\\right|"
        if fn == "exp":
            return f"e^{{{a}}}"
        return f"{FN_TEX[fn]}{_wrap(a)}"

    left, right, op = n["left"], n["right"], n["op"]
    if op == "+":
        if right["type"] == "neg":
            return f"{_tex(left, 10)} - {_tex(right['arg'], 11)}"
        if right["type"] == "num" and right["value"] < 0:
            return f"{_tex(left, 10)} - {num_tex(-right['value'])}"
        return f"{_tex(left, 10)} + {_tex(right, 10)}"
    if op == "-":
        return f"{_tex(left, 10)} - {_tex(right, 11)}"
    if op == "*":
        l_s = _tex(left, 20)
        r_s = _tex(right, 20)
        dot = bool(re.match(r"^[\d.\-]", r_s)) or (r_s.startswith("\\frac") and l_s.endswith("}"))
        return f"{l_s} \\cdot {r_s}" if dot else f"{l_s} {r_s}"
    if op == "/":
        return f"\\frac{{{_tex(left, 0)}}}{{{_tex(right, 0)}}}"
    # ^
    b = left
    atomic = (b["type"] == "num" and b["value"] >= 0) or b["type"] in ("var", "const")
    base = _raw(b) if atomic else _wrap(_raw(b))
    return f"{base}^{{{_tex(right, 0)}}}"


def to_tex(n: Node) -> str:
    return _tex(n, 0)
