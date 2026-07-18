'use client';
// components/FullscreenBtn.tsx
import React from 'react';

export function FullscreenBtn() {
  const [isFs, setIsFs] = React.useState(false);
  React.useEffect(() => {
    const handler = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handler);
    return () => document.removeEventListener('fullscreenchange', handler);
  }, []);
  const toggle = () => {
    const el = document.getElementById('hr-game-root') ?? document.documentElement;
    if (!document.fullscreenElement) el.requestFullscreen?.();
    else document.exitFullscreen?.();
  };
  return (
    <button onClick={toggle} title={isFs ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#5a4e38', fontSize: '14px',
        padding: '2px 6px', lineHeight: 1, transition: 'color .14s ease' }}
      onMouseEnter={e => (e.currentTarget.style.color = '#c9a84c')}
      onMouseLeave={e => (e.currentTarget.style.color = '#5a4e38')}>
      {isFs ? '⊡' : '⊞'}
    </button>
  );
}
