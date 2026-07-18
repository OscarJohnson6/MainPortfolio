'use client';
// components/AchievementsView.tsx
import React from 'react';
import type { PlayerData } from '../types';
import type { AchievementDef } from '../data/achievements';

const GOLD = '#c9a84c'; const DIM = '#7a6a4a';

export interface AchievementsViewProps {
  playerData: PlayerData | null; runAchievements: string[];
  achievementDefs: AchievementDef[];
  onClose: () => void;
  AchievementToastLayer: React.ReactNode;
  CSS: string; PAGE: React.CSSProperties;
}

export function AchievementsView({ playerData, runAchievements, achievementDefs, onClose, AchievementToastLayer, CSS, PAGE }: AchievementsViewProps) {
  const unlocked = new Set([...(playerData?.achievements ?? []), ...runAchievements]);
  const unlockedThisRun = new Set(runAchievements);
  const unknownUnlocked = [...unlocked].filter(name => !achievementDefs.some(a => a.name === name));
  return (
    <div style={{ ...PAGE, justifyContent: 'center', padding: '1rem' }} onClick={onClose}>
      <style>{CSS}</style>
      {AchievementToastLayer}
      <div className="pop" style={{ width: 'min(760px,100%)', maxHeight: '88vh', overflowY: 'auto',
        background: '#060e07', border: '1px solid rgba(201,168,76,.28)', borderRadius: '14px',
        boxShadow: '0 24px 80px rgba(0,0,0,.55)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderBottom: '1px solid rgba(201,168,76,.12)' }}>
          <div>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: '13px', color: GOLD, letterSpacing: '.16em' }}>ACHIEVEMENTS</div>
            <div style={{ fontSize: '11px', color: DIM, marginTop: '3px' }}>
              {unlocked.size} unlocked · {runAchievements.length} this run/session
            </div>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: '12px',
              fontFamily: "'Cinzel',serif", letterSpacing: '.12em' }}>CLOSE</button>
        </div>
        <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '10px' }}>
          {achievementDefs.map(a => {
            const isUnlocked = unlocked.has(a.name);
            const session = unlockedThisRun.has(a.name);
            return (
              <div key={a.id} style={{ padding: '12px', borderRadius: '10px',
                background: isUnlocked ? 'rgba(201,168,76,.1)' : 'rgba(0,0,0,.26)',
                border: `1px solid ${isUnlocked ? 'rgba(201,168,76,.34)' : 'rgba(255,255,255,.06)'}`,
                opacity: isUnlocked ? 1 : .58 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'baseline' }}>
                  <div style={{ fontFamily: "'Cinzel',serif", color: isUnlocked ? GOLD : '#7a6a4a', fontSize: '12px', fontWeight: 700 }}>
                    {isUnlocked ? '✦ ' : '◇ '}{a.name}
                  </div>
                  <div style={{ fontSize: '9px', color: session ? '#facc15' : '#4a4035', letterSpacing: '.12em', fontFamily: "'Cinzel',serif" }}>
                    {session ? 'THIS RUN' : a.category.toUpperCase()}
                  </div>
                </div>
                <div style={{ marginTop: '6px', fontSize: '11px', color: isUnlocked ? '#b8a890' : '#5a4e38', lineHeight: 1.45 }}>{a.description}</div>
              </div>
            );
          })}
          {unknownUnlocked.map(name => (
            <div key={name} style={{ padding: '12px', borderRadius: '10px', background: 'rgba(201,168,76,.1)', border: '1px solid rgba(201,168,76,.34)' }}>
              <div style={{ fontFamily: "'Cinzel',serif", color: GOLD, fontSize: '12px', fontWeight: 700 }}>✦ {name}</div>
              <div style={{ marginTop: '6px', fontSize: '11px', color: '#b8a890' }}>Unlocked achievement.</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
