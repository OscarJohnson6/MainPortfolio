'use client';
// components/TrinketBar.tsx
import React from 'react';
import type { TrinketId } from '../data/trinkets';
import { TRINKET_DEFS } from '../data/trinkets';

const DIM = '#7a6a4a';

export interface TrinketBarProps {
  trinkets: TrinketId[];
  onUse: (id: TrinketId) => void;
  canUse: boolean;
  showdownEnabled: boolean;
}

export function TrinketBar({ trinkets, onUse, canUse, showdownEnabled }: TrinketBarProps) {
  if (!trinkets.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', padding: '4px 0' }}>
      <span style={{ fontSize: '8px', letterSpacing: '.26em', color: DIM, fontFamily: "'Cinzel',serif" }}>TRINKETS</span>
      {trinkets.map((id, idx) => {
        const def = TRINKET_DEFS[id];
        const disabled = !canUse || (def.showdownOnly && !showdownEnabled);
        return (
          <button key={`${id}-${idx}`} onClick={() => !disabled && onUse(id)}
            title={`${def.name}: ${def.description}`}
            style={{
              display: 'flex', gap: '4px', alignItems: 'center',
              padding: '3px 9px', borderRadius: '4px', cursor: disabled ? 'not-allowed' : 'pointer',
              background: 'rgba(0,0,0,.45)',
              border: `1px solid ${disabled ? 'rgba(255,255,255,.06)' : def.color + '66'}`,
              color: disabled ? '#3a3a3a' : def.color,
              fontSize: '11px', fontFamily: "'Cinzel',serif", letterSpacing: '.06em',
              transition: 'all .14s ease', opacity: disabled ? .45 : 1,
            }}>
            <span style={{ fontSize: '13px', lineHeight: 1 }}>{def.icon}</span>
            <span>{def.name}</span>
          </button>
        );
      })}
    </div>
  );
}
