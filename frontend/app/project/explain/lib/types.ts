/**
 * e(x)plain — API contract.
 *
 * These types are the contract between the Next.js frontend and the analysis
 * engine. Today the engine is the TypeScript mock in ./mock; later the Python
 * FastAPI backend should accept `AnalyzeRequest` and return `AnalyzeResponse`
 * with exactly these shapes (snake_case is NOT used — keep camelCase in JSON).
 */

// ---------------------------------------------------------------------------
// Expression tree (AST). The backend returns the parsed tree so the frontend
// can plot it without re-parsing — the parser lives in one place (the engine).
// ---------------------------------------------------------------------------

export type FnName =
  | 'sin' | 'cos' | 'tan' | 'sec' | 'csc' | 'cot'
  | 'asin' | 'acos' | 'atan'
  | 'sinh' | 'cosh' | 'tanh' | 'asinh' | 'acosh' | 'atanh'
  | 'sqrt' | 'cbrt' | 'abs' | 'exp' | 'ln' | 'log';

export type BinOp = '+' | '-' | '*' | '/' | '^';

export type Node =
  | { type: 'num'; value: number }
  | { type: 'const'; name: 'pi' | 'e' }
  | { type: 'var'; name: string }
  | { type: 'neg'; arg: Node }
  | { type: 'bin'; op: BinOp; left: Node; right: Node; implicit?: boolean }
  | { type: 'call'; fn: FnName; arg: Node };

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

export type PiMode = 'exact' | 'full' | '3.14' | '3';
export type LogBase = '10' | 'e';

export interface EngineSettings {
  /** Read `pi` and `e` as constants (π and e) instead of variables. */
  recognizeConstants: boolean;
  /** Value of π used for numbers. 'exact' keeps π symbolic in exact results. */
  piMode: PiMode;
  /** What `log` means. `ln` is always base e. */
  logBase: LogBase;
}

export type LimitTarget = number | 'inf' | '-inf';
export type LimitSide = 'both' | 'left' | 'right';

export interface LimitQuery {
  id: string;
  target: LimitTarget;
  side: LimitSide;
}

export interface AnalyzeRequest {
  /** Exactly what the user typed — the engine treats this as gospel. */
  expression: string;
  /** Values for parameters (non-main variables). null = leave symbolic. */
  params: Record<string, number | null>;
  settings: EngineSettings;
  limits: LimitQuery[];
  /** x-values to inspect (value, slope, acceleration, tangent line). */
  points: number[];
  /** Interval to inspect (average rate, integral, extremes). */
  interval: { a: number; b: number } | null;
  /** Range the engine scans for numeric features. */
  scan: { min: number; max: number };
}

// ---------------------------------------------------------------------------
// Response
// ---------------------------------------------------------------------------

export type DiagnosticLevel = 'error' | 'warning' | 'info';

export interface Suggestion {
  /** Button text, e.g. `Did you mean "(x^2)5"?` */
  label: string;
  /** Replacement for the whole input. */
  expression: string;
  /** Optionally also add this x-value to the point inspector. */
  addPoint?: number;
}

export interface Diagnostic {
  level: DiagnosticLevel;
  /** Stable machine-readable code, e.g. 'empty-parens', 'evaluated-definition'. */
  code: string;
  message: string;
  /** Character range in the input this refers to. */
  start?: number;
  end?: number;
  suggestion?: Suggestion;
}

/**
 * 'verified'      — numeric spot-checks against the ORIGINAL function agree.
 * 'mismatch'      — spot-checks disagree inside the shared domain (engine bug).
 * 'domain-change' — a derived form is defined where the original is not;
 *                   explained, and the original's domain wins.
 * 'unchecked'     — no check was run.
 */
export type Verification = 'verified' | 'mismatch' | 'domain-change' | 'unchecked';

export interface Step {
  /**
   * Stable, hierarchical id ("deriv1", "deriv1.0", "limit-l1.left"). Children
   * must start with `${parent.id}.`. Stable ids are what make the
   * "compare with previous run" diff work, so keep them deterministic.
   */
  id: string;
  title: string;
  latex?: string;
  detail?: string;
  /** Side condition a rewrite introduced, as LaTeX (e.g. "x \\neq 1"). */
  condition?: string;
  /** Which form of the function this step worked on. */
  form?: 'original' | 'simplified';
  verification?: Verification;
  children?: Step[];
}

export type MarkerKind =
  | 'max' | 'min' | 'stationary' | 'inflection' | 'hole'
  | 'x-intercept' | 'y-intercept' | 'point' | 'extreme';

export interface PlotMarker {
  x: number;
  y: number;
  kind: MarkerKind;
}

export type PlotLine =
  | { kind: 'vertical'; x: number }
  | { kind: 'horizontal'; y: number }
  | { kind: 'slant'; m: number; b: number };

export interface ResultItem {
  id: string;
  label: string;
  latex?: string;
  text?: string;
  note?: string;
  verification?: Verification;
  /** Step that produced this result — clicking the result opens it. */
  stepId?: string;
  marker?: PlotMarker;
  line?: PlotLine;
}

export interface ResultSection {
  id: string;
  title: string;
  items: ResultItem[];
  emptyText?: string;
}

export interface AnalyzeResponse {
  ok: boolean;
  engine: 'mock' | 'python';
  /** Echo of the request expression (lets the UI ignore stale responses). */
  input: string;
  diagnostics: Diagnostic[];
  parsed?: {
    /** How the engine read the input, as LaTeX (shown under the input). */
    latex: string;
    mainVar: string;
    params: string[];
  };
  plot?: {
    /** The original function — always plotted as the gospel. */
    f: Node;
    d1: Node | null;
    d2: Node | null;
    mainVar: string;
    /** Numeric values used for parameters when plotting. */
    paramValues: Record<string, number>;
  };
  steps: Step[];
  sections: ResultSection[];
  notices: string[];
}
