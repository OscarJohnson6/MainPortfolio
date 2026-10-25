'use client';

import { useId, useState, type FormEvent } from 'react';
import type { LimitQuery, LimitSide, LimitTarget, ResultItem, ResultSection } from '../lib/types';
import { RichText, Tex } from './Tex';
import { VerificationBadge } from './VerificationBadge';

/** Accepts 2, -1.5, pi, -pi/2, 3pi/4, e. */
export function parseNumber(raw: string): number | null {
  const s = raw.trim().toLowerCase().replace(/−/g, '-').replace(/π/g, 'pi');
  if (!s) return null;
  if (s === 'e') return Math.E;
  if (s === '-e') return -Math.E;
  const m = /^(-?\d*\.?\d*)\s*\*?\s*pi\s*(?:\/\s*(\d+\.?\d*))?$/.exec(s);
  if (m) {
    const k = m[1] === '' ? 1 : m[1] === '-' ? -1 : parseFloat(m[1]);
    const q = m[2] ? parseFloat(m[2]) : 1;
    return Number.isFinite(k) && q ? (k * Math.PI) / q : null;
  }
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return null;
  return parseFloat(s);
}

export function parseTarget(raw: string): LimitTarget | null {
  const s = raw.trim().toLowerCase().replace(/−/g, '-').replace(/\s/g, '');
  if (['inf', '+inf', 'infinity', '+infinity', '∞', '+∞', 'oo'].includes(s)) return 'inf';
  if (['-inf', '-infinity', '-∞', '-oo'].includes(s)) return '-inf';
  return parseNumber(s);
}

function fmtNum(v: number): string {
  return String(parseFloat(v.toPrecision(6)));
}

export function targetLabel(t: LimitTarget): string {
  return t === 'inf' ? '∞' : t === '-inf' ? '−∞' : fmtNum(t);
}

const card = 'rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900';
const inputCls =
  'min-w-0 rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 font-mono text-sm text-zinc-900 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 focus:outline-none dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100';
const btnCls =
  'rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200';
const chipCls =
  'inline-flex items-center gap-1.5 rounded-full bg-indigo-50 py-1 pr-1 pl-3 font-mono text-xs text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200';

function Chip({ children, onRemove, removeLabel }: { children: React.ReactNode; onRemove: () => void; removeLabel: string }) {
  return (
    <li className={chipCls}>
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="grid size-5 place-items-center rounded-full hover:bg-indigo-200 dark:hover:bg-indigo-500/30"
      >
        ✕
      </button>
    </li>
  );
}

function ParamField({ name, value, onChange }: { name: string; value: number | null; onChange: (v: number | null) => void }) {
  const id = useId();
  const [text, setText] = useState(value === null ? '' : String(value));
  const parsed = parseNumber(text);
  const invalid = text.trim() !== '' && parsed === null;
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={id} className="w-6 font-mono text-sm font-semibold text-zinc-800 dark:text-zinc-200">
        {name}
      </label>
      <span className="font-mono text-zinc-400">=</span>
      <input
        id={id}
        value={text}
        placeholder="symbolic"
        inputMode="decimal"
        aria-invalid={invalid || undefined}
        onChange={(e) => {
          setText(e.target.value);
          const p = parseNumber(e.target.value);
          if (e.target.value.trim() === '') onChange(null);
          else if (p !== null) onChange(p);
        }}
        className={`${inputCls} w-28`}
      />
      {text && (
        <button
          type="button"
          onClick={() => {
            setText('');
            onChange(null);
          }}
          className="text-xs text-zinc-500 underline-offset-2 hover:underline"
        >
          leave symbolic
        </button>
      )}
      {invalid && <span className="text-xs text-rose-600 dark:text-rose-400">not a number</span>}
    </div>
  );
}

interface Props {
  mainVar: string;
  params: string[];
  paramValues: Record<string, number | null>;
  onParamChange: (name: string, v: number | null) => void;
  limits: LimitQuery[];
  onAddLimit: (target: LimitTarget, side: LimitSide) => void;
  onRemoveLimit: (id: string) => void;
  points: number[];
  onAddPoint: (x: number) => void;
  onRemovePoint: (x: number) => void;
  interval: { a: number; b: number } | null;
  onSetInterval: (iv: { a: number; b: number } | null) => void;
  sections: ResultSection[];
  notices: string[];
  highlightId: string | null;
  onSelect: (item: ResultItem) => void;
  onHover: (id: string | null) => void;
  stale: boolean;
  pending: boolean;
}

export function IOPanel(p: Props) {
  const ids = { limit: useId(), side: useId(), point: useId(), a: useId(), b: useId() };
  const [limitText, setLimitText] = useState('');
  const [side, setSide] = useState<LimitSide>('both');
  const [pointText, setPointText] = useState('');
  const [ivText, setIvText] = useState({ a: '', b: '' });
  const [errors, setErrors] = useState<{ limit?: string; point?: string; interval?: string }>({});

  const addLimit = (e: FormEvent) => {
    e.preventDefault();
    const t = parseTarget(limitText);
    if (t === null) return setErrors({ ...errors, limit: 'Use a number, pi, inf or -inf.' });
    p.onAddLimit(t, side);
    setLimitText('');
    setErrors({ ...errors, limit: undefined });
  };
  const addPoint = (e: FormEvent) => {
    e.preventDefault();
    const x = parseNumber(pointText);
    if (x === null) return setErrors({ ...errors, point: 'Use a number (pi works too).' });
    p.onAddPoint(x);
    setPointText('');
    setErrors({ ...errors, point: undefined });
  };
  const setInterval = (e: FormEvent) => {
    e.preventDefault();
    const a = parseNumber(ivText.a);
    const b = parseNumber(ivText.b);
    if (a === null || b === null || a === b) return setErrors({ ...errors, interval: 'Enter two different numbers.' });
    p.onSetInterval({ a: Math.min(a, b), b: Math.max(a, b) });
    setErrors({ ...errors, interval: undefined });
  };

  return (
    <div className="space-y-4">
      {/* ---- Inputs ---- */}
      <section aria-labelledby="fa-vars-heading" className={card}>
        <h2 id="fa-vars-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Variables
        </h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">{p.mainVar}</span> is the input variable (horizontal axis).
        </p>
        {p.params.length > 0 ? (
          <div className="mt-3 space-y-2">
            {p.params.map((name) => (
              <ParamField key={name} name={name} value={p.paramValues[name] ?? null} onChange={(v) => p.onParamChange(name, v)} />
            ))}
          </div>
        ) : (
          <p className="mt-1 text-xs text-zinc-500">Other letters in your function (like a, b) show up here as parameters.</p>
        )}
      </section>

      <section aria-labelledby="fa-ask-heading" className={card}>
        <h2 id="fa-ask-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Ask about it
        </h2>

        <form onSubmit={addLimit} className="mt-3">
          <label htmlFor={ids.limit} className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Limit as {p.mainVar} approaches
          </label>
          <div className="mt-1 flex flex-wrap gap-2">
            <input id={ids.limit} value={limitText} onChange={(e) => setLimitText(e.target.value)} placeholder="0, 1000, inf, -inf" className={`${inputCls} w-36 flex-1`} />
            <label htmlFor={ids.side} className="sr-only">
              Side
            </label>
            <select id={ids.side} value={side} onChange={(e) => setSide(e.target.value as LimitSide)} className={inputCls}>
              <option value="both">both sides</option>
              <option value="left">from the left (−)</option>
              <option value="right">from the right (+)</option>
            </select>
            <button type="submit" className={btnCls}>
              Add
            </button>
          </div>
          {errors.limit && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{errors.limit}</p>}
          {p.limits.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Limits">
              {p.limits.map((l) => (
                <Chip key={l.id} onRemove={() => p.onRemoveLimit(l.id)} removeLabel={`Remove limit as ${p.mainVar} approaches ${targetLabel(l.target)}`}>
                  lim {p.mainVar}→{targetLabel(l.target)}
                  {l.side === 'left' ? '⁻' : l.side === 'right' ? '⁺' : ''}
                </Chip>
              ))}
            </ul>
          )}
        </form>

        <form onSubmit={addPoint} className="mt-4">
          <label htmlFor={ids.point} className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            Inspect a point (value, slope, acceleration, tangent)
          </label>
          <div className="mt-1 flex gap-2">
            <input id={ids.point} value={pointText} onChange={(e) => setPointText(e.target.value)} placeholder={`${p.mainVar} = 2`} className={`${inputCls} flex-1`} />
            <button type="submit" className={btnCls}>
              Add
            </button>
          </div>
          {errors.point && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{errors.point}</p>}
          {p.points.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Inspected points">
              {p.points.map((x) => (
                <Chip key={x} onRemove={() => p.onRemovePoint(x)} removeLabel={`Stop inspecting ${p.mainVar} = ${fmtNum(x)}`}>
                  {p.mainVar} = {fmtNum(x)}
                </Chip>
              ))}
            </ul>
          )}
        </form>

        <form onSubmit={setInterval} className="mt-4">
          <fieldset>
            <legend className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Inspect an interval (average rate, area, extremes)</legend>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <label htmlFor={ids.a} className="sr-only">
                Start
              </label>
              <input id={ids.a} value={ivText.a} onChange={(e) => setIvText({ ...ivText, a: e.target.value })} placeholder="a" className={`${inputCls} w-20 flex-1`} />
              <span className="text-zinc-400">to</span>
              <label htmlFor={ids.b} className="sr-only">
                End
              </label>
              <input id={ids.b} value={ivText.b} onChange={(e) => setIvText({ ...ivText, b: e.target.value })} placeholder="b" className={`${inputCls} w-20 flex-1`} />
              <button type="submit" className={btnCls}>
                Set
              </button>
            </div>
          </fieldset>
          {errors.interval && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{errors.interval}</p>}
          {p.interval && (
            <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Interval">
              <Chip onRemove={() => p.onSetInterval(null)} removeLabel="Clear interval">
                [{fmtNum(p.interval.a)}, {fmtNum(p.interval.b)}]
              </Chip>
            </ul>
          )}
        </form>
      </section>

      {/* ---- Outputs ---- */}
      <section aria-labelledby="fa-results-heading" aria-busy={p.pending} className={card}>
        <div className="flex items-center justify-between">
          <h2 id="fa-results-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            Results
          </h2>
          {p.stale && <span className="text-xs text-zinc-500">showing last valid input</span>}
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Select a result to highlight it on the graph and open the step that found it.</p>

        <div className={`mt-3 space-y-5 ${p.stale ? 'opacity-60' : ''}`}>
          {p.sections.map((sec) => (
            <div key={sec.id}>
              <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">{sec.title}</h3>
              {sec.items.length === 0 ? (
                <p className="mt-1 text-sm text-zinc-500">{sec.emptyText ?? 'None.'}</p>
              ) : (
                <ul className="mt-1.5 space-y-1">
                  {sec.items.map((it) => {
                    const active = p.highlightId === it.id;
                    return (
                      <li key={it.id}>
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => p.onSelect(it)}
                          onMouseEnter={() => p.onHover(it.id)}
                          onMouseLeave={() => p.onHover(null)}
                          onFocus={() => p.onHover(it.id)}
                          onBlur={() => p.onHover(null)}
                          className={`w-full rounded-xl px-3 py-2 text-left transition-colors ${
                            active ? 'bg-indigo-50 ring-1 ring-indigo-400 dark:bg-indigo-500/15 dark:ring-indigo-400/60' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'
                          }`}
                        >
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">{it.label}</span>
                            <VerificationBadge value={it.verification} />
                          </span>
                          {it.latex && (
                            <span className="mt-0.5 block overflow-x-auto text-zinc-900 dark:text-zinc-100">
                              <Tex tex={it.latex} />
                            </span>
                          )}
                          {it.text && <span className="mt-0.5 block text-sm text-zinc-900 dark:text-zinc-100">{it.text}</span>}
                          {it.note && <RichText text={it.note} className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))}
        </div>

        {p.notices.length > 0 && (
          <ul className="mt-5 space-y-1 border-t border-zinc-100 pt-3 text-xs text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            {p.notices.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
