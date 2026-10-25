"""
Compile an expression tree into a fast float function of the main variable.
Undefined results (division by zero, √ of a negative, …) come back as NaN,
matching lib/evaluate.ts so the backend and the browser plot agree.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from typing import Any

from .nodes import Node

NAN = float("nan")
INF = float("inf")

Compiled = Callable[[float], float]


def pi_value(mode: str) -> float:
    if mode == "3.14":
        return 3.14
    if mode == "3":
        return 3.0
    return math.pi


def _guard(fn: Callable[[float], float]) -> Callable[[float], float]:
    def g(v: float) -> float:
        try:
            return fn(v)
        except (ValueError, OverflowError, ZeroDivisionError):
            return NAN

    return g


def _exp(v: float) -> float:
    try:
        return math.exp(v)
    except OverflowError:
        return INF


def _sinh(v: float) -> float:
    try:
        return math.sinh(v)
    except OverflowError:
        return math.copysign(INF, v)


def _cosh(v: float) -> float:
    try:
        return math.cosh(v)
    except OverflowError:
        return INF


# cos(π/2) is 6e-17 in floating point, not 0 — treat that as a true zero.
def _tan(v: float) -> float:
    return NAN if abs(math.cos(v)) < 1e-15 else math.tan(v)


def _sec(v: float) -> float:
    c = math.cos(v)
    return NAN if abs(c) < 1e-15 else 1 / c


def _csc(v: float) -> float:
    s = math.sin(v)
    return NAN if abs(s) < 1e-15 else 1 / s


def _cot(v: float) -> float:
    s = math.sin(v)
    return NAN if abs(s) < 1e-15 else math.cos(v) / s


def _cbrt(v: float) -> float:
    if hasattr(math, "cbrt"):
        return math.cbrt(v)
    return math.copysign(abs(v) ** (1 / 3), v)


def fn_table(settings: dict[str, Any]) -> dict[str, Callable[[float], float]]:
    raw: dict[str, Callable[[float], float]] = {
        "sin": math.sin, "cos": math.cos, "tan": _tan, "sec": _sec, "csc": _csc, "cot": _cot,
        "asin": math.asin, "acos": math.acos, "atan": math.atan,
        "sinh": _sinh, "cosh": _cosh, "tanh": math.tanh,
        "asinh": math.asinh, "acosh": math.acosh, "atanh": math.atanh,
        "sqrt": math.sqrt, "cbrt": _cbrt, "abs": abs, "exp": _exp, "ln": math.log,
        "log": math.log10 if settings.get("logBase") == "10" else math.log,
    }
    return {k: _guard(f) for k, f in raw.items()}


def real_pow(b: float, e: float) -> float:
    """Real power: allows odd roots of negatives, e.g. (-8)^(1/3) = -2."""
    if math.isnan(b) or math.isnan(e):
        return NAN
    try:
        if b >= 0 or float(e).is_integer():
            return math.pow(b, e)
        if not math.isfinite(e):
            return NAN
        for q in range(3, 16, 2):
            p = e * q
            if abs(p - round(p)) < 1e-9:
                mag = math.pow(-b, e)
                return mag if round(p) % 2 == 0 else -mag
        return NAN
    except OverflowError:
        odd = float(e).is_integer() and int(e) % 2 == 1
        return -INF if b < 0 and odd else INF
    except (ValueError, ZeroDivisionError):
        return NAN


def compile_node(node: Node, settings: dict[str, Any], main_var: str, params: dict[str, float]) -> Compiled:
    fns = fn_table(settings)
    pi = pi_value(settings.get("piMode", "exact"))

    def go(n: Node) -> Compiled:
        t = n["type"]
        if t == "num":
            v = float(n["value"])
            return lambda x: v
        if t == "const":
            c = pi if n["name"] == "pi" else math.e
            return lambda x: c
        if t == "var":
            if n["name"] == main_var:
                return lambda x: x
            p = params.get(n["name"], NAN)
            return lambda x: p
        if t == "neg":
            a = go(n["arg"])
            return lambda x: -a(x)
        if t == "call":
            a = go(n["arg"])
            f = fns[n["fn"]]
            return lambda x: f(a(x))

        lf = go(n["left"])
        rf = go(n["right"])
        op = n["op"]
        if op == "+":
            return lambda x: lf(x) + rf(x)
        if op == "-":
            return lambda x: lf(x) - rf(x)
        if op == "*":
            return lambda x: lf(x) * rf(x)
        if op == "/":
            def div(x: float) -> float:
                d = rf(x)
                return NAN if d == 0 else lf(x) / d

            return div
        return lambda x: real_pow(lf(x), rf(x))

    f = go(node)

    def run(x: float) -> float:
        try:
            y = f(x)
        except (ValueError, OverflowError, ZeroDivisionError):
            return NAN
        return y if math.isfinite(y) else NAN

    return run
