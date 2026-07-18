// destination: src/app/project/arcade/games/FlappyBird.tsx

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const W = 380;
const H = 480;
const BIRD_X = 75;
const BIRD_R = 13;
const GRAVITY = 0.48;
const JUMP_VEL = -8.5;
const PIPE_W = 50;
const PIPE_GAP = 145;
const PIPE_SPEED = 2.4;
const PIPE_INTERVAL = 95; // frames between spawns

interface Pipe {
  x: number;
  gapCenter: number;
  scored: boolean;
}

interface GameState {
  birdY: number;
  birdVY: number;
  pipes: Pipe[];
  score: number;
  frame: number;
  alive: boolean;
}

// Defined outside component to keep loop dependency-free
function collidesWithPipe(birdY: number, pipe: Pipe): boolean {
  const left = pipe.x;
  const right = pipe.x + PIPE_W;
  if (BIRD_X + BIRD_R < left || BIRD_X - BIRD_R > right) return false;
  const top = pipe.gapCenter - PIPE_GAP / 2;
  const bot = pipe.gapCenter + PIPE_GAP / 2;
  return birdY - BIRD_R < top || birdY + BIRD_R > bot;
}

function randomGapCenter(): number {
  const margin = 90;
  return margin + Math.random() * (H - 50 - margin * 2);
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

export function FlappyBird({ onBack }: { onBack: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<GameState>({
    birdY: H / 2,
    birdVY: 0,
    pipes: [],
    score: 0,
    frame: 0,
    alive: false,
  });
  const rafRef = useRef<number>(0);
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

    // Sky
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#0f172a");
    sky.addColorStop(1, "#1e293b");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Ground
    const groundY = H - 36;
    ctx.fillStyle = "#1e293b";
    ctx.fillRect(0, groundY, W, H - groundY);
    ctx.fillStyle = "#334155";
    ctx.fillRect(0, groundY, W, 3);

    // Pipes
    for (const pipe of s.pipes) {
      const topH = pipe.gapCenter - PIPE_GAP / 2;
      const botY = pipe.gapCenter + PIPE_GAP / 2;
      const botH = groundY - botY;

      // Pipe body
      ctx.fillStyle = "#155e75";
      ctx.fillRect(pipe.x, 0, PIPE_W, topH);
      ctx.fillRect(pipe.x, botY, PIPE_W, botH);

      // Pipe highlight
      ctx.fillStyle = "#0e7490";
      ctx.fillRect(pipe.x, 0, 6, topH);
      ctx.fillRect(pipe.x, botY, 6, botH);

      // Pipe caps
      const capW = PIPE_W + 8;
      const capH = 14;
      ctx.fillStyle = "#0891b2";
      ctx.fillRect(pipe.x - 4, topH - capH, capW, capH);
      ctx.fillRect(pipe.x - 4, botY, capW, capH);
    }

    // Bird — rotates with velocity
    const birdAngle = Math.max(-0.45, Math.min(0.9, s.birdVY * 0.065));
    ctx.save();
    ctx.translate(BIRD_X, s.birdY);
    ctx.rotate(birdAngle);

    // Shadow glow when alive
    if (s.alive) {
      ctx.shadowColor = "rgba(251,191,36,0.4)";
      ctx.shadowBlur = 10;
    }

    // Body
    ctx.fillStyle = "#fbbf24";
    ctx.beginPath();
    ctx.ellipse(0, 0, BIRD_R, BIRD_R - 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Wing
    ctx.fillStyle = "#f59e0b";
    ctx.beginPath();
    ctx.ellipse(-3, 3, 7, 4, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Eye white
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(6, -4, 4, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    ctx.fillStyle = "#0f172a";
    ctx.beginPath();
    ctx.arc(7, -4, 2.2, 0, Math.PI * 2);
    ctx.fill();

    // Beak
    ctx.fillStyle = "#f97316";
    ctx.beginPath();
    ctx.moveTo(BIRD_R - 2, -2);
    ctx.lineTo(BIRD_R + 9, 1);
    ctx.lineTo(BIRD_R - 2, 4);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Score overlay
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "bold 30px monospace";
    ctx.textAlign = "center";
    ctx.shadowColor = "rgba(0,0,0,0.5)";
    ctx.shadowBlur = 4;
    ctx.fillText(String(s.score), W / 2, 48);
    ctx.shadowBlur = 0;
    ctx.textAlign = "left";
  }, []);

  const loop = useCallback(() => {
    const s = stateRef.current;
    if (!s.alive) return;

    s.frame++;

    // Bird physics
    s.birdVY += GRAVITY;
    s.birdY += s.birdVY;

    // Ground or ceiling hit
    const groundY = H - 36;
    if (s.birdY + BIRD_R >= groundY || s.birdY - BIRD_R <= 0) {
      s.alive = false;
      setPhase("dead");
      draw();
      return;
    }

    // Spawn pipes
    if (s.frame % PIPE_INTERVAL === 0) {
      s.pipes.push({ x: W + 10, gapCenter: randomGapCenter(), scored: false });
    }

    // Move pipes
    s.pipes = s.pipes.filter((p) => p.x + PIPE_W > -10);
    for (const pipe of s.pipes) {
      pipe.x -= PIPE_SPEED;

      if (!pipe.scored && pipe.x + PIPE_W < BIRD_X - BIRD_R) {
        pipe.scored = true;
        s.score++;
        setScore(s.score);
      }

      if (collidesWithPipe(s.birdY, pipe)) {
        s.alive = false;
        setPhase("dead");
        draw();
        return;
      }
    }

    draw();
    rafRef.current = requestAnimationFrame(loop);
  }, [draw]);

  const flap = useCallback(() => {
    const s = stateRef.current;
    if (s.alive) {
      s.birdVY = JUMP_VEL;
    }
  }, []);

  const start = useCallback(() => {
    const s = stateRef.current;
    s.birdY = H / 2;
    s.birdVY = 0;
    s.pipes = [];
    s.score = 0;
    s.frame = 0;
    s.alive = true;
    setScore(0);
    setPhase("playing");
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  // Keyboard and click controls
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === "Space" || e.code === "ArrowUp" || e.key === "w" || e.key === "W") {
        e.preventDefault();
        flap();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      cancelAnimationFrame(rafRef.current);
    };
  }, [flap]);

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
        <h2 className="text-xl font-bold text-white">Flappy Bird</h2>
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
          className="cursor-pointer rounded-2xl border border-slate-800"
          style={{
            maxWidth: "100%",
            height: "auto",
            maxHeight: isFullscreen ? "calc(100vh - 100px)" : undefined,
          }}
          onClick={phase === "playing" ? flap : start}
        />

        {(phase === "idle" || phase === "dead") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-2xl bg-slate-950/85">
            {phase === "dead" && (
              <p className="text-lg font-bold text-red-400">
                Score: {score}
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

      <p className="text-xs text-slate-500">Space / click to flap</p>
    </div>
  );
}
