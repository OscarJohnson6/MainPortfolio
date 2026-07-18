// ─────────────────────────────────────────────────────────────────
// trinkets.ts  —  single-use consumable items
// Carried in pockets (max 3). Click to use during your turn.
// ─────────────────────────────────────────────────────────────────

export type TrinketId =
  | 'ace_of_hearts'   // add an Ace to your hand
  | 'the_ledger'      // instant-set your total to the target
  | 'gold_coin'       // +$5
  | 'piggy_bank'      // deposits money, grows on wins, cashes out at shop
  | 'lucky_horseshoe' // next pull shows 5 cards
  | 'iron_blindfold'  // ignore Hidden Hand rule this table
  | 'mirror_shard'    // copy dealer's visible card to hand
  | 'the_eraser'      // remove your last played card
  | 'second_breath'   // +2 redraws this table
  // Showdown-exclusive
  | 'the_cut'         // remove one of dealer's accumulated face-down cards
  | 'deep_freeze'     // dealer draws no more cards this table (Showdown)
  // Alphabet-exclusive
  | 'letter_press'    // swap two adjacent letters in your hand (reorder for words)
  | 'overtime'        // draw one more letter when over target, hoping to form a word
  // Preview pool manipulation
  | 'redact'          // remove one card from dealer's preview pool
  // Royal tools
  | 'royal_summons';  // guarantee a face card in next pull

export interface TrinketDef {
  name: string;
  icon: string;
  color: string;
  description: string;
  showdownOnly?: boolean;
  alphabetOnly?: boolean;
  cardOnly?: boolean;
  cost: number;        // shop price
}

export const TRINKET_DEFS: Record<TrinketId, TrinketDef> = {
  ace_of_hearts: {
    name: 'Ace of Hearts',
    icon: '♥',
    color: '#f472b6',
    description: 'Add an Ace (♥) directly to your hand. Auto-optimized as 1 or 11.',
    cardOnly: true,
    cost: 4,
  },
  the_ledger: {
    name: 'The Ledger',
    icon: '✦',
    color: '#c9a84c',
    description: 'Instantly set your hand total to exactly the target. Can only be used when below target.',
    cardOnly: true,
    cost: 6,
  },
  gold_coin: {
    name: 'Gold Coin',
    icon: '◉',
    color: '#f59e0b',
    description: 'Gain $5 immediately.',
    cost: 2,
  },
  piggy_bank: {
    name: 'Piggy Bank',
    icon: '◍',
    color: '#fbbf24',
    description: 'Deposit half your money. It grows after table wins. Cash it out at a shop; if you lose a life first, it cracks and loses its interest.',
    cost: 4,
  },
  lucky_horseshoe: {
    name: 'Lucky Horseshoe',
    icon: '⋒',
    color: '#22c55e',
    description: 'Your next Pull shows 5 card options instead of the normal count.',
    cost: 3,
  },
  iron_blindfold: {
    name: 'Iron Blindfold',
    icon: '◈',
    color: '#94a3b8',
    description: 'See all Pull options this table — ignores the Hidden Hand rule.',
    cardOnly: true,
    cost: 3,
  },
  mirror_shard: {
    name: 'Mirror Shard',
    icon: '◇',
    color: '#67e8f9',
    description: "Copy the dealer's visible first card into your own hand.",
    cardOnly: true,
    cost: 4,
  },
  the_eraser: {
    name: 'The Eraser',
    icon: '✕',
    color: '#f87171',
    description: 'Remove the last card you played from your hand. Useful if Contrarian Deck went wrong.',
    cardOnly: true,
    cost: 4,
  },
  second_breath: {
    name: 'Second Breath',
    icon: '↺',
    color: '#a78bfa',
    description: 'Gain 2 Second Wind redraws this table (works even without the artifact).',
    cost: 3,
  },
  the_cut: {
    name: 'The Cut',
    icon: '✂',
    color: '#ef4444',
    description: '[Showdown] Remove the most recently drawn face-down dealer card.',
    showdownOnly: true,
    cardOnly: true,
    cost: 3,
  },
  deep_freeze: {
    name: 'Deep Freeze',
    icon: '❄',
    color: '#93c5fd',
    description: '[Showdown] Lock the dealer — they draw no more cards this table after you Stand.',
    showdownOnly: true,
    cost: 5,
  },
  letter_press: {
    name: 'Letter Press',
    icon: '⇄',
    color: '#67e8f9',
    description: '[Alpha] Swap the two most recently drawn adjacent letters in your hand.',
    alphabetOnly: true,
    cost: 3,
  },
  overtime: {
    name: 'Overtime',
    icon: '⊕',
    color: '#f59e0b',
    description: '[Alpha] When over target, draw one more letter. If the sequence now contains a word, the bust is saved.',
    alphabetOnly: true,
    cost: 4,
  },
  redact: {
    name: 'Redact',
    icon: '✂',
    color: '#f87171',
    description: 'Click any card in the dealer\'s preview pool to permanently remove it. The dealer loses that draw.',
    cost: 5,
  },
  royal_summons: {
    name: 'Royal Summons',
    icon: '♛',
    color: '#a855f7',
    description: 'Your next Pull is guaranteed to include one face card (J, Q, or K) among the options.',
    cardOnly: true,
    cost: 4,
  },
};

export const TRINKET_IDS = Object.keys(TRINKET_DEFS) as TrinketId[];

export function getShopTrinkets(runMode: string, gameMode: string = 'card'): TrinketId[] {
  return TRINKET_IDS.filter(id => {
    const def = TRINKET_DEFS[id];
    if (def.showdownOnly && runMode !== 'showdown') return false;
    if (def.alphabetOnly && gameMode !== 'alphabet') return false;
    if (def.cardOnly && gameMode !== 'card') return false;
    return true;
  });
}