// ─────────────────────────────────────────────────────────────────
// characters.ts  —  game modes and starting characters
// ─────────────────────────────────────────────────────────────────

import type { ArtifactId, OwnedArtifact } from '../types';

// ─── Game Modes ───────────────────────────────────────────────────
// GameMode controls which symbol system is used (cards vs letters).
// Showdown is a separate boolean modifier that works on top of any mode.

export type GameMode = 'card' | 'alphabet';

export interface GameModeDef {
  id: GameMode;
  name: string;
  shortName: string;
  description: string;
  badge: string;
}

export const GAME_MODES: GameModeDef[] = [
  {
    id: 'card',
    name: 'Card Mode',
    shortName: 'CARD',
    description: 'Standard blackjack-inspired roguelite. Royal cards have special effects.',
    badge: '♠',
  },
  {
    id: 'alphabet',
    name: 'Alphabet Mode',
    shortName: 'ALPHA',
    description: 'Letters A=1 through Z=26. Form words to clear tables. Risk high values to spell.',
    badge: 'Α',
  },
];

// ─── Characters ───────────────────────────────────────────────────

export type CharacterId = 'newcomer' | 'iron_deal' | 'the_ghost' | 'high_roller';

export interface CharacterDef {
  id: CharacterId;
  name: string;
  title: string;
  flavor: string;
  startLives: number;
  startMoney: number;
  startArtifacts: { id: ArtifactId; stacks: number }[];
  randomStartArtifacts: number;
  perk: string;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'newcomer',
    name: 'The Newcomer',
    title: 'Standard',
    flavor: '"Everyone starts somewhere."',
    startLives: 2,
    startMoney: 2,    // pocket change to feel less empty
    startArtifacts: [],
    randomStartArtifacts: 0,
    perk: 'Balanced start. Full artifact pool. No modifiers.',
  },
  {
    id: 'iron_deal',
    name: 'Iron Deal',
    title: 'Hardcore',
    flavor: '"One mistake. Make it count."',
    startLives: 1,
    startMoney: 2,
    startArtifacts: [],
    randomStartArtifacts: 2,
    perk: 'One life. 2 random starter artifacts. High risk, strong foundation.',
  },
  {
    id: 'the_ghost',
    name: 'The Ghost',
    title: 'Survivor',
    flavor: '"Still here."',
    startLives: 1,
    startMoney: 0,
    startArtifacts: [
      { id: 'second_chance', stacks: 1 },
      { id: 'queens_mercy',  stacks: 1 },
    ],
    randomStartArtifacts: 0,
    perk: 'One life. Starts with Second Chance + Queen\'s Mercy. Built to survive.',
  },
  {
    id: 'high_roller',
    name: 'High Roller',
    title: 'All-In',
    flavor: '"The house always pays. Eventually."',
    startLives: 2,
    startMoney: 8,
    startArtifacts: [{ id: 'high_stakes', stacks: 1 }],
    randomStartArtifacts: 0,
    perk: 'Starts with High Stakes I and $8. Losses hurt more.',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────

export function buildStartArtifacts(
  char: CharacterDef,
  allIds: ArtifactId[],
  shuffleFn: <T>(arr: T[]) => T[],
): OwnedArtifact[] {
  const base: OwnedArtifact[] = char.startArtifacts.map(a => ({ id: a.id, stacks: a.stacks }));
  if (char.randomStartArtifacts > 0) {
    const excluded = new Set(base.map(a => a.id));
    const randoms: OwnedArtifact[] = shuffleFn(allIds.filter(id => !excluded.has(id)))
      .slice(0, char.randomStartArtifacts)
      .map(id => ({ id, stacks: 1 }));
    return [...base, ...randoms];
  }
  return base;
}