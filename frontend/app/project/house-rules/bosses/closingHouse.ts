// bosses/closingHouse.ts — Closing House true boss (planned, not yet implemented)
// This file holds the stub and design notes for the Closing House fight.

/**
 * Closing House — planned final true boss.
 *
 * Trigger: Closing Time meter reaches 0 during endless mode.
 *
 * Design notes (from README):
 * - Operates as a "true boss" rank dealer
 * - Closing Time has been counting down for the whole run
 * - When it hits 0, the House itself shows up as the final opponent
 * - Should feel distinct from Golden Dealer (which is a raid)
 *
 * Planned mechanics:
 * - Target scales with House Heat level
 * - Dealer starts with Tier IV artifact access
 * - Pull options may be cursed (one option has a negative effect)
 * - Winning restarts Closing Time; losing ends the run
 */

export const CLOSING_HOUSE_RANK = 'trueBoss' as const;

export interface ClosingHouseConfig {
  baseTarget: number;
  dealerRank: typeof CLOSING_HOUSE_RANK;
  flavor: string;
  description: string;
}

export function buildClosingHouseConfig(heatIntensity: number): ClosingHouseConfig {
  return {
    baseTarget: 40 + heatIntensity * 5,
    dealerRank: CLOSING_HOUSE_RANK,
    flavor: '"Last call."',
    description:
      'The House has had enough. Dealer holds Tier IV artifacts and the target rises with the heat. ' +
      'Win to reset Closing Time. Lose to end the run.',
  };
}

// Placeholder — implementation pending
export function isClosingHouseImplemented(): false {
  return false;
}
