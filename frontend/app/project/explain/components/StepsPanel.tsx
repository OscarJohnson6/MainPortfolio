'use client';

import { useEffect } from 'react';
import { hasChangedDescendant, type StepDiff, type StepStatus } from '../lib/diff';
import type { Step } from '../lib/types';
import { RichText, Tex } from './Tex';
import { VerificationBadge } from './VerificationBadge';

interface Props {
  steps: Step[];
  diff: StepDiff;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  compare: boolean;
  onCompareChange: (v: boolean) => void;
  hasPrevious: boolean;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSetExpanded: (ids: Set<string>) => void;
  focus: { id: string; n: number } | null;
  stale: boolean;
}

const STATUS_STYLE: Record<Exclude<StepStatus, 'same'>, { label: string; chip: string; border: string }> = {
  added: {
    label: 'new',
    chip: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
    border: 'border-l-emerald-500',
  },
  changed: {
    label: 'changed',
    chip: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300',
    border: 'border-l-amber-500',
  },
};

function allIds(steps: Step[], out = new Set<string>()): Set<string> {
  for (const s of steps) {
    if (s.children?.length) {
      out.add(s.id);
      allIds(s.children, out);
    }
  }
  return out;
}

export function StepsPanel(props: Props) {
  const { steps, diff, open, onOpenChange, compare, onCompareChange, hasPrevious, onSetExpanded, focus, stale } = props;

  useEffect(() => {
    if (!focus || !open) return;
    const el = document.getElementById(`fa-step-${focus.id}`);
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [focus, open]);

  const changes = compare && hasPrevious ? diff.changedCount : 0;

  return (
    <section aria-labelledby="fa-steps-heading" className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 id="fa-steps-heading" className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls="fa-steps-body"
          onClick={() => onOpenChange(!open)}
          className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left hover:bg-zinc-50 sm:px-5 dark:hover:bg-zinc-800/50"
        >
          <span aria-hidden className={`text-zinc-400 transition-transform ${open ? 'rotate-90' : ''}`}>
            ▶
          </span>
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">How it was solved</span>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{steps.length} steps</span>
          {changes > 0 && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">
              {changes} change{changes === 1 ? '' : 's'} since last run
            </span>
          )}
          {stale && <span className="ml-auto text-xs text-zinc-500">showing last valid input</span>}
        </button>
      </h2>

      {open && (
        <div id="fa-steps-body" className={`border-t border-zinc-100 px-3 pt-3 pb-4 sm:px-5 dark:border-zinc-800 ${stale ? 'opacity-60' : ''}`}>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            <label className="inline-flex cursor-pointer items-center gap-2 text-zinc-700 dark:text-zinc-300">
              <input type="checkbox" checked={compare} onChange={(e) => onCompareChange(e.target.checked)} className="size-4 accent-indigo-600" />
              Highlight what changed since the last run
            </label>
            <span className="ml-auto flex gap-1">
              <button
                type="button"
                onClick={() => onSetExpanded(allIds(steps))}
                className="rounded-lg px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Expand all
              </button>
              <button
                type="button"
                onClick={() => onSetExpanded(new Set())}
                className="rounded-lg px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              >
                Collapse all
              </button>
            </span>
          </div>

          <ol className="space-y-2">
            {steps.map((s, i) => (
              <StepNode key={s.id} step={s} index={i + 1} depth={0} {...props} />
            ))}
          </ol>

          {compare && hasPrevious && diff.removed.length > 0 && (
            <div className="mt-4 rounded-xl border border-dashed border-zinc-300 p-3 text-sm dark:border-zinc-700">
              <p className="font-medium text-zinc-700 dark:text-zinc-300">Removed since the last run</p>
              <ul className="mt-1 list-disc pl-5 text-zinc-500 line-through dark:text-zinc-400">
                {diff.removed.map((s) => (
                  <li key={s.id}>{s.title}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function StepNode({ step, index, depth, ...p }: Props & { step: Step; index: number; depth: number }) {
  const kids = step.children ?? [];
  const isOpen = p.expanded.has(step.id);
  const status = p.compare && p.hasPrevious ? (p.diff.status.get(step.id) ?? 'same') : 'same';
  const childChanged = p.compare && p.hasPrevious && !isOpen && hasChangedDescendant(step, p.diff.status);
  const focused = p.focus?.id === step.id;
  const st = status !== 'same' ? STATUS_STYLE[status] : null;

  const head = (
    <span className="flex min-w-0 flex-wrap items-center gap-2">
      {depth === 0 && <span className="text-xs font-semibold text-zinc-400 tabular-nums">{index}.</span>}
      <span className={`font-medium ${depth === 0 ? 'text-zinc-900 dark:text-zinc-100' : 'text-sm text-zinc-800 dark:text-zinc-200'}`}>{step.title}</span>
      {st && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${st.chip}`}>{st.label}</span>}
      {childChanged && <span className="text-[11px] text-amber-700 dark:text-amber-300">changes inside</span>}
      <VerificationBadge value={step.verification} />
      {step.form && depth === 0 && (
        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
          uses {step.form} form
        </span>
      )}
    </span>
  );

  return (
    <li
      id={`fa-step-${step.id}`}
      className={`scroll-mt-24 rounded-xl border-l-4 ${st ? st.border : 'border-l-transparent'} ${
        depth === 0 ? 'bg-zinc-50 dark:bg-zinc-800/40' : ''
      } ${focused ? 'ring-2 ring-indigo-500' : ''}`}
    >
      <div className="px-3 py-2">
        {kids.length ? (
          <button
            type="button"
            aria-expanded={isOpen}
            onClick={() => p.onToggle(step.id)}
            className="flex w-full items-start gap-2 rounded-lg text-left"
          >
            <span aria-hidden className={`mt-0.5 text-[10px] text-zinc-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}>
              ▶
            </span>
            {head}
          </button>
        ) : (
          <div className="flex items-start gap-2">
            <span aria-hidden className="mt-0.5 w-[10px]" />
            {head}
          </div>
        )}

        <div className="pl-[18px]">
          {step.latex && (
            <div className="mt-1.5 overflow-x-auto py-0.5 text-zinc-800 dark:text-zinc-200">
              <Tex tex={step.latex} />
            </div>
          )}
          {step.condition && (
            <p className="mt-1.5 inline-flex flex-wrap items-center gap-1 rounded-lg bg-amber-50 px-2 py-0.5 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
              <span className="font-medium">only valid where</span> <RichText text={`$${step.condition}$`} />
            </p>
          )}
          {step.detail && <p className="mt-1.5 text-sm whitespace-pre-line text-zinc-600 dark:text-zinc-400">{step.detail}</p>}
        </div>
      </div>

      {isOpen && kids.length > 0 && (
        <ol className="ml-5 space-y-1 border-l border-zinc-200 pb-2 pl-2 dark:border-zinc-700">
          {kids.map((c, i) => (
            <StepNode key={c.id} {...p} step={c} index={i + 1} depth={depth + 1} />
          ))}
        </ol>
      )}
    </li>
  );
}
