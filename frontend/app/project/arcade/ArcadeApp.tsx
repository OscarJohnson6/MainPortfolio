// destination: src/app/project/arcade/ArcadeApp.tsx

"use client";

import { useState, type ReactNode } from "react";
import { Blackjack } from "./games/Blackjack";
import { FlappyBird } from "./games/FlappyBird";
import { Snake } from "./games/Snake";
import { Wordle } from "./games/Worlde";
import { LetterConnect } from "./games/LetterConnect";
import Game2048 from "./games/Game2048";

type GameId = "blackjack" | "snake" | "flappy" | "wordle" | "letter-connect" | "2048";

const GAMES: {
  id: GameId;
  title: string;
  description: string;
  tech: string[];
  preview: ReactNode;
}[] = [
  {
    id: "blackjack",
    title: "Blackjack",
    description: "Classic card game. Beat the dealer to 21 without going over. Start with 100 chips.",
    tech: ["React", "useReducer"],
    preview: (
      <div className="relative flex h-32 items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.05),transparent)]" />
        <div className="relative h-16 w-14">
          <div className="absolute right-0 top-0 flex h-16 w-11 -rotate-6 flex-col justify-between rounded-lg border border-slate-700 bg-slate-800 p-1.5 shadow-lg">
            <span className="text-[11px] font-bold leading-none text-slate-200">K</span>
            <span className="self-center text-lg leading-none text-slate-200">♠</span>
          </div>
          <div className="absolute left-0 top-0 flex h-16 w-11 rotate-6 flex-col justify-between rounded-lg border border-slate-600 bg-slate-900 p-1.5 shadow-xl">
            <span className="text-[11px] font-bold leading-none text-red-400">A</span>
            <span className="self-center text-lg leading-none text-red-400">♥</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "wordle",
    title: "Wordle",
    description: "Guess 4–7 letter words with direct tile editing, keyboard input, and classic color feedback.",
    tech: ["React", "TypeScript", "Keyboard UX"],
    preview: (
      <div className="flex h-32 items-center justify-center rounded-2xl border border-slate-800 bg-slate-950">
        <div className="grid grid-cols-6 gap-1.5">
          {[
            ["W", "correct"], ["O", "present"], ["R", "absent"], ["D", "empty"], ["L", "empty"], ["E", "empty"],
            ["", "empty"], ["", "empty"], ["", "empty"], ["", "empty"], ["", "empty"], ["", "empty"],
          ].map(([letter, status], i) => (
            <div
              key={i}
              className={`grid h-6 w-6 place-items-center rounded-md border text-[10px] font-black ${
                status === "correct"
                  ? "border-emerald-400 bg-emerald-400 text-slate-950"
                  : status === "present"
                    ? "border-amber-300 bg-amber-300 text-slate-950"
                    : status === "absent"
                      ? "border-slate-700 bg-slate-800 text-slate-300"
                      : "border-slate-700 bg-slate-900 text-slate-500"
              }`}
            >
              {letter}
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "letter-connect",
    title: "Letter Connect",
    description: "Swipe through letter nodes to build every target word. Choose difficulty, letters, and target count.",
    tech: ["React", "TypeScript", "Pointer Events"],
    preview: (
      <div className="relative flex h-32 items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.09),transparent_65%)]" />
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 220 128" aria-hidden="true">
          <path d="M62 78 C82 42 118 30 151 52" fill="none" stroke="rgba(103,232,249,0.55)" strokeWidth="6" strokeLinecap="round" />
          <path d="M151 52 C154 84 121 102 82 90" fill="none" stroke="rgba(251,191,36,0.45)" strokeWidth="4" strokeLinecap="round" strokeDasharray="4 8" />
        </svg>
        <div className="relative h-24 w-40">
          {[
            ["C", "left-2 top-10 border-cyan-300 bg-cyan-300 text-slate-950"],
            ["R", "left-[3.7rem] top-1 border-cyan-300 bg-cyan-300 text-slate-950"],
            ["A", "right-2 top-6 border-cyan-300 bg-cyan-300 text-slate-950"],
            ["T", "right-6 bottom-2 border-slate-600 bg-slate-900 text-slate-100"],
            ["E", "left-8 bottom-1 border-amber-300 bg-amber-300 text-slate-950"],
          ].map(([letter, className]) => (
            <div key={letter} className={`absolute grid h-10 w-10 place-items-center rounded-full border-2 text-base font-black shadow-lg ${className}`}>
              {letter}
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "snake",
    title: "Snake",
    description: "Eat the dots, grow the snake, don't hit the walls or yourself. Arrow keys or WASD.",
    tech: ["Canvas", "RAF"],
    preview: (
      <div className="flex h-32 items-center justify-center rounded-2xl border border-slate-800 bg-slate-950">
        <div className="grid grid-cols-7 gap-1">
          {[
            0, 1, 1, 1, 1, 0, 0,
            0, 0, 0, 0, 1, 0, 0,
            0, 0, 1, 1, 1, 0, 0,
            0, 0, 1, 0, 0, 0, 0,
            0, 0, 1, 1, 0, 0, 3,
          ].map((cell, i) => (
            <div
              key={i}
              className={`h-4 w-4 rounded-sm ${
                cell === 1
                  ? "bg-cyan-400/90"
                  : cell === 3
                    ? "bg-cyan-300 shadow-[0_0_6px_rgba(103,232,249,0.8)]"
                    : "bg-slate-800/60"
              }`}
            />
          ))}
        </div>
      </div>
    ),
  },
  {
    id: "flappy",
    title: "Flappy Bird",
    description: "Guide the bird through the pipes. One button to play. Harder than it looks.",
    tech: ["Canvas", "RAF", "Physics"],
    preview: (
      <div className="relative flex h-32 items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-[#0f172a]">
        <div className="absolute left-16 top-0 w-10">
          <div className="h-12 w-full bg-cyan-900/80" />
          <div className="-ml-1 h-3 w-12 bg-cyan-800/90" />
        </div>
        <div className="absolute bottom-0 left-16 w-10">
          <div className="-ml-1 h-3 w-12 bg-cyan-800/90" />
          <div className="h-10 w-full bg-cyan-900/80" />
        </div>
        <div className="relative ml-4 flex h-7 w-7 items-center justify-center">
          <div className="h-7 w-7 rounded-full bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.5)]" />
          <div className="absolute right-1 top-1 h-3 w-3 rounded-full bg-white" />
          <div className="absolute right-1 top-1.5 h-2 w-2 rounded-full bg-slate-900" />
        </div>
      </div>
    ),
  },
  {
    id: "2048",
    title: "2048",
    description: "Slide tiles with smooth motion, merge timing, swipe controls, and a darker arcade-style board.",
    tech: ["React", "Tile IDs", "CSS Motion"],
    preview: (
      <div className="relative flex h-32 items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-[#0f172a] p-3">
        <div className="grid grid-cols-4 gap-1.5 w-28 h-28 bg-slate-900/50 p-1.5 rounded-lg border border-slate-800/40">
          {/* Empty cell */}
          <div className="rounded-md bg-slate-800/20" />
          {/* 2 Tile */}
          <div className="rounded-md bg-blue-600/40 border border-blue-500/30 flex items-center justify-center text-[10px] font-bold text-blue-200">
            2
          </div>
          {/* Empty cell */}
          <div className="rounded-md bg-slate-800/20" />
          {/* 4 Tile */}
          <div className="rounded-md bg-blue-500/60 border border-blue-400/40 flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
            4
          </div>
          {/* Empty cells row 2 */}
          <div className="rounded-md bg-slate-800/20" />
          <div className="rounded-md bg-slate-800/20" />
          {/* 8 Tile */}
          <div className="rounded-md bg-blue-400/80 border border-blue-300/50 flex items-center justify-center text-[10px] font-bold text-white shadow-md shadow-blue-500/20 animate-pulse">
            8
          </div>
          <div className="rounded-md bg-slate-800/20" />
          {/* Remaining placeholder rows */}
          <div className="rounded-md bg-slate-800/20" />
          <div className="rounded-md bg-slate-800/20" />
          <div className="rounded-md bg-slate-800/20" />
          <div className="rounded-md bg-slate-800/20" />
        </div>
      </div>
    ),
  },
];

export function ArcadeApp() {
  const [activeGame, setActiveGame] = useState<GameId | null>(null);
  const backToGames = () => setActiveGame(null);

  if (activeGame === "blackjack") {
    return (
      <div className="px-6 py-10">
        <div className="mx-auto max-w-2xl">
          <Blackjack onBack={backToGames} />
        </div>
      </div>
    );
  }

  if (activeGame === "wordle") {
    return (
      <div className="px-6 py-10">
        <Wordle onBack={backToGames} />
      </div>
    );
  }

  if (activeGame === "letter-connect") {
    return (
      <div className="px-6 py-10">
        <LetterConnect onBack={backToGames} />
      </div>
    );
  }

  if (activeGame === "snake") {
    return (
      <div className="px-6 py-10">
        <div className="mx-auto max-w-xl">
          <Snake onBack={backToGames} />
        </div>
      </div>
    );
  }

  if (activeGame === "flappy") {
    return (
      <div className="px-6 py-10">
        <div className="mx-auto max-w-lg">
          <FlappyBird onBack={backToGames} />
        </div>
      </div>
    );
  }

  if (activeGame === "2048") {
    return (
      <div className="px-6 py-10">
        <div className="mx-auto max-w-lg">
          <Game2048 onBack={backToGames} />
        </div>
      </div>
    );
  }

  return (
    <div className="px-6 py-12">
      <div className="mx-auto max-w-7xl">
        <div className="mb-10 max-w-2xl">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">Arcade</p>
          <h1 className="mt-4 text-4xl font-bold tracking-tight text-white md:text-5xl">Browser games.</h1>
          <p className="mt-4 leading-8 text-slate-300">
            A small arcade of playable browser games built with React, TypeScript, Canvas, and focused game-state logic.
            Wordle and Letter Connect now share local word data while keeping their rules separate.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {GAMES.map((game) => (
            <button
              key={game.id}
              onClick={() => setActiveGame(game.id)}
              className="group flex flex-col rounded-[1.75rem] border border-slate-800 bg-slate-900/60 p-4 text-left transition hover:-translate-y-1 hover:border-cyan-400/70 hover:bg-slate-900"
            >
              {game.preview}

              <div className="mt-4 flex-1">
                <h2 className="text-xl font-semibold text-white">{game.title}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">{game.description}</p>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {game.tech.map((tag) => (
                  <span key={tag} className="rounded-full bg-slate-950 px-3 py-1 text-xs font-medium text-slate-300 ring-1 ring-slate-800">
                    {tag}
                  </span>
                ))}
              </div>

              <div className="mt-5">
                <span className="inline-flex rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-950 transition group-hover:bg-cyan-300">
                  Play
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
