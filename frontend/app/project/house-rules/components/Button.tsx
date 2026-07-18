'use client';
// components/Button.tsx
import React, { useState } from 'react';

export interface ButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'gold' | 'ghost' | 'red';
  sm?: boolean;
  pulsing?: boolean;
}

export function Btn({ children, onClick, disabled, variant = 'gold', sm, pulsing }: ButtonProps) {
  const [h, setH] = useState(false);
  const ok = h && !disabled;
  const v = {
    gold:  { bg: ok ? '#c9a84c' : 'transparent', bd: '#c9a84c', co: ok ? '#0d1f0d' : '#c9a84c' },
    ghost: { bg: ok ? 'rgba(255,255,255,.07)' : 'transparent', bd: pulsing ? 'rgba(201,168,76,.6)' : 'rgba(255,255,255,.18)', co: ok ? '#e8d8b4' : pulsing ? '#c9a84c' : '#8a7a6a' },
    red:   { bg: ok ? '#dc2626' : 'transparent', bd: '#dc2626', co: ok ? '#fff' : '#dc2626' },
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setH(true)}
      onMouseLeave={() => setH(false)}
      style={{
        fontFamily: "'Cinzel',Georgia,serif",
        fontSize: sm ? '11px' : '13px',
        letterSpacing: '.2em',
        fontWeight: 600,
        padding: sm ? '5px 13px' : '10px 28px',
        background: disabled ? 'rgba(255,255,255,.03)' : v.bg,
        border: `1.5px solid ${disabled ? 'rgba(255,255,255,.06)' : v.bd}`,
        color: disabled ? '#3a3a3a' : v.co,
        borderRadius: '4px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all .14s ease',
        flexShrink: 0,
        boxShadow: pulsing && !disabled ? '0 0 12px rgba(201,168,76,.4)' : 'none',
        animation: pulsing && !disabled ? 'badgePulse 1.6s ease infinite' : 'none',
      }}
    >
      {children}
    </button>
  );
}
