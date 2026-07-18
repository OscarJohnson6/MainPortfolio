// logic/shopLogic.ts — shop item generation
import type { ArtifactId, OwnedArtifact, ShopItem } from '../types';
import { ARTIFACT_DEFS, getArtifactEffect, ALL_ARTIFACT_IDS } from '../data/artifacts';
import { shuffle, toRomanNumeral } from './engine';
import { TRINKET_DEFS, TRINKET_IDS } from '../data/trinkets';

// ─── Shop items ───────────────────────────────────────────────────
// Prices are meaningfully high to create real decisions.
// One item per shop visit gets a 35% discount.
// Trinkets are included as purchasable items.

export function generateShopItems(
  arts: OwnedArtifact[],
  money: number,
  lives: number,
  maxLives: number,
  gameMode: 'card' | 'alphabet' = 'card',
  showdownEnabled: boolean = false,
  opts: { rerollCost?: number; includeHeal?: boolean; shopKind?: 'main' | 'last_call' } = {},
): ShopItem[] {
  const items: ShopItem[] = [];
  const ownedIds = new Set(arts.map(a => a.id));

  const shopKind = opts.shopKind ?? 'main';
  const artifactOfferCount = shopKind === 'last_call' ? 1 : (Math.random() < 0.35 ? 3 : 2);
  const upgradeOfferCount = shopKind === 'last_call' ? 1 : (artifactOfferCount >= 3 ? 1 : 2);

  // ── New artifacts ──────────────────────────────────────────────
  const unowned = shuffle(ALL_ARTIFACT_IDS.filter(id => !ownedIds.has(id)));
  for (let i = 0; i < Math.min(artifactOfferCount, unowned.length); i++) {
    const id = unowned[i];
    const def = ARTIFACT_DEFS[id];
    const baseCost = def.rarity === 'rare' ? 14 : def.rarity === 'uncommon' ? 10 : 7;
    items.push({
      id: `new_${id}`, type: 'artifact', artifactId: id,
      label: def.name,
      description: `I: ${def.stacks[0].description}`,
      cost: baseCost, available: money >= baseCost,
    });
  }

  // ── Upgrades ──────────────────────────────────────────────────
  const upgradeable = shuffle(arts.filter(a => a.stacks < ARTIFACT_DEFS[a.id].maxStacks));
  for (let i = 0; i < Math.min(upgradeOfferCount, upgradeable.length); i++) {
    const art = upgradeable[i];
    const def = ARTIFACT_DEFS[art.id];
    const next = def.stacks[art.stacks];
    const baseCost = 6;
    items.push({
      id: `upgrade_${art.id}`, type: 'upgrade', artifactId: art.id,
      label: `${def.name} ${toRomanNumeral(art.stacks)} → ${toRomanNumeral(art.stacks + 1)}`,
      description: next?.description ?? 'Already maxed',
      cost: baseCost, available: money >= baseCost,
    });
  }

  // ── Trinkets ────────────────────────────────────────────────
  const bagEff = getArtifactEffect('bag_of_holding' as ArtifactId, arts);
  const trinketOfferCount = 2 + (bagEff?.trinketDiscount ? 1 : 0);
  const trinketDiscount = bagEff?.trinketDiscount ?? 0;
  const availableTrinkets = shuffle(
    TRINKET_IDS.filter(id => {
      const def = TRINKET_DEFS[id];
      if (def.showdownOnly && !showdownEnabled) return false;
      if (def.alphabetOnly && gameMode !== 'alphabet') return false;
      return true;
    })
  );
  for (let i = 0; i < Math.min(trinketOfferCount, availableTrinkets.length); i++) {
    const id = availableTrinkets[i];
    const def = TRINKET_DEFS[id];
    items.push({
      id: `trinket_${id}`, type: 'trinket', trinketId: id,
      label: `${def.icon} ${def.name}`,
      description: def.description,
      cost: Math.max(1, def.cost - trinketDiscount), available: money >= Math.max(1, def.cost - trinketDiscount),
    });
  }

  // ── Heal / desperation service ───────────────────────────────
  if ((opts.includeHeal ?? true) && lives < maxLives) {
    items.push({
      id: 'heal', type: 'heal',
      label: 'Patch Up',
      description: 'Restore one heart. Expensive enough that it costs build power.',
      cost: 12, available: money >= 12,
    });
  }

  // ── Reroll ────────────────────────────────────────────────────
  items.push({
    id: 'reroll', type: 'reroll',
    label: 'Reroll Shop',
    description: 'Get a fresh set of items.',
    cost: opts.rerollCost ?? 3, available: money >= (opts.rerollCost ?? 3),
  });

  // ── Apply one random discount (35% off, min $1 saved) ─────────
  const discountable = items.filter(i => i.type !== 'reroll' && i.cost > 3);
  if (discountable.length > 0) {
    const pick = discountable[Math.floor(Math.random() * discountable.length)];
    const idx = items.findIndex(i => i.id === pick.id);
    const originalCost = items[idx].cost;
    const discounted = Math.max(1, Math.floor(originalCost * 0.65));
    items[idx] = {
      ...items[idx],
      originalCost,
      cost: discounted,
      onSale: true,
      available: money >= discounted,
    };
  }

  return items;
}

// ─── Utilities ────────────────────────────────────────────────────
