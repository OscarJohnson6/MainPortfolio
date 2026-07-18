// destination: src/app/project/arcade/games/LetterConnect.tsx

"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { getAllArcadeWords, LETTER_CONNECT_SEEDS_BY_LENGTH } from "./wordData";

type Point = { x: number; y: number };
type LetterNode = Point & { id: number; letter: string };
type GameStatus = "playing" | "complete" | "revealed";
type RevealedIndexesByWord = Record<string, number[]>;
type Difficulty = "easy" | "medium" | "hard";

type DifficultyConfig = {
  label: string;
  completionBonus: number;
  targetPoints: number;
  bonusPoints: number;
  hintCost: number;
  minWordLength: number;
};

type GeneratedPuzzle = {
  title: string;
  letters: string;
  targets: string[];
  possibleWords: string[];
};

const WORD_BANK = getAllArcadeWords();
const MIN_WORD_LENGTH = 3;
const MAX_LETTERS = 8;
const BOARD_SIZE = 300;
const NODE_RADIUS = 27;

const DIFFICULTY_CONFIG: Record<Difficulty, DifficultyConfig> = {
  easy: {
    label: "Easy",
    completionBonus: 50,
    targetPoints: 10,
    bonusPoints: 2,
    hintCost: 5,
    minWordLength: 3,
  },
  medium: {
    label: "Medium",
    completionBonus: 100,
    targetPoints: 20,
    bonusPoints: 3,
    hintCost: 10,
    minWordLength: 4,
  },
  hard: {
    label: "Hard",
    completionBonus: 150,
    targetPoints: 30,
    bonusPoints: 5,
    hintCost: 15,
    minWordLength: 4,
  },
};

function normalizeWord(word: string) {
  return word.trim().toLowerCase();
}

function getLetterCounts(value: string) {
  const counts = new Map<string, number>();
  for (const letter of value.toLowerCase()) {
    counts.set(letter, (counts.get(letter) ?? 0) + 1);
  }
  return counts;
}

function canBuildWord(word: string, letters: string) {
  if (word.length < MIN_WORD_LENGTH || word.length > letters.length) return false;
  const counts = getLetterCounts(letters);
  for (const letter of word) {
    const remaining = counts.get(letter) ?? 0;
    if (remaining <= 0) return false;
    counts.set(letter, remaining - 1);
  }
  return true;
}

function getPossibleWords(letters: string) {
  const normalizedLetters = letters.toLowerCase();
  const seedWords = Object.values(LETTER_CONNECT_SEEDS_BY_LENGTH).flat().map(normalizeWord);
  return [...new Set([...WORD_BANK, ...seedWords].map(normalizeWord))]
    .filter((word) => canBuildWord(word, normalizedLetters))
    .sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function getDifficultyTargets(words: string[], difficulty: Difficulty) {
  const config = DIFFICULTY_CONFIG[difficulty];
  const filtered = words.filter((word) => word.length >= config.minWordLength);

  if (difficulty === "hard") {
    return filtered.sort((a, b) => b.length - a.length || a.localeCompare(b));
  }

  if (difficulty === "easy") {
    return filtered.sort((a, b) => a.length - b.length || a.localeCompare(b));
  }

  return filtered.sort((a, b) => {
    const aDistance = Math.abs(a.length - 5);
    const bDistance = Math.abs(b.length - 5);
    return aDistance - bDistance || b.length - a.length || a.localeCompare(b);
  });
}

function pickTargetWords(possibleWords: string[], targetCount: number) {
  const selected: string[] = [];
  const byLength = [...new Set(possibleWords.map((word) => word.length))].sort((a, b) => b - a);

  for (const length of byLength) {
    const wordsAtLength = possibleWords.filter((word) => word.length === length);
    for (const word of wordsAtLength) {
      if (!selected.includes(word)) selected.push(word);
      if (selected.length >= targetCount) break;
    }
    if (selected.length >= targetCount) break;
  }

  return selected.sort((a, b) => a.length - b.length || a.localeCompare(b));
}

function shuffleItems<T>(items: T[]) {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function generatePuzzle(difficulty: Difficulty, letterCount: number, targetCount: number): GeneratedPuzzle {
  const normalizedLetterCount = Math.max(4, Math.min(MAX_LETTERS, letterCount));
  const normalizedTargetCount = Math.max(3, Math.min(18, targetCount));
  const seedWords = LETTER_CONNECT_SEEDS_BY_LENGTH[normalizedLetterCount] ?? LETTER_CONNECT_SEEDS_BY_LENGTH[5];

  for (const baseWord of shuffleItems(seedWords.map(normalizeWord))) {
    const possibleWords = getPossibleWords(baseWord);
    const orderedWords = getDifficultyTargets(possibleWords, difficulty);
    if (orderedWords.length >= Math.min(normalizedTargetCount, 3)) {
      const targets = pickTargetWords(orderedWords, Math.min(normalizedTargetCount, orderedWords.length));
      return {
        title: `${DIFFICULTY_CONFIG[difficulty].label} · ${normalizedLetterCount} letters`,
        letters: shuffleItems(baseWord.toUpperCase().split("")).join(""),
        targets,
        possibleWords,
      };
    }
  }

  const fallback = "TRACE";
  const possibleWords = getPossibleWords(fallback);
  const orderedWords = getDifficultyTargets(possibleWords, difficulty);
  return {
    title: `${DIFFICULTY_CONFIG[difficulty].label} · fallback`,
    letters: shuffleItems(fallback.split("")).join(""),
    targets: pickTargetWords(orderedWords, Math.min(normalizedTargetCount, orderedWords.length)),
    possibleWords,
  };
}

function createHints(words: string[]): RevealedIndexesByWord {
  return Object.fromEntries(words.map((word) => [word, []]));
}

function getNodeLayout(letters: string[]): LetterNode[] {
  const center = BOARD_SIZE / 2;
  const radius = letters.length <= 5 ? 96 : letters.length <= 7 ? 104 : 110;

  return letters.map((letter, index) => {
    const angle = -Math.PI / 2 + (index / letters.length) * Math.PI * 2;
    return {
      id: index,
      letter,
      x: center + Math.cos(angle) * radius,
      y: center + Math.sin(angle) * radius,
    };
  });
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function getClientPoint(event: PointerEvent<SVGSVGElement>): Point {
  const bounds = event.currentTarget.getBoundingClientRect();
  return {
    x: (event.clientX - bounds.left) * (BOARD_SIZE / bounds.width),
    y: (event.clientY - bounds.top) * (BOARD_SIZE / bounds.height),
  };
}

function findNodeAtPoint(nodes: LetterNode[], point: Point) {
  return nodes.find((node) => distance(node, point) <= NODE_RADIUS + 10);
}

function buildCurrentWord(nodes: LetterNode[], selectedIds: number[]) {
  return selectedIds
    .map((id) => nodes.find((node) => node.id === id)?.letter ?? "")
    .join("")
    .toLowerCase();
}

function formatHiddenWord(word: string, revealedIndexes: number[], isFound: boolean, showTargets: boolean) {
  if (isFound || showTargets) return word.toUpperCase();
  return word
    .split("")
    .map((letter, index) => (revealedIndexes.includes(index) ? letter.toUpperCase() : "•"))
    .join("");
}

function getNextHiddenIndex(word: string, revealedIndexes: number[]) {
  for (let i = 0; i < word.length; i += 1) {
    if (!revealedIndexes.includes(i)) return i;
  }
  return null;
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

export function LetterConnect({ onBack }: { onBack: () => void }) {
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");
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
  const [letterCount, setLetterCount] = useState(6);
  const [targetCount, setTargetCount] = useState(8);
  const [puzzle, setPuzzle] = useState<GeneratedPuzzle>(() => generatePuzzle("medium", 6, 8));
  const [score, setScore] = useState(0);
  const [puzzleScore, setPuzzleScore] = useState(0);
  const [hintPenalty, setHintPenalty] = useState(0);
  const [showTargets, setShowTargets] = useState(false);
  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [bonusWords, setBonusWords] = useState<string[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [pointerPoint, setPointerPoint] = useState<Point | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [message, setMessage] = useState("Swipe across letters to connect a word.");
  const [status, setStatus] = useState<GameStatus>("playing");
  const [revealedIndexesByWord, setRevealedIndexesByWord] = useState<RevealedIndexesByWord>(() =>
    createHints(puzzle.targets),
  );

  const selectedIdsRef = useRef<number[]>([]);

  const config = DIFFICULTY_CONFIG[difficulty];
  const letters = useMemo(() => puzzle.letters.split(""), [puzzle.letters]);
  const nodes = useMemo(() => getNodeLayout(letters), [letters]);
  const possibleWords = puzzle.possibleWords;
  const targetWords = puzzle.targets;
  const targetWordSet = useMemo(() => new Set(targetWords), [targetWords]);
  const possibleWordSet = useMemo(() => new Set(possibleWords), [possibleWords]);
  const foundSet = useMemo(() => new Set(foundWords), [foundWords]);
  const selectedNodes = selectedIds
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node): node is LetterNode => Boolean(node));
  const currentWord = buildCurrentWord(nodes, selectedIds);
  const progress = targetWords.length > 0 ? foundWords.length / targetWords.length : 0;
  const completionBonus = Math.max(0, config.completionBonus - hintPenalty);

  const setSelection = useCallback((next: number[]) => {
    selectedIdsRef.current = next;
    setSelectedIds(next);
  }, []);

  const clearSelection = useCallback(() => {
    setSelection([]);
    setPointerPoint(null);
    setIsDragging(false);
  }, [setSelection]);

  const startPuzzle = useCallback(
    (nextDifficulty = difficulty, nextLetterCount = letterCount, nextTargetCount = targetCount) => {
      const nextPuzzle = generatePuzzle(nextDifficulty, nextLetterCount, nextTargetCount);
      setPuzzle(nextPuzzle);
      setFoundWords([]);
      setBonusWords([]);
      setPuzzleScore(0);
      setHintPenalty(0);
      setStatus("playing");
      setShowTargets(false);
      setRevealedIndexesByWord(createHints(nextPuzzle.targets));
      clearSelection();
      setMessage(`Generated ${nextPuzzle.targets.length} targets from ${nextPuzzle.letters.length} letters.`);
    },
    [clearSelection, difficulty, letterCount, targetCount],
  );

  const giveUpPuzzle = useCallback(() => {
    setScore(0);
    setPuzzleScore(0);
    setHintPenalty(0);
    setShowTargets(true);
    setRevealedIndexesByWord(
      Object.fromEntries(targetWords.map((word) => [word, word.split("").map((_, index) => index)])),
    );
    setStatus("revealed");
    clearSelection();
    setMessage("Puzzle revealed. Score reset to 0. Generate a new puzzle when ready.");
  }, [clearSelection, targetWords]);

  const revealIndex = useCallback(
    (word: string, index: number, label: string) => {
      if (status !== "playing") return;
      setRevealedIndexesByWord((previous) => ({
        ...previous,
        [word]: [...new Set([...(previous[word] ?? []), index])].sort((a, b) => a - b),
      }));
      setHintPenalty((value) => value + config.hintCost);
      setPuzzleScore((value) => Math.max(0, value - config.hintCost));
      setMessage(`${label}. -${config.hintCost} points.`);
    },
    [config.hintCost, status],
  );

  const revealFirstLetter = useCallback(() => {
    const word = targetWords.find(
      (target) => !foundSet.has(target) && !(revealedIndexesByWord[target] ?? []).includes(0),
    );
    if (!word) {
      setMessage("All first-letter hints are already visible.");
      return;
    }
    revealIndex(word, 0, `First letter revealed for a ${word.length}-letter word`);
  }, [foundSet, revealIndex, revealedIndexesByWord, targetWords]);

  const revealNextLetter = useCallback(() => {
    const word = targetWords.find(
      (target) => !foundSet.has(target) && getNextHiddenIndex(target, revealedIndexesByWord[target] ?? []) !== null,
    );
    if (!word) {
      setMessage("No more hidden letters to reveal.");
      return;
    }
    const nextIndex = getNextHiddenIndex(word, revealedIndexesByWord[word] ?? []);
    if (nextIndex !== null) revealIndex(word, nextIndex, "One letter revealed");
  }, [foundSet, revealIndex, revealedIndexesByWord, targetWords]);

  const hintLongestWord = useCallback(() => {
    const word = [...targetWords]
      .filter((target) => !foundSet.has(target))
      .sort((a, b) => b.length - a.length || a.localeCompare(b))[0];
    if (!word) {
      setMessage("All target words are already found.");
      return;
    }
    revealIndex(word, 0, `Longest target is ${word.length} letters and starts with ${word[0].toUpperCase()}`);
  }, [foundSet, revealIndex, targetWords]);

  const addNodeToSelection = useCallback(
    (node: LetterNode) => {
      const current = selectedIdsRef.current;
      if (current.includes(node.id)) return;
      setSelection([...current, node.id]);
    },
    [setSelection],
  );

  const handlePointerDown = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (status !== "playing") return;
      event.currentTarget.setPointerCapture(event.pointerId);
      const point = getClientPoint(event);
      const node = findNodeAtPoint(nodes, point);
      setIsDragging(true);
      setPointerPoint(point);
      if (node) setSelection([node.id]);
    },
    [nodes, setSelection, status],
  );

  const handlePointerMove = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (!isDragging || status !== "playing") return;
      const point = getClientPoint(event);
      setPointerPoint(point);
      const node = findNodeAtPoint(nodes, point);
      if (node) addNodeToSelection(node);
    },
    [addNodeToSelection, isDragging, nodes, status],
  );

  const submitSelection = useCallback(() => {
    const guess = normalizeWord(buildCurrentWord(nodes, selectedIdsRef.current));

    if (guess.length === 0) {
      clearSelection();
      return;
    }

    if (guess.length < MIN_WORD_LENGTH) {
      clearSelection();
      setMessage("Short swipes are ignored. Keep exploring.");
      return;
    }

    if (targetWordSet.has(guess)) {
      if (foundSet.has(guess)) {
        setMessage(`${guess.toUpperCase()} is already found.`);
        clearSelection();
        return;
      }

      const points = config.targetPoints;
      const nextFoundWords = [...foundWords, guess].sort((a, b) => targetWords.indexOf(a) - targetWords.indexOf(b));
      const nextPuzzleScore = puzzleScore + points;
      setFoundWords(nextFoundWords);
      setPuzzleScore(nextPuzzleScore);
      setMessage(`Target found: ${guess.toUpperCase()} (+${points}).`);

      if (nextFoundWords.length === targetWords.length) {
        const finalBonus = Math.max(0, config.completionBonus - hintPenalty);
        setScore((value) => value + nextPuzzleScore + finalBonus);
        setStatus("complete");
        setMessage(`Puzzle complete. +${finalBonus} completion bonus. Press New puzzle for another round.`);
      }

      clearSelection();
      return;
    }

    if (possibleWordSet.has(guess)) {
      if (!bonusWords.includes(guess)) {
        setBonusWords((previous) => [...previous, guess].sort());
        setPuzzleScore((value) => value + config.bonusPoints);
        setMessage(`${guess.toUpperCase()} is an extra word. +${config.bonusPoints}.`);
      } else {
        setMessage(`${guess.toUpperCase()} is already listed as an extra word.`);
      }
      clearSelection();
      return;
    }

    setMessage(`${guess.toUpperCase()} is not in this word bank. No penalty.`);
    clearSelection();
  }, [
    bonusWords,
    clearSelection,
    config.bonusPoints,
    config.completionBonus,
    config.targetPoints,
    foundSet,
    foundWords,
    hintPenalty,
    nodes,
    possibleWordSet,
    puzzleScore,
    targetWordSet,
    targetWords,
  ]);

  const handlePointerUp = useCallback(
    (event: PointerEvent<SVGSVGElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      submitSelection();
    },
    [submitSelection],
  );

  const handleDifficultyChange = (nextDifficulty: Difficulty) => {
    setDifficulty(nextDifficulty);
    startPuzzle(nextDifficulty, letterCount, targetCount);
  };

  const handleLetterCountChange = (value: number) => {
    setLetterCount(Math.max(4, Math.min(MAX_LETTERS, value)));
  };

  const handleTargetCountChange = (value: number) => {
    setTargetCount(Math.max(3, Math.min(18, value)));
  };

  const shuffleCurrentLetters = () => {
    setPuzzle((previous) => ({
      ...previous,
      letters: shuffleItems(previous.letters.split("")).join(""),
    }));
    clearSelection();
  };

  const linePoints = selectedNodes
    .map((node) => `${node.x},${node.y}`)
    .concat(pointerPoint && isDragging ? [`${pointerPoint.x},${pointerPoint.y}`] : [])
    .join(" ");

  return (
    <div
      ref={containerRef}
      className={isFullscreen ? "min-h-screen overflow-auto bg-slate-950 p-6" : ""}
    >
    <div className="mx-auto grid max-w-5xl gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <section className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-5 shadow-2xl shadow-black/30 md:p-6">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-white">Letter Connect</h2>
              <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-medium text-cyan-300 ring-1 ring-slate-800">
                Swipe words
              </span>
              <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-medium text-slate-300 ring-1 ring-slate-800">
                {config.label} · +{config.completionBonus} finish
              </span>
            </div>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
              Choose difficulty, letter count, and target count. Short or invalid swipes do not penalize you.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => startPuzzle()}
              className="rounded-2xl bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
            >
              New puzzle
            </button>
            <button type="button" onClick={onBack} className="text-xs text-slate-500 transition hover:text-cyan-300">
              ← Games
            </button>
            <button
              type="button"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              className="text-slate-500 transition hover:text-cyan-300"
            >
              <FullscreenIcon on={isFullscreen} />
            </button>
          </div>
        </div>

        <div className="mb-4 grid gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-3 sm:grid-cols-3">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Score</p>
            <p className="mt-1 text-2xl font-bold text-white">{score}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Round</p>
            <p className="mt-1 text-2xl font-bold text-white">{puzzleScore}</p>
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Targets</p>
            <p className="mt-1 text-2xl font-bold text-white">
              {foundWords.length}/{targetWords.length}
            </p>
          </div>
        </div>

        <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Status</p>
          <p className="mt-1 min-h-6 text-sm font-semibold text-white">{message}</p>
        </div>

        <div className="mx-auto max-w-[22rem] rounded-[2rem] border border-slate-800 bg-slate-950 p-3">
          <div className="mb-2 flex items-center justify-between gap-2 px-1 text-sm">
            <span className="font-semibold text-white">Current: {currentWord ? currentWord.toUpperCase() : "—"}</span>
            <button
              type="button"
              onClick={shuffleCurrentLetters}
              disabled={status !== "playing"}
              className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-cyan-300 hover:text-cyan-200 disabled:opacity-50"
            >
              Shuffle
            </button>
          </div>

          <svg
            viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
            className="aspect-square w-full touch-none select-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <circle cx={BOARD_SIZE / 2} cy={BOARD_SIZE / 2} r="122" fill="rgba(15,23,42,0.9)" stroke="rgba(51,65,85,0.9)" strokeWidth="2" />
            {linePoints && (
              <polyline points={linePoints} fill="none" stroke="rgb(103,232,249)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
            )}
            {nodes.map((node) => {
              const selected = selectedIds.includes(node.id);
              return (
                <g key={node.id}>
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={NODE_RADIUS}
                    fill={selected ? "rgb(103,232,249)" : "rgb(15,23,42)"}
                    stroke={selected ? "rgb(165,243,252)" : "rgb(51,65,85)"}
                    strokeWidth="3"
                  />
                  <text
                    x={node.x}
                    y={node.y + 7}
                    textAnchor="middle"
                    className="pointer-events-none select-none fill-white text-2xl font-black"
                  >
                    {node.letter}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-3xl border border-cyan-400/40 bg-slate-900/70 p-4 shadow-lg shadow-cyan-950/20">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-300">Puzzle setup</p>
              <h3 className="mt-1 font-semibold text-white">Options</h3>
            </div>
            <span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs text-slate-300 ring-1 ring-slate-800">
              {puzzle.title}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Difficulty</p>
              <div className="grid grid-cols-3 gap-2">
                {(["easy", "medium", "hard"] as Difficulty[]).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => handleDifficultyChange(option)}
                    className={`rounded-xl px-2 py-2 text-xs font-bold capitalize transition ${
                      difficulty === option ? "bg-cyan-300 text-slate-950" : "bg-slate-950 text-slate-300 ring-1 ring-slate-800 hover:text-white"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <NumberOption label="Letters" value={letterCount} min={4} max={MAX_LETTERS} onChange={handleLetterCountChange} />
            <NumberOption label="Targets" value={targetCount} min={3} max={18} onChange={handleTargetCountChange} />

            <button
              type="button"
              onClick={() => startPuzzle()}
              className="w-full rounded-2xl bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
            >
              Generate puzzle
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-white">Hints</h3>
            <span className="text-xs text-slate-500">-{config.hintCost} each</span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <HintButton label="First" onClick={revealFirstLetter} disabled={status !== "playing"} />
            <HintButton label="Letter" onClick={revealNextLetter} disabled={status !== "playing"} />
            <HintButton label="Long" onClick={hintLongestWord} disabled={status !== "playing"} />
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Hints lower the round score but never block play.
          </p>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-white">Target words</h3>
            <button
              type="button"
              onClick={() => setShowTargets((value) => !value)}
              className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-cyan-300 hover:text-cyan-200"
            >
              {showTargets ? "Hide" : "Show"}
            </button>
          </div>

          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-950">
            <div className="h-full rounded-full bg-cyan-300" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>

          <div className="mt-4 max-h-56 space-y-2 overflow-auto pr-1">
            {targetWords.map((word) => {
              const isFound = foundSet.has(word);
              return (
                <div key={word} className="rounded-2xl border border-slate-800 bg-slate-950 px-3 py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className={`font-mono text-sm font-bold tracking-[0.18em] ${isFound ? "text-emerald-300" : "text-white"}`}>
                      {formatHiddenWord(word, revealedIndexesByWord[word] ?? [], isFound, showTargets)}
                    </span>
                    <span className="text-xs text-slate-500">{word.length}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-white">Extra words</h3>
            <span className="text-xs text-slate-500">+{config.bonusPoints}</span>
          </div>
          <div className="mt-3 flex max-h-24 flex-wrap gap-2 overflow-auto">
            {bonusWords.length === 0 ? (
              <p className="text-sm text-slate-500">None yet.</p>
            ) : (
              bonusWords.map((word) => (
                <span key={word} className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-semibold uppercase text-slate-300 ring-1 ring-slate-800">
                  {word}
                </span>
              ))
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-4">
          <button
            type="button"
            onClick={giveUpPuzzle}
            disabled={status !== "playing"}
            className="w-full rounded-2xl border border-red-400/40 bg-red-400/10 px-4 py-2.5 text-sm font-semibold text-red-200 transition hover:border-red-300 hover:bg-red-400/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Give up / reveal
          </button>
          <p className="mt-3 text-xs leading-5 text-slate-500">
            Reveals the board, resets score, and prompts a new puzzle.
          </p>
        </section>
      </aside>
    </div>
    </div>
  );
}

function NumberOption({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <div className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
          className="rounded-xl border border-slate-700 bg-slate-950 py-2 text-sm font-bold text-slate-300 transition hover:border-cyan-300 hover:text-cyan-200 disabled:opacity-40"
        >
          −
        </button>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(event: { target: { value: string } }) => onChange(Number(event.target.value))}
          className="w-full accent-cyan-300"
        />
        <button
          type="button"
          onClick={() => onChange(value + 1)}
          disabled={value >= max}
          className="rounded-xl border border-slate-700 bg-slate-950 py-2 text-sm font-bold text-slate-300 transition hover:border-cyan-300 hover:text-cyan-200 disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

function HintButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-xl border border-slate-700 bg-slate-950 px-2 py-2 text-xs font-bold text-slate-300 transition hover:border-cyan-300 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {label}
    </button>
  );
}
