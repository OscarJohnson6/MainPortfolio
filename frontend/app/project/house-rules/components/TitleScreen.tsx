'use client';
// components/TitleScreen.tsx — title + run setup screen
import React from 'react';
import type { GameMode, CharacterId } from '../data/characters';
import type { PlayerData } from '../types';
import { GAME_MODES, CHARACTERS } from '../data/characters';
import { Btn } from './Button';

const GOLD = '#c9a84c';
const DIM  = '#7a6a4a';

export interface TitleScreenProps {
  selectedGameMode: GameMode;
  selectedChar: CharacterId;
  showdownSelected: boolean;
  onSelectMode: (m: GameMode) => void;
  onSelectChar: (c: CharacterId) => void;
  onToggleShowdown: () => void;
  onNewRun: () => void;
  onLoadRun: () => void;
  onExportSave: () => void;
  onImportSave: (ref: React.RefObject<HTMLInputElement | null>) => void;
  hasResumeSave: boolean;
  resumeSummary: string | null;
  playerData: PlayerData | null;
  saveImportRef: React.RefObject<HTMLInputElement | null>;
  onOpenRunLog: () => void;
  onOpenAchievements: () => void;
  onOpenCompendium: () => void;
  AchievementToastLayer: React.ReactNode;
  CSS: string;
  PAGE: React.CSSProperties;
}

export function TitleScreen({
  selectedGameMode, selectedChar, showdownSelected,
  onSelectMode, onSelectChar, onToggleShowdown,
  onNewRun, onLoadRun, onExportSave, onImportSave,
  hasResumeSave, resumeSummary, playerData, saveImportRef,
  onOpenRunLog, onOpenAchievements, onOpenCompendium,
  AchievementToastLayer, CSS, PAGE,
}: TitleScreenProps) {
  return (
    <div style={{ ...PAGE, justifyContent: 'center' }}>
      <style>{CSS}</style>
      {AchievementToastLayer}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg,transparent,${GOLD},transparent)` }}/>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '2px', background: `linear-gradient(90deg,transparent,${GOLD},transparent)` }}/>
      <div className="fade" style={{ textAlign: 'center', padding: '2rem 1.5rem', maxWidth: '660px', width: '100%' }}>
        <div className="glow" style={{ fontSize: '22px', color: GOLD, letterSpacing: '.55em', marginBottom: '1rem' }}>♠ ♥ ♦ ♣</div>
        <h1 style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 'clamp(1.8rem,7vw,2.9rem)', fontWeight: 700,
          color: GOLD, margin: '0 0 .3rem', letterSpacing: '.06em', textShadow: '0 0 28px rgba(201,168,76,.35)' }}>
          HOUSE RULES
        </h1>
        <p style={{ fontFamily: "'EB Garamond',serif", fontStyle: 'italic', fontSize: '1.05rem', color: DIM, margin: '0 0 1.6rem' }}>
          A blackjack-inspired roguelite
        </p>
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '10px' }}>
          {GAME_MODES.map(m => (
            <button key={m.id} onClick={() => onSelectMode(m.id)}
              style={{ flex: 1, maxWidth: '220px', padding: '12px 14px', borderRadius: '8px',
                cursor: 'pointer', transition: 'all .15s ease', textAlign: 'left',
                background: selectedGameMode === m.id ? 'rgba(201,168,76,.14)' : 'rgba(0,0,0,.3)',
                border: `1.5px solid ${selectedGameMode === m.id ? GOLD : 'rgba(255,255,255,.07)'}` }}>
              <div style={{ fontSize: '18px', marginBottom: '3px' }}>{m.badge}</div>
              <div style={{ fontFamily: "'Cinzel',serif", fontSize: '13px', fontWeight: 600,
                color: selectedGameMode === m.id ? GOLD : '#e8d8b4', marginBottom: '3px' }}>{m.name}</div>
              <div style={{ fontSize: '10px', color: '#5a4e38', lineHeight: 1.4 }}>{m.description}</div>
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          marginBottom: '1.4rem', cursor: 'pointer' }}
          onClick={onToggleShowdown}>
          <div style={{ width: '16px', height: '16px', borderRadius: '3px', flexShrink: 0,
            border: `1.5px solid ${showdownSelected ? GOLD : 'rgba(255,255,255,.18)'}`,
            background: showdownSelected ? 'rgba(201,168,76,.18)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: GOLD }}>
            {showdownSelected ? '✓' : ''}
          </div>
          <span style={{ fontSize: '12px', color: showdownSelected ? GOLD : DIM, fontFamily: "'Cinzel',serif", letterSpacing: '.08em' }}>
            ⚔ Showdown Mode
          </span>
          <span style={{ fontSize: '10px', color: '#4a4035' }}>— dealer draws alongside you</span>
        </div>
        <div style={{ marginBottom: '1.6rem' }}>
          <div style={{ fontSize: '9px', letterSpacing: '.28em', color: DIM, fontFamily: "'Cinzel',serif", marginBottom: '8px' }}>BUILD</div>
          <div style={{ display: 'flex', gap: '7px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {CHARACTERS.map(c => (
              <button key={c.id} onClick={() => onSelectChar(c.id)}
                style={{ padding: '9px 11px', borderRadius: '8px', cursor: 'pointer', transition: 'all .15s ease',
                  width: '145px', textAlign: 'left',
                  background: selectedChar === c.id ? 'rgba(201,168,76,.1)' : 'rgba(0,0,0,.3)',
                  border: `1px solid ${selectedChar === c.id ? GOLD : 'rgba(255,255,255,.07)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
                  <span style={{ fontSize: '12px', fontFamily: "'Cinzel',serif", fontWeight: 600, color: selectedChar === c.id ? GOLD : '#e8d8b4' }}>{c.name}</span>
                  <span style={{ fontSize: '9px', color: DIM }}>{c.title}</span>
                </div>
                <div style={{ display: 'flex', gap: '7px', fontSize: '10px', color: DIM, marginBottom: '3px' }}>
                  <span>{"\u2665".repeat(c.startLives)}{"\u2661".repeat(2 - c.startLives)}</span>
                  <span>${c.startMoney}</span>
                </div>
                <div style={{ fontSize: '10px', color: '#5a4e38', lineHeight: 1.4 }}>{c.perk}</div>
              </button>
            ))}
          </div>
        </div>
        <div style={{ width: '160px', height: '1px', margin: '0 auto 1.4rem', background: `linear-gradient(90deg,transparent,${GOLD},transparent)` }}/>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Btn onClick={onNewRun}>DEAL IN</Btn>
          {hasResumeSave && <Btn onClick={onLoadRun} variant="ghost">CONTINUE</Btn>}
          <input ref={saveImportRef} type="file" accept="application/json" style={{ display: 'none' }}
            onChange={e => onImportSave(saveImportRef)} />
        </div>
        {hasResumeSave && resumeSummary && (
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#5a4e38', fontFamily: "'EB Garamond',serif", fontStyle: 'italic' }}>
            Saved run: {resumeSummary}
          </div>
        )}
        <div style={{ marginTop: '1rem', display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {playerData && (
            <button onClick={onOpenRunLog}
              style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer',
                fontSize: '12px', fontFamily: "'Cinzel',serif", letterSpacing: '.15em', textDecoration: 'underline' }}>
              RUN HISTORY ({playerData.runs.length})
            </button>
          )}
          <button onClick={onOpenAchievements}
            style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer',
              fontSize: '12px', fontFamily: "'Cinzel',serif", letterSpacing: '.15em', textDecoration: 'underline' }}>
            ACHIEVEMENTS
          </button>
          <button onClick={onOpenCompendium}
            style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer',
              fontSize: '12px', fontFamily: "'Cinzel',serif", letterSpacing: '.15em', textDecoration: 'underline' }}>
            COMPENDIUM
          </button>
          {hasResumeSave && (
            <button onClick={onExportSave}
              style={{ background: 'none', border: 'none', color: '#4a4035', cursor: 'pointer',
                fontSize: '11px', fontFamily: "'Cinzel',serif", letterSpacing: '.12em', textDecoration: 'underline' }}>
              EXPORT SAVE
            </button>
          )}
          <button onClick={() => saveImportRef.current?.click()}
            style={{ background: 'none', border: 'none', color: '#4a4035', cursor: 'pointer',
              fontSize: '11px', fontFamily: "'Cinzel',serif", letterSpacing: '.12em', textDecoration: 'underline' }}>
            IMPORT SAVE
          </button>
        </div>
        <p style={{ marginTop: '1rem', fontSize: '11px', color: '#4a4035', fontFamily: "'EB Garamond',serif" }}>
          Card Mode · Alphabet Mode · 20 Artifacts · Trinkets · 4 Builds
        </p>
      </div>
    </div>
  );
}
