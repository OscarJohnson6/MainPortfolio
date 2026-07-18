// logic/achievements.ts — all achievement definitions and unlock helpers

export interface AchievementDef {
  id: string;
  name: string;
  category: string;
  description: string;
}

export const ACHIEVEMENT_DEFS: AchievementDef[] = [

  // ── Campaign progression ──────────────────────────────────────────
  { id: 'first_win',         name: 'Opening Hand',       category: 'Campaign', description: 'Win your first table.' },
  { id: 'act1_clear',        name: 'Back Room Pass',     category: 'Campaign', description: 'Beat the Hidden Hand.' },
  { id: 'act2_clear',        name: 'Exact Change',       category: 'Campaign', description: 'Beat the Exact Accountant.' },
  { id: 'act3_clear',        name: 'Pit Survivor',       category: 'Campaign', description: 'Beat the Pit Boss.' },
  { id: 'all_acts',          name: 'House Rules',        category: 'Campaign', description: 'Clear all three campaign acts in one run.' },
  { id: 'pit_phase2',        name: 'Phase II',           category: 'Campaign', description: 'Reach Pit Boss Phase II.' },
  { id: 'boss_untouched',    name: 'Pristine',           category: 'Campaign', description: 'Beat any boss without losing a life.' },
  { id: 'boss_quickdraw',    name: 'Quickdraw',          category: 'Campaign', description: 'Beat a boss after pulling only once.' },
  { id: 'boss_perfect',      name: 'Perfect Standing',   category: 'Campaign', description: 'Beat a boss with a perfect clear.' },
  { id: 'last_life_boss',    name: 'On the Edge',        category: 'Campaign', description: 'Beat a boss with exactly 1 life remaining.' },
  { id: 'boss_retry_win',    name: 'Stubborn',           category: 'Campaign', description: 'Win a boss fight on retry after a loss.' },

  // ── Endless ───────────────────────────────────────────────────────
  { id: 'endless_enter',     name: 'Into the Heat',      category: 'Endless',  description: 'Reach Act IV (endless mode).' },
  { id: 'heat3',             name: 'House Heat III',     category: 'Endless',  description: 'Reach Act VI.' },
  { id: 'heat_cap',          name: 'Maximum Heat',       category: 'Endless',  description: 'Reach Act VII (heat cap).' },
  { id: 'endless10',         name: 'Long Night',         category: 'Endless',  description: 'Survive 10+ tables in endless mode.' },
  { id: 'closing_time_100',  name: 'Last Call Coming',   category: 'Endless',  description: 'Let Closing Time reach 100.' },

  // ── Cards / drawing ───────────────────────────────────────────────
  { id: 'big_hand',          name: 'Big Hand',           category: 'Cards',    description: 'Draw 6 or more cards in a single table.' },
  { id: 'bigger_hand',       name: 'Grand Hand',         category: 'Cards',    description: 'Draw 10 or more cards in a single table.' },
  { id: 'four_kind',         name: 'Four of a Kind',     category: 'Cards',    description: 'Play the same rank four times in one hand.' },
  { id: 'four_suits',        name: 'Full Suit',          category: 'Cards',    description: 'Play one card of every suit in a single table.' },
  { id: 'all_faces',         name: 'Royal Court',        category: 'Cards',    description: 'Hold all four face card ranks (J Q K A) in one hand.' },
  { id: 'perfect_10',        name: 'Perfect Form',       category: 'Cards',    description: 'Get 10 perfect clears across a single run.' },
  { id: 'perfect_streak3',   name: 'On Fire',            category: 'Cards',    description: 'Get 3 perfect clears in a row.' },
  { id: 'overtime_win',      name: 'Overtime',           category: 'Cards',    description: 'Win a table after entering overtime.' },
  { id: 'overtime_streak',   name: 'Extra Innings',      category: 'Cards',    description: 'Win 3 overtime tables in a single run.' },
  { id: 'survive_3busts',    name: 'Barely Standing',    category: 'Cards',    description: 'Survive 3 busts in a single table via save effects.' },
  { id: 'clean_act',         name: 'Flawless Act',       category: 'Cards',    description: 'Win every table in an act without a single bust.' },
  { id: 'jester_play',       name: 'Jester Choice',      category: 'Cards',    description: 'Play the Jester card during a boss fight.' },
  { id: 'jester_closing',    name: 'Jester Last Laugh',  category: 'Cards',    description: 'Play the Jester during the Closing House.' },

  // ── Build / artifacts ─────────────────────────────────────────────
  { id: 'triple_crown',      name: 'Triple Crown',       category: 'Build',    description: 'Hold 3 artifacts at Tier III or higher simultaneously.' },
  { id: 'legendary',         name: 'Legendary',          category: 'Build',    description: 'Upgrade any artifact to Tier IV.' },
  { id: 'the_set',           name: 'The Set',            category: 'Build',    description: 'Hold 5 artifacts simultaneously.' },
  { id: 'hoarder',           name: 'Hoarder',            category: 'Build',    description: 'Hold 7 artifacts simultaneously.' },
  { id: 'royal_four',        name: 'Full Court',         category: 'Build',    description: 'Hold all four royal artifacts simultaneously.' },
  { id: 'carry_curse',       name: 'Cursed',             category: 'Build',    description: 'Carry a cursed artifact through an entire act without purifying.' },
  { id: 'purified',          name: 'Cleansed',           category: 'Build',    description: 'Upgrade a cursed event artifact to Tier IV.' },
  { id: 'qm_sacrifice',      name: 'The Trade',          category: 'Build',    description: "Sacrifice an artifact to avoid death via Queen's Mercy Tier IV." },
  { id: 'qm_self_sac',       name: 'Graceful Exit',      category: 'Build',    description: "Sacrifice Queen's Mercy itself to avoid death." },
  { id: 'odd_saint',         name: 'Odd Saint',          category: 'Build',    description: 'Restore a life with Odd Pilgrimage.' },
  { id: 'edge_master',       name: 'Edge Master',        category: 'Build',    description: 'Earn the Edge Work bonus 10 times in one run.' },
  { id: 'streak_five',       name: 'Hot Streak',         category: 'Build',    description: 'Win 5 tables in a row.' },

  // ── Economy ───────────────────────────────────────────────────────
  { id: 'high_roller',       name: 'High Roller',        category: 'Economy',  description: 'Accumulate $100 at any point in a run.' },
  { id: 'gold_standard',     name: 'Gold Standard',      category: 'Economy',  description: 'Accumulate $200 at any point in a run.' },
  { id: 'golden_idol_take',  name: 'Stolen Relic',       category: 'Economy',  description: 'Take the Golden Idol.' },
  { id: 'idol_survived',     name: 'Finders Keepers',    category: 'Economy',  description: 'Carry the Golden Idol drain for 5+ tables without losing a life to it.' },
  { id: 'piggy_full',        name: 'Nest Egg',           category: 'Economy',  description: 'Cash out a Piggy Bank worth $30 or more.' },
  { id: 'black_market_3',    name: 'Back Alley Regular', category: 'Economy',  description: 'Buy 3 items in a single Black Market event.' },

  // ── Golden Dealer ─────────────────────────────────────────────────
  { id: 'golden_invitation', name: 'Golden Invitation',  category: 'Raid',     description: 'Collect 3 Golden Chips.' },
  { id: 'gate1_clear',       name: 'Gate I',             category: 'Raid',     description: 'Clear Golden Dealer Gate I.' },
  { id: 'house_cracker',     name: 'House Cracker',      category: 'Raid',     description: 'Clear both Golden Dealer gates.' },
  { id: 'golden_perfect',    name: 'Golden Clear',       category: 'Raid',     description: 'Get a perfect clear during the Golden Dealer raid.' },

  // ── Events ────────────────────────────────────────────────────────
  { id: 'first_event',       name: 'Something Off',      category: 'Events',   description: 'Encounter your first event.' },
  { id: 'mirror_thrice',     name: 'Hall of Mirrors',    category: 'Events',   description: 'Enter the Mirror Hallway 3 times in one event.' },
  { id: 'dumpster_deep',     name: 'Dumpster Fire',      category: 'Events',   description: 'Reach pull 5 in the Dumpster Dive.' },
  { id: 'offer_won',         name: 'The Deal Stands',    category: 'Events',   description: 'Win all 3 tables of The Offer contract.' },
  { id: 'night_survived',    name: 'Night Owl',          category: 'Events',   description: 'Survive the Night Shift Worker without paying or trading.' },
  { id: 'surprise_fight',    name: 'Unexpected Guest',   category: 'Events',   description: 'Win the Surprise Boss encounter.' },
  { id: 'blacksmith_t4',     name: 'Masterwork',         category: 'Events',   description: 'Use the Blacksmith to reach Tier IV.' },
  { id: 'pocket_storm',      name: 'Pocket Storm',       category: 'Trinkets', description: 'Trigger a trinket echo chain.' },

  // ── Alphabet Mode ─────────────────────────────────────────────────
  { id: 'first_word',        name: 'First Word',         category: 'Alphabet', description: 'Get your first Word Clear.' },
  { id: 'librarian',         name: 'Librarian',          category: 'Alphabet', description: 'Get 5 Word Clears in one run.' },
  { id: 'perfect_spell',     name: 'Perfect Spell',      category: 'Alphabet', description: 'Get a Perfect Clear in Alphabet Mode.' },
  { id: 'censored',          name: 'Censored',           category: 'Alphabet', description: 'Survive a table with The Censor boss.' },
  { id: 'editor_clear',      name: 'Edited Out',         category: 'Alphabet', description: 'Beat The Editor boss.' },
  { id: 'long_word',         name: 'Lexicon',            category: 'Alphabet', description: 'Form a 6+ letter word in a single hand.' },
];

export function isAchievementUnlocked(id: string, unlocked: string[]): boolean {
  const def = getAchievementById(id);
  return unlocked.includes(id) || (!!def && unlocked.includes(def.name));
}

/** Add name string to unlocked array if not already present. */
export function unlockAchievement(name: string, current: string[]): string[] {
  if (current.includes(name)) return current;
  return [...current, name];
}

export function getAchievementById(id: string): AchievementDef | undefined {
  return ACHIEVEMENT_DEFS.find(a => a.id === id);
}

/** Check a batch of id→boolean conditions, return newly-unlocked achievement names. */
export function checkAchievements(
  conditions: Partial<Record<string, boolean>>,
  already: string[],
): string[] {
  const newly: string[] = [];
  for (const [id, passes] of Object.entries(conditions)) {
    if (!passes) continue;
    const def = getAchievementById(id);
    if (!def) continue;
    // Existing saves store achievement names. Accept ids too so this helper
    // remains compatible if persistence is normalized in a future version.
    if (!already.includes(id) && !already.includes(def.name)) newly.push(def.name);
  }
  return newly;
}