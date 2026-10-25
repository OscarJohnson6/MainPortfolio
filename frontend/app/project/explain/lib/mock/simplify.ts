/**
 * Light simplifier. Every rule that is only valid on part of the domain
 * records a side condition, so the engine can trust the simplified form only
 * where the ORIGINAL function is defined.
 */
import type { BinOp, FnName, Node } from '../types';
import { nodeKey, toTex } from './latex';

export const num = (value: number): Node => ({ type: 'num', value });
export const neg = (arg: Node): Node => ({ type: 'neg', arg });
export const bin = (op: BinOp, left: Node, right: Node): Node => ({ type: 'bin', op, left, right });
export const call = (fn: FnName, arg: Node): Node => ({ type: 'call', fn, arg });

export interface Rewrite {
  rule: string;
  before: string;
  after: string;
  /** LaTeX side condition, if the rewrite is only valid on part of the domain. */
  condition?: string;
}

export interface SimplifyResult {
  node: Node;
  rewrites: Rewrite[];
}

const isNum = (n: Node): n is { type: 'num'; value: number } => n.type === 'num';
/** Not a type guard on purpose: "not 0" must not narrow to "not a number". */
const isN = (n: Node, v: number): boolean => n.type === 'num' && n.value === v;

/** Functions whose domain is all reals — dropping them never changes the domain. */
function isTotal(n: Node): boolean {
  switch (n.type) {
    case 'num':
    case 'const':
    case 'var':
      return true;
    case 'neg':
      return isTotal(n.arg);
    case 'call':
      return ['sin', 'cos', 'atan', 'sinh', 'cosh', 'tanh', 'asinh', 'abs', 'exp', 'cbrt'].includes(n.fn) && isTotal(n.arg);
    case 'bin':
      if (n.op === '/') return false;
      if (n.op === '^') return isTotal(n.left) && isNum(n.right) && Number.isInteger(n.right.value) && n.right.value >= 0;
      return isTotal(n.left) && isTotal(n.right);
  }
}

/** Rational constant (integer or integer/integer), as p/q in lowest terms. */
export function ratOf(n: Node): { p: number; q: number } | null {
  if (n.type === 'num') return Number.isInteger(n.value) ? { p: n.value, q: 1 } : null;
  if (n.type === 'neg') {
    const r = ratOf(n.arg);
    return r ? { p: -r.p, q: r.q } : null;
  }
  if (n.type === 'bin' && n.op === '/' && n.left.type === 'num' && n.right.type === 'num' &&
      Number.isInteger(n.left.value) && Number.isInteger(n.right.value) && n.right.value !== 0) {
    return reduce(n.left.value, n.right.value);
  }
  return null;
}

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
function reduce(p: number, q: number) {
  const g = gcd(p, q) || 1;
  const s = q < 0 ? -1 : 1;
  return { p: (s * p) / g, q: (s * q) / g };
}
function ratNode(r: { p: number; q: number }): Node {
  if (r.q === 1) return num(r.p);
  const f = bin('/', num(Math.abs(r.p)), num(r.q));
  return r.p < 0 ? neg(f) : f;
}
function foldRat(op: BinOp, l: Node, r: Node): Node | null {
  const a = ratOf(l);
  const b = ratOf(r);
  if (!a || !b || (a.q === 1 && b.q === 1)) return null;
  if (Math.abs(a.p) > 1e6 || Math.abs(b.p) > 1e6 || a.q > 1e6 || b.q > 1e6) return null;
  switch (op) {
    case '+': return ratNode(reduce(a.p * b.q + b.p * a.q, a.q * b.q));
    case '-': return ratNode(reduce(a.p * b.q - b.p * a.q, a.q * b.q));
    case '*': return ratNode(reduce(a.p * b.p, a.q * b.q));
    case '/': return b.p === 0 ? null : ratNode(reduce(a.p * b.q, a.q * b.p));
    default: return null;
  }
}

export function simplify(input: Node, track = false): SimplifyResult {
  const rewrites: Rewrite[] = [];
  const note = (rule: string, before: Node, after: Node, condition?: string) => {
    if (track) rewrites.push({ rule, before: toTex(before), after: toTex(after), condition });
  };

  const s = (n: Node): Node => {
    switch (n.type) {
      case 'num':
      case 'const':
      case 'var':
        return n;
      case 'neg': {
        const a = s(n.arg);
        if (isNum(a)) return num(-a.value);
        if (a.type === 'neg') return a.arg;
        return neg(a);
      }
      case 'call': {
        const a = s(n.arg);
        const out = call(n.fn, a);
        if (n.fn === 'exp' && a.type === 'call' && a.fn === 'ln') {
          note('e^{ln u} = u', out, a.arg, `${toTex(a.arg)} > 0`);
          return a.arg;
        }
        if (n.fn === 'ln' && a.type === 'call' && a.fn === 'exp') {
          note('ln(e^u) = u', out, a.arg);
          return a.arg;
        }
        if (n.fn === 'sqrt' && a.type === 'bin' && a.op === '^' && isN(a.right, 2)) {
          const r = call('abs', a.left);
          note('√(u²) = |u|', out, r);
          return r;
        }
        return out;
      }
      case 'bin': {
        const l = s(n.left);
        const r = s(n.right);
        const out = bin(n.op, l, r);
        const folded = foldRat(n.op, l, r);
        if (folded) return folded;
        switch (n.op) {
          case '+':
            if (isNum(l) && isNum(r)) return num(l.value + r.value);
            if (isN(l, 0)) return r;
            if (isN(r, 0)) return l;
            if (r.type === 'neg') return bin('-', l, r.arg);
            if (isNum(r) && r.value < 0) return bin('-', l, num(-r.value));
            if (l.type === 'neg') return bin('-', r, l.arg);
            return out;
          case '-':
            if (isNum(l) && isNum(r)) return num(l.value - r.value);
            if (isN(r, 0)) return l;
            if (isN(l, 0)) return neg(r);
            if (r.type === 'neg') return bin('+', l, r.arg);
            if (isNum(r) && r.value < 0) return bin('+', l, num(-r.value));
            return out;
          case '*': {
            if (isNum(l) && isNum(r)) return num(l.value * r.value);
            if (isN(l, 0) || isN(r, 0)) {
              const other = isN(l, 0) ? r : l;
              if (!isTotal(other)) note('0 · u = 0', out, num(0), `${toTex(other)} \\text{ is defined}`);
              return num(0);
            }
            if (isN(l, 1)) return r;
            if (isN(r, 1)) return l;
            if (isN(l, -1)) return neg(r);
            if (isN(r, -1)) return neg(l);
            if (l.type === 'neg') return neg(bin('*', l.arg, r));
            if (r.type === 'neg') return neg(bin('*', l, r.arg));
            if (isNum(r) && !isNum(l)) return bin('*', r, l);
            if (!isNum(l) && r.type === 'bin' && r.op === '*' && isNum(r.left)) {
              return bin('*', r.left, bin('*', l, r.right));
            }
            if (isNum(l) && r.type === 'bin' && r.op === '*' && isNum(r.left)) {
              return bin('*', num(l.value * r.left.value), r.right);
            }
            if (nodeKey(l) === nodeKey(r)) return bin('^', l, num(2));
            return out;
          }
          case '/': {
            if (isNum(l) && isNum(r) && r.value !== 0 && Number.isInteger(l.value / r.value)) return num(l.value / r.value);
            if (isN(r, 1)) return l;
            if (isN(l, 0) && !isNum(r)) {
              note('0 / u = 0', out, num(0), `${toTex(r)} \\neq 0`);
              return num(0);
            }
            if (l.type === 'neg') return neg(bin('/', l.arg, r));
            if (r.type === 'neg') return neg(bin('/', l, r.arg));
            if (isNum(l) && l.value < 0) return neg(bin('/', num(-l.value), r));
            if (!isNum(l) && nodeKey(l) === nodeKey(r)) {
              note('u / u = 1', out, num(1), `${toTex(r)} \\neq 0`);
              return num(1);
            }
            // (k·u)/u = k  and  (u·k)/u = k
            if (l.type === 'bin' && l.op === '*') {
              if (nodeKey(l.right) === nodeKey(r)) {
                note('cancel a common factor', out, l.left, `${toTex(r)} \\neq 0`);
                return l.left;
              }
              if (nodeKey(l.left) === nodeKey(r)) {
                note('cancel a common factor', out, l.right, `${toTex(r)} \\neq 0`);
                return l.right;
              }
            }
            return out;
          }
          case '^': {
            if (isNum(l) && isNum(r)) {
              const v = Math.pow(l.value, r.value);
              if (Number.isInteger(v) && Math.abs(v) < 1e9) return num(v);
              return out;
            }
            if (isN(r, 1)) return l;
            if (isN(l, 1)) return num(1);
            if (l.type === 'call' && l.fn === 'sqrt' && isN(r, 2)) {
              note('(√u)² = u', out, l.arg, `${toTex(l.arg)} \\ge 0`);
              return l.arg;
            }
            if (l.type === 'bin' && l.op === '^' && isNum(l.right) && isNum(r) &&
                Number.isInteger(l.right.value) && Number.isInteger(r.value)) {
              return bin('^', l.left, num(l.right.value * r.value));
            }
            return out;
          }
        }
      }
    }
  };

  let cur = input;
  for (let pass = 0; pass < 8; pass++) {
    const next = s(cur);
    if (nodeKey(next) === nodeKey(cur)) {
      cur = next;
      break;
    }
    cur = next;
  }
  return { node: cur, rewrites };
}
