'use client';
// components/ResultView.tsx
import React from 'react';
import type { TableResult, TableLogEntry, Card, OwnedArtifact } from '../types';
import { handValue } from '../logic/engine';
import { artifactStacks } from '../data/artifacts';
import { PlayingCard } from './PlayingCard';
import { HeartDisplay, TriggerLayer } from './RunTracker';
import { Btn } from './Button';

const GOLD = '#c9a84c'; const DIM = '#7a6a4a';

export interface ResultViewProps {
  result: TableResult | null; msg: string;
  tableLog: TableLogEntry[]; tableEarned: number;
  dealerHand: Card[]; playerHand: Card[];
  target: number; lives: number; heartBreakIdx: number;
  isBoss: boolean; artifacts: OwnedArtifact[];
  onContinue: () => void; onEndRun: () => void;
  SCOverlay: React.ReactNode; Toast: React.ReactNode;
  QuickMenu: React.ReactNode; AchievementToastLayer: React.ReactNode;
  triggers: any[]; CSS: string; PAGE: React.CSSProperties;
  overtimeTarget?: number;
}

export function ResultView({ result, msg, tableLog, tableEarned, dealerHand, playerHand,
  target, lives, heartBreakIdx, isBoss, artifacts,
  onContinue, onEndRun, SCOverlay, Toast, QuickMenu, AchievementToastLayer,
  triggers, CSS, PAGE, overtimeTarget }: ResultViewProps) {
  const contrarianStacks = artifactStacks('contrarian_deck', artifacts);
  const aceLicStacks     = artifactStacks('ace_license', artifacts);
  const win  = result === 'win', bust = result === 'bust', tie = result === 'tie';
  const ac   = win ? '#22c55e' : tie ? '#94a3b8' : '#ef4444';
  const fDV  = handValue(dealerHand, target);
  const fPV  = handValue(playerHand, target, contrarianStacks, aceLicStacks);
  const continueHint = tie
    ? `Overtime: target rises to ${overtimeTarget ?? target + 8}; both hands and dealer queue stay live.`
    : (!win && lives > 0)
      ? (isBoss ? 'Boss loss: lose a heart and repeat this boss fight.' : 'Loss accepted: lose a heart and move to the next table.')
      : null;
  return (
    <div style={{ ...PAGE, justifyContent: 'center' }}>
      <style>{CSS}</style>
      {SCOverlay}{Toast}{QuickMenu}{AchievementToastLayer}
      <TriggerLayer triggers={triggers} />
      <div className="pop" style={{ textAlign: 'center', padding: '2rem 1.5rem', maxWidth: '440px', width: 'calc(100% - 2rem)' }}>
        <div style={{ fontSize: '38px', marginBottom: '8px', lineHeight: 1, color: ac }}>{win ? '✦' : tie ? '↔' : '✕'}</div>
        <h2 style={{ fontFamily: "'Cinzel',serif", fontSize: '1.65rem', fontWeight: 600, color: ac, margin: '0 0 6px' }}>
          {win ? 'YOU WIN' : tie ? 'PUSH' : bust ? 'BUST' : 'DEALER WINS'}
        </h2>
        <p style={{ fontSize: '14px', color: '#b8a890', margin: '0 0 16px', lineHeight: 1.6 }}>{msg}</p>
        {tableLog.length > 0 && (
          <div style={{ margin: '0 0 16px', padding: '12px', background: 'rgba(0,0,0,.3)',
            borderRadius: '8px', border: '1px solid rgba(201,168,76,.12)', textAlign: 'left' }}>
            {tableLog.map((e, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px',
                color: e.color ?? '#b8a890', padding: '2px 0' }}>
                <span>{e.label}</span>
                {e.amount != null && <span style={{ color: e.amount >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                  {e.amount >= 0 ? '+' : ''}${e.amount}
                </span>}
              </div>
            ))}
            {tableEarned > 0 && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', marginTop: '6px', paddingTop: '6px',
                display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: GOLD, fontWeight: 600 }}>
                <span>Total earned</span><span>+${tableEarned}</span>
              </div>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: '24px', justifyContent: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '9px', color: DIM, letterSpacing: '.22em', marginBottom: '6px', fontFamily: "'Cinzel',serif" }}>
              DEALER · {fDV > target ? 'BUST' : fDV}
            </div>
            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {dealerHand.map(c => <PlayingCard key={c.id} card={c} sm />)}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '9px', color: DIM, letterSpacing: '.22em', marginBottom: '6px', fontFamily: "'Cinzel',serif" }}>
              YOU · {fPV > target ? 'BUST' : fPV}
            </div>
            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
              {playerHand.map(c => <PlayingCard key={c.id} card={c} sm />)}
            </div>
          </div>
        </div>
        <div style={{ marginBottom: '18px' }}><HeartDisplay lives={lives} breakIdx={heartBreakIdx} /></div>
        {continueHint && (
          <div style={{ margin: '0 auto 16px', padding: '9px 11px', borderRadius: '8px', maxWidth: '340px',
            background: 'rgba(0,0,0,.28)', border: '1px solid rgba(255,255,255,.08)',
            fontSize: '12px', color: '#8a7a6a', lineHeight: 1.45, fontFamily: "'EB Garamond',serif" }}>
            {continueHint}
          </div>
        )}
        {!win && lives <= 0
          ? <Btn onClick={onEndRun} variant="red">END RUN</Btn>
          : <Btn onClick={onContinue}>{win ? 'COLLECT REWARD' : tie ? 'OVERTIME' : 'CONTINUE'}</Btn>}
      </div>
    </div>
  );
}
