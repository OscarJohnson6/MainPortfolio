'use client';
// components/ArtifactBadge.tsx
// Small artifact chip shown in ShopView, RunLogView, EffectsPanel, and HouseRules.

import React from 'react';
import type { OwnedArtifact } from '../types';
import { ARTIFACT_DEFS, effectiveArtifactStacks } from '../data/artifacts';
import { toRomanNumeral } from '../logic/engine';

export function ArtifactBadge({ art, pulsing }: { art: OwnedArtifact; pulsing?: boolean }) {
  const def = ARTIFACT_DEFS[art.id];
  const effectiveStacks = effectiveArtifactStacks(art);
  const locked = effectiveStacks <= 0 || art.status?.lockedForFight;
  const suppressed = art.status?.forcedStacks != null && art.status.forcedStacks < art.stacks;
  const labelStacks = effectiveStacks > 0 ? effectiveStacks : art.stacks;
  return (
    <div title={`${def.name} ${toRomanNumeral(labelStacks)}: ${locked ? 'Locked by the Pit Boss for this fight.' : def.stacks[Math.max(0, labelStacks - 1)]?.description ?? ''}`}
      style={{
        display: 'flex', gap: '4px', alignItems: 'center',
        padding: '3px 8px', borderRadius: '4px', fontSize: '11px',
        background: locked ? 'rgba(80,0,0,.28)' : 'rgba(0,0,0,.4)', border: `1px solid ${locked ? '#ef444488' : def.color + '44'}`,
        color: locked ? '#ef4444' : def.color, cursor: 'help', opacity: locked ? .7 : 1,
        animation: pulsing ? 'badgePulse .4s ease 3' : 'none',
      }}>
      <i className={`ti ${def.icon}`} style={{ fontSize: '12px' }} aria-hidden />
      <span>{def.name}</span>
      <span style={{ opacity: .7, fontSize: '10px', fontFamily: "'Cinzel',serif" }}>
        {locked ? 'LOCKED' : suppressed ? `${toRomanNumeral(art.stacks)}→${toRomanNumeral(labelStacks)}` : toRomanNumeral(labelStacks)}
      </span>
    </div>
  );
}
