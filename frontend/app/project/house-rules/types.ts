// ─────────────────────────────────────────────────────────────────
// types.ts
// ─────────────────────────────────────────────────────────────────

export type Suit = '♠' | '♥' | '♦' | '♣';
export type Rank = '2'|'3'|'4'|'5'|'6'|'7'|'8'|'9'|'10'|'J'|'Q'|'K'|'A';

export interface Card {
  rank: Rank;
  suit: Suit;
  value: number;
  red: boolean;
  id: string;
  chosenValue?: number;  // set when player manually picks an Ace value (1, 7, or 11)
}

export type ArtifactTag =
  | 'pull' | 'choice' | 'survival' | 'royal'
  | 'control' | 'wild' | 'money' | 'risk' | 'luck' | 'information'
  | 'trinket' | 'forbidden';

export type ArtifactRarity = 'common' | 'uncommon' | 'rare';

export type ArtifactId =
  | 'third_choice' | 'queens_mercy' | 'crown_law' | 'ace_license'
  | 'royal_purse'  | 'high_stakes'  | 'lucky_draw' | 'jacks_tell'
  | 'second_chance'
  | 'second_wind' | 'contrarian_deck' | 'the_tithe'
  | 'paupers_luck' | 'cursed_ledger'
  // Information / control
  | 'card_counter'
  // New — v2
  | 'hot_streak'        // win streak bonus
  | 'crooked_pawn'      // random marked negative rank each table
  | 'odd_pilgrimage'    // odd-rank hand challenge rewards
  | 'royal_echo'        // extends royal effects
  | 'edge_work'         // near-perfect stand bonus
  | 'house_cut'         // dealer bust bonus
  | 'insurance_policy'  // close-loss → push
  | 'blind_deal'        // skip pull options, take random card for bonus
  // Trinket / economy builds
  | 'bag_of_holding'
  | 'junk_drawer'
  | 'mirror_pocket'
  | 'midas_mark';

export type ArtifactCurseId =
  | 'brittle'
  | 'bloodbound'
  | 'crooked'
  | 'heavy'
  | 'loud'
  | 'debtMarked'
  | 'greedy'
  | 'starved'
  | 'mirrorMarked';

export interface ArtifactStatus {
  curses?: ArtifactCurseId[];
  lockedForFight?: boolean;
  lockedUntilTurn?: number;
  disabledUntilTableEnd?: boolean;
  forcedStacks?: 1 | 2 | 3 | 4;
  cursedByEventId?: string;
  curseStacks?: Partial<Record<ArtifactCurseId, number>>;
}

export interface OwnedArtifact {
  id: ArtifactId;
  stacks: number; // 1-indexed; Tier IV uses 4 where supported
  status?: ArtifactStatus;
}

export type DealerRank = 'normal' | 'elite' | 'boss' | 'act3Boss' | 'raidBoss' | 'trueBoss';

export interface LedgerEntry {
  source: string;
  points: number;
  act?: number;
  table?: number;
}

export interface LedgerBudget {
  points: number;
  freeGrants?: Array<{ type: 'tier4Artifact' | 'artifact'; count: number; reason: string }>;
  spendingRules: {
    maxArtifacts: number;
    maxTier4Artifacts: number;
    canBuyTier4: boolean;
    canBuyCursedArtifacts: boolean;
    duplicateRollsUpgrade: boolean;
  };
  marketBiases?: ArtifactTag[];
  history?: LedgerEntry[];
}

export interface DealerProfile {
  id: string;
  name: string;
  rank: DealerRank;
  ledger: LedgerBudget;
  artifacts: OwnedArtifact[];
  abilityId?: string;
  futurePairsVisible?: number;
}

export type HouseRule = 'hidden_hand' | 'exact_only' | 'pit_boss' | 'golden_dealer' | null;

export type GamePhase =
  | 'title' | 'table' | 'dealer' | 'result' | 'reward'
  | 'shop' | 'boss_intro' | 'gameover' | 'win' | 'run_log' | 'achievements' | 'compendium' | 'event';

export type TableResult = 'win' | 'lose' | 'bust' | 'tie';

export interface TableConfig {
  label: string;
  target: number;
  rule: HouseRule;
}

export interface BossConfig extends TableConfig {
  isBoss: true;
  name: string;
  flavor: string;
  desc: string;
}

export interface ActConfig {
  name: string;
  subtitle: string;
  tables: TableConfig[];
  boss: BossConfig;
}

export interface TriggerEvent {
  id: string;
  message: string;
  color: string;
}

export interface TableLogEntry {
  label: string;
  amount?: number;
  color?: string;
}

export interface RunLogEntry {
  actName: string;
  tableLabel: string;
  isBoss: boolean;
  result: TableResult;
  playerValue: number;
  dealerValue: number;
  earned: number;
  artifactIds: ArtifactId[];
}

export interface ShopItem {
  id: string;
  type: 'artifact' | 'upgrade' | 'heal' | 'reroll' | 'trinket' | 'golden_chip';
  artifactId?: ArtifactId;
  trinketId?: string;
  label: string;
  description: string;
  cost: number;
  originalCost?: number;   // set when this item is the discounted one
  available: boolean;
  onSale?: boolean;
}

export interface BustResult {
  newLives: number;
  newMoney: number;
  newScUsed: number;
  saved: boolean;
  isSecondChance?: boolean;
  trigger: string | null;
  triggerColor: string;
  pulseId: ArtifactId | null;
}

// ─── Persistence ─────────────────────────────────────────────────

export interface SavedRun {
  id: string;
  date: string;
  outcome: 'win' | 'lose';
  nickname: string;
  actsCleared: number;
  finalTable: string;
  totalMoney: number;
  artifacts: { id: ArtifactId; stacks: number; name: string }[];
  tableLog: RunLogEntry[];
  achievements?: string[];
  tablesWon: number;
  tablesLost: number;
}

export interface PlayerData {
  runs: SavedRun[];
  totalRuns: number;
  totalWins: number;
  bestMoney: number;
  longestRun: number;
  achievements?: string[];
}

// ─── Re-exports ───────────────────────────────────────────────────
export type { GameMode, CharacterId } from './data/characters';
export type { TrinketId } from './data/trinkets';

export interface OwnedTrinket {
  id: import('./data/trinkets').TrinketId;
}