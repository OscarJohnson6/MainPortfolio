'use client';
// components/RunTracker.tsx — RunTracker, HeartDisplay, TriggerLayer
import React from 'react';
import type { DealerRank, TriggerEvent } from '../types';
import { getCardAct } from '../data/acts';

const GOLD = '#c9a84c';
const DIM  = '#7a6a4a';

// ─── HeartDisplay ─────────────────────────────────────────────────
export function HeartDisplay({ lives, breakIdx }: { lives: number; breakIdx: number }) {
  return (
    <span style={{ fontSize: '18px', letterSpacing: '3px' }}>
      {[0, 1].map(i => (
        <span key={i} style={{
          color: i < lives ? '#e8394a' : 'rgba(80,40,40,.4)',
          animation: i === breakIdx ? 'heartBreak .6s ease forwards'
            : (lives === 1 && i === 0) ? 'throb 1.4s ease infinite' : 'none',
          display: 'inline-block',
        }}>{i < lives ? '♥' : '♡'}</span>
      ))}
    </span>
  );
}

// ─── TriggerLayer ────────────────────────────────────────────────
export function TriggerLayer({ triggers }: { triggers: TriggerEvent[] }) {
  if (!triggers.length) return null;
  return (
    <div style={{ position: 'fixed', top: '32%', left: '50%', transform: 'translateX(-50%)',
      zIndex: 200, pointerEvents: 'none', display: 'flex', flexDirection: 'column',
      alignItems: 'center', gap: '6px' }}>
      {triggers.map(t => (
        <div key={t.id} style={{
          color: t.color, fontFamily: "'Cinzel',serif", fontSize: '13px',
          fontWeight: 600, letterSpacing: '.1em', textShadow: '0 2px 8px rgba(0,0,0,.8)',
          animation: 'floatUp 2.4s ease forwards',
        }}>{t.message}</div>
      ))}
    </div>
  );
}

// ─── RunTracker ──────────────────────────────────────────────────
// Computes act data internally from actIdx — call site only needs the
// same props it always had.
export function RunTracker({ actIdx, tableIdx, isBoss, dealerName, dealerRank, ledgerTotal }: {
  actIdx: number;
  tableIdx: number;
  isBoss: boolean;
  dealerName?: string;
  dealerRank?: DealerRank;
  ledgerTotal?: number;
}) {
  const act = getCardAct(actIdx);
  const actTables   = act.tables;
  const actBossName = act.boss.name;
  const actBossTarget = act.boss.target;
  const actName     = act.name;

  const [burning, setBurning] = React.useState(false);
  const prevAct = React.useRef(actIdx);

  React.useEffect(() => {
    if (prevAct.current !== actIdx) {
      setBurning(true);
      const t = setTimeout(() => setBurning(false), 900);
      prevAct.current = actIdx;
      return () => clearTimeout(t);
    }
  }, [actIdx]);

  const nextLabel = isBoss
    ? actBossName
    : actTables[Math.min(tableIdx, actTables.length - 1)]?.label ?? 'Table';

  const info = [
    `Current: ${isBoss ? 'Boss' : 'Table'} — ${nextLabel}`,
    dealerName  ? `Dealer: ${dealerName}` : null,
    dealerRank  ? `Rank: ${dealerRank}`   : null,
    typeof ledgerTotal === 'number' ? `House Ledger: ${ledgerTotal}` : null,
  ].filter(Boolean).join('\n');

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center',
      gap: '10px', fontSize: '11px', fontFamily: "'Cinzel',serif", letterSpacing: '.1em', width: '100%' }}>

      {/* Table progress dots */}
      <div style={{ display: 'flex', gap: '5px', alignItems: 'center', minWidth: 0,
        overflowX: 'auto', paddingBottom: '2px' }}>
        {actTables.map((t, i) => {
          const done    = isBoss || i < tableIdx;
          const current = !isBoss && i === tableIdx;
          return (
            <React.Fragment key={i}>
              {i > 0 && <span style={{ color: '#3a3a3a' }}>›</span>}
              <span title={`${t.label} · target ${t.target}`} style={{
                width: '24px', height: '22px', display: 'inline-flex', alignItems: 'center',
                justifyContent: 'center', borderRadius: '6px', flexShrink: 0,
                background: current ? 'rgba(201,168,76,.18)' : done ? 'rgba(74,122,74,.12)' : 'transparent',
                border: `1px solid ${current ? '#c9a84c' : done ? '#3a5a3a' : '#2a2a2a'}`,
                color:  current ? '#c9a84c' : done ? '#4a7a4a' : '#5a4e38',
              }}>
                {done ? '✓' : current ? '●' : '○'}
              </span>
            </React.Fragment>
          );
        })}
        <span style={{ color: '#3a3a3a' }}>›</span>
        <span title={`${actBossName} · target ${actBossTarget}`} style={{
          width: '26px', height: '22px', display: 'inline-flex', alignItems: 'center',
          justifyContent: 'center', borderRadius: '6px', flexShrink: 0,
          background: isBoss ? 'rgba(220,38,38,.18)' : 'transparent',
          border: `1px solid ${isBoss ? '#dc2626' : '#2a2a2a'}`,
          color: isBoss ? '#f87171' : '#5a4e38',
        }}>☠</span>
      </div>

      {/* Act badge */}
      <div className={burning ? 'actBurn' : ''} style={{
        minWidth: '78px', textAlign: 'center', borderRadius: '999px',
        padding: '5px 12px', color: GOLD, border: '1px solid rgba(201,168,76,.32)',
        background: 'rgba(0,0,0,.32)', boxShadow: 'inset 0 0 14px rgba(201,168,76,.06)',
        fontWeight: 700,
      }}>
        {actName}
      </div>

      {/* Current label + info tooltip */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center',
        gap: '8px', minWidth: 0 }}>
        <span style={{ color: DIM, overflow: 'hidden', textOverflow: 'ellipsis',
          whiteSpace: 'nowrap', maxWidth: '170px' }}>
          {isBoss ? actBossName : nextLabel}
        </span>
        <span title={info} style={{
          width: '22px', height: '22px', borderRadius: '50%',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: GOLD, border: '1px solid rgba(201,168,76,.28)',
          background: 'rgba(0,0,0,.35)', cursor: 'help', fontSize: '12px', flexShrink: 0,
        }}>i</span>
      </div>
    </div>
  );
}