// bosses/pitBoss.ts — Pit Boss helpers (extracted from HouseRules.tsx)
import type { Card, OwnedArtifact } from '../types';
import { ARTIFACT_DEFS } from '../data/artifacts';

export type PitBossPhase = 1 | 2;

/** Remove any per-fight status flags from artifacts at the start of a new fight. */
export function clearFightArtifactStatuses(arts: OwnedArtifact[]): OwnedArtifact[] {
  return arts.map(a => ({
    ...a,
    status: a.status
      ? { ...a.status, lockedForFight: false, lockedUntilTurn: undefined, disabledUntilTableEnd: false }
      : undefined,
  }));
}

/** Lock one random artifact for this fight. Returns the modified array and the locked name. */
export function lockOnePitBossArtifact(arts: OwnedArtifact[]): { arts: OwnedArtifact[]; lockedName: string | null } {
  const candidates = arts.filter(a => {
    const isAlreadyLocked = a.status?.lockedForFight;
    const def = ARTIFACT_DEFS[a.id];
    // Don't lock second_chance or cursed_ledger — survival artifacts stay
    const isSurvival = def?.tags?.includes('survival');
    return !isAlreadyLocked && !isSurvival;
  });
  if (!candidates.length) return { arts, lockedName: null };

  const target = candidates[Math.floor(Math.random() * candidates.length)];
  const lockedName = ARTIFACT_DEFS[target.id]?.name ?? null;
  const updated = arts.map(a =>
    a.id === target.id ? { ...a, status: { ...(a.status ?? {}), lockedForFight: true } } : a
  );
  return { arts: updated, lockedName };
}

const NUMBER_RANKS: Card['rank'][] = ['2','3','4','5','6','7','8','9','10'];
const FACE_RANKS:   Card['rank'][] = ['J','Q','K','A'];

export function choosePitBossNumberBan(): Card['rank'] {
  return NUMBER_RANKS[Math.floor(Math.random() * NUMBER_RANKS.length)];
}

export function choosePitBossFaceBan(): Card['rank'] {
  return FACE_RANKS[Math.floor(Math.random() * FACE_RANKS.length)];
}

export function isCardBanned(
  card: Card,
  numberBan: Card['rank'] | null,
  faceBan: Card['rank'] | null,
): boolean {
  if (numberBan && card.rank === numberBan) return true;
  if (faceBan   && card.rank === faceBan)   return true;
  return false;
}

export function rankBanLabel(rank: Card['rank'] | null | undefined): string {
  if (!rank) return '';
  const names: Record<string, string> = { A: 'Ace', K: 'King', Q: 'Queen', J: 'Jack' };
  return names[rank] ?? `${rank}s`;
}
