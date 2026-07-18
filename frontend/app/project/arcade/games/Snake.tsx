// destination: src/app/project/arcade/games/Snake.tsx

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const COLS = 20;
const ROWS = 20;
const CELL = 20;
const W = COLS * CELL; // 400
const H = ROWS * CELL; // 400
const TICK_MS = 115;

type Point = { x: number; y: number };
type Dir = "UP" | "DOWN" | "LEFT" | "RIGHT";
const OPPOSITE: Record<Dir, Dir> = {
  UP: "DOWN", DOWN: "UP", LEFT: "RIGHT", RIGHT: "LEFT",
};

function randomFood(snake: Point[]): Point {
  let pos: Point;
  do {
    pos = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
  } while (snake.some((s) => s.x === pos.x && s.y === pos.y));
  return pos;
}

interface GameState {
  snake: Point[];
  dir: Dir;
  nextDir: Dir;
  food: Point;
  score: number;
  alive: boolean;
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

export function Snake({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>({
    snake: [{ x: 10, y: 10 }],
    dir: "RIGHT",
    nextDir: "RIGHT",
    food: { x: 15, y: 10 },
    score: 0,
    alive: false,
  });
  const rafRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const [score, setScore] = useState(0);
  const [phase, setPhase] = useState<"idle" | "playing" | "dead">("idle");
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

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const s = stateRef.current;

    // Background
    ctx.fillStyle = "#020617";
    ctx.fillRect(0, 0, W, H);

    // Subtle grid
    ctx.fillStyle = "rgba(148,163,184,0.06)";
    for (let x = 0; x < COLS; x++) {
      for (let y = 0; y < ROWS; y++) {
        ctx.fillRect(x * CELL + CELL / 2 - 1, y * CELL + CELL / 2 - 1, 2, 2);
      }
    }

    // Food — glowing cyan dot
    ctx.save();
    ctx.shadowColor = "#22d3ee";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#67e8f9";
    ctx.beginPath();
    ctx.arc(s.food.x * CELL + CELL / 2, s.food.y * CELL + CELL / 2, CELL / 2 - 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Snake segments
    s.snake.forEach((seg, i) => {
      const t = i / Math.max(s.snake.length - 1, 1);
      const alpha = Math.max(0.25, 1 - t * 0.75);
      ctx.fillStyle = i === 0 ? "#22d3ee" : `rgba(34,211,238,${alpha.toFixed(2)})`;
      const pad = i === 0 ? 2 : 3;
      const r = i === 0 ? 5 : 3;
      const x = seg.x * CELL + pad;
      const y = seg.y * CELL + pad;
      const size = CELL - pad * 2;
      ctx.beginPath();
      ctx.roundRect(x, y, size, size, r);
      ctx.fill();
    });
  }, []);

  const loop = useCallback(
    (ts: number) => {
      const s = stateRef.current;
      if (!s.alive) return;

      if (ts - lastTickRef.current >= TICK_MS) {
        lastTickRef.current = ts;

        // Commit next direction
        s.dir = s.nextDir;

        const head = s.snake[0];
        const next = { ...head };
        if (s.dir === "UP") next.y -= 1;
        if (s.dir === "DOWN") next.y += 1;
        if (s.dir === "LEFT") next.x -= 1;
        if (s.dir === "RIGHT") next.x += 1;

        // Wall or self collision
        const hit =
          next.x < 0 ||
          next.x >= COLS ||
          next.y < 0 ||
          next.y >= ROWS ||
          s.snake.some((seg) => seg.x === next.x && seg.y === next.y);

        if (hit) {
          s.alive = false;
          setPhase("dead");
          draw();
          return;
        }

        const ate = next.x === s.food.x && next.y === s.food.y;
        s.snake = ate
          ? [next, ...s.snake]
          : [next, ...s.snake.slice(0, -1)];

        if (ate) {
          s.score += 1;
          s.food = randomFood(s.snake);
          setScore(s.score);
        }
      }

      draw();
      rafRef.current = requestAnimationFrame(loop);
    },
    [draw]
  );

  const start = useCallback(() => {
    const s = stateRef.current;
    s.snake = [{ x: 10, y: 10 }];
    s.dir = "RIGHT";
    s.nextDir = "RIGHT";
    s.food = randomFood(s.snake);
    s.score = 0;
    s.alive = true;
    lastTickRef.current = 0;
    setScore(0);
    setPhase("playing");
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  // Keyboard controls
  useEffect(() => {
    const map: Record<string, Dir> = {
      ArrowUp: "UP", w: "UP", W: "UP",
      ArrowDown: "DOWN", s: "DOWN", S: "DOWN",
      ArrowLeft: "LEFT", a: "LEFT", A: "LEFT",
      ArrowRight: "RIGHT", d: "RIGHT", D: "RIGHT",
    };

    const handleKey = (e: KeyboardEvent) => {
      const newDir = map[e.key];
      if (!newDir) return;
      e.preventDefault();
      const s = stateRef.current;
      if (!s.alive) return;
      if (newDir !== OPPOSITE[s.dir]) {
        s.nextDir = newDir;
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // Initial draw
  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div
      ref={containerRef}
      className={`flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-6 ${
        isFullscreen ? "min-h-screen items-center justify-center gap-4" : "gap-4"
      }`}
    >
      {/* Header */}
      <div className="flex w-full items-center justify-between">
        <h2 className="text-xl font-bold text-white">Snake</h2>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">
            Score:{" "}
            <span className="font-mono font-bold text-cyan-300">{score}</span>
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

      {/* Canvas */}
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="rounded-2xl border border-slate-800"
          style={{
            maxWidth: "100%",
            height: "auto",
            maxHeight: isFullscreen ? "calc(100vh - 100px)" : undefined,
          }}
        />

        {(phase === "idle" || phase === "dead") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-2xl bg-slate-950/85">
            {phase === "dead" && (
              <p className="text-lg font-bold text-red-400">
                Game over — {score} point{score !== 1 ? "s" : ""}
              </p>
            )}
            <button
              onClick={start}
              className="rounded-xl bg-cyan-300 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
            >
              {phase === "idle" ? "Start" : "Play again"}
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500">Arrow keys or WASD to move</p>
    </div>
  );
}
