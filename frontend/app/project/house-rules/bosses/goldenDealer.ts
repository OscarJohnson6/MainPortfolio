// bosses/goldenDealer.ts — Golden Dealer raid boss helpers
import type { Card } from '../types';

export const GOLDEN_DEALER_GATES = [
  { gate: 1 as const, target: 50,  label: 'Gate I',  flavor: '"You collected the chips. Now spend them."' },
  { gate: 2 as const, target: 100, label: 'Gate II', flavor: '"Deeper into gold."' },
];

export const GOLDEN_OPS = ['+', '−', '×', '÷'] as const;
export type GoldenOp = typeof GOLDEN_OPS[number];

export function getGoldenOp(opIndex: number): GoldenOp {
  return GOLDEN_OPS[opIndex % 4];
}

/**
 * Apply the current golden operator to a card's effective value.
 * previousTotal is the running total before this card is added.
 */
export function applyGoldenOperatorToCard(
  card: Card,
  previousTotal: number,
  opIndex: number,
): Card {
  const op = getGoldenOp(opIndex);
  const v  = card.value;
  let newValue = v;

  switch (op) {
    case '+': newValue = v;                              break;  // normal addition
    case '−': newValue = -v;                             break;  // subtract
    case '×': newValue = v * 2;                         break;  // double
    case '÷': newValue = Math.max(1, Math.floor(v / 2)); break;  // halve (min 1)
  }

  return { ...card, value: newValue };
}

/** Returns true when the player has collected the trigger count for the raid (3 chips). */
export const GOLDEN_CHIP_TRIGGER = 3;

export function shouldTriggerGoldenRaid(chipCount: number): boolean {
  return chipCount >= GOLDEN_CHIP_TRIGGER;
}

export interface GoldenRaidReward {
  money: number;
  closingTimeBonus: number;
}

export function getGoldenRaidClearReward(gate: 1 | 2, currentMoney: number): GoldenRaidReward {
  const money = gate === 1 ? 40 : 80;
  const closingTimeBonus = gate === 1 ? 5 : 10;
  return { money, closingTimeBonus };
}
