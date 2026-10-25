"""
Analysis engine. Produces the AnalyzeResponse shape from lib/types.ts.

Principle: the ORIGINAL function is gospel. The simplified form is a tool —
its results are only trusted where the original is defined, and every
derived answer is spot-checked numerically against the original.
"""

from __future__ import annotations

import math
import re
from dataclasses import dataclass, replace
from typing import Any

from .derive import derivative
from .evaluate import NAN, Compiled, compile_node, real_pow
from .latex import to_tex
from .nodes import Node, call, contains_var, rat_of, size
from .numeric import (
    LimitValue, dec_tex, find_roots, fmt, is_noise_zero, limit_tex, mulberry32,
    num_latex, recognize, same_limit, sgn, side_limit, simpson, snap, table_tex,
)
from .parser import Token, parse_input
from .symbolic import simplest

INF = float("inf")
MAX_POINTS = 24
isfinite = math.isfinite

Step = dict[str, Any]
Item = dict[str, Any]


def id_num(v: float) -> str:
    return fmt(v).replace(".", "_").replace("−", "m").replace("-", "m").replace("+", "")


@dataclass
class Iv:
    lo: float
    hi: float
    lo_closed: bool
    hi_closed: bool


# ---------------------------------------------------------------------------
# Domain helpers
# ---------------------------------------------------------------------------


def constraints(n: Node, v: str, out: list[str]) -> None:
    def add(c: str) -> None:
        if c not in out:
            out.append(c)

    t = n["type"]
    if t == "neg":
        constraints(n["arg"], v, out)
    elif t == "bin":
        left, right, op = n["left"], n["right"], n["op"]
        if op == "/" and contains_var(right, v):
            add(f"{to_tex(right)} \\neq 0")
        if op == "^" and contains_var(left, v):
            r = rat_of(right)
            if r is None and right["type"] == "num":
                ev = float(right["value"])
                has_r = True
            else:
                ev = float(r) if r is not None else NAN
                has_r = r is not None
            if has_r and math.isnan(real_pow(-2, ev)):
                rel = ">" if ev < 0 else "\\ge"
                add(f"{to_tex(left)} {rel} 0")
            elif contains_var(right, v):
                add(f"{to_tex(left)} > 0")
            elif has_r and ev < 0:
                add(f"{to_tex(left)} \\neq 0")
        constraints(left, v, out)
        constraints(right, v, out)
    elif t == "call":
        a = to_tex(n["arg"])
        if contains_var(n["arg"], v):
            fn = n["fn"]
            if fn == "sqrt":
                add(f"{a} \\ge 0")
            elif fn in ("ln", "log"):
                add(f"{a} > 0")
            elif fn in ("asin", "acos"):
                add(f"-1 \\le {a} \\le 1")
            elif fn in ("tan", "sec"):
                add(f"\\cos\\left({a}\\right) \\neq 0")
            elif fn in ("cot", "csc"):
                add(f"\\sin\\left({a}\\right) \\neq 0")
            elif fn == "acosh":
                add(f"{a} \\ge 1")
            elif fn == "atanh":
                add(f"-1 < {a} < 1")
        constraints(n["arg"], v, out)


def denominators(n: Node, v: str, out: list[Node]) -> None:
    """Expressions whose zeros make f undefined (denominators and their friends)."""
    t = n["type"]
    if t == "neg":
        denominators(n["arg"], v, out)
    elif t == "bin":
        left, right, op = n["left"], n["right"], n["op"]
        if op == "/" and contains_var(right, v):
            out.append(right)
        if op == "^" and contains_var(left, v):
            r = rat_of(right)
            if r is not None and r < 0:
                out.append(left)
        denominators(left, v, out)
        denominators(right, v, out)
    elif t == "call":
        if contains_var(n["arg"], v):
            if n["fn"] in ("tan", "sec"):
                out.append(call("cos", n["arg"]))
            if n["fn"] in ("cot", "csc"):
                out.append(call("sin", n["arg"]))
        denominators(n["arg"], v, out)


def domain_intervals(f: Compiled, lo_x: float, hi_x: float, excluded: list[float]) -> list[Iv]:
    n = 4000
    h = (hi_x - lo_x) / n

    def defined(x: float) -> bool:
        return isfinite(f(x))

    def boundary(bad: float, good: float) -> float:
        a, b = bad, good
        for _ in range(70):
            m = (a + b) / 2
            if defined(m):
                b = m
            else:
                a = m
        return snap(b)

    runs: list[Iv] = []
    start: float | None = None
    for i in range(n + 1):
        x = lo_x + i * h
        d = defined(x)
        if d and start is None:
            start = -INF if i == 0 else boundary(x - h, x)
        if start is not None and (not d or i == n):
            hi = INF if d and i == n else boundary(x, x - h)
            runs.append(Iv(start, hi, isfinite(start) and defined(start), isfinite(hi) and defined(hi)))
            start = None
    for e in excluded:
        k = next((idx for idx, r in enumerate(runs) if r.lo < e < r.hi), -1)
        if k < 0:
            continue
        r = runs[k]
        runs[k:k + 1] = [replace(r, hi=e, hi_closed=False), replace(r, lo=e, lo_closed=False)]
    return [r for r in runs if r.lo < r.hi or (r.lo_closed and r.hi_closed)]


# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------


@dataclass
class CheckResult:
    verification: str
    passed: int
    total: int
    worst: tuple[float, float, float] | None = None  # x, symbolic, numeric


def deriv_check(base: Compiled, deriv: Compiled, excluded: list[float], lo_x: float, hi_x: float, seed: int) -> CheckResult:
    """Compare a symbolic derivative with the numeric slope of `base`."""
    rng = mulberry32(seed)
    passed = total = 0
    worst = None
    worst_err = 0.0
    tries = 0
    while tries < 400 and total < 20:
        tries += 1
        x = lo_x + rng() * (hi_x - lo_x)
        if any(abs(x - e) < 1e-2 for e in excluded):
            continue
        h = 1e-5 * (1 + abs(x))
        a, b, d = base(x + h), base(x - h), deriv(x)
        if not (isfinite(a) and isfinite(b) and isfinite(d)):
            continue
        numeric = (a - b) / (2 * h)
        total += 1
        err = abs(d - numeric) / (1 + abs(d))
        if err <= 1e-3:
            passed += 1
        elif err > worst_err:
            worst_err = err
            worst = (x, d, numeric)
    verification = "unchecked" if total < 5 else "verified" if passed == total else "mismatch"
    return CheckResult(verification, passed, total, worst)


def check_detail(label: str, c: CheckResult, v: str) -> str:
    if c.verification == "unchecked":
        return f"Not enough points in the domain to check {label}."
    s = f"Compared {label} with the numeric slope of the original at {c.total} random points: {c.passed}/{c.total} agree."
    if c.worst:
        x, sym, numeric = c.worst
        s += f"\nWorst disagreement at {v} = {fmt(x)}: symbolic {fmt(sym)} vs numeric {fmt(numeric)}. Treat this result with care."
    return s


def line(m: float, b: float, v: str) -> str:
    mt = "" if abs(m) < 1e-12 else f"{'' if m == 1 else '-' if m == -1 else dec_tex(m)}{v}"
    if abs(b) < 1e-12:
        return mt or "0"
    if not mt:
        return dec_tex(b)
    return f"{mt} - {dec_tex(-b)}" if b < 0 else f"{mt} + {dec_tex(b)}"


def read_detail(tokens: list[Token], implicit_at: list[int]) -> str:
    def shown(t: Token) -> str:
        if t.type == "func":
            return t.fn or t.text
        if t.type == "const":
            return "π" if t.name == "pi" else "e"
        return t.text

    fns = list(dict.fromkeys(t.fn for t in tokens if t.type == "func"))
    consts = list(dict.fromkeys("π" if t.name == "pi" else "e" for t in tokens if t.type == "const"))
    lines = ["Tokens: " + " ".join(f"[{shown(t)}]" for t in tokens)]
    if implicit_at:
        k = len(implicit_at)
        lines.append(f"Inserted {k} implicit multiplication{'s' if k > 1 else ''} (like 2x → 2·x).")
    if fns:
        lines.append(f"Functions recognized: {', '.join(fns)}.")
    if consts:
        lines.append(f"Constants recognized: {', '.join(consts)}.")
    lines.append("This reading is treated as the original function — every later result is checked against it.")
    return "\n".join(lines)


def _prune(obj: Any) -> Any:
    """Drop None values so the JSON matches the optional fields in types.ts."""
    if isinstance(obj, dict):
        return {k: _prune(v) for k, v in obj.items() if v is not None}
    if isinstance(obj, list):
        return [_prune(v) for v in obj]
    return obj


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def analyze(req: dict[str, Any]) -> dict[str, Any]:
    return _prune(_analyze(req))


def _analyze(req: dict[str, Any]) -> dict[str, Any]:
    settings = req["settings"]
    allow_pi = settings.get("piMode") == "exact"
    parsed = parse_input(req["expression"], settings)
    if not parsed.ok:
        return {"ok": False, "engine": "python", "input": req["expression"], "diagnostics": parsed.diagnostics,
                "steps": [], "sections": [], "notices": []}

    ast, v, params = parsed.ast, parsed.main_var, parsed.params or []
    lo_x, hi_x = float(req["scan"]["min"]), float(req["scan"]["max"])
    steps: list[Step] = []
    sections: list[dict[str, Any]] = []
    notices: list[str] = []
    fx = f"f({v})"

    def N(x: float) -> str:
        return num_latex(x, allow_pi)

    def X(x: float) -> str:
        if isfinite(x):
            return recognize(x, allow_pi) or dec_tex(x)
        return "\\infty" if x > 0 else "-\\infty"

    def pair(x: float, y: float) -> str:
        return f"\\left({X(x)},\\ {X(y)}\\right)"

    def approx_note(x: float, y: float) -> str | None:
        def non_int(s: str | None) -> bool:
            return s is not None and not re.match(r"^-?\d+$", s)

        return f"≈ ({fmt(x)}, {fmt(y)})" if non_int(recognize(x, allow_pi)) or non_int(recognize(y, allow_pi)) else None

    def iv_tex(items: list[Iv]) -> str:
        if not items:
            return "\\varnothing"

        def one(r: Iv) -> str:
            return f"{'[' if r.lo_closed else '('}{X(r.lo)}, {X(r.hi)}{']' if r.hi_closed else ')'}"

        if len(items) > 8:
            return " \\cup ".join(one(r) for r in items[:4]) + " \\cup \\cdots"
        return " \\cup ".join(one(r) for r in items)

    # ---- Parameters ---------------------------------------------------------
    param_values: dict[str, float] = {}
    symbolic: list[str] = []
    for p in params:
        val = req.get("params", {}).get(p)
        if val is None or not isfinite(float(val)):
            param_values[p] = 1.0
            symbolic.append(p)
        else:
            param_values[p] = float(val)

    def comp(n: Node) -> Compiled:
        return compile_node(n, settings, v, param_values)

    f = comp(ast)
    f_tex = to_tex(ast)
    excluded: list[float] = []

    def in_domain(x: float) -> bool:
        return isfinite(f(x)) and x not in excluded

    # ---- 1. Read ------------------------------------------------------------
    steps.append({"id": "read", "title": "Read the input", "latex": f"{fx} = {f_tex}", "form": "original",
                  "detail": read_detail(parsed.tokens or [], parsed.implicit_at or [])})
    steps.append({
        "id": "vars",
        "title": "Variables",
        "detail": "\n".join([
            f"{v} is the independent variable (the graph's horizontal axis).",
            *(
                f"{p} is left symbolic in the formulas. Numbers and the graph use {p} = 1."
                if p in symbolic else f"{p} = {fmt(param_values[p])} (set by you)."
                for p in params
            ),
        ]),
    })
    if symbolic:
        notices.append(f"{', '.join(symbolic)} left symbolic — numbers and the graph use {', '.join(f'{p} = 1' for p in symbolic)} for now.")

    # ---- 2. Domain (from the original) ---------------------------------------
    cons: list[str] = []
    constraints(ast, v, cons)
    dens: list[Node] = []
    denominators(ast, v, dens)
    found: list[float] = []
    for d in dens:
        g = comp(d)
        # A zero of a denominator is excluded even if float noise makes f look finite there.
        found += [r for r in find_roots(g, lo_x, hi_x) if not in_domain(r) or abs(g(r)) < 1e-12]
    excluded[:] = sorted(set(snap(x) for x in found))[:60]
    domain = domain_intervals(f, lo_x, hi_x, excluded)
    whole_line = len(domain) == 1 and domain[0].lo == -INF and domain[0].hi == INF
    domain_tex = "(-\\infty, \\infty)" if whole_line else iv_tex(domain)

    steps.append({
        "id": "domain",
        "title": "Find the domain (from the original)",
        "form": "original",
        "latex": f"\\operatorname{{Dom}}(f) = {domain_tex}",
        "detail": "Each restriction below comes from a piece of the original input. The domain is never taken from a simplified form."
        if cons else "Nothing in the input restricts the domain.",
        "children": [
            *({"id": f"domain.c{i}", "title": "Restriction", "latex": c} for i, c in enumerate(cons)),
            {"id": "domain.scan", "title": "Numeric scan",
             "detail": f"Sampled {v} on [{fmt(lo_x)}, {fmt(hi_x)}] to locate the allowed intervals. Intervals that reach the edge of the scan are assumed to continue."},
        ],
    })

    # ---- 3. Simplify + self-check (SymPy) -------------------------------------
    candidate = simplest(ast, settings)
    changed = size(candidate) < size(ast) and to_tex(candidate) != f_tex
    g_node = candidate if changed else ast
    g_tex = to_tex(g_node)
    simplify_step: Step = {
        "id": "simplify",
        "title": "Simplify" if changed else "Simplify (nothing to do)",
        "form": "simplified",
        "latex": f"{fx} = {g_tex}" if changed else None,
        "detail": "Simplified with SymPy. Derivatives are taken from the simplified form, but every result is filtered against the original domain."
        if changed else "Already as simple as SymPy can make it.",
    }
    simp_verification = "unchecked"
    conds: list[str] = []
    if changed:
        gc = comp(g_node)
        rng = mulberry32(7)
        mismatch: tuple[float, float, float] | None = None
        wider: float | None = None
        agree = 0
        for _ in range(60):
            x = snap(lo_x + rng() * (hi_x - lo_x))
            a, b = f(x), gc(x)
            if isfinite(a) and isfinite(b):
                if abs(a - b) <= 1e-7 * (1 + abs(a)):
                    agree += 1
                elif mismatch is None:
                    mismatch = (x, a, b)
            elif not isfinite(a) and isfinite(b) and wider is None:
                wider = x
        # Also probe the excluded points directly — that's where cancellations bite.
        for e in excluded:
            if isfinite(gc(e)):
                conds.append(f"{v} \\neq {X(e)}")
                if wider is None:
                    wider = e
        if wider is None and domain and isfinite(domain[0].lo):
            probe = domain[0].lo - 1
            if isfinite(gc(probe)) and not in_domain(probe):
                wider = probe
        if wider is not None and not conds:
            conds = list(cons)

        simp_verification = "mismatch" if mismatch else "domain-change" if wider is not None else "verified"
        if mismatch:
            check = (f"At {v} = {fmt(mismatch[0])} the original gives {fmt(mismatch[1])} but the simplified form gives "
                     f"{fmt(mismatch[2])}. These should match, so something in the simplifier is wrong — results may be unreliable.")
        elif wider is not None:
            check = (f"The simplified form is defined at {v} = {fmt(wider)}, but the original is not. The simplification "
                     "widened the domain, so the original's domain is kept and any answer outside it is thrown out."
                     + (" The rewrite conditions above show exactly where." if conds else ""))
        else:
            check = f"Original and simplified forms agree at {agree} random points."
        simplify_step["children"] = [
            {"id": "simplify.0", "title": "Rewrite: SymPy simplify", "latex": f"{f_tex} \\;\\longrightarrow\\; {g_tex}",
             "condition": ",\\ ".join(conds) if conds else None},
            {"id": "simplify.check", "title": "Self-check against the original", "verification": simp_verification, "detail": check},
        ]
    steps.append(simplify_step)

    # ---- 4. Derivatives -------------------------------------------------------
    d1r = derivative(g_node, v, "deriv1", f"First derivative f′({v})", settings)
    d2r = derivative(d1r.node, v, "deriv2", f"Second derivative f″({v})", settings)
    f1raw = comp(d1r.node)
    f2raw = comp(d2r.node)

    def f1(x: float) -> float:
        return f1raw(x) if in_domain(x) else NAN

    def f2(x: float) -> float:
        return f2raw(x) if in_domain(x) else NAN

    c1 = deriv_check(f, f1, excluded, lo_x, hi_x, 11)
    c2 = deriv_check(f1, f2, excluded, lo_x, hi_x, 13)
    d1r.step.setdefault("children", []).append(
        {"id": "deriv1.check", "title": "Self-check against the original", "verification": c1.verification, "detail": check_detail("f′", c1, v)})
    d2r.step.setdefault("children", []).append(
        {"id": "deriv2.check", "title": "Self-check", "verification": c2.verification, "detail": check_detail("f″", c2, v).replace("the original", "f′")})
    steps += [d1r.step, d2r.step]

    f1_varies = contains_var(d1r.node, v) and not is_noise_zero(f1, lo_x, hi_x)
    f2_varies = contains_var(d2r.node, v) and not is_noise_zero(f2, lo_x, hi_x)

    def clean(g: Compiled) -> Compiled:
        # Below this size f′/f″ values are float noise, not a sign.
        def run(x: float) -> float:
            y = g(x)
            return 0.0 if abs(y) < 1e-9 else y

        return run

    # ---- 5. Critical points -----------------------------------------------------
    # Critical points are where f′ = 0 OR where f′ is undefined but f is defined (cusps, corners).
    zero_roots = [x for x in find_roots(f1, lo_x, hi_x) if in_domain(x)] if f1_varies else []
    d1_dens: list[Node] = []
    denominators(d1r.node, v, d1_dens)
    cusps = [
        x for x in (snap(r) for d in d1_dens for r in find_roots(comp(d), lo_x, hi_x))
        if in_domain(x) and not isfinite(f1raw(x)) and x not in excluded
    ]
    f1_roots = sorted(set(zero_roots + cusps))

    def classify(x: float) -> tuple[str, str]:
        if x in cusps:
            a, b = f1(x - 1e-4), f1(x + 1e-4)
            kind = "min" if a < 0 < b else "max" if a > 0 > b else "stationary"
            tail = ", so no extremum" if kind == "stationary" else f", so it's a local {'minimum' if kind == 'min' else 'maximum'}"
            return kind, (f"f′ is undefined here (a cusp or corner) but f is defined. f′ goes "
                          f"{'−' if a < 0 else '+'} to {'−' if b < 0 else '+'}{tail}.")
        s2 = f2(x)
        if isfinite(s2) and s2 > 1e-7:
            return "min", f"f″ = {fmt(s2)} > 0, so the graph curves up: local minimum."
        if isfinite(s2) and s2 < -1e-7:
            return "max", f"f″ = {fmt(s2)} < 0, so the graph curves down: local maximum."
        a, b = f1(x - 1e-3), f1(x + 1e-3)
        if a < 0 < b:
            return "min", "f″ = 0, so used the first-derivative test: f′ goes − to +, local minimum."
        if a > 0 > b:
            return "max", "f″ = 0, so used the first-derivative test: f′ goes + to −, local maximum."
        return "stationary", "f′ doesn't change sign here, so it's a flat spot but not a max or min."

    crit = []
    for x in f1_roots[:MAX_POINTS]:
        kind, reason = classify(x)
        crit.append({"x": x, "y": f(x), "kind": kind, "reason": reason})
    kind_label = {"max": "Local maximum", "min": "Local minimum", "stationary": "Stationary point"}

    def slope_verified(x: float) -> str:
        if x in cusps:
            return "unchecked"
        h = 1e-6 * (1 + abs(x))
        s = (f(x + h) - f(x - h)) / (2 * h)
        if not isfinite(s):
            return "unchecked"
        return "verified" if abs(s) < 1e-3 * (1 + abs(f(x))) else "mismatch"

    if not f1_varies:
        crit_detail = "f′ is constant, so there are no isolated critical points."
    elif crit:
        crit_detail = (f"Searched [{fmt(lo_x)}, {fmt(hi_x)}] for places where f′ crosses or touches 0, then kept only points in the original domain."
                       + (f" Showing the first {MAX_POINTS} of {len(f1_roots)}." if len(f1_roots) > MAX_POINTS else ""))
    else:
        crit_detail = f"f′ is never 0 on [{fmt(lo_x)}, {fmt(hi_x)}] inside the domain."
    steps.append({
        "id": "critical",
        "title": f"Critical points: f′({v}) = 0 or undefined",
        "form": "simplified",
        "detail": crit_detail,
        "children": [
            {"id": f"critical.{id_num(c['x'])}", "title": kind_label[c["kind"]],
             "latex": f"{v} = {N(c['x'])},\\quad f({v}) = {N(c['y'])}", "detail": c["reason"]}
            for c in crit
        ],
    })

    # ---- 6. Inflection points -------------------------------------------------------
    f2_all = find_roots(f2, lo_x, hi_x) if f2_varies else []
    infl = [
        {"x": x, "y": f(x)}
        for x in [x for x in f2_all if in_domain(x) and f2(x - 1e-4) * f2(x + 1e-4) < 0][:MAX_POINTS]
    ]
    steps.append({
        "id": "inflection",
        "title": f"Inflection points: f″({v}) = 0 with a sign change",
        "form": "simplified",
        "detail": "Concavity flips at each of these." if infl else "Concavity never flips on the scanned range.",
        "children": [
            {"id": f"inflection.{id_num(p['x'])}", "title": "Inflection point", "latex": f"{v} = {N(p['x'])},\\quad f({v}) = {N(p['y'])}"}
            for p in infl
        ],
    })

    # ---- 7. Holes & vertical asymptotes (original function) -----------------------
    disc_items: list[Item] = []
    disc_steps: list[Step] = []

    def side_word(lv: LimitValue) -> str:
        if lv.kind == "inf":
            return "+∞" if lv.sign > 0 else "−∞"
        if lv.kind == "finite":
            return fmt(lv.value)
        return "oscillates" if lv.kind == "dne" else "undefined"

    for e in excluded:
        L = side_limit(f, e, -1)
        R = side_limit(f, e, 1)
        sid = f"disc.{id_num(e)}"
        kids = [
            {"id": f"{sid}.left", "title": "Approach from the left", "latex": table_tex(L.table, v)},
            {"id": f"{sid}.right", "title": "Approach from the right", "latex": table_tex(R.table, v)},
        ]
        sides = f"left → {side_word(L.value)}, right → {side_word(R.value)}"
        if L.value.kind == "finite" and R.value.kind == "finite" and same_limit(L.value, R.value):
            y = (L.value.value + R.value.value) / 2
            disc_items.append({"id": f"hole-{id_num(e)}", "label": "Hole (removable)", "latex": pair(e, y), "note": approx_note(e, y),
                               "stepId": sid, "marker": {"x": e, "y": y, "kind": "hole"}})
            disc_steps.append({"id": sid, "title": f"Hole at {v} = {fmt(e)}",
                               "latex": f"f({X(e)}) \\text{{ is undefined, but both sides approach }} {N(y)}", "children": kids})
        elif L.value.kind == "inf" or R.value.kind == "inf":
            disc_items.append({"id": f"va-{id_num(e)}", "label": "Vertical asymptote", "latex": f"{v} = {X(e)}", "note": sides,
                               "stepId": sid, "line": {"kind": "vertical", "x": e}})
            disc_steps.append({"id": sid, "title": f"Vertical asymptote at {v} = {fmt(e)}",
                               "detail": f"Left side → {side_word(L.value)}, right side → {side_word(R.value)}.", "children": kids})
        else:
            disc_items.append({"id": f"disc-{id_num(e)}", "label": "Discontinuity", "latex": f"{v} = {X(e)}", "note": sides, "stepId": sid})
            disc_steps.append({"id": sid, "title": f"Discontinuity at {v} = {fmt(e)}",
                               "detail": "The two sides don't agree and neither blows up.", "children": kids})

    # One-sided asymptotes at domain boundaries, e.g. ln(x) at 0.
    for iv in domain:
        for b, direction in ((iv.lo, 1), (iv.hi, -1)):
            if not isfinite(b) or any(abs(e - b) < 1e-9 for e in excluded) or in_domain(b):
                continue
            if any(d.get("line", {}).get("kind") == "vertical" and abs(d["line"]["x"] - b) < 1e-9 for d in disc_items):
                continue
            S = side_limit(f, b, direction)
            if S.value.kind != "inf":
                continue
            sid = f"disc.{id_num(b)}"
            side = "right" if direction > 0 else "left"
            disc_items.append({"id": f"va-{id_num(b)}", "label": "Vertical asymptote (one-sided)", "latex": f"{v} = {X(b)}",
                               "note": f"from the {side} → {side_word(S.value)}", "stepId": sid, "line": {"kind": "vertical", "x": b}})
            disc_steps.append({"id": sid, "title": f"Vertical asymptote at the domain edge {v} = {fmt(b)}",
                               "children": [{"id": f"{sid}.side", "title": f"Approach from the {side}", "latex": table_tex(S.table, v)}]})
    steps.append({
        "id": "disc",
        "title": "Holes and vertical asymptotes",
        "form": "original",
        "detail": "Checked every point the original excludes, approaching from both sides with the original function."
        if disc_steps else "No excluded points or blow-ups on the scanned range.",
        "children": disc_steps,
    })

    # ---- 8. End behavior --------------------------------------------------------
    end_items: list[Item] = []
    ends = [(s, side_limit(f, s * INF, 1)) for s in (1, -1)]
    (_, pos), (_, neg_e) = ends
    if pos.value.kind == "finite" and neg_e.value.kind == "finite" and same_limit(pos.value, neg_e.value):
        end_items.append({"id": "ha-both", "label": "Horizontal asymptote (both ends)", "latex": f"y = {limit_tex(pos.value, allow_pi)}",
                          "stepId": "end", "line": {"kind": "horizontal", "y": snap(pos.value.value)}})
    else:
        for s, lim in ends:
            dir_tex = "\\infty" if s > 0 else "-\\infty"
            tag = "pos" if s > 0 else "neg"
            arrow = "∞" if s > 0 else "−∞"
            if lim.value.kind == "finite":
                end_items.append({"id": f"ha-{tag}", "label": f"Horizontal asymptote ({v} → {arrow})",
                                  "latex": f"y = {limit_tex(lim.value, allow_pi)}", "stepId": f"end.{tag}",
                                  "line": {"kind": "horizontal", "y": snap(lim.value.value)}})
            elif lim.value.kind == "inf":
                m = side_limit(lambda x: f(x) / x, s * INF, 1).value
                slant = False
                if m.kind == "finite" and abs(m.value) > 1e-6:
                    mv = snap(m.value)
                    b = side_limit(lambda x, mv=mv: f(x) - mv * x, s * INF, 1).value
                    if b.kind == "finite":
                        slant = True
                        # f(x) − m·x is measured at |x| ≈ 1e7, so anything this small is float noise.
                        bv = 0.0 if abs(b.value) < 1e-6 else snap(b.value)
                        end_items.append({"id": f"slant-{tag}", "label": f"Slant asymptote ({v} → {arrow})",
                                          "latex": f"y = {line(mv, bv, v)}", "stepId": f"end.{tag}",
                                          "line": {"kind": "slant", "m": mv, "b": bv}})
                if not slant:
                    end_items.append({"id": f"end-{tag}", "label": "End behavior",
                                      "latex": f"\\lim_{{{v} \\to {dir_tex}}} f({v}) = {limit_tex(lim.value, allow_pi)}", "stepId": f"end.{tag}"})
            else:
                text = "oscillates, no limit" if lim.value.kind == "dne" else "no limit (values overflow or are undefined)"
                end_items.append({"id": f"end-{tag}", "label": "End behavior", "latex": f"{v} \\to {dir_tex}: \\text{{{text}}}", "stepId": f"end.{tag}"})
    steps.append({
        "id": "end",
        "title": "End behavior and horizontal / slant asymptotes",
        "form": "original",
        "detail": "Evaluated the original at larger and larger |x|. If f(x) blows up, checked whether f(x)/x settles (a slant asymptote).",
        "children": [
            {"id": f"end.{'pos' if s > 0 else 'neg'}", "title": f"As {v} → {'∞' if s > 0 else '−∞'}", "latex": table_tex(lim.table, v)}
            for s, lim in ends
        ],
    })

    # ---- 9. Intercepts ----------------------------------------------------------
    intercept_items: list[Item] = []
    y0 = f(0)
    if isfinite(y0):
        intercept_items.append({"id": "y-int", "label": "y-intercept", "latex": pair(0, y0), "note": approx_note(0, y0),
                                "stepId": "intercepts", "marker": {"x": 0, "y": y0, "kind": "y-intercept"}})
    x_ints = find_roots(f, lo_x, hi_x)[:MAX_POINTS] if contains_var(ast, v) else []
    for x in x_ints:
        intercept_items.append({"id": f"x-int-{id_num(x)}", "label": "x-intercept", "latex": pair(x, 0), "note": approx_note(x, 0),
                                "stepId": "intercepts", "marker": {"x": x, "y": 0, "kind": "x-intercept"}})
    steps.append({
        "id": "intercepts",
        "title": "Intercepts",
        "form": "original",
        "detail": "\n".join([
            f"y-intercept: f(0) = {fmt(y0)}." if isfinite(y0) else "0 is not in the domain, so there is no y-intercept.",
            f"Solved f({v}) = 0 numerically: {', '.join(fmt(x) for x in x_ints)}." if x_ints
            else f"f({v}) = 0 has no solutions on [{fmt(lo_x)}, {fmt(hi_x)}].",
        ]),
    })

    # ---- 10. Increasing / decreasing / concavity ---------------------------------
    def sign_intervals(test: Compiled, breaks: list[float]) -> tuple[list[Iv], list[Iv]]:
        pos_out: list[Iv] = []
        neg_out: list[Iv] = []
        for iv in domain:
            lo = iv.lo if isfinite(iv.lo) else lo_x
            hi = iv.hi if isfinite(iv.hi) else hi_x
            pts = [lo, *(b for b in breaks if lo < b < hi), hi]
            prev: tuple[float, Iv] | None = None
            for k in range(len(pts) - 1):
                # Test the middle first; if that one point is undefined, try the thirds.
                span = pts[k + 1] - pts[k]
                s = NAN
                for t in (0.5, 1 / 3, 2 / 3, 0.1, 0.9):
                    s = sgn(test(pts[k] + span * t))
                    if isfinite(s):
                        break
                seg = Iv(iv.lo if k == 0 else pts[k], iv.hi if k == len(pts) - 2 else pts[k + 1], False, False)
                if prev and prev[0] == s:
                    prev[1].hi = seg.hi
                    continue
                if s > 0:
                    pos_out.append(seg)
                elif s < 0:
                    neg_out.append(seg)
                prev = (s, seg)
        return pos_out, neg_out

    inc_pos, inc_neg = sign_intervals(clean(f1 if f1_varies else (lambda x: f1raw(0))), f1_roots)
    f2_roots = [x for x in f2_all if in_domain(x)]
    conc_pos, conc_neg = sign_intervals(clean(f2 if f2_varies else (lambda x: f2raw(0))), sorted(f2_roots + cusps))
    behavior_items = [
        {"id": "inc", "label": "Increasing on", "latex": iv_tex(inc_pos), "stepId": "behavior"},
        {"id": "dec", "label": "Decreasing on", "latex": iv_tex(inc_neg), "stepId": "behavior"},
        {"id": "cup", "label": "Concave up on", "latex": iv_tex(conc_pos), "stepId": "behavior"},
        {"id": "cdown", "label": "Concave down on", "latex": iv_tex(conc_neg), "stepId": "behavior"},
    ]
    steps.append({
        "id": "behavior",
        "title": "Where f rises, falls, and bends",
        "form": "simplified",
        "detail": "Split the domain at the critical points (for f′) and at f″ = 0 (for f″), then checked the sign in the middle of each piece.",
    })

    # ---- 11. Limits (always from the original) -----------------------------------
    limit_items: list[Item] = []
    for q in req.get("limits", []):
        latex, note, step = eval_limit_query(f, q, v, allow_pi)
        limit_items.append({"id": f"limit-{q['id']}", "label": "Limit", "latex": latex, "note": note, "stepId": f"limit-{q['id']}"})
        steps.append(step)

    # ---- 12. Point inspection --------------------------------------------------------
    point_items: list[Item] = []
    for a in (float(p) for p in req.get("points", [])):
        y, m, acc = f(a), f1(a), f2(a)
        sid = f"point-{id_num(a)}"
        if not isfinite(y):
            point_items.append({"id": sid, "label": f"At {v} = {fmt(a)}", "latex": f"f({X(a)}) \\text{{ is undefined}}",
                                "note": "Outside the domain — try a limit here instead.", "stepId": sid})
            steps.append({"id": sid, "title": f"Inspect {v} = {fmt(a)}", "detail": f"{fmt(a)} is not in the domain of the original function."})
            continue
        curve = None
        if isfinite(acc):
            curve = "curving up" if acc > 1e-9 else "curving down" if acc < -1e-9 else "momentarily straight"
        point_items += [
            {"id": f"{sid}-f", "label": f"Value at {v} = {fmt(a)}", "latex": f"f({X(a)}) = {N(y)}", "stepId": sid,
             "marker": {"x": a, "y": y, "kind": "point"}},
            {"id": f"{sid}-m", "label": "Slope (rate of change)", "latex": f"f'({X(a)}) = {N(m)}", "stepId": sid},
            {"id": f"{sid}-a", "label": "Acceleration (concavity)", "latex": f"f''({X(a)}) = {N(acc)}", "note": curve, "stepId": sid},
        ]
        if isfinite(m):
            b = y - m * a
            point_items.append({"id": f"{sid}-t", "label": "Tangent line", "latex": f"y = {line(m, b, v)}", "stepId": sid,
                                "line": {"kind": "slant", "m": m, "b": b}})
        steps.append({
            "id": sid,
            "title": f"Inspect {v} = {fmt(a)}",
            "latex": f"f({X(a)}) = {N(y)},\\quad f'({X(a)}) = {N(m)},\\quad f''({X(a)}) = {N(acc)}",
            "detail": f"Tangent line: y = f′(a)(x − a) + f(a) = {fmt(m)}({v} − {fmt(a)}) + {fmt(y)}." if isfinite(m) else None,
        })

    # ---- 13. Interval ------------------------------------------------------------------
    interval_items: list[Item] = []
    if req.get("interval"):
        a = float(min(req["interval"]["a"], req["interval"]["b"]))
        b = float(max(req["interval"]["a"], req["interval"]["b"]))
        sid = f"interval-{id_num(a)}-{id_num(b)}"
        fa, fb = f(a), f(b)
        gap = (
            not in_domain(a) or not in_domain(b)
            or any(a < e < b for e in excluded)
            or all(not (iv.lo <= a and b <= iv.hi) for iv in domain)
        )
        avg = (fb - fa) / (b - a) if b != a else NAN
        integral = NAN if gap else simpson(f, a, b)
        interval_items.append({
            "id": f"{sid}-avg", "label": "Average rate of change", "stepId": sid,
            "latex": f"\\frac{{f({X(b)}) - f({X(a)})}}{{{X(b)} - {X(a)}}} = {N(avg)}" if isfinite(avg) else "\\text{undefined at an endpoint}",
        })
        interval_items.append({
            "id": f"{sid}-int", "label": "Definite integral (signed area)", "stepId": sid,
            "latex": f"\\int_{{{X(a)}}}^{{{X(b)}}} f({v})\\,d{v} \\approx {dec_tex(integral)}" if isfinite(integral) else "\\text{not computed}",
            "note": "f is undefined somewhere on this interval, so the integral was skipped." if gap else None,
        })
        cands = [x for x in [a, b, *(x for x in f1_roots if a < x < b)] if in_domain(x)]
        if cands and not gap:
            hi_pt = max(cands, key=f)
            lo_pt = min(cands, key=f)
            interval_items.append({"id": f"{sid}-max", "label": "Highest point on the interval", "latex": pair(hi_pt, f(hi_pt)),
                                   "stepId": sid, "marker": {"x": hi_pt, "y": f(hi_pt), "kind": "extreme"}})
            interval_items.append({"id": f"{sid}-min", "label": "Lowest point on the interval", "latex": pair(lo_pt, f(lo_pt)),
                                   "stepId": sid, "marker": {"x": lo_pt, "y": f(lo_pt), "kind": "extreme"}})
        steps.append({
            "id": sid,
            "title": f"Inspect the interval [{fmt(a)}, {fmt(b)}]",
            "detail": "\n".join([
                f"Average rate of change = (f(b) − f(a)) / (b − a) = ({fmt(fb)} − {fmt(fa)}) / {fmt(b - a)}.",
                "The interval crosses a point outside the domain, so the integral and extremes are skipped." if gap
                else "Integral by Simpson's rule (2000 slices). Extremes: compared the endpoints and any critical points inside.",
            ]),
        })

    # ---- Sections ------------------------------------------------------------------
    fn_items: list[Item] = [{"id": "fn-original", "label": "Original (gospel)", "latex": f"{fx} = {f_tex}", "stepId": "read"}]
    if changed:
        fn_items.append({
            "id": "fn-simplified", "label": "Simplified form", "latex": f"{fx} = {g_tex}", "verification": simp_verification,
            "note": f"Only valid where {', '.join(f'${c}$' for c in conds)}" if conds else None, "stepId": "simplify",
        })
    sections += [
        {"id": "function", "title": "Function", "items": fn_items},
        {"id": "derivatives", "title": "Derivatives", "items": [
            {"id": "d1", "label": "First derivative (slope)", "latex": f"f'({v}) = {to_tex(d1r.node)}", "verification": c1.verification, "stepId": "deriv1"},
            {"id": "d2", "label": "Second derivative (acceleration)", "latex": f"f''({v}) = {to_tex(d2r.node)}", "verification": c2.verification, "stepId": "deriv2"},
        ]},
        {"id": "domain", "title": "Domain", "items": [{"id": "dom", "label": "Allowed inputs", "latex": domain_tex, "stepId": "domain"}]},
        {"id": "critical", "title": "Critical points", "emptyText": "None found on the scanned range.", "items": [
            {"id": f"crit-{id_num(c['x'])}", "label": kind_label[c["kind"]], "latex": pair(c["x"], c["y"]), "note": approx_note(c["x"], c["y"]),
             "verification": slope_verified(c["x"]), "stepId": f"critical.{id_num(c['x'])}",
             "marker": {"x": c["x"], "y": c["y"], "kind": c["kind"]}}
            for c in crit
        ]},
        {"id": "inflection", "title": "Inflection points", "emptyText": "None found on the scanned range.", "items": [
            {"id": f"infl-{id_num(p['x'])}", "label": "Inflection point", "latex": pair(p["x"], p["y"]), "note": approx_note(p["x"], p["y"]),
             "stepId": f"inflection.{id_num(p['x'])}", "marker": {"x": p["x"], "y": p["y"], "kind": "inflection"}}
            for p in infl
        ]},
        {"id": "asymptotes", "title": "Holes and asymptotes", "items": disc_items + end_items, "emptyText": "None."},
        {"id": "intercepts", "title": "Intercepts", "items": intercept_items, "emptyText": "None."},
        {"id": "behavior", "title": "Behavior", "items": behavior_items},
    ]
    if limit_items:
        sections.append({"id": "limits", "title": "Limits", "items": limit_items})
    if point_items:
        sections.append({"id": "points", "title": "Point inspection", "items": point_items})
    if interval_items:
        sections.append({"id": "interval", "title": "Interval", "items": interval_items})

    notices.append(f"Python engine: SymPy simplifies the function and its derivatives; critical points, asymptotes, limits and intervals are found numerically on [{fmt(lo_x)}, {fmt(hi_x)}].")

    return {
        "ok": True,
        "engine": "python",
        "input": req["expression"],
        "diagnostics": parsed.diagnostics,
        "parsed": {"latex": f"{fx} = {f_tex}", "mainVar": v, "params": params},
        "plot": {"f": ast, "d1": d1r.node, "d2": d2r.node, "mainVar": v, "paramValues": param_values},
        "steps": steps,
        "sections": sections,
        "notices": notices,
    }


def eval_limit_query(f: Compiled, q: dict[str, Any], v: str, allow_pi: bool) -> tuple[str, str | None, Step]:
    sid = f"limit-{q['id']}"
    side = q.get("side", "both")
    sup = "^{-}" if side == "left" else "^{+}" if side == "right" else ""
    target = q["target"]
    is_inf = target in ("inf", "-inf")
    t = INF if target == "inf" else -INF if target == "-inf" else float(target)
    t_tex = ("\\infty" if t > 0 else "-\\infty") if is_inf else num_latex(t, allow_pi).split(" \\approx")[0]
    head = f"\\lim_{{{v} \\to {t_tex}{'' if is_inf else sup}}} f({v})"

    if is_inf:
        S = side_limit(f, t, 1)
        latex = f"{head} = {limit_tex(S.value, allow_pi)}"
        return latex, None, {
            "id": sid, "title": f"Limit as {v} → {'∞' if t > 0 else '−∞'}", "latex": latex,
            "detail": "Evaluated the original at larger and larger values.",
            "children": [{"id": f"{sid}.table", "title": "Values", "latex": table_tex(S.table, v)}],
        }

    direct = f(t)
    L = side_limit(f, t, -1)
    R = side_limit(f, t, 1)
    note: str | None = None
    if side == "left":
        value = L.value
    elif side == "right":
        value = R.value
    elif same_limit(L.value, R.value):
        value = (LimitValue("finite", value=(L.value.value + R.value.value) / 2)
                 if L.value.kind == "finite" and R.value.kind == "finite" else L.value)
    elif L.value.kind == "undefined" and R.value.kind != "undefined":
        value = R.value
        note = "Only the right side is in the domain, so this is the one-sided limit."
    elif R.value.kind == "undefined" and L.value.kind != "undefined":
        value = L.value
        note = "Only the left side is in the domain, so this is the one-sided limit."
    else:
        value = LimitValue("dne", reason="the left and right limits differ")
        note = "Left and right sides approach different values."

    continuous = isfinite(direct) and value.kind == "finite" and abs(direct - value.value) <= 1e-4 * (1 + abs(direct))
    if isfinite(direct):
        direct_detail = ("It works — f is continuous here, so the limit equals the value." if continuous
                         else "f has a value here, but the nearby values disagree, so check both sides.")
    else:
        direct_detail = "Substitution fails (like 0/0 or division by zero), so look at values close by."
    children: list[Step] = [{
        "id": f"{sid}.direct",
        "title": "Try direct substitution",
        "latex": f"f({t_tex}) = {num_latex(direct, allow_pi)}" if isfinite(direct) else f"f({t_tex}) \\text{{ is undefined}}",
        "detail": direct_detail,
    }]
    if side != "right":
        children.append({"id": f"{sid}.left", "title": "Approach from the left", "latex": table_tex(L.table, v)})
    if side != "left":
        children.append({"id": f"{sid}.right", "title": "Approach from the right", "latex": table_tex(R.table, v)})
    latex = f"{head} = {limit_tex(value, allow_pi)}"
    children.append({"id": f"{sid}.result", "title": "Conclusion", "latex": latex,
                     "detail": f"It doesn't exist because {value.reason}." if value.kind == "dne" else note})

    if note is None:
        note = "Direct substitution" if continuous else "Numeric estimate from both sides" if value.kind == "finite" else None
    mark = "⁻" if side == "left" else "⁺" if side == "right" else ""
    return latex, note, {"id": sid, "title": f"Limit as {v} → {fmt(t)}{mark}", "form": "original", "latex": latex, "children": children}
