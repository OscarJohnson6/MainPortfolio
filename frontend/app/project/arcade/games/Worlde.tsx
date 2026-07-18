// destination: src/app/project/arcade/games/Worlde.tsx

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getWordsByLength } from "./wordData";

type TileStatus = "empty" | "correct" | "present" | "absent";
type GameStatus = "playing" | "checking" | "won" | "lost";
type Difficulty = "easy" | "hard";

type EvaluatedLetter = {
  letter: string;
  status: TileStatus;
};

type DatamuseWord = {
  word: string;
};

const WORD_LENGTH_OPTIONS = [4, 5, 6, 7];
const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

function getRandomItem(words: string[]) {
  return words[Math.floor(Math.random() * words.length)] ?? "word";
}

function getMaxGuesses(length: number) {
  return Math.max(5, length + 1);
}

function createEmptyBoard(wordLength: number) {
  return Array.from({ length: getMaxGuesses(wordLength) }, () =>
    Array.from({ length: wordLength }, () => ""),
  );
}

function normalizeWords(words: string[], length: number) {
  return [
    ...new Set(
      words
        .map((word) => word.toLowerCase())
        .filter((word) => new RegExp(`^[a-z]{${length}}$`).test(word)),
    ),
  ];
}

async function fetchDatamuseWords(length: number) {
  const pattern = "?".repeat(length);
  const response = await fetch(`https://api.datamuse.com/words?sp=${pattern}&max=1000&md=f`);
  if (!response.ok) throw new Error("Word API did not respond.");

  const data = (await response.json()) as DatamuseWord[];
  return normalizeWords(data.map((item) => item.word), length);
}

async function checkDatamuseWord(word: string) {
  const response = await fetch(
    `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&max=8`,
  );
  if (!response.ok) return false;

  const data = (await response.json()) as DatamuseWord[];
  return data.some((item) => item.word.toLowerCase() === word.toLowerCase());
}

function evaluateGuess(guess: string, answer: string): EvaluatedLetter[] {
  const result: EvaluatedLetter[] = guess
    .split("")
    .map((letter) => ({ letter, status: "absent" }));
  const answerLetters = answer.split("");
  const usedAnswerIndexes = new Set<number>();

  for (let i = 0; i < answer.length; i += 1) {
    if (guess[i] === answerLetters[i]) {
      result[i].status = "correct";
      usedAnswerIndexes.add(i);
    }
  }

  for (let guessIndex = 0; guessIndex < answer.length; guessIndex += 1) {
    if (result[guessIndex].status === "correct") continue;

    const matchIndex = answerLetters.findIndex(
      (answerLetter, answerIndex) =>
        !usedAnswerIndexes.has(answerIndex) && answerLetter === guess[guessIndex],
    );

    if (matchIndex !== -1) {
      result[guessIndex].status = "present";
      usedAnswerIndexes.add(matchIndex);
    }
  }

  return result;
}

function getBestKeyboardStatus(
  currentStatus: TileStatus | undefined,
  nextStatus: TileStatus,
): TileStatus {
  const rank: Record<TileStatus, number> = {
    empty: 0,
    absent: 1,
    present: 2,
    correct: 3,
  };

  if (!currentStatus) return nextStatus;
  return rank[nextStatus] > rank[currentStatus] ? nextStatus : currentStatus;
}

function tileClass(status: TileStatus) {
  if (status === "correct") {
    return "border-emerald-400 bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-950/40";
  }
  if (status === "present") {
    return "border-amber-300 bg-amber-300 text-slate-950 shadow-lg shadow-amber-950/40";
  }
  if (status === "absent") {
    return "border-slate-700 bg-slate-800 text-slate-300";
  }
  return "border-slate-700 bg-slate-950 text-slate-100";
}

function keyClass(status: TileStatus | undefined) {
  if (status === "correct") return "border-emerald-400 bg-emerald-400 text-slate-950";
  if (status === "present") return "border-amber-300 bg-amber-300 text-slate-950";
  if (status === "absent") return "border-slate-700 bg-slate-800 text-slate-400";
  return "border-slate-700 bg-slate-900 text-slate-200 hover:border-cyan-300 hover:text-cyan-200";
}

function firstOpenColumn(row: string[]) {
  const emptyIndex = row.findIndex((letter) => letter === "");
  return emptyIndex === -1 ? row.length - 1 : emptyIndex;
}

function getTileSizeClass(wordLength: number) {
  if (wordLength <= 4) return "text-3xl";
  if (wordLength === 5) return "text-3xl";
  if (wordLength === 6) return "text-2xl";
  return "text-xl";
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

export function Wordle({ onBack }: { onBack: () => void }) {
  const validWordCache = useRef(new Map<string, boolean>());
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

  const [wordLength, setWordLength] = useState(5);
  const [difficulty, setDifficulty] = useState<Difficulty>("easy");
  const [hardWordsByLength, setHardWordsByLength] = useState<Record<number, string[]>>({});
  const [answer, setAnswer] = useState(() => getRandomItem(getWordsByLength(5)));
  const [board, setBoard] = useState<string[][]>(() => createEmptyBoard(5));
  const [evaluations, setEvaluations] = useState<EvaluatedLetter[][]>([]);
  const [currentRow, setCurrentRow] = useState(0);
  const [currentCol, setCurrentCol] = useState(0);
  const [gameStatus, setGameStatus] = useState<GameStatus>("playing");
  const [message, setMessage] = useState("Classic 5-letter easy mode.");
  const [currentScore, setCurrentScore] = useState(0);
  const [maxScore, setMaxScore] = useState(0);
  const [usingApiWords, setUsingApiWords] = useState(false);

  const maxGuesses = getMaxGuesses(wordLength);
  const easyPool = getWordsByLength(wordLength);
  const hardPool = hardWordsByLength[wordLength] ?? easyPool;
  const activeAnswerPool = difficulty === "easy" ? easyPool : hardPool;
  const currentGuess = board[currentRow]?.join("") ?? "";
  const currentRowHasEmptyTiles = board[currentRow]?.some((letter) => letter === "") ?? true;

  const keyboardStatus = useMemo(() => {
    const statuses: Record<string, TileStatus> = {};

    for (const row of evaluations) {
      for (const item of row) {
        statuses[item.letter] = getBestKeyboardStatus(statuses[item.letter], item.status);
      }
    }

    return statuses;
  }, [evaluations]);

  useEffect(() => {
    let ignore = false;

    async function loadWords() {
      try {
        const entries = await Promise.all(
          WORD_LENGTH_OPTIONS.map(async (length) => [length, await fetchDatamuseWords(length)] as const),
        );
        if (ignore) return;

        const nextPools = Object.fromEntries(
          entries.map(([length, words]) => [length, words.length > 50 ? words : getWordsByLength(length)]),
        );
        setHardWordsByLength(nextPools);
        setUsingApiWords(entries.some(([, words]) => words.length > 50));
      } catch {
        if (!ignore) setUsingApiWords(false);
      }
    }

    void loadWords();
    return () => {
      ignore = true;
    };
  }, []);

  const resetGame = useCallback(
    (keepScore = true, nextLength = wordLength, nextDifficulty = difficulty) => {
      const nextEasyPool = getWordsByLength(nextLength);
      const nextHardPool = hardWordsByLength[nextLength] ?? nextEasyPool;
      const nextPool = nextDifficulty === "easy" ? nextEasyPool : nextHardPool;
      setAnswer(getRandomItem(nextPool.length > 0 ? nextPool : nextEasyPool));
      setBoard(createEmptyBoard(nextLength));
      setEvaluations([]);
      setCurrentRow(0);
      setCurrentCol(0);
      setGameStatus("playing");
      setMessage(
        `${nextLength}-letter ${nextDifficulty === "easy" ? "easy" : "hard"} word loaded.`,
      );

      if (!keepScore) setCurrentScore(0);
    },
    [difficulty, hardWordsByLength, wordLength],
  );

  const changeWordLength = useCallback(
    (nextLength: number) => {
      setWordLength(nextLength);
      setCurrentScore(0);
      validWordCache.current.clear();
      resetGame(false, nextLength, difficulty);
    },
    [difficulty, resetGame],
  );

  const changeDifficulty = useCallback(
    (nextDifficulty: Difficulty) => {
      setDifficulty(nextDifficulty);
      setCurrentScore(0);
      validWordCache.current.clear();
      resetGame(false, wordLength, nextDifficulty);
      setMessage(
        nextDifficulty === "easy"
          ? `${wordLength}-letter easy mode: built-in common words.`
          : usingApiWords
            ? `${wordLength}-letter hard mode: larger online word list.`
            : `${wordLength}-letter hard mode: online words unavailable, using local words.`,
      );
    },
    [resetGame, usingApiWords, wordLength],
  );

  const selectTile = useCallback(
    (rowIndex: number, colIndex: number) => {
      if (gameStatus !== "playing") return;
      if (rowIndex !== currentRow) return;

      setCurrentCol(colIndex);
      setMessage("Type to replace this tile, or click another tile.");
    },
    [currentRow, gameStatus],
  );

  const addLetter = useCallback(
    (letter: string) => {
      if (gameStatus !== "playing") return;
      if (!/^[a-z]$/i.test(letter)) return;

      setBoard((previousBoard) => {
        const nextBoard = previousBoard.map((row) => [...row]);
        nextBoard[currentRow][currentCol] = letter.toLowerCase();
        return nextBoard;
      });

      setCurrentCol((previousCol) => Math.min(previousCol + 1, wordLength - 1));
      setMessage("Press Enter to submit, or click a tile to edit it.");
    },
    [currentCol, currentRow, gameStatus, wordLength],
  );

  const removeLetter = useCallback(() => {
    if (gameStatus !== "playing") return;

    const activeRow = board[currentRow] ?? [];
    const targetCol = activeRow[currentCol] ? currentCol : Math.max(currentCol - 1, 0);

    setBoard((previousBoard) => {
      const nextBoard = previousBoard.map((row) => [...row]);
      nextBoard[currentRow][targetCol] = "";
      return nextBoard;
    });

    setCurrentCol(targetCol);
  }, [board, currentCol, currentRow, gameStatus]);

  const moveCursor = useCallback(
    (direction: -1 | 1) => {
      if (gameStatus !== "playing") return;
      setCurrentCol((previousCol) => Math.max(0, Math.min(wordLength - 1, previousCol + direction)));
    },
    [gameStatus, wordLength],
  );

  const isValidGuess = useCallback(
    async (guess: string) => {
      const localWords = getWordsByLength(guess.length);
      const hardWords = hardWordsByLength[guess.length] ?? [];
      if (localWords.includes(guess) || hardWords.includes(guess)) return true;

      const cached = validWordCache.current.get(guess);
      if (cached !== undefined) return cached;

      try {
        const valid = await checkDatamuseWord(guess);
        validWordCache.current.set(guess, valid);
        return valid;
      } catch {
        return false;
      }
    },
    [hardWordsByLength],
  );

  const submitGuess = useCallback(async () => {
    if (gameStatus !== "playing") return;

    const guess = currentGuess.toLowerCase();

    if (currentRowHasEmptyTiles || guess.length !== wordLength) {
      setCurrentCol(firstOpenColumn(board[currentRow] ?? []));
      setMessage(`Enter all ${wordLength} letters first.`);
      return;
    }

    setGameStatus("checking");
    setMessage("Checking word...");

    const validGuess = await isValidGuess(guess);

    if (!validGuess) {
      setGameStatus("playing");
      setCurrentCol(0);
      setMessage("I do not recognize that word. Click a tile to edit it.");
      return;
    }

    const evaluatedGuess = evaluateGuess(guess, answer);
    setEvaluations((previous) => [...previous, evaluatedGuess]);

    if (guess === answer) {
      const nextScore = currentScore + 1;
      setCurrentScore(nextScore);
      setMaxScore((previousMax) => Math.max(previousMax, nextScore));
      setGameStatus("won");
      setMessage(`Correct. The word was ${answer.toUpperCase()}.`);
      return;
    }

    if (currentRow === maxGuesses - 1) {
      setCurrentScore(0);
      setGameStatus("lost");
      setMessage(`Out of guesses. The word was ${answer.toUpperCase()}.`);
      return;
    }

    setCurrentRow((previousRow) => previousRow + 1);
    setCurrentCol(0);
    setGameStatus("playing");
    setMessage("Next guess.");
  }, [
    answer,
    board,
    currentGuess,
    currentRow,
    currentRowHasEmptyTiles,
    currentScore,
    gameStatus,
    isValidGuess,
    maxGuesses,
    wordLength,
  ]);

  const handleKey = useCallback(
    (key: string) => {
      if (key === "Enter") {
        void submitGuess();
        return;
      }

      if (key === "Backspace") {
        removeLetter();
        return;
      }

      if (key === "ArrowLeft") {
        moveCursor(-1);
        return;
      }

      if (key === "ArrowRight") {
        moveCursor(1);
        return;
      }

      if (/^[a-z]$/i.test(key)) addLetter(key);
    },
    [addLetter, moveCursor, removeLetter, submitGuess],
  );

  useEffect(() => {
    function handlePhysicalKeyboard(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      if (
        event.key === "Enter" ||
        event.key === "Backspace" ||
        event.key === "ArrowLeft" ||
        event.key === "ArrowRight" ||
        /^[a-z]$/i.test(event.key)
      ) {
        event.preventDefault();
        handleKey(event.key);
      }
    }

    window.addEventListener("keydown", handlePhysicalKeyboard);
    return () => window.removeEventListener("keydown", handlePhysicalKeyboard);
  }, [handleKey]);

  return (
    <div
      ref={containerRef}
      className={isFullscreen ? "min-h-screen overflow-auto bg-slate-950 p-6" : ""}
    >
    <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_18rem]">
      <section className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-5 shadow-2xl shadow-black/30 md:p-8">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl font-bold text-white">Wordle</h2>
              <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-medium text-cyan-300 ring-1 ring-slate-800">
                {wordLength} letters
              </span>
              <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-medium text-slate-300 ring-1 ring-slate-800">
                {maxGuesses} guesses
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Guess a 4–7 letter word. Five letters is the classic default; shorter and longer modes add variety.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => resetGame(gameStatus !== "lost")}
              className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
            >
              New word
            </button>
            <button
              type="button"
              onClick={onBack}
              className="text-xs text-slate-500 transition hover:text-cyan-300"
            >
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

        <div className="mb-5 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Status</p>
          <p className="mt-1 text-base font-semibold text-white">{message}</p>
        </div>

        <div className="mb-6 grid gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-3 md:grid-cols-[1fr_1fr]">
          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-500">Word length</p>
            <div className="grid grid-cols-4 gap-2">
              {WORD_LENGTH_OPTIONS.map((length) => (
                <button
                  key={length}
                  type="button"
                  onClick={() => changeWordLength(length)}
                  className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                    wordLength === length
                      ? "bg-cyan-300 text-slate-950"
                      : "bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  {length}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs uppercase tracking-[0.2em] text-slate-500">Mode</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => changeDifficulty("easy")}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  difficulty === "easy"
                    ? "bg-cyan-300 text-slate-950"
                    : "bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                Easy
              </button>
              <button
                type="button"
                onClick={() => changeDifficulty("hard")}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                  difficulty === "hard"
                    ? "bg-cyan-300 text-slate-950"
                    : "bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                Hard
              </button>
            </div>
          </div>
        </div>

        <div className="mx-auto grid w-full max-w-xl gap-2 sm:gap-3">
          {board.map((row, rowIndex) => {
            const evaluatedRow = evaluations[rowIndex];

            return (
              <div
                key={rowIndex}
                className="grid gap-2 sm:gap-3"
                style={{ gridTemplateColumns: `repeat(${wordLength}, minmax(0, 1fr))` }}
              >
                {row.map((letter, colIndex) => {
                  const status = evaluatedRow?.[colIndex]?.status ?? "empty";
                  const isActive =
                    gameStatus === "playing" && rowIndex === currentRow && colIndex === currentCol;
                  const isEditable = gameStatus === "playing" && rowIndex === currentRow;

                  return (
                    <button
                      key={`${rowIndex}-${colIndex}`}
                      type="button"
                      onClick={() => selectTile(rowIndex, colIndex)}
                      disabled={!isEditable}
                      aria-label={`Row ${rowIndex + 1}, column ${colIndex + 1}`}
                      className={`grid aspect-square place-items-center rounded-2xl border-2 font-bold uppercase transition disabled:cursor-default ${tileClass(status)} ${getTileSizeClass(wordLength)} ${
                        isActive ? "ring-2 ring-cyan-300/80 ring-offset-2 ring-offset-slate-950" : ""
                      } ${isEditable ? "hover:border-cyan-300" : ""}`}
                    >
                      {letter}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>

        <div className="mt-8 space-y-2">
          {KEYBOARD_ROWS.map((row) => (
            <div key={row} className="flex justify-center gap-1.5 sm:gap-2">
              {row.split("").map((letter) => (
                <button
                  key={letter}
                  type="button"
                  onClick={() => addLetter(letter)}
                  disabled={gameStatus !== "playing"}
                  className={`min-w-7 rounded-xl border px-1.5 py-3 text-xs font-bold uppercase transition disabled:cursor-not-allowed disabled:opacity-70 sm:min-w-10 sm:px-2 sm:text-sm ${keyClass(
                    keyboardStatus[letter],
                  )}`}
                >
                  {letter}
                </button>
              ))}
            </div>
          ))}

          <div className="flex justify-center gap-2 pt-2">
            <button
              type="button"
              onClick={removeLetter}
              disabled={gameStatus !== "playing"}
              className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-300 hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Backspace
            </button>

            <button
              type="button"
              onClick={() => void submitGuess()}
              disabled={gameStatus !== "playing"}
              className="rounded-xl border border-slate-700 bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              Enter
            </button>
          </div>
        </div>
      </section>

      <aside className="space-y-6">
        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="font-semibold text-white">Score</h3>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <ScoreBox label="Current" value={currentScore} />
            <ScoreBox label="Best" value={maxScore} />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
          <h3 className="font-semibold text-white">Settings</h3>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-400">
            <li>4 letters: fast warm-up.</li>
            <li>5 letters: classic Wordle.</li>
            <li>6–7 letters: harder challenge.</li>
            <li>Easy uses local common words. Hard can use Datamuse when available.</li>
          </ul>
        </section>
      </aside>
    </div>
    </div>
  );
}

function ScoreBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4 text-center">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-white">{value}</p>
    </div>
  );
}
