'use client';

// ─────────────────────────────────────────────────────────────────
// HouseRules.tsx  —  full game component
// Drop into a Next.js page: import { HouseRulesGame } from './HouseRules'
// ─────────────────────────────────────────────────────────────────

import React, { useState, useRef, useEffect } from 'react';
import type {
  Card, OwnedArtifact, ArtifactId, GamePhase, TableResult,
  RunLogEntry, TableLogEntry, ShopItem, SavedRun, PlayerData,
  ActConfig, TriggerEvent, DealerRank, LedgerEntry,
} from './types';
// engine.ts: core card/hand utilities
import {
  createFullDeck, shuffle, handValue, isOddNumberCard,
  calcBustResult, generateNickname, generateRewardPool,
  toRomanNumeral, type DealerDecision,
} from './logic/engine';

// dealerAI.ts: dealer decision loop
import { dealerAI } from './logic/dealerAI';

// dealerBuilds.ts: ledger budget + artifact generation
import {
  createLedgerBudget, generateDealerArtifactsFromBudget,
  generateDealerNameFromArtifacts,
} from './logic/dealerBuilds';

// shopLogic.ts: shop item generation
import { generateShopItems } from './logic/shopLogic';
import { ARTIFACT_DEFS, getArtifactEffect, artifactEffectAtStacks, artifactStacks, effectiveArtifactStacks, ALL_ARTIFACT_IDS } from './data/artifacts';
import { getAllArcadeWords } from '@/app/project/arcade/games/wordData';
import type { LetterTile } from './logic/letterEngine';
import { createLetterDeck, letterHandValue, findWordInSequence, letterDealerAI } from './logic/letterEngine';
import { TRINKET_DEFS, TRINKET_IDS } from './data/trinkets';
import type { TrinketId } from './data/trinkets';
import { GAME_MODES, CHARACTERS, buildStartArtifacts } from './data/characters';
import type { GameMode, CharacterId } from './data/characters';

import type { EventId } from './data/events';
import { EVENT_DEFS, buildEventPool, pickRandomEvent, EVENT_BASE_CHANCE } from './data/events';

import { ACHIEVEMENT_DEFS, checkAchievements } from './data/achievements';

// ── Components (all via barrel) ──────────────────────────────────────
import {
  PlayingCard, LetterCard, WordStatusPanel, Btn,
  ArtifactBadge, TrinketBar, FullscreenBtn,
  RunTracker, HeartDisplay, TriggerLayer, EffectsPanel,
  EventView, DumpsterDiveView, MirrorHallwayView,
} from './components';
// Phase screen components (TitleScreen, ResultView, ShopView, etc.) are
// rendered inline in HouseRules.tsx until each phase is fully wired.
import type { DumpsterResult } from './components';
import type { ActiveRunSave } from './logic/saveSystem';

const WORD_SET: Set<string> = new Set(getAllArcadeWords().map(w => w.toUpperCase()));

// findBestWord is a local adapter for the letter engine.
// The engine exposes findWordInSequence(), which returns metadata.
// The game UI/result logic only needs the word string.
function findBestWord(
  tiles: LetterTile[],
  wordSet: typeof WORD_SET,
  minWordLength = 3,
): string | null {
  return findWordInSequence(
    tiles.map(t => t.letter),
    wordSet,
    minWordLength,
  )?.word ?? null;
}

function getWordAssistHints(
  tiles: LetterTile[],
  wordSet: typeof WORD_SET,
  minWordLength = 3,
): { nextLetters: string[]; words: string[] } {
  const letters = tiles.map(t => t.letter);
  const nextLetters = new Set<string>();
  const words = new Set<string>();

  for (let start = 0; start < letters.length; start++) {
    const prefix = letters.slice(start).join('');
    if (!prefix) continue;
    for (const word of wordSet) {
      if (word.length < minWordLength) continue;
      if (!word.startsWith(prefix)) continue;
      if (word.length === prefix.length) {
        words.add(word);
      } else {
        nextLetters.add(word[prefix.length]);
        if (words.size < 6) words.add(word);
      }
      if (nextLetters.size >= 8 && words.size >= 6) break;
    }
  }

  return {
    nextLetters: [...nextLetters].slice(0, 8),
    words: [...words].sort((a, b) => a.length - b.length || a.localeCompare(b)).slice(0, 6),
  };
}

// ─── Acts config ──────────────────────────────────────────────────

const ACTS: ActConfig[] = [
  {
    name: 'Act I', subtitle: 'The Green Room',
    tables: [
      { label: 'Opening Hand', target: 18, rule: null },
      { label: 'Green Felt',   target: 20, rule: null },
      { label: 'Late Night',   target: 21, rule: null },
    ],
    boss: {
      isBoss: true, label: 'Act I Boss',
      name: 'The Hidden Hand',
      flavor: '"Pick first. Regret later."',
      desc: 'One of your two Pull options is always face-down. You cannot see it until after you choose.',
      target: 21, rule: 'hidden_hand',
    },
  },
  {
    name: 'Act II', subtitle: 'The Back Room',
    tables: [
      { label: 'High Stakes',   target: 21, rule: null },
      { label: 'The Back Room', target: 23, rule: null },
      { label: 'Last Call',     target: 20, rule: null },
    ],
    boss: {
      isBoss: true, label: 'Act II Boss',
      name: 'The Exact Accountant',
      flavor: '"Close is not a number."',
      desc: 'Only an exact hit on the target wins. Standing short is an immediate loss.',
      target: 21, rule: 'exact_only',
    },
  },
  {
    name: 'Act III', subtitle: 'The Pit',
    tables: [
      { label: 'Table Lock',     target: 24, rule: null },
      { label: 'Marked Felt',    target: 25, rule: null },
      { label: 'House Pressure', target: 26, rule: null },
    ],
    boss: {
      isBoss: true, label: 'Act III Final Boss',
      name: 'The Pit Boss',
      flavor: '"The game was polite until now."',
      desc: 'Two-phase fight. Phase I locks one artifact and bans number ranks. Phase II raises the target, locks another artifact, and can ban any rank.',
      target: 30, rule: 'pit_boss',
    },
  },
];

// ─── Letter Mode Act config ────────────────────────────────────────


function toActRoman(n: number) {
  const numerals: Record<number, string> = { 1:'I', 2:'II', 3:'III', 4:'IV', 5:'V', 6:'VI', 7:'VII', 8:'VIII', 9:'IX', 10:'X' };
  return numerals[n] ?? String(n);
}

function getHeatIntensity(actIdx: number) {
  return Math.min(4, Math.max(0, actIdx - 2));
}

function buildEndlessCardAct(actIdx: number): ActConfig {
  const actNo = actIdx + 1;
  const heat = getHeatIntensity(actIdx);
  const targetBase = 26 + heat * 2;
  return {
    name: `Act ${toActRoman(actNo)}`,
    subtitle: heat >= 4 ? 'House Heat — Maximum' : `House Heat ${heat}`,
    tables: [
      { label: 'Heated Felt', target: targetBase, rule: null },
      { label: 'Cursed Table', target: targetBase + 2, rule: null },
      { label: 'Closing Hour', target: targetBase + 4, rule: null },
    ],
    boss: {
      isBoss: true,
      label: 'Endless Boss',
      name: heat >= 4 ? 'The Burning House Dealer' : 'The House Heat Dealer',
      flavor: '"You already won. That was your mistake."',
      desc: 'Endless boss. Dealer ledger, shop pressure, and Closing Time keep rising, but raw Heat caps around Act VII.',
      target: 34 + heat * 4,
      rule: null,
    },
  };
}

function getCardAct(actIdx: number): ActConfig {
  return ACTS[actIdx] ?? buildEndlessCardAct(actIdx);
}

const LETTER_ACTS: ActConfig[] = [
  {
    name: 'Act I', subtitle: 'The Library',
    tables: [
      { label: 'Opening Lines', target: 35, rule: null },
      { label: 'The Index',     target: 38, rule: null },
      { label: 'Last Chapter',  target: 42, rule: null },
    ],
    boss: {
      isBoss: true, label: 'Act I Boss',
      name: 'The Censor',
      flavor: '"Some letters are not permitted here."',
      desc: 'One random vowel is banned for the entire table. Any tile showing that letter cannot be selected.',
      target: 40, rule: 'censor' as any,
    },
  },
  {
    name: 'Act II', subtitle: 'The Archive',
    tables: [
      { label: 'Old Records',  target: 43, rule: null },
      { label: 'Deep Files',   target: 46, rule: null },
      { label: 'Final Entry',  target: 50, rule: null },
    ],
    boss: {
      isBoss: true, label: 'Final Boss',
      name: 'The Editor',
      flavor: '"Three letters is not a word. Try harder."',
      desc: 'Word Clears only count for words of 4+ letters. Shorter words are ignored.',
      target: 48, rule: 'editor' as any,
    },
  },
];


// ─── CSS ──────────────────────────────────────────────────────────

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700&family=Cinzel:wght@400;600&family=EB+Garamond:ital,wght@0,400;1,400&display=swap');
*{box-sizing:border-box;} body{margin:0;}
@keyframes fadeUp{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:translateY(0)}}
@keyframes dealIn{from{opacity:0;transform:translateX(-10px)scale(.95)}to{opacity:1;transform:none}}
@keyframes glowPulse{0%,100%{opacity:.5}50%{opacity:1}}
@keyframes popIn{from{opacity:0;transform:scale(.88)}to{opacity:1;transform:none}}
@keyframes floatUp{0%{opacity:0;transform:translateY(0)}15%{opacity:1}70%{opacity:1;transform:translateY(-44px)}100%{opacity:0;transform:translateY(-64px)}}
@keyframes badgePulse{0%,100%{transform:scale(1);filter:brightness(1)}50%{transform:scale(1.22);filter:brightness(1.8)}}
@keyframes heartBreak{0%{transform:scale(1)}30%{transform:scale(1.55)}60%{transform:scale(.75)rotate(-12deg)}100%{transform:scale(.55);opacity:.35}}
@keyframes throb{0%,100%{transform:scale(1)}50%{transform:scale(1.2)}}
@keyframes scFlash{0%{opacity:0}15%{opacity:.96}75%{opacity:.94}100%{opacity:0}}
@keyframes targetBump{0%{transform:scale(1)}40%{transform:scale(1.35)}100%{transform:scale(1)}}
@keyframes actBurn{0%{filter:brightness(1);text-shadow:none}35%{filter:brightness(2.2);text-shadow:0 0 18px rgba(245,158,11,.95);transform:scale(1.14)}75%{filter:brightness(1.6);text-shadow:0 0 10px rgba(220,38,38,.9);transform:scale(.96)}100%{filter:brightness(1);text-shadow:none;transform:scale(1)}}
@keyframes achievementSlide{0%{opacity:0;transform:translateX(18px) scale(.96)}15%{opacity:1;transform:none}85%{opacity:1;transform:none}100%{opacity:0;transform:translateX(18px) scale(.96)}}
@keyframes pvFlashUp{0%{transform:scale(1.3);color:#22c55e}100%{transform:scale(1)}}
@keyframes pvFlashDown{0%{transform:scale(1.3);color:#ef4444}100%{transform:scale(1)}}
@keyframes pvFlashPerfect{0%{transform:scale(1.35);color:#c9a84c;text-shadow:0 0 20px rgba(201,168,76,.9)}100%{transform:scale(1)}}
.fade{animation:fadeUp .5s ease both}
.deal{animation:dealIn .28s ease both}
.pop{animation:popIn .35s cubic-bezier(.34,1.4,.64,1) both}
.glow{animation:glowPulse 3s ease infinite}
.pvUp{animation:pvFlashUp .55s ease both!important}
.pvDown{animation:pvFlashDown .55s ease both!important}
.pvPerfect{animation:pvFlashPerfect .65s ease both!important}
.actBurn{animation:actBurn .85s ease both}
.achievementToast{animation:achievementSlide 3.4s ease both}
.cardTip{position:absolute;bottom:calc(100% + 8px);left:50%;transform:translateX(-50%);z-index:60;
  background:#0a1a0b;border:1px solid rgba(201,168,76,.38);border-radius:6px;padding:7px 10px;
  white-space:nowrap;font-size:11px;color:#e8d8b4;pointer-events:none;
  box-shadow:0 4px 14px rgba(0,0,0,.65);line-height:1.5;font-family:Georgia,serif}
/* ── Responsive layout ── */
.hr-wrap{width:100%;max-width:520px;margin:0 auto;display:flex;flex-direction:column;min-height:100vh}
.hr-body{flex:1;display:flex;flex-direction:column;padding:14px;gap:10px;overflow-y:auto}
.hr-main{display:flex;flex-direction:column;gap:10px}
.hr-sidebar{display:none}
.hr-actbar{width:100%;padding:11px 16px;border-top:1px solid rgba(201,168,76,.1);
  background:rgba(0,0,0,.22);display:flex;gap:10px;justify-content:center;align-items:center;flex-shrink:0}
@media(min-width:820px){
  .hr-wrap{max-width:1060px}
  .hr-body{flex-direction:row;align-items:flex-start;padding:16px 16px 0}
  .hr-main{flex:1;min-width:0}
  .hr-sidebar{display:flex;flex-direction:column;width:240px;flex-shrink:0;position:sticky;top:0;
    max-height:calc(100vh - 110px);overflow-y:auto}
  .hr-actbar{border-radius:0}
}
`;

// ─── Sub-components ───────────────────────────────────────────────

// ─── Main component ───────────────────────────────────────────────

const ACTIVE_RUN_KEY = 'house-rules-active-run';
const GOLD = '#c9a84c';
const DIM  = '#7a6a4a';

// Events should remain occasional interruptions, even when a streak makes a
// contextual event eligible. The base chance still lives in data/events.ts;
// this multiplier lets the orchestrator tune overall pacing in one place.
const EVENT_CHANCE_MULTIPLIER = 0.75;
const STREAK_EVENT_CHANCE = 0.28;

function isPostActThreeEvent(id: EventId): boolean {
  const def = EVENT_DEFS[id] as { title?: string; name?: string } | undefined;
  const searchableName = `${String(id)} ${def?.title ?? ''} ${def?.name ?? ''}`;

  // surprise_boss is the current Closing House-style encounter. Matching the
  // display name as well keeps the gate intact if the event id is renamed.
  return id === 'surprise_boss' || /closing[\s_-]+house/i.test(searchableName);
}

interface GameHeaderProps {
  money: number;
  nickname: string;
  onOpenMenu: () => void;
  lives: number;
  heartBreakIdx: number;
  actIdx: number;
  tableIdx: number;
  isBoss: boolean;
  dealerName: string;
  dealerRank: DealerRank;
  ledgerTotal: number;
}

function GameHeader({
  money,
  nickname,
  onOpenMenu,
  lives,
  heartBreakIdx,
  actIdx,
  tableIdx,
  isBoss,
  dealerName,
  dealerRank,
  ledgerTotal,
}: GameHeaderProps) {
  return (
    <>
      <div style={{ width: '100%', padding: '9px 16px', display: 'flex',
        justifyContent: 'space-between', alignItems: 'center',
        borderBottom: '1px solid rgba(201,168,76,.1)', background: 'rgba(0,0,0,.2)' }}>
        <span style={{ color: GOLD, fontFamily: "'Cinzel',serif", fontSize: '13px', fontWeight: 600 }}>
          ${money}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontFamily: "'Cinzel',serif", fontSize: '11px', color: DIM, letterSpacing: '.1em' }}>
            {nickname}
          </span>
          <button onClick={onOpenMenu} title="Menu"
            style={{ background: 'none', border: '1px solid rgba(255,255,255,.1)', borderRadius: '4px',
              cursor: 'pointer', color: '#5a4e38', fontSize: '13px', padding: '2px 7px', lineHeight: 1,
              transition: 'color .14s ease' }}
            onMouseEnter={e => (e.currentTarget.style.color = '#c9a84c')}
            onMouseLeave={e => (e.currentTarget.style.color = '#5a4e38')}>
            ≡
          </button>
          <FullscreenBtn />
        </div>
        <HeartDisplay lives={lives} breakIdx={heartBreakIdx} />
      </div>
      <div style={{ width: '100%', padding: '6px 16px 8px',
        borderBottom: '1px solid rgba(255,255,255,.04)', background: 'rgba(0,0,0,.1)' }}>
        <RunTracker actIdx={actIdx} tableIdx={tableIdx} isBoss={isBoss}
          dealerName={dealerName} dealerRank={dealerRank} ledgerTotal={ledgerTotal} />
      </div>
    </>
  );
}

export function HouseRulesGame() {
  // Run state
  const [phase, setPhase]         = useState<GamePhase>('title');
  const [lives, setLives]         = useState(2);
  const [money, setMoney]         = useState(0);
  const [artifacts, setArtifacts] = useState<OwnedArtifact[]>([]);
  const [scUsedCount, setScUsedCount] = useState(0);

  // Navigation
  const [actIdx, setActIdx]   = useState(0);
  const [tableIdx, setTableIdx] = useState(0);
  const [isBoss, setIsBoss]   = useState(false);

  // Table state
  const [target, setTarget]       = useState(21);
  const [houseRule, setHouseRule]  = useState<null | 'hidden_hand' | 'exact_only' | 'pit_boss' | 'golden_dealer'>(null);
  const [deck, setDeck]           = useState<Card[]>([]);
  const [playerHand, setPlayerHand] = useState<Card[]>([]);
  const [dealerHand, setDealerHand] = useState<Card[]>([]);
  const [dealerHidden, setDealerHidden] = useState(true);
  const [kingPending, setKingPending] = useState<Card | null>(null);
  const [acePending, setAcePending]   = useState<Card | null>(null);  // waiting for 1/7/11 choice
  // Run config (selected before starting)
  const [selectedGameMode, setSelectedGameMode] = useState<GameMode>('card');
  const [selectedChar, setSelectedChar]         = useState<CharacterId>('newcomer');
  const [showdownSelected, setShowdownSelected] = useState(false);

  // Active run config (locked in when run starts)
  const [gameMode, setGameMode]                 = useState<GameMode>('card');
  const [showdownEnabled, setShowdownEnabled]   = useState(false);

  // Trinkets (consumables, max 3 in pocket)
  const [trinkets, setTrinkets]               = useState<TrinketId[]>([]);

  // Trinket active flags (modify next action)
  const [horseshoeActive, setHorseshoeActive] = useState(false);  // next pull = 5 options
  const [blindfoldActive, setBlindFoldActive] = useState(false);  // ignore hidden_hand
  const [queenHalvedPull, setQueenHalvedPull] = useState(false);  // Queen played — next number pick is halved
  const [nextPullFaceCard, setNextPullFaceCard] = useState(false); // Royal Summons trinket active

  // Showdown mode state
  const [showdownPile, setShowdownPile]             = useState<Card[]>([]);
  const [dealerFrozen, setDealerFrozen]             = useState(false);

  // Dealer preview pool — visible face-up during player turn
  const [dealerPreviewPool, setDealerPreviewPool]   = useState<Card[]>([]);
  const [dealerQueueCursor, setDealerQueueCursor]   = useState(0); // number of dealer choice pairs already consumed
  const [ltDealerPreviewPool, setLtDealerPreviewPool] = useState<LetterTile[]>([]);  // letter mode
  const [redactPending, setRedactPending]           = useState(false);  // waiting for player to click a card to remove
  const [winStreak, setWinStreak]                   = useState(0);
  // ── Deck counter ─────────────────────────────────────────────────
  const [totalDeckSize, setTotalDeckSize]       = useState(52);
  const [isReshuffling, setIsReshuffling]       = useState(false);

  // ── Event system ─────────────────────────────────────────────────
  // These are wired up in resolveEventChoice() and tryFireEvent() below.
  // ESLint 'no-unused-vars' warnings here are expected until events are
  // fully tested — the state is read/written by the event functions.
  const [activeEvent, setActiveEvent]           = useState<EventId | null>(null);
  const [seenEvents, setSeenEvents]             = useState<EventId[]>([]);
  const [pendingNav, setPendingNav]             = useState<{ai:number;ti:number;boss:boolean;arts:OwnedArtifact[]} | null>(null);
  const [dumpsterPulls, setDumpsterPulls]       = useState<DumpsterResult[]>([]);
  const [mirrorEntries, setMirrorEntries]       = useState(0);
  const [mirrorLastCard, setMirrorLastCard]     = useState<string | undefined>(undefined);
  const [goldenIdolActive, setGoldenIdolActive] = useState(false);
  const [goldenIdolTables, setGoldenIdolTables] = useState(0);
  const [nightShiftDraws, setNightShiftDraws]   = useState(0);
  const [offerArtifactId, setOfferArtifactId]   = useState<ArtifactId | null>(null);
  const [offerWins, setOfferWins]               = useState(0);
  const [offerTablesLeft, setOfferTablesLeft]   = useState(0);
  const [jestersInDeck, setJestersInDeck]       = useState(false);

  // ── Achievement counters ──────────────────────────────────────────
  const [perfectClearCount, setPerfectClearCount]   = useState(0);
  const [perfectClearStreak, setPerfectClearStreak] = useState(0);
  const [tablesWonThisAct, setTablesWonThisAct]     = useState(0);
  const [bustsThisTable, setBustsThisTable]          = useState(0);
  const [edgeWorkCount, setEdgeWorkCount]            = useState(0);
  const [wordClearCount, setWordClearCount]          = useState(0);
  const [overtimeWins, setOvertimeWins]              = useState(0);
  const [wasLastTableOvertime, setWasLastTableOvertime] = useState(false);

  // House ledger / dealer builds. Dealers spend ledger points into random artifact builds.
  const [houseLedger, setHouseLedger] = useState<{ total: number; history: LedgerEntry[] }>({ total: 0, history: [] });
  const [dealerArtifacts, setDealerArtifacts] = useState<OwnedArtifact[]>([]);
  const [dealerName, setDealerName] = useState('Table Dealer');
  const [dealerRank, setDealerRank] = useState<DealerRank>('normal');
  const [dealerDecisionLog, setDealerDecisionLog] = useState<DealerDecision[]>([]);

  // Pull state
  const [pullOptions, setPullOptions]   = useState<Card[] | null>(null);
  const [tcUsesLeft, setTcUsesLeft]     = useState(0);   // third_choice
  const [redraws, setRedraws]           = useState(0);   // second_wind
  const [jackActive, setJackActive]     = useState(false);
  const [jackPeeks, setJackPeeks]       = useState<Card[]>([]);
  const [pauperFreePull, setPauperFreePull] = useState(false);
  const [isPauperPull, setIsPauperPull] = useState(false);
  const [faceTargetUsed, setFaceTargetUsed] = useState(false);
  const [queenSavesLeft, setQueenSavesLeft] = useState(0);
  const [redrawAfterPick, setRedrawAfterPick] = useState(false);
  const [titheFree, setTitheFree] = useState(false);

  // Result state
  const [result, setResult]     = useState<TableResult | null>(null);
  const [msg, setMsg]           = useState('');
  const [tableLog, setTableLog] = useState<TableLogEntry[]>([]);
  const [tableEarned, setTableEarned] = useState(0);

  // Reward / shop
  const [rewardPool, setRewardPool] = useState<ArtifactId[]>([]);
  const [shopItems, setShopItems]   = useState<ShopItem[]>([]);
  const [shopRerolls, setShopRerolls] = useState(0);
  const [shopKind, setShopKind] = useState<'main' | 'last_call'>('main');
  const [shopExit, setShopExit] = useState<'nextAct' | 'nextTable'>('nextAct');
  const [lastCallVisits, setLastCallVisits] = useState(0);

  // Economy side-bets
  const [piggyBank, setPiggyBank] = useState<null | {
    deposit: number;
    value: number;
    step: number;
    cracked: boolean;
  }>(null);

  // Table-scoped artifact state
  const [contrarianUsesLeft, setContrarianUsesLeft] = useState(0);
  const [crookedPawnRank, setCrookedPawnRank] = useState<Card['rank'] | null>(null);
  const [oddPilgrimageClaimed, setOddPilgrimageClaimed] = useState(false);
  const [royalEchoUsesLeft, setRoyalEchoUsesLeft] = useState(0);
  const [jackEchoPulls, setJackEchoPulls] = useState(0);
  const [queenEchoHalves, setQueenEchoHalves] = useState(0);
  const [pullsThisTable, setPullsThisTable] = useState(0);
  const [bagSavedThisTable, setBagSavedThisTable] = useState(false);

  // Boss-specific state
  const [pitBossPhase, setPitBossPhase] = useState<1 | 2>(1);
  const [pitBannedRank, setPitBannedRank] = useState<Card['rank'] | null>(null);
  const [pitBannedFaceRank, setPitBannedFaceRank] = useState<Card['rank'] | null>(null);
  const [closingTime, setClosingTime] = useState(0);
  const [goldenChips, setGoldenChips] = useState(0);
  const [goldenRaidActive, setGoldenRaidActive] = useState(false);
  const [goldenGate, setGoldenGate] = useState<1 | 2>(1);
  const [goldenOpIndex, setGoldenOpIndex] = useState(0);
  const [goldenRaidDefeated, setGoldenRaidDefeated] = useState(false);

  // Lightweight achievement tracking for the current run
  const [runAchievements, setRunAchievements] = useState<string[]>([]);

  // UI feedback
  const [triggers, setTriggers]     = useState<TriggerEvent[]>([]);
  const [pulsingIds, setPulsingIds] = useState<Set<ArtifactId>>(new Set());
  const [scFlash, setScFlash]       = useState(false);
  const [heartBreakIdx, setHeartBreakIdx] = useState(-1);
  const [toast, setToast]           = useState('');
  const [showMenu, setShowMenu]     = useState(false);
  const [targetAnim, setTargetAnim] = useState(false);
  const [pvAnim, setPvAnim]         = useState<'up'|'down'|'perfect'|null>(null);

  // ─── Letter Mode state ───────────────────────────────────────────
  const [letterDeck, setLetterDeck]               = useState<LetterTile[]>([]);
  const [playerLetters, setPlayerLetters]         = useState<LetterTile[]>([]);
  const [dealerLetters, setDealerLetters]         = useState<LetterTile[]>([]);
  const [letterPullOptions, setLetterPullOptions] = useState<LetterTile[] | null>(null);
  const [letterShowdownPile, setLetterShowdownPile] = useState<LetterTile[]>([]);
  const [letterReserve, setLetterReserve]         = useState<LetterTile | null>(null);
  const [dealerReserveLetter, setDealerReserveLetter] = useState<LetterTile | null>(null);
  const [bannedLetter, setBannedLetter]           = useState<string | null>(null);
  const [minWordLength, setMinWordLength]         = useState(3);

  // Run log
  const [runLog, setRunLog] = useState<RunLogEntry[]>([]);
  const [playerData, setPlayerData] = useState<PlayerData | null>(null);
  const [viewingRun, setViewingRun] = useState<SavedRun | null>(null);
  const [phaseBeforeOverlay, setPhaseBeforeOverlay] = useState<GamePhase>('title');
  const [hasResumeSave, setHasResumeSave] = useState(false);
  const [resumeSummary, setResumeSummary] = useState<string | null>(null);
  const [achievementPops, setAchievementPops] = useState<{ id: string; name: string; detail?: string }[]>([]);

  // Refs
  const dealTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const achievementTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const unlockedAchievementNames = useRef<Set<string>>(new Set());
  const saveImportRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => {
    dealTimers.current.forEach(clearTimeout);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    achievementTimers.current.forEach(clearTimeout);
    achievementTimers.current.clear();
  }, []);

  // Keep the synchronous dedupe guard aligned with loaded profile/run data.
  // The ref also prevents two unlock checks in the same render from queuing
  // duplicate popups before React commits the state update.
  useEffect(() => {
    unlockedAchievementNames.current = new Set([
      ...(playerData?.achievements ?? []),
      ...runAchievements,
    ]);
  }, [playerData, runAchievements]);

  // Load history and unfinished-run metadata on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem('house-rules-data');
      if (raw) setPlayerData(JSON.parse(raw));

      const resume = readActiveRunSave();
      setHasResumeSave(!!resume);
      setResumeSummary(buildResumeSummary(resume));
    } catch { /* SSR or privacy mode */ }
  }, []);

  function readActiveRunSave(): ActiveRunSave | null {
    try {
      if (typeof localStorage === 'undefined') return null;
      const raw = localStorage.getItem(ACTIVE_RUN_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1 || !parsed.state) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function buildResumeSummary(save: ActiveRunSave | null) {
    if (!save) return null;
    const s = save.state ?? {};
    const mode = s.gameMode === 'alphabet' ? 'Alphabet' : 'Card';
    const place = `Act ${(s.actIdx ?? 0) + 1}${s.isBoss ? ' Boss' : ` Table ${(s.tableIdx ?? 0) + 1}`}`;
    const cash = typeof s.money === 'number' ? `$${s.money}` : '$0';
    return `${mode} · ${place} · ${cash}`;
  }

  function makeSaveFileName(save: ActiveRunSave) {
    const stamp = (save.savedAt ?? new Date().toISOString())
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .slice(0, 19);
    return `house-rules-save-${stamp}.json`;
  }

  // ─── Derived ────────────────────────────────────────────────────
  const contrarianStacks = artifactStacks('contrarian_deck', artifacts);
  const aceLicStacks     = artifactStacks('ace_license', artifacts);
  const pv = handValue(playerHand, target, contrarianStacks, aceLicStacks);
  const dv = handValue(dealerHand, target);
  const nickname = generateNickname(artifacts);
  const maxTrinkets = 3 + (getArtifactEffect('bag_of_holding', artifacts)?.trinketSlotBonus ?? 0);
  const dealerPreviewCount = Math.max(2, 6 - (artifactStacks('card_counter', artifacts)));
  const GOLDEN_OPS = ['+', '−', '×', '÷'] as const;
  const goldenOperator = GOLDEN_OPS[goldenOpIndex % GOLDEN_OPS.length];

  function isGoldenDealerRule() {
    return gameMode === 'card' && houseRule === 'golden_dealer';
  }

  function applyGoldenOperatorToCard(card: Card, previousTotal: number, opIndex = goldenOpIndex): Card {
    if (!isGoldenDealerRule()) return card;
    const op = GOLDEN_OPS[opIndex % GOLDEN_OPS.length];
    const raw = Math.max(1, Math.abs(card.chosenValue ?? card.value));
    let nextTotal = previousTotal;
    if (op === '+') nextTotal = previousTotal + card.value;
    else if (op === '−') nextTotal = previousTotal - raw;
    else if (op === '×') nextTotal = previousTotal * raw;
    else nextTotal = Math.floor(previousTotal / raw);
    const contribution = nextTotal - previousTotal;
    return { ...card, value: contribution, chosenValue: card.rank === 'A' ? contribution : card.chosenValue };
  }

  function advanceGoldenOperator() {
    if (isGoldenDealerRule()) setGoldenOpIndex(i => i + 1);
  }

  function renderDealerQueue() {
    if (gameMode !== 'card' || dealerPreviewPool.length === 0) return null;
    const pairs: Card[][] = [];
    for (let i = 0; i < dealerPreviewPool.length; i += 2) pairs.push(dealerPreviewPool.slice(i, i + 2));
    const playerRevealIdx = Math.max(0, pullsThisTable - 1);
    const dealerRevealIdx = Math.max(0, dealerQueueCursor);
    const currentPairIdx = phase === 'dealer' ? dealerRevealIdx : Math.max(playerRevealIdx, dealerRevealIdx);
    const visiblePairCount = Math.max(2, dealerQueueCursor + 2, currentPairIdx + 2);
    const shownPairs = Array.from({ length: visiblePairCount }, (_, idx) => pairs[idx] ?? []);

    return (
      <div style={{ marginTop: '10px', marginBottom: '10px', padding: '10px 12px 14px', borderRadius: '8px',
        background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
          <div>
            <div style={{ fontSize: '8px', letterSpacing: '.22em', fontFamily: "'Cinzel',serif",
              color: redactPending ? '#f87171' : '#4a4035', marginBottom: '2px' }}>
              {redactPending ? '✂ CLICK A CARD TO REMOVE IT' : 'DEALER QUEUE'}
            </div>
            <div style={{ fontSize: '9px', color: '#2a2a2a', fontFamily: "'EB Garamond',serif" }}>
              {redactPending
                ? 'Removed card is discarded from the run.'
                : 'Past turns stay visible. The next unreached dealer pair stays hidden until you risk another Pull.'}
            </div>
          </div>
          {redactPending && (
            <button onClick={() => { setRedactPending(false); setTrinkets(t => [...t, 'redact']); doToast('Redact cancelled.'); }}
              style={{ fontSize: '10px', color: DIM, background: 'none', border: 'none', cursor: 'pointer',
                fontFamily: "'Cinzel',serif", whiteSpace: 'nowrap', marginLeft: '8px' }}>
              CANCEL
            </button>
          )}
        </div>
        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '4px', alignItems: 'stretch', scrollSnapType: 'x proximity' }}>
          {shownPairs.map((pair, pairIdx) => {
            const wasConsumed = pairIdx < dealerQueueCursor;
            const decision = dealerDecisionLog[pairIdx];
            const reveal = redactPending || pairIdx <= currentPairIdx || wasConsumed || !!decision;
            const isCurrent = pairIdx === currentPairIdx && !wasConsumed;
            const isPast = wasConsumed || pairIdx < currentPairIdx;
            const label = decision ? 'played' : wasConsumed ? 'used' : isPast ? 'seen' : isCurrent ? 'current' : 'mystery';
            return (
              <div key={`dealer_pair_${pairIdx}`} style={{ minWidth: '132px', padding: '7px', borderRadius: '9px', scrollSnapAlign: 'start',
                background: isCurrent ? 'rgba(201,168,76,.07)' : isPast ? 'rgba(0,0,0,.28)' : 'rgba(0,0,0,.18)',
                border: `1px solid ${isCurrent ? 'rgba(201,168,76,.25)' : isPast ? 'rgba(103,232,249,.16)' : 'rgba(255,255,255,.06)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                  <span style={{ fontSize: '8px', color: isCurrent ? GOLD : isPast ? '#67e8f9' : DIM, letterSpacing: '.16em', fontFamily: "'Cinzel',serif" }}>
                    TURN {pairIdx + 1}
                  </span>
                  <span style={{ fontSize: '8px', color: isCurrent ? '#7a6a4a' : isPast ? '#3a6a6a' : '#3a3a3a', fontFamily: "'EB Garamond',serif" }}>
                    {label}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                  {[0, 1].map(slotIdx => {
                    const c = pair[slotIdx];
                    if (!c) {
                      return <div key={`empty_${slotIdx}`} style={{ width: '48px', height: '68px', borderRadius: '8px', background: '#1a3556', border: '1.5px solid #3a6090', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2a5080', fontWeight: 700 }}>?</div>;
                    }
                    const cardVal = c.value;
                    const isLarge = cardVal >= 8;
                    return (
                      <div key={c.id} style={{ position: 'relative', cursor: redactPending ? 'pointer' : 'default', textAlign: 'center' }}
                        onClick={() => {
                          if (!redactPending) return;
                          setDealerPreviewPool(p => p.filter(x => x.id !== c.id));
                          setRedactPending(false);
                          addTrigger(`✂ Redacted: ${c.rank}${c.suit}`, '#f87171');
                        }}>
                        <PlayingCard card={c} sm faceDown={!reveal} bright={redactPending || isCurrent || decision?.chosen?.id === c.id} dimmed={!!decision && decision.chosen.id !== c.id} />
                        {reveal && (
                          <div style={{ marginTop: '2px', fontSize: '10px', fontFamily: "'Cinzel',serif", fontWeight: 600,
                            color: decision?.chosen?.id === c.id ? GOLD : decision ? '#5a4e38' : isLarge ? '#f87171' : '#3a6a3a' }}>
                            {decision ? (decision.chosen.id === c.id ? 'chosen' : 'burned') : `+${cardVal}`}
                          </div>
                        )}
                        {redactPending && (
                          <div style={{ position: 'absolute', inset: '0 0 14px', borderRadius: '7px',
                            background: 'rgba(239,68,68,.38)', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', fontSize: '20px', color: '#ef4444', fontWeight: 900 }}>✕</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Persist unfinished runs after each render. Overlay/title/end screens do not overwrite the active combat snapshot.
  // Persist active run whenever the phase changes.
  // buildActiveRunSave captures all state in its closure — including it in deps
  // would re-run every render. Phase changes are the meaningful save points.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (phase === 'title' || phase === 'gameover' || phase === 'win' ||
        phase === 'run_log' || phase === 'achievements' || phase === 'compendium') return;
    try {
      const save = buildActiveRunSave();
      localStorage.setItem(ACTIVE_RUN_KEY, JSON.stringify(save));
      setHasResumeSave(prev => prev || true);
      setResumeSummary(prev => prev === save.summary ? prev : save.summary);
    } catch { /* ignore persistence failures */ }
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Feedback helpers ────────────────────────────────────────────
  function addTrigger(message: string, color = '#c9a84c', pulseId?: ArtifactId) {
    const id = `t${Date.now()}${Math.random()}`;
    setTriggers(prev => [...prev, { id, message, color }]);
    if (pulseId) {
      setPulsingIds(prev => new Set([...prev, pulseId]));
      setTimeout(() => setPulsingIds(prev => { const n = new Set(prev); n.delete(pulseId); return n; }), 1600);
    }
    setTimeout(() => setTriggers(prev => prev.filter(t => t.id !== id)), 2500);
  }

  function logEvent(label: string, amount?: number, color?: string) {
    setTableLog(prev => [...prev, { label, amount, color }]);
  }

  function doToast(t: string) {
    setToast(t);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 2400);
  }

  function openRunLog() {
    setPhaseBeforeOverlay(phase);
    setViewingRun(null);
    setPhase('run_log');
  }

  function openAchievements() {
    setPhaseBeforeOverlay(phase);
    setPhase('achievements');
  }

  function openCompendium() {
    setPhaseBeforeOverlay(phase);
    setPhase('compendium');
  }

  function closeOverlayPhase() {
    const backTo = phaseBeforeOverlay === 'run_log' || phaseBeforeOverlay === 'achievements' || phaseBeforeOverlay === 'compendium' ? 'title' : phaseBeforeOverlay;
    setViewingRun(null);
    setPhase(backTo);
  }

  function buildActiveRunSave(): ActiveRunSave {
    const act = gameMode === 'alphabet' ? LETTER_ACTS[Math.min(actIdx, LETTER_ACTS.length - 1)] : getCardAct(actIdx);
    const tableName = isBoss ? act.boss.name : act.tables[Math.min(tableIdx, act.tables.length - 1)]?.label ?? 'Table';
    const summary = `${gameMode === 'alphabet' ? 'Alphabet' : 'Card'} · ${act.name} · ${tableName} · $${money}`;
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      summary,
      state: {
        phase, lives, money, artifacts, scUsedCount,
        actIdx, tableIdx, isBoss, target, houseRule,
        deck, playerHand, dealerHand, dealerHidden, kingPending, acePending,
        selectedGameMode, selectedChar, showdownSelected, gameMode, showdownEnabled,
        trinkets, horseshoeActive, blindfoldActive, queenHalvedPull, nextPullFaceCard,
        showdownPile, dealerFrozen, dealerPreviewPool, dealerQueueCursor, ltDealerPreviewPool, redactPending, winStreak,
        houseLedger, dealerArtifacts, dealerName, dealerRank, dealerDecisionLog,
        pullOptions, tcUsesLeft, redraws, jackActive, jackPeeks, pauperFreePull, isPauperPull,
        faceTargetUsed, queenSavesLeft, redrawAfterPick, titheFree,
        result, msg, tableLog, tableEarned,
        rewardPool, shopItems, shopRerolls, shopKind, shopExit, lastCallVisits,
        piggyBank, contrarianUsesLeft, crookedPawnRank, oddPilgrimageClaimed,
        royalEchoUsesLeft, jackEchoPulls, queenEchoHalves, pullsThisTable, bagSavedThisTable,
        pitBossPhase, pitBannedRank, pitBannedFaceRank, closingTime,
        goldenChips, goldenRaidActive, goldenGate, goldenOpIndex, goldenRaidDefeated,
        runAchievements,
        activeEvent, seenEvents, pendingNav, dumpsterPulls, mirrorEntries, mirrorLastCard,
        goldenIdolActive, goldenIdolTables, nightShiftDraws,
        offerArtifactId, offerWins, offerTablesLeft, jestersInDeck, totalDeckSize,
        letterDeck, playerLetters, dealerLetters, letterPullOptions, letterShowdownPile,
        letterReserve, dealerReserveLetter,
        bannedLetter, minWordLength,
      },
    };
  }

  function loadActiveRun() {
    const save = readActiveRunSave();
    if (!save) {
      doToast('No unfinished run found.');
      setHasResumeSave(false);
      setResumeSummary(null);
      return;
    }

    const s = save.state ?? {};
    dealTimers.current.forEach(clearTimeout);
    dealTimers.current = [];

    setLives(s.lives ?? 2);
    setMoney(s.money ?? 0);
    setArtifacts(s.artifacts ?? []);
    setScUsedCount(s.scUsedCount ?? 0);
    setActIdx(s.actIdx ?? 0);
    setTableIdx(s.tableIdx ?? 0);
    setIsBoss(!!s.isBoss);
    setTarget(s.target ?? 21);
    setHouseRule(s.houseRule ?? null);
    setDeck(s.deck ?? []);
    setPlayerHand(s.playerHand ?? []);
    setDealerHand(s.dealerHand ?? []);
    setDealerHidden(s.dealerHidden ?? true);
    setKingPending(s.kingPending ?? null);
    setAcePending(s.acePending ?? null);

    setSelectedGameMode(s.selectedGameMode ?? s.gameMode ?? 'card');
    setSelectedChar(s.selectedChar ?? 'newcomer');
    setShowdownSelected(!!s.showdownSelected);
    setGameMode(s.gameMode ?? 'card');
    setShowdownEnabled(!!s.showdownEnabled);

    setTrinkets(s.trinkets ?? []);
    setHorseshoeActive(!!s.horseshoeActive);
    setBlindFoldActive(!!s.blindfoldActive);
    setQueenHalvedPull(!!s.queenHalvedPull);
    setNextPullFaceCard(!!s.nextPullFaceCard);

    setShowdownPile(s.showdownPile ?? []);
    setDealerFrozen(!!s.dealerFrozen);
    setDealerPreviewPool(s.dealerPreviewPool ?? []);
    setDealerQueueCursor(s.dealerQueueCursor ?? 0);
    setLtDealerPreviewPool(s.ltDealerPreviewPool ?? []);
    setRedactPending(!!s.redactPending);
    setWinStreak(s.winStreak ?? 0);

    setHouseLedger(s.houseLedger ?? { total: 0, history: [] });
    setDealerArtifacts(s.dealerArtifacts ?? []);
    setDealerName(s.dealerName ?? 'Table Dealer');
    setDealerRank(s.dealerRank ?? 'normal');
    setDealerDecisionLog(s.dealerDecisionLog ?? []);

    setPullOptions(s.pullOptions ?? null);
    setTcUsesLeft(s.tcUsesLeft ?? 0);
    setRedraws(s.redraws ?? 0);
    setJackActive(!!s.jackActive);
    setJackPeeks(s.jackPeeks ?? []);
    setPauperFreePull(!!s.pauperFreePull);
    setIsPauperPull(!!s.isPauperPull);
    setFaceTargetUsed(!!s.faceTargetUsed);
    setQueenSavesLeft(s.queenSavesLeft ?? 0);
    setRedrawAfterPick(!!s.redrawAfterPick);
    setTitheFree(!!s.titheFree);

    setResult(s.result ?? null);
    setMsg(s.msg ?? '');
    setTableLog(s.tableLog ?? []);
    setTableEarned(s.tableEarned ?? 0);

    setRewardPool(s.rewardPool ?? []);
    setShopItems(s.shopItems ?? []);
    setShopRerolls(s.shopRerolls ?? 0);
    setShopKind(s.shopKind ?? 'main');
    setShopExit(s.shopExit ?? 'nextAct');
    setLastCallVisits(s.lastCallVisits ?? 0);

    setPiggyBank(s.piggyBank ?? null);
    setContrarianUsesLeft(s.contrarianUsesLeft ?? 0);
    setCrookedPawnRank(s.crookedPawnRank ?? null);
    setOddPilgrimageClaimed(!!s.oddPilgrimageClaimed);
    setRoyalEchoUsesLeft(s.royalEchoUsesLeft ?? 0);
    setJackEchoPulls(s.jackEchoPulls ?? 0);
    setQueenEchoHalves(s.queenEchoHalves ?? 0);
    setPullsThisTable(s.pullsThisTable ?? 0);
    setBagSavedThisTable(!!s.bagSavedThisTable);
    setPitBossPhase(s.pitBossPhase ?? 1);
    setPitBannedRank(s.pitBannedRank ?? null);
    setPitBannedFaceRank(s.pitBannedFaceRank ?? null);
    setClosingTime(s.closingTime ?? 0);
    setGoldenChips(s.goldenChips ?? 0);
    setGoldenRaidActive(!!s.goldenRaidActive);
    setGoldenGate(s.goldenGate ?? 1);
    setGoldenOpIndex(s.goldenOpIndex ?? 0);
    setGoldenRaidDefeated(!!s.goldenRaidDefeated);
    setRunAchievements(s.runAchievements ?? []);
    setActiveEvent(s.activeEvent ?? null);
    setSeenEvents(s.seenEvents ?? []);
    setPendingNav(s.pendingNav ?? null);
    setDumpsterPulls(s.dumpsterPulls ?? []);
    setMirrorEntries(s.mirrorEntries ?? 0);
    setMirrorLastCard(s.mirrorLastCard);
    setGoldenIdolActive(!!s.goldenIdolActive);
    setGoldenIdolTables(s.goldenIdolTables ?? 0);
    setNightShiftDraws(s.nightShiftDraws ?? 0);
    setOfferArtifactId(s.offerArtifactId ?? null);
    setOfferWins(s.offerWins ?? 0);
    setOfferTablesLeft(s.offerTablesLeft ?? 0);
    setJestersInDeck(!!s.jestersInDeck);
    setTotalDeckSize(s.totalDeckSize ?? 52);

    setLetterDeck(s.letterDeck ?? []);
    setPlayerLetters(s.playerLetters ?? []);
    setDealerLetters(s.dealerLetters ?? []);
    setLetterPullOptions(s.letterPullOptions ?? null);
    setLetterShowdownPile(s.letterShowdownPile ?? []);
    setLetterReserve(s.letterReserve ?? null);
    setDealerReserveLetter(s.dealerReserveLetter ?? null);
    setBannedLetter(s.bannedLetter ?? null);
    setMinWordLength(s.minWordLength ?? 3);

    setPhaseBeforeOverlay('title');
    setPhase(s.phase === 'run_log' || s.phase === 'achievements' || s.phase === 'compendium' || s.phase === 'title' ? 'table' : (s.phase ?? 'table'));
    setHasResumeSave(true);
    setResumeSummary(save.summary ?? buildResumeSummary(save));
    doToast('Run resumed.');
  }

  function exportActiveRunSave() {
    try {
      const save = readActiveRunSave() ?? buildActiveRunSave();
      const blob = new Blob([JSON.stringify(save, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = makeSaveFileName(save);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      doToast('Save exported.');
    } catch {
      doToast('Could not export save.');
    }
  }

  function importActiveRunSave(file: File | null) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result ?? ''));
        if (!parsed || parsed.version !== 1 || !parsed.state) throw new Error('invalid save');
        localStorage.setItem(ACTIVE_RUN_KEY, JSON.stringify(parsed));
        setHasResumeSave(true);
        setResumeSummary(buildResumeSummary(parsed));
        doToast('Save imported. Use Continue to load it.');
      } catch {
        doToast('Invalid House Rules save file.');
      } finally {
        if (saveImportRef.current) saveImportRef.current.value = '';
      }
    };
    reader.readAsText(file);
  }

  function unlockAchievement(name: string, detail?: string) {
    if (unlockedAchievementNames.current.has(name)) return;
    unlockedAchievementNames.current.add(name);
    setRunAchievements(prev => prev.includes(name) ? prev : [...prev, name]);
    const popId = `a${Date.now()}${Math.random()}`;
    setAchievementPops(prev => [...prev, { id: popId, name, detail }]);
    const timer = setTimeout(() => {
      setAchievementPops(prev => prev.filter(p => p.id !== popId));
      achievementTimers.current.delete(popId);
    }, 3600);
    achievementTimers.current.set(popId, timer);
    if (detail) logEvent(`Achievement: ${name} — ${detail}`, undefined, '#facc15');
  }

  function getShopRerollCost(rerolls = shopRerolls) {
    const discount = getArtifactEffect('midas_mark', artifacts)?.shopRerollDiscount ?? 0;
    return Math.max(1, 3 + rerolls * 2 - discount);
  }

  function addHouseLedger(source: string, points: number, ai = actIdx, ti = tableIdx) {
    setHouseLedger(prev => ({
      total: prev.total + points,
      history: [...prev.history, { source, points, act: ai, table: ti }].slice(-40),
    }));
  }

  function makeDealerForTable(ai: number, ti: number, boss: boolean, ledgerTotal = houseLedger.total) {
    const heat = getHeatIntensity(ai);
    const rank: DealerRank = boss ? (ai >= 2 && ai < 3 ? 'act3Boss' : 'boss') : (ai >= 2 ? 'elite' : 'normal');
    const budgetPoints = boss
      ? Math.floor(ledgerTotal * (rank === 'act3Boss' ? 0.95 : ai >= 3 ? 0.90 : 0.72)) + 12 + heat * 8
      : Math.max(0, Math.floor(ledgerTotal * (ai >= 3 ? 0.65 : ai >= 2 ? 0.50 : 0.25)) + ai * 4 + heat * 5);
    const ledger = createLedgerBudget(budgetPoints, rank);
    const arts = generateDealerArtifactsFromBudget(ledger);
    return { rank, arts, name: generateDealerNameFromArtifacts(arts, rank) };
  }

  function buildShopItems(
    currentArts = artifacts,
    currentMoney = money,
    currentLives = lives,
    kind: 'main' | 'last_call' = shopKind,
    rerolls = shopRerolls,
  ) {
    const baseItems = generateShopItems(
      currentArts,
      currentMoney,
      currentLives,
      2,
      gameMode,
      showdownEnabled,
      {
        rerollCost: getShopRerollCost(rerolls),
        includeHeal: kind === 'main',
        shopKind: kind,
      },
    );

    if (gameMode !== 'card' || goldenRaidDefeated) return baseItems;
    const discount = getArtifactEffect('midas_mark', currentArts)?.goldenChipDiscount ?? 0;
    const chipCost = Math.max(1, 8 - discount);
    return [
      ...baseItems,
      {
        id: 'golden_chip',
        type: 'golden_chip' as const,
        label: `◉ Golden Chip (${goldenChips}/3)`,
        description: 'Buy 3 to force the Golden Dealer raid. The third chip immediately throws you out of the shop.',
        cost: chipCost,
        available: currentMoney >= chipCost,
      },
    ];
  }

  function refreshShopAvailability(items: ShopItem[], currentMoney: number) {
    return items.map(i => ({ ...i, available: currentMoney >= i.cost })) as ShopItem[];
  }

  function crackPiggyBank() {
    setPiggyBank(pb => pb && !pb.cracked ? { ...pb, value: pb.deposit, cracked: true } : pb);
  }

  function growPiggyBank() {
    setPiggyBank(pb => {
      if (!pb || pb.cracked) return pb;
      const growth = [0.30, 0.20, 0.10, 0.05][Math.min(pb.step, 3)];
      const nextValue = Math.max(pb.value + 1, Math.floor(pb.value * (1 + growth)));
      addTrigger(`◍ Piggy Bank grew to $${nextValue}`, '#fbbf24');
      return { ...pb, value: nextValue, step: pb.step + 1 };
    });
  }

  function cashOutPiggyBank() {
    if (!piggyBank) return;
    const payout = Math.floor(piggyBank.value);
    setMoney(m => m + payout);
    setPiggyBank(null);
    addTrigger(`◍ Piggy Bank cashed out: +$${payout}`, '#fbbf24');
    setShopItems(prev => refreshShopAvailability(prev, money + payout));
  }


  function clearFightArtifactStatuses(arts: OwnedArtifact[]): OwnedArtifact[] {
    return arts.map((art): OwnedArtifact => {
      if (!art.status) return art;

      const cleanStatus = { ...art.status };
      delete cleanStatus.lockedForFight;
      delete cleanStatus.forcedStacks;
      delete cleanStatus.disabledUntilTableEnd;
      delete cleanStatus.lockedUntilTurn;

      return {
        ...art,
        status: Object.keys(cleanStatus).length > 0 ? cleanStatus : undefined,
      };
    });
  }

  function lockOnePitBossArtifact(
    arts: OwnedArtifact[],
  ): { arts: OwnedArtifact[]; lockedName: string | null } {
    const candidates = arts
      .filter(a => effectiveArtifactStacks(a) > 0 && !a.status?.lockedForFight && a.status?.forcedStacks == null)
      .sort((a, b) => (b.stacks - a.stacks) || ARTIFACT_DEFS[a.id].name.localeCompare(ARTIFACT_DEFS[b.id].name));

    const picked = candidates[0];
    if (!picked) return { arts, lockedName: null };

    const nextArts = arts.map((art): OwnedArtifact => {
      if (art.id !== picked.id) return art;
      if (art.stacks >= 4) {
        return { ...art, status: { ...(art.status ?? {}), forcedStacks: 1 } };
      }
      return { ...art, status: { ...(art.status ?? {}), lockedForFight: true } };
    });

    const suffix = picked.stacks >= 4 ? 'suppressed to I' : 'locked';
    return { arts: nextArts, lockedName: `${ARTIFACT_DEFS[picked.id].name} ${suffix}` };
  }

  function choosePitBossPhaseBan(): Card['rank'] | null {
    const allowed: Card['rank'][] = ['2','3','4','5','6','7','8','9','10'];
    return allowed[Math.floor(Math.random() * allowed.length)] ?? null;
  }

  function choosePitBossFaceBan(): Card['rank'] | null {
    const allowed: Card['rank'][] = ['J','Q','K','A'];
    return allowed[Math.floor(Math.random() * allowed.length)] ?? null;
  }

  function isPitBossRule() {
    return gameMode === 'card' && isBoss && houseRule === 'pit_boss';
  }

  function isPitCardBanned(card: Card) {
    return isPitBossRule() && (card.rank === pitBannedRank || (pitBossPhase >= 2 && card.rank === pitBannedFaceRank));
  }

  function rankBanReadable(rank: Card['rank'] | null | undefined) {
    if (!rank) return '';
    if (rank === 'A') return 'Ace rank';
    if (rank === 'K') return 'King rank';
    if (rank === 'Q') return 'Queen rank';
    if (rank === 'J') return 'Jack rank';
    return `${rank} rank`;
  }

  function banLabel() {
    return [pitBannedRank, pitBossPhase >= 2 ? pitBannedFaceRank : null]
      .filter(Boolean)
      .map(r => rankBanReadable(r as Card['rank']))
      .join(' + ');
  }

  function spendRoyalEcho(label: string) {
    if (royalEchoUsesLeft <= 0) return false;
    setRoyalEchoUsesLeft(n => Math.max(0, n - 1));
    addTrigger(`Royal Echo: ${label}`, '#f0abfc', 'royal_echo');
    logEvent(`Royal Echo: ${label}`, undefined, '#f0abfc');
    return true;
  }

  function addRunEntry(res: TableResult, pVal: number, dVal: number, earned: number, ai = actIdx, ti = tableIdx, boss = isBoss, arts = artifacts) {
    const act = gameMode === 'alphabet' ? LETTER_ACTS[Math.min(ai, LETTER_ACTS.length - 1)] : getCardAct(ai);
    const label = boss && goldenRaidActive ? 'The Golden Dealer' : boss ? act.boss.name : (act.tables[Math.min(ti, act.tables.length - 1)]?.label ?? 'Table');
    setRunLog(prev => [...prev, {
      actName: act.name, tableLabel: label, isBoss: boss,
      result: res, playerValue: pVal, dealerValue: dVal, earned,
      artifactIds: arts.map(a => a.id),
    }]);
  }

  // ─── beginLetterTable ────────────────────────────────────────────
  function beginLetterTable(ai: number, ti: number, boss: boolean, arts = artifacts, targetOverride?: number) {
    const act   = LETTER_ACTS[Math.min(ai, LETTER_ACTS.length - 1)];
    const tData = boss ? act.boss : act.tables[Math.min(ti, act.tables.length - 1)];
    const dk    = shuffle([...createLetterDeck(), ...createLetterDeck()]);

    const rule = (tData as any).rule;
    if (boss) {
      if (rule === 'censor') {
        const vowels = ['A','E','I','O','U'];
        setBannedLetter(vowels[Math.floor(Math.random() * vowels.length)]);
        setMinWordLength(3);
      } else if (rule === 'editor') {
        setBannedLetter(null);
        setMinWordLength(4);
      } else {
        setBannedLetter(null); setMinWordLength(3);
      }
    } else { setBannedLetter(null); setMinWordLength(3); }

    setTarget(targetOverride ?? tData.target);
    const ltPreviewN = Math.max(2, 6 - (artifactStacks('card_counter', arts)));
    setLtDealerPreviewPool(dk.slice(2, 2 + ltPreviewN));
    setLetterReserve(dk[2 + ltPreviewN] ?? null);
    setDealerReserveLetter(dk[3 + ltPreviewN] ?? null);
    setLetterDeck(dk.slice(4 + ltPreviewN));
    setDealerLetters([dk[0], dk[1]]);
    setPlayerLetters([]);
    setLetterPullOptions(null);
    setLetterShowdownPile([]);
    setDealerHidden(true);
    setDealerFrozen(false);
    setResult(null); setMsg(''); setTableLog([]); setTableEarned(0);
    setQueenSavesLeft(0); setTcUsesLeft(0); setRedraws(0);
    setJackActive(false); setJackPeeks([]);
    const tc = getArtifactEffect('third_choice', arts);
    if (tc) {
      const thirdChoice = arts.find(a => a.id === 'third_choice');
      const tcStacks = thirdChoice ? effectiveArtifactStacks(thirdChoice) : 0;
      setTcUsesLeft(tcStacks >= 3 ? 999 : tc.pullCountUses ?? 0);
    }
    const sw = getArtifactEffect('second_wind', arts);
    if (sw) setRedraws(sw.redraws ?? 0);
    setActIdx(ai); setTableIdx(ti); setIsBoss(boss);
    setPhase('table');
  }

  // ─── doLetterPull ────────────────────────────────────────────────
  function doLetterPull() {
    if (phase !== 'table' || letterPullOptions) return;
    // Reserve Letter gives Alphabet Mode more planning, so the base Pull stays at 2.
    let count = 2;
    if (tcUsesLeft > 0) { count = 3; setTcUsesLeft(u => u - 1); }
    if (jackActive) { count = Math.max(count, 3); setJackActive(false); }
    if (horseshoeActive) { count = Math.max(count, 5); setHorseshoeActive(false); addTrigger('⋒ Lucky Horseshoe: 5 options!', '#22c55e'); }

    // Draw from deck, skipping banned letter
    const pool = [...letterDeck];
    const opts: LetterTile[] = [];
    let di = 0;
    while (opts.length < count && di < pool.length) {
      const t = pool[di++];
      if (bannedLetter && t.letter === bannedLetter) continue;
      opts.push(t);
    }
    setLetterDeck(pool.slice(di));
    setLetterPullOptions(opts.length > 0 ? opts : null);
  }

  // ─── pickLetter / Reserve Letter ────────────────────────────────
  function addLetterToPlayer(tile: LetterTile, source: 'pull' | 'reserve') {
    if (bannedLetter && tile.letter === bannedLetter) return;
    if (source === 'pull') setLetterPullOptions(null);

    const newHand = [...playerLetters, tile];
    setPlayerLetters(newHand);

    const curVal = letterHandValue(playerLetters);
    const newVal = letterHandValue(newHand);
    if (newVal === target) setPvAnim('perfect');
    else if (newVal > curVal) setPvAnim('up');
    else setPvAnim('down');
    setTimeout(() => setPvAnim(null), 750);

    const nextDeck = [...letterDeck];

    // Showdown: dealer draws face-down after each player letter action.
    if (showdownEnabled && !dealerFrozen && nextDeck.length > 0) {
      const hidden = nextDeck.shift()!;
      setLetterShowdownPile(prev => [...prev, hidden]);
    }

    // If the reserve was empty, refill it only after a normal Pull choice.
    // This prevents the side letter from chaining endlessly for free.
    if (source === 'pull' && !letterReserve && nextDeck.length > 0) {
      setLetterReserve(nextDeck.shift()!);
    }

    setLetterDeck(nextDeck);

    const word = findWordInSequence(newHand.map(t => t.letter), WORD_SET, minWordLength)?.word ?? null;
    if (newVal > target && !word) {
      const br = calcBustResult(lives, money, artifacts, scUsedCount);
      applyBustResult(br, newVal, target);
      return;
    }
    if (word && newVal > target) doToast(`Word Clear ready: "${word}"`);
    else if (word && newVal === target) doToast(`✦ Perfect Clear: "${word}" = ${target}!`);
  }

  function pickLetter(tile: LetterTile) {
    if (!letterPullOptions) return;
    addLetterToPlayer(tile, 'pull');
  }

  function useLetterReserve() {
    if (phase !== 'table' || !letterReserve) return;
    if (bannedLetter && letterReserve.letter === bannedLetter) { doToast('Reserve letter is banned.'); return; }
    const tile = letterReserve;
    setLetterReserve(null);
    // If pull options were open, dismiss them — the reserve replaces the pull choice.
    if (letterPullOptions) setLetterPullOptions(null);
    addTrigger(`Reserve Letter: ${tile.letter} (+${tile.value})`, '#67e8f9');
    addLetterToPlayer(tile, 'reserve');
  }

  // ─── doLetterRedraw ──────────────────────────────────────────────
  function doLetterRedraw() {
    if (redraws <= 0 || !letterPullOptions) return;
    const count = letterPullOptions.length;
    const pool = [...letterDeck];
    const opts: LetterTile[] = [];
    let di = 0;
    while (opts.length < count && di < pool.length) {
      const t = pool[di++];
      if (bannedLetter && t.letter === bannedLetter) continue;
      opts.push(t);
    }
    setLetterDeck(pool.slice(di));
    setLetterPullOptions(opts);
    setRedraws(r => r - 1);
    addTrigger('Second Wind: options redrawn', '#67e8f9', 'second_wind');
  }

  // ─── doLetterStand ───────────────────────────────────────────────
  function doLetterStand() {
    if (phase !== 'table' || !playerLetters.length || letterPullOptions) return;
    const lv   = letterHandValue(playerLetters);
    const word = findWordInSequence(playerLetters.map(t => t.letter), WORD_SET, minWordLength)?.word ?? null;

    if (lv > target) {
      if (word) {
        // Word Clear — auto-win even when over target
        const base = isBoss ? 8 : 3;
        let earn = base;
        const log: TableLogEntry[] = [{ label: `Word Clear: "${word}"`, amount: base, color: '#22c55e' }];
        const hsEff = getArtifactEffect('high_stakes', artifacts);
        if (hsEff?.winBonus) { earn += hsEff.winBonus; log.push({ label: 'High Stakes', amount: hsEff.winBonus, color: '#f87171' }); }
        setMoney(money + earn);
        setResult('win'); setMsg(`Word Clear — "${word}" saves the bust!`);
        setTableLog(log); setTableEarned(earn);
        addRunEntry('win', lv, 0, earn);
        dealTimers.current.push(setTimeout(() => setPhase('result'), 400));
      } else {
        const br = calcBustResult(lives, money, artifacts, scUsedCount);
        applyBustResult(br, lv, target);
      }
      return;
    }

    // Under/at target — dealer plays
    const lSnap = buildLetterSnap(playerLetters, letterDeck, dealerLetters, target, word, lv);
    startLetterDealerTurn(lSnap);
  }

  // ─── Letter Snap ─────────────────────────────────────────────────
  interface LetterSnap {
    pLetters: LetterTile[]; dLetters: LetterTile[]; dk: LetterTile[];
    tgt: number; playerWord: string | null; playerVal: number;
    arts: OwnedArtifact[]; ai: number; ti: number; boss: boolean;
    curLives: number; curMoney: number; curSc: number;
    showdownEnabled: boolean; letterShowdownPile: LetterTile[]; dealerFrozen: boolean;
    ltDealerPreviewPool: LetterTile[];
    dealerReserveLetter: LetterTile | null;
  }

  function buildLetterSnap(
    pL: LetterTile[], dk: LetterTile[], dL: LetterTile[],
    tgt: number, word: string | null, pVal: number
  ): LetterSnap {
    return {
      pLetters: [...pL], dLetters: [...dL], dk: [...dk],
      tgt, playerWord: word ?? null, playerVal: pVal, arts: [...artifacts],
      ai: actIdx, ti: tableIdx, boss: isBoss,
      curLives: lives, curMoney: money, curSc: scUsedCount,
      showdownEnabled, letterShowdownPile: [...letterShowdownPile], dealerFrozen,
      ltDealerPreviewPool: [...ltDealerPreviewPool],
      dealerReserveLetter,
    };
  }

  // ─── startLetterDealerTurn ───────────────────────────────────────
  function startLetterDealerTurn(snap: LetterSnap) {
    setPhase('dealer');
    setDealerHidden(false);

    const fullDH = snap.showdownEnabled && snap.letterShowdownPile.length > 0
      ? [...snap.dLetters, ...snap.letterShowdownPile]
      : snap.dLetters;
    if (snap.showdownEnabled && snap.letterShowdownPile.length > 0) {
      setDealerLetters(fullDH);
      setLetterShowdownPile([]);
    }

    const { steps, finalHand } = letterDealerAI(
      fullDH,
      snap.dealerFrozen ? [] : (snap.dealerReserveLetter ? [snap.dealerReserveLetter, ...snap.ltDealerPreviewPool] : snap.ltDealerPreviewPool),
      snap.dealerFrozen ? [] : snap.dk,
      snap.playerVal,
      snap.playerWord?.length ?? 0,
      snap.tgt,
      WORD_SET,
      minWordLength,
    );

    if (snap.dealerReserveLetter) setDealerReserveLetter(null);

    steps.forEach((hand, i) => {
      dealTimers.current.push(setTimeout(() => setDealerLetters(hand), 500 + i * 850));
    });
    dealTimers.current.push(setTimeout(() => {
      finalizeLetterResult(snap.pLetters, finalHand, snap);
    }, 500 + steps.length * 850 + 500));
  }

  // ─── finalizeLetterResult ────────────────────────────────────────
  function finalizeLetterResult(pLetters: LetterTile[], finalDH: LetterTile[], snap: LetterSnap) {
    const dVal   = letterHandValue(finalDH);
    const pVal   = snap.playerVal;
    const pWord  = snap.playerWord;
    const dWord  = findBestWord(finalDH, WORD_SET, minWordLength);
    const dBust  = dVal > snap.tgt && !dWord;
    const isPfct = !!pWord && pVal === snap.tgt;

    // Win/Tie logic: word beats no-word; equal-length words or equal values = PUSH
    let win = false;
    let tie = false;
    let winMsg = '';
    if (dBust)               { win = true;  winMsg = `Dealer busted with ${dVal}`; }
    else if (pWord && !dWord) { win = true;  winMsg = `"${pWord}" vs no word`; }
    else if (pWord && dWord)  {
      if (pWord.length > dWord.length) { win = true; winMsg = `"${pWord}" (${pWord.length}L) beats "${dWord}"`; }
      else if (pWord.length === dWord.length) { tie = true; winMsg = `PUSH — both formed a ${pWord.length}-letter word`; }
      else { winMsg = `Dealer's "${dWord}" beats "${pWord}"`; }
    } else if (pVal === dVal && pVal <= snap.tgt) { tie = true; winMsg = `PUSH — tied at ${pVal}`; }
    else                  { win = pVal > dVal && pVal <= snap.tgt; winMsg = win ? `${pVal} beats ${dVal}` : `Dealer ${dVal} vs you ${pVal}`; }

    const log: TableLogEntry[] = [];
    let earn = 0;

    if (tie) {
      // PUSH — no money gained, no life lost
      setResult('tie');
      setMsg(`Push — ${winMsg}`);
      setTableLog([{ label: 'PUSH — overtime', color: '#94a3b8' }, { label: `Target will rise to ${snap.tgt + 8}`, color: '#c9a84c' }]);
      setTableEarned(0);
      addRunEntry('tie', pVal, dVal, 0, snap.ai, snap.ti, snap.boss, snap.arts);
      setPhase('result');
      return;
    }

    if (tie) {
      setDealerLetters(finalDH);
      setResult('tie');
      setMsg(`Push — ${winMsg}`);
      setTableLog([{ label: 'PUSH — overtime', color: '#94a3b8' }, { label: `Target will rise to ${snap.tgt + 8}`, color: '#c9a84c' }]);
      setTableEarned(0);
      addRunEntry('tie', pVal, dVal, 0, snap.ai, snap.ti, snap.boss, snap.arts);
      setPhase('result');
      return;
    }

    if (win) {
      if (snap.boss && pullsThisTable <= 1) unlockAchievement('Quickdraw Boss', 'beat a boss after pulling only once');
      const base = snap.boss ? 8 : 3;
      earn += base;
      log.push({ label: snap.boss ? 'Boss win' : 'Table win', amount: base });
      if (isPfct) {
        const ldEff = getArtifactEffect('lucky_draw', snap.arts);
        const pb = ldEff?.perfectBonus ?? 1;
        earn += pb;
        log.push({ label: 'Perfect Clear ✦', amount: pb, color: '#c9a84c' });
        addTrigger('✦ Perfect Clear!', '#c9a84c', 'lucky_draw');
        if (ldEff?.perfectRestoresLife && snap.curLives < 2) { setLives(l => Math.min(l + 1, 2)); log.push({ label: 'Lucky Draw: +1 Life!', color: '#facc15' }); }
      }
      const hsEff = getArtifactEffect('high_stakes', snap.arts);
      if (hsEff?.winBonus) { earn += hsEff.winBonus; log.push({ label: 'High Stakes', amount: hsEff.winBonus, color: '#f87171' }); }

      // ── Hot Streak ────────────────────────────────────────────
      const newStreak = winStreak + 1;
      const strkEff = getArtifactEffect('hot_streak', snap.arts);
      if (strkEff?.streakBonus && newStreak >= (strkEff.streakMinWins ?? 2)) {
        earn += strkEff.streakBonus;
        log.push({ label: `Hot Streak (${newStreak}W): +$${strkEff.streakBonus}`, amount: strkEff.streakBonus, color: '#fb923c' });
        addTrigger(`🔥 Hot Streak! +$${strkEff.streakBonus}`, '#fb923c', 'hot_streak');
      }
      setWinStreak(newStreak);

      // ── Edge Work ─────────────────────────────────────────────
      const ewEff = getArtifactEffect('edge_work', snap.arts);
      if (ewEff?.edgeBonus) {
        const dist = snap.tgt - pVal;
        if (dist >= 0 && dist <= (ewEff.edgeRange ?? 2)) {
          const ewBonus = dist === 0 ? (ewEff.edgePerfectBonus ?? ewEff.edgeBonus) : ewEff.edgeBonus;
          earn += ewBonus;
          log.push({ label: `Edge Work (${dist === 0 ? 'exact!' : dist + ' away'}): +$${ewBonus}`, amount: ewBonus, color: '#34d399' });
          addTrigger(`Edge Work: +$${ewBonus}`, '#34d399', 'edge_work');
        }
      }

      // ── House Cut ─────────────────────────────────────────────
      if (dBust) {
        const hcEff = getArtifactEffect('house_cut', snap.arts);
        if (hcEff?.dealerBustBonus) {
          earn += hcEff.dealerBustBonus;
          log.push({ label: `House Cut: dealer busted +$${hcEff.dealerBustBonus}`, amount: hcEff.dealerBustBonus, color: '#a3e635' });
          addTrigger(`House Cut: +$${hcEff.dealerBustBonus}`, '#a3e635', 'house_cut');
        }
      }

      setMoney(snap.curMoney + earn);
    } else if (tie) {
      // ── Insurance push money ───────────────────────────────────
      const insEff = getArtifactEffect('insurance_policy', snap.arts);
      if (insEff?.insurancePushMoney) {
        const pm = insEff.insurancePushMoney;
        earn += pm;
        setMoney(snap.curMoney + pm);
        log.push({ label: `Insurance: push bonus +$${pm}`, amount: pm, color: '#7dd3fc' });
      }
      // Streak: survived tie
      const strkEff2 = getArtifactEffect('hot_streak', snap.arts);
      if (strkEff2?.streakSurviveTie) setWinStreak(winStreak); // preserve
      else setWinStreak(0);
    } else {
      // ── Insurance Policy: close loss → push ───────────────────
      const insEff = getArtifactEffect('insurance_policy', snap.arts);
      if (insEff?.insuranceMargin && !dBust) {
        const margin = dVal - pVal;
        if (margin > 0 && margin <= insEff.insuranceMargin) {
          // Convert loss to push — re-run as tie
          addTrigger(`Insurance: ${margin}-pt loss → push`, '#7dd3fc', 'insurance_policy');
          const pm = insEff.insurancePushMoney ?? 0;
          if (pm > 0) { setMoney(snap.curMoney + pm); log.push({ label: `Insurance push: +$${pm}`, amount: pm, color: '#7dd3fc' }); }
          log.push({ label: 'PUSH — overtime', color: '#94a3b8' });
          log.push({ label: `Target will rise to ${snap.tgt + 8}`, color: '#c9a84c' });
          setResult('tie'); setMsg(`Push (Insurance) — lost by ${margin}`);
          setTableLog(log); setTableEarned(earn);
          addRunEntry('tie', pVal, dVal, earn, snap.ai, snap.ti, snap.boss, snap.arts);
          setPhase('result');
          setWinStreak(0);
          return;
        }
      }
      setWinStreak(0);

      const hsEff2 = getArtifactEffect('high_stakes', snap.arts);
      const penalty = Math.min(snap.curMoney, hsEff2?.bustPenalty ?? 0);
      const curMoney = snap.curMoney - penalty;
      if (penalty > 0) log.push({ label: 'High Stakes penalty', amount: -penalty, color: '#f87171' });
      const br = calcBustResult(snap.curLives, curMoney, snap.arts, snap.curSc);
      setLives(br.newLives); setMoney(br.newMoney); setScUsedCount(br.newScUsed);
      if (br.trigger) { addTrigger(br.trigger, br.triggerColor, br.pulseId ?? undefined); log.push({ label: br.trigger!, color: br.triggerColor }); }
      if (br.isSecondChance) { setScFlash(true); setTimeout(() => setScFlash(false), 2800); }
      if (!br.saved) { crackPiggyBank(); setHeartBreakIdx(br.newLives); setTimeout(() => setHeartBreakIdx(-1), 2000); }
    }

    setDealerLetters(finalDH);
    setResult(win ? 'win' : tie ? 'tie' : 'lose');
    setMsg(win ? `Win — ${winMsg}` : tie ? `Push — ${winMsg}` : `Loss — ${winMsg}`);
    setTableLog(log); setTableEarned(earn);
    addRunEntry(win ? 'win' : 'lose', pVal, dVal, earn, snap.ai, snap.ti, snap.boss, snap.arts);
    setPhase('result');
  }
  function beginTable(ai: number, ti: number, boss: boolean, arts = artifacts, requestedPitPhase: 1 | 2 = 1, targetOverride?: number, opts: { skipPitLock?: boolean; keepDealer?: boolean; pitNumberBan?: Card['rank'] | null; pitFaceBan?: Card['rank'] | null; deckSize?: 52 | 104 } = {}) {
    const act = getCardAct(ai);
    const tData = boss ? act.boss : act.tables[ti];
    const isPitBossFight = boss && tData.rule === 'pit_boss';
    const currentPitPhase: 1 | 2 = isPitBossFight ? requestedPitPhase : 1;
    let activeArts = isPitBossFight && currentPitPhase === 1 && !opts.skipPitLock ? clearFightArtifactStatuses(arts) : arts;
    if (isPitBossFight && !opts.skipPitLock) {
      const lock = lockOnePitBossArtifact(activeArts);
      activeArts = lock.arts;
      if (lock.lockedName) {
        addTrigger(`Pit Boss: ${lock.lockedName}`, '#ef4444');
        logEvent(`Pit Boss locked ${lock.lockedName}`, undefined, '#ef4444');
      }
      setArtifacts(activeArts);
    }
    const deckSize = opts.deckSize ?? totalDeckSize;
    const dk = shuffle(deckSize >= 104
      ? [...createFullDeck(), ...createFullDeck()]
      : createFullDeck());

    // Queen saves for this table
    const qmEff = getArtifactEffect('queens_mercy', activeArts);
    const initialQSaves = qmEff?.queenSaveAutomatic ? (qmEff.queenSaves ?? 1) : 0;

    // Third choice uses
    const tcStacks = artifactStacks('third_choice', activeArts);
    const initialTCUses = tcStacks === 0 ? 0 : tcStacks === 1 ? 1 : tcStacks === 2 ? 2 : 999;

    // Second wind redraws
    const swEff = getArtifactEffect('second_wind', activeArts);
    const initialRedraws = swEff?.redraws ?? 0;
    const hasRedrawAfterPick = !!(swEff?.redrawAfterPick);

    // Tithe check (stack 3: pulls free but stand penalty applies)
    const titheEff = getArtifactEffect('the_tithe', activeArts);
    const isTitheFree = titheEff?.titheCost === 0;

    // Table-scoped negative-card artifacts
    const cdStacks = artifactStacks('contrarian_deck', activeArts);
    const initialContrarianUses = cdStacks === 0 ? 0 : Math.min(cdStacks, 3);
    const cpStacks = artifactStacks('crooked_pawn', activeArts);
    const allNumberRanks: Card['rank'][] = ['2','3','4','5','6','7','8','9','10'];
    const oddRanks: Card['rank'][] = ['3','5','7','9'];
    const crookedPool = cpStacks >= 2 ? oddRanks : allNumberRanks;
    const initialCrookedRank = cpStacks > 0 ? crookedPool[Math.floor(Math.random() * crookedPool.length)] : null;
    const reStacks = artifactStacks('royal_echo', activeArts);

    const dealerBuild = opts.keepDealer
      ? { rank: dealerRank, arts: dealerArtifacts, name: dealerName }
      : makeDealerForTable(ai, ti, boss);

    setTarget(targetOverride ?? (isPitBossFight ? (currentPitPhase === 1 ? 30 : 50) : tData.target));
    setHouseRule(tData.rule ?? null);
    setDealerRank(dealerBuild.rank);
    setDealerArtifacts(dealerBuild.arts);
    setDealerName(dealerBuild.name);
    setDealerDecisionLog([]);
    // Dealer queue starts as choice pairs. The dealer does not secretly start with unrelated cards.
    // Keep Turn 1 visible and Turn 2 hidden at the start. More pairs are added as the player risks more Pulls.
    const previewCards = dk.slice(0, 4);
    setDealerPreviewPool(previewCards);
    setDealerQueueCursor(0);
    setDeck(dk.slice(4));
    setPlayerHand([]);
    setDealerHand([]);
    setDealerHidden(true);
    setPullOptions(null);
    setResult(null);
    setMsg('');
    setTableLog([]);
    setTableEarned(0);
    setKingPending(null);
    setJackActive(false);
    setJackPeeks([]);
    setPauperFreePull(false);
    setIsPauperPull(false);
    setFaceTargetUsed(false);
    setQueenSavesLeft(initialQSaves);
    setTcUsesLeft(initialTCUses);
    setRedraws(initialRedraws);
    setRedrawAfterPick(hasRedrawAfterPick);
    setTitheFree(isTitheFree);
    setContrarianUsesLeft(initialContrarianUses);
    setCrookedPawnRank(initialCrookedRank);
    setOddPilgrimageClaimed(false);
    setRoyalEchoUsesLeft(reStacks === 0 ? 0 : Math.min(reStacks, 3));
    setJackEchoPulls(0);
    setQueenEchoHalves(0);
    setPullsThisTable(0);
    setBagSavedThisTable(false);
    setPitBossPhase(currentPitPhase);
    if (isPitBossFight) {
      const numberBan = opts.pitNumberBan ?? pitBannedRank ?? choosePitBossPhaseBan();
      const faceBan = currentPitPhase >= 2 ? (opts.pitFaceBan ?? pitBannedFaceRank ?? choosePitBossFaceBan()) : null;
      setPitBannedRank(numberBan);
      setPitBannedFaceRank(faceBan);
      if (numberBan || faceBan) addTrigger(`Pit Boss bans ${[numberBan, faceBan].filter(Boolean).map(r => `${r}s`).join(' + ')} for this phase`, '#ef4444');
    } else {
      setPitBannedRank(null);
      setPitBannedFaceRank(null);
    }
    if (initialCrookedRank) addTrigger(`Crooked Pawn: ${initialCrookedRank}s are negative`, '#fbbf24', 'crooked_pawn');
    setActIdx(ai);
    setTableIdx(ti);
    setIsBoss(boss);
    setGoldenRaidActive(false);
    setGoldenGate(1);
    setGoldenOpIndex(0);
    setShowdownPile([]);
    setDealerFrozen(false);
    setRedactPending(false);
    setHorseshoeActive(false);
    setIsReshuffling(true);
    setTimeout(() => setIsReshuffling(false), 1500);
    setBlindFoldActive(false);
    setQueenHalvedPull(false);
    setNextPullFaceCard(false);
    // Set aside dealer preview pool from top of deck (after beginTable deck setup)
    // We call this inline since deck state was just set
    setPhase('table');
  }

  function beginGoldenRaid(startMoney = money) {
    dealTimers.current.forEach(clearTimeout);
    dealTimers.current = [];
    const dk = shuffle([...createFullDeck(), ...createFullDeck(), ...createFullDeck()]);
    const ledger = createLedgerBudget(Math.max(48, houseLedger.total + 24 + getHeatIntensity(actIdx) * 8), 'raidBoss', {
      freeGrants: [{ type: 'tier4Artifact', count: 1, reason: 'Golden Dealer core' }],
    });
    const raidArts = generateDealerArtifactsFromBudget(ledger);

    setMoney(startMoney);
    setGoldenChips(0);
    setGoldenRaidActive(true);
    setGoldenGate(1);
    setGoldenOpIndex(0);
    setGoldenRaidDefeated(false);
    setGameMode('card');
    setIsBoss(true);
    setHouseRule('golden_dealer');
    setTarget(50);
    setDealerRank('raidBoss');
    setDealerArtifacts(raidArts);
    setDealerName(generateDealerNameFromArtifacts(raidArts, 'raidBoss'));
    setDealerDecisionLog([]);
    setDealerPreviewPool(dk.slice(0, 4));
    setDealerQueueCursor(0);
    setDeck(dk.slice(4));
    setPlayerHand([]);
    setDealerHand([]);
    setDealerHidden(true);
    setPullOptions(null);
    setResult(null);
    setMsg('');
    setTableLog([{ label: 'Three Golden Chips bought. The shop door shuts.', color: '#f59e0b' }]);
    setTableEarned(0);
    setKingPending(null);
    setAcePending(null);
    setJackActive(false);
    setJackPeeks([]);
    setPauperFreePull(false);
    setIsPauperPull(false);
    setFaceTargetUsed(false);
    setQueenSavesLeft(0);
    setTcUsesLeft(0);
    setRedraws(0);
    setRedrawAfterPick(false);
    setTitheFree(false);
    setContrarianUsesLeft(0);
    setCrookedPawnRank(null);
    setOddPilgrimageClaimed(false);
    setRoyalEchoUsesLeft(0);
    setJackEchoPulls(0);
    setQueenEchoHalves(0);
    setPullsThisTable(0);
    setBagSavedThisTable(false);
    setShowdownPile([]);
    setDealerFrozen(false);
    setRedactPending(false);
    setHorseshoeActive(false);
    setBlindFoldActive(false);
    setQueenHalvedPull(false);
    setNextPullFaceCard(false);
    unlockAchievement('Golden Invitation', 'collected 3 Golden Chips');
    addTrigger('The Golden Dealer calls your marker.', '#f59e0b');
    setPhase('table');
  }

  // ─── doPull ─────────────────────────────────────────────────────
  function doPull() {
    if (phase !== 'table' || pullOptions || kingPending || acePending) return;

    if (isGoldenDealerRule() && pullsThisTable >= 1) {
      if (money >= 2) {
        setMoney(m => m - 2);
        logEvent('Golden Dealer draw toll: −$2', -2, '#f59e0b');
        addTrigger('Golden draw toll: −$2', '#f59e0b');
      } else if (lives > 1) {
        setLives(l => l - 1);
        setHeartBreakIdx(lives - 1);
        setTimeout(() => setHeartBreakIdx(-1), 2000);
        logEvent('Golden Dealer took a heart for the draw', undefined, '#ef4444');
        addTrigger('No money: paid 1 heart for the draw', '#ef4444');
      } else {
        doToast('Golden Dealer demands $2 or a spare heart to draw again.');
        return;
      }
    }

    let count = 2;

    // Third Choice
    if (tcUsesLeft > 0) {
      count = 3;
      setTcUsesLeft(u => u - 1);
    }

    // Jack bonus. Royal Echo can keep Jack's +1 option alive for extra pulls.
    if (jackActive) {
      count = Math.max(count, 3);
      if (jackEchoPulls > 0) setJackEchoPulls(n => Math.max(0, n - 1));
      else setJackActive(false);
    }

    // Pauper's Luck
    if (money === 0) {
      const plEff = getArtifactEffect('paupers_luck', artifacts);
      if (plEff?.pauperPullBonus) count += plEff.pauperPullBonus;
    }

    // Lucky Horseshoe trinket
    if (horseshoeActive) {
      count = Math.max(count, 5);
      setHorseshoeActive(false);
      addTrigger('⋒ Lucky Horseshoe: 5 options!', '#22c55e');
    }

    // Tithe cost
    if (!titheFree) {
      const titheEff = getArtifactEffect('the_tithe', artifacts);
      const cost = titheEff?.titheCost ?? 0;
      if (cost > 0) {
        if (money >= cost) {
          setMoney(m => m - cost);
          logEvent(`The Tithe: −$${cost}`, -cost, '#dc2626');
          addTrigger(`The Tithe: −$${cost}`, '#dc2626', 'the_tithe');
        } else {
          doToast('The Tithe: not enough $, pulling for free.');
        }
      }
    }

    // Pauper free pull (unchosen cards return to deck)
    const plEff = getArtifactEffect('paupers_luck', artifacts);
    const isFree = money === 0 && !!(plEff?.pauperFreePull) && !pauperFreePull;
    if (isFree) { setPauperFreePull(true); setIsPauperPull(true); }

    let opts = deck.slice(0, count);
    let newDeck = deck.slice(count);

    // Royal Summons: guarantee a face card in options
    if (nextPullFaceCard) {
      setNextPullFaceCard(false);
      const hasFace = opts.some(c => ['J','Q','K'].includes(c.rank));
      if (!hasFace) {
        const faceIdx = newDeck.findIndex(c => ['J','Q','K'].includes(c.rank));
        if (faceIdx >= 0) {
          const faceCard = newDeck[faceIdx];
          // Swap: last option goes back where the face card was, face card enters options
          newDeck = [...newDeck.slice(0, faceIdx), opts[opts.length - 1], ...newDeck.slice(faceIdx + 1)];
          opts = [...opts.slice(0, -1), faceCard];
        }
      }
      addTrigger('♛ Royal Summons: face card guaranteed', '#a855f7');
    }

    // Pit Boss bans persist for the phase. In Phase II a number + face can be banned,
    // but a Pull must never contain only banned choices.
    if (houseRule === 'pit_boss' && opts.length > 0 && opts.every(c => isPitCardBanned(c))) {
      const replacementIdx = newDeck.findIndex(c => !isPitCardBanned(c));
      if (replacementIdx >= 0) {
        const replacement = newDeck[replacementIdx];
        newDeck = [...newDeck.slice(0, replacementIdx), ...newDeck.slice(replacementIdx + 1), opts[0]];
        opts = [replacement, ...opts.slice(1)];
      }
    }

    // Keep the dealer queue one visible turn ahead of the player.
    // Pull 1 shows Dealer Turn 1 plus Turn 2 mystery; Pull 2 reveals Turn 2 and adds Turn 3 mystery.
    const requiredDealerPairs = Math.max(2, Math.max(dealerQueueCursor, pullsThisTable) + 2);
    const requiredDealerCards = requiredDealerPairs * 2;
    const missingDealerCards = Math.max(0, requiredDealerCards - dealerPreviewPool.length);
    if (missingDealerCards > 0) {
      const extraDealerCards = newDeck.slice(0, missingDealerCards);
      if (extraDealerCards.length > 0) {
        setDealerPreviewPool(prev => [...prev, ...extraDealerCards]);
        newDeck = newDeck.slice(extraDealerCards.length);
      }
    }

    setDeck(newDeck);
    setPullOptions(opts);
    setPullsThisTable(n => n + 1);
    setJackPeeks([]); // clear old peek
  }

  // ─── doRedraw ────────────────────────────────────────────────────
  function doRedraw() {
    if (redraws <= 0 || !pullOptions) return;
    const count = pullOptions.length;
    const freshOpts = deck.slice(0, count);
    setDeck(deck.slice(count));
    setPullOptions(freshOpts);
    setRedraws(r => r - 1);
    addTrigger('Second Wind: options redrawn', '#67e8f9', 'second_wind');
    logEvent('Second Wind redraw');
  }

  // ─── pickCard ────────────────────────────────────────────────────
  function pickCard(card: Card) {
    if (!pullOptions) return;
    if (isPitCardBanned(card)) {
      doToast(`Pit Boss banned ${card.rank}s this phase.`);
      addTrigger(`${card.rank}s are crossed out`, '#ef4444');
      return;
    }

    // Ace: show value choice modal
    if (card.rank === 'A') {
      setAcePending(card);
      setPullOptions(null);
      return;
    }

    // King: show direction modal
    if (card.rank === 'K') {
      setKingPending(card);
      setPullOptions(null);
      return;
    }

    let moneyDelta = 0;
    let newTgt = target;

    // Jack effects
    if (card.rank === 'J') {
      setJackActive(true);
      const jtEff = getArtifactEffect('jacks_tell', artifacts);
      if (jtEff?.jackPeeks) {
        const peeks = deck.slice(0, jtEff.jackPeeks);
        setJackPeeks(peeks);
        addTrigger(`⦿ Jack's Tell: peeked ${peeks.length} card${peeks.length > 1 ? 's' : ''}`, '#94a3b8', 'jacks_tell');
        logEvent(`Jack's Tell: peeked ${peeks.length} card${peeks.length > 1 ? 's' : ''}`);
      }
      if (spendRoyalEcho('Jack lasts one extra Pull')) setJackEchoPulls(n => n + 1);
    }

    // Queen: activate Stack 1 save
    if (card.rank === 'Q') {
      const qmEff = getArtifactEffect('queens_mercy', artifacts);
      if (qmEff && !qmEff.queenSaveAutomatic && queenSavesLeft === 0) {
        setQueenSavesLeft(qmEff.queenSaves ?? 1);
        addTrigger("♛ Queen's Mercy ready!", '#a855f7', 'queens_mercy');
        logEvent("♛ Queen's Mercy activated");
      }
    }

    // Royal Purse
    const rpEff = getArtifactEffect('royal_purse', artifacts);
    if (rpEff?.faceCardMoney && ['J','Q','K'].includes(card.rank)) {
      moneyDelta += rpEff.faceCardMoney;
      logEvent(`Royal Purse: +$${rpEff.faceCardMoney}`, rpEff.faceCardMoney, '#4ade80');
      addTrigger(`Royal Purse: +$${rpEff.faceCardMoney}`, '#4ade80', 'royal_purse');
      // Stack 3: first face card reduces target
      if (rpEff.faceCardReducesTarget && !faceTargetUsed) {
        newTgt = target - 1;
        setTarget(newTgt);
        setFaceTargetUsed(true);
        setTargetAnim(true); setTimeout(() => setTargetAnim(false), 600);
        addTrigger(`Target → ${newTgt}`, '#4ade80');
      }
    }

    // Pauper free pull: return unchosen to deck
    if (isPauperPull) {
      const unchosen = pullOptions.filter(c => c.id !== card.id);
      setDeck(d => [...unchosen, ...d]);
      setIsPauperPull(false);
    }

    setPullOptions(null);

    const isNumberCard = !['J','Q','K','A'].includes(card.rank);
    const contrarianApplies = isNumberCard && isOddNumberCard(card) && contrarianUsesLeft > 0;
    const crookedApplies = isNumberCard && !!crookedPawnRank && card.rank === crookedPawnRank;

    // Queen's built-in effect: halve the NEXT number card played.
    let effectiveCard = card;
    const queenHalvesThisCard = isNumberCard && (queenHalvedPull || queenEchoHalves > 0);
    if (queenHalvesThisCard) {
      effectiveCard = { ...effectiveCard, value: Math.floor(Math.abs(effectiveCard.value) / 2) };
      addTrigger(`♛ Queen's effect: +${effectiveCard.value} (halved)`, '#a855f7');
      if (queenHalvedPull) setQueenHalvedPull(false);
      else setQueenEchoHalves(n => Math.max(0, n - 1));
    } else if (queenHalvedPull && isNumberCard) {
      setQueenHalvedPull(false);
    }

    // Negative-card effects are written onto the card value so handValue stays simple.
    if (contrarianApplies || crookedApplies) {
      effectiveCard = { ...effectiveCard, value: -Math.abs(effectiveCard.value) };
      if (contrarianApplies) {
        setContrarianUsesLeft(n => Math.max(0, n - 1));
        const oddMoney = getArtifactEffect('contrarian_deck', artifacts)?.contrarianOddMoney ?? 0;
        if (oddMoney > 0) {
          moneyDelta += oddMoney;
          addTrigger(`Contrarian Deck: +$${oddMoney}`, '#f59e0b', 'contrarian_deck');
          logEvent(`Contrarian Deck: +$${oddMoney}`, oddMoney, '#f59e0b');
        }
      }
      if (crookedApplies) {
        const pawnMoney = getArtifactEffect('crooked_pawn', artifacts)?.crookedNegativeMoney ?? 0;
        addTrigger(`Crooked Pawn: ${card.rank} subtracts`, '#fbbf24', 'crooked_pawn');
        if (pawnMoney > 0) {
          moneyDelta += pawnMoney;
          logEvent(`Crooked Pawn: +$${pawnMoney}`, pawnMoney, '#fbbf24');
        }
      }
    }

    if (isGoldenDealerRule()) {
      const before = handValue(playerHand, newTgt, contrarianStacks, aceLicStacks);
      const op = GOLDEN_OPS[goldenOpIndex % GOLDEN_OPS.length];
      effectiveCard = applyGoldenOperatorToCard(effectiveCard, before);
      advanceGoldenOperator();
      addTrigger(`Golden Clock ${op}: total ${before} → ${before + effectiveCard.value}`, '#f59e0b');
      logEvent(`Golden Clock ${op}: ${card.rank}${card.suit}`, undefined, '#f59e0b');
    }

    const newHand = [...playerHand, effectiveCard];

    // Odd Pilgrimage: once per table, reward dangerous odd-rank hands.
    const opStacks = artifactStacks('odd_pilgrimage', artifacts);
    if (opStacks > 0 && !oddPilgrimageClaimed) {
      const oddRanksInHand = new Set(
        newHand
          .filter(c => isOddNumberCard(c))
          .map(c => c.rank),
      );
      const oddCount = oddRanksInHand.size;
      const needsForHeal = opStacks >= 3 ? 3 : 4;
      const hasMoneyReward = oddCount >= 3;
      const hasHealReward = opStacks >= 2 && oddCount >= needsForHeal;
      if (hasMoneyReward || hasHealReward) {
        setOddPilgrimageClaimed(true);
        const opMoney = getArtifactEffect('odd_pilgrimage', artifacts)?.oddPilgrimageMoney ?? 2;
        if (hasMoneyReward) {
          moneyDelta += opMoney;
          logEvent(`Odd Pilgrimage: +$${opMoney}`, opMoney, '#f97316');
        }
        if (hasHealReward) {
          setLives(l => Math.min(2, l + 1));
          logEvent('Odd Pilgrimage: +1 Life', undefined, '#f97316');
        }
        addTrigger(hasHealReward ? 'Odd Pilgrimage: life restored' : `Odd Pilgrimage: +$${opMoney}`, '#f97316', 'odd_pilgrimage');
        if (hasHealReward) unlockAchievement('Odd Saint', 'restored life with Odd Pilgrimage');
      }
    }

    const sameRankCount = newHand.filter(c => c.rank === card.rank).length;
    if (sameRankCount >= 4) unlockAchievement('Four of a Kind', `played ${card.rank} four times in one table`);

    if (money + moneyDelta >= 100) unlockAchievement('High Roller', 'reached $100');

    if (moneyDelta !== 0) setMoney(m => m + moneyDelta);
    const curMoney = money + moneyDelta;
    const newVal = handValue(newHand, newTgt, contrarianStacks, aceLicStacks);

    // ── Bust check ─────────────────────────────────────────────
    if (newVal > newTgt) {
      // Pauper no-bust (Stack 3)
      const plEff = getArtifactEffect('paupers_luck', artifacts);
      if (plEff?.pauperNoBust && money === 0) {
        setPlayerHand(newHand);
        addTrigger("Pauper's Luck: bust clamped!", '#a78bfa', 'paupers_luck');
        logEvent("Pauper's Luck: bust prevented");
        const snap = buildSnap(newHand, target, artifacts, actIdx, tableIdx, isBoss, lives, curMoney, scUsedCount);
        dealTimers.current.push(setTimeout(() => startDealerTurn(snap), 1400));
        return;
      }

      // Queen's Mercy save
      if (queenSavesLeft > 0) {
        setQueenSavesLeft(q => q - 1);
        logEvent("♛ Queen's Mercy blocked the bust!");
        addTrigger("♛ Queen's Mercy!", '#a855f7', 'queens_mercy');
        const qmEff = getArtifactEffect('queens_mercy', artifacts);
        if (qmEff?.queenSaveReturnsCard) {
          // Return busting card, give fresh options
          const retDeck = [card, ...deck];
          const freshCount = Math.max(2, tcUsesLeft > 0 ? 3 : 2);
          setDeck(retDeck.slice(freshCount));
          setPullOptions(retDeck.slice(0, freshCount));
          // Don't add card to hand, don't auto-stand
        } else {
          // Auto-stand at current value
          const snap = buildSnap(playerHand, newTgt, artifacts, actIdx, tableIdx, isBoss, lives, curMoney, scUsedCount);
          dealTimers.current.push(setTimeout(() => startDealerTurn(snap), 1600));
        }
        return;
      }

      // Normal bust
      setPlayerHand(newHand);
      const br = calcBustResult(lives, curMoney, artifacts, scUsedCount);
      applyBustResult(br, newVal, newTgt);
      return;
    }

    // ── No bust ────────────────────────────────────────────────
    setPlayerHand(newHand);
    // Animate the player total
    const curPv = handValue(playerHand, newTgt, contrarianStacks, aceLicStacks);
    if (newVal === newTgt) { setPvAnim('perfect'); }
    else if (newVal > curPv) { setPvAnim('up'); }
    else { setPvAnim('down'); }
    setTimeout(() => setPvAnim(null), 750);

    // Queen's built-in effect: halve the next number card you pick.
    // Royal Echo adds one extra halved number card.
    if (card.rank === 'Q') {
      setQueenHalvedPull(true);
      addTrigger('♛ Queen: next card halved', '#a855f7');
      if (spendRoyalEcho('Queen halves one extra card')) setQueenEchoHalves(n => n + 1);
    }

    // Showdown: dealer draws one face-down card alongside you
    if (showdownEnabled && !dealerFrozen && deck.length > 0) {
      const sdCard = deck[0];
      setShowdownPile(prev => [...prev, sdCard]);
      setDeck(d => d.slice(1));
    }
    if (newVal === newTgt) {
      doToast(houseRule === 'exact_only' ? `✦ Exactly ${newTgt}! STAND to win!` : '✦ Perfect Clear possible!');
    }
  }

  function randomLegalTrinket(): TrinketId | null {
    const legal = TRINKET_IDS.filter(tid => {
      const def = TRINKET_DEFS[tid];
      if (def.showdownOnly && !showdownEnabled) return false;
      if (def.alphabetOnly && gameMode !== 'alphabet') return false;
      return true;
    });
    if (!legal.length) return null;
    return legal[Math.floor(Math.random() * legal.length)] as TrinketId;
  }

  function addRandomTrinketFrom(source: string) {
    const tid = randomLegalTrinket();
    if (!tid) return;
    setTrinkets(prev => {
      if (prev.length >= maxTrinkets) return prev;
      return [...prev, tid];
    });
    addTrigger(`${source}: found ${TRINKET_DEFS[tid]?.name ?? tid}`, '#f59e0b');
    logEvent(`${source}: +${TRINKET_DEFS[tid]?.name ?? tid}`, undefined, '#f59e0b');
  }

  function triggerRandomPocketEcho(source: string, misfireChance = 0) {
    const misfires = misfireChance > 0 && Math.random() < misfireChance;
    if (misfires) {
      const c = deck[0];
      if (c) {
        setDeck(d => d.slice(1));
        setDealerPreviewPool(p => [c, ...p]);
        addTrigger(`${source}: mirror fed the dealer`, '#c084fc');
        logEvent(`${source}: dealer preview gained ${c.rank}${c.suit}`, undefined, '#c084fc');
      }
      return;
    }

    const effects = ['money', 'redraw', 'face', 'horse', 'queen'] as const;
    const pick = effects[Math.floor(Math.random() * effects.length)];
    switch (pick) {
      case 'money':
        setMoney(m => m + 2);
        addTrigger(`${source}: echo +$2`, '#f59e0b');
        logEvent(`${source}: +$2`, 2, '#f59e0b');
        break;
      case 'redraw':
        setRedraws(r => r + 1);
        addTrigger(`${source}: echo +1 redraw`, '#67e8f9');
        break;
      case 'face':
        setNextPullFaceCard(true);
        addTrigger(`${source}: echo face-card pull`, '#a855f7');
        break;
      case 'horse':
        setHorseshoeActive(true);
        addTrigger(`${source}: echo 5-option pull`, '#22c55e');
        break;
      case 'queen':
        setQueenHalvedPull(true);
        addTrigger(`${source}: echo Queen's Grace`, '#a855f7');
        break;
    }
  }

  function resolveTrinketAftershocks(id: TrinketId) {
    const bagEff = getArtifactEffect('bag_of_holding', artifacts);
    if (!bagSavedThisTable && bagEff?.trinketSaveChance && Math.random() < bagEff.trinketSaveChance) {
      setBagSavedThisTable(true);
      setTrinkets(prev => prev.length < maxTrinkets ? [...prev, id] : prev);
      addTrigger('Bag of Holding: trinket saved', '#38bdf8', 'bag_of_holding');
    }

    const junkEff = getArtifactEffect('junk_drawer', artifacts);
    if (junkEff?.trinketGainChance && Math.random() < junkEff.trinketGainChance) {
      addRandomTrinketFrom('Junk Drawer');
    }
    if (junkEff?.trinketEchoChance && Math.random() < junkEff.trinketEchoChance) {
      triggerRandomPocketEcho('Junk Drawer');
    }

    const mirrorEff = getArtifactEffect('mirror_pocket', artifacts);
    if (mirrorEff?.trinketEchoChance && Math.random() < mirrorEff.trinketEchoChance) {
      triggerRandomPocketEcho('Mirror Pocket', mirrorEff.trinketEchoMisfireChance ?? 0);
    }
  }

  // ─── useTrinket ──────────────────────────────────────────────────
  function useTrinket(id: TrinketId) {
    if (phase !== 'table' || pullOptions || kingPending) return;
    setTrinkets(prev => { const n = [...prev]; const i = n.indexOf(id); if (i >= 0) n.splice(i, 1); return n; });

    switch (id) {
      case 'gold_coin':
        setMoney(m => m + 5);
        addTrigger('◉ Gold Coin: +$5', '#f59e0b');
        logEvent('Gold Coin: +$5', 5, '#f59e0b');
        break;

      case 'piggy_bank': {
        if (piggyBank) { doToast('Piggy Bank: already active.'); setTrinkets(prev => [...prev, id]); return; }
        if (money <= 1) { doToast('Piggy Bank: needs at least $2 to start.'); setTrinkets(prev => [...prev, id]); return; }
        const deposit = Math.floor(money / 2);
        setMoney(m => m - deposit);
        setPiggyBank({ deposit, value: deposit, step: 0, cracked: false });
        addTrigger(`◍ Piggy Bank started with $${deposit}`, '#fbbf24');
        logEvent(`Piggy Bank deposit`, -deposit, '#fbbf24');
        break;
      }

      case 'lucky_horseshoe':
        setHorseshoeActive(true);
        addTrigger('⋒ Lucky Horseshoe: next pull shows 5', '#22c55e');
        break;

      case 'iron_blindfold':
        setBlindFoldActive(true);
        addTrigger('◈ Iron Blindfold: Hidden Hand ignored', '#94a3b8');
        break;

      case 'ace_of_hearts': {
        const ace: Card = { rank: 'A', suit: '♥', value: 11, red: true, id: `ace_trinket_${Date.now()}` };
        setPlayerHand(h => [...h, ace]);
        addTrigger('♥ Ace of Hearts added to hand', '#f472b6');
        break;
      }

      case 'the_ledger': {
        if (pv >= target) { doToast('The Ledger: already at target!'); setTrinkets(prev => [...prev, id]); return; }
        const needed = target - pv;
        if (needed < 1) break;
        const val = Math.min(needed, 10);
        // Create a special "LEDGER" card — display as a blank with exact value
        const ledger: Card = {
          rank: val <= 9 ? String(val) as any : '10',
          suit: '♦', value: needed, red: true,
          id: `ledger_${Date.now()}`,
        };
        setPlayerHand(h => [...h, ledger]);
        addTrigger(`✦ The Ledger: set to ${target}!`, '#c9a84c');
        doToast(`✦ The Ledger — stand to win!`);
        break;
      }

      case 'mirror_shard': {
        const visCard = dealerHand[0];
        if (!visCard) { doToast('Mirror Shard: nothing to copy.'); setTrinkets(prev => [...prev, id]); return; }
        const copy: Card = { ...visCard, id: `mirror_${Date.now()}` };
        setPlayerHand(h => [...h, copy]);
        addTrigger(`◇ Mirror Shard: copied ${visCard.rank}${visCard.suit}`, '#67e8f9');
        break;
      }

      case 'the_eraser':
        if (!playerHand.length) { doToast('The Eraser: no cards to remove.'); setTrinkets(prev => [...prev, id]); return; }
        setPlayerHand(h => h.slice(0, -1));
        addTrigger('✕ The Eraser: last card removed', '#f87171');
        break;

      case 'second_breath':
        setRedraws(r => r + 2);
        addTrigger('↺ Second Breath: +2 redraws', '#a78bfa');
        break;

      // Showdown-exclusive
      case 'the_cut':
        if (!showdownPile.length) { doToast('The Cut: no dealer pile yet.'); setTrinkets(prev => [...prev, id]); return; }
        setShowdownPile(p => p.slice(0, -1));
        addTrigger('✂ The Cut: removed dealer card', '#ef4444');
        break;

      case 'deep_freeze':
        setDealerFrozen(true);
        addTrigger('❄ Deep Freeze: dealer locked', '#93c5fd');
        break;

      case 'redact':
        if (gameMode === 'alphabet') {
          if (!ltDealerPreviewPool.length) { doToast('Redact: no preview cards.'); setTrinkets(prev => [...prev, id]); return; }
        } else {
          if (!dealerPreviewPool.length) { doToast('Redact: no preview cards.'); setTrinkets(prev => [...prev, id]); return; }
        }
        setRedactPending(true);
        doToast('Redact: click a preview card to remove it.');
        break;

      case 'royal_summons':
        setNextPullFaceCard(true);
        addTrigger('♛ Royal Summons ready — next pull has a face card', '#a855f7');
        break;

      // Alphabet-exclusive
      case 'letter_press': {
        // Swap any two adjacent letters — cycle through best swap
        if (playerLetters.length < 2) { doToast('Letter Press: need 2+ letters.'); setTrinkets(prev => [...prev, id]); return; }
        // Swap last two letters (most recently drawn — usually the relevant pair)
        const swapped = [...playerLetters];
        const len = swapped.length;
        [swapped[len-2], swapped[len-1]] = [swapped[len-1], swapped[len-2]];
        setPlayerLetters(swapped);
        addTrigger('⇄ Letter Press: last two letters swapped', '#67e8f9');
        break;
      }

      case 'overtime': {
        // Only usable when over target and in alphabet mode
        const ltv = letterHandValue(playerLetters);
        if (gameMode !== 'alphabet') { doToast('Overtime: Alphabet Mode only.'); setTrinkets(prev => [...prev, id]); return; }
        if (ltv <= target) { doToast('Overtime: not over target yet.'); setTrinkets(prev => [...prev, id]); return; }
        if (letterDeck.length === 0) { doToast('Overtime: deck empty.'); setTrinkets(prev => [...prev, id]); return; }
        // Draw one more letter
        const pool = [...letterDeck];
        let drawn: LetterTile | null = null;
        let di = 0;
        while (di < pool.length) {
          const t = pool[di++];
          if (bannedLetter && t.letter === bannedLetter) continue;
          drawn = t; break;
        }
        if (drawn) {
          setLetterDeck(pool.slice(di));
          const newLetters = [...playerLetters, drawn];
          setPlayerLetters(newLetters);
          addTrigger(`⊕ Overtime: drew ${drawn.letter} (${drawn.value})`, '#f59e0b');
          const result = findWordInSequence(newLetters.map(t => t.letter), WORD_SET, minWordLength);
          if (result?.word) {
            doToast(`Overtime saves the bust: "${result.word}"!`);
          }
        }
        break;
      }
    }

    resolveTrinketAftershocks(id);
  }

  // ─── applyKing ───────────────────────────────────────────────────

  // ─── chooseAceValue ──────────────────────────────────────────────
  function chooseAceValue(value: number) {
    if (!acePending) return;
    let theAce: Card = { ...acePending, chosenValue: value, value };
    setAcePending(null);

    let moneyDelta = 0;

    // Royal Purse? (Ace is not a face card J/Q/K, so no faceCardMoney)
    // Contrarian? (Ace is not an odd number card)

    if (isGoldenDealerRule()) {
      const before = handValue(playerHand, target, contrarianStacks, aceLicStacks);
      const op = GOLDEN_OPS[goldenOpIndex % GOLDEN_OPS.length];
      theAce = applyGoldenOperatorToCard(theAce, before);
      advanceGoldenOperator();
      addTrigger(`Golden Clock ${op}: total ${before} → ${before + theAce.value}`, '#f59e0b');
      logEvent(`Golden Clock ${op}: Ace`, undefined, '#f59e0b');
    }

    const newHand = [...playerHand, theAce];
    const newPv   = handValue(newHand, target, contrarianStacks, aceLicStacks);

    // Pauper free pull
    if (isPauperPull) {
      const unchosen = (pullOptions ?? []).filter(c => c.id !== acePending!.id);
      setDeck(d => [...unchosen, ...d]);
      setIsPauperPull(false);
    }

    if (newPv > target) {
      // Pauper no-bust
      const plEff = getArtifactEffect('paupers_luck', artifacts);
      if (plEff?.pauperNoBust && money === 0) {
        setPlayerHand(newHand);
        addTrigger("Pauper's Luck: bust clamped!", '#a78bfa', 'paupers_luck');
        const snap = buildSnap(newHand, target, artifacts, actIdx, tableIdx, isBoss, lives, money, scUsedCount);
        dealTimers.current.push(setTimeout(() => startDealerTurn(snap), 1400));
        return;
      }
      // Queen save
      if (queenSavesLeft > 0) {
        setQueenSavesLeft(q => q - 1);
        addTrigger("♛ Queen's Mercy!", '#a855f7', 'queens_mercy');
        logEvent("♛ Queen's Mercy blocked the bust!");
        const qmEff = getArtifactEffect('queens_mercy', artifacts);
        if (qmEff?.queenSaveReturnsCard) {
          const retDeck = [theAce, ...deck];
          setDeck(retDeck.slice(2));
          setPullOptions(retDeck.slice(0, 2));
        } else {
          const snap = buildSnap(playerHand, target, artifacts, actIdx, tableIdx, isBoss, lives, money, scUsedCount);
          dealTimers.current.push(setTimeout(() => startDealerTurn(snap), 1600));
        }
        return;
      }
      // Normal bust
      setPlayerHand(newHand);
      const br = calcBustResult(lives, money, artifacts, scUsedCount);
      applyBustResult(br, newPv, target);
      return;
    }

    // No bust
    setPlayerHand(newHand);

    // Showdown draw
    if (showdownEnabled && !dealerFrozen && deck.length > 0) {
      setShowdownPile(prev => [...prev, deck[0]]);
      setDeck(d => d.slice(1));
    }

    if (newPv === target) { setPvAnim('perfect'); doToast(`✦ Perfect with Ace = ${value}!`); }
    else if (newPv > pv) setPvAnim('up');
    else setPvAnim('down');
    setTimeout(() => setPvAnim(null), 750);
  }

  function applyKing(dir: 1 | -1) {
    let theKing  = kingPending!;                         // capture before clearing
    const baseRange = getArtifactEffect('crown_law', artifacts)?.kingRange ?? 1;
    const echoed = spendRoyalEcho('King shifts twice');
    const range = echoed ? baseRange * 2 : baseRange;
    const newTgt   = target + dir * range;

    setTarget(newTgt);
    setTargetAnim(true); setTimeout(() => setTargetAnim(false), 600);
    setKingPending(null);

    const rpEff = getArtifactEffect('royal_purse', artifacts);
    let m = money;
    if (rpEff?.faceCardMoney) {
      m += rpEff.faceCardMoney;
      setMoney(m);
      logEvent(`Royal Purse: +$${rpEff.faceCardMoney}`, rpEff.faceCardMoney, '#4ade80');
      addTrigger(`Royal Purse: +$${rpEff.faceCardMoney}`, '#4ade80', 'royal_purse');
    }
    addTrigger(`♔ Target → ${newTgt}`, '#eab308', 'crown_law');
    logEvent(`♔ King: target → ${newTgt}`);

    if (isGoldenDealerRule()) {
      const before = handValue(playerHand, newTgt, contrarianStacks, aceLicStacks);
      const op = GOLDEN_OPS[goldenOpIndex % GOLDEN_OPS.length];
      theKing = applyGoldenOperatorToCard(theKing, before);
      advanceGoldenOperator();
      addTrigger(`Golden Clock ${op}: total ${before} → ${before + theKing.value}`, '#f59e0b');
      logEvent(`Golden Clock ${op}: King`, undefined, '#f59e0b');
    }

    // Compute hand WITH the king and check for bust
    const newHand = [...playerHand, theKing];
    const newPv   = handValue(newHand, newTgt, contrarianStacks, aceLicStacks);

    // ── Bust after king? ──────────────────────────────────────────
    if (newPv > newTgt) {
      setPlayerHand(newHand);

      // Queen save?
      if (queenSavesLeft > 0) {
        setQueenSavesLeft(q => q - 1);
        addTrigger("♛ Queen's Mercy!", '#a855f7', 'queens_mercy');
        logEvent("♛ Queen's Mercy blocked the bust!");
        const qmEff = getArtifactEffect('queens_mercy', artifacts);
        if (qmEff?.queenSaveReturnsCard) {
          const retDeck = [theKing, ...deck];
          setPlayerHand([...playerHand]);               // remove king we just added
          setDeck(retDeck.slice(2));
          setPullOptions(retDeck.slice(0, 2));
        } else {
          const snap = buildSnap(playerHand, newTgt, artifacts, actIdx, tableIdx, isBoss, lives, m, scUsedCount);
          dealTimers.current.push(setTimeout(() => startDealerTurn(snap), 1400));
        }
        return;
      }

      // Normal bust
      const br = calcBustResult(lives, m, artifacts, scUsedCount);
      applyBustResult(br, newPv, newTgt);
      return;
    }

    // ── No bust ───────────────────────────────────────────────────
    setPlayerHand(newHand);
    if (newPv === newTgt) setPvAnim('perfect');
    else if (newPv > pv) setPvAnim('up');
    else setPvAnim('down');
    setTimeout(() => setPvAnim(null), 750);
  }

  // ─── doStand ─────────────────────────────────────────────────────
  function doStand() {
    if (phase !== 'table' || !playerHand.length || kingPending || acePending) return;

    // Exact Only rule
    if (houseRule === 'exact_only') {
      if (pv === target) {
        const base = isBoss ? 9 : 4;
        setMoney(m => m + base);
        logEvent('Exact hit! ✦', base, '#c9a84c');
        setResult('win'); setMsg(`✦ Exact hit on ${target}! +$${base}`);
        setTableEarned(base);
        addRunEntry('win', pv, 0, base);
        dealTimers.current.push(setTimeout(() => setPhase('result'), 200));
        return;
      }
      // Tithe stand penalty for being short
      const titheEff = getArtifactEffect('the_tithe', artifacts);
      if (titheEff?.titheStandPenalty) {
        const pen = Math.min(money, titheEff.titheStandPenalty);
        setMoney(m => m - pen);
        logEvent(`The Tithe stand penalty: −$${pen}`, -pen, '#dc2626');
        addTrigger(`The Tithe: −$${pen} for standing short`, '#dc2626', 'the_tithe');
      }
      const br = calcBustResult(lives, money, artifacts, scUsedCount);
      applyBustResult(br, pv, target, true);
      return;
    }

    // Tithe stand penalty (stack 3, non-exact-only tables)
    const titheEff = getArtifactEffect('the_tithe', artifacts);
    if (titheEff?.titheStandPenalty && pv < target) {
      const pen = Math.min(money, titheEff.titheStandPenalty);
      setMoney(m => m - pen);
      logEvent(`The Tithe: −$${pen}`, -pen, '#dc2626');
      addTrigger(`The Tithe: −$${pen}`, '#dc2626', 'the_tithe');
    }

    const snap = buildSnap(playerHand, target, artifacts, actIdx, tableIdx, isBoss, lives, money, scUsedCount);
    startDealerTurn(snap);
  }

  // ─── Snapshot helper ─────────────────────────────────────────────
  interface Snap {
    pHand: Card[]; dHand: Card[]; dk: Card[];
    tgt: number; arts: OwnedArtifact[];
    ai: number; ti: number; boss: boolean;
    curLives: number; curMoney: number; curSc: number;
    gameMode: GameMode; showdownEnabled: boolean; showdownPile: Card[]; dealerFrozen: boolean;
    dealerPreviewPool: Card[]; dealerQueueCursor: number; ltDealerPreviewPool: LetterTile[];
    dealerArtifacts: OwnedArtifact[]; dealerRank: DealerRank; pitBossPhase: 1 | 2;
    goldenRaidActive: boolean; goldenGate: 1 | 2; goldenOpIndex: number;
  }

  function buildSnap(pHand: Card[], tgt: number, arts: OwnedArtifact[],
    ai: number, ti: number, boss: boolean, curLives: number, curMoney: number, curSc: number): Snap {
    return { pHand: [...pHand], dHand: [...dealerHand], dk: [...deck],
      tgt, arts: [...arts], ai, ti, boss, curLives, curMoney, curSc,
      gameMode, showdownEnabled, showdownPile: [...showdownPile], dealerFrozen,
      dealerPreviewPool: [...dealerPreviewPool], dealerQueueCursor, ltDealerPreviewPool: [...ltDealerPreviewPool],
      dealerArtifacts: [...dealerArtifacts], dealerRank, pitBossPhase,
      goldenRaidActive, goldenGate, goldenOpIndex };
  }

  // ─── startDealerTurn ─────────────────────────────────────────────
  function startDealerTurn(snap: Snap) {
    setPhase('dealer');
    setDealerHidden(false);
    setJackPeeks([]);

    // Showdown: merge accumulated face-down pile into dealer's starting hand
    const fullDealerHand = snap.showdownEnabled && snap.showdownPile.length > 0
      ? [...snap.dHand, ...snap.showdownPile]
      : snap.dHand;

    // Clear showdown pile (now revealed in dealer hand)
    if (snap.showdownEnabled && snap.showdownPile.length > 0) {
      setDealerHand(fullDealerHand); // flip all pile cards at once (dramatic reveal)
      setShowdownPile([]);
    }

    const cStacks = artifactStacks('contrarian_deck', snap.arts);
    const alStacks = artifactStacks('ace_license', snap.arts);
    const playerVal = handValue(snap.pHand, snap.tgt, cStacks, alStacks);

    // If frozen, dealer doesn't draw more (but still resolves current hand)
    const deckForDealer = snap.dealerFrozen ? [] : snap.dk;
    const activeDealerQueue = snap.dealerPreviewPool.slice((snap.dealerQueueCursor ?? 0) * 2);
    const { steps, finalHand, decisions, finalTarget, remainingDeck } = dealerAI(fullDealerHand, activeDealerQueue, deckForDealer, playerVal, snap.tgt, {
      dealerArtifacts: snap.dealerArtifacts,
      rank: snap.goldenRaidActive ? 'raidBoss' : snap.dealerRank,
      futurePairsVisible: snap.goldenRaidActive ? (snap.goldenGate >= 2 ? 1 : 0) : (snap.dealerRank === 'normal' ? 0 : snap.dealerRank === 'boss' ? 0 : 1),
      tieWins: true,
    });
    setDealerPreviewPool(prev => {
      const next = [...prev];
      decisions.forEach((d, idx) => {
        const pairIdx = (snap.dealerQueueCursor ?? 0) + idx;
        const base = pairIdx * 2;
        d.pair.forEach((card, offset) => { next[base + offset] = next[base + offset] ?? card; });
      });
      return next;
    });
    setDealerDecisionLog(prev => {
      const next = [...prev];
      decisions.forEach((d, idx) => { next[(snap.dealerQueueCursor ?? 0) + idx] = d; });
      return next;
    });
    setDealerQueueCursor((snap.dealerQueueCursor ?? 0) + decisions.length);
    setDeck(remainingDeck);
    if (finalTarget !== snap.tgt) {
      setTarget(finalTarget);
      setTargetAnim(true);
      setTimeout(() => setTargetAnim(false), 600);
    }

    steps.forEach((hand, i) => {
      dealTimers.current.push(setTimeout(() => setDealerHand(hand), 500 + i * 850));
    });
    dealTimers.current.push(setTimeout(() => {
      finalizeResult(snap.pHand, finalHand, playerVal, { ...snap, tgt: finalTarget });
    }, 500 + steps.length * 850 + 500));
  }

  // ─── finalizeResult ──────────────────────────────────────────────
  function finalizeResult(pHand: Card[], finalDH: Card[], playerVal: number, snap: Snap) {
    const dVal = handValue(finalDH, snap.tgt);
    const dBust = dVal > snap.tgt;
    const win = dBust || playerVal > dVal;
    const perfect = playerVal === snap.tgt;
    const tie = !win && playerVal === dVal;
    const arts = snap.arts;

    let earned = 0;
    const log: TableLogEntry[] = [];

    if (win && snap.goldenRaidActive && snap.goldenGate === 1) {
      setDealerHand(finalDH);
      setResult('win');
      setMsg('Gate I cracked. The Golden Dealer flips the table to 100.');
      setTableLog([{ label: 'Golden Gate I cleared', color: '#f59e0b' }, { label: 'Gate II target: 100', color: '#c9a84c' }]);
      setTableEarned(0);
      addRunEntry('win', playerVal, dVal, 0, snap.ai, snap.ti, snap.boss, snap.arts);
      setPhase('result');
      return;
    }

    if (win && snap.boss && ACTS[snap.ai]?.boss?.rule === 'pit_boss' && snap.pitBossPhase === 1) {
      setDealerHand(finalDH);
      setResult('win');
      setMsg('Phase I broken. The Pit Boss raises the table to 50 and locks another artifact.');
      setTableLog([{ label: 'Pit Boss Phase I cleared', color: '#f87171' }]);
      setTableEarned(0);
      addRunEntry('win', playerVal, dVal, 0, snap.ai, snap.ti, snap.boss, snap.arts);
      setPhase('result');
      return;
    }

    if (win) {
      const base = snap.boss ? 8 : 3;
      earned += base;
      log.push({ label: snap.boss ? 'Boss win' : 'Table win', amount: base });

      const hsEff = getArtifactEffect('high_stakes', arts);
      if (hsEff?.winBonus) {
        earned += hsEff.winBonus;
        log.push({ label: 'High Stakes', amount: hsEff.winBonus, color: '#f87171' });
        addTrigger(`High Stakes: +$${hsEff.winBonus}`, '#f87171', 'high_stakes');
      }

      // ── Hot Streak ────────────────────────────────────────────
      const newStrk = winStreak + 1;
      const strkEff = getArtifactEffect('hot_streak', snap.arts);
      if (strkEff?.streakBonus && newStrk >= (strkEff.streakMinWins ?? 2)) {
        earned += strkEff.streakBonus;
        log.push({ label: `Hot Streak (${newStrk}W): +$${strkEff.streakBonus}`, amount: strkEff.streakBonus, color: '#fb923c' });
        addTrigger(`🔥 Hot Streak! +$${strkEff.streakBonus}`, '#fb923c', 'hot_streak');
      }
      setWinStreak(newStrk);

      // ── Edge Work ─────────────────────────────────────────────
      const ewEff = getArtifactEffect('edge_work', snap.arts);
      if (ewEff?.edgeBonus) {
        const dist = snap.tgt - snap.pHand.reduce((s, c) => s + c.value, 0);
        if (dist >= 0 && dist <= (ewEff.edgeRange ?? 2)) {
          const ewBonus = dist === 0 ? (ewEff.edgePerfectBonus ?? ewEff.edgeBonus) : ewEff.edgeBonus;
          earned += ewBonus;
          log.push({ label: `Edge Work (${dist === 0 ? 'exact!' : dist + ' away'}): +$${ewBonus}`, amount: ewBonus, color: '#34d399' });
          addTrigger(`Edge Work: +$${ewBonus}`, '#34d399', 'edge_work');
        }
      }

      // ── House Cut ─────────────────────────────────────────────
      if (dBust) {
        const hcEff = getArtifactEffect('house_cut', snap.arts);
        if (hcEff?.dealerBustBonus) {
          earned += hcEff.dealerBustBonus;
          log.push({ label: `House Cut: dealer busted +$${hcEff.dealerBustBonus}`, amount: hcEff.dealerBustBonus, color: '#a3e635' });
          addTrigger(`House Cut: +$${hcEff.dealerBustBonus}`, '#a3e635', 'house_cut');
        }
      }

      const titheEff = getArtifactEffect('the_tithe', arts);
      if (titheEff?.titheWinBonus) {
        earned += titheEff.titheWinBonus;
        log.push({ label: 'The Tithe', amount: titheEff.titheWinBonus, color: '#dc2626' });
        addTrigger(`The Tithe: +$${titheEff.titheWinBonus}`, '#dc2626', 'the_tithe');
      }

      if (perfect) {
        const ldEff = getArtifactEffect('lucky_draw', arts);
        const perfBonus = ldEff?.perfectBonus ?? 1;
        earned += perfBonus;
        log.push({ label: 'Perfect Clear ✦', amount: perfBonus, color: '#c9a84c' });
        addTrigger(`✦ Perfect Clear! +$${perfBonus}`, '#c9a84c', 'lucky_draw');

        if (ldEff?.perfectRestoresLife && snap.curLives < 2) {
          setLives(l => Math.min(l + 1, 2));
          log.push({ label: 'Lucky Draw: +1 Life!', color: '#facc15' });
          addTrigger('✦ Lucky Draw: life restored!', '#facc15', 'lucky_draw');
        }

        const alEff = getArtifactEffect('ace_license', arts);
        if (alEff?.acePerfectMoney) {
          const aces = pHand.filter(c => c.rank === 'A').length;
          if (aces > 0) {
            earned += aces;
            log.push({ label: `Ace License: +$${aces}`, amount: aces, color: '#f97316' });
            addTrigger(`Ace License: +$${aces}`, '#f97316', 'ace_license');
          }
        }
      }

      setMoney(snap.curMoney + earned);
    } else if (tie) {
      // Tie in card mode — overtime instead of silently advancing.
      log.push({ label: 'PUSH — overtime', color: '#94a3b8' });
      log.push({ label: `Target will rise to ${snap.tgt + 8}`, color: '#c9a84c' });
      const insEff3 = getArtifactEffect('insurance_policy', arts);
      if (insEff3?.insurancePushMoney) {
        const pm = insEff3.insurancePushMoney;
        earned += pm;
        setMoney(snap.curMoney + pm);
        log.push({ label: `Insurance: push bonus +$${pm}`, amount: pm, color: '#7dd3fc' });
      }
      const strkTie = getArtifactEffect('hot_streak', arts);
      if (!strkTie?.streakSurviveTie) setWinStreak(0);
    } else {
      // ── Insurance Policy: close loss → push ───────────────────
      const insEff4 = getArtifactEffect('insurance_policy', arts);
      if (insEff4?.insuranceMargin && !dBust) {
        const margin = dVal - playerVal;
        if (margin > 0 && margin <= insEff4.insuranceMargin) {
          addTrigger(`Insurance: ${margin}-pt loss → push`, '#7dd3fc', 'insurance_policy');
          const pm = insEff4.insurancePushMoney ?? 0;
          if (pm > 0) { setMoney(snap.curMoney + pm); log.push({ label: `Insurance push: +$${pm}`, amount: pm, color: '#7dd3fc' }); }
          log.push({ label: 'PUSH — overtime', color: '#94a3b8' });
          log.push({ label: `Target will rise to ${snap.tgt + 8}`, color: '#c9a84c' });
          setResult('tie'); setMsg(`Push (Insurance) — lost by ${margin}`);
          setTableLog(log); setTableEarned(earned);
          addRunEntry('tie', playerVal, dVal, earned, snap.ai, snap.ti, snap.boss, arts);
          setPhase('result');
          setWinStreak(0);
          return;
        }
      }
      setWinStreak(0);

      // High Stakes loss penalty
      const hsEff = getArtifactEffect('high_stakes', arts);
      const penalty = hsEff?.bustPenalty ?? 0;
      let curMoney = snap.curMoney;
      if (penalty > 0) {
        const actual = Math.min(curMoney, penalty);
        curMoney -= actual;
        log.push({ label: 'High Stakes penalty', amount: -actual, color: '#f87171' });
        addTrigger(`High Stakes: −$${actual}`, '#f87171', 'high_stakes');
      }

      const br = calcBustResult(snap.curLives, curMoney, arts, snap.curSc);
      setLives(br.newLives);
      setMoney(br.newMoney);
      setScUsedCount(br.newScUsed);
      if (br.trigger) {
        addTrigger(br.trigger, br.triggerColor, br.pulseId ?? undefined);
        log.push({ label: br.trigger, color: br.triggerColor });
      }
      if (br.isSecondChance) {
        setScFlash(true);
        setTimeout(() => setScFlash(false), 2800);
      }
      if (!br.saved) {
        crackPiggyBank();
        setHeartBreakIdx(br.newLives);
        setTimeout(() => setHeartBreakIdx(-1), 2000);
      }
    }

    if (win) {
      addHouseLedger(snap.boss ? 'bossEncounter' : 'normalEncounter', snap.boss ? 8 : 4, snap.ai, snap.ti);
      if (snap.gameMode === 'card' && snap.ai >= 3) setClosingTime(v => v + (snap.boss ? 3 : 1));
    }

    setDealerHand(finalDH);
    setResult(win ? 'win' : tie ? 'tie' : 'lose');
    setMsg(
      tie
        ? `Push — tied at ${playerVal}`
        : dBust
          ? 'Dealer busted!'
          : win
            ? `You win — ${playerVal} vs ${dVal}`
            : `Dealer wins with ${dVal}`
    );
    setTableLog(log);
    setTableEarned(earned);
    addRunEntry(win ? 'win' : tie ? 'tie' : 'lose', playerVal, dVal, earned, snap.ai, snap.ti, snap.boss, snap.arts);
    setPhase('result');
  }

  // ─── applyBustResult ─────────────────────────────────────────────
  function applyBustResult(br: ReturnType<typeof calcBustResult>, pVal: number, tgt: number, isLose = false) {
    setLives(br.newLives);
    setMoney(br.newMoney);
    setScUsedCount(br.newScUsed);
    if (br.trigger) { addTrigger(br.trigger, br.triggerColor, br.pulseId ?? undefined); }
    if (br.isSecondChance) { setScFlash(true); setTimeout(() => setScFlash(false), 2800); }
    if (!br.saved) { crackPiggyBank(); setHeartBreakIdx(br.newLives); setTimeout(() => setHeartBreakIdx(-1), 2000); }
    const res: TableResult = isLose ? 'lose' : 'bust';
    setResult(res);
    setMsg(isLose ? `Must hit exactly ${tgt}. You stood at ${pVal}.` : `Bust! ${pVal} exceeded ${tgt}.`);
    addRunEntry(res, pVal, 0, 0);
    dealTimers.current.push(setTimeout(() => setPhase('result'), 1400));
  }

  function continueTieOvertime() {
    const nextTarget = target + 8;
    addTrigger(`Push: target rises to ${nextTarget}. Hands stay live.`, '#94a3b8');
    setTarget(nextTarget);
    setTargetAnim(true);
    setTimeout(() => setTargetAnim(false), 600);
    setResult(null);
    setMsg('');
    setTableLog([]);
    setTableEarned(0);
    setPhase('table');
    setPullOptions(null);
    setLetterPullOptions(null);
    setDealerHidden(false);
    setKingPending(null);
    setAcePending(null);
    setJackPeeks([]);
    setRedactPending(false);
  }

  function retryBossFight() {
    if (houseRule === 'golden_dealer') {
      addTrigger('Golden Dealer retry: the raid starts over.', '#f59e0b');
      beginGoldenRaid(money);
      return;
    }
    addTrigger('Boss retry: the fight resets, but the locked artifacts stay marked.', '#ef4444');
    const retryArts = artifacts;
    beginTable(actIdx, tableIdx, true, retryArts, 1, undefined, {
      skipPitLock: houseRule === 'pit_boss',
      pitNumberBan: pitBannedRank,
      pitFaceBan: pitBannedFaceRank,
    });
  }

  function continuePitBossPhaseTwo() {
    let nextArts = artifacts;
    const lock = lockOnePitBossArtifact(nextArts);
    nextArts = lock.arts;
    setArtifacts(nextArts);
    if (lock.lockedName) {
      addTrigger(`Pit Boss Phase II: ${lock.lockedName}`, '#ef4444');
      logEvent(`Pit Boss locked ${lock.lockedName}`, undefined, '#ef4444');
    }
    const faceBan = pitBannedFaceRank ?? choosePitBossFaceBan();
    setPitBossPhase(2);
    setPitBannedFaceRank(faceBan);
    if (faceBan) addTrigger(`Pit Boss also bans ${faceBan}s`, '#ef4444');
    setTarget(50);
    setTargetAnim(true);
    setTimeout(() => setTargetAnim(false), 600);
    setResult(null);
    setMsg('');
    setTableLog([]);
    setTableEarned(0);
    setPullOptions(null);
    setKingPending(null);
    setAcePending(null);
    setJackPeeks([]);
    setDealerHidden(false);
    setPhase('table');
  }

  function enterEndless() {
    addTrigger('Act IV: House Heat begins.', '#f97316');
    setClosingTime(v => Math.max(v, 1));
    beginTable(ACTS.length, 0, false, artifacts);
  }

  function continueGoldenGateTwo() {
    setGoldenGate(2);
    setTarget(100);
    setTargetAnim(true);
    setTimeout(() => setTargetAnim(false), 600);
    setResult(null);
    setMsg('');
    setTableLog([{ label: 'Golden Gate II: target 100', color: '#f59e0b' }]);
    setTableEarned(0);
    setPullOptions(null);
    setKingPending(null);
    setAcePending(null);
    setJackPeeks([]);
    setDealerHidden(false);
    addTrigger('Gate II opens. The operation clock does not reset.', '#f59e0b');
    setPhase('table');
  }

  function completeGoldenRaid() {
    const payout = 75;
    const nextMoney = money + payout;
    setMoney(nextMoney);
    setGoldenRaidActive(false);
    setGoldenRaidDefeated(true);
    setIsBoss(false);
    setHouseRule(null);
    setClosingTime(v => v + 8);
    unlockAchievement('House Cracker', 'defeated the Golden Dealer');
    addTrigger(`Golden Dealer defeated: +$${payout}`, '#f59e0b');
    doToast('Golden Dealer cracked. The shop reopens.');
    setShopKind('main');
    setShopExit('nextTable');
    setShopRerolls(0);
    setShopItems(buildShopItems(artifacts, nextMoney, lives, 'main', 0));
    setPhase('shop');
  }

  // ─── onContinue ──────────────────────────────────────────────────
  function onContinue() {
    if (result === 'tie') {
      continueTieOvertime();
      return;
    }
    if (result === 'win' && goldenRaidActive && goldenGate === 1) {
      continueGoldenGateTwo();
      return;
    }
    if (result === 'win' && goldenRaidActive && goldenGate === 2) {
      completeGoldenRaid();
      return;
    }
    if (result === 'win' && isBoss && houseRule === 'pit_boss' && pitBossPhase === 1) {
      continuePitBossPhaseTwo();
      return;
    }
    if (result === 'win') {
      growPiggyBank();
      offerReward();
    } else {
      if (lives <= 0) { finishRun('lose'); }
      else if (isBoss) { retryBossFight(); }
      else { goNext(); }
    }
  }

  // ─── offerReward ─────────────────────────────────────────────────
  function offerReward() {
    setRewardPool(generateRewardPool(artifacts));
    setPhase('reward');
  }

  // ─── pickReward ──────────────────────────────────────────────────
  function applyRewardToArtifacts(current: OwnedArtifact[], id: ArtifactId | null): OwnedArtifact[] {
    if (!id) return current;
    const existing = current.find(a => a.id === id);
    if (existing && existing.stacks < ARTIFACT_DEFS[id].maxStacks) {
      return current.map(a => a.id === id ? { ...a, stacks: a.stacks + 1 } : a);
    }
    if (!existing) return [...current, { id, stacks: 1 }];
    return current;
  }

  function grantArtifactRewards(ids: ArtifactId[]) {
    if (ids.length === 0) return;
    setArtifacts(current => ids.reduce(
      (next, id) => applyRewardToArtifacts(next, id),
      current,
    ));
  }

  function pickReward(id: ArtifactId | null) {
    let nextArts = applyRewardToArtifacts(artifacts, id);
    if (isBoss && houseRule === 'pit_boss' && result === 'win') nextArts = clearFightArtifactStatuses(nextArts);

    if (id) {
      setArtifacts(nextArts);
      const maxedLevelThrees = nextArts.filter(a => a.stacks >= 3).length;
      if (maxedLevelThrees >= 3) unlockAchievement('Triple Crown', 'held 3 artifacts at Level III');
    } else {
      // Skip is now a real choice: pocket a random trinket if possible, otherwise take $3.
      const legalTrinkets = TRINKET_IDS.filter(tid => {
        const def = TRINKET_DEFS[tid];
        if (def.showdownOnly && !showdownEnabled) return false;
        if (def.alphabetOnly && gameMode !== 'alphabet') return false;
        return true;
      });
      if (trinkets.length < maxTrinkets && legalTrinkets.length > 0) {
        const tid = legalTrinkets[Math.floor(Math.random() * legalTrinkets.length)] as TrinketId;
        setTrinkets(t => [...t, tid]);
        addTrigger(`Skipped reward: ${TRINKET_DEFS[tid].name}`, '#f59e0b');
      } else {
        const bonus = getArtifactEffect('midas_mark', artifacts)?.skipRewardMoneyBonus ?? 0;
        const skipMoney = 3 + bonus;
        setMoney(m => m + skipMoney);
        addTrigger(`Skipped reward: +$${skipMoney}`, '#c9a84c', bonus > 0 ? 'midas_mark' : undefined);
      }
    }

    if (isBoss && result === 'win') {
      setLives(l => Math.min(l + 1, 2));
      doToast('♥ Boss reward: life restored!');
      setShopKind('main');
      setShopExit('nextAct');
      setShopRerolls(0);
      setShopItems(buildShopItems(nextArts, money, Math.min(lives + 1, 2), 'main', 0));
      setPhase('shop');
    } else {
      goNext(nextArts);
    }
  }

  function enterLastCall() {
    const cost = 4 + lastCallVisits * 3;
    if (money < cost) { doToast(`Last Call costs $${cost}.`); return; }
    const nextMoney = money - cost;
    setMoney(nextMoney);
    setLastCallVisits(v => v + 1);
    setShopKind('last_call');
    setShopExit('nextTable');
    setShopRerolls(0);
    setShopItems(buildShopItems(artifacts, nextMoney, lives, 'last_call', 0));
    addHouseLedger('lastCall', 2);
    addTrigger(`Last Call: −$${cost}`, '#c9a84c');
    setPhase('shop');
  }

  // ─── goNext ──────────────────────────────────────────────────────
  // ─── tryFireEvent ────────────────────────────────────────────────
  function unlockRunAchievement(name: string) {
    const def = ACHIEVEMENT_DEFS.find((achievement: { name: string }) => achievement.name === name) as
      | { description?: string }
      | undefined;
    unlockAchievement(name, def?.description);
  }

  function checkAndUnlockAchievements(conditions: Partial<Record<string,boolean>>) {
    const already = [...runAchievements, ...(playerData?.achievements ?? [])];
    const newly = checkAchievements(conditions, already);
    newly.forEach((name: string) => unlockRunAchievement(name));
  }

  function tryFireEvent(nav: {ai:number;ti:number;boss:boolean;arts:OwnedArtifact[]}): boolean {
    if (nav.boss) return false;
    let eventWinStreak = 0;
    let eventLossStreak = 0;
    for (let i = runLog.length - 1; i >= 0 && runLog[i].result === 'win'; i--) eventWinStreak++;
    for (let i = runLog.length - 1; i >= 0 && ['lose', 'bust'].includes(runLog[i].result); i--) eventLossStreak++;

    const pool = buildEventPool(nav.ai, seenEvents, eventWinStreak, eventLossStreak)
      .filter((id: EventId) => nav.ai >= ACTS.length || !isPostActThreeEvent(id));
    if (pool.length === 0) return false;
    const roll = Math.random();
    // Streak-triggered events fire at higher probability
    const streakEvent = eventLossStreak >= 2 || eventWinStreak >= 3;
    const eventChance = streakEvent
      ? STREAK_EVENT_CHANCE
      : EVENT_BASE_CHANCE * EVENT_CHANCE_MULTIPLIER;
    if (roll >= eventChance) return false;

    const streakPool = pool.filter((id: EventId) => {
      const t = EVENT_DEFS[id]?.trigger;
      if (eventLossStreak >= 2 && t === 'cold_streak') return true;
      if (eventWinStreak >= 3 && t === 'win_streak') return true;
      return false;
    });
    const normalPool = pool.filter((id: EventId) =>
      !['cold_streak','win_streak','offer_followup'].includes(EVENT_DEFS[id]?.trigger)
    );
    const picked = pickRandomEvent(streakPool.length > 0 ? streakPool : normalPool);
    if (!picked) return false;

    setActiveEvent(picked);
    setSeenEvents((prev: EventId[]) => [...prev, picked]);
    setPendingNav(nav);
    setDumpsterPulls([]);
    setMirrorEntries(0);
    setMirrorLastCard(undefined);
    setPhase('event');
    if (seenEvents.length === 0) checkAndUnlockAchievements({ first_event: true });
    return true;
  }

  function doDumpsterPull() {
    const roll = Math.random();
    let result: DumpsterResult;
    if (roll < 0.35) {
      const amt = Math.floor(Math.random() * 11) + 10;
      result = { type: 'money', value: amt, label: `$${amt}`, color: '#c9a84c' };
      setMoney((m: number) => m + amt);
    } else if (roll < 0.55) {
      result = { type: 'trinket', label: 'Random trinket', color: '#67e8f9' };
    } else if (roll < 0.65) {
      result = { type: 'trinket_cursed', label: 'Cursed trinket', color: '#ef4444' };
    } else if (roll < 0.80) {
      result = { type: 'artifact', label: 'Random artifact (Tier I)', color: '#60a5fa' };
      const pool = generateRewardPool(artifacts);
      if (pool.length > 0) grantArtifactRewards([pool[0]]);
    } else if (roll < 0.90) {
      result = { type: 'artifact_cursed', label: 'Cursed artifact (Tier I)', color: '#a855f7' };
      const pool = generateRewardPool(artifacts);
      if (pool.length > 0) grantArtifactRewards([pool[0]]);
    } else if (roll < 0.95) {
      result = { type: 'lose_life', label: '⚠ Lose 1 life', color: '#ef4444' };
      setLives((l: number) => Math.max(0, l - 1));
      addTrigger('Dumpster: something sharp — life lost', '#ef4444');
    } else {
      result = { type: 'trash_chip', label: 'Trash Chip (event artifact)', color: '#f59e0b' };
      addTrigger('Found: Trash Chip — event artifact (Tier I)', '#f59e0b');
    }
    const newPulls = [...dumpsterPulls, result];
    setDumpsterPulls(newPulls);
    if (newPulls.length >= 5) checkAndUnlockAchievements({ dumpster_deep: true });
  }

  function resolveEventChoice(eventId: EventId, choiceId: string) {
    const nav = pendingNav;
    let deckSizeOverride: 52 | 104 | undefined;
    const done = () => {
      setActiveEvent(null); setPendingNav(null);
      setDumpsterPulls([]); setMirrorEntries(0); setMirrorLastCard(undefined);
      if (nav) {
        if (gameMode === 'alphabet') beginLetterTable(nav.ai, nav.ti, nav.boss, nav.arts);
        else beginTable(nav.ai, nav.ti, nav.boss, nav.arts, 1, undefined,
          deckSizeOverride ? { deckSize: deckSizeOverride } : {});
      }
    };

    if (eventId === 'dumpster_dive') {
      if (choiceId === 'reach') { doDumpsterPull(); return; }
      return done();
    }
    if (eventId === 'mirror_hallway') {
      if (choiceId === 'enter') {
        if (lives > 1) {
          setLives((l: number) => l - 1);
          if (dealerHand.length > 0) {
            const copied = dealerHand[0];
            setMirrorLastCard(`${copied.rank}${copied.suit}`);
            setDeck((d: any[]) => [...d, { ...copied, id: `mirror_${Date.now()}` }]);
            addTrigger(`Mirror: copied ${copied.rank}${copied.suit}`, '#a855f7');
          }
          const ne = mirrorEntries + 1;
          setMirrorEntries(ne);
          if (ne >= 3) checkAndUnlockAchievements({ mirror_thrice: true });
        }
        return; // stay in mirror event
      }
      return done();
    }

    // Single-resolution events
    switch (eventId) {
      case 'golden_idol':
        if (choiceId === 'take') {
          setMoney((m: number) => m + 75);
          setGoldenIdolActive(true);
          addTrigger('Golden Idol — $75 gained, $5 drain per table forever', '#c9a84c');
          checkAndUnlockAchievements({ golden_idol_take: true });
        }
        break;
      case 'janitors_closet':
        if (choiceId === 'tumble' && artifacts.length > 0) {
          const idx = Math.floor(Math.random() * artifacts.length);
          const old = artifacts[idx];
          const newPool = ALL_ARTIFACT_IDS.filter((id: ArtifactId) => id !== old.id);
          const newId = newPool[Math.floor(Math.random() * newPool.length)];
          setArtifacts((prev: OwnedArtifact[]) => prev.map((a, i) => i === idx ? { id: newId, stacks: old.stacks } : a));
          addTrigger(`Tumble: ${ARTIFACT_DEFS[old.id]?.name} → ${ARTIFACT_DEFS[newId]?.name}`, '#f59e0b');
        } else if (choiceId === 'gooped') {
          const pool = generateRewardPool(artifacts);
          if (pool.length > 0) { grantArtifactRewards([pool[0]]); addTrigger('Gooped artifact (cursed)', '#a855f7'); }
        } else if (choiceId === 'steal') {
          setMoney((m: number) => m + 15);
          setNightShiftDraws(2); // borrow field: reduces draws for 2 tables
          addTrigger('Stole $15 — 1 fewer draw/turn for 2 tables', '#f59e0b');
        }
        break;
      case 'night_shift':
        if (choiceId === 'pay') {
          setMoney((m: number) => m - 8);
          setNightShiftDraws(4);
          addTrigger('Night Shift bribe: +1 draw/turn for 4 tables', '#67e8f9');
        } else if (choiceId === 'trade' && artifacts.length > 0) {
          const idx = Math.floor(Math.random() * artifacts.length);
          setArtifacts((prev: OwnedArtifact[]) => prev.filter((_: any, i: number) => i !== idx));
          const pool = generateRewardPool(artifacts);
          if (pool.length > 0) grantArtifactRewards([pool[0], pool[0]]);
          addTrigger('Night Shift trade: artifact → 2 new artifacts', '#67e8f9');
        } else {
          if (artifacts.length > 0) setArtifacts((prev: OwnedArtifact[]) => prev.map((a: OwnedArtifact, i: number) => i === 0 ? { ...a, status: { ...(a.status ?? {}), disabledUntilTableEnd: true } } : a));
          addTrigger('Night Shift: annoyed — artifact suppressed next table', '#ef4444');
          checkAndUnlockAchievements({ night_survived: true });
        }
        break;
      case 'blacksmith':
        if (choiceId === 'forge_t4') {
          const t3Idx = artifacts.findIndex((a: OwnedArtifact) => a.stacks >= 3);
          if (t3Idx >= 0 && money >= 20) {
            setMoney((m: number) => m - 20);
            setArtifacts((prev: OwnedArtifact[]) => prev.map((a: OwnedArtifact, i: number) => i === t3Idx ? { ...a, stacks: 4 } : a));
            addTrigger(`Blacksmith: ${ARTIFACT_DEFS[artifacts[t3Idx].id]?.name} → Tier IV`, '#c9a84c');
            checkAndUnlockAchievements({ blacksmith_t4: true, legendary: true });
          }
        } else if (choiceId === 'forge_new' && money >= 30) {
          setMoney((m: number) => m - 30);
          const pool = generateRewardPool(artifacts);
          if (pool.length >= 2) {
            grantArtifactRewards([pool[0], pool[0], pool[1], pool[1], pool[1]]);
          }
          addTrigger('Blacksmith: Tier II + Tier III forged', '#60a5fa');
        }
        break;
      case 'surprise_boss':
        if (choiceId === 'fight') {
          setActiveEvent(null); setPendingNav(null);
          const begin = gameMode === 'alphabet' ? beginLetterTable : beginTable;
          begin(actIdx, 0, true, artifacts);
          checkAndUnlockAchievements({ surprise_fight: true });
          return;
        } else if (choiceId === 'pay') { setMoney((m: number) => m - 15); }
        else if (choiceId === 'burn' && artifacts.length > 0) { setArtifacts((prev: OwnedArtifact[]) => prev.slice(1)); addTrigger('Artifact sacrificed — boss retreats', '#ef4444'); }
        break;
      case 'jesters_entry':
        if (choiceId === 'accept') { setJestersInDeck(true); addTrigger('Jester enters your deck', '#e879f9'); }
        break;
      case 'the_offer': case 'the_wager':
        if (choiceId === 'accept' && artifacts.length > 0) {
          setOfferArtifactId(artifacts[0].id);
          setOfferWins(0); setOfferTablesLeft(3);
          setArtifacts((prev: OwnedArtifact[]) => prev.filter((_: any, i: number) => i !== 0));
          addTrigger(`Contract: ${ARTIFACT_DEFS[artifacts[0].id]?.name} staked for 3 tables`, '#c9a84c');
        }
        break;
      case 'hallway_of_offers':
        if (choiceId === 'money') { setMoney((m: number) => m + 20); addTrigger('+$20', '#c9a84c'); }
        else if (choiceId === 'artifact') { const p = generateRewardPool(artifacts); if (p.length>0) grantArtifactRewards([p[0]]); addTrigger('Artifact upgrade', '#60a5fa'); }
        else if (choiceId === 'unknown') {
          const r = Math.random();
          if (r < 0.4) { setMoney((m: number) => m + 10); const p = generateRewardPool(artifacts); if (p.length>0) grantArtifactRewards([p[0], p[0], p[0]]); addTrigger('Unknown: high-tier artifact!', '#c9a84c'); checkAndUnlockAchievements({ legendary: true }); }
          else if (r < 0.7) { setLives((l: number) => Math.min(l + 1, 2)); addTrigger('Unknown: life restored', '#22c55e'); }
          else if (r < 0.9) { addTrigger('Unknown: artifact cursed', '#ef4444'); }
          else { addTrigger('Unknown: nothing', '#4a4035'); }
        }
        break;
      case 'the_loan':
        if (choiceId === 'accept') { setMoney((m: number) => m + 20); if (artifacts.length>0) setArtifacts((prev: OwnedArtifact[]) => prev.map((a: OwnedArtifact,i: number) => i===0?{...a,status:{...(a.status??{}),disabledUntilTableEnd:true}}:a)); addTrigger('+$20 loan — artifact suppressed next table', '#c9a84c'); }
        break;
      case 'house_inspection':
        if (choiceId === 'pay') { const c = artifacts.length*3; setMoney((m: number) => Math.max(0,m-c)); addTrigger(`Inspection: −$${c}`, '#f59e0b'); }
        else if (choiceId === 'trinket') { setTrinkets((t: any[]) => t.slice(1)); addTrigger('Gave trinket to inspection', '#f59e0b'); }
        else { if (artifacts.length>0) setArtifacts((prev: OwnedArtifact[]) => prev.slice(1)); addTrigger('Confiscated an artifact', '#ef4444'); }
        break;
      case 'night_shift_peek':
        if (choiceId === 'peek') { setMoney((m: number) => m - 6); addTrigger('Peeked next 4 deck cards', '#67e8f9'); }
        else if (choiceId === 'peek_remove') { setMoney((m: number) => m - 10); addTrigger('Peeked and removed one card from deck', '#67e8f9'); }
        break;
      case 'second_deck':
        if (choiceId === 'merge') {
          deckSizeOverride = 104;
          setTotalDeckSize(104);
          addTrigger('Second deck merged — 104 cards', '#60a5fa');
        }
        break;
    }
    done();
  }

  // ─── goNext (event-aware) ─────────────────────────────────────────
  function goNext(arts = artifacts) {
    const cleanArts = houseRule === 'pit_boss' ? clearFightArtifactStatuses(arts) : arts;
    if (cleanArts !== arts) setArtifacts(cleanArts);
    arts = cleanArts;
    const acts  = gameMode === 'alphabet' ? LETTER_ACTS : ACTS;
    const begin = gameMode === 'alphabet' ? beginLetterTable : beginTable;

    // Determine next navigation target
    let nextAi: number, nextTi: number, nextBoss: boolean;
    if (isBoss) {
      const na = actIdx + 1;
      if (gameMode === 'alphabet' && na >= acts.length) { finishRun('win'); return; }
      else if (gameMode === 'card' && actIdx === ACTS.length - 1) { setPhase('win'); return; }
      else { nextAi = na; nextTi = 0; nextBoss = false; }
    } else {
      const nt = tableIdx + 1;
      const currentAct = gameMode === 'alphabet' ? acts[Math.min(actIdx, acts.length - 1)] : getCardAct(actIdx);
      if (nt >= currentAct.tables.length) { setPhase('boss_intro'); return; }
      else { nextAi = actIdx; nextTi = nt; nextBoss = false; }
    }

    const nav = { ai: nextAi!, ti: nextTi!, boss: nextBoss!, arts };
    if (!tryFireEvent(nav)) begin(nav.ai, nav.ti, nav.boss, nav.arts);
  }

  // ─── enterShop ───────────────────────────────────────────────────
  function leaveShop() {
    if (shopExit === 'nextTable') {
      goNext(artifacts);
      return;
    }
    const acts = gameMode === 'alphabet' ? LETTER_ACTS : ACTS;
    const begin = gameMode === 'alphabet' ? beginLetterTable : beginTable;
    const na = actIdx + 1;
    if (gameMode === 'alphabet' && na >= acts.length) finishRun('win');
    else if (gameMode === 'card' && actIdx === ACTS.length - 1) setPhase('win');
    else begin(na, 0, false, artifacts);
  }

  function buyShopItem(item: ShopItem) {
    // item.available can go stale after a purchase. Current money is authoritative.
    if (money < item.cost) {
      doToast('Not enough money.');
      setShopItems(prev => refreshShopAvailability(prev, money));
      return;
    }

    if (item.type === 'reroll') {
      const nextMoney = money - item.cost;
      const nextRerolls = shopRerolls + 1;
      setMoney(nextMoney);
      setShopRerolls(nextRerolls);
      setShopItems(buildShopItems(artifacts, nextMoney, lives, shopKind, nextRerolls));
      addTrigger(`Shop rerolled — next reroll $${getShopRerollCost(nextRerolls)}`, '#c9a84c');
      return;
    }

    const nextMoney = money - item.cost;

    if (item.type === 'golden_chip') {
      const nextChips = goldenChips + 1;
      setMoney(nextMoney);
      setGoldenChips(nextChips);
      addTrigger(`Bought Golden Chip ${nextChips}/3`, '#f59e0b');
      if (nextChips >= 3) {
        beginGoldenRaid(nextMoney);
      } else {
        setShopItems(prev => refreshShopAvailability(prev.filter(i => i.id !== item.id), nextMoney));
      }
      return;
    }

    if (item.type === 'heal') {
      setMoney(nextMoney);
      setLives(l => Math.min(l + 1, 2));
      addTrigger('♥ Patched up', '#e8394a');
      setShopItems(prev => refreshShopAvailability(prev.map(i => i.id === item.id ? { ...i, available: false } : i), nextMoney));
      return;
    }

    if (item.type === 'artifact' && item.artifactId) {
      setMoney(nextMoney);
      const nextArts = [...artifacts, { id: item.artifactId!, stacks: 1 }];
      setArtifacts(nextArts);
      addTrigger(`Bought: ${ARTIFACT_DEFS[item.artifactId!].name}`, ARTIFACT_DEFS[item.artifactId!].color);
      setShopItems(prev => refreshShopAvailability(prev.filter(i => i.id !== item.id), nextMoney));
      return;
    }

    if (item.type === 'upgrade' && item.artifactId) {
      setMoney(nextMoney);
      const nextArts = artifacts.map(a => a.id === item.artifactId ? { ...a, stacks: a.stacks + 1 } : a);
      setArtifacts(nextArts);
      const def = ARTIFACT_DEFS[item.artifactId];
      addTrigger(`Upgraded: ${def.name}`, def.color);
      if (nextArts.filter(a => a.stacks >= 3).length >= 3) unlockAchievement('Triple Crown', 'held 3 artifacts at Level III');
      setShopItems(prev => refreshShopAvailability(prev.filter(i => i.id !== item.id), nextMoney));
      return;
    }

    if (item.type === 'trinket' && item.trinketId) {
      if (trinkets.length >= maxTrinkets) { doToast(`Pockets full — max ${maxTrinkets} trinkets.`); return; }
      setMoney(nextMoney);
      setTrinkets(t => [...t, item.trinketId as TrinketId]);
      addTrigger(`Bought: ${TRINKET_DEFS[item.trinketId as TrinketId]?.name ?? item.label}`, '#f59e0b');
      setShopItems(prev => refreshShopAvailability(prev.filter(i => i.id !== item.id), nextMoney));
      return;
    }
  }

  // ─── finishRun ───────────────────────────────────────────────────
  function finishRun(outcome: 'win' | 'lose') {
    try {
      localStorage.removeItem(ACTIVE_RUN_KEY);
      setHasResumeSave(false);
      setResumeSummary(null);
    } catch { /* ignore */ }
    // Save to localStorage
    const act = gameMode === 'alphabet' ? LETTER_ACTS[Math.min(actIdx, LETTER_ACTS.length - 1)] : getCardAct(actIdx);
    const tableLabel = isBoss ? act.boss.name : act.tables[Math.min(tableIdx, act.tables.length - 1)]?.label ?? 'Table';
    const savedRun: SavedRun = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      outcome,
      nickname: generateNickname(artifacts),
      actsCleared: outcome === 'win' ? Math.max(actIdx + 1, ACTS.length) : actIdx,
      finalTable: tableLabel,
      totalMoney: money,
      artifacts: artifacts.map(a => ({ id: a.id, stacks: a.stacks, name: ARTIFACT_DEFS[a.id].name })),
      tableLog: [...runLog],
      achievements: [...runAchievements],
      tablesWon: runLog.filter(e => e.result === 'win').length,
      tablesLost: runLog.filter(e => e.result !== 'win').length,
    };
    try {
      const raw = localStorage.getItem('house-rules-data');
      const data: PlayerData = raw ? JSON.parse(raw) : { runs: [], totalRuns: 0, totalWins: 0, bestMoney: 0, longestRun: 0, achievements: [] };
      data.runs.unshift(savedRun);
      data.runs = data.runs.slice(0, 50);
      data.totalRuns++;
      if (outcome === 'win') data.totalWins++;
      data.bestMoney = Math.max(data.bestMoney, money);
      data.longestRun = Math.max(data.longestRun, savedRun.tablesWon);
      data.achievements = Array.from(new Set([...(data.achievements ?? []), ...runAchievements]));
      localStorage.setItem('house-rules-data', JSON.stringify(data));
      setPlayerData(data);
    } catch { /* ignore */ }

    setPhase(outcome === 'win' ? 'win' : 'gameover');
  }

  // ─── newRun ──────────────────────────────────────────────────────
  function newRun() {
    try { localStorage.removeItem(ACTIVE_RUN_KEY); } catch { /* ignore */ }
    const char      = CHARACTERS.find(c => c.id === selectedChar) ?? CHARACTERS[0];
    const startArts = buildStartArtifacts(char, ALL_ARTIFACT_IDS, shuffle);
    setLives(char.startLives);
    setMoney(char.startMoney);
    setArtifacts(startArts);
    setScUsedCount(0);
    setRunLog([]);
    setTrinkets([]);
    setShowdownPile([]);
    setLetterShowdownPile([]);
    setDealerPreviewPool([]);
    setLtDealerPreviewPool([]);
    setDealerFrozen(false);
    setRedactPending(false);
    setWinStreak(0);
    setPiggyBank(null);
    setShopRerolls(0);
    setShopKind('main');
    setShopExit('nextAct');
    setLastCallVisits(0);
    setPitBannedRank(null);
    setPitBannedFaceRank(null);
    setClosingTime(0);
    setGoldenChips(0);
    setGoldenRaidActive(false);
    setGoldenGate(1);
    setGoldenOpIndex(0);
    setGoldenRaidDefeated(false);
    setActiveEvent(null);
    setSeenEvents([]);
    setPendingNav(null);
    setDumpsterPulls([]);
    setMirrorEntries(0);
    setMirrorLastCard(undefined);
    setGoldenIdolActive(false);
    setGoldenIdolTables(0);
    setNightShiftDraws(0);
    setOfferArtifactId(null);
    setOfferWins(0);
    setOfferTablesLeft(0);
    setJestersInDeck(false);
    setTotalDeckSize(52);
    setRunAchievements([]);
    setAchievementPops([]);
    achievementTimers.current.forEach(clearTimeout);
    achievementTimers.current.clear();
    unlockedAchievementNames.current = new Set(playerData?.achievements ?? []);
    setHouseLedger({ total: 0, history: [] });
    setDealerArtifacts([]);
    setDealerName('Table Dealer');
    setDealerRank('normal');
    setDealerDecisionLog([]);
    setContrarianUsesLeft(0);
    setCrookedPawnRank(null);
    setOddPilgrimageClaimed(false);
    setRoyalEchoUsesLeft(0);
    setJackEchoPulls(0);
    setQueenEchoHalves(0);
    setPullsThisTable(0);
    setGameMode(selectedGameMode);
    setShowdownEnabled(showdownSelected);
    dealTimers.current.forEach(clearTimeout);
    dealTimers.current = [];
    if (selectedGameMode === 'alphabet') {
      beginLetterTable(0, 0, false, startArts);
    } else {
      beginTable(0, 0, false, startArts, 1, undefined, { deckSize: 52 });
    }
  }

  // ─── Quick menu overlay ─────────────────────────────────────────
  const QuickMenu = showMenu ? (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,.78)',
      display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={() => setShowMenu(false)}>
      <div className="pop" style={{ padding: '24px 28px', background: '#060e07',
        border: '1px solid rgba(201,168,76,.3)', borderRadius: '12px',
        display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '200px', textAlign: 'center' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: "'Cinzel',serif", fontSize: '13px', color: GOLD, letterSpacing: '.2em', marginBottom: '4px' }}>MENU</div>
        <Btn onClick={() => { setShowMenu(false); openRunLog(); }} sm>View Run Log</Btn>
        <Btn onClick={() => { setShowMenu(false); openAchievements(); }} variant="ghost" sm>Achievements</Btn>
        <Btn onClick={() => { setShowMenu(false); openCompendium(); }} variant="ghost" sm>Compendium</Btn>
        <Btn onClick={() => { setShowMenu(false); newRun(); }} variant="ghost" sm>Restart Run</Btn>
        <Btn onClick={() => { setShowMenu(false); setPhase('title'); }} variant="red" sm>Quit to Title</Btn>
        <button onClick={() => setShowMenu(false)}
          style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer',
            fontSize: '11px', fontFamily: "'Cinzel',serif", letterSpacing: '.12em', marginTop: '4px' }}>
          CLOSE
        </button>
      </div>
    </div>
  ) : null;


  const AchievementToastLayer = achievementPops.length ? (
    <div style={{ position: 'fixed', top: '18px', right: '18px', zIndex: 500,
      display: 'flex', flexDirection: 'column', gap: '8px', pointerEvents: 'none', maxWidth: '300px' }}>
      {achievementPops.map(pop => (
        <div key={pop.id} className="achievementToast" style={{
          padding: '10px 12px', borderRadius: '10px',
          background: 'linear-gradient(135deg, rgba(201,168,76,.22), rgba(0,0,0,.82))',
          border: '1px solid rgba(201,168,76,.42)', boxShadow: '0 10px 30px rgba(0,0,0,.45)',
          color: '#f8e9bd', textAlign: 'left',
        }}>
          <div style={{ fontSize: '9px', letterSpacing: '.22em', color: GOLD, fontFamily: "'Cinzel',serif", marginBottom: '3px' }}>
            ACHIEVEMENT UNLOCKED
          </div>
          <div style={{ fontFamily: "'Cinzel',serif", fontSize: '13px', color: '#fff3c4', fontWeight: 700 }}>
            {pop.name}
          </div>
          {pop.detail && <div style={{ fontSize: '11px', color: '#9b8a68', marginTop: '3px' }}>{pop.detail}</div>}
        </div>
      ))}
    </div>
  ) : null;

  // ─── Header ──────────────────────────────────────────────────────
  const PAGE: React.CSSProperties = {
    minHeight: '100vh',
    background: 'radial-gradient(ellipse at 50% 20%, #1a3520 0%, #0e200f 50%, #060e07 100%)',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    fontFamily: 'Georgia,serif', color: '#e8d8b4',
    overflow: 'hidden', position: 'relative',
  };
  // ─── Second Chance overlay ────────────────────────────────────────
  const SCOverlay = scFlash ? (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 500, pointerEvents: 'none',
      background: 'radial-gradient(ellipse at center, rgba(244,114,182,.3) 0%, rgba(0,0,0,.9) 100%)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      animation: 'scFlash 2.8s ease forwards',
    }}>
      <div style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: 'clamp(1.6rem,5vw,2.4rem)',
        color: '#f472b6', textShadow: '0 0 30px #f472b6', letterSpacing: '.1em' }}>
        SECOND CHANCE
      </div>
    </div>
  ) : null;

  // Toast
  const Toast = toast ? (
    <div style={{
      position: 'fixed', bottom: '22px', left: '50%', transform: 'translateX(-50%)',
      background: 'rgba(5,12,6,.97)', border: `1px solid ${GOLD}`, borderRadius: '6px',
      padding: '8px 18px', fontSize: '12px', color: '#e8d8b4', zIndex: 999,
      whiteSpace: 'nowrap', pointerEvents: 'none', animation: 'fadeUp .22s ease',
    }}>{toast}</div>
  ) : null;

  // ─────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────

  // ── TITLE + SETUP ────────────────────────────────────────────────
  if (phase === 'title') return (
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
        {/* Mode tabs */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '10px' }}>
          {GAME_MODES.map(m => (
            <button key={m.id} onClick={() => setSelectedGameMode(m.id)}
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
        {/* Showdown checkbox */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
          marginBottom: '1.4rem', cursor: 'pointer' }}
          onClick={() => setShowdownSelected(s => !s)}>
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
        {/* Build / Character selection */}
        <div style={{ marginBottom: '1.6rem' }}>
          <div style={{ fontSize: '9px', letterSpacing: '.28em', color: DIM, fontFamily: "'Cinzel',serif", marginBottom: '8px' }}>BUILD</div>
          <div style={{ display: 'flex', gap: '7px', justifyContent: 'center', flexWrap: 'wrap' }}>
            {CHARACTERS.map(c => (
              <button key={c.id} onClick={() => setSelectedChar(c.id)}
                style={{ padding: '9px 11px', borderRadius: '8px', cursor: 'pointer', transition: 'all .15s ease',
                  width: '145px', textAlign: 'left',
                  background: selectedChar === c.id ? 'rgba(201,168,76,.1)' : 'rgba(0,0,0,.3)',
                  border: `1px solid ${selectedChar === c.id ? GOLD : 'rgba(255,255,255,.07)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
                  <span style={{ fontSize: '12px', fontFamily: "'Cinzel',serif", fontWeight: 600, color: selectedChar === c.id ? GOLD : '#e8d8b4' }}>{c.name}</span>
                  <span style={{ fontSize: '9px', color: DIM }}>{c.title}</span>
                </div>
                <div style={{ display: 'flex', gap: '7px', fontSize: '10px', color: DIM, marginBottom: '3px' }}>
                  <span>{'\u2665'.repeat(c.startLives)}{'\u2661'.repeat(2 - c.startLives)}</span>
                  <span>${c.startMoney}</span>
                </div>
                <div style={{ fontSize: '10px', color: '#5a4e38', lineHeight: 1.4 }}>{c.perk}</div>
              </button>
            ))}
          </div>
        </div>
        <div style={{ width: '160px', height: '1px', margin: '0 auto 1.4rem', background: `linear-gradient(90deg,transparent,${GOLD},transparent)` }}/>
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Btn onClick={newRun}>DEAL IN</Btn>
          {hasResumeSave && <Btn onClick={loadActiveRun} variant="ghost">CONTINUE</Btn>}
          <input ref={saveImportRef} type="file" accept="application/json" style={{ display: 'none' }}
            onChange={e => importActiveRunSave(e.currentTarget.files?.[0] ?? null)} />
        </div>
        {hasResumeSave && resumeSummary && (
          <div style={{ marginTop: '8px', fontSize: '11px', color: '#5a4e38', fontFamily: "'EB Garamond',serif", fontStyle: 'italic' }}>
            Saved run: {resumeSummary}
          </div>
        )}
        <div style={{ marginTop: '1rem', display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {playerData && (
            <button onClick={openRunLog}
              style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer',
                fontSize: '12px', fontFamily: "'Cinzel',serif", letterSpacing: '.15em', textDecoration: 'underline' }}>
              RUN HISTORY ({playerData.runs.length})
            </button>
          )}
          <button onClick={openAchievements}
            style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer',
              fontSize: '12px', fontFamily: "'Cinzel',serif", letterSpacing: '.15em', textDecoration: 'underline' }}>
            ACHIEVEMENTS
          </button>
          <button onClick={openCompendium}
            style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer',
              fontSize: '12px', fontFamily: "'Cinzel',serif", letterSpacing: '.15em', textDecoration: 'underline' }}>
            COMPENDIUM
          </button>
          {hasResumeSave && (
            <button onClick={exportActiveRunSave}
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
          Card Mode · Alphabet Mode · 14 Artifacts · 8 Trinkets · 4 Builds
        </p>
      </div>
    </div>
  );

  // ── BOSS INTRO ───────────────────────────────────────────────────
  if (phase === 'boss_intro') {
    const acts = gameMode === 'alphabet' ? LETTER_ACTS : ACTS;
    const actForBoss = gameMode === 'alphabet' ? acts[Math.min(actIdx, acts.length - 1)] : getCardAct(actIdx);
    const boss = actForBoss.boss;
    return (
      <div style={{ ...PAGE, justifyContent: 'center' }}>
        <style>{CSS}</style>
        <div className="pop" style={{ textAlign: 'center', padding: '2rem 1.5rem', maxWidth: '420px',
          width: 'calc(100% - 2rem)', border: '1px solid rgba(201,168,76,.22)', borderRadius: '12px',
          background: 'rgba(0,0,0,.32)' }}>
          <div style={{ fontSize: '10px', letterSpacing: '.32em', color: DIM, marginBottom: '.8rem', fontFamily: "'Cinzel',serif" }}>
            {boss.label}
          </div>
          <h2 style={{ fontFamily: "'Cinzel',serif", fontSize: '1.8rem', color: GOLD, margin: '0 0 .5rem', fontWeight: 600 }}>
            {boss.name}
          </h2>
          <p style={{ fontFamily: "'EB Garamond',serif", fontStyle: 'italic', fontSize: '1rem', color: DIM, margin: '0 0 1.4rem', lineHeight: 1.55 }}>
            {boss.flavor}
          </p>
          <div style={{ border: '1px solid rgba(201,168,76,.14)', borderRadius: '8px',
            padding: '14px', margin: '0 0 1rem', fontSize: '14px', lineHeight: 1.65, color: '#b8a890' }}>
            {boss.desc}
          </div>
          <div style={{ display: 'flex', gap: '20px', justifyContent: 'center', padding: '10px 16px',
            background: 'rgba(0,0,0,.3)', borderRadius: '8px', border: '1px solid rgba(201,168,76,.1)',
            marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '8px', letterSpacing: '.2em', color: '#3a3a3a', fontFamily: "'Cinzel',serif", marginBottom: '3px' }}>TARGET — SET BY THE HOUSE</div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: GOLD, fontFamily: "'Cinzel',serif", lineHeight: 1 }}>{boss.target}</div>
              <div style={{ fontSize: '9px', color: '#3a3a3a', marginTop: '2px' }}>not random — same every run</div>
            </div>
            <div style={{ width: '1px', background: 'rgba(255,255,255,.06)', alignSelf: 'stretch' }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '8px', letterSpacing: '.2em', color: '#3a3a3a', fontFamily: "'Cinzel',serif", marginBottom: '3px' }}>BOSS MODIFIER</div>
              <div style={{ fontSize: '13px', color: '#f87171', fontFamily: "'Cinzel',serif", fontWeight: 600 }}>{boss.name}</div>
              <div style={{ fontSize: '9px', color: '#3a3a3a', marginTop: '2px' }}>added on top of normal rules</div>
            </div>
          </div>
          <Btn onClick={() => gameMode === 'alphabet' ? beginLetterTable(actIdx, 0, true) : beginTable(actIdx, 0, true)}>FACE THE DEALER</Btn>
        </div>
      </div>
    );
  }

  // ── TABLE / DEALER — ALPHABET MODE ──────────────────────────────
  if ((phase === 'table' || phase === 'dealer') && gameMode === 'alphabet') {
    const isD   = phase === 'dealer';
    const act   = LETTER_ACTS[Math.min(actIdx, LETTER_ACTS.length - 1)];
    const tData = isBoss ? act.boss : act.tables[Math.min(tableIdx, act.tables.length - 1)];
    const lv    = letterHandValue(playerLetters);
    const word  = findBestWord(playerLetters, WORD_SET, minWordLength);
    const dLv   = letterHandValue(dealerLetters);
    const canPull   = !isD && !letterPullOptions;
    const canStand  = !isD && playerLetters.length > 0 && !letterPullOptions;
    const canRedraw = !isD && redraws > 0 && !!letterPullOptions;
    const isWordClear   = !!word && lv > target;
    const isPerfectClear = !!word && lv === target;
    const standLabel = isPerfectClear ? 'PERFECT ✦' : isWordClear ? 'WORD CLEAR' : 'STAND';

    return (
      <div style={{ ...PAGE, justifyContent: 'flex-start', width: '100%' }}>
        <style>{CSS}</style>
        {SCOverlay}{Toast}{QuickMenu}{AchievementToastLayer}
        <TriggerLayer triggers={triggers} />
        <div className="hr-wrap">
          <GameHeader money={money} nickname={nickname} onOpenMenu={() => setShowMenu(true)}
            lives={lives} heartBreakIdx={heartBreakIdx} actIdx={actIdx} tableIdx={tableIdx}
            isBoss={isBoss} dealerName={dealerName} dealerRank={dealerRank} ledgerTotal={houseLedger.total} />
          {/* Run tracker for letter acts */}
          <div style={{ width: '100%', padding: '6px 16px 8px', borderBottom: '1px solid rgba(255,255,255,.04)', background: 'rgba(0,0,0,.1)' }}>
            <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap', fontSize: '11px', fontFamily: "'Cinzel',serif", letterSpacing: '.1em' }}>
              <span style={{ color: '#7a6a4a', marginRight: '2px' }}>{act.name}</span>
              {act.tables.map((_, i) => {
                const done = isBoss || i < tableIdx;
                const curr = !isBoss && i === tableIdx;
                return (
                  <React.Fragment key={i}>
                    {i > 0 && <span style={{ color: '#3a3a3a' }}>›</span>}
                    <span style={{ padding: '2px 7px', borderRadius: '4px',
                      background: curr ? 'rgba(201,168,76,.18)' : 'transparent',
                      border: `1px solid ${curr ? '#c9a84c' : done ? '#3a5a3a' : '#2a2a2a'}`,
                      color: curr ? '#c9a84c' : done ? '#4a7a4a' : '#5a4e38' }}>
                      {done ? '✓' : curr ? '●' : '○'}
                    </span>
                  </React.Fragment>
                );
              })}
              <span style={{ color: '#3a3a3a' }}>›</span>
              <span style={{ padding: '2px 7px', borderRadius: '4px',
                background: isBoss ? 'rgba(220,38,38,.18)' : 'transparent',
                border: `1px solid ${isBoss ? '#dc2626' : '#2a2a2a'}`,
                color: isBoss ? '#f87171' : '#5a4e38' }}>☠</span>
            </div>
          </div>

          <div className="hr-body">
            <div className="hr-main">
              {/* Dealer tiles */}
              <div style={{ padding: '14px', background: 'rgba(0,0,0,.22)', borderRadius: '10px', border: '1px solid rgba(201,168,76,.1)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div>
                <div style={{ fontSize: '9px', letterSpacing: '.26em', color: DIM, fontFamily: "'Cinzel',serif" }}>DEALER</div>
                <div style={{ fontSize: '11px', color: GOLD, fontFamily: "'Cinzel',serif", marginTop: '2px' }}>{dealerName}</div>
              </div>
                  {!dealerHidden && <div style={{ fontSize: '15px', fontWeight: 600, fontFamily: "'Cinzel',serif",
                    color: dLv > target ? '#ef4444' : '#e8d8b4' }}>{dLv}{dLv > target ? ' BUST' : ''}</div>}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '72px', alignItems: 'flex-start' }}>
                  {dealerLetters.map((t, i) => (
                    <div key={t.id} className="deal" style={{ animationDelay: `${i * .07}s` }}>
                      <LetterCard tile={t} faceDown={i === 1 && dealerHidden} sm />
                    </div>
                  ))}
                  {showdownEnabled && letterShowdownPile.length > 0 && (
                    <>
                      <div style={{ width: '1px', background: 'rgba(255,255,255,.1)', margin: '0 2px' }} />
                      {letterShowdownPile.map((t, i) => (
                        <div key={t.id} className="deal" style={{ position: 'relative' }}>
                          <LetterCard tile={t} faceDown sm />
                          {i === letterShowdownPile.length - 1 && (
                            <div style={{ position: 'absolute', top: -3, right: -3, background: '#1a3556', borderRadius: '50%',
                              width: '14px', height: '14px', fontSize: '9px', color: '#67e8f9',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #3a6090', fontFamily: "'Cinzel',serif" }}>
                              {letterShowdownPile.length}
                            </div>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                  {isD && <span style={{ fontSize: '12px', color: DIM, fontStyle: 'italic', display: 'flex', alignItems: 'center', paddingLeft: '6px' }}>thinking…</span>}
                </div>

                {dealerReserveLetter && !isD && (
                  <div style={{ marginTop: '8px', padding: '7px 8px', borderRadius: '8px',
                    background: 'rgba(103,232,249,.05)', border: '1px solid rgba(103,232,249,.16)',
                    display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '8px', letterSpacing: '.2em', color: '#67e8f9', fontFamily: "'Cinzel',serif" }}>DEALER RESERVE</div>
                      <div style={{ fontSize: '9px', color: '#5a4e38', fontFamily: "'EB Garamond',serif" }}>A static side tile the dealer may use first.</div>
                    </div>
                    <LetterCard tile={dealerReserveLetter} sm bannedLetter={bannedLetter} />
                  </div>
                )}

                {/* Letter dealer preview pool */}
                {ltDealerPreviewPool.length > 0 && !isD && (() => {
                  const previewSeq = ltDealerPreviewPool.map(t => t.letter);
                  const previewWord = findWordInSequence(
                    [...dealerLetters.map(t => t.letter), ...previewSeq],
                    WORD_SET, minWordLength
                  );
                  return (
                    <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,.05)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                        <span style={{ fontSize: '8px', letterSpacing: '.22em', color: redactPending ? '#f87171' : '#4a4035', fontFamily: "'Cinzel',serif" }}>
                          {redactPending ? 'REDACT — CLICK A TILE TO REMOVE' : `ALL ${ltDealerPreviewPool.length} DEALER DRAW TILES`}
                        </span>
                        {previewWord && !redactPending && (
                          <span style={{ fontSize: '10px', color: '#ef4444', fontFamily: "'Cinzel',serif" }}>
                            ⚠ could form &quot;{previewWord.word}&quot;
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                        {ltDealerPreviewPool.map((t, i) => (
                          <div key={t.id} style={{ position: 'relative', cursor: redactPending ? 'pointer' : 'default' }}
                            onClick={() => {
                              if (!redactPending) return;
                              setLtDealerPreviewPool(p => p.filter(x => x.id !== t.id));
                              setRedactPending(false);
                              addTrigger(`✂ Redacted: ${t.letter}(${t.value})`, '#f87171');
                            }}>
                            <LetterCard tile={t} sm bannedLetter={bannedLetter} />
                            {/* Draw-order number badge — matches card mode pool style */}
                            {!redactPending && (
                              <div style={{ position: 'absolute', bottom: '2px', left: '50%',
                                transform: 'translateX(-50%)',
                                fontSize: '8px', color: '#c9a84c', fontFamily: "'Cinzel',serif",
                                fontWeight: 700, lineHeight: 1, pointerEvents: 'none' }}>
                                {i + 1}
                              </div>
                            )}
                            {redactPending && (
                              <div style={{ position: 'absolute', inset: 0, borderRadius: '7px',
                                background: 'rgba(239,68,68,.2)', display: 'flex', alignItems: 'center',
                                justifyContent: 'center', fontSize: '18px', color: '#ef4444' }}>✕</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Target + boss modifiers */}
              <div style={{ textAlign: 'center', padding: '10px 12px' }}>
                <div style={{ fontSize: '9px', letterSpacing: '.3em', color: DIM, fontFamily: "'Cinzel',serif", marginBottom: '3px' }}>TARGET</div>
                <div className="glow" style={{ fontFamily: "'Cinzel',serif", fontSize: '52px', fontWeight: 600,
                  color: GOLD, lineHeight: 1, textShadow: '0 0 22px rgba(201,168,76,.28)',
                  animation: targetAnim ? 'targetBump .4s ease' : 'glowPulse 3s ease infinite' }}>
                  {target}
                </div>
                {bannedLetter && (
                  <div style={{ marginTop: '8px', padding: '6px 14px', display: 'inline-block',
                    background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.4)', borderRadius: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#ef4444', fontFamily: "'Cinzel',serif", letterSpacing: '.08em' }}>
                      ⚠ THE CENSOR — &quot;{bannedLetter}&quot; is BANNED
                    </span>
                  </div>
                )}
                {minWordLength > 3 && (
                  <div style={{ marginTop: '8px', padding: '6px 14px', display: 'inline-block',
                    background: 'rgba(251,146,60,.1)', border: '1px solid rgba(251,146,60,.4)', borderRadius: '6px' }}>
                    <span style={{ fontSize: '12px', color: '#fb923c', fontFamily: "'Cinzel',serif", letterSpacing: '.08em' }}>
                      ⚠ THE EDITOR — words must be {minWordLength}+ letters
                    </span>
                  </div>
                )}
              </div>

              {/* Player tiles + word status */}
              <div style={{ padding: '14px', background: 'rgba(12,36,12,.4)', borderRadius: '10px', border: '1px solid rgba(201,168,76,.16)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                  <div style={{ fontSize: '9px', letterSpacing: '.26em', color: DIM, fontFamily: "'Cinzel',serif" }}>YOU</div>
                  {playerLetters.length > 0 && (
                    <div className={pvAnim === 'up' ? 'pvUp' : pvAnim === 'down' ? 'pvDown' : pvAnim === 'perfect' ? 'pvPerfect' : ''}
                      style={{ fontSize: '15px', fontWeight: 600, fontFamily: "'Cinzel',serif",
                        color: lv > target ? (word ? '#22c55e' : '#ef4444') : lv === target ? GOLD : '#e8d8b4' }}>
                      {lv}{lv === target ? ' ✦' : ''}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '72px', alignItems: 'flex-start' }}>
                  {playerLetters.map((t, i) => (
                    <div key={t.id} className="deal" style={{ animationDelay: `${i * .06}s` }}>
                      <LetterCard tile={t} sm dimmed={result === 'bust'} bannedLetter={bannedLetter} />
                    </div>
                  ))}
                  {!playerLetters.length && <span style={{ color: '#4a4035', fontSize: '13px', fontStyle: 'italic', display: 'flex', alignItems: 'center', paddingTop: '18px' }}>Pull to build your hand…</span>}
                </div>
                {letterReserve && (
                  <div style={{ marginTop: '9px', padding: '8px 10px', borderRadius: '8px',
                    background: 'rgba(103,232,249,.06)', border: '1px solid rgba(103,232,249,.18)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px' }}>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: '8px', letterSpacing: '.22em', color: '#67e8f9', fontFamily: "'Cinzel',serif" }}>RESERVE LETTER</div>
                      <div style={{ fontSize: '10px', color: '#5a4e38', fontFamily: "'EB Garamond',serif" }}>
                        Use it instead of a normal Pull. If unused, it stays.
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                      <LetterCard tile={letterReserve} sm onClick={() => useLetterReserve()} bright bannedLetter={bannedLetter} /> {/* always bright — playable any time */}
                      <div style={{ fontSize: '10px', color: bannedLetter === letterReserve.letter ? '#ef4444' : GOLD }}>
                        {bannedLetter === letterReserve.letter ? 'banned' : `+${letterReserve.value}`}
                      </div>
                    </div>
                  </div>
                )}
                <WordStatusPanel hand={playerLetters} target={target} minWordLength={minWordLength} wordSet={WORD_SET} />
              </div>

              {/* Letter pull options */}
              {letterPullOptions && (
                <div style={{ padding: '14px', borderRadius: '10px', border: '1px solid rgba(201,168,76,.28)', background: 'rgba(0,0,0,.28)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <div style={{ fontSize: '9px', letterSpacing: '.24em', color: DIM, fontFamily: "'Cinzel',serif" }}>CHOOSE ONE</div>
                    {canRedraw && (
                      <button onClick={doLetterRedraw}
                        style={{ fontSize: '11px', color: '#67e8f9', background: 'rgba(103,232,249,.1)',
                          border: '1px solid rgba(103,232,249,.3)', borderRadius: '4px', padding: '3px 8px',
                          cursor: 'pointer', fontFamily: "'Cinzel',serif", letterSpacing: '.12em' }}>
                        REDRAW ({redraws})
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    {letterPullOptions.map(t => {
                      const newLetters = [...playerLetters, t];
                      const newLv      = letterHandValue(newLetters);
                      const newWord    = findBestWord(newLetters, WORD_SET, minWordLength);
                      const delta      = newLv - lv;
                      const isBust     = newLv > target;
                      const isPfct     = newLv === target;
                      const sign       = delta >= 0 ? '+' : '';
                      const isBanned   = bannedLetter === t.letter;
                      return (
                        <div key={t.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                          <LetterCard tile={t} onClick={() => !isBanned && pickLetter(t)} bright={!isBanned} bannedLetter={bannedLetter} />
                          <div style={{ textAlign: 'center', maxWidth: '80px', lineHeight: 1.45 }}>
                            {isBanned ? (
                              <div style={{ fontSize: '10px', color: '#ef4444' }}>banned</div>
                            ) : (
                              <>
                                <div style={{ fontSize: '10px', color: isBust && !newWord ? '#ef4444' : isPfct ? GOLD : '#22c55e', fontWeight: 600 }}>
                                  {sign}{delta} → {isBust && !newWord ? 'BUST' : isPfct ? `${newLv} ✦` : newLv}
                                </div>
                                {newWord && (
                                  <div style={{ fontSize: '9px', color: isBust ? '#22c55e' : '#7a6a4a' }}>
                                    {newWord} {isBust ? '↑ SAVE' : ''}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Artifacts + Trinkets */}
              {artifacts.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', paddingTop: '2px' }}>
                  {artifacts.map(a => <ArtifactBadge key={a.id} art={a} pulsing={pulsingIds.has(a.id)} />)}
                </div>
              )}
              <TrinketBar trinkets={trinkets} onUse={useTrinket} canUse={!isD && !letterPullOptions} showdownEnabled={showdownEnabled} />
            </div>

            <div className="hr-sidebar">
              <EffectsPanel artifacts={artifacts} queenSavesLeft={0} jackActive={false} jackPeeks={[]}
                contrarianStacks={0} contrarianUsesLeft={0} crookedPawnRank={null} royalEchoUsesLeft={0} titheFree={false}
                houseRule={null} target={target} isBoss={isBoss} actIdx={actIdx} tableIdx={tableIdx} />
            </div>
          </div>

          <div className="hr-actbar">
            {!isD && <>
              <Btn onClick={doLetterPull} disabled={!canPull}>PULL</Btn>
              <Btn onClick={doLetterStand} disabled={!canStand} variant={isWordClear || isPerfectClear ? 'gold' : 'ghost'}>
                {standLabel}
              </Btn>
            </>}
            {isD && <div style={{ fontSize: '10px', color: DIM, letterSpacing: '.22em', fontFamily: "'Cinzel',serif" }}>DEALER IS PLAYING…</div>}
          </div>
        </div>
      </div>
    );
  }

  // ── TABLE / DEALER — CARD MODE ────────────────────────────────────
  if (phase === 'table' || phase === 'dealer') {
    const isD = phase === 'dealer';
    const canPull = !isD && !pullOptions && !kingPending && !acePending;
    const canStand = !isD && playerHand.length > 0 && !pullOptions && !kingPending && !acePending;
    const canRedraw = !isD && redraws > 0 && !!pullOptions;

    return (
      <div style={{ ...PAGE, justifyContent: 'flex-start', width: '100%' }}>
        <style>{CSS}</style>
        {SCOverlay}{Toast}{QuickMenu}{AchievementToastLayer}
        <TriggerLayer triggers={triggers} />

        <div className="hr-wrap">
          <GameHeader money={money} nickname={nickname} onOpenMenu={() => setShowMenu(true)}
            lives={lives} heartBreakIdx={heartBreakIdx} actIdx={actIdx} tableIdx={tableIdx}
            isBoss={isBoss} dealerName={dealerName} dealerRank={dealerRank} ledgerTotal={houseLedger.total} />
          <div className="hr-body">
            <div className="hr-main">

          {/* Dealer */}
          <div style={{ padding: '14px', background: 'rgba(0,0,0,.22)', borderRadius: '10px', border: '1px solid rgba(201,168,76,.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div>
                <div style={{ fontSize: '9px', letterSpacing: '.26em', color: DIM, fontFamily: "'Cinzel',serif" }}>DEALER</div>
                <div style={{ fontSize: '11px', color: GOLD, fontFamily: "'Cinzel',serif", marginTop: '2px' }}>{dealerName}</div>
              </div>
              {!dealerHidden && (
                <div style={{ fontSize: '15px', fontWeight: 600, fontFamily: "'Cinzel',serif",
                  color: dv > target ? '#ef4444' : '#e8d8b4' }}>{dv}{dv > target ? ' BUST' : ''}</div>
              )}
            </div>
            {renderDealerQueue()}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '72px', alignItems: 'flex-start' }}>
              {dealerHidden ? (
                <div className="deal" style={{ position: 'relative' }}>
                  <PlayingCard card={dealerHand[0] ?? { rank: 'A', suit: '♠', value: 11, red: false, id: 'dealer-hole-placeholder' }} faceDown sm />
                  <div style={{ marginTop: '4px', fontSize: '9px', color: '#3a3a3a', fontFamily: "'EB Garamond',serif", textAlign: 'center' }}>
                    hole card
                  </div>
                </div>
              ) : dealerHand.map((c, i) => (
                <div key={c.id} className="deal" style={{ animationDelay: `${i * .07}s` }}>
                  <PlayingCard card={c} sm />
                </div>
              ))}
              {/* Showdown pile — dealer's accumulated face-down draws */}
              {showdownEnabled && showdownPile.length > 0 && (
                <>
                  <div style={{ width: '1px', background: 'rgba(255,255,255,.1)', margin: '0 2px' }} />
                  {showdownPile.map((c, i) => (
                    <div key={c.id} className="deal" style={{ animationDelay: `${i * .05}s`, position: 'relative' }}>
                      <PlayingCard card={c} faceDown sm />
                      {i === showdownPile.length - 1 && (
                        <div style={{ position: 'absolute', top: -3, right: -3, background: '#1a3556',
                          borderRadius: '50%', width: '14px', height: '14px', fontSize: '9px',
                          color: '#67e8f9', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          border: '1px solid #3a6090', fontFamily: "'Cinzel',serif" }}>
                          {showdownPile.length}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
              {isD && <span style={{ fontSize: '12px', color: DIM, fontStyle: 'italic', display: 'flex', alignItems: 'center', paddingLeft: '6px' }}>thinking…</span>}
            </div>
            {dealerArtifacts.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                {dealerArtifacts.map(a => {
                  const def = ARTIFACT_DEFS[a.id];
                  return <span key={`${a.id}_${a.stacks}`} title={def.name} style={{ fontSize: '10px', color: def.color, border: `1px solid ${def.color}55`, borderRadius: '999px', padding: '2px 6px', background: 'rgba(0,0,0,.25)', cursor: 'help' }}>
                    {def.name} {toRomanNumeral(a.stacks)}
                  </span>;
                })}
              </div>
            )}

          </div>

          {dealerDecisionLog.length > 0 && (
            <div style={{ marginTop: '8px', padding: '8px 10px', borderRadius: '8px', background: 'rgba(0,0,0,.22)', border: '1px solid rgba(255,255,255,.06)' }}>
              <div style={{ fontSize: '8px', letterSpacing: '.22em', color: DIM, fontFamily: "'Cinzel',serif", marginBottom: '4px' }}>DEALER CHOICE LOG</div>
              {dealerDecisionLog.slice(-4).map((d, idx) => (
                <div key={`${d.chosen.id}_${idx}`} style={{ fontSize: '10px', color: '#8a7a6a', marginBottom: '2px' }}>
                  {d.pair.map(c => `${c.rank}${c.suit}`).join(' / ')} → <span style={{ color: '#e8d8b4' }}>{d.chosen.rank}{d.chosen.suit}</span>
                  {d.credit.reasons[0] ? <span style={{ color: DIM }}> · {d.credit.reasons[0]}</span> : null}
                </div>
              ))}
            </div>
          )}

          {/* Target + house rule banner */}
          <div style={{ textAlign: 'center', padding: '10px 12px' }}>
            <div style={{ fontSize: '9px', letterSpacing: '.3em', color: DIM, fontFamily: "'Cinzel',serif", marginBottom: '3px' }}>TARGET</div>
            <div className="glow" style={{ fontFamily: "'Cinzel',serif", fontSize: '52px', fontWeight: 600,
              color: GOLD, lineHeight: 1, textShadow: '0 0 22px rgba(201,168,76,.28)',
              animation: targetAnim ? 'targetBump .4s ease' : 'glowPulse 3s ease infinite' }}>
              {target}
            </div>
            {/* Boss rule — prominent banner */}
            {houseRule === 'hidden_hand' && (
              <div style={{ marginTop: '10px', padding: '8px 14px', background: 'rgba(251,146,60,.12)',
                border: '1.5px solid rgba(251,146,60,.5)', borderRadius: '8px', display: 'inline-block', textAlign: 'left' }}>
                <div style={{ fontSize: '8px', letterSpacing: '.2em', color: '#7c3406', fontFamily: "'Cinzel',serif", marginBottom: '2px' }}>
                  ☠ BOSS RULE
                </div>
                <div style={{ fontSize: '12px', color: '#fb923c', fontFamily: "'Cinzel',serif", fontWeight: 600 }}>Hidden Hand</div>
                <div style={{ fontSize: '10px', color: '#7c3406', marginTop: '2px' }}>Your last pull option is face-down. Choose blind.</div>
              </div>
            )}
            {houseRule === 'exact_only' && (
              <div style={{ marginTop: '10px', padding: '8px 14px', background: 'rgba(239,68,68,.12)',
                border: '1.5px solid rgba(239,68,68,.55)', borderRadius: '8px', display: 'inline-block', textAlign: 'left' }}>
                <div style={{ fontSize: '8px', letterSpacing: '.2em', color: '#7f1d1d', fontFamily: "'Cinzel',serif", marginBottom: '2px' }}>
                  ☠ BOSS RULE
                </div>
                <div style={{ fontSize: '12px', color: '#f87171', fontFamily: "'Cinzel',serif", fontWeight: 600 }}>Exact Only — must hit {target} precisely</div>
                <div style={{ fontSize: '10px', color: '#7f1d1d', marginTop: '2px' }}>Going over or stopping short both count as a loss.</div>
              </div>
            )}
            {houseRule === 'pit_boss' && (
              <div style={{ marginTop: '10px', padding: '8px 14px', background: 'rgba(127,29,29,.16)',
                border: '1.5px solid rgba(239,68,68,.6)', borderRadius: '8px', display: 'inline-block', textAlign: 'left' }}>
                <div style={{ fontSize: '8px', letterSpacing: '.2em', color: '#991b1b', fontFamily: "'Cinzel',serif", marginBottom: '2px' }}>
                  ☠ PIT BOSS · PHASE {pitBossPhase}
                </div>
                <div style={{ fontSize: '12px', color: '#f87171', fontFamily: "'Cinzel',serif", fontWeight: 600 }}>
                  House Lock — artifacts suppressed for the fight
                </div>
                <div style={{ fontSize: '10px', color: '#991b1b', marginTop: '2px' }}>
                  {pitBossPhase === 1 ? 'One number rank is banned for the phase.' : 'The Phase I number ban remains, and one face rank is also banned.'}
                  {(pitBannedRank || pitBannedFaceRank) ? ` Current ban: ${banLabel()}.` : ''}
                </div>
              </div>
            )}
            {houseRule === 'golden_dealer' && (
              <div style={{ marginTop: '10px', padding: '8px 14px', background: 'rgba(245,158,11,.12)',
                border: '1.5px solid rgba(245,158,11,.55)', borderRadius: '8px', display: 'inline-block', textAlign: 'left' }}>
                <div style={{ fontSize: '8px', letterSpacing: '.2em', color: '#92400e', fontFamily: "'Cinzel',serif", marginBottom: '2px' }}>
                  ◆ GOLDEN DEALER · GATE {goldenGate}
                </div>
                <div style={{ fontSize: '12px', color: '#f59e0b', fontFamily: "'Cinzel',serif", fontWeight: 600 }}>
                  Operation Clock: {goldenOperator} · Target {target}
                </div>
                <div style={{ fontSize: '10px', color: '#92400e', marginTop: '2px' }}>
                  First Pull is free. Later Pulls cost $2. Gate II keeps the clock moving and reveals one future dealer pair.
                </div>
              </div>
            )}
          </div>

          {/* Player */}
          <div style={{ padding: '14px', background: 'rgba(12,36,12,.4)', borderRadius: '10px', border: '1px solid rgba(201,168,76,.16)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <div style={{ fontSize: '9px', letterSpacing: '.26em', color: DIM, fontFamily: "'Cinzel',serif" }}>YOU</div>
              {playerHand.length > 0 && (
                <div
                  className={pvAnim === 'up' ? 'pvUp' : pvAnim === 'down' ? 'pvDown' : pvAnim === 'perfect' ? 'pvPerfect' : ''}
                  style={{ fontSize: '15px', fontWeight: 600, fontFamily: "'Cinzel',serif",
                    color: pv > target ? '#ef4444' : pv === target ? GOLD : '#e8d8b4' }}>
                  {pv}{pv === target ? ' ✦' : ''}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', minHeight: '72px', alignItems: 'flex-start' }}>
              {playerHand.map((c, i) => {
                // Tooltip for each hand card showing what it contributed
                const handBefore = playerHand.slice(0, i);
                const valBefore  = handValue(handBefore, target, contrarianStacks, aceLicStacks);
                const valWith    = handValue(playerHand.slice(0, i + 1), target, contrarianStacks, aceLicStacks);
                const contrib    = valWith - valBefore;
                const isOdd      = c.value < 0;
                let tip: React.ReactNode;
                if (c.rank === 'A') {
                  tip = <>Ace counting as <b>{contrib}</b> (auto-optimized)<br/><span style={{color:'#7a6a5a',fontSize:'10px'}}>Adjusts automatically to avoid busting</span></>;
                } else if (c.rank === 'K') {
                  tip = <>King — shifted the target<br/><span style={{color:'#7a6a5a',fontSize:'10px'}}>Use Crown Law artifact to increase the shift</span></>;
                } else if (c.rank === 'Q') {
                  tip = <>Queen — activates bust save<br/><span style={{color:'#7a6a5a',fontSize:'10px'}}>Requires Queen&apos;s Mercy artifact to take effect</span></>;
                } else if (c.rank === 'J') {
                  tip = <>Jack — gives a bonus pull option next draw</>;
                } else if (isOdd) {
                  tip = <><span style={{color:'#ef4444'}}>Subtracting {Math.abs(c.value)}</span><br/><span style={{color:'#7a6a5a',fontSize:'10px'}}>Negative-card effect applied when this card was played.</span></>;
                } else {
                  tip = <>Added <span style={{color:'#22c55e'}}>+{contrib}</span> to your total</>;
                }
                return (
                  <div key={c.id} className="deal" style={{ animationDelay: `${i * .06}s` }}>
                    <PlayingCard card={c} sm dimmed={result === 'bust'} contrarianActive={c.value < 0} tooltip={tip} />
                  </div>
                );
              })}
              {!playerHand.length && <span style={{ color: '#4a4035', fontSize: '13px', display: 'flex', alignItems: 'center', paddingTop: '18px', fontStyle: 'italic' }}>Pull to build your hand…</span>}
            </div>
            <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '3px' }}>
              {queenSavesLeft > 0 && <div style={{ fontSize: '11px', color: '#a855f7' }}>♛ Queen&apos;s Mercy: {queenSavesLeft} save{queenSavesLeft > 1 ? 's' : ''} ready</div>}
              {jackActive && <div style={{ fontSize: '11px', color: '#94a3b8' }}>⚜ Jack — next pull shows 3 cards</div>}
              {jackPeeks.length > 0 && (
                <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '11px', color: '#94a3b8' }}>⦿ Jack&apos;s Tell:</span>
                  {jackPeeks.map(c => <span key={c.id} style={{ fontSize: '11px', color: '#94a3b8' }}>{c.rank}{c.suit}</span>)}
                </div>
              )}
              {contrarianUsesLeft > 0 && (
                <div style={{ fontSize: '11px', color: '#f59e0b' }}>⇄ Contrarian Deck — {contrarianUsesLeft} negative odd card{contrarianUsesLeft === 1 ? '' : 's'} left</div>
              )}
              {crookedPawnRank && (
                <div style={{ fontSize: '11px', color: '#fbbf24' }}>♟ Crooked Pawn — {crookedPawnRank}s subtract this table</div>
              )}
            </div>
          </div>

          {/* Pull options */}
          {pullOptions && (
            <div style={{ padding: '14px', borderRadius: '10px', border: `1px solid ${queenHalvedPull ? 'rgba(168,85,247,.35)' : 'rgba(201,168,76,.28)'}`, background: 'rgba(0,0,0,.28)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: queenHalvedPull ? '4px' : '12px' }}>
                <div style={{ fontSize: '9px', letterSpacing: '.24em', color: DIM, fontFamily: "'Cinzel',serif" }}>CHOOSE ONE</div>
                {canRedraw && (
                  <button onClick={doRedraw}
                    style={{ fontSize: '11px', color: '#67e8f9', background: 'rgba(103,232,249,.1)',
                      border: '1px solid rgba(103,232,249,.3)', borderRadius: '4px', padding: '3px 8px',
                      cursor: 'pointer', fontFamily: "'Cinzel',serif", letterSpacing: '.12em' }}>
                    REDRAW ({redraws})
                  </button>
                )}
              </div>
              {queenHalvedPull && (
                <div style={{ fontSize: '10px', color: '#a855f7', fontFamily: "'Cinzel',serif",
                  letterSpacing: '.06em', marginBottom: '10px', padding: '4px 6px',
                  background: 'rgba(168,85,247,.08)', borderRadius: '4px', border: '1px solid rgba(168,85,247,.2)' }}>
                  ♛ Queen — number cards add half their value this pick
                </div>
              )}
              <div style={{ display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
                {pullOptions.map((c, i) => {
                  const isHid = (houseRule === 'hidden_hand' && !blindfoldActive) && i === pullOptions.length - 1;
                  const isPitBanned = isPitCardBanned(c);
                  if (isHid) return (
                    <div key={c.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', position: 'relative' }}>
                      <PlayingCard card={c} faceDown onClick={isPitBanned ? undefined : () => pickCard(c)} bright={!isPitBanned} dimmed={isPitBanned} />
                      {isPitBanned && <div style={{ position: 'absolute', top: '28px', fontSize: '28px', color: '#ef4444', opacity: .65, pointerEvents: 'none' }}>✕</div>}
                      <div style={{ fontSize: '10px', color: isPitBanned ? '#ef4444' : '#5a4e38', textAlign: 'center', maxWidth: '72px', lineHeight: 1.4 }}>
                        {isPitBanned ? `${c.rank}s banned` : 'hidden — pick blind'}
                      </div>
                    </div>
                  );

                  // Preview current table-scoped effects: Queen halving + negative-card marks.
                  const isNumber = !['J','Q','K','A'].includes(c.rank);
                  const isQueenHalved = (queenHalvedPull || queenEchoHalves > 0) && isNumber;
                  const willContrarian = isNumber && isOddNumberCard(c) && contrarianUsesLeft > 0;
                  const willCrooked = isNumber && !!crookedPawnRank && c.rank === crookedPawnRank;
                  let displayCard = isQueenHalved ? { ...c, value: Math.floor(Math.abs(c.value) / 2) } : c;
                  if (willContrarian || willCrooked) displayCard = { ...displayCard, value: -Math.abs(displayCard.value) };
                  const newV   = handValue([...playerHand, displayCard], target, contrarianStacks, aceLicStacks);
                  const delta  = newV - pv;
                  const isBust = newV > target;
                  const isPfct = newV === target;
                  const isContrarianOdd = willContrarian || willCrooked;

                  // Build the label
                  let labelMain: React.ReactNode;
                  let labelSub:  React.ReactNode;
                  let labelColor = '#b8a890';

                  if (c.rank === 'A') {
                    const aceLicStk = artifactStacks('ace_license', artifacts);
                    const v1  = handValue([...playerHand, { ...c, chosenValue: 1  }], target, contrarianStacks, 0);
                    const v11 = handValue([...playerHand, { ...c, chosenValue: 11 }], target, contrarianStacks, 0);
                    const v7  = aceLicStk >= 2 ? handValue([...playerHand, { ...c, chosenValue: 7 }], target, contrarianStacks, 0) : null;
                    const clr = (v: number) => v > target ? '#ef4444' : v === target ? GOLD : '#22c55e';
                    labelMain = <><span style={{ color: '#f97316', fontWeight: 600 }}>A</span>{' '}<span style={{ color: DIM, fontSize: '9px' }}>choose value</span></>;
                    labelSub  = (
                      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', justifyContent: 'center' }}>
                        <span style={{ color: clr(v1),  fontSize: '9px' }}>1→{v1 > target ? 'BUST' : v1 === target ? `${v1}✦` : v1}</span>
                        {v7 !== null && <span style={{ color: clr(v7), fontSize: '9px' }}>7→{v7 > target ? 'BUST' : v7 === target ? `${v7}✦` : v7}</span>}
                        <span style={{ color: clr(v11), fontSize: '9px' }}>11→{v11 > target ? 'BUST' : v11 === target ? `${v11}✦` : v11}</span>
                      </div>
                    );
                    labelColor = '#f97316';
                  } else if (c.rank === 'J') {
                    const jtEff = getArtifactEffect('jacks_tell', artifacts);
                    const sign  = delta >= 0 ? '+' : '';
                    labelMain = (
                      <>
                        <span style={{ color: isBust ? '#ef4444' : isPfct ? GOLD : '#22c55e', fontWeight: 600 }}>
                          {sign}{delta} → {isBust ? 'BUST' : isPfct ? `${newV} ✦` : newV}
                        </span>
                        {' · '}<span style={{ color: '#94a3b8' }}>bonus pull</span>
                      </>
                    );
                    labelSub  = jtEff?.jackPeeks ? <span style={{ color: '#94a3b8' }}>peek {jtEff.jackPeeks} card{jtEff.jackPeeks > 1 ? 's' : ''}</span> : <>&nbsp;</>;
                    labelColor = '#94a3b8';
                  } else if (c.rank === 'Q') {
                    const qmEff    = getArtifactEffect('queens_mercy', artifacts);
                    const saveReady = qmEff && !qmEff.queenSaveAutomatic && queenSavesLeft === 0;
                    const sign     = delta >= 0 ? '+' : '';
                    labelMain = (
                      <>
                        <span style={{ color: isBust ? '#ef4444' : isPfct ? GOLD : '#22c55e', fontWeight: 600 }}>
                          {sign}{delta} → {isBust ? 'BUST' : isPfct ? `${newV} ✦` : newV}
                        </span>
                        {' · '}<span style={{ color: '#a855f7' }}>{saveReady ? 'bust save' : qmEff ? 'save set' : 'royal'}</span>
                      </>
                    );
                    labelSub  = qmEff ? <span style={{ color: '#7a5580' }}>Queen&apos;s Mercy</span> : <>&nbsp;</>;
                    labelColor = '#a855f7';
                  } else if (c.rank === 'K') {
                    const kRange = getArtifactEffect('crown_law', artifacts)?.kingRange ?? 1;
                    const sign   = delta >= 0 ? '+' : '';
                    labelMain = (
                      <>
                        <span style={{ color: isBust ? '#ef4444' : isPfct ? GOLD : '#22c55e', fontWeight: 600 }}>
                          {sign}{delta} → {isBust ? 'BUST' : isPfct ? `${newV} ✦` : newV}
                        </span>
                        {' · '}<span style={{ color: '#eab308' }}>target ±{kRange}</span>
                      </>
                    );
                    labelSub  = <span style={{ color: '#7a6a30' }}>choose direction</span>;
                    labelColor = '#eab308';
                  } else if (isContrarianOdd) {
                    // Contrarian subtract — amber (not red) because subtraction is tactical, not a bust
                    labelMain = (
                      <span style={{ color: '#f59e0b', fontWeight: 600 }}>
                        −{Math.abs(displayCard.value)} <span style={{ fontSize: '9px', fontWeight: 400, color: '#d97706' }}>{willCrooked ? 'CROOKED' : 'CONTRARIAN'}</span>
                      </span>
                    );
                    labelSub = <>→ <span style={{ color: isBust ? '#ef4444' : '#22c55e', fontWeight: 600 }}>{isBust ? 'BUST' : newV}</span></>;
                    labelColor = '#f59e0b';
                  } else {
                    // Regular number card
                    const sign = delta >= 0 ? '+' : '';
                    labelMain = (
                      <span style={{ color: isBust ? '#ef4444' : isPfct ? GOLD : '#22c55e', fontWeight: 600 }}>
                        {sign}{delta} → {isBust ? 'BUST' : isPfct ? `${newV} ✦` : newV}
                      </span>
                    );
                    labelSub = isBust
                      ? <span style={{ color: '#7a3030', fontSize: '9px' }}>over {target} by {newV - target}</span>
                      : isPfct
                      ? <span style={{ color: '#9a8040', fontSize: '9px' }}>perfect clear</span>
                      : <>&nbsp;</>;
                    labelColor = '#b8a890';
                  }

                  return (
                    <div key={c.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', position: 'relative' }}>
                      <PlayingCard card={c} onClick={isPitBanned ? undefined : () => pickCard(c)} bright={!isPitBanned} dimmed={isPitBanned} contrarianActive={isContrarianOdd} />
                      {isPitBanned && <div style={{ position: 'absolute', top: '32px', fontSize: '34px', color: '#ef4444', opacity: .62, pointerEvents: 'none', fontWeight: 900 }}>✕</div>}
                      <div style={{ textAlign: 'center', maxWidth: '80px', lineHeight: 1.45 }}>
                        <div style={{ fontSize: '10px', color: isPitBanned ? '#ef4444' : labelColor }}>{isPitBanned ? `${c.rank}s banned` : labelMain}</div>
                        <div style={{ fontSize: '10px', color: DIM }}>{isPitBanned ? 'Pit Boss lockout' : labelSub}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* King modal */}
          {kingPending && (
            <div style={{ padding: '14px', borderRadius: '10px', border: `2px solid rgba(201,168,76,.55)`, background: 'rgba(0,0,0,.5)', textAlign: 'center' }}>
              <div style={{ fontSize: '9px', letterSpacing: '.24em', color: DIM, marginBottom: '8px', fontFamily: "'Cinzel',serif" }}>♔ KING EFFECT</div>
              <p style={{ fontSize: '14px', margin: '0 0 14px', color: '#b8a890' }}>
                Change the target by ±{getArtifactEffect('crown_law', artifacts)?.kingRange ?? 1}
              </p>
              <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                <Btn onClick={() => applyKing(-1)} sm>▼ to {target - (getArtifactEffect('crown_law', artifacts)?.kingRange ?? 1)}</Btn>
                <Btn onClick={() => applyKing(1)} sm>▲ to {target + (getArtifactEffect('crown_law', artifacts)?.kingRange ?? 1)}</Btn>
              </div>
            </div>
          )}

          {/* Ace value choice modal */}
          {acePending && (() => {
            const v1  = handValue([...playerHand, { ...acePending, chosenValue: 1  }], target, contrarianStacks, 0);
            const v7  = handValue([...playerHand, { ...acePending, chosenValue: 7  }], target, contrarianStacks, 0);
            const v11 = handValue([...playerHand, { ...acePending, chosenValue: 11 }], target, contrarianStacks, 0);
            const b1  = v1  > target, b7  = v7  > target, b11 = v11 > target;
            const p1  = v1  === target, p7 = v7  === target, p11 = v11 === target;
            const color = (v: number, bust: boolean, perfect: boolean) =>
              bust ? '#ef4444' : perfect ? GOLD : '#22c55e';
            return (
              <div style={{ padding: '14px', borderRadius: '10px', border: '2px solid rgba(249,115,22,.55)', background: 'rgba(0,0,0,.5)', textAlign: 'center' }}>
                <div style={{ fontSize: '9px', letterSpacing: '.24em', color: DIM, marginBottom: '8px', fontFamily: "'Cinzel',serif" }}>♠ ACE VALUE</div>
                <p style={{ fontSize: '13px', margin: '0 0 14px', color: '#b8a890' }}>
                  Choose how this Ace counts.
                </p>
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <Btn onClick={() => chooseAceValue(1)} sm>
                    1 → <span style={{ color: color(v1, b1, p1) }}>{b1 ? 'BUST' : p1 ? `${v1} ✦` : v1}</span>
                  </Btn>
                  {aceLicStacks >= 1 && (
                    <Btn onClick={() => chooseAceValue(7)} sm>
                      7 → <span style={{ color: color(v7, b7, p7) }}>{b7 ? 'BUST' : p7 ? `${v7} ✦` : v7}</span>
                    </Btn>
                  )}
                  <Btn onClick={() => chooseAceValue(11)} sm>
                    11 → <span style={{ color: color(v11, b11, p11) }}>{b11 ? 'BUST' : p11 ? `${v11} ✦` : v11}</span>
                  </Btn>
                </div>
              </div>
            );
          })()}

          {/* Artifacts strip */}
          {artifacts.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', paddingTop: '2px' }}>
              {artifacts.map(a => <ArtifactBadge key={a.id} art={a} pulsing={pulsingIds.has(a.id)} />)}
            </div>
          )}

          {/* Trinkets */}
          <TrinketBar
            trinkets={trinkets}
            onUse={useTrinket}
            canUse={!isD && !pullOptions && !kingPending && !acePending}
            showdownEnabled={showdownEnabled}
          />
            </div>{/* /hr-main */}

            {/* Effects sidebar — desktop only via CSS */}
            <div className="hr-sidebar">
              <EffectsPanel
                artifacts={artifacts}
                queenSavesLeft={queenSavesLeft}
                jackActive={jackActive}
                jackPeeks={jackPeeks}
                contrarianStacks={contrarianStacks}
                contrarianUsesLeft={contrarianUsesLeft}
                crookedPawnRank={crookedPawnRank}
                royalEchoUsesLeft={royalEchoUsesLeft}
                titheFree={titheFree}
                houseRule={houseRule}
                target={target}
                isBoss={isBoss}
                actIdx={actIdx}
                tableIdx={tableIdx}
                pitBossPhase={pitBossPhase}
                pitBannedRank={pitBannedRank}
                pitBannedFaceRank={pitBannedFaceRank}
                goldenRaidActive={goldenRaidActive}
                goldenGate={goldenGate}
                goldenOpIndex={goldenOpIndex}
                goldenChips={goldenChips}
                closingTime={closingTime}
              />
            </div>
          </div>{/* /hr-body */}

          <div className="hr-actbar">
            {!isD && (() => {
              const standPerfect  = pv === target;
              const standApproach = playerHand.length > 0 && !standPerfect && target - pv >= 0 && target - pv <= 4;
              return (
                <>
                  <Btn onClick={doPull} disabled={!canPull}>PULL</Btn>
                  <Btn onClick={doStand} disabled={!canStand}
                    variant={standPerfect ? 'gold' : 'ghost'}
                    pulsing={standApproach}>
                    {standPerfect ? '✦ PERFECT' : 'STAND'}
                  </Btn>
                </>
              );
            })()}
            {isD && <div style={{ fontSize: '10px', color: DIM, letterSpacing: '.22em', fontFamily: "'Cinzel',serif" }}>DEALER IS PLAYING…</div>}
          </div>
        </div>{/* /hr-wrap */}
      </div>
    );
  }

  // ── RESULT ───────────────────────────────────────────────────────
  if (phase === 'result') {
    const win  = result === 'win', bust = result === 'bust', tie = result === 'tie';
    const ac   = win ? '#22c55e' : tie ? '#94a3b8' : '#ef4444';
    const fDV  = handValue(dealerHand, target);
    const fPV  = handValue(playerHand, target, contrarianStacks, aceLicStacks);
    const continueHint = tie
      ? `Overtime: target rises to ${target + 8}; both hands and the dealer queue stay live.`
      : (!win && lives > 0)
        ? (isBoss ? 'Boss loss: lose a heart and repeat this boss fight.' : 'Loss accepted: lose a heart and move to the next table.')
        : null;
    return (
      <div style={{ ...PAGE, justifyContent: 'center' }}>
        <style>{CSS}</style>
        {SCOverlay}{Toast}{QuickMenu}{AchievementToastLayer}
        <TriggerLayer triggers={triggers} />
        <div className="pop" style={{ textAlign: 'center', padding: '2rem 1.5rem', maxWidth: '440px', width: 'calc(100% - 2rem)' }}>
          <div style={{ fontSize: '38px', marginBottom: '8px', lineHeight: 1, color: ac }}>{win ? '✦' : tie ? '↔' : '✕'}</div>
          <h2 style={{ fontFamily: "'Cinzel',serif", fontSize: '1.65rem', fontWeight: 600, color: ac, margin: '0 0 6px' }}>
            {win ? 'YOU WIN' : tie ? 'PUSH' : bust ? 'BUST' : 'DEALER WINS'}
          </h2>
          <p style={{ fontSize: '14px', color: '#b8a890', margin: '0 0 16px', lineHeight: 1.6 }}>{msg}</p>

          {/* Earnings breakdown */}
          {(tableLog.length > 0) && (
            <div style={{ margin: '0 0 16px', padding: '12px', background: 'rgba(0,0,0,.3)',
              borderRadius: '8px', border: '1px solid rgba(201,168,76,.12)', textAlign: 'left' }}>
              {tableLog.map((e, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px',
                  color: e.color ?? '#b8a890', padding: '2px 0' }}>
                  <span>{e.label}</span>
                  {e.amount != null && <span style={{ color: e.amount >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                    {e.amount >= 0 ? '+' : ''}${e.amount}
                  </span>}
                </div>
              ))}
              {tableEarned > 0 && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,.08)', marginTop: '6px', paddingTop: '6px',
                  display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: GOLD, fontWeight: 600 }}>
                  <span>Total earned</span><span>+${tableEarned}</span>
                </div>
              )}
            </div>
          )}

          {/* Hands */}
          <div style={{ display: 'flex', gap: '24px', justifyContent: 'center', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '9px', color: DIM, letterSpacing: '.22em', marginBottom: '6px', fontFamily: "'Cinzel',serif" }}>
                DEALER · {fDV > target ? 'BUST' : fDV}
              </div>
              <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                {dealerHand.map(c => <PlayingCard key={c.id} card={c} sm />)}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '9px', color: DIM, letterSpacing: '.22em', marginBottom: '6px', fontFamily: "'Cinzel',serif" }}>
                YOU · {fPV > target ? 'BUST' : fPV}
              </div>
              <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                {playerHand.map(c => <PlayingCard key={c.id} card={c} sm />)}
              </div>
            </div>
          </div>

          <div style={{ marginBottom: '18px' }}><HeartDisplay lives={lives} breakIdx={heartBreakIdx} /></div>

          {continueHint && (
            <div style={{ margin: '0 auto 16px', padding: '9px 11px', borderRadius: '8px', maxWidth: '340px',
              background: 'rgba(0,0,0,.28)', border: '1px solid rgba(255,255,255,.08)',
              fontSize: '12px', color: '#8a7a6a', lineHeight: 1.45, fontFamily: "'EB Garamond',serif" }}>
              {continueHint}
            </div>
          )}

          {!win && lives <= 0
            ? <Btn onClick={() => finishRun('lose')} variant="red">END RUN</Btn>
            : <Btn onClick={onContinue}>{win ? 'COLLECT REWARD' : tie ? 'OVERTIME' : 'CONTINUE'}</Btn>}
        </div>
      </div>
    );
  }

  // ── REWARD ───────────────────────────────────────────────────────
  if (phase === 'reward') return (
    <div style={{ ...PAGE, justifyContent: 'center' }}>
      <style>{CSS}</style>
      <div className="fade" style={{ textAlign: 'center', padding: '1.5rem 1rem', maxWidth: '520px', width: 'calc(100% - 2rem)' }}>
        <div style={{ fontSize: '10px', letterSpacing: '.3em', color: DIM, marginBottom: '6px', fontFamily: "'Cinzel',serif" }}>
          {isBoss ? 'BOSS REWARD' : 'REWARD'}
        </div>
        <h2 style={{ fontFamily: "'Cinzel',serif", fontSize: '1.55rem', color: GOLD, margin: '0 0 6px', fontWeight: 600 }}>
          Choose an Artifact
        </h2>
        <p style={{ fontSize: '13px', color: DIM, margin: '0 0 22px', fontStyle: 'italic', fontFamily: "'EB Garamond',serif" }}>
          Existing artifacts upgrade to the next tier.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          {rewardPool.map(id => {
            const def = ARTIFACT_DEFS[id];
            const owned = artifacts.find(a => a.id === id);
            const isUpgrade = !!owned;
            const curStacks = owned?.stacks ?? 0;
            const nextStacks = Math.min(curStacks + 1, def.maxStacks);
            const nextEff = artifactEffectAtStacks(id, nextStacks);
            const curEff = owned ? artifactEffectAtStacks(id, curStacks) : null;

            return (
              <button key={id} onClick={() => pickReward(id)}
                style={{ padding: '16px 12px', width: '152px', minHeight: '160px', borderRadius: '10px',
                  cursor: 'pointer', background: 'rgba(0,0,0,.4)', textAlign: 'left',
                  border: isUpgrade ? `1px solid ${def.color}88` : '1px solid rgba(255,255,255,.09)',
                  color: '#e8d8b4', transition: 'all .18s ease', flexShrink: 0,
                  display: 'flex', flexDirection: 'column', gap: '6px' }}
                onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-5px)'; (e.currentTarget as HTMLButtonElement).style.borderColor = def.color; }}
                onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLButtonElement).style.borderColor = isUpgrade ? `${def.color}88` : 'rgba(255,255,255,.09)'; }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <i className={`ti ${def.icon}`} style={{ fontSize: '22px', color: def.color }} aria-hidden />
                  <div style={{ textAlign: 'right' }}>
                    {isUpgrade && (
                      <div style={{ fontSize: '9px', background: def.color, color: '#000', borderRadius: '3px', padding: '1px 5px', fontWeight: 700 }}>
                        UPGRADE
                      </div>
                    )}
                    <div style={{ fontSize: '10px', color: def.color, fontFamily: "'Cinzel',serif', opacity: .8", marginTop: '2px' }}>
                      {isUpgrade ? `${toRomanNumeral(curStacks)} → ${toRomanNumeral(nextStacks)}` : toRomanNumeral(1)}
                    </div>
                  </div>
                </div>
                <div style={{ fontFamily: "'Cinzel',serif", fontSize: '11px', color: def.color, fontWeight: 600, letterSpacing: '.07em' }}>
                  {def.name}
                </div>
                {isUpgrade && curEff && (
                  <div style={{ fontSize: '10px', color: '#5a4e38', lineHeight: 1.4, textDecoration: 'line-through' }}>
                    {curEff.description}
                  </div>
                )}
                <div style={{ fontSize: '10px', color: '#8a7a6a', lineHeight: 1.4 }}>
                  {nextEff?.description ?? 'Maxed out'}
                </div>
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Btn onClick={() => pickReward(null)} variant="ghost" sm>SKIP</Btn>
          {!isBoss && (
            <Btn onClick={enterLastCall} disabled={money < 4 + lastCallVisits * 3} variant="ghost" sm>
              LAST CALL (${4 + lastCallVisits * 3})
            </Btn>
          )}
        </div>
      </div>
    </div>
  );

  // ── SHOP ─────────────────────────────────────────────────────────
  if (phase === 'shop') {
    const artifactItems = shopItems.filter(i => i.type === 'artifact' || i.type === 'upgrade');
    const trinketItems = shopItems.filter(i => i.type === 'trinket');
    const serviceItems = shopItems.filter(i => i.type !== 'artifact' && i.type !== 'upgrade' && i.type !== 'trinket');

    const renderShopItem = (item: ShopItem, compact = false) => {
      const artDef = item.artifactId ? ARTIFACT_DEFS[item.artifactId] : null;
      const trDef = item.trinketId ? TRINKET_DEFS[item.trinketId as TrinketId] : null;
      const itemColor = artDef?.color ?? trDef?.color ?? GOLD;
      const icon = artDef ? <i className={`ti ${artDef.icon}`} style={{ fontSize: '12px', marginRight: '5px' }} aria-hidden /> : trDef ? <span style={{ marginRight: '5px' }}>{trDef.icon}</span> : null;

      return (
        <button key={item.id} onClick={() => buyShopItem(item)} disabled={!item.available}
          style={{
            display: 'flex', justifyContent: 'space-between', alignItems: compact ? 'flex-start' : 'center',
            gap: '10px', padding: compact ? '10px 11px' : '12px 14px', borderRadius: '9px',
            cursor: item.available ? 'pointer' : 'not-allowed', background: 'rgba(0,0,0,.35)', textAlign: 'left',
            border: `1px solid ${item.available ? `${itemColor}55` : 'rgba(255,255,255,.05)'}`,
            opacity: item.available ? 1 : .45, transition: 'all .15s ease', color: '#e8d8b4',
            minHeight: compact ? '68px' : '82px',
          }}
          onMouseEnter={e => item.available && ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,.55)')}
          onMouseLeave={e => ((e.currentTarget as HTMLButtonElement).style.background = 'rgba(0,0,0,.35)')}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: compact ? '12px' : '13px', fontFamily: "'Cinzel',serif", color: itemColor, marginBottom: '3px',
              display: 'flex', alignItems: 'center', gap: '2px' }}>
              {icon}
              <span>{item.label}</span>
            </div>
            <div style={{ fontSize: compact ? '10px' : '11px', color: DIM, lineHeight: 1.38 }}>{item.description}</div>
          </div>
          <div style={{ textAlign: 'right', whiteSpace: 'nowrap', flexShrink: 0 }}>
            <div style={{ fontSize: '14px', fontFamily: "'Cinzel',serif",
              color: item.available ? GOLD : '#4a4035', fontWeight: 600 }}>
              ${item.cost}
              {item.onSale && (
                <span style={{ fontSize: '10px', color: '#4a4035', textDecoration: 'line-through', marginLeft: '5px' }}>
                  ${item.originalCost}
                </span>
              )}
            </div>
            {item.onSale && (
              <div style={{ fontSize: '8px', color: '#f59e0b', letterSpacing: '.1em', fontFamily: "'Cinzel',serif" }}>SALE</div>
            )}
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
                const id = trinkets[idx];
                const def = id ? TRINKET_DEFS[id] : null;
                return (
                  <span key={`shop-pocket-${idx}`} title={def ? `${def.name}: ${def.description}` : 'Empty trinket slot'} style={{
                    width: '28px', height: '28px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    border: `1px solid ${def ? def.color + '88' : 'rgba(255,255,255,.12)'}`, background: def ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.025)',
                    color: def ? def.color : '#3a3a3a', fontSize: '14px', fontWeight: 700,
                  }}>{def ? def.icon : '·'}</span>
                );
              })}
            </div>
          </div>

          {piggyBank && (
            <div style={{ margin: '0 auto 14px', padding: '8px 10px', maxWidth: '420px', borderRadius: '8px',
              background: 'rgba(251,191,36,.08)', border: '1px solid rgba(251,191,36,.25)', color: '#fbbf24', fontSize: '11px' }}>
              ◍ Piggy Bank: ${Math.floor(piggyBank.value)} {piggyBank.cracked ? '(cracked)' : '(growing)'}
              <div style={{ marginTop: '6px' }}>
                <Btn onClick={cashOutPiggyBank} variant="ghost" sm>CASH OUT</Btn>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateRows: 'auto auto', gap: '12px', marginBottom: '16px' }}>
            <section style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '9px', letterSpacing: '.22em', color: DIM, fontFamily: "'Cinzel',serif", marginBottom: '7px' }}>
                ARTIFACTS / UPGRADES
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: '8px' }}>
                {artifactItems.map(i => renderShopItem(i))}
              </div>
            </section>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(175px,1fr))', gap: '10px', alignItems: 'stretch' }}>
              <section style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '9px', letterSpacing: '.22em', color: DIM, fontFamily: "'Cinzel',serif", marginBottom: '7px' }}>
                  TRINKETS
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {trinketItems.length ? trinketItems.map(i => renderShopItem(i, true)) : (
                    <div style={{ padding: '14px', borderRadius: '9px', color: '#4a4035', border: '1px dashed rgba(255,255,255,.08)', fontSize: '11px' }}>
                      No pocket offers.
                    </div>
                  )}
                </div>
              </section>

              <section style={{ display: 'flex', alignItems: 'end', justifyContent: 'center', padding: '18px 8px' }}>
                <Btn onClick={leaveShop}>{shopKind === 'last_call' ? 'LEAVE LAST CALL' : 'LEAVE SHOP'}</Btn>
              </section>

              <section style={{ textAlign: 'left' }}>
                <div style={{ fontSize: '9px', letterSpacing: '.22em', color: DIM, fontFamily: "'Cinzel',serif", marginBottom: '7px' }}>
                  SERVICES
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {serviceItems.length ? serviceItems.map(i => renderShopItem(i, true)) : (
                    <div style={{ padding: '14px', borderRadius: '9px', color: '#4a4035', border: '1px dashed rgba(255,255,255,.08)', fontSize: '11px' }}>
                      No services.
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── GAME OVER ────────────────────────────────────────────────────
  if (phase === 'gameover') return (
    <div style={{ ...PAGE, justifyContent: 'center' }}>
      <style>{CSS}</style>
      <div className="fade" style={{ textAlign: 'center', padding: '3rem 2rem', maxWidth: '460px', width: '100%' }}>
        <div style={{ fontSize: '40px', color: 'rgba(80,40,40,.4)', marginBottom: '14px' }}>♠</div>
        <h2 style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: '1.9rem', color: '#ef4444', margin: '0 0 8px', fontWeight: 700 }}>
          HOUSE WINS
        </h2>
        <p style={{ color: DIM, fontSize: '14px', margin: '0 0 4px' }}>
          Act {actIdx + 1} of {ACTS.length} · ${money} earned
        </p>
        <p style={{ color: DIM, fontSize: '13px', fontFamily: "'Cinzel',serif", marginBottom: '4px' }}>
          {nickname}
        </p>
        <p style={{ color: '#4a4035', fontSize: '12px', marginBottom: '20px' }}>
          {runLog.filter(e => e.result === 'win').length} tables won · {runLog.filter(e => e.result !== 'win').length} lost
        </p>
        {artifacts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', justifyContent: 'center', marginBottom: '20px' }}>
            {artifacts.map(a => <ArtifactBadge key={a.id} art={a} />)}
          </div>
        )}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Btn onClick={newRun}>DEAL AGAIN</Btn>
          <Btn onClick={openRunLog} variant="ghost">RUN LOG</Btn>
        </div>
      </div>
    </div>
  );

  // ── WIN ──────────────────────────────────────────────────────────
  if (phase === 'win') return (
    <div style={{ ...PAGE, justifyContent: 'center' }}>
      <style>{CSS}</style>
      <div className="pop" style={{ textAlign: 'center', padding: '3rem 2rem', maxWidth: '460px', width: '100%' }}>
        <div className="glow" style={{ fontSize: '40px', color: GOLD, marginBottom: '14px' }}>♛</div>
        <h2 style={{ fontFamily: "'Cinzel Decorative',serif", fontSize: '2rem', color: GOLD, margin: '0 0 8px', fontWeight: 700, textShadow: '0 0 18px rgba(201,168,76,.35)' }}>
          YOU WIN
        </h2>
        <p style={{ color: '#b8a890', fontSize: '14px', marginBottom: '4px' }}>{actIdx >= ACTS.length ? 'House Heat survived. You can retire or keep going.' : 'Act III cleared. You beat the House.'}</p>
        <p style={{ color: DIM, fontSize: '13px', fontFamily: "'Cinzel',serif", marginBottom: '4px' }}>{nickname}</p>
        <p style={{ color: DIM, fontSize: '12px', marginBottom: '22px' }}>
          ${money} earned · {artifacts.length}/{ALL_ARTIFACT_IDS.length} artifacts · {runLog.filter(e => e.result === 'win').length} tables won · Closing Time {closingTime}
        </p>
        {artifacts.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center', marginBottom: '24px' }}>
            {artifacts.map(a => <ArtifactBadge key={a.id} art={a} />)}
          </div>
        )}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Btn onClick={() => finishRun('win')}>RETIRE RUN</Btn>
          {gameMode === 'card' && <Btn onClick={enterEndless} variant="ghost">KEEP PLAYING</Btn>}
          <Btn onClick={openRunLog} variant="ghost">RUN LOG</Btn>
          <Btn onClick={newRun} variant="ghost">NEW RUN</Btn>
        </div>
      </div>
    </div>
  );

  // ── ACHIEVEMENTS ─────────────────────────────────────────────────
  if (phase === 'achievements') {
    const unlocked = new Set([...(playerData?.achievements ?? []), ...runAchievements]);
    const unknownUnlocked = [...unlocked].filter(name => !ACHIEVEMENT_DEFS.some(a => a.name === name));
    const unlockedThisRun = new Set(runAchievements);

    return (
      <div style={{ ...PAGE, justifyContent: 'center', padding: '1rem' }} onClick={closeOverlayPhase}>
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
            <button onClick={closeOverlayPhase}
              style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: '12px',
                fontFamily: "'Cinzel',serif", letterSpacing: '.12em' }}>CLOSE</button>
          </div>

          <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(230px,1fr))', gap: '10px' }}>
            {ACHIEVEMENT_DEFS.map(a => {
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
                  <div style={{ marginTop: '6px', fontSize: '11px', color: isUnlocked ? '#b8a890' : '#5a4e38', lineHeight: 1.45 }}>
                    {a.description}
                  </div>
                </div>
              );
            })}

            {unknownUnlocked.map(name => (
              <div key={name} style={{ padding: '12px', borderRadius: '10px',
                background: 'rgba(201,168,76,.1)', border: '1px solid rgba(201,168,76,.34)' }}>
                <div style={{ fontFamily: "'Cinzel',serif", color: GOLD, fontSize: '12px', fontWeight: 700 }}>✦ {name}</div>
                <div style={{ marginTop: '6px', fontSize: '11px', color: '#b8a890' }}>Unlocked achievement.</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }


  // ── COMPENDIUM ───────────────────────────────────────────────────
  if (phase === 'compendium') {
    const artifactList = ALL_ARTIFACT_IDS.map(id => ({ id, def: ARTIFACT_DEFS[id] })).filter(x => !!x.def);
    const trinketList = TRINKET_IDS.map(id => ({ id, def: TRINKET_DEFS[id] })).filter(x => !!x.def);
    return (
      <div style={{ ...PAGE, justifyContent: 'center', padding: '1rem' }} onClick={closeOverlayPhase}>
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
            <button onClick={closeOverlayPhase}
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
                <div><b>Pit Boss:</b> Phase I bans one number for the whole phase. Phase II keeps that number ban and adds one face-card ban. Pulls are protected so both shown choices are never banned at once.</div>
                <div><b>Boss losses:</b> lose a heart and retry the boss instead of moving past it.</div>
                <div><b>House Heat:</b> after Act III, Act IV+ uses generated endless acts. Heat caps around Act VII; Closing Time rises instead of scaling forever.</div>
                <div><b>Closing Time:</b> a starter pressure meter for the later true boss system.</div>
              </div>
            </section>
          </div>
        </div>
      </div>
    );
  }

  // ── RUN LOG ──────────────────────────────────────────────────────
  if (phase === 'run_log') {
    const currentLog = runLog;
    const history = playerData?.runs ?? [];

    return (
      <div style={{ ...PAGE, justifyContent: 'center', padding: '1rem' }} onClick={closeOverlayPhase}>
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
              <div style={{ fontSize: '11px', color: DIM, marginTop: '3px' }}>
                Click outside this panel to close.
              </div>
            </div>
            <button onClick={closeOverlayPhase}
              style={{ background: 'none', border: 'none', color: DIM, cursor: 'pointer', fontSize: '12px',
                fontFamily: "'Cinzel',serif", letterSpacing: '.12em' }}>CLOSE</button>
          </div>

          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {currentLog.length > 0 && !viewingRun && (
              <div>
                <div style={{ fontSize: '10px', letterSpacing: '.22em', color: DIM, fontFamily: "'Cinzel',serif", marginBottom: '8px' }}>
                  CURRENT RUN
                </div>
                {currentLog.map((e, i) => (
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
                <div style={{ fontSize: '10px', letterSpacing: '.22em', color: DIM, fontFamily: "'Cinzel',serif", marginBottom: '8px' }}>
                  HISTORY ({history.length} runs)
                </div>
                {playerData && (
                  <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: DIM, marginBottom: '12px', flexWrap: 'wrap' }}>
                    <span>Wins: {playerData.totalWins}</span>
                    <span>Runs: {playerData.totalRuns}</span>
                    <span>Best $: {playerData.bestMoney}</span>
                    <span>Best tables: {playerData.longestRun}</span>
                  </div>
                )}
                {history.map(run => (
                  <div key={run.id} style={{ padding: '10px', borderRadius: '8px', marginBottom: '6px',
                    background: 'rgba(0,0,0,.25)', border: `1px solid ${run.outcome === 'win' ? 'rgba(201,168,76,.2)' : 'rgba(255,255,255,.05)'}`,
                    cursor: 'pointer' }}
                    onClick={() => setViewingRun(viewingRun?.id === run.id ? null : run)}>
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

            {history.length === 0 && currentLog.length === 0 && (
              <div style={{ color: DIM, fontSize: '14px', textAlign: 'center', padding: '3rem 0', fontStyle: 'italic', fontFamily: "'EB Garamond',serif" }}>
                No runs recorded yet.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── EVENT PHASE ─────────────────────────────────────────────────────
  if (phase === 'event' && activeEvent) {
    if (activeEvent === 'dumpster_dive') {
      const lifeHit = dumpsterPulls.some(p => p.type === 'lose_life');
      return (
        <DumpsterDiveView
          pullResults={dumpsterPulls}
          canPullMore={dumpsterPulls.length < 7 && !lifeHit}
          onPull={doDumpsterPull}
          onLeave={() => resolveEventChoice('dumpster_dive', 'leave')}
          CSS={CSS} PAGE={PAGE}
        />
      );
    }
    if (activeEvent === 'mirror_hallway') {
      const canEnterAgain = mirrorEntries < 3 && lives > 1;
      return (
        <MirrorHallwayView
          entriesUsed={mirrorEntries}
          maxEntries={3}
          lastCopiedCard={mirrorLastCard}
          canEnterAgain={canEnterAgain}
          onEnter={() => resolveEventChoice('mirror_hallway', 'enter')}
          onFlee={() => resolveEventChoice('mirror_hallway', 'flee')}
          CSS={CSS} PAGE={PAGE}
        />
      );
    }
    return (
      <EventView
        eventId={activeEvent}
        context={{
          money,
          lives,
          trinketCount: trinkets.length,
          artifactCount: artifacts.length,
          hasTier3Artifact: artifacts.some(a => a.stacks >= 3),
          hasEventArtifact: false,
          hasSecondWind: artifacts.some(a => a.id === 'second_wind'),
        }}
        onChoice={resolveEventChoice}
        CSS={CSS} PAGE={PAGE}
      />
    );
  }

  return <div style={PAGE}><p style={{ padding: '2rem' }}>Loading…</p></div>;
}

export default HouseRulesGame;
