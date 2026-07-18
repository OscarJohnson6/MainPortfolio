// logic/dealerAI.ts — dealer AI and scoring
import type { Card } from '../types';
import { getArtifactEffect } from '../data/artifacts';
import { handValue, getArtifactStacks, type DealerDecision, type DealerAIOptions, scoreDealerCardChoice, DEALER_WEIGHT } from './engine';

// ─── Dealer AI ────────────────────────────────────────────────────
// Dealer draws from previewPool first (visible to player), then falls back to deck.
// BUG FIX: dv >= playerValue stops dealer at TIE, not just when ahead.
// Previously dv > playerValue caused dealer to draw again on ties, often busting.

export function dealerAI(
  dealerHand: Card[],
  previewPool: Card[],
  deck: Card[],
  playerValue: number,
  target: number,
  opts: DealerAIOptions = {},
): { steps: Card[][], finalHand: Card[], decisions: DealerDecision[], finalTarget: number, remainingDeck: Card[] } {
  let dHand = [...dealerHand];
  let dTarget = target;
  let dealerQueenHalves = 0;
  const drawSequence = [...previewPool, ...deck];
  let drawIdx = 0;
  const steps: Card[][] = [];
  const decisions: DealerDecision[] = [];
  const rank = opts.rank ?? 'normal';
  const tieWins = opts.tieWins ?? true;

  for (let i = 0; i < 14; i++) {
    const dv = handValue(dHand, dTarget);
    if (dv > dTarget || (tieWins ? dv >= playerValue : dv > playerValue)) break;
    if (drawIdx >= drawSequence.length) break;

    const pair = drawSequence.slice(drawIdx, Math.min(drawIdx + 2, drawSequence.length));
    drawIdx += pair.length;
    if (pair.length === 0) break;

    const futurePairs: Card[][] = [];
    const futureVisible = opts.futurePairsVisible ?? 0;
    for (let fp = 0; fp < futureVisible; fp++) {
      const a = drawSequence[drawIdx + fp * 2];
      const b = drawSequence[drawIdx + fp * 2 + 1];
      if (a || b) futurePairs.push([a, b].filter(Boolean) as Card[]);
    }

    const credits = pair.map(card => scoreDealerCardChoice({
      card,
      dealerHand: dHand,
      dealerArtifacts: opts.dealerArtifacts ?? [],
      playerValue,
      target: dTarget,
      rank,
      futurePairs,
    }));

    let chosenIdx = 0;
    if (credits.length > 1) {
      const [a, b] = credits;
      const weights = DEALER_WEIGHT[rank];
      if (Math.abs(a.total - b.total) <= weights.mistakeWindow && Math.random() < weights.noise) {
        chosenIdx = a.total >= b.total ? 1 : 0;
      } else {
        chosenIdx = a.total >= b.total ? 0 : 1;
      }
    }

    let chosen = pair[chosenIdx];
    const burned = pair.filter((_, idx) => idx !== chosenIdx);
    const reasons = [...(credits[chosenIdx]?.reasons ?? [])];

    // Dealer face-card effects use the same broad rules as player face cards.
    // Queen arms a halve for the next number card; King shifts the target if Crown Law is owned.
    const isNumber = !['J','Q','K','A'].includes(chosen.rank);
    if (isNumber && dealerQueenHalves > 0) {
      const nextValue = Math.max(1, Math.floor(Math.abs(chosen.value) / 2));
      chosen = { ...chosen, value: chosen.value < 0 ? -nextValue : nextValue };
      dealerQueenHalves -= 1;
      reasons.push(`Queen's Grace halved next number`);
    }

    if (chosen.rank === 'K') {
      const crown = getArtifactEffect('crown_law', opts.dealerArtifacts ?? []);
      const range = crown?.kingRange ?? 1;
      if (range > 0) {
        const candidates = [dTarget - range, dTarget + range];
        const scoreTarget = (candidate: number) => {
          const nextHand = [...dHand, chosen];
          const val = handValue(nextHand, candidate);
          let score = 0;
          if (playerValue > candidate) score += 900;
          if (val <= candidate && val >= playerValue) score += 650;
          if (val > candidate) score -= 800;
          score -= Math.abs(candidate - val) * 3;
          return score;
        };
        const bestTarget = scoreTarget(candidates[0]) >= scoreTarget(candidates[1]) ? candidates[0] : candidates[1];
        if (bestTarget !== dTarget) {
          reasons.push(`Crown Law shifted target ${dTarget} → ${bestTarget}`);
          dTarget = bestTarget;
        }
      }
    }

    dHand = [...dHand, chosen];

    if (chosen.rank === 'Q') {
      dealerQueenHalves += 1;
      const reStacks = getArtifactStacks('royal_echo', opts.dealerArtifacts ?? []);
      if (reStacks > 0) dealerQueenHalves += 1;
      reasons.push(`Queen armed next number halve${dealerQueenHalves > 1 ? 's' : ''}`);
    }

    steps.push([...dHand]);
    decisions.push({
      pair,
      chosen,
      burned,
      credit: { ...credits[chosenIdx], reasons },
      otherCredit: credits[chosenIdx === 0 ? 1 : 0] ?? credits[chosenIdx],
    });
  }

  const consumedFromDeck = Math.max(0, drawIdx - previewPool.length);
  return { steps, finalHand: dHand, decisions, finalTarget: dTarget, remainingDeck: deck.slice(consumedFromDeck) };
}

// ─── Dealer ledger / build helpers ───────────────────────────────