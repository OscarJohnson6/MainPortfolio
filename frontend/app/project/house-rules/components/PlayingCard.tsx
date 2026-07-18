'use client';
// components/PlayingCard.tsx
import React, { useState } from 'react';
import type { Card } from '../types';
import { isOddNumberCard } from '../logic/engine';

export interface PlayingCardProps {
  card: Card;
  faceDown?: boolean;
  sm?: boolean;
  onClick?: () => void;
  bright?: boolean;
  dimmed?: boolean;
  contrarianActive?: boolean;
  targetBump?: boolean;
  tooltip?: React.ReactNode;
}

export function PlayingCard({ card, faceDown, sm, onClick, bright, dimmed, contrarianActive, tooltip }: PlayingCardProps) {
  const [hov, setHov] = useState(false);
  const W = sm ? '48px' : '68px', H = sm ? '68px' : '98px';
  const lift = hov && onClick ? 'translateY(-10px) scale(1.06)' : 'none';
  const isOdd = card && contrarianActive && isOddNumberCard(card);

  const shadow = bright
    ? '0 0 18px rgba(201,168,76,.7), 0 4px 14px rgba(0,0,0,.5)'
    : hov && onClick ? '0 8px 22px rgba(0,0,0,.55)' : '0 2px 8px rgba(0,0,0,.3)';

  const base: React.CSSProperties = {
    width: W, height: H, borderRadius: '8px', flexShrink: 0,
    cursor: onClick ? 'pointer' : 'default',
    transition: 'transform .15s ease, box-shadow .15s ease',
    transform: lift, userSelect: 'none', position: 'relative',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    opacity: dimmed ? 0.35 : 1,
  };

  if (faceDown) return (
    <div style={{ ...base, background: '#1a3556', border: '1.5px solid #3a6090', boxShadow: shadow }}
      onClick={onClick} onMouseEnter={() => onClick && setHov(true)} onMouseLeave={() => setHov(false)}>
      <div style={{ fontSize: sm ? '14px' : '20px', color: '#2a5080', fontWeight: 'bold' }}>?</div>
    </div>
  );

  const isR  = ['J','Q','K','A'].includes(card.rank);
  const sc   = card.red ? '#b91c1c' : '#1e1b4b';
  const bg   = ({J:'#fffbeb',Q:'#fdf2f8',K:'#fefce8',A:'#f0fdf4'} as Record<string,string>)[card.rank] ?? '#ffffff';
  const sym  = ({J:'⚜',Q:'✿',K:'♔',A:'✦'} as Record<string,string>)[card.rank] ?? card.suit;
  const bc   = bright ? '#c9a84c' : isR ? 'rgba(201,168,76,.35)' : 'rgba(0,0,0,.14)';
  const rf = sm ? '9px' : '13px', sf = sm ? '7px' : '10px', cf = sm ? '18px' : '30px';

  return (
    <div style={{ ...base, background: isOdd ? '#1e1500' : bg, border: `1.5px solid ${bc}`, boxShadow: shadow }}
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}>
      {tooltip && hov && <div className="cardTip">{tooltip}</div>}
      <div style={{ position: 'absolute', top: '3px', left: '5px', lineHeight: 1, color: isOdd ? '#fcd34d' : sc }}>
        <div style={{ fontSize: rf, fontWeight: 700, fontFamily: 'Georgia,serif' }}>{card.rank}</div>
        <div style={{ fontSize: sf, marginTop: '1px' }}>{card.suit}</div>
      </div>
      <div style={{ fontSize: cf, color: isOdd ? '#fcd34d' : sc, lineHeight: 1 }}>{sym}</div>
      <div style={{ position: 'absolute', bottom: '3px', right: '5px', lineHeight: 1, color: isOdd ? '#fcd34d' : sc, transform: 'rotate(180deg)' }}>
        <div style={{ fontSize: rf, fontWeight: 700, fontFamily: 'Georgia,serif' }}>{card.rank}</div>
        <div style={{ fontSize: sf, marginTop: '1px' }}>{card.suit}</div>
      </div>
      {isR && !sm && (
        <div style={{ position: 'absolute', bottom: '5px', left: 0, right: 0, textAlign: 'center',
          fontSize: '7px', color: 'rgba(201,168,76,.75)', fontWeight: 700, letterSpacing: '.1em' }}>
          {({J:'JACK',Q:'QUEEN',K:'KING',A:'ACE'} as Record<string,string>)[card.rank]}
        </div>
      )}
      {isOdd && (
        <div style={{
          position: 'absolute', top: sm ? '2px' : '4px', right: sm ? '2px' : '4px',
          background: 'rgba(245,158,11,.9)', borderRadius: '50%',
          width: sm ? '14px' : '18px', height: sm ? '14px' : '18px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#1a0f00', fontWeight: 'bold', fontSize: sm ? '10px' : '13px', lineHeight: 1,
        }}>−</div>
      )}
    </div>
  );
}
