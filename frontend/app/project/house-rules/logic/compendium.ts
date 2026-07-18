// logic/compendium.ts — compendium data: artifact descriptions, boss entries
// The compendium is a read-only reference view in the game.
import type { ArtifactId } from '../types';
import { ARTIFACT_DEFS, ALL_ARTIFACT_IDS } from '../data/artifacts';
import { TRINKET_DEFS, TRINKET_IDS } from '../data/trinkets';
import { ACTS } from './endless';

export interface CompendiumArtifactEntry {
  id: ArtifactId;
  name: string;
  rarity: string;
  tags: string[];
  color: string;
  stacks: { description: string }[];
}

export interface CompendiumTrinketEntry {
  id: string;
  name: string;
  icon: string;
  color: string;
  description: string;
  cost: number;
}

export interface CompendiumBossEntry {
  name: string;
  act: string;
  target: number;
  rule: string | null;
  desc: string;
  flavor: string;
}

export function getAllArtifactEntries(): CompendiumArtifactEntry[] {
  return ALL_ARTIFACT_IDS.map(id => {
    const def = ARTIFACT_DEFS[id];
    return {
      id,
      name: def.name,
      rarity: def.rarity,
      tags: def.tags,
      color: def.color,
      stacks: def.stacks.filter(Boolean).map(s => ({ description: s!.description })),
    };
  });
}

export function getAllTrinketEntries(): CompendiumTrinketEntry[] {
  return TRINKET_IDS.map(id => {
    const def = TRINKET_DEFS[id];
    return { id, name: def.name, icon: def.icon, color: def.color, description: def.description, cost: def.cost };
  });
}

export function getAllBossEntries(): CompendiumBossEntry[] {
  return ACTS.map(act => ({
    name:   act.boss.name,
    act:    act.name,
    target: act.boss.target,
    rule:   act.boss.rule,
    desc:   act.boss.desc,
    flavor: act.boss.flavor,
  }));
}
