/** Numeric helpers for the mock engine: root finding, limits, exact-form recognition. */
import type { Compiled } from '../evaluate';
import { numTex } from './latex';

export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Snap tiny float noise: 0.9999999999 → 1, 1e-17 → 0. */
export function snap(x: number): number {
  if (Math.abs(x) < 1e-10) return 0;
  const r = Math.round(x);
  if (Math.abs(x - r) < 1e-9 * Math.max(1, Math.abs(x))) return r;
  return x;
}

/**
 * Find zeros of g on [a, b]: sign changes (refined by bisection) plus
 * "touching" zeros like x² at 0 (refined by golden-section search on |g|).
 * Sign changes across a pole are rejected because |g| blows up there.
 */
export function findRoots(g: Compiled, a: number, b: number, n = 4000): number[] {
  const h = (b - a) / n;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i <= n; i++) {
    const x = a + i * h;
    xs.push(x);
    ys.push(g(x));
  }
  const roots: number[] = [];
  const ok = (y: number) => Number.isFinite(y);

  for (let i = 0; i <= n; i++) if (ok(ys[i]) && ys[i] === 0) roots.push(xs[i]);

  for (let i = 0; i < n; i++) {
    const y0 = ys[i];
    const y1 = ys[i + 1];
    if (!ok(y0) || !ok(y1) || y0 === 0 || y1 === 0 || Math.sign(y0) === Math.sign(y1)) continue;
    let lo = xs[i];
    let hi = xs[i + 1];
    let glo = y0;
    for (let k = 0; k < 80; k++) {
      const mid = (lo + hi) / 2;
      const gm = g(mid);
      if (!ok(gm)) break;
      if (gm === 0) {
        lo = hi = mid;
        break;
      }
      if (Math.sign(gm) === Math.sign(glo)) {
        lo = mid;
        glo = gm;
      } else hi = mid;
    }
    const r = (lo + hi) / 2;
    const gr = g(r);
    if (ok(gr) && Math.abs(gr) < 1e-6 * (1 + Math.min(Math.abs(y0), Math.abs(y1)))) roots.push(r);
  }

  const phi = (Math.sqrt(5) - 1) / 2;
  for (let i = 1; i < n; i++) {
    const [y0, y1, y2] = [ys[i - 1], ys[i], ys[i + 1]];
    if (!ok(y0) || !ok(y1) || !ok(y2)) continue;
    if (Math.sign(y0) !== Math.sign(y2) || y1 === 0) continue;
    if (!(Math.abs(y1) <= Math.abs(y0) && Math.abs(y1) <= Math.abs(y2))) continue;
    let lo = xs[i - 1];
    let hi = xs[i + 1];
    const f = (x: number) => Math.abs(g(x));
    for (let k = 0; k < 100; k++) {
      const c = hi - phi * (hi - lo);
      const d = lo + phi * (hi - lo);
      if (f(c) < f(d)) hi = d;
      else lo = c;
    }
    const m = (lo + hi) / 2;
    if (Math.abs(g(m)) < 1e-9) roots.push(m);
  }

  roots.sort((p, q) => p - q);
  const out: number[] = [];
  for (const r of roots) {
    const s = snap(r);
    if (!out.length || Math.abs(s - out[out.length - 1]) > 1e-6 * (1 + Math.abs(s))) out.push(s);
  }
  return out;
}

/**
 * True when g is zero everywhere up to float noise (e.g. f″ of a function
 * whose second derivative cancels to 0). Root finding on noise is meaningless.
 */
export function isNoiseZero(g: Compiled, a: number, b: number): boolean {
  let finite = 0;
  let tiny = 0;
  for (let i = 0; i <= 400; i++) {
    const y = g(a + ((b - a) * i) / 400);
    if (!Number.isFinite(y)) continue;
    finite++;
    if (Math.abs(y) < 1e-6) tiny++;
  }
  return finite > 0 && tiny / finite > 0.9;
}

/** Decimal for display. */
export function fmt(v: number, sig = 6): string {
  if (Number.isNaN(v)) return 'undefined';
  if (!Number.isFinite(v)) return v > 0 ? '∞' : '−∞';
  if (Math.abs(v) < 1e-12) return '0';
  const a = Math.abs(v);
  if (a >= 1e7 || a < 1e-5) return v.toExponential(3);
  return String(parseFloat(v.toPrecision(sig)));
}

export function decTex(v: number, sig = 6): string {
  if (Math.abs(v) < 1e-12) return '0';
  return numTex(parseFloat(v.toPrecision(sig)));
}

const SQUAREFREE = [2, 3, 5, 6, 7, 10, 11, 13, 14, 15, 17, 19, 21, 22, 23, 26, 29, 30];

/** Recognize simple exact forms: integers, p/q, p·π/q, p·√k/q. */
export function recognize(v: number, allowPi: boolean, tol = 1e-9): string | null {
  if (!Number.isFinite(v)) return null;
  const close = (target: number) => Math.abs(v - target) <= tol * Math.max(1, Math.abs(target));
  const frac = (p: number, q: number, sym: string) => {
    const sign = p < 0 ? '-' : '';
    const ap = Math.abs(p);
    const top = sym ? (ap === 1 ? sym : `${ap}${sym}`) : `${ap}`;
    return q === 1 ? sign + top : `${sign}\\frac{${top}}{${q}}`;
  };
  if (close(Math.round(v))) return String(Math.round(v));
  for (let q = 2; q <= 12; q++) {
    const p = Math.round(v * q);
    if (Math.abs(p) <= 1000 && gcd(Math.abs(p), q) === 1 && close(p / q)) return frac(p, q, '');
  }
  if (allowPi) {
    for (let q = 1; q <= 12; q++) {
      const p = Math.round((v * q) / Math.PI);
      if (p !== 0 && Math.abs(p) <= 48 && gcd(Math.abs(p), q) === 1 && close((p * Math.PI) / q)) return frac(p, q, '\\pi');
    }
  }
  for (const k of SQUAREFREE) {
    const r = Math.sqrt(k);
    for (let q = 1; q <= 6; q++) {
      const p = Math.round((v * q) / r);
      if (p !== 0 && Math.abs(p) <= 6 && gcd(Math.abs(p), q) === 1 && close((p * r) / q)) return frac(p, q, `\\sqrt{${k}}`);
    }
  }
  return null;
}

/** LaTeX for a number: exact form when recognized, plus ≈ decimal. */
export function numLatex(v: number, allowPi: boolean, tol = 1e-9): string {
  if (Number.isNaN(v)) return '\\text{undefined}';
  if (!Number.isFinite(v)) return v > 0 ? '\\infty' : '-\\infty';
  const rec = recognize(v, allowPi, tol);
  const dec = decTex(v);
  if (rec === null) return dec;
  if (/^-?\d+$/.test(rec) || rec === dec) return rec;
  return `${rec} \\approx ${dec}`;
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

export type LimitValue =
  | { kind: 'finite'; value: number }
  | { kind: 'inf'; sign: 1 | -1 }
  | { kind: 'dne'; reason: string }
  | { kind: 'undefined' };

export interface SideLimit {
  value: LimitValue;
  table: [number, number][];
}

/**
 * Approach `target` from one side (dir = -1 left, +1 right), or approach ±∞
 * (target = ±Infinity). Short sequence (k ≤ 7) decides convergence; a longer
 * one (k ≤ 15) decides slow divergence like ln(x) → −∞.
 */
export function sideLimit(f: Compiled, target: number, dir: -1 | 1): SideLimit {
  const atInf = !Number.isFinite(target);
  const scale = atInf ? 1 : Math.max(1, Math.abs(target));
  const xAt = (k: number) => (atInf ? Math.sign(target) * Math.pow(10, k) : target + dir * scale * Math.pow(10, -k));
  const short: [number, number][] = [];
  for (let k = 1; k <= 7; k++) short.push([xAt(k), f(xAt(k))]);
  // Past ~1e-12 relative, float rounding swamps the signal, so stop there.
  const long: number[] = [];
  for (let k = 1; k <= 12; k++) long.push(f(xAt(k)));

  const ys = short.map((p) => p[1]);
  const [a, b, c] = ys.slice(-3);
  if (![a, b, c].every(Number.isFinite)) return { value: { kind: 'undefined' }, table: short };

  if (Math.abs(c - b) <= 1e-4 * (1 + Math.abs(b)) && Math.abs(c - b) <= Math.abs(b - a) + 1e-9) {
    return { value: { kind: 'finite', value: c }, table: short };
  }

  const tail = long.slice(-7).filter(Number.isFinite);
  if (tail.length === 7) {
    const d = tail.slice(1).map((y, i) => y - tail[i]);
    const mono = d.every((x) => x > 0) || d.every((x) => x < 0);
    const notShrinking = Math.abs(d[d.length - 1]) >= 0.5 * Math.abs(d[d.length - 2]);
    const last = tail[tail.length - 1];
    if (mono && notShrinking && Math.abs(last) > 10 && Math.sign(d[0]) === Math.sign(last)) {
      return { value: { kind: 'inf', sign: last > 0 ? 1 : -1 }, table: short };
    }
  }
  return { value: { kind: 'dne', reason: 'the values keep oscillating instead of settling' }, table: short };
}

export function sameLimit(p: LimitValue, q: LimitValue): boolean {
  if (p.kind === 'finite' && q.kind === 'finite') return Math.abs(p.value - q.value) <= 1e-4 * (1 + Math.abs(p.value));
  if (p.kind === 'inf' && q.kind === 'inf') return p.sign === q.sign;
  return false;
}

export function limitTex(v: LimitValue, allowPi: boolean): string {
  switch (v.kind) {
    case 'finite':
      return numLatex(v.value, allowPi, 1e-6);
    case 'inf':
      return v.sign > 0 ? '\\infty' : '-\\infty';
    case 'dne':
      return '\\text{does not exist}';
    case 'undefined':
      return '\\text{undefined (no values to approach from)}';
  }
}

export function tableTex(table: [number, number][], v: string): string {
  const rows = table.map(([x, y]) => `${decTex(x, 8)} & ${Number.isFinite(y) ? decTex(y, 8) : '\\text{undef}'}`).join(' \\\\ ');
  return `\\begin{array}{r|l} ${v} & f(${v}) \\\\ \\hline ${rows} \\end{array}`;
}

/** Composite Simpson's rule; NaN if f is undefined anywhere on the samples. */
export function simpson(f: Compiled, a: number, b: number, n = 2000): number {
  if (n % 2) n++;
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let i = 1; i < n; i++) s += f(a + i * h) * (i % 2 ? 4 : 2);
  return (s * h) / 3;
}
