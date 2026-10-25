/**
 * Symbolic differentiation that logs each rule it applies as a Step.
 * Step ids follow the shape of the tree (deriv1, deriv1.0, deriv1.0.1 …) so
 * the same function always produces the same ids — the diff view relies on it.
 */
import { containsVar } from '../evaluate';
import type { FnName, Node, Step } from '../types';
import { toTex } from './latex';
import { bin, call, neg, num, simplify } from './simplify';

const FN_LABEL: Partial<Record<FnName, string>> = { asin: 'arcsin', acos: 'arccos', atan: 'arctan', sqrt: '√' };

/** Derivative of the outer function, evaluated at u. */
function outer(fn: FnName, u: Node, logBase10: boolean): { d: Node; condition?: string } {
  const one = num(1);
  switch (fn) {
    case 'sin': return { d: call('cos', u) };
    case 'cos': return { d: neg(call('sin', u)) };
    case 'tan': return { d: bin('^', call('sec', u), num(2)) };
    case 'sec': return { d: bin('*', call('sec', u), call('tan', u)) };
    case 'csc': return { d: neg(bin('*', call('csc', u), call('cot', u))) };
    case 'cot': return { d: neg(bin('^', call('csc', u), num(2))) };
    case 'asin': return { d: bin('/', one, call('sqrt', bin('-', one, bin('^', u, num(2))))) };
    case 'acos': return { d: neg(bin('/', one, call('sqrt', bin('-', one, bin('^', u, num(2)))))) };
    case 'atan': return { d: bin('/', one, bin('+', one, bin('^', u, num(2)))) };
    case 'sinh': return { d: call('cosh', u) };
    case 'cosh': return { d: call('sinh', u) };
    case 'tanh': return { d: bin('/', one, bin('^', call('cosh', u), num(2))) };
    case 'asinh': return { d: bin('/', one, call('sqrt', bin('+', bin('^', u, num(2)), one))) };
    case 'acosh': return { d: bin('/', one, call('sqrt', bin('-', bin('^', u, num(2)), one))) };
    case 'atanh': return { d: bin('/', one, bin('-', one, bin('^', u, num(2)))) };
    case 'sqrt': return { d: bin('/', one, bin('*', num(2), call('sqrt', u))) };
    case 'cbrt': return { d: bin('/', one, bin('*', num(3), bin('^', call('cbrt', u), num(2)))) };
    case 'abs': return { d: bin('/', u, call('abs', u)), condition: `${toTex(u)} \\neq 0` };
    case 'exp': return { d: call('exp', u) };
    case 'ln': return { d: bin('/', one, u) };
    case 'log':
      return logBase10
        ? { d: bin('/', one, bin('*', u, call('ln', num(10)))) }
        : { d: bin('/', one, u) };
  }
}

export interface DerivativeResult {
  node: Node;
  step: Step;
}

export function derivative(f: Node, v: string, id: string, title: string, logBase10: boolean): DerivativeResult {
  const dx = `\\frac{d}{d${v}}`;
  const has = (n: Node) => containsVar(n, v);
  const isV = (n: Node) => n.type === 'var' && n.name === v;
  const pretty = (n: Node) => toTex(simplify(n).node);

  type R = { d: Node; step?: Step };

  const mk = (n: Node, d: Node, path: string, rule: string, detail?: string, children: (Step | undefined)[] = [], condition?: string): Step => {
    const kids = children.filter((c): c is Step => !!c);
    return {
      id: path,
      title: rule,
      latex: `${dx}\\left[${toTex(n)}\\right] = ${pretty(d)}`,
      detail,
      condition,
      children: kids.length ? kids : undefined,
    };
  };

  const go = (n: Node, path: string): R => {
    if (!has(n)) {
      const d = num(0);
      if (n.type === 'num' || n.type === 'const' || n.type === 'var') return { d };
      return { d, step: mk(n, d, path, 'Constant rule', `Contains no ${v}, so its derivative is 0.`) };
    }
    switch (n.type) {
      case 'var':
        return { d: num(1) };
      case 'neg': {
        const a = go(n.arg, `${path}.0`);
        const d = neg(a.d);
        return { d, step: mk(n, d, path, 'Constant multiple (−1)', '(−u)′ = −u′', [a.step]) };
      }
      case 'bin': {
        const { left: u, right: w } = n;
        switch (n.op) {
          case '+':
          case '-': {
            const a = go(u, `${path}.0`);
            const b = go(w, `${path}.1`);
            const d = bin(n.op, a.d, b.d);
            return {
              d,
              step: mk(n, d, path, n.op === '+' ? 'Sum rule' : 'Difference rule', 'Differentiate each term separately.', [a.step, b.step]),
            };
          }
          case '*': {
            if (!has(u)) {
              const b = go(w, `${path}.1`);
              const d = bin('*', u, b.d);
              return { d, step: mk(n, d, path, 'Constant multiple rule', '(c·u)′ = c·u′', [b.step]) };
            }
            if (!has(w)) {
              const a = go(u, `${path}.0`);
              const d = bin('*', w, a.d);
              return { d, step: mk(n, d, path, 'Constant multiple rule', '(u·c)′ = c·u′', [a.step]) };
            }
            const a = go(u, `${path}.0`);
            const b = go(w, `${path}.1`);
            const d = bin('+', bin('*', a.d, w), bin('*', u, b.d));
            return { d, step: mk(n, d, path, 'Product rule', '(u·v)′ = u′·v + u·v′', [a.step, b.step]) };
          }
          case '/': {
            if (!has(w)) {
              const a = go(u, `${path}.0`);
              const d = bin('/', a.d, w);
              return { d, step: mk(n, d, path, 'Constant divisor', '(u/c)′ = u′/c', [a.step]) };
            }
            const a = go(u, `${path}.0`);
            const b = go(w, `${path}.1`);
            const d = bin('/', bin('-', bin('*', a.d, w), bin('*', u, b.d)), bin('^', w, num(2)));
            return { d, step: mk(n, d, path, 'Quotient rule', '(u/v)′ = (u′·v − u·v′) / v²', [a.step, b.step]) };
          }
          case '^': {
            if (has(u) && !has(w)) {
              const a = go(u, `${path}.0`);
              const core = bin('*', w, bin('^', u, bin('-', w, num(1))));
              const d = isV(u) ? core : bin('*', core, a.d);
              return {
                d,
                step: mk(n, d, path, isV(u) ? 'Power rule' : 'Power rule + chain rule',
                  isV(u) ? '(xⁿ)′ = n·xⁿ⁻¹' : '(uⁿ)′ = n·uⁿ⁻¹·u′', [a.step]),
              };
            }
            if (!has(u) && has(w)) {
              const b = go(w, `${path}.1`);
              const isE = u.type === 'const' && u.name === 'e';
              const core = isE ? n : bin('*', n, call('ln', u));
              const d = isV(w) ? core : bin('*', core, b.d);
              return {
                d,
                step: mk(n, d, path, isE ? 'Exponential rule' : 'Exponential rule (aᵘ)',
                  isE ? '(eᵘ)′ = eᵘ·u′' : '(aᵘ)′ = aᵘ·ln(a)·u′', [b.step]),
              };
            }
            const a = go(u, `${path}.0`);
            const b = go(w, `${path}.1`);
            const d = bin('*', n, bin('+', bin('*', b.d, call('ln', u)), bin('/', bin('*', w, a.d), u)));
            return {
              d,
              step: mk(n, d, path, 'Logarithmic differentiation', '(fᵍ)′ = fᵍ·(g′·ln f + g·f′/f)', [a.step, b.step], `${toTex(u)} > 0`),
            };
          }
        }
        break;
      }
      case 'call': {
        const a = go(n.arg, `${path}.0`);
        const o = outer(n.fn, n.arg, logBase10);
        const d = isV(n.arg) ? o.d : bin('*', o.d, a.d);
        const label = FN_LABEL[n.fn] ?? n.fn;
        return {
          d,
          step: mk(n, d, path, isV(n.arg) ? `Derivative of ${label}` : `Chain rule (${label})`,
            isV(n.arg) ? undefined : 'Outer derivative at the inside, times the derivative of the inside.',
            [a.step], o.condition),
        };
      }
    }
    return { d: num(0) };
  };

  const r = go(f, `${id}.r`);
  const node = simplify(r.d).node;
  const step: Step = {
    id,
    title,
    latex: `${dx}\\left[${toTex(f)}\\right] = ${toTex(node)}`,
    form: 'simplified',
    children: r.step ? [r.step] : undefined,
  };
  return { node, step };
}
