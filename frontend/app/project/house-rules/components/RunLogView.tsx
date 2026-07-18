'use client';
// components/RunLogView.tsx
import React from 'react';
import type { PlayerData, SavedRun, RunLogEntry } from '../types';
import { ARTIFACT_DEFS } from '../data/artifacts';
import { toRomanNumeral } from '../logic/engine';

const GOLD = '#c9a84c'; const DIM = '#7a6a4a';

export interface RunLogViewProps {
  runLog: RunLogEntry[]; playerData: PlayerData | null;
  viewingRun: SavedRun | null; onClose: () => void;
  onViewRun: (run: SavedRun | null) => void;
  AchievementToastLayer: React.ReactNode;
  CSS: string; PAGE: React.CSSProperties;
}

export function RunLogView({ runLog, playerData, viewingRun, onClose, onViewRun, AchievementToastLayer, CSS, PAGE }: RunLogViewProps) {
  const history = playerData?.runs ?? [];
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
            <div style={{ fontFamily: "'Cinzel',serif", fontSize: '13px', color: GOLD, letterSpacing: '.16em' }}>RUN LOG</div>
            <div style={{ fontSize: '11px', color: DIM, marginTop: '3px' }}>Click outside this panel to close.</div>
          </div>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: '12px',
              fontFamily: "'Cinzel',serif", letterSpacing: '.12em' }}>CLOSE</button>
        </div>
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {runLog.length > 0 && !viewingRun && (
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '.22em', color: DIM, fontFamily: "'Cinzel',serif", marginBottom: '8px' }}>CURRENT RUN</div>
              {runLog.map((e, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,.04)', fontSize: '12px' }}>
                  <div>
                    <span style={{ color: e.isBoss ? '#f87171' : '#8a7a6a', marginRight: '6px', fontFamily: "'Cinzel',serif", fontSize: '10px' }}>{e.actName}</span>
                    <span style={{ color: '#b8a890' }}>{e.tableLabel}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <span style={{ fontSize: '10px', color: '#5a4e38' }}>{e.playerValue} vs {e.dealerValue}</span>
                    <span style={{ color: e.result === 'win' ? '#4ade80' : '#f87171', fontWeight: 600, minWidth: '40px', textAlign: 'right' }}>
                      {e.result === 'win' ? `+$${e.earned}` : e.result === 'bust' ? 'BUST' : e.result.toUpperCase()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {history.length > 0 && (
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '.22em', color: DIM, fontFamily: "'Cinzel',serif", marginBottom: '8px' }}>HISTORY ({history.length} runs)</div>
              {playerData && (
                <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: DIM, marginBottom: '12px', flexWrap: 'wrap' }}>
                  <span>Wins: {playerData.totalWins}</span><span>Runs: {playerData.totalRuns}</span>
                  <span>Best $: {playerData.bestMoney}</span><span>Best tables: {playerData.longestRun}</span>
                </div>
              )}
              {history.map(run => (
                <div key={run.id} style={{ padding: '10px', borderRadius: '8px', marginBottom: '6px',
                  background: 'rgba(0,0,0,.25)', border: `1px solid ${run.outcome === 'win' ? 'rgba(201,168,76,.2)' : 'rgba(255,255,255,.05)'}`,
                  cursor: 'pointer' }}
                  onClick={() => onViewRun(viewingRun?.id === run.id ? null : run)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                    <div>
                      <span style={{ fontFamily: "'Cinzel',serif", fontSize: '12px', color: run.outcome === 'win' ? GOLD : '#f87171' }}>
                        {run.outcome === 'win' ? '♛' : '♠'} {run.nickname}
                      </span>
                      <span style={{ fontSize: '11px', color: DIM, marginLeft: '8px' }}>{run.finalTable}</span>
                    </div>
                    <div style={{ fontSize: '12px', color: DIM, textAlign: 'right' }}>
                      <div>${run.totalMoney}</div>
                      <div style={{ fontSize: '10px' }}>{new Date(run.date).toLocaleDateString()}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '6px' }}>
                    {run.artifacts.map(a => (
                      <span key={a.id} style={{ fontSize: '10px', color: ARTIFACT_DEFS[a.id]?.color ?? DIM,
                        background: 'rgba(0,0,0,.3)', border: `1px solid ${ARTIFACT_DEFS[a.id]?.color ?? DIM}33`,
                        borderRadius: '3px', padding: '1px 5px' }}>
                        {a.name} {toRomanNumeral(a.stacks)}
                      </span>
                    ))}
                  </div>
                  {viewingRun?.id === run.id && (
                    <div style={{ marginTop: '10px', borderTop: '1px solid rgba(255,255,255,.06)', paddingTop: '8px' }}>
                      {run.tableLog.map((e, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between',
                          fontSize: '11px', padding: '3px 0', color: '#7a6a4a', borderBottom: '1px solid rgba(255,255,255,.03)' }}>
                          <span>{e.actName} · {e.tableLabel}</span>
                          <span style={{ color: e.result === 'win' ? '#4ade80' : '#f87171' }}>
                            {e.result === 'win' ? `+$${e.earned}` : e.result.toUpperCase()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
          {history.length === 0 && runLog.length === 0 && (
            <div style={{ color: DIM, fontSize: '14px', textAlign: 'center', padding: '3rem 0', fontStyle: 'italic', fontFamily: "'EB Garamond',serif" }}>
              No runs recorded yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
