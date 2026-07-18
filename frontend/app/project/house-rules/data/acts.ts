// data/acts.ts — all act configurations and endless scaling
// Centralizes the game's progression structure so it's easy to tune.
import type { ActConfig } from '../types';

// ─── Main campaign (Card Mode) ────────────────────────────────────

export const ACTS: ActConfig[] = [
  {
    name: 'Act I', subtitle: 'The Green Room',
    tables: [
      { label: 'Opening Hand', target: 18, rule: null },
      { label: 'Green Felt',   target: 20, rule: null },
      { label: 'Late Night',   target: 21, rule: null },
    ],
    boss: {
      isBoss: true, label: 'Act I Boss',
      name: 'The Hidden Hand',
      flavor: '"Pick first. Regret later."',
      desc: 'One of your two Pull options is always face-down. You cannot see it until after you choose.',
      target: 21, rule: 'hidden_hand',
    },
  },
  {
    name: 'Act II', subtitle: 'The Back Room',
    tables: [
      { label: 'High Stakes',   target: 21, rule: null },
      { label: 'The Back Room', target: 23, rule: null },
      { label: 'Last Call',     target: 20, rule: null },
    ],
    boss: {
      isBoss: true, label: 'Act II Boss',
      name: 'The Exact Accountant',
      flavor: '"Close is not a number."',
      desc: 'Only an exact hit on the target wins. Standing short is an immediate loss.',
      target: 21, rule: 'exact_only',
    },
  },
  {
    name: 'Act III', subtitle: 'The Pit',
    tables: [
      { label: 'Table Lock',     target: 24, rule: null },
      { label: 'Marked Felt',    target: 25, rule: null },
      { label: 'House Pressure', target: 26, rule: null },
    ],
    boss: {
      isBoss: true, label: 'Act III Final Boss',
      name: 'The Pit Boss',
      flavor: '"The game was polite until now."',
      desc: 'Two-phase fight. Phase I locks one artifact and bans number ranks. Phase II raises the target, locks another artifact, and can ban any rank.',
      target: 30, rule: 'pit_boss',
    },
  },
];

// ─── Alphabet Mode acts ───────────────────────────────────────────

export const LETTER_ACTS: ActConfig[] = [
  {
    name: 'Act I', subtitle: 'The Library',
    tables: [
      { label: 'Opening Lines', target: 35, rule: null },
      { label: 'The Index',     target: 38, rule: null },
      { label: 'Last Chapter',  target: 42, rule: null },
    ],
    boss: {
      isBoss: true, label: 'Act I Boss',
      name: 'The Censor',
      flavor: '"Some letters are not permitted here."',
      desc: 'One random vowel is banned for the entire table. Any tile showing that letter cannot be selected.',
      target: 40, rule: 'censor' as any,
    },
  },
  {
    name: 'Act II', subtitle: 'The Archive',
    tables: [
      { label: 'Old Records',  target: 43, rule: null },
      { label: 'Deep Files',   target: 46, rule: null },
      { label: 'Final Entry',  target: 50, rule: null },
    ],
    boss: {
      isBoss: true, label: 'Final Boss',
      name: 'The Editor',
      flavor: '"Three letters is not a word. Try harder."',
      desc: 'Word Clears only count for words of 4+ letters. Shorter words are ignored.',
      target: 48, rule: 'editor' as any,
    },
  },
];

// ─── Endless scaling helpers ──────────────────────────────────────

function toActRoman(n: number): string {
  const map: Record<number, string> = {1:'I',2:'II',3:'III',4:'IV',5:'V',6:'VI',7:'VII',8:'VIII',9:'IX',10:'X'};
  return map[n] ?? String(n);
}

export function getHeatIntensity(actIdx: number): number {
  return Math.min(4, Math.max(0, actIdx - 2));
}

export function buildEndlessCardAct(actIdx: number): ActConfig {
  const actNo = actIdx + 1;
  const heat  = getHeatIntensity(actIdx);
  const base  = 26 + heat * 2;
  return {
    name: `Act ${toActRoman(actNo)}`,
    subtitle: heat >= 4 ? 'House Heat — Maximum' : `House Heat ${heat}`,
    tables: [
      { label: 'Heated Felt',  target: base,     rule: null },
      { label: 'Cursed Table', target: base + 2, rule: null },
      { label: 'Closing Hour', target: base + 4, rule: null },
    ],
    boss: {
      isBoss: true, label: 'Endless Boss',
      name: heat >= 4 ? 'The Burning House Dealer' : 'The House Heat Dealer',
      flavor: '"You already won. That was your mistake."',
      desc: 'Endless boss. Dealer ledger, shop pressure, and Closing Time keep rising.',
      target: 34 + heat * 4, rule: null,
    },
  };
}

export function getCardAct(actIdx: number): ActConfig {
  return ACTS[actIdx] ?? buildEndlessCardAct(actIdx);
}
