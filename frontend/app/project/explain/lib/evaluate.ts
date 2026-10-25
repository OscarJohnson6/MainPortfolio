import type { EngineSettings, FnName, Node, PiMode } from './types';

/** Numeric value of π for the chosen precision mode. */
export function piValue(mode: PiMode): number {
  if (mode === '3.14') return 3.14;
  if (mode === '3') return 3;
  return Math.PI;
}

type Fn1 = (v: number) => number;

export function fnTable(settings: EngineSettings): Record<FnName, Fn1> {
  return {
    sin: Math.sin,
    cos: Math.cos,
    // cos(π/2) is 6e-17 in floating point, not 0 — treat that as a true zero.
    tan: (v) => (Math.abs(Math.cos(v)) < 1e-15 ? NaN : Math.tan(v)),
    sec: (v) => (Math.abs(Math.cos(v)) < 1e-15 ? NaN : 1 / Math.cos(v)),
    csc: (v) => (Math.abs(Math.sin(v)) < 1e-15 ? NaN : 1 / Math.sin(v)),
    cot: (v) => (Math.abs(Math.sin(v)) < 1e-15 ? NaN : Math.cos(v) / Math.sin(v)),
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    sinh: Math.sinh,
    cosh: Math.cosh,
    tanh: Math.tanh,
    asinh: Math.asinh,
    acosh: Math.acosh,
    atanh: Math.atanh,
    sqrt: Math.sqrt,
    cbrt: Math.cbrt,
    abs: Math.abs,
    exp: Math.exp,
    ln: Math.log,
    log: settings.logBase === '10' ? Math.log10 : Math.log,
  };
}

/** Real power: allows odd roots of negatives, e.g. (-8)^(1/3) = -2. */
export function realPow(b: number, e: number): number {
  if (b >= 0 || Number.isInteger(e)) return Math.pow(b, e);
  for (let q = 3; q <= 15; q += 2) {
    const p = e * q;
    if (Math.abs(p - Math.round(p)) < 1e-9) {
      const mag = Math.pow(-b, e);
      return Math.round(p) % 2 === 0 ? mag : -mag;
    }
  }
  return NaN;
}

export type Compiled = (x: number) => number;

/**
 * Compile an AST into a fast closure of the main variable.
 * Undefined results (division by zero, √ of a negative, …) come back as NaN.
 */
export function compile(
  node: Node,
  opts: { settings: EngineSettings; mainVar: string; params: Record<string, number> },
): Compiled {
  const fns = fnTable(opts.settings);
  const pi = piValue(opts.settings.piMode);

  const go = (n: Node): Compiled => {
    switch (n.type) {
      case 'num': {
        const v = n.value;
        return () => v;
      }
      case 'const': {
        const v = n.name === 'pi' ? pi : Math.E;
        return () => v;
      }
      case 'var': {
        if (n.name === opts.mainVar) return (x) => x;
        const v = opts.params[n.name] ?? NaN;
        return () => v;
      }
      case 'neg': {
        const a = go(n.arg);
        return (x) => -a(x);
      }
      case 'call': {
        const a = go(n.arg);
        const f = fns[n.fn];
        return (x) => f(a(x));
      }
      case 'bin': {
        const l = go(n.left);
        const r = go(n.right);
        switch (n.op) {
          case '+':
            return (x) => l(x) + r(x);
          case '-':
            return (x) => l(x) - r(x);
          case '*':
            return (x) => l(x) * r(x);
          case '/':
            return (x) => {
              const d = r(x);
              return d === 0 ? NaN : l(x) / d;
            };
          case '^':
            return (x) => realPow(l(x), r(x));
        }
      }
    }
  };

  const f = go(node);
  return (x) => {
    const y = f(x);
    return Number.isFinite(y) ? y : NaN;
  };
}

export function collectVars(n: Node, out = new Set<string>()): Set<string> {
  switch (n.type) {
    case 'var':
      out.add(n.name);
      break;
    case 'neg':
    case 'call':
      collectVars(n.arg, out);
      break;
    case 'bin':
      collectVars(n.left, out);
      collectVars(n.right, out);
      break;
  }
  return out;
}

export function containsVar(n: Node, v: string): boolean {
  switch (n.type) {
    case 'var':
      return n.name === v;
    case 'neg':
    case 'call':
      return containsVar(n.arg, v);
    case 'bin':
      return containsVar(n.left, v) || containsVar(n.right, v);
    default:
      return false;
  }
}
