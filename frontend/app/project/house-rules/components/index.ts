// components/index.ts — barrel export for all House Rules UI components
//
// Usage in HouseRules.tsx:
//   import { PlayingCard, Btn, ArtifactBadge, ... } from './components';
//
// TypeScript resolves './components' → './components/index.ts' automatically.
// No need to write './components/index'.

// ── Primitives ─────────────────────────────────────────────────────
export { PlayingCard }                             from './PlayingCard';
export { LetterCard, WordStatusPanel }             from './LetterCard';
export { Btn }                                     from './Button';
export { ArtifactBadge }                           from './ArtifactBadge';
export { TrinketBar }                              from './TrinketBar';
export { FullscreenBtn }                           from './FullscreenBtn';

// ── Heads-up display ───────────────────────────────────────────────
export { RunTracker, HeartDisplay, TriggerLayer }  from './RunTracker';
export { EffectsPanel }                            from './EffectsPanel';

// ── Event views ────────────────────────────────────────────────────
export { EventView, DumpsterDiveView, MirrorHallwayView } from './EventView';
export type { DumpsterResult }                     from './EventView';

// ── Phase screens ──────────────────────────────────────────────────
export { TitleScreen }     from './TitleScreen';
export { ResultView }      from './ResultView';
export { ShopView }        from './ShopView';
export { GameOverView }    from './GameOverView';
export { WinView }         from './WinView';

// ── Overlay / modal screens ────────────────────────────────────────
export { AchievementsView } from './AchievementsView';
export { CompendiumView }   from './CompendiumView';
export { RunLogView }       from './RunLogView';