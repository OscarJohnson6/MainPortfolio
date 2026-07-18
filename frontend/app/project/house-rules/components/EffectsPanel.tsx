'use client';
// components/EffectsPanel.tsx — BoI-style effects sidebar
import React from 'react';
import type { OwnedArtifact, Card } from '../types';
import { ARTIFACT_DEFS } from '../data/artifacts';
import { toRomanNumeral } from '../logic/engine';
import { getCardAct } from '../data/acts';

const GOLD = '#c9a84c';
const DIM  = '#7a6a4a';

// ─── Effects Panel (BoI-style sidebar) ───────────────────────────

interface EffectsPanelProps {
  artifacts: OwnedArtifact[];
  queenSavesLeft: number;
  jackActive: boolean;
  jackPeeks: Card[];
  contrarianStacks: number;
  contrarianUsesLeft?: number;
  crookedPawnRank?: Card['rank'] | null;
  royalEchoUsesLeft?: number;
  titheFree: boolean;
  houseRule: 'hidden_hand' | 'exact_only' | 'pit_boss' | 'golden_dealer' | null;
  target: number;
  isBoss: boolean;
  actIdx: number;
  tableIdx: number;
  pitBossPhase?: 1 | 2;
  pitBannedRank?: Card['rank'] | null;
  pitBannedFaceRank?: Card['rank'] | null;
  goldenRaidActive?: boolean;
  goldenGate?: 1 | 2;
  goldenOpIndex?: number;
  goldenChips?: number;
  closingTime?: number;
}

export function EffectsPanel({ artifacts, queenSavesLeft, jackActive, jackPeeks,
  contrarianStacks, contrarianUsesLeft = 0, crookedPawnRank = null, royalEchoUsesLeft = 0, titheFree, houseRule, target, isBoss, actIdx, tableIdx, pitBossPhase = 1, pitBannedRank = null, pitBannedFaceRank = null, goldenRaidActive = false, goldenGate = 1, goldenOpIndex = 0, goldenChips = 0, closingTime = 0 }: EffectsPanelProps) {
  const act    = getCardAct(actIdx);
  const tLabel = isBoss ? act.boss.name : act.tables[Math.min(tableIdx, act.tables.length - 1)]?.label ?? '';

  const active: { icon: string; label: string; color: string }[] = [];
  if (queenSavesLeft > 0) active.push({ icon: '♛', color: '#a855f7', label: `${queenSavesLeft} bust save${queenSavesLeft > 1 ? 's' : ''} ready` });
  if (jackActive)          active.push({ icon: '⚜', color: '#94a3b8', label: 'Next pull shows +1 option' });
  if (jackPeeks.length > 0) active.push({ icon: '⦿', color: '#94a3b8', label: `Peeking: ${jackPeeks.map(c => c.rank + c.suit).join(' ')}` });
  if (contrarianUsesLeft > 0) active.push({ icon: '⇄', color: '#f59e0b', label: `${contrarianUsesLeft} Contrarian negative${contrarianUsesLeft === 1 ? '' : 's'} left` });
  if (royalEchoUsesLeft > 0) active.push({ icon: '♔', color: '#f0abfc', label: `${royalEchoUsesLeft} Royal Echo charge${royalEchoUsesLeft === 1 ? '' : 's'}` });
  if (titheFree)           active.push({ icon: '✦', color: '#dc2626', label: 'Pulls free — stand penalty active' });

  const sec: React.CSSProperties = { background: 'rgba(0,0,0,.38)', borderRadius: '8px', padding: '10px', border: '1px solid rgba(255,255,255,.05)' };
  const hdr: React.CSSProperties = { fontSize: '8px', letterSpacing: '.28em', color: DIM, fontFamily: "'Cinzel',serif", marginBottom: '7px' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '0 0 14px' }}>

      {/* Table info */}
      <div style={sec}>
        <div style={hdr}>TABLE</div>
        <div style={{ fontSize: '12px', color: '#e8d8b4', marginBottom: '3px', fontFamily: "'Cinzel',serif" }}>{tLabel}</div>
        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
          <span style={{ fontSize: '11px', color: GOLD }}>target {target}</span>
          {isBoss && <span style={{ fontSize: '9px', color: '#ef4444', background: 'rgba(239,68,68,.12)', border: '1px solid rgba(239,68,68,.3)', borderRadius: '3px', padding: '1px 5px' }}>BOSS</span>}
        </div>
        {houseRule === 'hidden_hand' && <div style={{ marginTop: '5px', fontSize: '10px', color: '#fb923c', lineHeight: 1.45 }}>⚠ Hidden Hand — one option face-down</div>}
        {houseRule === 'exact_only'  && <div style={{ marginTop: '5px', fontSize: '10px', color: '#ef4444', lineHeight: 1.45 }}>⚠ Exact Only — hit {target} precisely</div>}
        {houseRule === 'pit_boss' && <div style={{ marginTop: '5px', fontSize: '10px', color: '#f87171', lineHeight: 1.45 }}>⚠ Pit Boss Phase {pitBossPhase} — artifacts locked; {pitBossPhase === 1 ? 'one number rank' : 'one number + one face rank'} can be crossed out.</div>}
        {(pitBannedRank || pitBannedFaceRank) && <div style={{ marginTop: '4px', fontSize: '10px', color: '#ef4444', lineHeight: 1.45 }}>Current ban: {[pitBannedRank, pitBannedFaceRank].filter(Boolean).map(r => r === 'A' ? 'Ace rank' : r === 'K' ? 'King rank' : r === 'Q' ? 'Queen rank' : r === 'J' ? 'Jack rank' : `${r} rank`).join(' + ')} cannot be chosen.</div>}
        {houseRule === 'golden_dealer' && <div style={{ marginTop: '5px', fontSize: '10px', color: '#f59e0b', lineHeight: 1.45 }}>⚠ Golden Dealer Gate {goldenGate} — operation clock is {['+','−','×','÷'][goldenOpIndex % 4]}. Draws after the first cost $2.</div>}
        {closingTime > 0 && !goldenRaidActive && <div style={{ marginTop: '4px', fontSize: '10px', color: '#fb923c', lineHeight: 1.45 }}>Closing Time: {closingTime}</div>}
      </div>

      {/* Active transient effects */}
      {active.length > 0 && (
        <div style={sec}>
          <div style={hdr}>ACTIVE</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {active.map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: '7px', alignItems: 'baseline', fontSize: '11px' }}>
                <span style={{ color: e.color, flexShrink: 0 }}>{e.icon}</span>
                <span style={{ color: '#b8a890', lineHeight: 1.4 }}>{e.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Build modifiers: passive effects that are always part of the run/table */}
      {(contrarianStacks > 0 || crookedPawnRank) && (
        <div style={sec}>
          <div style={hdr}>BUILD MODIFIERS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '11px', color: '#b8a890' }}>
            {contrarianStacks > 0 && <div>⇄ Contrarian Deck — first odd cards become negative this table.</div>}
            {crookedPawnRank && <div>♟ Crooked Pawn — {crookedPawnRank}s subtract this table.</div>}
          </div>
        </div>
      )}

      {/* Artifacts dossier */}
      {artifacts.length > 0 ? (
        <div style={sec}>
          <div style={hdr}>ARTIFACTS</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
            {artifacts.map(art => {
              const def = ARTIFACT_DEFS[art.id];
              const eff = def.stacks[art.stacks - 1];
              return (
                <div key={art.id} style={{ borderLeft: `2px solid ${def.color}55`, paddingLeft: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                    <span style={{ fontSize: '11px', color: def.color, fontFamily: "'Cinzel',serif", fontWeight: 600 }}>{def.name}</span>
                    <span style={{ fontSize: '9px', color: def.color, opacity: .65, fontFamily: "'Cinzel',serif" }}>{toRomanNumeral(art.stacks)}</span>
                  </div>
                  <div style={{ fontSize: '10px', color: '#6a5a4a', lineHeight: 1.45 }}>{eff?.description}</div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div style={{ ...sec, textAlign: 'center', padding: '18px 10px' }}>
          <div style={{ fontSize: '11px', color: '#4a4035', fontStyle: 'italic', fontFamily: "'EB Garamond',serif" }}>No artifacts yet.</div>
          <div style={{ fontSize: '10px', color: '#3a3028', marginTop: '3px' }}>Win tables to earn rewards.</div>
        </div>
      )}
    </div>
  );
}
