'use client';
// components/ShopView.tsx
import React from 'react';
import type { ShopItem, OwnedArtifact, TrinketId } from '../types';
import type { TrinketId as TId } from '../data/trinkets';
import { ARTIFACT_DEFS } from '../data/artifacts';
import { TRINKET_DEFS } from '../data/trinkets';
import { ArtifactBadge } from './ArtifactBadge';
import { Btn } from './Button';

const GOLD = '#c9a84c'; const DIM = '#7a6a4a';

export interface ShopViewProps {
  shopItems: ShopItem[]; artifacts: OwnedArtifact[];
  trinkets: string[]; money: number; goldenChips: number;
  shopKind: 'main' | 'last_call'; maxTrinkets: number;
  piggyBank: null | { deposit: number; value: number; step: number; cracked: boolean };
  onBuy: (item: ShopItem) => void; onLeave: () => void;
  onCashOutPiggyBank: () => void;
  AchievementToastLayer: React.ReactNode;
  CSS: string; PAGE: React.CSSProperties;
}

export function ShopView({ shopItems, artifacts, trinkets, money, goldenChips, shopKind, maxTrinkets,
  piggyBank, onBuy, onLeave, onCashOutPiggyBank, AchievementToastLayer, CSS, PAGE }: ShopViewProps) {
  const artifactItems = shopItems.filter(i => i.type === 'artifact' || i.type === 'upgrade');
  const trinketItems  = shopItems.filter(i => i.type === 'trinket');
  const serviceItems  = shopItems.filter(i => i.type !== 'artifact' && i.type !== 'upgrade' && i.type !== 'trinket');

  const renderItem = (item: ShopItem, compact = false) => {
    const artDef = item.artifactId ? ARTIFACT_DEFS[item.artifactId] : null;
    const trDef  = item.trinketId  ? TRINKET_DEFS[item.trinketId as TId] : null;
    const color  = artDef?.color ?? trDef?.color ?? GOLD;
    const icon   = artDef ? <i className={`ti ${artDef.icon}`} style={{ fontSize: '12px', marginRight: '5px' }} aria-hidden /> : trDef ? <span style={{ marginRight: '5px' }}>{trDef.icon}</span> : null;
    return (
      <button key={item.id} onClick={() => onBuy(item)} disabled={!item.available}
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: compact ? 'flex-start' : 'center',
          gap: '10px', padding: compact ? '10px 11px' : '12px 14px', borderRadius: '9px',
          cursor: item.available ? 'pointer' : 'not-allowed', background: 'rgba(0,0,0,.35)', textAlign: 'left',
          border: `1px solid ${item.available ? `${color}55` : 'rgba(255,255,255,.05)'}`,
          opacity: item.available ? 1 : .45, transition: 'all .15s ease', color: '#e8d8b4',
          minHeight: compact ? '68px' : '82px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: compact ? '12px' : '13px', fontFamily: "'Cinzel',serif", color, marginBottom: '3px', display: 'flex', alignItems: 'center', gap: '2px' }}>
            {icon}<span>{item.label}</span>
          </div>
          <div style={{ fontSize: compact ? '10px' : '11px', color: DIM, lineHeight: 1.38 }}>{item.description}</div>
        </div>
        <div style={{ textAlign: 'right', whiteSpace: 'nowrap', flexShrink: 0 }}>
          <div style={{ fontSize: '14px', fontFamily: "'Cinzel',serif", color: item.available ? GOLD : '#4a4035', fontWeight: 600 }}>
            ${item.cost}
            {item.onSale && <span style={{ fontSize: '10px', color: '#4a4035', textDecoration: 'line-through', marginLeft: '5px' }}>${item.originalCost}</span>}
          </div>
          {item.onSale && <div style={{ fontSize: '8px', color: '#f59e0b', letterSpacing: '.1em', fontFamily: "'Cinzel',serif" }}>SALE</div>}
        </div>
      </button>
    );
  };

  return (
    <div style={{ ...PAGE, justifyContent: 'center' }}>
      <style>{CSS}</style>
      {AchievementToastLayer}
      <div className="fade" style={{ textAlign: 'center', padding: '1.25rem 1rem', maxWidth: '860px', width: 'calc(100% - 2rem)' }}>
        <div style={{ fontSize: '10px', letterSpacing: '.3em', color: DIM, marginBottom: '6px', fontFamily: "'Cinzel',serif" }}>{shopKind === 'last_call' ? 'LAST CALL' : 'THE VELVET SHOP'}</div>
        <h2 style={{ fontFamily: "'Cinzel',serif", fontSize: '1.5rem', color: GOLD, margin: '0 0 6px', fontWeight: 600 }}>
          {shopKind === 'last_call' ? 'A smaller, stranger counter.' : 'Spend wisely.'}
        </h2>
        <div style={{ fontSize: '13px', color: GOLD, fontFamily: "'Cinzel',serif", marginBottom: '12px', fontWeight: 600 }}>
          ${money} available · Golden Chips {goldenChips}/3
        </div>

        <div style={{ margin: '0 auto 12px', maxWidth: '760px', padding: '8px 10px', borderRadius: '9px',
          background: 'rgba(0,0,0,.26)', border: '1px solid rgba(255,255,255,.06)', display: 'grid', gap: '7px', textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '8px', color: DIM, letterSpacing: '.2em', fontFamily: "'Cinzel',serif", marginRight: '3px' }}>ARTIFACTS</span>
            {artifacts.length ? artifacts.map(a => <ArtifactBadge key={a.id} art={a} />) : <span style={{ fontSize: '10px', color: '#4a4035' }}>none</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '8px', color: DIM, letterSpacing: '.2em', fontFamily: "'Cinzel',serif", marginRight: '3px' }}>POCKETS</span>
            {Array.from({ length: maxTrinkets }, (_, idx) => {
              const id = trinkets[idx] as TId | undefined;
              const def = id ? TRINKET_DEFS[id] : null;
              return (
                <span key={idx} title={def ? `${def.name}: ${def.description}` : 'Empty'}
                  style={{ width: '28px', height: '28px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    border: `1px solid ${def ? def.color + '88' : 'rgba(255,255,255,.12)'}`,
                    background: def ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.025)',
                    color: def ? def.color : '#3a3a3a', fontSize: '14px', fontWeight: 700 }}>
                  {def ? def.icon : '·'}
                </span>
              );
            })}
          </div>
        </div>

        {piggyBank && (
          <div style={{ margin: '0 auto 14px', padding: '8px 10px', maxWidth: '420px', borderRadius: '8px',
            background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.25)', color: '#fbbf24', fontSize: '11px' }}>
            ◍ Piggy Bank: ${Math.floor(piggyBank.value)} {piggyBank.cracked ? '(cracked)' : '(growing)'}
            <div style={{ marginTop: '6px' }}><Btn onClick={onCashOutPiggyBank} variant="ghost" sm>CASH OUT</Btn></div>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateRows: 'auto auto', gap: '12px', marginBottom: '16px' }}>
          <section style={{ textAlign: 'left' }}>
            <div style={{ fontSize: '9px', letterSpacing: '.22em', color: DIM, fontFamily: "'Cinzel',serif", marginBottom: '7px' }}>ARTIFACTS / UPGRADES</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '8px' }}>
              {artifactItems.map(i => renderItem(i))}
            </div>
          </section>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(175px,1fr))', gap: '10px', alignItems: 'stretch' }}>
            <section style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '9px', letterSpacing: '.22em', color: DIM, fontFamily: "'Cinzel',serif", marginBottom: '7px' }}>TRINKETS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {trinketItems.length ? trinketItems.map(i => renderItem(i, true)) : (
                  <div style={{ padding: '14px', borderRadius: '9px', color: '#4a4035', border: '1px dashed rgba(255,255,255,.08)', fontSize: '11px' }}>No pocket offers.</div>
                )}
              </div>
            </section>
            <section style={{ display: 'flex', alignItems: 'end', justifyContent: 'center', padding: '18px 8px' }}>
              <Btn onClick={onLeave}>{shopKind === 'last_call' ? 'LEAVE LAST CALL' : 'LEAVE SHOP'}</Btn>
            </section>
            <section style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '9px', letterSpacing: '.22em', color: DIM, fontFamily: "'Cinzel',serif", marginBottom: '7px' }}>SERVICES</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {serviceItems.length ? serviceItems.map(i => renderItem(i, true)) : (
                  <div style={{ padding: '14px', borderRadius: '9px', color: '#4a4035', border: '1px dashed rgba(255,255,255,.08)', fontSize: '11px' }}>No services.</div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
