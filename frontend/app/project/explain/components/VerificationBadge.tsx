import type { Verification } from '../lib/types';

const STYLES: Record<Exclude<Verification, 'unchecked'>, { label: string; title: string; cls: string; icon: string }> = {
  verified: {
    label: 'verified',
    title: 'Numeric spot-checks against the original function agree.',
    cls: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
    icon: '✓',
  },
  mismatch: {
    label: 'mismatch',
    title: 'Spot-checks disagree with the original function. Treat this result with care.',
    cls: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20',
    icon: '⚠',
  },
  'domain-change': {
    label: 'domain changed',
    title: 'This form is defined in places the original is not. The original domain is kept.',
    cls: 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
    icon: '◐',
  },
};

export function VerificationBadge({ value }: { value?: Verification }) {
  if (!value || value === 'unchecked') return null;
  const s = STYLES[value];
  return (
    <span
      title={s.title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${s.cls}`}
    >
      <span aria-hidden>{s.icon}</span>
      {s.label}
    </span>
  );
}
