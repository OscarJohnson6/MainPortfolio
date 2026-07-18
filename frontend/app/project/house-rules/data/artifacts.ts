// ─────────────────────────────────────────────────────────────────
// artifacts.ts  —  all artifact definitions + stack effects
// ─────────────────────────────────────────────────────────────────

import type { ArtifactId, ArtifactTag, ArtifactRarity, OwnedArtifact } from '../types';

export interface ArtifactStackDef {
  description: string;
  // Pull
  pullCount?: number;
  pullCountUses?: number;
  // Queen saves
  queenSaves?: number;
  queenSaveAutomatic?: boolean;
  queenSaveReturnsCard?: boolean;
  // King
  kingRange?: number;
  // Face card money
  faceCardMoney?: number;
  faceCardReducesTarget?: boolean;
  // Win rewards
  winBonus?: number;
  bustPenalty?: number;
  perfectBonus?: number;
  perfectRestoresLife?: boolean;
  // Ace License
  aceExtraValue?: number;       // enables 7 as a third ace option (at Stack I+)
  acePerfectMoney?: boolean;    // bonus money per ace on perfect clear
  // Jack
  jackPeeks?: number;
  // Second Chance
  scUses?: number;
  scCostsAllMoney?: boolean;
  // Second Wind
  redraws?: number;
  redrawAfterPick?: boolean;
  // Negative / crooked cards
  contrarianActive?: boolean;
  contrarianOddMoney?: number;
  contrarianEvenDouble?: boolean;
  crookedNegativeRank?: boolean;
  crookedNegativeOddOnly?: boolean;
  crookedNegativeMoney?: number;
  // Odd Pilgrimage
  oddPilgrimageMoney?: number;
  oddPilgrimageHeal?: boolean;
  oddPilgrimageNeeds?: number;
  // Royal Echo
  royalEchoCharges?: number;
  // The Tithe
  titheCost?: number;
  titheWinBonus?: number;
  titheStandPenalty?: number;
  // Pauper's Luck
  pauperPullBonus?: number;
  pauperFreePull?: boolean;
  pauperNoBust?: boolean;
  // Cursed Ledger
  ledgerBustCost?: number;
  // Card Counter
  dealerPreviewReduce?: number;
  // Hot Streak
  streakBonus?: number;         // bonus money after streakMinWins consecutive wins
  streakMinWins?: number;       // how many wins to activate streak (default 2)
  streakSurviveTie?: boolean;   // push doesn't break the streak
  // Edge Work
  edgeBonus?: number;           // bonus for standing within edgeRange of target
  edgeRange?: number;           // how close to target counts (default 2)
  edgePerfectBonus?: number;    // bonus specifically for exact-target stand
  // House Cut
  dealerBustBonus?: number;     // extra money when dealer busts
  dealerBustRemovesPoolCard?: boolean; // next table starts with 1 fewer dealer draw card
  // Insurance Policy
  insuranceMargin?: number;     // lose by this much or less → push
  insurancePushMoney?: number;  // gain $$ on any push (including natural ties)
  // Blind Deal
  blindPullBonus?: number;      // extra money for surviving a blind pull
  blindPullUses?: number;       // how many blind pulls per table
  blindPullPerfectBonus?: number; // extra money if blind pull creates perfect clear
  // Trinket builds
  trinketSlotBonus?: number;
  trinketDiscount?: number;
  trinketSaveChance?: number;
  trinketGainChance?: number;
  trinketEchoChance?: number;
  trinketEchoMisfireChance?: number;
  // Midas / shop
  skipRewardMoneyBonus?: number;
  shopRerollDiscount?: number;
  goldenChipDiscount?: number;
}

export type AiCardTag =
  | 'number' | 'face' | 'royal' | 'jack' | 'queen' | 'king' | 'ace'
  | 'choice' | 'targetShift' | 'safety' | 'future' | 'money' | 'risk' | 'combo';

export interface ArtifactCreditRule {
  tags: AiCardTag[];
  creditByStack: Partial<Record<1 | 2 | 3 | 4, number>>;
  condition?: 'targetShiftCouldMatter' | 'safeFutureSetup' | 'nearBust' | 'always';
}

export interface ArtifactDef {
  name: string;
  icon: string;
  color: string;
  tags: ArtifactTag[];
  rarity: ArtifactRarity;
  maxStacks: number;
  stacks: [ArtifactStackDef, ArtifactStackDef, ArtifactStackDef, ArtifactStackDef?];
  aiCreditRules?: ArtifactCreditRule[];
}

// ─── All artifacts ────────────────────────────────────────────────

export const ARTIFACT_DEFS: Record<ArtifactId, ArtifactDef> = {

  third_choice: {
    name: 'Third Choice', icon: 'ti-stack-2', color: '#60a5fa',
    tags: ['pull', 'choice'], rarity: 'common', maxStacks: 3,
    stacks: [
      { description: 'Once per table, Pull shows 3 cards instead of 2.',
        pullCount: 3, pullCountUses: 1 },
      { description: 'First two Pulls each table show 3 cards.',
        pullCount: 3, pullCountUses: 2 },
      { description: 'Every Pull shows 3 cards.',
        pullCount: 3 },
    ],
  },

  queens_mercy: {
    name: "Queen's Mercy", icon: 'ti-shield', color: '#a855f7',
    tags: ['survival', 'royal'], rarity: 'uncommon', maxStacks: 3,
    aiCreditRules: [{ tags: ['queen', 'safety', 'royal'], creditByStack: { 1: 22, 2: 34, 3: 50 }, condition: 'nearBust' }],
    stacks: [
      { description: 'Playing a Queen activates one bust-save for this table.',
        queenSaves: 1 },
      { description: 'One bust-save activates automatically at the start of each table — no Queen required.',
        queenSaves: 1, queenSaveAutomatic: true },
      { description: 'Two automatic bust-saves per table. When triggered, the busting card returns to the deck and you pick again.',
        queenSaves: 2, queenSaveAutomatic: true, queenSaveReturnsCard: true },
    ],
  },

  crown_law: {
    name: 'Crown Law', icon: 'ti-crown', color: '#eab308',
    tags: ['control', 'royal'], rarity: 'uncommon', maxStacks: 3,
    aiCreditRules: [{ tags: ['king', 'targetShift', 'royal'], creditByStack: { 1: 24, 2: 38, 3: 58, 4: 96 }, condition: 'targetShiftCouldMatter' }],
    stacks: [
      { description: 'Kings (value 11) also shift the target ±2 when played. Choose the direction.',
        kingRange: 2 },
      { description: 'Kings shift the target ±3.',
        kingRange: 3 },
      { description: 'Kings shift the target ±4. At Stack III, playing a King also shows you one card from the dealer\'s draw pool before you choose direction.',
        kingRange: 4 },
    ],
  },

  ace_license: {
    name: 'Ace License', icon: 'ti-cards', color: '#f97316',
    tags: ['wild', 'control'], rarity: 'uncommon', maxStacks: 3,
    stacks: [
      { description: 'Aces give a three-way choice: count as 1, 7, or 11. All resulting totals shown before you pick.',
        aceExtraValue: 7 },
      { description: 'Three-way choice. On a Perfect Clear where an Ace was used, gain +$2.',
        aceExtraValue: 7, acePerfectMoney: true },
      { description: 'Three-way choice. Perfect Clear with Ace gives +$4. The Ace of Hearts trinket also gives +$1 on use.',
        aceExtraValue: 7, acePerfectMoney: true },
    ],
  },

  royal_purse: {
    name: 'Royal Purse', icon: 'ti-coin', color: '#4ade80',
    tags: ['money', 'royal'], rarity: 'common', maxStacks: 3,
    stacks: [
      { description: 'Face cards give +$1 when played.', faceCardMoney: 1 },
      { description: 'Face cards give +$2 when played.', faceCardMoney: 2 },
      { description: 'Face cards give +$3. The first face card each table also lowers the target by 1.',
        faceCardMoney: 3, faceCardReducesTarget: true },
    ],
  },

  high_stakes: {
    name: 'High Stakes', icon: 'ti-flame', color: '#f87171',
    tags: ['risk', 'money'], rarity: 'common', maxStacks: 3,
    stacks: [
      { description: 'Table wins give +$3 extra.',                         winBonus: 3 },
      { description: 'Table wins give +$5 extra. Losses cost −$2.',        winBonus: 5, bustPenalty: 2 },
      { description: 'Table wins give +$8 extra. Losses cost −$4.',        winBonus: 8, bustPenalty: 4 },
    ],
  },

  lucky_draw: {
    name: 'Lucky Draw', icon: 'ti-star', color: '#facc15',
    tags: ['luck', 'choice'], rarity: 'common', maxStacks: 3,
    stacks: [
      { description: 'Perfect Clears give +$3.',                         perfectBonus: 3 },
      { description: 'Perfect Clears give +$5.',                         perfectBonus: 5 },
      { description: 'Perfect Clears give +$8 and restore 1 life.',      perfectBonus: 8, perfectRestoresLife: true },
    ],
  },

  jacks_tell: {
    name: "Jack's Tell", icon: 'ti-eye', color: '#94a3b8',
    tags: ['information', 'royal'], rarity: 'uncommon', maxStacks: 3,
    aiCreditRules: [{ tags: ['jack', 'choice', 'future', 'royal'], creditByStack: { 1: 18, 2: 30, 3: 46, 4: 84 }, condition: 'safeFutureSetup' }],
    stacks: [
      { description: 'Playing a Jack peeks the top card of the deck.',    jackPeeks: 1 },
      { description: 'Playing a Jack peeks the top 2 cards.',             jackPeeks: 2 },
      { description: 'Playing a Jack peeks the top 3 cards.',             jackPeeks: 3 },
    ],
  },

  second_chance: {
    name: 'Second Chance', icon: 'ti-refresh', color: '#f472b6',
    tags: ['survival', 'luck'], rarity: 'uncommon', maxStacks: 3,
    stacks: [
      { description: 'Once per run: survive at 0 lives with 1 life restored.', scUses: 1 },
      { description: 'Twice per run.', scUses: 2 },
      { description: 'Twice per run. When triggered, the house takes all your money.',
        scUses: 2, scCostsAllMoney: true },
    ],
  },

  second_wind: {
    name: 'Second Wind', icon: 'ti-wind', color: '#67e8f9',
    tags: ['pull', 'survival'], rarity: 'common', maxStacks: 3,
    stacks: [
      { description: 'Once per table: discard both Pull options and draw fresh ones.', redraws: 1 },
      { description: 'Twice per table.', redraws: 2 },
      { description: 'Twice per table. Once per table, you may redraw after already choosing a card — it returns to the deck.',
        redraws: 2, redrawAfterPick: true },
    ],
  },

  contrarian_deck: {
    name: 'Contrarian Deck', icon: 'ti-arrows-exchange', color: '#f59e0b',
    tags: ['wild', 'risk'], rarity: 'rare', maxStacks: 3,
    stacks: [
      { description: 'The first odd number card you play each table subtracts instead of adding.',
        contrarianActive: true },
      { description: 'The first two odd number cards each table subtract. Each marked odd gives +$1 when played.',
        contrarianActive: true, contrarianOddMoney: 1 },
      { description: 'The first three odd number cards each table subtract. Each marked odd gives +$1 when played.',
        contrarianActive: true, contrarianOddMoney: 1 },
    ],
  },

  crooked_pawn: {
    name: 'Crooked Pawn', icon: 'ti-chess', color: '#fbbf24',
    tags: ['wild', 'risk'], rarity: 'common', maxStacks: 3,
    stacks: [
      { description: 'At the start of each table, one random number rank becomes negative for you.',
        crookedNegativeRank: true },
      { description: 'At the start of each table, one random odd rank (3, 5, 7, or 9) becomes negative.',
        crookedNegativeRank: true, crookedNegativeOddOnly: true },
      { description: 'One random odd rank becomes negative each table. Playing that rank gives +$1.',
        crookedNegativeRank: true, crookedNegativeOddOnly: true, crookedNegativeMoney: 1 },
    ],
  },

  odd_pilgrimage: {
    name: 'Odd Pilgrimage', icon: 'ti-route', color: '#f97316',
    tags: ['risk', 'survival'], rarity: 'rare', maxStacks: 3,
    stacks: [
      { description: 'Once per table, if your hand contains 3 different odd ranks, gain +$2.',
        oddPilgrimageMoney: 2, oddPilgrimageNeeds: 3 },
      { description: '3 different odd ranks give +$2. If you collect all four (3, 5, 7, 9), restore 1 life.',
        oddPilgrimageMoney: 2, oddPilgrimageHeal: true, oddPilgrimageNeeds: 4 },
      { description: 'Once per table, 3 different odd ranks restore 1 life and give +$2.',
        oddPilgrimageMoney: 2, oddPilgrimageHeal: true, oddPilgrimageNeeds: 3 },
    ],
  },

  royal_echo: {
    name: 'Royal Echo', icon: 'ti-crown', color: '#f0abfc',
    tags: ['royal', 'control'], rarity: 'rare', maxStacks: 3,
    stacks: [
      { description: 'Once per table, the first royal effect echoes: Jack lasts one extra Pull, Queen halves one extra number card, or King shifts twice.',
        royalEchoCharges: 1 },
      { description: 'The first two royal effects each table echo.',
        royalEchoCharges: 2 },
      { description: 'The first three royal effects each table echo.',
        royalEchoCharges: 3 },
    ],
  },

  the_tithe: {
    name: 'The Tithe', icon: 'ti-receipt', color: '#dc2626',
    tags: ['risk', 'money'], rarity: 'rare', maxStacks: 3,
    stacks: [
      { description: 'Each Pull costs $1. Wins give +$5 extra.',  titheCost: 1, titheWinBonus: 5 },
      { description: 'Each Pull costs $2. Wins give +$8 extra.',  titheCost: 2, titheWinBonus: 8 },
      { description: 'Pulls are free. Standing below target costs $6.',
        titheCost: 0, titheWinBonus: 8, titheStandPenalty: 6 },
    ],
  },

  paupers_luck: {
    name: "Pauper's Luck", icon: 'ti-coins', color: '#a78bfa',
    tags: ['survival', 'money'], rarity: 'uncommon', maxStacks: 3,
    stacks: [
      { description: 'At $0: Pull shows 3 options instead of 2.', pauperPullBonus: 1 },
      { description: 'At $0: 3 options, and unchosen Pull cards return to the deck.',
        pauperPullBonus: 1, pauperFreePull: true },
      { description: 'At $0: 3 options, free pulls, and you cannot bust — total clamps to target.',
        pauperPullBonus: 1, pauperFreePull: true, pauperNoBust: true },
    ],
  },

  cursed_ledger: {
    name: 'Cursed Ledger', icon: 'ti-book', color: '#ef4444',
    tags: ['risk', 'money'], rarity: 'uncommon', maxStacks: 3,
    stacks: [
      { description: 'On bust or loss: pay $4 instead of losing a life. Requires $4+.', ledgerBustCost: 4 },
      { description: 'On bust or loss: pay $2 instead.', ledgerBustCost: 2 },
      { description: 'On bust or loss: pay ALL your money instead. Even at $0, you survive.',
        ledgerBustCost: -1 },
    ],
  },

  card_counter: {
    name: 'Card Counter', icon: 'ti-eye-off', color: '#94a3b8',
    tags: ['information', 'control'], rarity: 'uncommon', maxStacks: 3,
    stacks: [
      { description: "Dealer's draw pool is reduced by 1 card (5 instead of 6). Dealer has fewer options.",
        dealerPreviewReduce: 1 },
      { description: 'Dealer draw pool reduced by 2 cards (4 instead of 6).', dealerPreviewReduce: 2 },
      { description: 'Dealer draw pool reduced by 3 cards. At the start of each table, you may see the dealer\'s hidden card value (just the number).',
        dealerPreviewReduce: 3 },
    ],
  },

  // ─── v2 artifacts ──────────────────────────────────────────────

  hot_streak: {
    name: 'Hot Streak', icon: 'ti-trending-up', color: '#fb923c',
    tags: ['money', 'luck'], rarity: 'common', maxStacks: 3,
    stacks: [
      { description: 'After winning 2 tables in a row, your next win pays +$3 extra.',
        streakBonus: 3, streakMinWins: 2 },
      { description: 'After 2 wins in a row, next win pays +$5 extra.',
        streakBonus: 5, streakMinWins: 2 },
      { description: 'After 2 wins in a row, next win pays +$7 extra. Pushes (ties) no longer break the streak.',
        streakBonus: 7, streakMinWins: 2, streakSurviveTie: true },
    ],
  },

  edge_work: {
    name: 'Edge Work', icon: 'ti-bullseye', color: '#34d399',
    tags: ['control', 'money'], rarity: 'uncommon', maxStacks: 3,
    stacks: [
      { description: 'Standing within 2 of the target grants +$1 bonus.',
        edgeBonus: 1, edgeRange: 2 },
      { description: 'Within 2 of target → +$2; within 1 → +$4.',
        edgeBonus: 2, edgeRange: 2, edgePerfectBonus: 4 },
      { description: 'Within 2 → +$3; within 1 → +$5; exact target → +$7 (stacks with Lucky Draw).',
        edgeBonus: 3, edgeRange: 2, edgePerfectBonus: 7 },
    ],
  },

  house_cut: {
    name: 'House Cut', icon: 'ti-chart-pie', color: '#a3e635',
    tags: ['money', 'information'], rarity: 'common', maxStacks: 3,
    stacks: [
      { description: 'When the dealer busts, gain +$3 extra on top of your win.',
        dealerBustBonus: 3 },
      { description: 'Dealer busts → +$5 extra.',
        dealerBustBonus: 5 },
      { description: 'Dealer busts → +$7 extra. Also removes one card from the start of the NEXT table\'s dealer draw pool.',
        dealerBustBonus: 7, dealerBustRemovesPoolCard: true },
    ],
  },

  insurance_policy: {
    name: 'Insurance Policy', icon: 'ti-shield-half', color: '#7dd3fc',
    tags: ['survival', 'control'], rarity: 'uncommon', maxStacks: 3,
    stacks: [
      { description: 'If the dealer beats you by exactly 1 point, the result becomes a push instead of a loss.',
        insuranceMargin: 1 },
      { description: 'Dealer beats you by 1–2 points → push.',
        insuranceMargin: 2 },
      { description: 'Dealer beats you by 1–3 points → push. On any push (including ties), gain $1.',
        insuranceMargin: 3, insurancePushMoney: 1 },
    ],
  },

  blind_deal: {
    name: 'Blind Deal', icon: 'ti-help', color: '#e879f9',
    tags: ['risk', 'luck'], rarity: 'rare', maxStacks: 3,
    stacks: [
      { description: 'Once per table: skip Pull options entirely — draw one random card blindly. If it doesn\'t bust you, gain +$3.',
        blindPullUses: 1, blindPullBonus: 3 },
      { description: 'Twice per table. Blind pull reward is +$4.',
        blindPullUses: 2, blindPullBonus: 4 },
      { description: 'Twice per table, +$4. If a blind pull creates a Perfect Clear, gain an additional +$8.',
        blindPullUses: 2, blindPullBonus: 4, blindPullPerfectBonus: 8 },
    ],
  },


  bag_of_holding: {
    name: 'Bag of Holding', icon: 'ti-briefcase', color: '#38bdf8',
    tags: ['trinket', 'choice'], rarity: 'uncommon', maxStacks: 3,
    stacks: [
      { description: 'Gain +1 trinket slot.', trinketSlotBonus: 1 },
      { description: 'Gain +1 trinket slot. Trinkets cost $1 less and shops offer one extra trinket.', trinketSlotBonus: 1, trinketDiscount: 1 },
      { description: 'Gain +1 trinket slot. Once per table, a used trinket has a 50% chance not to be consumed.', trinketSlotBonus: 1, trinketDiscount: 1, trinketSaveChance: 0.5 },
    ],
  },

  junk_drawer: {
    name: 'Junk Drawer', icon: 'ti-box', color: '#f59e0b',
    tags: ['trinket', 'luck'], rarity: 'common', maxStacks: 3,
    stacks: [
      { description: 'After using a trinket, 35% chance to find a random replacement trinket.', trinketGainChance: 0.35 },
      { description: 'After using a trinket, 60% chance to find a random replacement trinket.', trinketGainChance: 0.6 },
      { description: 'After using a trinket, find a random replacement and echo a small random pocket effect once per table.', trinketGainChance: 1, trinketEchoChance: 1 },
    ],
  },

  mirror_pocket: {
    name: 'Mirror Pocket', icon: 'ti-mirror', color: '#c084fc',
    tags: ['trinket', 'risk', 'forbidden'], rarity: 'rare', maxStacks: 3,
    stacks: [
      { description: 'After using a trinket, 50% chance to echo a random pocket effect.', trinketEchoChance: 0.5 },
      { description: 'After using a trinket, 75% chance to echo a random pocket effect.', trinketEchoChance: 0.75 },
      { description: 'After using a trinket, always echo a random pocket effect. 25% chance the mirror helps the dealer instead.', trinketEchoChance: 1, trinketEchoMisfireChance: 0.25 },
    ],
  },

  midas_mark: {
    name: 'Midas Mark', icon: 'ti-coins', color: '#facc15',
    tags: ['money', 'risk'], rarity: 'uncommon', maxStacks: 3,
    stacks: [
      { description: 'Skipping a reward gives +$2 extra.', skipRewardMoneyBonus: 2 },
      { description: 'Skipping a reward gives +$3 extra. Shop rerolls cost $1 less.', skipRewardMoneyBonus: 3, shopRerollDiscount: 1 },
      { description: 'Skipping a reward gives +$5 extra. Rerolls cost $2 less and Golden Chips cost $2 less when they are added.', skipRewardMoneyBonus: 5, shopRerollDiscount: 2, goldenChipDiscount: 2 },
    ],
  },

};


// ─── Auto-generated artifact ID list ────────────────────────────────
// Derived from ARTIFACT_DEFS so it never goes out of sync when new
// artifacts are added. Import this instead of maintaining a manual array.

export const ALL_ARTIFACT_IDS: ArtifactId[] = Object.keys(ARTIFACT_DEFS) as ArtifactId[];

// ─── Helpers ──────────────────────────────────────────────────────

export function effectiveArtifactStacks(art: OwnedArtifact): number {
  if (art.status?.forcedStacks) return art.status.forcedStacks;
  if (art.status?.lockedForFight || art.status?.disabledUntilTableEnd) {
    // Tier IV is suppressed to Tier I instead of being erased.
    return art.stacks >= 4 ? 1 : 0;
  }
  return art.stacks;
}

export function artifactStacks(id: ArtifactId, arts: OwnedArtifact[]): number {
  const owned = arts.find(a => a.id === id);
  return owned ? effectiveArtifactStacks(owned) : 0;
}

export function hasArtifact(id: ArtifactId, arts: OwnedArtifact[]): boolean {
  return artifactStacks(id, arts) > 0;
}

export function getArtifactEffect(
  id: ArtifactId,
  arts: OwnedArtifact[],
): ArtifactStackDef | null {
  const owned = arts.find(a => a.id === id);
  if (!owned) return null;
  const stacks = effectiveArtifactStacks(owned);
  if (stacks <= 0) return null;
  return ARTIFACT_DEFS[id].stacks[Math.min(stacks, ARTIFACT_DEFS[id].stacks.length) - 1] ?? null;
}