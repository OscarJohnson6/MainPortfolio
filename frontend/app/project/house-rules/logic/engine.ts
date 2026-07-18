// logic/engine.ts — core game primitives
import type { Card, Suit, Rank, OwnedArtifact, ArtifactId, BustResult, DealerRank } from '../types';
import { ARTIFACT_DEFS, ALL_ARTIFACT_IDS, type AiCardTag } from '../data/artifacts';

// ─── Deck ─────────────────────────────────────────────────────────

const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
const RANKS: Rank[] = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];

let _uid = 0;
export function createFullDeck(): Card[] {
  return SUITS.flatMap(suit =>
    RANKS.map(rank => ({
      rank, suit,
      // K = 11 (same as Ace base — expensive but powerful with Crown Law).
      // J/Q = 10. A = 11 (starting value before player makes manual choice).
      value: rank === 'A' ? 11 : rank === 'K' ? 11 : ['J','Q'].includes(rank) ? 10 : parseInt(rank),
      red: suit === '♥' || suit === '♦',
      id: `${rank}${suit}${_uid++}`,
    }))
  );
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Hand value ───────────────────────────────────────────────────

export function handValue(
  hand: Card[],
  target: number,
  contrarianStacks = 0,
  aceLicenseStacks = 0,
): number {
  let val = 0;
  let acesAt11 = 0;

  for (const card of hand) {
    if (card.rank === 'A') {
      if (card.chosenValue !== undefined) {
        val += card.chosenValue;  // player explicitly chose a value
      } else {
        acesAt11++;
        val += 11;                // auto-optimize path (ace added via trinket, etc.)
      }
    } else if (['J', 'Q', 'K'].includes(card.rank)) {
      val += card.value;
    } else {
      // Negative-card effects are now written onto the played card itself.
      // Example: a Crooked Pawn 7 is stored as value -7, so normal addition works.
      val += card.value;
    }
  }

  // Auto-optimize remaining aces (no chosenValue set)
  if (aceLicenseStacks >= 1) {
    let acesAt7 = 0;
    while (val > target && (acesAt11 > 0 || acesAt7 > 0)) {
      if (acesAt11 > 0) { val -= 4; acesAt11--; acesAt7++; }  // 11 → 7
      else { val -= 6; acesAt7--; }                             // 7 → 1
    }
  } else {
    while (val > target && acesAt11 > 0) { val -= 10; acesAt11--; } // 11 → 1
  }

  return val;
}

export function isOddNumberCard(card: Card): boolean {
  return !['J', 'Q', 'K', 'A'].includes(card.rank) && [3, 5, 7, 9].includes(Math.abs(card.value));
}

export function getEffectiveArtifactStacks(artifact: OwnedArtifact): number {
  if (artifact.status?.lockedForFight || artifact.status?.disabledUntilTableEnd) {
    // Legendary artifacts are suppressed to I instead of deleted.
    return artifact.stacks >= 4 ? 1 : 0;
  }
  return artifact.status?.forcedStacks ?? artifact.stacks;
}

export function getArtifactStacks(id: ArtifactId, arts: OwnedArtifact[]): number {
  const art = arts.find(a => a.id === id);
  return art ? getEffectiveArtifactStacks(art) : 0;
}

export function cardTags(card: Card): AiCardTag[] {
  const tags: AiCardTag[] = [];
  const isFace = ['J', 'Q', 'K'].includes(card.rank);
  if (isFace) tags.push('face', 'royal');
  if (card.rank === 'J') tags.push('jack', 'choice', 'future');
  else if (card.rank === 'Q') tags.push('queen', 'safety');
  else if (card.rank === 'K') tags.push('king', 'targetShift');
  else if (card.rank === 'A') tags.push('ace', 'choice', 'safety');
  else tags.push('number');
  if (Math.abs(card.value) >= 8) tags.push('risk');
  return tags;
}

export interface CardCredit {
  card: Card;
  baseValueCredit: number;
  outcomeCredit: number;
  artifactCredit: number;
  pressureCredit: number;
  futureCredit: number;
  riskPenalty: number;
  noise: number;
  total: number;
  reasons: string[];
}

export interface DealerDecision {
  pair: Card[];
  chosen: Card;
  burned: Card[];
  credit: CardCredit;
  otherCredit: CardCredit;
}

export interface DealerAIOptions {
  dealerArtifacts?: OwnedArtifact[];
  rank?: DealerRank;
  futurePairsVisible?: number;
  tieWins?: boolean;
}

export const DEALER_WEIGHT: Record<DealerRank, { outcome: number; artifact: number; pressure: number; future: number; risk: number; noise: number; mistakeWindow: number }> = {
  normal:   { outcome: 1.0, artifact: 0.35, pressure: 0.4,  future: 0.0, risk: 1.0, noise: 0.15, mistakeWindow: 20 },
  elite:    { outcome: 1.0, artifact: 0.65, pressure: 0.55, future: 0.1, risk: 1.0, noise: 0.10, mistakeWindow: 12 },
  boss:     { outcome: 1.0, artifact: 1.0,  pressure: 0.8,  future: 0.2, risk: 1.0, noise: 0.05, mistakeWindow: 6 },
  act3Boss: { outcome: 1.0, artifact: 1.15, pressure: 0.9,  future: 0.3, risk: 0.95, noise: 0.03, mistakeWindow: 5 },
  raidBoss: { outcome: 1.0, artifact: 1.25, pressure: 1.0,  future: 0.5, risk: 0.9, noise: 0.02, mistakeWindow: 3 },
  trueBoss: { outcome: 1.0, artifact: 1.4,  pressure: 1.15, future: 0.8, risk: 0.8, noise: 0.0, mistakeWindow: 0 },
};

function hasAllTags(cardTagSet: Set<AiCardTag>, required: AiCardTag[]) {
  return required.every(t => cardTagSet.has(t));
}

function conditionApplies(condition: string | undefined, card: Card, dealerTotal: number, playerValue: number, target: number, simulatedTotal: number) {
  if (!condition || condition === 'always') return true;
  if (condition === 'nearBust') return target - dealerTotal <= 6 || simulatedTotal > target;
  if (condition === 'safeFutureSetup') return simulatedTotal <= target;
  if (condition === 'targetShiftCouldMatter') {
    if (card.rank !== 'K') return false;
    // A target shift matters if the player is close to the target or the dealer is near/past danger.
    return Math.abs(target - playerValue) <= 5 || Math.abs(target - simulatedTotal) <= 5 || simulatedTotal > target;
  }
  return true;
}

export function scoreDealerCardChoice(input: {
  card: Card;
  dealerHand: Card[];
  dealerArtifacts: OwnedArtifact[];
  playerValue: number;
  target: number;
  rank?: DealerRank;
  futurePairs?: Card[][];
}): CardCredit {
  const rank = input.rank ?? 'normal';
  const weights = DEALER_WEIGHT[rank];
  const candidateHand = [...input.dealerHand, input.card];
  const dealerTotalBefore = handValue(input.dealerHand, input.target);
  const simulatedTotal = handValue(candidateHand, input.target);
  const distance = Math.abs(input.target - simulatedTotal);
  const busts = simulatedTotal > input.target;
  const beatsPlayer = !busts && simulatedTotal >= input.playerValue;
  const exactTarget = simulatedTotal === input.target;

  const baseValueCredit = Math.min(Math.abs(input.card.value), 11) * 3;
  let outcomeCredit = 0;
  let pressureCredit = 0;
  let futureCredit = 0;
  let artifactCredit = 0;
  let riskPenalty = 0;
  const reasons: string[] = [];

  if (beatsPlayer) { outcomeCredit += 180; reasons.push('beats or ties player'); }
  if (exactTarget) { outcomeCredit += 110; reasons.push('hits target'); }
  if (!busts) outcomeCredit += Math.max(0, 80 - distance * 6);
  if (busts) { riskPenalty += 320 + Math.max(0, simulatedTotal - input.target) * 8; reasons.push('would bust'); }

  // Pressure: target shifting cards can be worth playing when the player is near the target.
  if (input.card.rank === 'K') {
    const crownStacks = getArtifactStacks('crown_law' as ArtifactId, input.dealerArtifacts);
    if (crownStacks > 0) {
      const range = (ARTIFACT_DEFS.crown_law.stacks[Math.min(crownStacks, 3) - 1]?.kingRange ?? 2);
      if (input.playerValue > input.target - range || simulatedTotal > input.target - range) {
        pressureCredit += 85 + crownStacks * 25;
        reasons.push('King can pressure target');
      }
    }
  }

  const tagSet = new Set(cardTags(input.card));
  for (const art of input.dealerArtifacts) {
    const def = ARTIFACT_DEFS[art.id];
    if (!def?.aiCreditRules) continue;
    const stacks = Math.min(getEffectiveArtifactStacks(art), 4) as 1|2|3|4;
    if (stacks <= 0) continue;
    for (const rule of def.aiCreditRules) {
      if (!hasAllTags(tagSet, rule.tags)) continue;
      if (!conditionApplies(rule.condition, input.card, dealerTotalBefore, input.playerValue, input.target, simulatedTotal)) continue;
      const amount = rule.creditByStack[stacks] ?? 0;
      if (amount > 0) {
        artifactCredit += amount;
        reasons.push(`${def.name}: +${amount}`);
      }
    }
  }

  if ((input.futurePairs?.length ?? 0) > 0) {
    // Very shallow future credit: does this card keep the dealer alive with at least one future option?
    const nextPair = input.futurePairs?.[0] ?? [];
    if (!busts && nextPair.length) {
      const safeFuture = nextPair.some(c => handValue([...candidateHand, c], input.target) <= input.target);
      if (safeFuture) { futureCredit += 25; reasons.push('keeps a safe future option'); }
      else { riskPenalty += 35; reasons.push('future pair looks dangerous'); }
    }
  }

  const noise = weights.noise > 0 ? (Math.random() - 0.5) * weights.noise * 100 : 0;
  const total =
    outcomeCredit * weights.outcome +
    artifactCredit * weights.artifact +
    pressureCredit * weights.pressure +
    futureCredit * weights.future +
    baseValueCredit -
    riskPenalty * weights.risk +
    noise;

  return { card: input.card, baseValueCredit, outcomeCredit, artifactCredit, pressureCredit, futureCredit, riskPenalty, noise, total, reasons };
}

// ─── Bust resolution ──────────────────────────────────────────────

export function calcBustResult(
  curLives: number,
  curMoney: number,
  arts: OwnedArtifact[],
  scUsed: number,
): BustResult {
  const ledger = arts.find(a => a.id === 'cursed_ledger');
  if (ledger) {
    const eff = ARTIFACT_DEFS.cursed_ledger.stacks[ledger.stacks - 1];
    if (eff?.ledgerBustCost === -1) {
      return {
        newLives: curLives, newMoney: 0, newScUsed: scUsed, saved: true,
        trigger: `Cursed Ledger: paid $${curMoney} to survive`,
        triggerColor: '#ef4444', pulseId: 'cursed_ledger',
      };
    }
    if (eff?.ledgerBustCost != null && curMoney >= eff.ledgerBustCost) {
      return {
        newLives: curLives, newMoney: curMoney - eff.ledgerBustCost, newScUsed: scUsed, saved: true,
        trigger: `Cursed Ledger: paid $${eff.ledgerBustCost}`,
        triggerColor: '#ef4444', pulseId: 'cursed_ledger',
      };
    }
  }

  const newLives = curLives - 1;

  if (newLives <= 0) {
    const sc = arts.find(a => a.id === 'second_chance');
    if (sc) {
      const eff = ARTIFACT_DEFS.second_chance.stacks[sc.stacks - 1];
      const maxUses = eff?.scUses ?? 1;
      if (scUsed < maxUses) {
        const moneyLost = eff?.scCostsAllMoney ? curMoney : 0;
        return {
          newLives: 1, newMoney: curMoney - moneyLost, newScUsed: scUsed + 1,
          saved: true, isSecondChance: true,
          trigger: eff?.scCostsAllMoney ? `↺ Second Chance — lost $${moneyLost}` : '↺ Second Chance!',
          triggerColor: '#f472b6', pulseId: 'second_chance',
        };
      }
    }
  }

  return {
    newLives: Math.max(0, newLives), newMoney: curMoney,
    newScUsed: scUsed, saved: false,
    trigger: null, triggerColor: '#ef4444', pulseId: null,
  };
}

// ─── Nickname generator ───────────────────────────────────────────

const ADJ: Record<string, string[]> = {
  pull:        ['Three-Choice', 'Split-Hand', 'Overdrawing'],
  choice:      ['Calculated', 'Indecisive'],
  survival:    ['Undying', 'Ghost'],
  royal:       ['Crowned', 'Velvet-Clad', 'Court'],
  control:     ['Methodical', 'Kingmaking'],
  wild:        ['Contrarian', 'Unhinged'],
  money:       ['Debtbound', 'Backroom'],
  risk:        ['Reckless', 'Cursed'],
  luck:        ['Lucky', 'Fortune-Touched'],
  information: ['Knowing', 'Prophetic'],
};

const NOUN: Record<string, string[]> = {
  pull:        ['Gambler', 'Heretic'],
  choice:      ['Schemer'],
  survival:    ['Ghost', 'Mistake'],
  royal:       ['Crown', 'Court'],
  control:     ['Kingmaker', 'Authority'],
  wild:        ['Chaos', 'Variable'],
  money:       ['Ledger', 'Purse'],
  risk:        ['Gambler', 'Hazard'],
  luck:        ['Prophet', 'Fool'],
  information: ['Oracle', 'Seer'],
};

export function generateNickname(arts: OwnedArtifact[]): string {
  if (arts.length === 0) return 'The Newcomer';
  if (arts.length === 1) return 'The Prospect';

  const scStacks = arts.find(a => a.id === 'second_chance')?.stacks ?? 0;
  if (scStacks >= 2) return "The House's Mistake";
  const cdStacks = arts.find(a => a.id === 'contrarian_deck')?.stacks ?? 0;
  if (cdStacks >= 2) return 'The Contrarian';
  const hsStacks = arts.find(a => a.id === 'hot_streak')?.stacks ?? 0;
  if (hsStacks >= 2) return 'The Streaker';

  const weights: Record<string, number> = {};
  for (const art of arts) {
    const def = ARTIFACT_DEFS[art.id];
    if (!def) continue;
    for (const tag of def.tags) weights[tag] = (weights[tag] ?? 0) + art.stacks;
  }

  const sorted = Object.entries(weights).sort((a, b) => b[1] - a[1]);
  const tag1 = sorted[0]?.[0] ?? 'risk';
  const tag2 = sorted[1]?.[0] ?? tag1;

  const seed = arts.reduce((s, a) => s + a.stacks, 0);
  const adjList = ADJ[tag1] ?? ['Reckless'];
  const nounList = NOUN[tag2] ?? ['Gambler'];
  return `${adjList[seed % adjList.length]} ${nounList[(seed + 1) % nounList.length]}`;
}

// ─── Artifact IDs ─────────────────────────────────────────────────
// ─── Reward pool ─────────────────────────────────────────────────

export function generateRewardPool(arts: OwnedArtifact[]): ArtifactId[] {
  const pool: ArtifactId[] = [];

  for (const id of ALL_ARTIFACT_IDS) {
    const def = ARTIFACT_DEFS[id];
    const owned = arts.find(a => a.id === id);
    if (owned && owned.stacks >= def.maxStacks) continue;

    const weight = def.rarity === 'common' ? 3 : def.rarity === 'uncommon' ? 2 : 1;
    for (let i = 0; i < weight; i++) pool.push(id);
  }

  const shuffled = shuffle(pool);
  const seen = new Set<ArtifactId>();
  const result: ArtifactId[] = [];
  for (const id of shuffled) {
    if (!seen.has(id)) { seen.add(id); result.push(id); }
    if (result.length >= 3) break;
  }
  return result;
}

// ─── Shop items ───────────────────────────────────────────────────
// ─── Utilities ────────────────────────────────────────────────────

export function toRomanNumeral(n: number): string {
  return ['', 'I', 'II', 'III', 'IV'][n] ?? String(n);
}