// data/events.ts — all event definitions (pure data, no React/state)
// Outcomes are handled in HouseRules.tsx via resolveEventChoice().

import type { OwnedArtifact, ArtifactId } from '../types';

// ─── Types ───────────────────────────────────────────────────────────

export type EventId =
  | 'golden_idol'
  | 'janitors_closet'
  | 'dumpster_dive'
  | 'night_shift'
  | 'blacksmith'
  | 'surprise_boss'
  | 'jesters_entry'
  | 'the_offer'
  | 'black_market'
  | 'hallway_of_offers'
  | 'second_deck'
  | 'mirror_hallway'
  | 'the_loan'
  | 'house_inspection'
  | 'the_wager'
  | 'night_shift_peek';

export type EventTrigger =
  | 'random'          // standard probability roll between tables
  | 'cold_streak'     // fires after 2 consecutive losses
  | 'win_streak'      // fires after 3 consecutive wins
  | 'shallow_build'   // fires when player has 4+ artifact stacks but no Tier III
  | 'offer_followup'; // fires after The Offer contract completes

export interface EventChoiceDef {
  id: string;
  label: string;
  description: string;
  /** Show this choice only when the condition is met. Undefined = always shown. */
  condition?: 'has_15'|'has_8'|'has_trinket'|'has_artifact'|'has_tier3'|'has_event_artifact'|'has_second_wind';
  danger?: boolean;   // highlight as risky
}

export interface EventDef {
  id: EventId;
  title: string;
  flavor: string;
  body: string;
  trigger: EventTrigger;
  /** Earliest act index this can appear (0 = Act I). */
  minAct?: number;
  /** Latest act index this can appear. */
  maxAct?: number;
  /** Relative weight in random pool (higher = more common). Default 1. */
  weight?: number;
  /** This event cannot appear twice in the same run. */
  unique?: boolean;
  /** Keep authored events out of the live pool until their runtime/UI handler is complete. */
  enabled?: boolean;
  choices: EventChoiceDef[];
}

// ─── Event definitions ───────────────────────────────────────────────

export const EVENT_DEFS: Record<EventId, EventDef> = {

  golden_idol: {
    id: 'golden_idol',
    title: 'The Relic',
    flavor: '"It was just sitting there."',
    body: 'A golden object sits unattended on a side table. Unmarked. Unclaimed. You could pocket it for $75 — but something about it feels heavy.',
    trigger: 'random',
    minAct: 1,
    unique: true,
    weight: 1,
    choices: [
      { id: 'take',    label: 'Take it — $75',    description: 'Gain $75 now. Every table from here on costs $5. If you cannot pay, lose 1 life instead. Permanent.' },
      { id: 'leave',   label: 'Leave it',          description: 'Walk away. Nothing happens.' },
    ],
  },

  janitors_closet: {
    id: 'janitors_closet',
    title: "The Janitor's Closet",
    flavor: '"Someone left the door open."',
    body: "The supply closet is unlocked. You can hear mopping down the hall. Three things catch your eye.",
    trigger: 'random',
    weight: 2,
    choices: [
      { id: 'tumble',  label: 'Knock a shelf',     description: 'One random artifact is replaced with a different random one at the same tier. No preview, no undo.' },
      { id: 'gooped',  label: 'Take the gooped object', description: 'Gain a random artifact at Tier I — but it arrives cursed.' },
      { id: 'steal',   label: 'Steal $15 from the cart', description: 'Gain $15. Draw one fewer card per turn for the next 2 tables.', danger: true },
      { id: 'leave',   label: 'Close the door',    description: 'Leave without touching anything.' },
    ],
  },

  dumpster_dive: {
    id: 'dumpster_dive',
    title: 'The Dumpster',
    flavor: '"One person\'s junk."',
    body: 'A dumpster near the exit. You can see something glinting inside. Each pull is a random grab — and you never know what comes next.',
    trigger: 'random',
    weight: 2,
    choices: [
      { id: 'reach',   label: 'Reach in (Pull 1)', description: 'Draw one random item from the pile. You can keep pulling after. Each pull is independent — money, trinkets, artifacts, or worse.' },
      { id: 'leave',   label: 'Walk past',         description: 'You have standards. Probably.' },
    ],
  },

  night_shift: {
    id: 'night_shift',
    title: 'The Night Shift Worker',
    flavor: '"Long night, isn\'t it."',
    body: 'An overnight dealer stops you in the corridor. They look tired and underpaid. They offer to look the other way — for a price.',
    trigger: 'random',
    weight: 3,
    choices: [
      { id: 'pay',     label: 'Bribe — $8',        description: 'Pay $8. Draw one extra card per turn for the next 4 tables.',
        condition: 'has_8' },
      { id: 'trade',   label: 'Trade an artifact stack', description: 'Drop one stack from any artifact. Receive 2 random Tier I artifacts in return.',
        condition: 'has_artifact' },
      { id: 'refuse',  label: 'Ignore them',       description: 'Walk away. They get annoyed. One artifact is banned for the next table.', danger: true },
    ],
  },

  blacksmith: {
    id: 'blacksmith',
    title: 'The Blacksmith',
    flavor: '"I can make it better."',
    body: 'A forge in a maintenance corridor. The smith looks at your build and offers their services.',
    trigger: 'random',
    minAct: 1,
    weight: 1,
    choices: [
      { id: 'forge_t4',    label: 'Upgrade Tier III → IV — $20', description: 'Choose one Tier III artifact. Upgrade it to Tier IV permanently.',
        condition: 'has_tier3' },
      { id: 'forge_event', label: 'Purify cursed artifact — $15', description: 'Upgrade a cursed event artifact from Tier I to Tier IV.',
        condition: 'has_event_artifact' },
      { id: 'forge_new',   label: 'Commission new work',  description: 'Receive one random Tier III and one random Tier II artifact. Prices shown when you choose.' },
      { id: 'leave',       label: 'Not interested',       description: 'Walk on.' },
    ],
  },

  surprise_boss: {
    id: 'surprise_boss',
    title: 'The Early Arrival',
    flavor: '"I believe we had an appointment."',
    body: 'The act boss is walking toward you — now, before the tables are cleared. Three options before it reaches you.',
    trigger: 'random',
    // Act indexes are zero-based. This encounter is reserved for endless mode
    // so it cannot replace one of the three authored campaign bosses.
    minAct: 3,
    weight: 1,
    unique: false,
    choices: [
      { id: 'fight',   label: 'Face them now',     description: 'Boss fight begins immediately. Win and skip straight to the act reward, bypassing remaining tables. Lose and normal boss-loss rules apply.' },
      { id: 'pay',     label: 'Pay them off — $15', description: 'They turn around. Normal act progression continues.',
        condition: 'has_15' },
      { id: 'trade',   label: 'Give up a trinket', description: 'Same as paying — they take a trinket and leave.',
        condition: 'has_trinket' },
      { id: 'burn',    label: 'Burn an artifact',  description: 'Sacrifice one artifact permanently. They leave satisfied.',
        condition: 'has_artifact' },
    ],
  },

  jesters_entry: {
    id: 'jesters_entry',
    title: 'The Jester',
    flavor: '"Any card you like, friend."',
    body: 'A figure in motley offers to deal themselves into your game. Accept and the Jester shuffles into your draw pile — a card that lets you choose any face card effect at value 9.',
    trigger: 'random',
    weight: 2,
    unique: true,
    enabled: false, // requires a Jester rank/effect in Card and PlayingCard
    choices: [
      { id: 'accept',  label: 'Accept the deal',   description: 'The Jester (value 9, choose any face card effect) is shuffled into your deck for the rest of the run.' },
      { id: 'decline', label: 'Decline',           description: 'They bow and disappear.' },
    ],
  },

  the_offer: {
    id: 'the_offer',
    title: 'The Offer',
    flavor: '"Three tables. That\'s all I\'m asking."',
    body: 'A figure wants to hold one of your artifacts — your choice — for the next three tables. Win all three and you get it back plus a reward. Lose any one and the artifact is gone permanently.',
    trigger: 'random',
    minAct: 1,
    weight: 1,
    unique: true,
    enabled: false, // requires artifact selection and contract-resolution UI
    choices: [
      { id: 'accept',  label: 'Sign the contract', description: 'Choose which artifact to stake. Win 3 tables without it and choose: upgrade it to Tier IV, receive a random Tier III artifact, or restore 1 life.',
        condition: 'has_artifact' },
      { id: 'decline', label: 'Pass',              description: 'Not worth the risk.' },
    ],
  },

  black_market: {
    id: 'black_market',
    title: 'The Black Market',
    flavor: '"No questions. No receipts."',
    body: 'A shadow counter in a back corridor. Three items, all discounted 40%. Two of them are cursed — and you cannot tell which until you buy.',
    trigger: 'random',
    weight: 2,
    enabled: false, // requires the dedicated cursed-shop view
    choices: [
      { id: 'inspect', label: 'Pay $5 to identify curses', description: 'The seller marks which items are cursed. You can then buy freely.' },
      { id: 'browse',  label: 'Browse blind',             description: 'Shop without the $5 reveal. What you see is what you get.' },
      { id: 'leave',   label: 'Keep walking',             description: 'Too sketchy.' },
    ],
  },

  hallway_of_offers: {
    id: 'hallway_of_offers',
    title: 'Three Doors',
    flavor: '"One opens. The others stay closed."',
    body: 'Three doors. Small labels on each: MONEY, ARTIFACT, UNKNOWN. You may open one. Or none.',
    trigger: 'random',
    weight: 3,
    choices: [
      { id: 'money',    label: 'MONEY',   description: 'Gain $20.' },
      { id: 'artifact', label: 'ARTIFACT', description: 'Receive one random artifact upgrade — existing artifact moves up one tier, or a new Tier II if all are maxed.' },
      { id: 'unknown',  label: 'UNKNOWN', description: 'Could be a Tier IV artifact, life restore, a curse, or nothing. Exact contents unknown.', danger: true },
      { id: 'leave',    label: 'Walk past', description: 'Leave all three closed.' },
    ],
  },

  second_deck: {
    id: 'second_deck',
    title: 'The Extra Deck',
    flavor: '"Someone left this."',
    body: 'A second shuffled deck sits on an empty table. Merging it into the current deck doubles card availability — including face cards.',
    trigger: 'random',
    weight: 1,
    unique: true,
    choices: [
      { id: 'merge',   label: 'Merge the decks',   description: 'Deck grows to 104 cards. All cards become twice as likely. Face card doubling artifacts interact with this.' },
      { id: 'leave',   label: 'Leave it',           description: 'Ignore the extra deck.' },
    ],
  },

  mirror_hallway: {
    id: 'mirror_hallway',
    title: 'Hallway of Mirrors',
    flavor: '"Every reflection is a choice."',
    body: 'A corridor lined with mirrors, each showing a different version of your hand. You can copy a card from your current hand into your draw pile — but it costs a life.',
    trigger: 'random',
    weight: 1,
    enabled: false, // requires card selection and persistent deck mutation
    choices: [
      { id: 'enter',   label: 'Step in — copy a card, lose 1 life', description: 'Choose a card from your current hand. A copy is added to your draw pile. If you have a life-restore effect, a second mirror appears.',
        danger: true,
        condition: 'has_artifact' },
      { id: 'flee',    label: 'Flee',               description: 'Walk away with nothing.' },
    ],
  },

  house_inspection: {
    id: 'house_inspection',
    title: 'House Inspection',
    flavor: '"Standard procedure."',
    body: 'Security wants to review your artifacts. Pay $3 per artifact you hold or surrender a trinket. Refuse entirely and one artifact is confiscated permanently.',
    trigger: 'random',
    weight: 2,
    choices: [
      { id: 'pay',     label: 'Pay inspection fee', description: '$3 per artifact in your build.' },
      { id: 'trinket', label: 'Give a trinket',      description: 'Hand over a random trinket. Inspection satisfied.',
        condition: 'has_trinket' },
      { id: 'refuse',  label: 'Refuse',              description: 'One artifact is confiscated permanently. They were never going to be friendly.', danger: true },
    ],
  },

  // These two fire on specific streak conditions
  the_loan: {
    id: 'the_loan',
    title: 'The Desperate Offer',
    flavor: '"I know things have been rough."',
    body: "After two straight losses, someone approaches with a briefcase. They offer a way out — but nothing from a briefcase comes free.",
    trigger: 'cold_streak',
    weight: 2,
    unique: true,
    choices: [
      { id: 'accept',  label: 'Take the $20',       description: 'Gain $20 now. One random artifact is temporarily suppressed for the next table as collateral.' },
      { id: 'decline', label: 'Pass',               description: 'Turn it down.' },
    ],
  },

  the_wager: {
    id: 'the_wager',
    title: 'The Wager',
    flavor: '"Prove it."',
    body: "After three straight wins, someone slides a contract across the table. Stake one artifact for three tables. Win all three and get it back with a bonus reward.",
    trigger: 'win_streak',
    weight: 1,
    unique: true,
    enabled: false, // shares The Offer's unfinished contract flow
    choices: [
      { id: 'accept',  label: 'Sign the contract',  description: 'Stake one artifact. Win the next 3 tables to recover it plus choose Tier IV upgrade, new Tier III, or life restore.',
        condition: 'has_artifact' },
      { id: 'decline', label: 'No thanks',          description: 'Walk away with your streak intact.' },
    ],
  },

  night_shift_peek: {
    id: 'night_shift_peek',
    title: 'The Night Shift — Information',
    flavor: '"For the right price."',
    body: 'The overnight dealer offers to let you see the top 4 cards of the next table\'s deck.',
    trigger: 'random',
    weight: 2,
    enabled: false, // requires a next-deck preview/removal view
    choices: [
      { id: 'peek',        label: 'Peek — $6',             description: 'See the top 4 cards of next table\'s deck.',
        condition: 'has_8' },
      { id: 'peek_remove', label: 'Peek and remove — $10', description: 'See top 4 and choose one to send to the bottom of the deck.' },
      { id: 'decline',     label: 'Not interested',        description: 'Walk away.' },
    ],
  },
};

export const EVENT_IDS = Object.keys(EVENT_DEFS) as EventId[];

/** Build the weighted random pool for a given act and run context. */
export function buildEventPool(
  actIdx: number,
  seenEvents: EventId[],
  winStreak: number,
  lossStreak: number,
): EventId[] {
  const pool: EventId[] = [];
  for (const [id, def] of Object.entries(EVENT_DEFS) as [EventId, EventDef][]) {
    if (def.enabled === false) continue;
    if (def.unique && seenEvents.includes(id)) continue;
    if (def.minAct != null && actIdx < def.minAct) continue;
    if (def.maxAct != null && actIdx > def.maxAct) continue;
    if (def.trigger === 'cold_streak' && lossStreak < 2) continue;
    if (def.trigger === 'win_streak'  && winStreak < 3) continue;
    if (def.trigger === 'offer_followup') continue; // handled manually
    const w = def.weight ?? 1;
    for (let i = 0; i < w; i++) pool.push(id);
  }
  return pool;
}

/** Pick a random event from the pool. Returns null if pool empty. */
export function pickRandomEvent(pool: EventId[]): EventId | null {
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Base probability of an event firing between tables. */
export const EVENT_BASE_CHANCE = 0.17; // ~17% per eligible table transition