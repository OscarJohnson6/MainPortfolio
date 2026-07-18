'use client';
// components/WinView.tsx
import React from 'react';
import type { OwnedArtifact, RunLogEntry } from '../types';
import { ALL_ARTIFACT_IDS } from '../data/artifacts';
import { ACTS } from '../data/acts';
import { ArtifactBadge } from './ArtifactBadge';
import { Btn } from './Button';

const GOLD = '#c9a84c'; const DIM = '#7a6a4a';

export interface WinViewProps {
  actIdx: number; money: number; nickname: string; closingTime: number;
  runLog: RunLogEntry[]; artifacts: OwnedArtifact[];
  gameMode: string;
  onRetire: () => void; onKeepPlaying: () => void;
  onNewRun: () => void; onOpenRunLog: () => void;
  CSS: string; PAGE: React.CSSProperties;
}

export function WinView({ actIdx, money, nickname, closingTime, runLog, artifacts, gameMode,
  onRetire, onKeepPlaying, onNewRun, onOpenRunLog, CSS, PAGE }: WinViewProps) {
  return (
    <div style={{ ...PAGE, justifyContent: 'center' }}>
      <style>{CSS}</style>
      <div className="pop" style={{ textAlign: 'center', padding: '3rem 2rem', maxWidth: '460px', width: '100%' }}>
        <div className="glow" style={{ fontSize: '40px', color: GOLD, marginBottom: '14px' }}>♛</div>
        <h2 style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: '2rem', color: GOLD, margin: '0 0 8px', fontWeight: 700, textShadow: '0 0 18px rgba(201,168,76,.35)' }}>
          YOU WIN
        </h2>
        <p style={{ color: '#b8a890', fontSize: '14px', marginBottom: '4px' }}>
          {actIdx >= ACTS.length ? 'House Heat survived. You can retire or keep going.' : 'Act III cleared. You beat the House.'}
        </p>
        <p style={{ color: DIM, fontSize: '13px', fontFamily: "'Cinzel',serif", marginBottom: '4px' }}>{nickname}</p>
        <p style={{ color: DIM, fontSize: '12px', marginBottom: '22px' }}>
          ${money} earned · {artifacts.length}/{ALL_ARTIFACT_IDS.length} artifacts · {runLog.filter(e => e.result === 'win').length} tables won · Closing Time {closingTime}
        </p>
        {artifacts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', marginBottom: '24px' }}>
            {artifacts.map(a => <ArtifactBadge key={a.id} art={a} />)}
          </div>
        )}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Btn onClick={onRetire}>RETIRE RUN</Btn>
          {gameMode === 'card' && <Btn onClick={onKeepPlaying} variant="ghost">KEEP PLAYING</Btn>}
          <Btn onClick={onOpenRunLog} variant="ghost">RUN LOG</Btn>
          <Btn onClick={onNewRun} variant="ghost">NEW RUN</Btn>
        </div>
      </div>
    </div>
  );
}
