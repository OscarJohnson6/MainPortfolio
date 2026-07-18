'use client';
// components/LetterCard.tsx  — LetterCard + WordStatusPanel
import React, { useState } from 'react';
import type { LetterTile, WordClearStatus } from '../logic/letterEngine';
import { getWordStatus, letterHandValue } from '../logic/letterEngine';

const GOLD = '#c9a84c';

export interface LetterCardProps {
  tile: LetterTile;
  faceDown?: boolean;
  sm?: boolean;
  onClick?: () => void;
  bright?: boolean;
  dimmed?: boolean;
  bannedLetter?: string | null;
}

export function LetterCard({ tile, faceDown, sm, onClick, bright, dimmed, bannedLetter }: LetterCardProps) {
  const [hov, setHov] = useState(false);
  const W = sm ? '48px' : '68px', H = sm ? '68px' : '98px';
  const isBanned = !!bannedLetter && tile.letter === bannedLetter;

  const base: React.CSSProperties = {
    width: W, height: H, borderRadius: '8px', flexShrink: 0,
    cursor: (onClick && !isBanned) ? 'pointer' : 'default',
    transition: 'transform .15s ease, box-shadow .15s ease',
    transform: (hov && onClick && !isBanned) ? 'translateY(-10px) scale(1.06)' : 'none',
    position: 'relative', display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center',
    opacity: (dimmed || isBanned) ? (isBanned ? .55 : .35) : 1, userSelect: 'none',
  };

  if (faceDown) return (
    <div style={{ ...base, background: '#1a3556', border: '1.5px solid #3a6090', boxShadow: '0 2px 8px rgba(0,0,0,.4)' }}
      onMouseEnter={() => onClick && setHov(true)} onMouseLeave={() => setHov(false)}>
      <div style={{ fontSize: sm ? '14px' : '20px', color: '#2a5080', fontWeight: 'bold' }}>?</div>
    </div>
  );

  const bg        = isBanned ? '#2a1010' : tile.isVowel ? '#fffbeb' : '#f0f0ff';
  const textColor = isBanned ? '#fca5a5' : tile.isVowel ? '#92400e' : '#1e1b4b';
  const borderC   = bright ? '#c9a84c' : isBanned ? '#ef4444' : tile.isVowel ? 'rgba(146,64,14,.28)' : 'rgba(0,0,0,.14)';
  const shadow    = bright ? '0 0 18px rgba(201,168,76,.7)' : (hov && onClick && !isBanned) ? '0 8px 20px rgba(0,0,0,.4)' : '0 2px 8px rgba(0,0,0,.3)';

  return (
    <div style={{ ...base, background: bg, border: `1.5px solid ${borderC}`, boxShadow: shadow }}
      onClick={() => { if (!isBanned) onClick?.(); }}
      onMouseEnter={() => !isBanned && onClick && setHov(true)}
      onMouseLeave={() => setHov(false)}>
      <div style={{ fontSize: sm ? '22px' : '34px', fontWeight: 800, color: textColor, lineHeight: 1, fontFamily: 'Georgia,serif' }}>
        {tile.letter}
      </div>
      <div style={{ fontSize: sm ? '9px' : '12px', color: isBanned ? '#5a3030' : 'rgba(201,168,76,.75)', fontFamily: "'Cinzel',serif", fontWeight: 600, marginTop: '3px' }}>
        {tile.value}
      </div>
      {tile.isVowel && !isBanned && (
        <div style={{ position: 'absolute', top: '3px', right: '4px', width: '5px', height: '5px', borderRadius: '50%', background: '#92400e', opacity: .55 }} />
      )}
      {isBanned && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '7px' }}>
          <div style={{ fontSize: sm ? '20px' : '30px', color: '#ef4444', opacity: .45, fontWeight: 900, lineHeight: 1 }}>✕</div>
        </div>
      )}
    </div>
  );
}

// ─── WordStatusPanel ──────────────────────────────────────────────

export interface WordStatusPanelProps {
  hand: LetterTile[];
  target: number;
  minWordLength?: number;
  wordSet: Set<string>;
}

export function WordStatusPanel({ hand, target, minWordLength = 3, wordSet }: WordStatusPanelProps) {
  if (!hand.length) return null;
  const status = getWordStatus(hand, target, wordSet, minWordLength);
  const { word, wordStart, wordEnd, isPerfectClear, isWordClear, isWordBonus } = status;

  return (
    <div style={{ marginTop: '8px', padding: '8px 10px', borderRadius: '7px',
      background: 'rgba(0,0,0,.25)',
      border: `1px solid ${isPerfectClear ? 'rgba(201,168,76,.4)' : isWordClear ? 'rgba(34,197,94,.3)' : 'rgba(255,255,255,.06)'}` }}>
      {word ? (
        <div>
          <div style={{ display: 'flex', gap: '5px', alignItems: 'flex-end', marginBottom: '6px', flexWrap: 'wrap' }}>
            {hand.map((t, i) => {
              const inWord = wordStart >= 0 && i >= wordStart && i <= wordEnd;
              const wc = isPerfectClear ? GOLD : isWordClear ? '#22c55e' : '#94a3b8';
              return (
                <span key={i} style={{
                  fontFamily: 'Georgia,serif', fontWeight: inWord ? 800 : 400,
                  fontSize: inWord ? '16px' : '12px', color: inWord ? wc : '#4a4035',
                  lineHeight: 1, paddingBottom: '2px',
                  borderBottom: inWord ? `2.5px solid ${wc}` : '2.5px solid transparent',
                  transition: 'all .18s ease',
                }}>{t.letter}</span>
              );
            })}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontFamily: 'Georgia,serif', fontSize: '14px', fontWeight: 700, letterSpacing: '.06em',
                color: isPerfectClear ? GOLD : isWordClear ? '#22c55e' : '#94a3b8' }}>{word}</span>
              {isPerfectClear && <span style={{ color: GOLD, fontSize: '11px' }}>✦ PERFECT CLEAR</span>}
              {isWordClear && !isPerfectClear && <span style={{ color: '#22c55e', fontSize: '11px' }}>WORD CLEAR</span>}
              {isWordBonus && <span style={{ color: '#5a4e38', fontSize: '10px', fontStyle: 'italic' }}>word ready</span>}
            </div>
            <span style={{ fontSize: '10px', color: '#4a4035' }}>{word.length}L</span>
          </div>
        </div>
      ) : (
        <div style={{ fontSize: '10px', color: '#4a4035', fontStyle: 'italic', fontFamily: "'EB Garamond',serif" }}>
          {hand.length >= 3 ? 'no valid word in these letters' : `${3 - hand.length} more letter${3 - hand.length !== 1 ? 's' : ''} for word clear`}
        </div>
      )}
    </div>
  );
}
