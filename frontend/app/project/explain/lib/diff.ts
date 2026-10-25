import type { Step } from './types';

export type StepStatus = 'added' | 'changed' | 'same';

export interface StepDiff {
  status: Map<string, StepStatus>;
  /** The last run's version of each changed step, so the UI can show what it said before. */
  previous: Map<string, Step>;
  removed: Step[];
  changedCount: number;
}

const signature = (s: Step) => [s.title, s.latex ?? '', s.detail ?? '', s.condition ?? '', s.verification ?? ''].join('␟');

function flatten(steps: Step[], out = new Map<string, Step>()): Map<string, Step> {
  for (const s of steps) {
    out.set(s.id, s);
    if (s.children) flatten(s.children, out);
  }
  return out;
}

/** Diff two step trees by their stable ids. */
export function diffSteps(prev: Step[] | null, cur: Step[]): StepDiff {
  const status = new Map<string, StepStatus>();
  const previous = new Map<string, Step>();
  const now = flatten(cur);
  if (!prev) {
    for (const id of now.keys()) status.set(id, 'same');
    return { status, previous, removed: [], changedCount: 0 };
  }
  const before = flatten(prev);
  let changedCount = 0;
  for (const [id, s] of now) {
    const old = before.get(id);
    const st: StepStatus = !old ? 'added' : signature(old) !== signature(s) ? 'changed' : 'same';
    if (st !== 'same') changedCount++;
    if (st === 'changed' && old) previous.set(id, old);
    status.set(id, st);
  }
  // Only report top-most removed steps (not every removed descendant).
  const removed = [...before.values()].filter((s) => {
    if (now.has(s.id)) return false;
    const parent = s.id.includes('.') ? s.id.slice(0, s.id.lastIndexOf('.')) : null;
    return !parent || now.has(parent);
  });
  return { status, previous, removed, changedCount: changedCount + removed.length };
}

/** "a.b.c" → ["a", "a.b", "a.b.c"] */
export function ancestors(id: string): string[] {
  const parts = id.split('.');
  return parts.map((_, i) => parts.slice(0, i + 1).join('.'));
}

export function hasChangedDescendant(step: Step, status: Map<string, StepStatus>): boolean {
  return (step.children ?? []).some((c) => (status.get(c.id) ?? 'same') !== 'same' || hasChangedDescendant(c, status));
}
