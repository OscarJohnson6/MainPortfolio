'use client';
// components/GameOverView.tsx
import React from 'react';
import type { OwnedArtifact, RunLogEntry } from '../types';
import { ACTS } from '../data/acts';
import { ARTIFACT_DEFS } from '../data/artifacts';
import { ArtifactBadge } from './ArtifactBadge';
import { Btn } from './Button';

const DIM = '#7a6a4a';

export interface GameOverViewProps {
  actIdx: number; money: number; nickname: string;
  runLog: RunLogEntry[]; artifacts: OwnedArtifact[];
  onNewRun: () => void; onOpenRunLog: () => void;
  CSS: string; PAGE: React.CSSProperties;
}

export function GameOverView({ actIdx, money, nickname, runLog, artifacts, onNewRun, onOpenRunLog, CSS, PAGE }: GameOverViewProps) {
  return (
    <div style={{ ...PAGE, justifyContent: 'center' }}>
      <style>{CSS}</style>
      <div className="fade" style={{ textAlign: 'center', padding: '3rem 2rem', maxWidth: '460px', width: '100%' }}>
        <div style={{ fontSize: '40px', color: 'rgba(80,40,40,.4)', marginBottom: '14px' }}>♠</div>
        <h2 style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: '1.9rem', color: '#ef4444', margin: '0 0 8px', fontWeight: 700 }}>
          HOUSE WINS
        </h2>
        <p style={{ color: DIM, fontSize: '14px', margin: '0 0 4px' }}>
          Act {actIdx + 1} of {ACTS.length} · ${money} earned
        </p>
        <p style={{ color: DIM, fontSize: '13px', fontFamily: "'Cinzel',serif", marginBottom: '4px' }}>{nickname}</p>
        <p style={{ color: '#4a4035', fontSize: '12px', marginBottom: '20px' }}>
          {runLog.filter(e => e.result === 'win').length} tables won · {runLog.filter(e => e.result !== 'win').length} lost
        </p>
        {artifacts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', justifyContent: 'center', marginBottom: '20px' }}>
            {artifacts.map(a => <ArtifactBadge key={a.id} art={a} />)}
          </div>
        )}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Btn onClick={onNewRun}>DEAL AGAIN</Btn>
          <Btn onClick={onOpenRunLog} variant="ghost">RUN LOG</Btn>
        </div>
      </div>
    </div>
  );
}
