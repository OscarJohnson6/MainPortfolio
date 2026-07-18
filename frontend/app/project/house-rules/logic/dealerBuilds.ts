// logic/dealerBuilds.ts — House Ledger, dealer artifact generation, dealer names
import type { ArtifactId, OwnedArtifact, DealerRank, LedgerBudget } from '../types';
import { ARTIFACT_DEFS } from '../data/artifacts';
import { shuffle, generateNickname } from './engine';

// ─── Dealer ledger / build helpers ───────────────────────────────

const DEALER_ARTIFACT_POOL: ArtifactId[] = [
  'third_choice','queens_mercy','crown_law','royal_echo',
  'crooked_pawn','contrarian_deck','card_counter','edge_work','insurance_policy',
];

export function createLedgerBudget(points: number, rank: DealerRank, opts: Partial<LedgerBudget> = {}): LedgerBudget {
  const rulesByRank: Record<DealerRank, LedgerBudget['spendingRules']> = {
    normal:   { maxArtifacts: 2, maxTier4Artifacts: 0, canBuyTier4: false, canBuyCursedArtifacts: false, duplicateRollsUpgrade: true },
    elite:    { maxArtifacts: 3, maxTier4Artifacts: 0, canBuyTier4: false, canBuyCursedArtifacts: false, duplicateRollsUpgrade: true },
    boss:     { maxArtifacts: 3, maxTier4Artifacts: 0, canBuyTier4: false, canBuyCursedArtifacts: true,  duplicateRollsUpgrade: true },
    act3Boss: { maxArtifacts: 4, maxTier4Artifacts: 0, canBuyTier4: false, canBuyCursedArtifacts: true,  duplicateRollsUpgrade: true },
    raidBoss: { maxArtifacts: 4, maxTier4Artifacts: 1, canBuyTier4: false, canBuyCursedArtifacts: true,  duplicateRollsUpgrade: true },
    trueBoss: { maxArtifacts: 4, maxTier4Artifacts: 2, canBuyTier4: true,  canBuyCursedArtifacts: true,  duplicateRollsUpgrade: true },
  };
  return {
    points,
    freeGrants: opts.freeGrants ?? [],
    spendingRules: opts.spendingRules ?? rulesByRank[rank],
    marketBiases: opts.marketBiases ?? [],
    history: opts.history ?? [],
  };
}

function artifactPointCost(id: ArtifactId) {
  const rarity = ARTIFACT_DEFS[id]?.rarity ?? 'common';
  return rarity === 'rare' ? 12 : rarity === 'uncommon' ? 10 : 8;
}

export function generateDealerArtifactsFromBudget(ledger: LedgerBudget, pool: ArtifactId[] = DEALER_ARTIFACT_POOL): OwnedArtifact[] {
  const arts: OwnedArtifact[] = [];
  let points = ledger.points;
  const maxArtifacts = ledger.spendingRules.maxArtifacts;

  for (const grant of ledger.freeGrants ?? []) {
    if (grant.type === 'tier4Artifact') {
      const eligible = pool.filter(id => (ARTIFACT_DEFS[id]?.stacks?.length ?? 0) >= 4 || ['crown_law','jacks_tell','royal_echo'].includes(id));
      const id = shuffle(eligible.length ? eligible : pool)[0];
      if (id) arts.push({ id, stacks: 4 as any });
    }
  }

  let guard = 0;
  while (points >= 8 && guard++ < 40) {
    const id = shuffle(pool)[0];
    if (!id) break;
    const existing = arts.find(a => a.id === id);
    if (existing) {
      const nextStacks = existing.stacks + 1;
      if (nextStacks > Math.min(3, ARTIFACT_DEFS[id].maxStacks)) continue;
      const upgradeCost = nextStacks === 2 ? 8 : 12;
      if (points < upgradeCost) break;
      existing.stacks = nextStacks;
      points -= upgradeCost;
      continue;
    }
    if (arts.length >= maxArtifacts) {
      const upgradeable = shuffle(arts.filter(a => a.stacks < Math.min(3, ARTIFACT_DEFS[a.id].maxStacks)));
      const targetArt = upgradeable[0];
      if (!targetArt) break;
      const nextStacks = targetArt.stacks + 1;
      const upgradeCost = nextStacks === 2 ? 8 : 12;
      if (points < upgradeCost) break;
      targetArt.stacks = nextStacks;
      points -= upgradeCost;
      continue;
    }
    const cost = artifactPointCost(id);
    if (points < cost) break;
    arts.push({ id, stacks: 1 });
    points -= cost;
  }

  return arts.slice(0, maxArtifacts);
}

export function generateDealerNameFromArtifacts(arts: OwnedArtifact[], rank: DealerRank): string {
  if (rank === 'raidBoss') return 'The Golden ' + generateNickname(arts);
  if (rank === 'trueBoss') return 'The Closing House';
  if (!arts.length) return rank === 'boss' || rank === 'act3Boss' ? 'The House Dealer' : 'Table Dealer';
  return generateNickname(arts).replace(/^The /, 'The House ');
}

// ─── Bust resolution ──────────────────────────────────────────────