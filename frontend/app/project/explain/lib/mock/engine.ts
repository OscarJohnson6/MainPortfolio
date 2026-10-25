/**
 * Mock analysis engine. Produces the same AnalyzeResponse shape the Python
 * backend will, using a symbolic derivative plus numeric methods for the rest.
 *
 * Principle: the ORIGINAL function is gospel. The simplified form is a tool —
 * its results are only trusted where the original is defined, and every
 * derived answer is spot-checked numerically against the original.
 */
import { compile, containsVar, realPow, type Compiled } from '../evaluate';
import type {
  AnalyzeRequest, AnalyzeResponse, LimitQuery, MarkerKind, Node, ResultItem,
  ResultSection, Step, Verification,
} from '../types';
import { derivative } from './derive';
import { toTex } from './latex';
import {
  decTex, findRoots, fmt, limitTex, mulberry32, numLatex, recognize, sameLimit,
  sideLimit, simpson, snap, tableTex, isNoiseZero, type LimitValue,
} from './numeric';
import { call, ratOf, simplify } from './simplify';
import { parseInput, type Token } from './parser';

interface Iv {
  lo: number;
  hi: number;
  loClosed: boolean;
  hiClosed: boolean;
}

const idNum = (v: number) => fmt(v).replace(/\./g, '_').replace(/[−-]/g, 'm').replace(/\+/g, '');
const MAX_POINTS = 24;

export async function mockAnalyze(req: AnalyzeRequest): Promise<AnalyzeResponse> {
  await new Promise((r) => setTimeout(r, 60));
  return analyzeSync(req);
}

// ---------------------------------------------------------------------------
// Domain helpers
// ---------------------------------------------------------------------------

function constraints(n: Node, v: string, out: Set<string>) {
  switch (n.type) {
    case 'neg':
      constraints(n.arg, v, out);
      break;
    case 'bin':
      if (n.op === '/' && containsVar(n.right, v)) out.add(`${toTex(n.right)} \\neq 0`);
      if (n.op === '^' && containsVar(n.left, v)) {
        const r = ratOf(n.right) ?? (n.right.type === 'num' ? { p: n.right.value, q: 1 } : null);
        const ev = r ? r.p / r.q : NaN;
        if (r && Number.isNaN(realPow(-2, ev))) out.add(`${toTex(n.left)} ${ev < 0 ? '>' : '\\ge'} 0`);
        else if (containsVar(n.right, v)) out.add(`${toTex(n.left)} > 0`);
        else if (r && ev < 0) out.add(`${toTex(n.left)} \\neq 0`);
      }
      constraints(n.left, v, out);
      constraints(n.right, v, out);
      break;
    case 'call': {
      const a = toTex(n.arg);
      if (containsVar(n.arg, v)) {
        switch (n.fn) {
          case 'sqrt': out.add(`${a} \\ge 0`); break;
          case 'ln':
          case 'log': out.add(`${a} > 0`); break;
          case 'asin':
          case 'acos': out.add(`-1 \\le ${a} \\le 1`); break;
          case 'tan':
          case 'sec': out.add(`\\cos\\left(${a}\\right) \\neq 0`); break;
          case 'cot':
          case 'csc': out.add(`\\sin\\left(${a}\\right) \\neq 0`); break;
          case 'acosh': out.add(`${a} \\ge 1`); break;
          case 'atanh': out.add(`-1 < ${a} < 1`); break;
        }
      }
      constraints(n.arg, v, out);
      break;
    }
  }
}

/** Expressions whose zeros make f undefined (denominators and their friends). */
function denominators(n: Node, v: string, out: Node[]) {
  switch (n.type) {
    case 'neg':
      denominators(n.arg, v, out);
      break;
    case 'bin':
      if (n.op === '/' && containsVar(n.right, v)) out.push(n.right);
      if (n.op === '^' && (ratOf(n.right)?.p ?? 0) < 0 && containsVar(n.left, v)) out.push(n.left);
      denominators(n.left, v, out);
      denominators(n.right, v, out);
      break;
    case 'call':
      if (containsVar(n.arg, v)) {
        if (n.fn === 'tan' || n.fn === 'sec') out.push(call('cos', n.arg));
        if (n.fn === 'cot' || n.fn === 'csc') out.push(call('sin', n.arg));
      }
      denominators(n.arg, v, out);
      break;
  }
}

function domainIntervals(f: Compiled, min: number, max: number, excluded: number[]): Iv[] {
  const n = 4000;
  const h = (max - min) / n;
  const def = (x: number) => Number.isFinite(f(x));
  const boundary = (bad: number, good: number) => {
    let a = bad;
    let b = good;
    for (let k = 0; k < 70; k++) {
      const m = (a + b) / 2;
      if (def(m)) b = m;
      else a = m;
    }
    return snap(b);
  };
  const runs: Iv[] = [];
  let start: number | null = null;
  for (let i = 0; i <= n; i++) {
    const x = min + i * h;
    const d = def(x);
    if (d && start === null) start = i === 0 ? -Infinity : boundary(x - h, x);
    if (start !== null && (!d || i === n)) {
      const hi = d && i === n ? Infinity : boundary(x, x - h);
      runs.push({ lo: start, hi, loClosed: Number.isFinite(start) && def(start), hiClosed: Number.isFinite(hi) && def(hi) });
      start = null;
    }
  }
  for (const e of excluded) {
    const k = runs.findIndex((r) => r.lo < e && e < r.hi);
    if (k < 0) continue;
    const r = runs[k];
    runs.splice(k, 1, { ...r, hi: e, hiClosed: false }, { ...r, lo: e, loClosed: false });
  }
  return runs.filter((r) => r.lo < r.hi || (r.loClosed && r.hiClosed));
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

interface CheckResult {
  verification: Verification;
  passed: number;
  total: number;
  worst?: { x: number; symbolic: number; numeric: number };
}

/** Compare a symbolic derivative with the numeric slope of `base`. */
function derivCheck(base: Compiled, deriv: Compiled, excluded: number[], min: number, max: number, seed: number): CheckResult {
  const rng = mulberry32(seed);
  let passed = 0;
  let total = 0;
  let worst: CheckResult['worst'];
  let worstErr = 0;
  for (let tries = 0; tries < 400 && total < 20; tries++) {
    const x = min + rng() * (max - min);
    if (excluded.some((e) => Math.abs(x - e) < 1e-2)) continue;
    const h = 1e-5 * (1 + Math.abs(x));
    const a = base(x + h);
    const b = base(x - h);
    const d = deriv(x);
    if (![a, b, d].every(Number.isFinite)) continue;
    const numeric = (a - b) / (2 * h);
    total++;
    const err = Math.abs(d - numeric) / (1 + Math.abs(d));
    if (err <= 1e-3) passed++;
    else if (err > worstErr) {
      worstErr = err;
      worst = { x, symbolic: d, numeric };
    }
  }
  const verification: Verification = total < 5 ? 'unchecked' : passed === total ? 'verified' : 'mismatch';
  return { verification, passed, total, worst };
}

function checkDetail(label: string, c: CheckResult, v: string): string {
  if (c.verification === 'unchecked') return `Not enough points in the domain to check ${label}.`;
  let s = `Compared ${label} with the numeric slope of the original at ${c.total} random points: ${c.passed}/${c.total} agree.`;
  if (c.worst) {
    s += `\nWorst disagreement at ${v} = ${fmt(c.worst.x)}: symbolic ${fmt(c.worst.symbolic)} vs numeric ${fmt(c.worst.numeric)}. Treat this result with care.`;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function analyzeSync(req: AnalyzeRequest): AnalyzeResponse {
  const { settings } = req;
  const allowPi = settings.piMode === 'exact';
  const parsed = parseInput(req.expression, settings);
  if (!parsed.ok) {
    return { ok: false, engine: 'mock', input: req.expression, diagnostics: parsed.diagnostics, steps: [], sections: [], notices: [] };
  }

  const { ast, mainVar: v, params, tokens, implicitAt } = parsed;
  const { min, max } = req.scan;
  const steps: Step[] = [];
  const sections: ResultSection[] = [];
  const notices: string[] = [];
  const fx = `f(${v})`;
  const N = (x: number) => numLatex(x, allowPi);
  const X = (x: number) => (Number.isFinite(x) ? recognize(x, allowPi) ?? decTex(x) : x > 0 ? '\\infty' : '-\\infty');
  const pair = (x: number, y: number) => `\\left(${X(x)},\\ ${X(y)}\\right)`;
  const approxNote = (x: number, y: number) => {
    const ex = recognize(x, allowPi);
    const ey = recognize(y, allowPi);
    const nonInt = (s: string | null) => s !== null && !/^-?\d+$/.test(s);
    return nonInt(ex) || nonInt(ey) ? `≈ (${fmt(x)}, ${fmt(y)})` : undefined;
  };
  const ivTex = (list: Iv[]) => {
    if (!list.length) return '\\varnothing';
    const one = (r: Iv) =>
      `${r.loClosed ? '[' : '('}${X(r.lo)}, ${X(r.hi)}${r.hiClosed ? ']' : ')'}`;
    if (list.length > 8) return `${list.slice(0, 4).map(one).join(' \\cup ')} \\cup \\cdots`;
    return list.map(one).join(' \\cup ');
  };

  // ---- Parameters ---------------------------------------------------------
  const paramValues: Record<string, number> = {};
  const symbolic: string[] = [];
  for (const p of params) {
    const val = req.params[p];
    if (val === null || val === undefined || !Number.isFinite(val)) {
      paramValues[p] = 1;
      symbolic.push(p);
    } else paramValues[p] = val;
  }
  const opts = { settings, mainVar: v, params: paramValues };
  const f = compile(ast, opts);
  const fTex = toTex(ast);
  let excludedSet: number[] = [];
  const inDomain = (x: number) => Number.isFinite(f(x)) && !excludedSet.some((e) => e === x);

  // ---- 1. Read --------------------------------------------------------------
  steps.push({
    id: 'read',
    title: 'Read the input',
    latex: `${fx} = ${fTex}`,
    form: 'original',
    detail: readDetail(tokens, implicitAt),
  });

  steps.push({
    id: 'vars',
    title: 'Variables',
    detail: [
      `${v} is the independent variable (the graph's horizontal axis).`,
      ...params.map((p) =>
        symbolic.includes(p)
          ? `${p} is left symbolic. The mock engine uses ${p} = 1 for numbers and the graph; the Python engine will keep it symbolic.`
          : `${p} = ${fmt(paramValues[p])} (set by you).`,
      ),
    ].join('\n'),
  });
  if (symbolic.length) notices.push(`${symbolic.join(', ')} left symbolic — numbers and the graph use ${symbolic.map((p) => `${p} = 1`).join(', ')} for now.`);

  // ---- 2. Domain (from the original) ---------------------------------------
  const cons = new Set<string>();
  constraints(ast, v, cons);
  const dens: Node[] = [];
  denominators(ast, v, dens);
  let excluded: number[] = [];
  for (const d of dens) {
    const g = compile(d, opts);
    // A zero of a denominator is excluded even if float noise makes f look finite there.
    for (const r of findRoots(g, min, max)) if (!inDomain(r) || Math.abs(g(r)) < 1e-12) excluded.push(r);
  }
  excluded = [...new Set(excluded.map(snap))].sort((a, b) => a - b).slice(0, 60);
  excludedSet = excluded;
  const domain = domainIntervals(f, min, max, excluded);
  const domainTex = domain.length === 1 && domain[0].lo === -Infinity && domain[0].hi === Infinity ? '(-\\infty, \\infty)' : ivTex(domain);

  steps.push({
    id: 'domain',
    title: 'Find the domain (from the original)',
    form: 'original',
    latex: `\\operatorname{Dom}(f) = ${domainTex}`,
    detail: cons.size
      ? 'Each restriction below comes from a piece of the original input. The domain is never taken from a simplified form.'
      : 'Nothing in the input restricts the domain.',
    children: [
      ...[...cons].map((c, i) => ({ id: `domain.c${i}`, title: 'Restriction', latex: c })),
      {
        id: 'domain.scan',
        title: 'Numeric scan',
        detail: `Sampled ${v} on [${min}, ${max}] to locate the allowed intervals. Intervals that reach the edge of the scan are assumed to continue.`,
      },
    ],
  });

  // ---- 3. Simplify + self-check --------------------------------------------
  const simp = simplify(ast, true);
  const g = simp.node;
  const gTex = toTex(g);
  const changed = gTex !== fTex;
  const conds = simp.rewrites.filter((r) => r.condition).map((r) => r.condition!);
  const simplifyStep: Step = {
    id: 'simplify',
    title: changed ? 'Simplify' : 'Simplify (nothing to do)',
    form: 'simplified',
    latex: changed ? `${fx} = ${gTex}` : undefined,
    detail: changed
      ? 'Derivatives are taken from the simplified form, but every result is filtered against the original domain.'
      : 'Already as simple as this engine can make it.',
    children: simp.rewrites.map((r, i) => ({
      id: `simplify.${i}`,
      title: `Rewrite: ${r.rule}`,
      latex: `${r.before} \\;\\longrightarrow\\; ${r.after}`,
      condition: r.condition,
    })),
  };

  let simpVerification: Verification = 'unchecked';
  if (changed) {
    const gc = compile(g, opts);
    const rng = mulberry32(7);
    let mismatch: { x: number; a: number; b: number } | null = null;
    let wider: number | null = null;
    let agree = 0;
    for (let i = 0; i < 60; i++) {
      const x = snap(min + rng() * (max - min));
      const a = f(x);
      const b = gc(x);
      const da = Number.isFinite(a);
      const db = Number.isFinite(b);
      if (da && db) {
        if (Math.abs(a - b) <= 1e-7 * (1 + Math.abs(a))) agree++;
        else if (!mismatch) mismatch = { x, a, b };
      } else if (!da && db && wider === null) wider = x;
    }
    // Also probe the excluded points directly — that's where cancellations bite.
    for (const e of excluded) if (wider === null && Number.isFinite(gc(e))) wider = e;
    if (wider === null && domain.length && Number.isFinite(domain[0].lo)) {
      const probe = domain[0].lo - 1;
      if (Number.isFinite(gc(probe)) && !inDomain(probe)) wider = probe;
    }

    if (mismatch) {
      simpVerification = 'mismatch';
    } else if (wider !== null) {
      simpVerification = 'domain-change';
    } else simpVerification = 'verified';

    simplifyStep.children = [
      ...(simplifyStep.children ?? []),
      {
        id: 'simplify.check',
        title: 'Self-check against the original',
        verification: simpVerification,
        detail: mismatch
          ? `At ${v} = ${fmt(mismatch.x)} the original gives ${fmt(mismatch.a)} but the simplified form gives ${fmt(mismatch.b)}. These should match, so something in the simplifier is wrong — results may be unreliable.`
          : wider !== null
            ? `The simplified form is defined at ${v} = ${fmt(wider)}, but the original is not. The simplification widened the domain, so the original's domain is kept and any answer outside it is thrown out.${conds.length ? ' The rewrite conditions above show exactly where.' : ''}`
            : `Original and simplified forms agree at ${agree} random points.`,
      },
    ];
  }
  steps.push(simplifyStep);

  // ---- 4. Derivatives ---------------------------------------------------------
  const logB10 = settings.logBase === '10';
  const d1r = derivative(g, v, 'deriv1', `First derivative f′(${v})`, logB10);
  const d2r = derivative(d1r.node, v, 'deriv2', `Second derivative f″(${v})`, logB10);
  const f1raw = compile(d1r.node, opts);
  const f2raw = compile(d2r.node, opts);
  const f1: Compiled = (x) => (inDomain(x) ? f1raw(x) : NaN);
  const f2: Compiled = (x) => (inDomain(x) ? f2raw(x) : NaN);
  const c1 = derivCheck(f, f1, excluded, min, max, 11);
  const c2 = derivCheck(f1, f2, excluded, min, max, 13);
  d1r.step.children = [...(d1r.step.children ?? []), { id: 'deriv1.check', title: 'Self-check against the original', verification: c1.verification, detail: checkDetail('f′', c1, v) }];
  d2r.step.children = [...(d2r.step.children ?? []), { id: 'deriv2.check', title: 'Self-check', verification: c2.verification, detail: checkDetail('f″', c2, v).replace('the original', 'f′') }];
  steps.push(d1r.step, d2r.step);

  const f1Varies = containsVar(d1r.node, v) && !isNoiseZero(f1, min, max);
  const f2Varies = containsVar(d2r.node, v) && !isNoiseZero(f2, min, max);
  // Below this size f′/f″ values are float noise, not a sign.
  const clean = (g: Compiled): Compiled => (x) => {
    const y = g(x);
    return Math.abs(y) < 1e-9 ? 0 : y;
  };

  // ---- 5. Critical points -------------------------------------------------------
  // Critical points are where f′ = 0 OR where f′ is undefined but f is defined (cusps, corners).
  const zeroRoots = f1Varies ? findRoots(f1, min, max).filter(inDomain) : [];
  const d1Dens: Node[] = [];
  denominators(d1r.node, v, d1Dens);
  const cusps = d1Dens
    .flatMap((d) => findRoots(compile(d, opts), min, max))
    .map(snap)
    .filter((x) => inDomain(x) && !Number.isFinite(f1raw(x)) && !excluded.includes(x));
  const f1Roots = [...new Set([...zeroRoots, ...cusps])].sort((a, b) => a - b);
  type Crit = { x: number; y: number; kind: MarkerKind; reason: string };
  const crit: Crit[] = f1Roots.slice(0, MAX_POINTS).map((x) => {
    const y = f(x);
    if (cusps.includes(x)) {
      const a = f1(x - 1e-4);
      const b = f1(x + 1e-4);
      const kind: MarkerKind = a < 0 && b > 0 ? 'min' : a > 0 && b < 0 ? 'max' : 'stationary';
      return { x, y, kind, reason: `f′ is undefined here (a cusp or corner) but f is defined. f′ goes ${a < 0 ? '−' : '+'} to ${b < 0 ? '−' : '+'}${kind === 'stationary' ? ', so no extremum' : `, so it's a local ${kind === 'min' ? 'minimum' : 'maximum'}`}.` };
    }
    const s2 = f2(x);
    if (Number.isFinite(s2) && s2 > 1e-7) return { x, y, kind: 'min', reason: `f″ = ${fmt(s2)} > 0, so the graph curves up: local minimum.` };
    if (Number.isFinite(s2) && s2 < -1e-7) return { x, y, kind: 'max', reason: `f″ = ${fmt(s2)} < 0, so the graph curves down: local maximum.` };
    const a = f1(x - 1e-3);
    const b = f1(x + 1e-3);
    if (a < 0 && b > 0) return { x, y, kind: 'min', reason: 'f″ = 0, so used the first-derivative test: f′ goes − to +, local minimum.' };
    if (a > 0 && b < 0) return { x, y, kind: 'max', reason: 'f″ = 0, so used the first-derivative test: f′ goes + to −, local maximum.' };
    return { x, y, kind: 'stationary', reason: 'f′ doesn\'t change sign here, so it\'s a flat spot but not a max or min.' };
  });
  const kindLabel: Record<string, string> = { max: 'Local maximum', min: 'Local minimum', stationary: 'Stationary point' };
  const slopeVerified = (x: number): Verification => {
    if (cusps.includes(x)) return 'unchecked';
    const h = 1e-6 * (1 + Math.abs(x));
    const s = (f(x + h) - f(x - h)) / (2 * h);
    return Number.isFinite(s) ? (Math.abs(s) < 1e-3 * (1 + Math.abs(f(x))) ? 'verified' : 'mismatch') : 'unchecked';
  };

  steps.push({
    id: 'critical',
    title: `Critical points: f′(${v}) = 0 or undefined`,
    form: 'simplified',
    detail: !f1Varies
      ? `f′ is constant, so there are no isolated critical points.`
      : crit.length
        ? `Searched [${min}, ${max}] for places where f′ crosses or touches 0, then kept only points in the original domain.${f1Roots.length > MAX_POINTS ? ` Showing the first ${MAX_POINTS} of ${f1Roots.length}.` : ''}`
        : `f′ is never 0 on [${min}, ${max}] inside the domain.`,
    children: crit.map((c) => ({
      id: `critical.${idNum(c.x)}`,
      title: kindLabel[c.kind],
      latex: `${v} = ${N(c.x)},\\quad f(${v}) = ${N(c.y)}`,
      detail: c.reason,
    })),
  });

  // ---- 6. Inflection points -----------------------------------------------------
  const infl = (f2Varies ? findRoots(f2, min, max) : [])
    .filter((x) => inDomain(x) && f2(x - 1e-4) * f2(x + 1e-4) < 0)
    .slice(0, MAX_POINTS)
    .map((x) => ({ x, y: f(x) }));
  steps.push({
    id: 'inflection',
    title: `Inflection points: f″(${v}) = 0 with a sign change`,
    form: 'simplified',
    detail: infl.length ? 'Concavity flips at each of these.' : 'Concavity never flips on the scanned range.',
    children: infl.map((p) => ({ id: `inflection.${idNum(p.x)}`, title: 'Inflection point', latex: `${v} = ${N(p.x)},\\quad f(${v}) = ${N(p.y)}` })),
  });

  // ---- 7. Holes & vertical asymptotes (original function) -------------------
  const discItems: ResultItem[] = [];
  const discSteps: Step[] = [];
  const sideWord = (lv: LimitValue) => (lv.kind === 'inf' ? (lv.sign > 0 ? '+∞' : '−∞') : lv.kind === 'finite' ? fmt(lv.value) : lv.kind === 'dne' ? 'oscillates' : 'undefined');
  for (const e of excluded) {
    const L = sideLimit(f, e, -1);
    const R = sideLimit(f, e, 1);
    const sid = `disc.${idNum(e)}`;
    const kids: Step[] = [
      { id: `${sid}.left`, title: 'Approach from the left', latex: tableTex(L.table, v) },
      { id: `${sid}.right`, title: 'Approach from the right', latex: tableTex(R.table, v) },
    ];
    if (L.value.kind === 'finite' && R.value.kind === 'finite' && sameLimit(L.value, R.value)) {
      const y = (L.value.value + R.value.value) / 2;
      discItems.push({ id: `hole-${idNum(e)}`, label: 'Hole (removable)', latex: pair(e, y), note: approxNote(e, y), stepId: sid, marker: { x: e, y, kind: 'hole' } });
      discSteps.push({ id: sid, title: `Hole at ${v} = ${fmt(e)}`, latex: `f(${X(e)}) \\text{ is undefined, but both sides approach } ${N(y)}`, children: kids });
    } else if (L.value.kind === 'inf' || R.value.kind === 'inf') {
      discItems.push({ id: `va-${idNum(e)}`, label: 'Vertical asymptote', latex: `${v} = ${X(e)}`, note: `left → ${sideWord(L.value)}, right → ${sideWord(R.value)}`, stepId: sid, line: { kind: 'vertical', x: e } });
      discSteps.push({ id: sid, title: `Vertical asymptote at ${v} = ${fmt(e)}`, detail: `Left side → ${sideWord(L.value)}, right side → ${sideWord(R.value)}.`, children: kids });
    } else {
      discItems.push({ id: `disc-${idNum(e)}`, label: 'Discontinuity', latex: `${v} = ${X(e)}`, note: `left → ${sideWord(L.value)}, right → ${sideWord(R.value)}`, stepId: sid });
      discSteps.push({ id: sid, title: `Discontinuity at ${v} = ${fmt(e)}`, detail: 'The two sides don\'t agree and neither blows up.', children: kids });
    }
  }
  // One-sided asymptotes at domain boundaries, e.g. ln(x) at 0.
  for (const iv of domain) {
    for (const [b, dir] of [[iv.lo, 1], [iv.hi, -1]] as [number, -1 | 1][]) {
      if (!Number.isFinite(b) || excluded.some((e) => Math.abs(e - b) < 1e-9) || inDomain(b)) continue;
      if (discItems.some((d) => d.line?.kind === 'vertical' && Math.abs(d.line.x - b) < 1e-9)) continue;
      const S = sideLimit(f, b, dir);
      if (S.value.kind !== 'inf') continue;
      const sid = `disc.${idNum(b)}`;
      discItems.push({ id: `va-${idNum(b)}`, label: 'Vertical asymptote (one-sided)', latex: `${v} = ${X(b)}`, note: `from the ${dir > 0 ? 'right' : 'left'} → ${sideWord(S.value)}`, stepId: sid, line: { kind: 'vertical', x: b } });
      discSteps.push({ id: sid, title: `Vertical asymptote at the domain edge ${v} = ${fmt(b)}`, children: [{ id: `${sid}.side`, title: `Approach from the ${dir > 0 ? 'right' : 'left'}`, latex: tableTex(S.table, v) }] });
    }
  }
  steps.push({
    id: 'disc',
    title: 'Holes and vertical asymptotes',
    form: 'original',
    detail: discSteps.length
      ? 'Checked every point the original excludes, approaching from both sides with the original function.'
      : 'No excluded points or blow-ups on the scanned range.',
    children: discSteps,
  });

  // ---- 8. End behavior --------------------------------------------------------
  const endItems: ResultItem[] = [];
  const endSteps: Step[] = [];
  const ends = ([1, -1] as const).map((s) => ({ s, lim: sideLimit(f, s * Infinity, 1) }));
  const [pos, negE] = ends;
  if (pos.lim.value.kind === 'finite' && negE.lim.value.kind === 'finite' && sameLimit(pos.lim.value, negE.lim.value)) {
    const L = pos.lim.value.value;
    endItems.push({ id: 'ha-both', label: 'Horizontal asymptote (both ends)', latex: `y = ${limitTex(pos.lim.value, allowPi)}`, stepId: 'end', line: { kind: 'horizontal', y: snap(L) } });
  } else {
    for (const { s, lim } of ends) {
      const dirTex = s > 0 ? '\\infty' : '-\\infty';
      const tag = s > 0 ? 'pos' : 'neg';
      if (lim.value.kind === 'finite') {
        endItems.push({ id: `ha-${tag}`, label: `Horizontal asymptote (${v} → ${s > 0 ? '∞' : '−∞'})`, latex: `y = ${limitTex(lim.value, allowPi)}`, stepId: `end.${tag}`, line: { kind: 'horizontal', y: snap(lim.value.value) } });
      } else if (lim.value.kind === 'inf') {
        const m = sideLimit((x) => f(x) / x, s * Infinity, 1).value;
        let slant = false;
        if (m.kind === 'finite' && Math.abs(m.value) > 1e-6) {
          const mv = snap(m.value);
          const b = sideLimit((x) => f(x) - mv * x, s * Infinity, 1).value;
          if (b.kind === 'finite') {
            slant = true;
            const bv = snap(b.value);
            endItems.push({ id: `slant-${tag}`, label: `Slant asymptote (${v} → ${s > 0 ? '∞' : '−∞'})`, latex: `y = ${line(mv, bv, v)}`, stepId: `end.${tag}`, line: { kind: 'slant', m: mv, b: bv } });
          }
        }
        if (!slant) {
          endItems.push({ id: `end-${tag}`, label: 'End behavior', latex: `\\lim_{${v} \\to ${dirTex}} f(${v}) = ${limitTex(lim.value, allowPi)}`, stepId: `end.${tag}` });
        }
      } else {
        endItems.push({ id: `end-${tag}`, label: 'End behavior', latex: `${v} \\to ${dirTex}: \\text{${lim.value.kind === 'dne' ? 'oscillates, no limit' : 'no limit (values overflow or are undefined)'}}`, stepId: `end.${tag}` });
      }
    }
  }
  for (const { s, lim } of ends) {
    endSteps.push({ id: `end.${s > 0 ? 'pos' : 'neg'}`, title: `As ${v} → ${s > 0 ? '∞' : '−∞'}`, latex: tableTex(lim.table, v) });
  }
  steps.push({ id: 'end', title: 'End behavior and horizontal / slant asymptotes', form: 'original', detail: 'Evaluated the original at larger and larger |x|. If f(x) blows up, checked whether f(x)/x settles (a slant asymptote).', children: endSteps });

  // ---- 9. Intercepts ----------------------------------------------------------
  const interceptItems: ResultItem[] = [];
  const y0 = f(0);
  if (Number.isFinite(y0)) interceptItems.push({ id: 'y-int', label: 'y-intercept', latex: pair(0, y0), note: approxNote(0, y0), stepId: 'intercepts', marker: { x: 0, y: y0, kind: 'y-intercept' } });
  const fVaries = containsVar(ast, v);
  const xInts = fVaries ? findRoots(f, min, max).slice(0, MAX_POINTS) : [];
  for (const x of xInts) {
    interceptItems.push({ id: `x-int-${idNum(x)}`, label: 'x-intercept', latex: pair(x, 0), note: approxNote(x, 0), stepId: 'intercepts', marker: { x, y: 0, kind: 'x-intercept' } });
  }
  steps.push({
    id: 'intercepts',
    title: 'Intercepts',
    form: 'original',
    detail: [
      Number.isFinite(y0) ? `y-intercept: f(0) = ${fmt(y0)}.` : '0 is not in the domain, so there is no y-intercept.',
      xInts.length ? `Solved f(${v}) = 0 numerically: ${xInts.map((x) => fmt(x)).join(', ')}.` : `f(${v}) = 0 has no solutions on [${min}, ${max}].`,
    ].join('\n'),
  });

  // ---- 10. Increasing / decreasing / concavity ---------------------------------
  const signIntervals = (test: Compiled, breaks: number[]) => {
    const out = { pos: [] as Iv[], neg: [] as Iv[] };
    for (const iv of domain) {
      const lo = Number.isFinite(iv.lo) ? iv.lo : min;
      const hi = Number.isFinite(iv.hi) ? iv.hi : max;
      const pts = [lo, ...breaks.filter((b) => b > lo && b < hi), hi];
      let prev: { sign: number; seg: Iv } | null = null;
      for (let k = 0; k < pts.length - 1; k++) {
        // Test the middle first; if that one point is undefined, try the thirds.
        const span = pts[k + 1] - pts[k];
        let s = NaN;
        for (const t of [0.5, 1 / 3, 2 / 3, 0.1, 0.9]) {
          s = Math.sign(test(pts[k] + span * t));
          if (Number.isFinite(s)) break;
        }
        const seg: Iv = { lo: k === 0 ? iv.lo : pts[k], hi: k === pts.length - 2 ? iv.hi : pts[k + 1], loClosed: false, hiClosed: false };
        if (prev && prev.sign === s) {
          prev.seg.hi = seg.hi;
          continue;
        }
        if (s > 0) out.pos.push(seg);
        else if (s < 0) out.neg.push(seg);
        prev = { sign: s, seg };
      }
    }
    return out;
  };
  const inc = signIntervals(clean(f1Varies ? f1 : () => f1raw(0)), f1Roots);
  const f2Roots = f2Varies ? findRoots(f2, min, max).filter(inDomain) : [];
  const conc = signIntervals(clean(f2Varies ? f2 : () => f2raw(0)), [...f2Roots, ...cusps].sort((a, b) => a - b));
  const behaviorItems: ResultItem[] = [
    { id: 'inc', label: 'Increasing on', latex: ivTex(inc.pos), stepId: 'behavior' },
    { id: 'dec', label: 'Decreasing on', latex: ivTex(inc.neg), stepId: 'behavior' },
    { id: 'cup', label: 'Concave up on', latex: ivTex(conc.pos), stepId: 'behavior' },
    { id: 'cdown', label: 'Concave down on', latex: ivTex(conc.neg), stepId: 'behavior' },
  ];
  steps.push({
    id: 'behavior',
    title: 'Where f rises, falls, and bends',
    form: 'simplified',
    detail: 'Split the domain at the critical points (for f′) and at f″ = 0 (for f″), then checked the sign in the middle of each piece.',
  });

  // ---- 11. Limits (always from the original) -----------------------------------
  const limitItems: ResultItem[] = [];
  for (const q of req.limits) {
    const r = evalLimitQuery(f, q, v, allowPi);
    limitItems.push({ id: `limit-${q.id}`, label: 'Limit', latex: r.latex, note: r.note, stepId: `limit-${q.id}` });
    steps.push(r.step);
  }

  // ---- 12. Point inspection --------------------------------------------------------
  const pointItems: ResultItem[] = [];
  for (const a of req.points) {
    const y = f(a);
    const m = f1(a);
    const acc = f2(a);
    const sid = `point-${idNum(a)}`;
    if (!Number.isFinite(y)) {
      pointItems.push({ id: sid, label: `At ${v} = ${fmt(a)}`, latex: `f(${X(a)}) \\text{ is undefined}`, note: 'Outside the domain — try a limit here instead.', stepId: sid });
      steps.push({ id: sid, title: `Inspect ${v} = ${fmt(a)}`, detail: `${fmt(a)} is not in the domain of the original function.` });
      continue;
    }
    pointItems.push(
      { id: `${sid}-f`, label: `Value at ${v} = ${fmt(a)}`, latex: `f(${X(a)}) = ${N(y)}`, stepId: sid, marker: { x: a, y, kind: 'point' } },
      { id: `${sid}-m`, label: 'Slope (rate of change)', latex: `f'(${X(a)}) = ${N(m)}`, stepId: sid },
      { id: `${sid}-a`, label: 'Acceleration (concavity)', latex: `f''(${X(a)}) = ${N(acc)}`, note: Number.isFinite(acc) ? (acc > 1e-9 ? 'curving up' : acc < -1e-9 ? 'curving down' : 'momentarily straight') : undefined, stepId: sid },
    );
    if (Number.isFinite(m)) {
      const b = y - m * a;
      pointItems.push({ id: `${sid}-t`, label: 'Tangent line', latex: `y = ${line(m, b, v)}`, stepId: sid, line: { kind: 'slant', m, b } });
    }
    steps.push({
      id: sid,
      title: `Inspect ${v} = ${fmt(a)}`,
      latex: `f(${X(a)}) = ${N(y)},\\quad f'(${X(a)}) = ${N(m)},\\quad f''(${X(a)}) = ${N(acc)}`,
      detail: Number.isFinite(m) ? `Tangent line: y = f′(a)(x − a) + f(a) = ${fmt(m)}(${v} − ${fmt(a)}) + ${fmt(y)}.` : undefined,
    });
  }

  // ---- 13. Interval ------------------------------------------------------------------
  const intervalItems: ResultItem[] = [];
  if (req.interval) {
    const a = Math.min(req.interval.a, req.interval.b);
    const b = Math.max(req.interval.a, req.interval.b);
    const sid = `interval-${idNum(a)}-${idNum(b)}`;
    const fa = f(a);
    const fb = f(b);
    const gap =
      !inDomain(a) || !inDomain(b) ||
      excluded.some((e) => e > a && e < b) ||
      domain.every((iv) => !(iv.lo <= a && b <= iv.hi));
    const avg = (fb - fa) / (b - a);
    const integral = gap ? NaN : simpson(f, a, b);
    intervalItems.push({ id: `${sid}-avg`, label: 'Average rate of change', latex: Number.isFinite(avg) ? `\\frac{f(${X(b)}) - f(${X(a)})}{${X(b)} - ${X(a)}} = ${N(avg)}` : '\\text{undefined at an endpoint}', stepId: sid });
    intervalItems.push({ id: `${sid}-int`, label: 'Definite integral (signed area)', latex: Number.isFinite(integral) ? `\\int_{${X(a)}}^{${X(b)}} f(${v})\\,d${v} \\approx ${decTex(integral)}` : '\\text{not computed}', note: gap ? 'f is undefined somewhere on this interval (improper integrals come with the Python engine).' : undefined, stepId: sid });
    const cands = [a, b, ...f1Roots.filter((x) => x > a && x < b)].filter(inDomain);
    if (cands.length && !gap) {
      const hi = cands.reduce((p, x) => (f(x) > f(p) ? x : p));
      const lo = cands.reduce((p, x) => (f(x) < f(p) ? x : p));
      intervalItems.push({ id: `${sid}-max`, label: 'Highest point on the interval', latex: pair(hi, f(hi)), stepId: sid, marker: { x: hi, y: f(hi), kind: 'extreme' } });
      intervalItems.push({ id: `${sid}-min`, label: 'Lowest point on the interval', latex: pair(lo, f(lo)), stepId: sid, marker: { x: lo, y: f(lo), kind: 'extreme' } });
    }
    steps.push({
      id: sid,
      title: `Inspect the interval [${fmt(a)}, ${fmt(b)}]`,
      detail: [
        `Average rate of change = (f(b) − f(a)) / (b − a) = (${fmt(fb)} − ${fmt(fa)}) / ${fmt(b - a)}.`,
        gap ? 'The interval crosses a point outside the domain, so the integral and extremes are skipped.' : 'Integral by Simpson\'s rule (2000 slices). Extremes: compared the endpoints and any critical points inside.',
      ].join('\n'),
    });
  }

  // ---- Sections ------------------------------------------------------------------
  const fnItems: ResultItem[] = [{ id: 'fn-original', label: 'Original (gospel)', latex: `${fx} = ${fTex}`, stepId: 'read' }];
  if (changed) {
    fnItems.push({
      id: 'fn-simplified',
      label: 'Simplified form',
      latex: `${fx} = ${gTex}`,
      verification: simpVerification,
      note: conds.length ? `Only valid where ${conds.map((c) => `$${c}$`).join(', ')}` : undefined,
      stepId: 'simplify',
    });
  }
  sections.push(
    { id: 'function', title: 'Function', items: fnItems },
    {
      id: 'derivatives',
      title: 'Derivatives',
      items: [
        { id: 'd1', label: 'First derivative (slope)', latex: `f'(${v}) = ${toTex(d1r.node)}`, verification: c1.verification, stepId: 'deriv1' },
        { id: 'd2', label: 'Second derivative (acceleration)', latex: `f''(${v}) = ${toTex(d2r.node)}`, verification: c2.verification, stepId: 'deriv2' },
      ],
    },
    { id: 'domain', title: 'Domain', items: [{ id: 'dom', label: 'Allowed inputs', latex: domainTex, stepId: 'domain' }] },
    { id: 'critical', title: 'Critical points', items: crit.map((c) => ({ id: `crit-${idNum(c.x)}`, label: kindLabel[c.kind], latex: pair(c.x, c.y), note: approxNote(c.x, c.y), verification: slopeVerified(c.x), stepId: `critical.${idNum(c.x)}`, marker: { x: c.x, y: c.y, kind: c.kind } })), emptyText: 'None found on the scanned range.' },
    { id: 'inflection', title: 'Inflection points', items: infl.map((p) => ({ id: `infl-${idNum(p.x)}`, label: 'Inflection point', latex: pair(p.x, p.y), note: approxNote(p.x, p.y), stepId: `inflection.${idNum(p.x)}`, marker: { x: p.x, y: p.y, kind: 'inflection' } })), emptyText: 'None found on the scanned range.' },
    { id: 'asymptotes', title: 'Holes and asymptotes', items: [...discItems, ...endItems], emptyText: 'None.' },
    { id: 'intercepts', title: 'Intercepts', items: interceptItems, emptyText: 'None.' },
    { id: 'behavior', title: 'Behavior', items: behaviorItems },
  );
  if (limitItems.length) sections.push({ id: 'limits', title: 'Limits', items: limitItems });
  if (pointItems.length) sections.push({ id: 'points', title: 'Point inspection', items: pointItems });
  if (intervalItems.length) sections.push({ id: 'interval', title: 'Interval', items: intervalItems });

  notices.push(`Mock engine (TypeScript): derivatives are symbolic; everything else is found numerically on [${min}, ${max}]. The Python backend will replace this.`);

  return {
    ok: true,
    engine: 'mock',
    input: req.expression,
    diagnostics: parsed.diagnostics,
    parsed: { latex: `${fx} = ${fTex}`, mainVar: v, params },
    plot: { f: ast, d1: d1r.node, d2: d2r.node, mainVar: v, paramValues },
    steps,
    sections,
    notices,
  };
}

function line(m: number, b: number, v: string): string {
  const mt = Math.abs(m) < 1e-12 ? '' : `${m === 1 ? '' : m === -1 ? '-' : decTex(m)}${v}`;
  if (Math.abs(b) < 1e-12) return mt || '0';
  if (!mt) return decTex(b);
  return b < 0 ? `${mt} - ${decTex(-b)}` : `${mt} + ${decTex(b)}`;
}

function readDetail(tokens: Token[], implicitAt: number[]): string {
  const shown = tokens.map((t) => {
    if (t.type === 'func') return t.fn;
    if (t.type === 'const') return t.name === 'pi' ? 'π' : 'e';
    return t.text;
  });
  const fns = [...new Set(tokens.filter((t) => t.type === 'func').map((t) => t.fn))];
  const consts = [...new Set(tokens.filter((t) => t.type === 'const').map((t) => (t.name === 'pi' ? 'π' : 'e')))];
  const lines = [`Tokens: ${shown.map((s) => `[${s}]`).join(' ')}`];
  if (implicitAt.length) lines.push(`Inserted ${implicitAt.length} implicit multiplication${implicitAt.length > 1 ? 's' : ''} (like 2x → 2·x).`);
  if (fns.length) lines.push(`Functions recognized: ${fns.join(', ')}.`);
  if (consts.length) lines.push(`Constants recognized: ${consts.join(', ')}.`);
  lines.push('This reading is treated as the original function — every later result is checked against it.');
  return lines.join('\n');
}

function evalLimitQuery(f: Compiled, q: LimitQuery, v: string, allowPi: boolean): { latex: string; note?: string; step: Step } {
  const sid = `limit-${q.id}`;
  const sup = q.side === 'left' ? '^{-}' : q.side === 'right' ? '^{+}' : '';
  const isInf = q.target === 'inf' || q.target === '-inf';
  const t = q.target === 'inf' ? Infinity : q.target === '-inf' ? -Infinity : q.target;
  const tTex = isInf ? (t > 0 ? '\\infty' : '-\\infty') : numLatex(t, allowPi).split(' \\approx')[0];
  const head = `\\lim_{${v} \\to ${tTex}${isInf ? '' : sup}} f(${v})`;

  if (isInf) {
    const S = sideLimit(f, t, 1);
    return {
      latex: `${head} = ${limitTex(S.value, allowPi)}`,
      step: { id: sid, title: `Limit as ${v} → ${t > 0 ? '∞' : '−∞'}`, latex: `${head} = ${limitTex(S.value, allowPi)}`, detail: 'Evaluated the original at larger and larger values.', children: [{ id: `${sid}.table`, title: 'Values', latex: tableTex(S.table, v) }] },
    };
  }

  const direct = f(t);
  const L = sideLimit(f, t, -1);
  const R = sideLimit(f, t, 1);
  let value: LimitValue;
  let note: string | undefined;
  if (q.side === 'left') value = L.value;
  else if (q.side === 'right') value = R.value;
  else if (sameLimit(L.value, R.value)) value = L.value.kind === 'finite' && R.value.kind === 'finite' ? { kind: 'finite', value: (L.value.value + R.value.value) / 2 } : L.value;
  else if (L.value.kind === 'undefined' && R.value.kind !== 'undefined') {
    value = R.value;
    note = 'Only the right side is in the domain, so this is the one-sided limit.';
  } else if (R.value.kind === 'undefined' && L.value.kind !== 'undefined') {
    value = L.value;
    note = 'Only the left side is in the domain, so this is the one-sided limit.';
  } else {
    value = { kind: 'dne', reason: 'the left and right limits differ' };
    note = 'Left and right sides approach different values.';
  }

  const continuous = Number.isFinite(direct) && value.kind === 'finite' && Math.abs(direct - value.value) <= 1e-4 * (1 + Math.abs(direct));
  const children: Step[] = [
    {
      id: `${sid}.direct`,
      title: 'Try direct substitution',
      latex: Number.isFinite(direct) ? `f(${tTex}) = ${numLatex(direct, allowPi)}` : `f(${tTex}) \\text{ is undefined}`,
      detail: Number.isFinite(direct)
        ? continuous ? 'It works — f is continuous here, so the limit equals the value.' : 'f has a value here, but the nearby values disagree, so check both sides.'
        : 'Substitution fails (like 0/0 or division by zero), so look at values close by.',
    },
  ];
  if (q.side !== 'right') children.push({ id: `${sid}.left`, title: 'Approach from the left', latex: tableTex(L.table, v) });
  if (q.side !== 'left') children.push({ id: `${sid}.right`, title: 'Approach from the right', latex: tableTex(R.table, v) });
  children.push({ id: `${sid}.result`, title: 'Conclusion', latex: `${head} = ${limitTex(value, allowPi)}`, detail: value.kind === 'dne' ? `It doesn't exist because ${value.reason}.` : note });

  return {
    latex: `${head} = ${limitTex(value, allowPi)}`,
    note: note ?? (continuous ? 'Direct substitution' : value.kind === 'finite' ? 'Numeric estimate from both sides' : undefined),
    step: { id: sid, title: `Limit as ${v} → ${fmt(t)}${q.side === 'left' ? '⁻' : q.side === 'right' ? '⁺' : ''}`, form: 'original', latex: `${head} = ${limitTex(value, allowPi)}`, children },
  };
}
