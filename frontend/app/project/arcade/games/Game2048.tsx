// destination: src/app/project/arcade/games/Game2048.tsx

"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type TouchEvent as ReactTouchEvent,
} from "react";

const GRID_SIZE = 4;
const MOVE_MS = 155;
const MERGE_SETTLE_MS = 45;
const SWIPE_MIN_DISTANCE = 28;

type Direction = "UP" | "DOWN" | "LEFT" | "RIGHT";

type Tile = {
  id: number;
  value: number;
  row: number;
  col: number;
  isNew?: boolean;
  justMerged?: boolean;
};

type MoveResult = {
  changed: boolean;
  movingTiles: Tile[];
  finalTiles: Tile[];
  points: number;
};

function positionKey(row: number, col: number) {
  return `${row}:${col}`;
}

function createTileMap(tiles: Tile[]) {
  const map = new Map<string, Tile>();
  for (const tile of tiles) {
    map.set(positionKey(tile.row, tile.col), tile);
  }
  return map;
}

function getLineCoords(direction: Direction, lineIndex: number) {
  const coords: { row: number; col: number }[] = [];

  for (let i = 0; i < GRID_SIZE; i++) {
    if (direction === "LEFT") coords.push({ row: lineIndex, col: i });
    if (direction === "RIGHT") coords.push({ row: lineIndex, col: GRID_SIZE - 1 - i });
    if (direction === "UP") coords.push({ row: i, col: lineIndex });
    if (direction === "DOWN") coords.push({ row: GRID_SIZE - 1 - i, col: lineIndex });
  }

  return coords;
}

function resolveMove(tiles: Tile[], direction: Direction): MoveResult {
  const tileMap = createTileMap(tiles);
  const movingTiles: Tile[] = [];
  const finalTiles: Tile[] = [];
  let changed = false;
  let points = 0;

  for (let line = 0; line < GRID_SIZE; line++) {
    const coords = getLineCoords(direction, line);
    const lineTiles = coords
      .map((coord) => tileMap.get(positionKey(coord.row, coord.col)))
      .filter((tile): tile is Tile => Boolean(tile));

    let targetIndex = 0;

    for (let i = 0; i < lineTiles.length; i++) {
      const first = lineTiles[i];
      const second = lineTiles[i + 1];
      const target = coords[targetIndex];

      if (second && first.value === second.value) {
        const mergedValue = first.value * 2;

        movingTiles.push(
          { ...first, row: target.row, col: target.col, isNew: false, justMerged: false },
          { ...second, row: target.row, col: target.col, isNew: false, justMerged: false },
        );

        finalTiles.push({
          id: first.id,
          value: mergedValue,
          row: target.row,
          col: target.col,
          justMerged: true,
        });

        changed = true;
        points += mergedValue;
        i++;
      } else {
        if (first.row !== target.row || first.col !== target.col) {
          changed = true;
        }

        movingTiles.push({
          ...first,
          row: target.row,
          col: target.col,
          isNew: false,
          justMerged: false,
        });

        finalTiles.push({
          ...first,
          row: target.row,
          col: target.col,
          isNew: false,
          justMerged: false,
        });
      }

      targetIndex++;
    }
  }

  return { changed, movingTiles, finalTiles, points };
}

function getEmptyCells(tiles: Tile[]) {
  const occupied = new Set(tiles.map((tile) => positionKey(tile.row, tile.col)));
  const cells: { row: number; col: number }[] = [];

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      if (!occupied.has(positionKey(row, col))) cells.push({ row, col });
    }
  }

  return cells;
}

function addRandomTile(tiles: Tile[], getNextId: () => number): Tile[] {
  const emptyCells = getEmptyCells(tiles);
  if (emptyCells.length === 0) return tiles;

  const cell = emptyCells[Math.floor(Math.random() * emptyCells.length)];

  return [
    ...tiles,
    {
      id: getNextId(),
      value: Math.random() < 0.9 ? 2 : 4,
      row: cell.row,
      col: cell.col,
      isNew: true,
    },
  ];
}

function canMove(tiles: Tile[]) {
  if (tiles.length < GRID_SIZE * GRID_SIZE) return true;

  const tileMap = createTileMap(tiles);

  for (const tile of tiles) {
    const right = tileMap.get(positionKey(tile.row, tile.col + 1));
    const down = tileMap.get(positionKey(tile.row + 1, tile.col));

    if (right?.value === tile.value || down?.value === tile.value) {
      return true;
    }
  }

  return false;
}

function getTileClasses(value: number) {
  if (value === 2) return "border-cyan-400/30 bg-cyan-950 text-cyan-100";
  if (value === 4) return "border-cyan-300/40 bg-cyan-900 text-cyan-50";
  if (value === 8) return "border-cyan-300/50 bg-cyan-700 text-white shadow-cyan-500/20";
  if (value === 16) return "border-sky-300/60 bg-sky-600 text-white shadow-sky-500/25";
  if (value === 32) return "border-emerald-300/60 bg-emerald-600 text-white shadow-emerald-500/25";
  if (value === 64) return "border-amber-300/70 bg-amber-500 text-slate-950 shadow-amber-500/25";
  if (value === 128) return "border-orange-300/70 bg-orange-500 text-slate-950 shadow-orange-500/25";
  if (value === 256) return "border-rose-300/70 bg-rose-500 text-white shadow-rose-500/25";
  if (value === 512) return "border-fuchsia-300/70 bg-fuchsia-600 text-white shadow-fuchsia-500/25";
  if (value === 1024) return "border-violet-300/70 bg-violet-600 text-white shadow-violet-500/25";
  return "border-cyan-200/80 bg-slate-100 text-slate-950 shadow-cyan-300/40";
}

function getTileTextSize(value: number) {
  if (value < 100) return "text-3xl sm:text-4xl";
  if (value < 1000) return "text-2xl sm:text-3xl";
  return "text-xl sm:text-2xl";
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

export default function Game2048({ onBack }: { onBack?: () => void }) {
  const nextIdRef = useRef(1);
  const tilesRef = useRef<Tile[]>([]);
  const animatingRef = useRef(false);
  const settleTimerRef = useRef<number | null>(null);
  const flagTimerRef = useRef<number | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [tiles, setTiles] = useState<Tile[]>([]);
  const [score, setScore] = useState(0);
  const [gameOver, setGameOver] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    tilesRef.current = tiles;
  }, [tiles]);

  const clearTimers = useCallback(() => {
    if (settleTimerRef.current) window.clearTimeout(settleTimerRef.current);
    if (flagTimerRef.current) window.clearTimeout(flagTimerRef.current);
    settleTimerRef.current = null;
    flagTimerRef.current = null;
  }, []);

  const getNextId = useCallback(() => nextIdRef.current++, []);

  const startNewGame = useCallback(() => {
    clearTimers();
    nextIdRef.current = 1;
    animatingRef.current = false;

    let nextTiles: Tile[] = [];
    nextTiles = addRandomTile(nextTiles, getNextId);
    nextTiles = addRandomTile(nextTiles, getNextId);

    tilesRef.current = nextTiles;
    setTiles(nextTiles);
    setScore(0);
    setGameOver(false);
    setIsAnimating(false);
  }, [clearTimers, getNextId]);

  useEffect(() => {
    startNewGame();

    return () => {
      clearTimers();
    };
  }, [clearTimers, startNewGame]);

  const highestTile = useMemo(() => {
    return tiles.reduce((highest, tile) => Math.max(highest, tile.value), 0);
  }, [tiles]);

  const move = useCallback(
    (direction: Direction) => {
      if (animatingRef.current || gameOver) return;

      const currentTiles = tilesRef.current;
      const result = resolveMove(currentTiles, direction);

      if (!result.changed) {
        if (!canMove(currentTiles)) setGameOver(true);
        return;
      }

      clearTimers();
      animatingRef.current = true;
      setIsAnimating(true);
      setScore((current) => current + result.points);
      setTiles(result.movingTiles);

      settleTimerRef.current = window.setTimeout(() => {
        const settledTiles = addRandomTile(result.finalTiles, getNextId);
        tilesRef.current = settledTiles;
        setTiles(settledTiles);
        setGameOver(!canMove(settledTiles));
        setIsAnimating(false);
        animatingRef.current = false;

        flagTimerRef.current = window.setTimeout(() => {
          setTiles((currentTiles) =>
            currentTiles.map((tile) => ({
              ...tile,
              isNew: false,
              justMerged: false,
            })),
          );
        }, MOVE_MS);
      }, MOVE_MS + MERGE_SETTLE_MS);
    },
    [clearTimers, gameOver, getNextId],
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const keyToDirection: Record<string, Direction | undefined> = {
        ArrowUp: "UP",
        ArrowDown: "DOWN",
        ArrowLeft: "LEFT",
        ArrowRight: "RIGHT",
        w: "UP",
        W: "UP",
        s: "DOWN",
        S: "DOWN",
        a: "LEFT",
        A: "LEFT",
        d: "RIGHT",
        D: "RIGHT",
      };

      const direction = keyToDirection[event.key];
      if (!direction) return;

      event.preventDefault();
      move(direction);
    };

    window.addEventListener("keydown", handleKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [move]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(console.error);
    } else {
      document.exitFullscreen().catch(console.error);
    }
  }, []);

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    const touch = event.changedTouches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: ReactTouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    if (!start) return;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    touchStartRef.current = null;

    if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN_DISTANCE) return;

    if (Math.abs(dx) > Math.abs(dy)) {
      move(dx > 0 ? "RIGHT" : "LEFT");
    } else {
      move(dy > 0 ? "DOWN" : "UP");
    }
  };

  const boardStyle = {
    "--gap": "0.75rem",
    maxWidth: isFullscreen ? "min(82vh, 92vw)" : "26rem",
  } as CSSProperties;

  return (
    <div
      ref={containerRef}
      className={`flex flex-col rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-slate-100 shadow-2xl shadow-slate-950/30 ${
        isFullscreen ? "min-h-screen items-center justify-center gap-5 bg-slate-950" : "gap-4"
      }`}
    >
      <style>{`
        @keyframes tileSpawn {
          0% { transform: scale(0.55); opacity: 0; }
          80% { transform: scale(1.08); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }

        @keyframes tileMerge {
          0% { transform: scale(1); }
          45% { transform: scale(1.16); }
          100% { transform: scale(1); }
        }
      `}</style>

      <header className="flex w-full items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-cyan-300">Arcade</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-white">2048</h2>
          <p className="mt-1 text-xs text-slate-500">Arrow keys, WASD, swipe, or buttons.</p>
        </div>

        <div className="flex items-start gap-2">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-2 text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Score</p>
            <p className="font-mono text-xl font-black text-cyan-300">{score}</p>
          </div>
          <div className="hidden rounded-2xl border border-slate-800 bg-slate-950/80 px-4 py-2 text-right sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Best tile</p>
            <p className="font-mono text-xl font-black text-white">{highestTile || "—"}</p>
          </div>
        </div>
      </header>

      <div className="flex w-full items-center justify-between gap-3">
        <button
          onClick={startNewGame}
          className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
        >
          New game
        </button>

        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="text-xs text-slate-500 transition hover:text-cyan-300"
            >
              ← Games
            </button>
          )}
          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            className="text-slate-500 transition hover:text-cyan-300"
          >
            <FullscreenIcon on={isFullscreen} />
          </button>
        </div>
      </div>

      <div
        className="relative aspect-square w-full touch-none select-none rounded-[1.75rem] border border-slate-800 bg-slate-950 p-3 shadow-inner shadow-black/40"
        style={boardStyle}
        role="application"
        aria-label="2048 board"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <div className="grid h-full w-full grid-cols-4 gap-3">
          {Array.from({ length: GRID_SIZE * GRID_SIZE }).map((_, index) => (
            <div
              key={index}
              className="rounded-2xl border border-slate-800/70 bg-slate-900/70 shadow-inner shadow-black/20"
            />
          ))}
        </div>

        <div className="pointer-events-none absolute inset-3">
          {tiles.map((tile) => {
            // Percentages inside transform() resolve against the tile itself, not
            // the board. Position with left/top instead so every tile uses the
            // exact same four-column geometry as the background grid.
            const columnGapOffset = tile.col * 0.1875;
            const rowGapOffset = tile.row * 0.1875;

            const tileStyle: CSSProperties = {
              width: "calc((100% - 2.25rem) / 4)",
              height: "calc((100% - 2.25rem) / 4)",
              left: `calc(${tile.col * 25}% + ${columnGapOffset}rem)`,
              top: `calc(${tile.row * 25}% + ${rowGapOffset}rem)`,
              transition: [
                `left ${MOVE_MS}ms cubic-bezier(0.2, 0.86, 0.24, 1)`,
                `top ${MOVE_MS}ms cubic-bezier(0.2, 0.86, 0.24, 1)`,
              ].join(", "),
              willChange: "left, top",
              zIndex: tile.justMerged ? 3 : tile.value,
            };

            const contentStyle: CSSProperties = {
              animation: tile.isNew
                ? "tileSpawn 165ms cubic-bezier(0.2, 0.9, 0.25, 1.2) both"
                : tile.justMerged
                  ? "tileMerge 185ms ease-out both"
                  : undefined,
            };

            return (
              <div
                key={tile.id}
                className="absolute"
                style={tileStyle}
              >
                <div
                  className={`grid h-full w-full place-items-center rounded-2xl border font-mono font-black shadow-lg ${getTileTextSize(
                    tile.value,
                  )} ${getTileClasses(tile.value)}`}
                  style={contentStyle}
                >
                  {tile.value}
                </div>
              </div>
            );
          })}
        </div>

        {gameOver && (
          <div className="absolute inset-3 flex flex-col items-center justify-center gap-4 rounded-[1.35rem] bg-slate-950/88 text-center backdrop-blur-sm">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-red-300">Game over</p>
              <p className="mt-2 text-sm text-slate-400">No moves left. Final score: {score}</p>
            </div>
            <button
              onClick={startNewGame}
              className="rounded-xl bg-cyan-300 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
            >
              Play again
            </button>
          </div>
        )}
      </div>

      <div className="grid w-full grid-cols-3 gap-2 sm:hidden">
        <span />
        <button
          onClick={() => move("UP")}
          disabled={isAnimating || gameOver}
          className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-slate-300 transition hover:border-cyan-400 hover:text-cyan-300 disabled:opacity-40"
          aria-label="Move up"
        >
          ↑
        </button>
        <span />
        <button
          onClick={() => move("LEFT")}
          disabled={isAnimating || gameOver}
          className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-slate-300 transition hover:border-cyan-400 hover:text-cyan-300 disabled:opacity-40"
          aria-label="Move left"
        >
          ←
        </button>
        <button
          onClick={() => move("DOWN")}
          disabled={isAnimating || gameOver}
          className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-slate-300 transition hover:border-cyan-400 hover:text-cyan-300 disabled:opacity-40"
          aria-label="Move down"
        >
          ↓
        </button>
        <button
          onClick={() => move("RIGHT")}
          disabled={isAnimating || gameOver}
          className="rounded-xl border border-slate-800 bg-slate-950 px-4 py-2 text-slate-300 transition hover:border-cyan-400 hover:text-cyan-300 disabled:opacity-40"
          aria-label="Move right"
        >
          →
        </button>
      </div>

      <p className="text-xs leading-5 text-slate-500">
        Inputs are locked during the short tile slide so movement stays smooth and merges do not double-fire.
      </p>
    </div>
  );
}