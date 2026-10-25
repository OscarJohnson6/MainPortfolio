'use client';

import { useRef } from 'react';
import type { Diagnostic, EngineSettings, Suggestion } from '../lib/types';
import { Tex } from './Tex';

const TOOLBAR: { label: string; insert: string; caret?: number; aria: string; wrap?: boolean }[] = [
  { label: '√', insert: 'sqrt()', caret: 5, aria: 'Square root', wrap: true },
  { label: 'x²', insert: '^2', aria: 'Squared' },
  { label: 'xⁿ', insert: '^', aria: 'Power' },
  { label: 'π', insert: 'pi', aria: 'Pi' },
  { label: 'e', insert: 'e', aria: 'Euler’s number e' },
  { label: '( )', insert: '()', caret: 1, aria: 'Parentheses', wrap: true },
  { label: 'sin', insert: 'sin()', caret: 4, aria: 'Sine', wrap: true },
  { label: 'cos', insert: 'cos()', caret: 4, aria: 'Cosine', wrap: true },
  { label: 'tan', insert: 'tan()', caret: 4, aria: 'Tangent', wrap: true },
  { label: 'ln', insert: 'ln()', caret: 3, aria: 'Natural log', wrap: true },
  { label: 'log', insert: 'log()', caret: 4, aria: 'Log', wrap: true },
  { label: '|x|', insert: 'abs()', caret: 4, aria: 'Absolute value', wrap: true },
];

const EXAMPLES = [
  '(x^2 - 1)/(x - 1)',
  'x^3 - 3x',
  'sin(x)/x',
  '1/(x^2 - 4)',
  'sqrt(x)^2',
  '(2x^2 + 1)/(x - 1)',
  'a x^2 + b x',
  'f(4) = 5x + sqrt(x)',
  'x^2()5',
];

const LEVEL: Record<Diagnostic['level'], { cls: string; icon: string; sr: string }> = {
  error: { cls: 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100', icon: '✕', sr: 'Error' },
  warning: { cls: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100', icon: '!', sr: 'Warning' },
  info: { cls: 'border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300', icon: 'i', sr: 'Note' },
};

interface Props {
  value: string;
  onChange: (v: string) => void;
  settings: EngineSettings;
  onSettingsChange: (s: EngineSettings) => void;
  /** How the engine read the current input (LaTeX), or null if it couldn't. */
  echo: string | null;
  diagnostics: Diagnostic[];
  pending: boolean;
  onApplySuggestion: (s: Suggestion) => void;
}

export function ExpressionInput({ value, onChange, settings, onSettingsChange, echo, diagnostics, pending, onApplySuggestion }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const firstError = diagnostics.find((d) => d.level !== 'info' && d.start !== undefined);

  const insert = (item: (typeof TOOLBAR)[number]) => {
    const el = ref.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    const selected = value.slice(start, end);
    let text = item.insert;
    let caret = start + (item.caret ?? text.length);
    if (item.wrap && selected && item.caret !== undefined) {
      text = item.insert.slice(0, item.caret) + selected + item.insert.slice(item.caret);
      caret = start + text.length;
    }
    onChange(value.slice(0, start) + text + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret, caret);
    });
  };

  return (
    <section aria-labelledby="fa-input-label" className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-3">
        <label id="fa-input-label" htmlFor="fa-input" className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Function
        </label>
        <span aria-live="polite" className="text-xs text-zinc-500 dark:text-zinc-400">
          {pending ? 'Analyzing…' : ''}
        </span>
      </div>

      <div className="mt-2 flex items-center rounded-xl border border-zinc-300 bg-zinc-50 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/30 dark:border-zinc-700 dark:bg-zinc-950">
        <input
          id="fa-input"
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Type a function of x, e.g. (x^2 - 1)/(x - 1)"
          spellCheck={false}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          aria-describedby="fa-echo fa-diagnostics"
          aria-invalid={diagnostics.some((d) => d.level === 'error') || undefined}
          className="min-w-0 flex-1 bg-transparent px-4 py-3 font-mono text-base text-zinc-900 outline-none placeholder:text-zinc-400 sm:text-lg dark:text-zinc-100"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onChange('');
              ref.current?.focus();
            }}
            className="mr-2 rounded-lg px-2 py-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            aria-label="Clear input"
          >
            ✕
          </button>
        )}
      </div>

      <div role="toolbar" aria-label="Insert math" className="mt-2 flex flex-wrap gap-1.5">
        {TOOLBAR.map((t) => (
          <button
            key={t.label}
            type="button"
            onClick={() => insert(t)}
            aria-label={`Insert ${t.aria}`}
            className="rounded-lg border border-zinc-200 bg-white px-2.5 py-1 font-mono text-sm text-zinc-700 hover:border-indigo-400 hover:text-indigo-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-indigo-400 dark:hover:text-indigo-300"
          >
            {t.label}
          </button>
        ))}
      </div>

      <div id="fa-echo" className="mt-4 min-h-[2.5rem]">
        {firstError ? (
          <p className="font-mono text-sm break-all text-zinc-600 dark:text-zinc-300">
            <span className="sr-only">Problem in your input: </span>
            {value.slice(0, firstError.start)}
            <mark className="rounded bg-rose-200/70 px-0.5 text-rose-900 underline decoration-rose-500 decoration-wavy dark:bg-rose-500/30 dark:text-rose-100">
              {value.slice(firstError.start, firstError.end) || '␣'}
            </mark>
            {value.slice(firstError.end)}
          </p>
        ) : echo ? (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">Read as</span>
            <span className="overflow-x-auto text-lg text-zinc-900 dark:text-zinc-100">
              <Tex tex={echo} />
            </span>
          </div>
        ) : null}
      </div>

      {diagnostics.length > 0 && (
        <ul id="fa-diagnostics" className="mt-3 space-y-2">
          {diagnostics.map((d, i) => (
            <li key={`${d.code}-${i}`} className={`flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border px-3 py-2 text-sm ${LEVEL[d.level].cls}`}>
              <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-current/10 text-xs font-bold">
                {LEVEL[d.level].icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="sr-only">{LEVEL[d.level].sr}: </span>
                {d.message}
              </span>
              {d.suggestion && (
                <button
                  type="button"
                  onClick={() => onApplySuggestion(d.suggestion!)}
                  className="rounded-lg bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
                >
                  {d.suggestion.label}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-zinc-100 pt-4 text-sm dark:border-zinc-800">
        <label className="inline-flex cursor-pointer items-center gap-2 text-zinc-700 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={settings.recognizeConstants}
            onChange={(e) => onSettingsChange({ ...settings, recognizeConstants: e.target.checked })}
            className="size-4 accent-indigo-600"
          />
          Recognize π and e
        </label>
        <label className="inline-flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
          π value
          <select
            value={settings.piMode}
            onChange={(e) => onSettingsChange({ ...settings, piMode: e.target.value as EngineSettings['piMode'] })}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="exact">Exact (π)</option>
            <option value="full">3.14159…</option>
            <option value="3.14">3.14</option>
            <option value="3">3</option>
          </select>
        </label>
        <label className="inline-flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
          log means
          <select
            value={settings.logBase}
            onChange={(e) => onSettingsChange({ ...settings, logBase: e.target.value as EngineSettings['logBase'] })}
            className="rounded-lg border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="10">log₁₀</option>
            <option value="e">ln (base e)</option>
          </select>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-zinc-500 dark:text-zinc-400">Try:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => onChange(ex)}
            className="rounded-full bg-zinc-100 px-2.5 py-1 font-mono text-xs text-zinc-700 hover:bg-indigo-100 hover:text-indigo-800 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-indigo-500/20 dark:hover:text-indigo-200"
          >
            {ex}
          </button>
        ))}
      </div>
    </section>
  );
}
