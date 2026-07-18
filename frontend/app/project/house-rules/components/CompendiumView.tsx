'use client';
// components/CompendiumView.tsx
import React from 'react';
import { ARTIFACT_DEFS, ALL_ARTIFACT_IDS } from '../data/artifacts';
import { TRINKET_DEFS, TRINKET_IDS } from '../data/trinkets';
import { toRomanNumeral } from '../logic/engine';

const GOLD = '#c9a84c'; const DIM = '#7a6a4a';

export function CompendiumView({ onClose, AchievementToastLayer, CSS, PAGE }: {
  onClose: () => void; AchievementToastLayer: React.ReactNode;
  CSS: string; PAGE: React.CSSProperties;
}) {
  const artifactList = ALL_ARTIFACT_IDS.map(id => ({ id, def: ARTIFACT_DEFS[id] })).filter(x => !!x.def);
  const trinketList  = TRINKET_IDS.map(id => ({ id, def: TRINKET_DEFS[id] })).filter(x => !!x.def);
  return (
    <div style={{ ...PAGE, justifyContent: 'center', padding: '1rem' }} onClick={onClose}>
      <style>{CSS}</style>
      {AchievementToastLayer}
      <div className="pop" style={{ width: 'min(900px,100%)', maxHeight: '88vh', overflowY: 'auto',
        background: '#060e07', border: '1px solid rgba(201,168,76,.28)', borderRadius: '14px',
        boxShadow: '0 24px 80px rgba(0,0,0,.55)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderBottom: '1px solid rgba(201,168,76,.12)' }}>
          <div>
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: '13px', color: GOLD, letterSpacing: '.16em' }}>COMPENDIUM</div>
            <div style={{ fontSize: '11px', color: DIM, marginTop: '3px' }}>Artifacts, trinkets, boss rules, and Heat reference.</div>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: '12px',
              fontFamily: "'Cinzel',serif", letterSpacing: '.12em' }}>CLOSE</button>
        </div>
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <section>
            <div style={{ fontSize: '10px', letterSpacing: '.24em', color: DIM, fontFamily: "'Cinzel',serif", marginBottom: '10px' }}>ARTIFACTS</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(250px,1fr))', gap: '10px' }}>
              {artifactList.map(({ id, def }) => (
                <div key={id} style={{ padding: '12px', borderRadius: '10px', background: 'rgba(0,0,0,.28)', border: `1px solid ${def.color}33` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', alignItems: 'baseline', marginBottom: '6px' }}>
                    <div style={{ fontFamily: "'Cinzel',serif", color: def.color, fontSize: '12px', fontWeight: 700 }}><i className={`ti ${def.icon}`} /> {def.name}</div>
                    <div style={{ fontSize: '9px', color: DIM, letterSpacing: '.12em', fontFamily: "'Cinzel',serif" }}>{def.rarity.toUpperCase()}</div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                    {def.tags.map(tag => <span key={tag} style={{ fontSize: '9px', color: '#6a5a4a', border: '1px solid rgba(255,255,255,.06)', borderRadius: '999px', padding: '1px 6px' }}>{tag}</span>)}
                  </div>
                  {def.stacks.map((stack, idx) => stack && (
                    <div key={idx} style={{ fontSize: '10px', color: '#b8a890', lineHeight: 1.45, marginTop: '4px' }}>
                      <span style={{ color: def.color, fontFamily: "'Cinzel',serif", fontSize: '9px' }}>{toRomanNumeral(idx + 1)}</span> — {stack.description}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
          <section>
            <div style={{ fontSize: '10px', letterSpacing: '.24em', color: DIM, fontFamily: "'Cinzel',serif", marginBottom: '10px' }}>TRINKETS</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '10px' }}>
              {trinketList.map(({ id, def }) => (
                <div key={id} style={{ padding: '11px', borderRadius: '999px 14px 14px 999px', background: 'rgba(0,0,0,.28)', border: `1px solid ${def.color}33`, display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <div style={{ width: '34px', height: '34px', flexShrink: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${def.color}18`, border: `1px solid ${def.color}55`, color: def.color }}>{def.icon}</div>
                  <div>
                    <div style={{ fontFamily: "'Cinzel',serif", color: def.color, fontSize: '11px', fontWeight: 700 }}>{def.name} · ${def.cost}</div>
                    <div style={{ fontSize: '10px', color: '#8a7a6a', lineHeight: 1.35 }}>{def.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
          <section style={{ padding: '12px', borderRadius: '10px', background: 'rgba(201,168,76,.06)', border: '1px solid rgba(201,168,76,.16)' }}>
            <div style={{ fontSize: '10px', letterSpacing: '.24em', color: GOLD, fontFamily: "'Cinzel',serif", marginBottom: '8px' }}>BOSS / ENDLESS RULES</div>
            <div style={{ fontSize: '11px', color: '#b8a890', lineHeight: 1.6 }}>
              <div><b>Pit Boss:</b> Phase I bans one number rank. Phase II keeps that ban and adds a face-card ban.</div>
              <div><b>Boss losses:</b> lose a heart and retry the boss.</div>
              <div><b>House Heat:</b> after Act III, Act IV+ uses generated endless acts. Heat caps around Act VII; Closing Time rises instead.</div>
              <div><b>Closing Time:</b> a starter pressure meter for the later true boss system.</div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
