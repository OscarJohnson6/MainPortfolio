/**
 * Mock tokenizer + Pratt parser. The Python backend will own the real parser;
 * this one exists so the frontend works standalone and to prototype the
 * diagnostics ("did you mean …") the real one should produce.
 */
import { collectVars } from '../evaluate';
import type { BinOp, Diagnostic, EngineSettings, FnName, Node, Suggestion } from '../types';

const FN_ALIASES: Record<string, FnName> = {
  sin: 'sin', cos: 'cos', tan: 'tan', sec: 'sec', csc: 'csc', cot: 'cot',
  asin: 'asin', acos: 'acos', atan: 'atan',
  arcsin: 'asin', arccos: 'acos', arctan: 'atan',
  sinh: 'sinh', cosh: 'cosh', tanh: 'tanh',
  asinh: 'asinh', acosh: 'acosh', atanh: 'atanh',
  sqrt: 'sqrt', cbrt: 'cbrt', abs: 'abs', exp: 'exp', ln: 'ln', log: 'log',
};
// Longest first so "asin" wins over "a"+"sin" and "sinh" over "sin"+"h".
const FN_NAMES = Object.keys(FN_ALIASES).sort((a, b) => b.length - a.length);

export type TokenType = 'num' | 'var' | 'const' | 'func' | 'op' | 'lparen' | 'rparen' | 'eq';

export interface Token {
  type: TokenType;
  text: string;
  start: number;
  end: number;
  value?: number;
  name?: string;
  fn?: FnName;
}

export class ParseError extends Error {
  constructor(
    message: string,
    public start: number,
    public end: number,
    public suggestion?: Suggestion,
    public code = 'parse-error',
  ) {
    super(message);
  }
}

export function tokenize(src: string, settings: EngineSettings): { tokens: Token[]; notes: Diagnostic[] } {
  const tokens: Token[] = [];
  const notes: Diagnostic[] = [];
  let i = 0;
  const push = (t: Token) => tokens.push(t);

  while (i < src.length) {
    const ch = src[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (/[0-9.]/.test(ch)) {
      const m = /^(\d+\.?\d*|\.\d+)/.exec(src.slice(i));
      if (!m) throw new ParseError(`Stray "." at position ${i + 1}`, i, i + 1, undefined, 'stray-dot');
      push({ type: 'num', text: m[0], start: i, end: i + m[0].length, value: parseFloat(m[0]) });
      i += m[0].length;
      continue;
    }

    if (/[a-zA-Z]/.test(ch)) {
      const run = /^[a-zA-Z]+/.exec(src.slice(i))![0];
      let j = 0;
      while (j < run.length) {
        const rest = run.slice(j);
        const start = i + j;
        const fn = FN_NAMES.find((n) => rest.startsWith(n));
        if (fn) {
          push({ type: 'func', text: fn, start, end: start + fn.length, fn: FN_ALIASES[fn] });
          j += fn.length;
        } else if (rest.startsWith('pi') && settings.recognizeConstants) {
          push({ type: 'const', text: 'pi', start, end: start + 2, name: 'pi' });
          j += 2;
        } else if (rest[0] === 'e' && settings.recognizeConstants) {
          push({ type: 'const', text: 'e', start, end: start + 1, name: 'e' });
          j += 1;
        } else {
          if (rest.startsWith('pi') && !settings.recognizeConstants) {
            notes.push({
              level: 'info',
              code: 'constants-off',
              message: 'Constants are off, so "pi" was read as p·i. Turn on "Recognize π and e" to use π.',
              start,
              end: start + 2,
            });
          }
          push({ type: 'var', text: rest[0], start, end: start + 1, name: rest[0] });
          j += 1;
        }
      }
      i += run.length;
      continue;
    }

    const one = (type: TokenType, text: string, extra: Partial<Token> = {}, len = 1) => {
      push({ type, text, start: i, end: i + len, ...extra });
      i += len;
    };

    switch (ch) {
      case '+':
        one('op', '+');
        break;
      case '-':
      case '−':
        one('op', '-');
        break;
      case '*':
        if (src[i + 1] === '*') one('op', '^', {}, 2);
        else one('op', '*');
        break;
      case '×':
      case '·':
      case '⋅':
      case '∙':
        one('op', '*');
        break;
      case '/':
      case '÷':
        one('op', '/');
        break;
      case '^':
        one('op', '^');
        break;
      case '(':
      case '[':
      case '{':
        one('lparen', '(');
        break;
      case ')':
      case ']':
      case '}':
        one('rparen', ')');
        break;
      case '=':
        one('eq', '=');
        break;
      case 'π':
        one('const', 'pi', { name: 'pi' });
        break;
      case '√':
        one('func', 'sqrt', { fn: 'sqrt' });
        break;
      case '|':
        throw new ParseError('Use abs(…) for absolute value — "|" isn\'t supported yet.', i, i + 1, undefined, 'pipe-abs');
      case ',':
        throw new ParseError('Commas aren\'t supported — each function takes one argument.', i, i + 1, undefined, 'comma');
      default:
        throw new ParseError(`Unknown character "${ch}"`, i, i + 1, {
          label: `Remove "${ch}"`,
          expression: src.slice(0, i) + src.slice(i + 1),
        }, 'unknown-char');
    }
  }
  return { tokens, notes };
}

const BP: Record<string, number> = { '+': 10, '-': 10, '*': 20, '/': 20, '^': 30 };
const IMPLICIT_BP = 20;
const PREFIX_BP = 25;
const OPERAND_START: TokenType[] = ['num', 'var', 'const', 'func', 'lparen'];

class Parser {
  private i = 0;
  readonly notes: Diagnostic[] = [];
  readonly implicitAt: number[] = [];
  private grouped = new WeakSet<Node>();

  constructor(
    private toks: Token[],
    private src: string,
  ) {}

  private peek() {
    return this.toks[this.i];
  }
  private advance() {
    return this.toks[this.i++];
  }

  parseAll(): Node {
    if (!this.toks.length) {
      throw new ParseError('Enter a function of x to get started.', 0, 0, undefined, 'empty');
    }
    const node = this.expr(0);
    const t = this.peek();
    if (t) {
      if (t.type === 'rparen') {
        throw new ParseError('Unmatched ")"', t.start, t.end, {
          label: 'Remove the extra ")"',
          expression: this.src.slice(0, t.start) + this.src.slice(t.end),
        }, 'unmatched-close');
      }
      throw new ParseError(`Unexpected "${t.text}"`, t.start, t.end);
    }
    return node;
  }

  private lbp(t: Token): number {
    if (t.type === 'op') return BP[t.text] ?? 0;
    if (OPERAND_START.includes(t.type)) return IMPLICIT_BP;
    return 0;
  }

  private expr(rbp: number): Node {
    let left = this.nud();
    for (;;) {
      const t = this.peek();
      if (!t) break;
      const lbp = this.lbp(t);
      if (lbp <= rbp) break;
      if (t.type === 'op') {
        this.advance();
        // ^ is right-associative: 2^3^2 = 2^(3^2)
        const right = this.expr(t.text === '^' ? lbp - 1 : lbp);
        left = { type: 'bin', op: t.text as BinOp, left, right };
      } else {
        if (left.type === 'bin' && left.op === '/' && !this.grouped.has(left)) {
          this.notes.push({
            level: 'info',
            code: 'ambiguous-division',
            message: `Read "…/${this.src.slice(t.start, t.end)}" left to right: a/b·c = (a/b)·c. Add parentheses if you meant a/(b·c).`,
            start: t.start,
            end: t.end,
          });
        }
        this.implicitAt.push(t.start);
        const right = this.expr(IMPLICIT_BP);
        left = { type: 'bin', op: '*', left, right, implicit: true };
      }
    }
    return left;
  }

  private nud(): Node {
    const t = this.advance();
    if (!t) {
      const end = this.src.length;
      throw new ParseError('The expression ends too early — something is missing at the end.', end, end, undefined, 'unexpected-end');
    }
    switch (t.type) {
      case 'num':
        return { type: 'num', value: t.value! };
      case 'var':
        return { type: 'var', name: t.name! };
      case 'const':
        return { type: 'const', name: t.name as 'pi' | 'e' };
      case 'func': {
        const nx = this.peek();
        if (nx && nx.type === 'lparen') {
          this.advance();
          const close = this.peek();
          if (close && close.type === 'rparen') {
            throw new ParseError(`${t.text}() needs something inside the parentheses`, nx.start, close.end, undefined, 'empty-call');
          }
          const arg = this.expr(0);
          this.expectClose(nx);
          return { type: 'call', fn: t.fn!, arg };
        }
        if (!nx) {
          throw new ParseError(`${t.text} needs an argument, like ${t.text}(x)`, t.start, t.end, {
            label: `Use ${t.text}(x)`,
            expression: this.src.slice(0, t.end) + '(x)' + this.src.slice(t.end),
          }, 'missing-arg');
        }
        const before = this.i;
        // "sin 2x" → sin(2x), but "sin x cos x" → sin(x)·cos(x):
        // a bare argument absorbs numbers/variables/constants, not functions or "(".
        let arg = this.expr(PREFIX_BP);
        for (;;) {
          const nt = this.peek();
          if (!nt || !(nt.type === 'num' || nt.type === 'var' || nt.type === 'const')) break;
          this.implicitAt.push(nt.start);
          arg = { type: 'bin', op: '*', left: arg, right: this.expr(PREFIX_BP), implicit: true };
        }
        const last = this.toks[this.i - 1] ?? this.toks[before];
        this.notes.push({
          level: 'info',
          code: 'bare-function',
          message: `Read "${this.src.slice(t.start, last.end)}" as ${t.text}(${this.src.slice(this.toks[before].start, last.end)}) — add parentheses to be explicit.`,
          start: t.start,
          end: last.end,
        });
        return { type: 'call', fn: t.fn!, arg };
      }
      case 'lparen': {
        const nx = this.peek();
        if (nx && nx.type === 'rparen') throw this.emptyParens(this.i - 1, nx);
        const inner = this.expr(0);
        this.expectClose(t);
        this.grouped.add(inner);
        return inner;
      }
      case 'op':
        if (t.text === '-') return { type: 'neg', arg: this.expr(PREFIX_BP) };
        if (t.text === '+') return this.expr(PREFIX_BP);
        throw new ParseError(`"${t.text}" needs a value before it`, t.start, t.end, undefined, 'missing-operand');
      case 'rparen':
        throw new ParseError('")" with nothing before it', t.start, t.end, undefined, 'unexpected-close');
      case 'eq':
        throw new ParseError('Unexpected "="', t.start, t.end, undefined, 'unexpected-eq');
    }
  }

  private expectClose(open: Token) {
    const t = this.peek();
    if (!t || t.type !== 'rparen') {
      throw new ParseError('Missing ")"', open.start, open.end, {
        label: 'Add the missing ")" at the end',
        expression: this.src.trimEnd() + ')',
      }, 'missing-close');
    }
    this.advance();
  }

  /** `x^2()5` → suggest wrapping the term before the parens: `(x^2)5`. */
  private emptyParens(openIdx: number, close: Token): ParseError {
    const open = this.toks[openIdx];
    let k = openIdx - 1;
    while (k >= 0) {
      const tk = this.toks[k];
      if (tk.type === 'num' || tk.type === 'var' || tk.type === 'const' || (tk.type === 'op' && tk.text === '^')) k--;
      else break;
    }
    const first = this.toks[k + 1];
    let suggestion: Suggestion;
    if (k + 1 < openIdx && first && !(first.type === 'op')) {
      const expr =
        this.src.slice(0, first.start) +
        '(' + this.src.slice(first.start, open.start).trimEnd() + ')' +
        this.src.slice(close.end);
      suggestion = { label: `Did you mean "${expr}"?`, expression: expr };
    } else {
      const expr = this.src.slice(0, open.start) + this.src.slice(close.end);
      suggestion = { label: 'Remove the empty "()"', expression: expr };
    }
    return new ParseError('Empty parentheses "()"', open.start, close.end, suggestion, 'empty-parens');
  }
}

export type ParseOutput =
  | {
      ok: true;
      ast: Node;
      mainVar: string;
      params: string[];
      tokens: Token[];
      implicitAt: number[];
      diagnostics: Diagnostic[];
    }
  | { ok: false; diagnostics: Diagnostic[] };

function fromError(e: ParseError): Diagnostic {
  return { level: 'error', code: e.code, message: e.message, start: e.start, end: e.end, suggestion: e.suggestion };
}

export function parseInput(src: string, settings: EngineSettings): ParseOutput {
  const diagnostics: Diagnostic[] = [];
  let tokens: Token[];
  try {
    const t = tokenize(src, settings);
    tokens = t.tokens;
    diagnostics.push(...t.notes);
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, diagnostics: [fromError(e)] };
    throw e;
  }

  let body = tokens;
  let declaredVar: string | undefined;
  const eqs = tokens.filter((t) => t.type === 'eq');

  if (eqs.length > 1) {
    return {
      ok: false,
      diagnostics: [{ level: 'error', code: 'multiple-eq', message: 'Only one "=" is allowed.', start: eqs[1].start, end: eqs[1].end }],
    };
  }

  if (eqs.length === 1) {
    const eqIdx = tokens.indexOf(eqs[0]);
    const lhs = tokens.slice(0, eqIdx);
    body = tokens.slice(eqIdx + 1);
    const lhsText = src.slice(0, eqs[0].start).trim();
    const rhsText = src.slice(eqs[0].end).trim();

    if (!body.length) {
      return { ok: false, diagnostics: [{ level: 'error', code: 'empty-rhs', message: 'Nothing after "=".', start: eqs[0].start, end: eqs[0].end }] };
    }

    const isCall =
      lhs.length >= 4 &&
      lhs[0].type === 'var' &&
      lhs[1].type === 'lparen' &&
      lhs[lhs.length - 1].type === 'rparen';
    const inner = isCall ? lhs.slice(2, -1) : [];

    if (lhs.length === 1 && lhs[0].type === 'var' && lhs[0].name === 'y') {
      diagnostics.push({ level: 'info', code: 'y-definition', message: 'Read "y = …" as the function to analyze.' });
    } else if (isCall && inner.length === 1 && inner[0].type === 'var') {
      declaredVar = inner[0].name;
      diagnostics.push({
        level: 'info',
        code: 'function-definition',
        message: `Read "${lhsText} = …" as a function of ${declaredVar}.`,
      });
    } else if (
      isCall &&
      ((inner.length === 1 && inner[0].type === 'num') ||
        (inner.length === 2 && inner[0].type === 'op' && inner[0].text === '-' && inner[1].type === 'num'))
    ) {
      const value = inner.length === 1 ? inner[0].value! : -inner[1].value!;
      const varTok = body.find((t) => t.type === 'var' && t.name === 'x') ?? body.find((t) => t.type === 'var');
      const v = varTok?.name ?? 'x';
      const fname = lhs[0].name!;
      const argText = src.slice(lhs[2].start, lhs[lhs.length - 2].end);
      return {
        ok: false,
        diagnostics: [
          {
            level: 'warning',
            code: 'evaluated-definition',
            message: `"${fname}(${argText})" names a single value, but the right side still depends on ${v}. Nothing was changed — your input is kept as typed.`,
            start: lhs[0].start,
            end: lhs[lhs.length - 1].end,
            suggestion: {
              label: `Did you mean ${fname}(${v}) = ${rhsText}, evaluated at ${v} = ${argText}?`,
              expression: `${fname}(${v}) = ${rhsText}`,
              addPoint: value,
            },
          },
        ],
      };
    } else {
      return {
        ok: false,
        diagnostics: [
          {
            level: 'error',
            code: 'equation',
            message: 'Equations aren\'t supported yet — enter a function, like "x^2 - 4".',
            start: eqs[0].start,
            end: eqs[0].end,
            suggestion: lhsText
              ? {
                  label: `Analyze ${lhsText} − (${rhsText}) instead — its zeros solve the equation`,
                  expression: `${lhsText} - (${rhsText})`,
                }
              : undefined,
          },
        ],
      };
    }
  }

  const parser = new Parser(body, src);
  let ast: Node;
  try {
    ast = parser.parseAll();
  } catch (e) {
    if (e instanceof ParseError) return { ok: false, diagnostics: [...diagnostics, fromError(e)] };
    throw e;
  }
  diagnostics.push(...parser.notes);

  const vars = collectVars(ast);
  const mainVar = declaredVar ?? (vars.has('x') ? 'x' : vars.size === 1 ? [...vars][0] : 'x');
  const params = [...vars].filter((v) => v !== mainVar).sort();

  if (!vars.has(mainVar)) {
    diagnostics.push({
      level: 'info',
      code: 'constant-function',
      message: `This doesn't depend on ${mainVar}, so it's a constant function.`,
    });
  }

  return { ok: true, ast, mainVar, params, tokens: body, implicitAt: parser.implicitAt, diagnostics };
}
