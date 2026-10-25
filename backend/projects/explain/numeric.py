"""Numeric helpers: root finding, limits, exact-form recognition, formatting."""

from __future__ import annotations

import math
import re
from collections.abc import Callable
from dataclasses import dataclass, field

from .evaluate import NAN, Compiled
from .latex import js_str, num_tex, to_exponential, to_precision

isfinite = math.isfinite


def jround(v: float) -> int:
    """JavaScript Math.round (halves round up, not to even)."""
    return math.floor(v + 0.5)


def sgn(v: float) -> float:
    """Math.sign: NaN stays NaN."""
    if math.isnan(v):
        return NAN
    return float((v > 0) - (v < 0))


def mulberry32(seed: int) -> Callable[[], float]:
    """Same deterministic generator as the TypeScript engine."""
    state = seed & 0xFFFFFFFF

    def imul(a: int, b: int) -> int:
        return (a * b) & 0xFFFFFFFF

    def nxt() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = imul(state ^ (state >> 15), 1 | state)
        t = ((t + imul(t ^ (t >> 7), 61 | t)) & 0xFFFFFFFF) ^ t
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296

    return nxt


def snap(x: float) -> float:
    """Snap tiny float noise: 0.9999999999 → 1, 1e-17 → 0."""
    if abs(x) < 1e-10:
        return 0.0
    if not isfinite(x):
        return x
    r = jround(x)
    if abs(x - r) < 1e-9 * max(1.0, abs(x)):
        return float(r)
    return x


def find_roots(g: Compiled, a: float, b: float, n: int = 4000) -> list[float]:
    """
    Zeros of g on [a, b]: sign changes (refined by bisection) plus "touching"
    zeros like x² at 0 (refined by golden-section search on |g|). Sign changes
    across a pole are rejected because |g| blows up there.
    """
    h = (b - a) / n
    xs = [a + i * h for i in range(n + 1)]
    ys = [g(x) for x in xs]
    roots: list[float] = []

    for i in range(n + 1):
        if isfinite(ys[i]) and ys[i] == 0:
            roots.append(xs[i])

    for i in range(n):
        y0, y1 = ys[i], ys[i + 1]
        if not isfinite(y0) or not isfinite(y1) or y0 == 0 or y1 == 0 or (y0 > 0) == (y1 > 0):
            continue
        lo, hi, glo = xs[i], xs[i + 1], y0
        for _ in range(80):
            mid = (lo + hi) / 2
            gm = g(mid)
            if not isfinite(gm):
                break
            if gm == 0:
                lo = hi = mid
                break
            if (gm > 0) == (glo > 0):
                lo, glo = mid, gm
            else:
                hi = mid
        r = (lo + hi) / 2
        gr = g(r)
        if isfinite(gr) and abs(gr) < 1e-6 * (1 + min(abs(y0), abs(y1))):
            roots.append(r)

    phi = (math.sqrt(5) - 1) / 2

    def absg(x: float) -> float:
        return abs(g(x))

    for i in range(1, n):
        y0, y1, y2 = ys[i - 1], ys[i], ys[i + 1]
        if not (isfinite(y0) and isfinite(y1) and isfinite(y2)):
            continue
        if sgn(y0) != sgn(y2) or y1 == 0:
            continue
        if not (abs(y1) <= abs(y0) and abs(y1) <= abs(y2)):
            continue
        lo, hi = xs[i - 1], xs[i + 1]
        for _ in range(100):
            c = hi - phi * (hi - lo)
            d = lo + phi * (hi - lo)
            if absg(c) < absg(d):
                hi = d
            else:
                lo = c
        m = (lo + hi) / 2
        if abs(g(m)) < 1e-9:
            roots.append(m)

    roots.sort()
    out: list[float] = []
    for r in roots:
        s = snap(r)
        if not out or abs(s - out[-1]) > 1e-6 * (1 + abs(s)):
            out.append(s)
    return out


def is_noise_zero(g: Compiled, a: float, b: float) -> bool:
    """True when g is zero everywhere up to float noise — root finding on noise is meaningless."""
    finite = tiny = 0
    for i in range(401):
        y = g(a + (b - a) * i / 400)
        if not isfinite(y):
            continue
        finite += 1
        if abs(y) < 1e-6:
            tiny += 1
    return finite > 0 and tiny / finite > 0.9


def fmt(v: float, sig: int = 6) -> str:
    """Decimal for display."""
    if math.isnan(v):
        return "undefined"
    if not isfinite(v):
        return "∞" if v > 0 else "−∞"
    if abs(v) < 1e-12:
        return "0"
    a = abs(v)
    if a >= 1e7 or a < 1e-5:
        return to_exponential(v, 3)
    return js_str(to_precision(v, sig))


def dec_tex(v: float, sig: int = 6) -> str:
    if abs(v) < 1e-12:
        return "0"
    return num_tex(to_precision(v, sig))


SQUAREFREE = [2, 3, 5, 6, 7, 10, 11, 13, 14, 15, 17, 19, 21, 22, 23, 26, 29, 30]


def recognize(v: float, allow_pi: bool, tol: float = 1e-9) -> str | None:
    """Recognize simple exact forms: integers, p/q, p·π/q, p·√k/q."""
    if not isfinite(v):
        return None

    def close(target: float) -> bool:
        return abs(v - target) <= tol * max(1.0, abs(target))

    def frac(p: int, q: int, sym: str) -> str:
        sign = "-" if p < 0 else ""
        ap = abs(p)
        top = (sym if ap == 1 else f"{ap}{sym}") if sym else f"{ap}"
        return sign + top if q == 1 else f"{sign}\\frac{{{top}}}{{{q}}}"

    r = jround(v)
    if close(r):
        return js_str(float(r))
    for q in range(2, 13):
        p = jround(v * q)
        if abs(p) <= 1000 and math.gcd(abs(p), q) == 1 and close(p / q):
            return frac(p, q, "")
    if allow_pi:
        for q in range(1, 13):
            p = jround(v * q / math.pi)
            if p != 0 and abs(p) <= 48 and math.gcd(abs(p), q) == 1 and close(p * math.pi / q):
                return frac(p, q, "\\pi")
    for k in SQUAREFREE:
        rk = math.sqrt(k)
        for q in range(1, 7):
            p = jround(v * q / rk)
            if p != 0 and abs(p) <= 6 and math.gcd(abs(p), q) == 1 and close(p * rk / q):
                return frac(p, q, f"\\sqrt{{{k}}}")
    return None


_INT_RE = re.compile(r"^-?\d+$")


def num_latex(v: float, allow_pi: bool, tol: float = 1e-9) -> str:
    """LaTeX for a number: exact form when recognized, plus ≈ decimal."""
    if math.isnan(v):
        return "\\text{undefined}"
    if not isfinite(v):
        return "\\infty" if v > 0 else "-\\infty"
    rec = recognize(v, allow_pi, tol)
    dec = dec_tex(v)
    if rec is None:
        return dec
    if _INT_RE.match(rec) or rec == dec:
        return rec
    return f"{rec} \\approx {dec}"


# ---------------------------------------------------------------------------
# Limits
# ---------------------------------------------------------------------------


@dataclass
class LimitValue:
    kind: str  # finite | inf | dne | undefined
    value: float = NAN
    sign: int = 0
    reason: str = ""


@dataclass
class SideLimit:
    value: LimitValue
    table: list[tuple[float, float]] = field(default_factory=list)


def side_limit(f: Compiled, target: float, direction: int) -> SideLimit:
    """
    Approach `target` from one side (direction -1 left, +1 right), or approach
    ±∞ (target = ±inf). A short sequence (k ≤ 7) decides convergence; a longer
    one (k ≤ 12) decides slow divergence like ln(x) → −∞.
    """
    at_inf = not isfinite(target)
    scale = 1.0 if at_inf else max(1.0, abs(target))

    def x_at(k: int) -> float:
        if at_inf:
            return math.copysign(10.0**k, target)
        return target + direction * scale * 10.0 ** (-k)

    short = [(x_at(k), f(x_at(k))) for k in range(1, 8)]
    # Past ~1e-12 relative, float rounding swamps the signal, so stop there.
    long = [f(x_at(k)) for k in range(1, 13)]

    a, b, c = (p[1] for p in short[-3:])
    if not (isfinite(a) and isfinite(b) and isfinite(c)):
        return SideLimit(LimitValue("undefined"), short)

    if abs(c - b) <= 1e-4 * (1 + abs(b)) and abs(c - b) <= abs(b - a) + 1e-9:
        return SideLimit(LimitValue("finite", value=c), short)

    tail = [y for y in long[-7:] if isfinite(y)]
    if len(tail) == 7:
        d = [tail[i + 1] - tail[i] for i in range(6)]
        mono = all(x > 0 for x in d) or all(x < 0 for x in d)
        not_shrinking = abs(d[-1]) >= 0.5 * abs(d[-2])
        last = tail[-1]
        if mono and not_shrinking and abs(last) > 10 and sgn(d[0]) == sgn(last):
            return SideLimit(LimitValue("inf", sign=1 if last > 0 else -1), short)
    return SideLimit(LimitValue("dne", reason="the values keep oscillating instead of settling"), short)


def same_limit(p: LimitValue, q: LimitValue) -> bool:
    if p.kind == "finite" and q.kind == "finite":
        return abs(p.value - q.value) <= 1e-4 * (1 + abs(p.value))
    if p.kind == "inf" and q.kind == "inf":
        return p.sign == q.sign
    return False


def limit_tex(v: LimitValue, allow_pi: bool) -> str:
    if v.kind == "finite":
        return num_latex(v.value, allow_pi, 1e-6)
    if v.kind == "inf":
        return "\\infty" if v.sign > 0 else "-\\infty"
    if v.kind == "dne":
        return "\\text{does not exist}"
    return "\\text{undefined (no values to approach from)}"


def table_tex(table: list[tuple[float, float]], v: str) -> str:
    undef = "\\text{undef}"
    rows = " \\\\ ".join(f"{dec_tex(x, 8)} & {dec_tex(y, 8) if isfinite(y) else undef}" for x, y in table)
    return f"\\begin{{array}}{{r|l}} {v} & f({v}) \\\\ \\hline {rows} \\end{{array}}"


def simpson(f: Compiled, a: float, b: float, n: int = 2000) -> float:
    """Composite Simpson's rule; NaN if f is undefined anywhere on the samples."""
    if n % 2:
        n += 1
    h = (b - a) / n
    s = f(a) + f(b)
    for i in range(1, n):
        s += f(a + i * h) * (4 if i % 2 else 2)
    return s * h / 3
