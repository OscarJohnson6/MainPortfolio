'use client';
// components/EventView.tsx — renders the active event with choice buttons

import React from 'react';
import type { EventId } from '../data/events';
import { EVENT_DEFS } from '../data/events';
import { Btn } from './Button';

const GOLD = '#c9a84c';
const DIM  = '#7a6a4a';

export interface EventViewContext {
  money: number;
  lives: number;
  trinketCount: number;
  artifactCount: number;
  hasTier3Artifact: boolean;
  hasEventArtifact: boolean;
  hasSecondWind: boolean;
}

export interface EventViewProps {
  eventId: EventId;
  context: EventViewContext;
  /** Called when player picks a choice. */
  onChoice: (eventId: EventId, choiceId: string) => void;
  CSS: string;
  PAGE: React.CSSProperties;
}

function conditionMet(condition: string | undefined, ctx: EventViewContext): boolean {
  if (!condition) return true;
  switch (condition) {
    case 'has_15':            return ctx.money >= 15;
    case 'has_8':             return ctx.money >= 8;
    case 'has_trinket':       return ctx.trinketCount > 0;
    case 'has_artifact':      return ctx.artifactCount > 0;
    case 'has_tier3':         return ctx.hasTier3Artifact;
    case 'has_event_artifact':return ctx.hasEventArtifact;
    case 'has_second_wind':   return ctx.hasSecondWind;
    default:                  return true;
  }
}

export function EventView({ eventId, context, onChoice, CSS, PAGE }: EventViewProps) {
  const def = EVENT_DEFS[eventId];
  if (!def) return null;

  const visibleChoices = def.choices.filter(c => conditionMet(c.condition, context));

  return (
    <div style={{ ...PAGE, justifyContent: 'center', alignItems: 'center' }}>
      <style>{CSS}</style>
      <div className="pop" style={{
        maxWidth: '480px', width: 'calc(100% - 2rem)',
        padding: '2rem 1.5rem',
        background: '#060e07',
        border: '1px solid rgba(201,168,76,.28)',
        borderRadius: '14px',
        boxShadow: '0 24px 80px rgba(0,0,0,.6)',
      }}>
        {/* Header */}
        <div style={{ fontSize: '9px', letterSpacing: '.3em', color: DIM,
          fontFamily: "'Cinzel',serif", marginBottom: '6px' }}>
          EVENT
        </div>
        <h2 style={{ fontFamily: "'Cinzel',serif", fontSize: '1.55rem',
          fontWeight: 700, color: GOLD, margin: '0 0 6px' }}>
          {def.title}
        </h2>
        <p style={{ fontFamily: "'EB Garamond',serif", fontStyle: 'italic',
          fontSize: '1rem', color: DIM, margin: '0 0 14px', lineHeight: 1.5 }}>
          {def.flavor}
        </p>

        {/* Divider */}
        <div style={{ height: '1px', background: 'rgba(201,168,76,.12)', margin: '0 0 14px' }} />

        {/* Body */}
        <p style={{ fontSize: '13px', color: '#b8a890', lineHeight: 1.65,
          margin: '0 0 20px', fontFamily: "'EB Garamond',serif" }}>
          {def.body}
        </p>

        {/* Choices */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {visibleChoices.map(choice => (
            <button
              key={choice.id}
              onClick={() => onChoice(eventId, choice.id)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                padding: '12px 14px', borderRadius: '9px', cursor: 'pointer',
                background: 'rgba(0,0,0,.35)', textAlign: 'left',
                border: `1px solid ${choice.danger ? 'rgba(239,68,68,.4)' : 'rgba(201,168,76,.2)'}`,
                transition: 'all .15s ease',
              }}
              onMouseEnter={e => {
                const el = e.currentTarget;
                el.style.background = choice.danger ? 'rgba(239,68,68,.08)' : 'rgba(201,168,76,.08)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(0,0,0,.35)';
              }}
            >
              <div style={{
                fontFamily: "'Cinzel',serif", fontSize: '13px', fontWeight: 600,
                color: choice.danger ? '#f87171' : GOLD, marginBottom: '4px',
              }}>
                {choice.danger && '⚠ '}{choice.label}
              </div>
              <div style={{ fontSize: '11px', color: '#8a7a6a', lineHeight: 1.45 }}>
                {choice.description}
              </div>
            </button>
          ))}
        </div>

        {/* Context strip */}
        <div style={{
          marginTop: '16px', padding: '8px 10px', borderRadius: '6px',
          background: 'rgba(0,0,0,.25)', border: '1px solid rgba(255,255,255,.05)',
          display: 'flex', gap: '16px', fontSize: '11px', color: DIM,
          fontFamily: "'Cinzel',serif",
        }}>
          <span>${context.money}</span>
          <span>{'♥'.repeat(context.lives)}</span>
          {context.trinketCount > 0 && <span>{context.trinketCount} trinket{context.trinketCount !== 1 ? 's' : ''}</span>}
          {context.artifactCount > 0 && <span>{context.artifactCount} artifact{context.artifactCount !== 1 ? 's' : ''}</span>}
        </div>
      </div>
    </div>
  );
}

// ─── Dumpster Dive multi-pull sub-component ───────────────────────────

export interface DumpsterResult {
  type: 'money' | 'trinket' | 'trinket_cursed' | 'artifact' | 'artifact_cursed' | 'lose_life' | 'trash_chip';
  value?: number;
  label: string;
  color: string;
}

export interface DumpsterDiveViewProps {
  pullResults: DumpsterResult[];
  canPullMore: boolean;
  onPull: () => void;
  onLeave: () => void;
  CSS: string;
  PAGE: React.CSSProperties;
}

export function DumpsterDiveView({ pullResults, canPullMore, onPull, onLeave, CSS, PAGE }: DumpsterDiveViewProps) {
  return (
    <div style={{ ...PAGE, justifyContent: 'center', alignItems: 'center' }}>
      <style>{CSS}</style>
      <div className="pop" style={{
        maxWidth: '440px', width: 'calc(100% - 2rem)', padding: '2rem 1.5rem',
        background: '#060e07', border: '1px solid rgba(201,168,76,.28)',
        borderRadius: '14px', boxShadow: '0 24px 80px rgba(0,0,0,.6)',
      }}>
        <div style={{ fontSize: '9px', letterSpacing: '.3em', color: DIM,
          fontFamily: "'Cinzel',serif", marginBottom: '6px' }}>EVENT</div>
        <h2 style={{ fontFamily: "'Cinzel',serif", fontSize: '1.4rem',
          color: GOLD, margin: '0 0 6px', fontWeight: 700 }}>The Dumpster</h2>
        <p style={{ fontSize: '12px', color: DIM, fontStyle: 'italic',
          fontFamily: "'EB Garamond',serif", margin: '0 0 16px' }}>
          {pullResults.length === 0
            ? 'Something glints inside. Each pull is a random grab.'
            : `Pull ${pullResults.length}: keep going or take what you have.`}
        </p>

        {pullResults.length > 0 && (
          <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {pullResults.map((r, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '7px 10px', borderRadius: '6px',
                background: 'rgba(0,0,0,.3)', border: `1px solid ${r.color}33`,
                fontSize: '12px',
              }}>
                <span style={{ color: r.color }}>{r.label}</span>
                <span style={{ fontSize: '9px', color: DIM, fontFamily: "'Cinzel',serif" }}>
                  Pull {i + 1}
                </span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {canPullMore && (
            <Btn onClick={onPull}>
              {pullResults.length === 0 ? 'Reach in' : 'Pull again'}
            </Btn>
          )}
          <Btn onClick={onLeave} variant={pullResults.length === 0 ? 'ghost' : 'gold'}>
            {pullResults.length === 0 ? 'Walk past' : 'Take what I have'}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Mirror Hallway multi-entry sub-component ─────────────────────────

export interface MirrorHallwayViewProps {
  entriesUsed: number;
  maxEntries: number;
  lastCopiedCard?: string;
  canEnterAgain: boolean;
  onEnter: () => void;
  onFlee: () => void;
  CSS: string;
  PAGE: React.CSSProperties;
}

export function MirrorHallwayView({
  entriesUsed, maxEntries, lastCopiedCard, canEnterAgain, onEnter, onFlee, CSS, PAGE
}: MirrorHallwayViewProps) {
  return (
    <div style={{ ...PAGE, justifyContent: 'center', alignItems: 'center' }}>
      <style>{CSS}</style>
      <div className="pop" style={{
        maxWidth: '440px', width: 'calc(100% - 2rem)', padding: '2rem 1.5rem',
        background: '#060e07', border: '1px solid rgba(168,85,247,.3)',
        borderRadius: '14px', boxShadow: '0 24px 80px rgba(0,0,0,.6)',
      }}>
        <div style={{ fontSize: '9px', letterSpacing: '.3em', color: '#a855f7',
          fontFamily: "'Cinzel',serif", marginBottom: '6px' }}>EVENT — MIRROR HALLWAY</div>
        <h2 style={{ fontFamily: "'Cinzel',serif", fontSize: '1.4rem',
          color: '#c084fc', margin: '0 0 10px', fontWeight: 700 }}>
          {entriesUsed === 0 ? 'Hallway of Mirrors' : `Mirror ${entriesUsed + 1}`}
        </h2>

        {lastCopiedCard && (
          <div style={{ marginBottom: '12px', padding: '8px 10px', borderRadius: '7px',
            background: 'rgba(168,85,247,.1)', border: '1px solid rgba(168,85,247,.25)',
            fontSize: '12px', color: '#c084fc' }}>
            Copied: {lastCopiedCard}
          </div>
        )}

        <p style={{ fontSize: '12px', color: '#8a7a6a', lineHeight: 1.55,
          fontFamily: "'EB Garamond',serif", margin: '0 0 20px' }}>
          {entriesUsed === 0
            ? 'The corridor is lined with mirrors showing different versions of your hand. Step in to copy one card — but it costs a life.'
            : canEnterAgain
              ? `Another mirror appears. You can enter again — copy another card at the cost of another life. (${entriesUsed}/${maxEntries} used)`
              : 'The hallway collapses. No more mirrors.'}
        </p>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          {canEnterAgain && (
            <Btn onClick={onEnter} variant="ghost">
              Enter — copy a card, lose 1 life
            </Btn>
          )}
          <Btn onClick={onFlee} variant={entriesUsed > 0 ? 'gold' : 'ghost'}>
            {entriesUsed > 0 ? 'Leave the hallway' : 'Flee'}
          </Btn>
        </div>
      </div>
    </div>
  );
}
