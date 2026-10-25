import type { FnName, Node } from '../types';

const FN_TEX: Record<FnName, string> = {
  sin: '\\sin', cos: '\\cos', tan: '\\tan', sec: '\\sec', csc: '\\csc', cot: '\\cot',
  asin: '\\arcsin', acos: '\\arccos', atan: '\\arctan',
  sinh: '\\sinh', cosh: '\\cosh', tanh: '\\tanh',
  asinh: '\\operatorname{arsinh}', acosh: '\\operatorname{arcosh}', atanh: '\\operatorname{artanh}',
  sqrt: '\\sqrt', cbrt: '\\sqrt[3]', abs: '\\operatorname{abs}', exp: '\\exp', ln: '\\ln', log: '\\log',
};

export function numTex(v: number): string {
  if (Number.isInteger(v)) return String(v);
  const s = String(parseFloat(v.toPrecision(10)));
  if (s.includes('e')) {
    const [m, e] = s.split('e');
    return `${m} \\times 10^{${parseInt(e, 10)}}`;
  }
  return s;
}

const wrap = (s: string) => `\\left(${s}\\right)`;

function prec(n: Node): number {
  switch (n.type) {
    case 'num':
      return n.value < 0 ? 15 : 100;
    case 'var':
    case 'const':
    case 'call':
      return 100;
    case 'neg':
      return 15;
    case 'bin':
      if (n.op === '+' || n.op === '-') return 10;
      if (n.op === '^') return 30;
      if (n.op === '/') return 90; // \frac is visually self-contained
      return 20;
  }
}

function tex(n: Node, ctx: number): string {
  const s = raw(n);
  return prec(n) < ctx ? wrap(s) : s;
}

function raw(n: Node): string {
  switch (n.type) {
    case 'num':
      return numTex(n.value);
    case 'var':
      return n.name;
    case 'const':
      return n.name === 'pi' ? '\\pi' : 'e';
    case 'neg':
      return `-${tex(n.arg, 20)}`;
    case 'call': {
      const a = tex(n.arg, 0);
      switch (n.fn) {
        case 'sqrt':
          return `\\sqrt{${a}}`;
        case 'cbrt':
          return `\\sqrt[3]{${a}}`;
        case 'abs':
          return `\\left|${a}\\right|`;
        case 'exp':
          return `e^{${a}}`;
        default:
          return `${FN_TEX[n.fn]}${wrap(a)}`;
      }
    }
    case 'bin': {
      const { left, right } = n;
      switch (n.op) {
        case '+':
          if (right.type === 'neg') return `${tex(left, 10)} - ${tex(right.arg, 11)}`;
          if (right.type === 'num' && right.value < 0) return `${tex(left, 10)} - ${numTex(-right.value)}`;
          return `${tex(left, 10)} + ${tex(right, 10)}`;
        case '-':
          return `${tex(left, 10)} - ${tex(right, 11)}`;
        case '*': {
          const l = tex(left, 20);
          const r = tex(right, 20);
          const dot = /^[\d.\-]/.test(r) || (/^\\frac/.test(r) && /\}$/.test(l));
          return dot ? `${l} \\cdot ${r}` : `${l} ${r}`;
        }
        case '/':
          return `\\frac{${tex(left, 0)}}{${tex(right, 0)}}`;
        case '^': {
          const b = left;
          const atomic = (b.type === 'num' && b.value >= 0) || b.type === 'var' || b.type === 'const';
          return `${atomic ? raw(b) : wrap(raw(b))}^{${tex(right, 0)}}`;
        }
      }
    }
  }
}

export function toTex(n: Node): string {
  return tex(n, 0);
}

/** Structural key — two nodes with the same key are the same expression. */
export function nodeKey(n: Node): string {
  return toTex(n);
}
