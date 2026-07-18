// destination: src/app/project/arcade/games/Blackjack.tsx

"use client";

import { useCallback, useEffect, useRef, useState, useReducer } from "react";

type Suit = "♠" | "♥" | "♦" | "♣";
type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
type Card = { suit: Suit; rank: Rank };
type Phase = "idle" | "playing" | "done";
type Outcome = "win" | "lose" | "push" | "blackjack" | null;

const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];
const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

function shuffle(deck: Card[]): Card[] {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function cardValue(rank: Rank): number {
  if (rank === "A") return 11;
  if (["J", "Q", "K"].includes(rank)) return 10;
  return parseInt(rank);
}

function handValue(hand: Card[]): number {
  let value = 0;
  let aces = 0;
  for (const card of hand) {
    value += cardValue(card.rank);
    if (card.rank === "A") aces++;
  }
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  return value;
}

interface BJState {
  deck: Card[];
  playerHand: Card[];
  dealerHand: Card[];
  dealerHidden: boolean;
  chips: number;
  bet: number;
  phase: Phase;
  outcome: Outcome;
  message: string;
}

type BJAction =
  | { type: "SET_BET"; amount: number }
  | { type: "DEAL" }
  | { type: "HIT" }
  | { type: "STAND" }
  | { type: "REBUY" };

const INITIAL: BJState = {
  deck: [],
  playerHand: [],
  dealerHand: [],
  dealerHidden: false,
  chips: 100,
  bet: 10,
  phase: "idle",
  outcome: null,
  message: "",
};

function reducer(state: BJState, action: BJAction): BJState {
  switch (action.type) {
    case "SET_BET": {
      if (state.phase === "playing") return state;
      return { ...state, bet: action.amount };
    }

    case "DEAL": {
      if (state.bet > state.chips) return state;
      const deck = shuffle(createDeck());
      const playerHand = [deck[0], deck[2]];
      const dealerHand = [deck[1], deck[3]];
      const rest = deck.slice(4);
      const pVal = handValue(playerHand);
      const dVal = handValue(dealerHand);

      if (pVal === 21 && dVal === 21) {
        return { ...state, deck: rest, playerHand, dealerHand, dealerHidden: false, phase: "done", outcome: "push", message: "Both blackjack — push." };
      }
      if (pVal === 21) {
        return { ...state, deck: rest, playerHand, dealerHand, dealerHidden: false, chips: state.chips + Math.floor(state.bet * 1.5), phase: "done", outcome: "blackjack", message: "Blackjack! You win 1.5×." };
      }
      return { ...state, deck: rest, playerHand, dealerHand, dealerHidden: true, phase: "playing", outcome: null, message: "" };
    }

    case "HIT": {
      if (state.phase !== "playing") return state;
      const [card, ...rest] = state.deck;
      const playerHand = [...state.playerHand, card];
      const val = handValue(playerHand);
      if (val > 21) {
        return { ...state, deck: rest, playerHand, dealerHidden: false, chips: state.chips - state.bet, phase: "done", outcome: "lose", message: `Bust at ${val}. You lose.` };
      }
      return { ...state, deck: rest, playerHand };
    }

    case "STAND": {
      if (state.phase !== "playing") return state;
      let deck = [...state.deck];
      let dealerHand = [...state.dealerHand];
      while (handValue(dealerHand) < 17) {
        dealerHand = [...dealerHand, deck[0]];
        deck = deck.slice(1);
      }
      const pVal = handValue(state.playerHand);
      const dVal = handValue(dealerHand);
      let outcome: Outcome;
      let message: string;
      let delta = 0;
      if (dVal > 21 || pVal > dVal) {
        outcome = "win";
        message = `Dealer ${dVal > 21 ? "busts" : `has ${dVal}`}. You win.`;
        delta = state.bet;
      } else if (pVal === dVal) {
        outcome = "push";
        message = `Push at ${pVal}.`;
      } else {
        outcome = "lose";
        message = `Dealer has ${dVal}. You lose.`;
        delta = -state.bet;
      }
      return { ...state, deck, dealerHand, dealerHidden: false, chips: state.chips + delta, phase: "done", outcome, message };
    }

    case "REBUY":
      return { ...INITIAL };

    default:
      return state;
  }
}

function CardFace({ card }: { card: Card }) {
  const red = card.suit === "♥" || card.suit === "♦";
  return (
    <div
      className={`flex h-24 w-16 shrink-0 flex-col justify-between rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-lg ${
        red ? "text-red-400" : "text-slate-100"
      }`}
    >
      <span className="text-sm font-bold leading-none">{card.rank}</span>
      <span className="self-center text-2xl leading-none">{card.suit}</span>
      <span className="self-end rotate-180 text-sm font-bold leading-none">{card.rank}</span>
    </div>
  );
}

function CardBack() {
  return (
    <div className="flex h-24 w-16 shrink-0 items-center justify-center rounded-xl border border-slate-700 bg-slate-800 shadow-lg">
      <div className="h-16 w-10 rounded-lg border border-slate-600 bg-gradient-to-br from-slate-700 to-slate-800" />
    </div>
  );
}

function FullscreenIcon({ on }: { on: boolean }) {
  return on ? (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M6 2v4H2M10 2v4h4M6 14v-4H2M10 14v-4h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ) : (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 6V2h4M14 6V2h-4M2 10v4h4M14 10v4h-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Blackjack({ onBack }: { onBack: () => void }) {
  const [state, dispatch] = useReducer(reducer, INITIAL);
  const { playerHand, dealerHand, dealerHidden, chips, bet, phase, outcome, message } = state;

  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen();
    }
  }, []);

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const outcomeBg =
    outcome === "win" || outcome === "blackjack"
      ? "bg-cyan-300/10 text-cyan-300 border-cyan-300/20"
      : outcome === "lose"
      ? "bg-red-500/10 text-red-400 border-red-500/20"
      : "bg-slate-800 text-slate-300 border-slate-700";

  return (
    <div
      ref={containerRef}
      className={`flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-6 ${
        isFullscreen ? "min-h-screen justify-center" : "min-h-[520px]"
      }`}
    >
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Blackjack</h2>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">
            Chips:{" "}
            <span className="font-mono font-bold text-cyan-300">{chips}</span>
          </span>
          <button
            onClick={onBack}
            className="text-xs text-slate-500 transition hover:text-cyan-300"
          >
            ← Games
          </button>
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            className="text-slate-500 transition hover:text-cyan-300"
          >
            <FullscreenIcon on={isFullscreen} />
          </button>
        </div>
      </div>

      {/* Dealer hand */}
      <div className="mb-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
          Dealer
          {phase === "done" && dealerHand.length > 0
            ? ` — ${handValue(dealerHand)}`
            : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {dealerHand.map((card, i) =>
            i === 1 && dealerHidden ? (
              <CardBack key={i} />
            ) : (
              <CardFace key={i} card={card} />
            )
          )}
        </div>
      </div>

      {/* Player hand */}
      <div className="mb-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
          You{playerHand.length > 0 ? ` — ${handValue(playerHand)}` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          {playerHand.map((card, i) => (
            <CardFace key={i} card={card} />
          ))}
        </div>
      </div>

      {/* Result message */}
      {message && (
        <div
          className={`mb-4 rounded-xl border px-4 py-2 text-sm font-semibold ${outcomeBg}`}
        >
          {message}
        </div>
      )}

      {/* Controls */}
      <div className="mt-auto">
        {phase === "playing" ? (
          <div className="flex gap-3">
            <button
              onClick={() => dispatch({ type: "HIT" })}
              className="rounded-xl bg-cyan-300 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
            >
              Hit
            </button>
            <button
              onClick={() => dispatch({ type: "STAND" })}
              className="rounded-xl border border-slate-700 px-5 py-2 text-sm font-semibold text-slate-300 transition hover:border-cyan-400/80 hover:text-cyan-300"
            >
              Stand
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            {chips === 0 ? (
              <button
                onClick={() => dispatch({ type: "REBUY" })}
                className="rounded-xl bg-cyan-300 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
              >
                Rebuy 100
              </button>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500">Bet:</span>
                  {[5, 10, 25, 50].filter((b) => b <= chips).map((amount) => (
                    <button
                      key={amount}
                      onClick={() => dispatch({ type: "SET_BET", amount })}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                        bet === amount
                          ? "bg-cyan-300 text-slate-950"
                          : "border border-slate-700 text-slate-400 hover:border-cyan-400/80 hover:text-cyan-300"
                      }`}
                    >
                      {amount}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => dispatch({ type: "DEAL" })}
                  disabled={bet > chips}
                  className="rounded-xl bg-cyan-300 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:opacity-40"
                >
                  Deal
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
