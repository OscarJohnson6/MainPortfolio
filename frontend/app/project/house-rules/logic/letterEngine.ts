// ─────────────────────────────────────────────────────────────────
// letterEngine.ts — pure game logic for Alphabet Mode
//
// KEY DESIGN: Words are detected in DRAW ORDER only.
// Letters S, A, E in that order = "SAE" (not a word).
// Letters S, E, A in that order = "SEA" (valid word!).
// Any contiguous subsequence in draw order is checked.
// ─────────────────────────────────────────────────────────────────

export interface LetterTile {
  letter: string;   // 'A'–'Z'
  value:  number;   // 1–26
  isVowel: boolean;
  id: string;
}

// A = 1 … Z = 26
export const LETTER_VALUES: Record<string, number> = {
  A:1,  B:2,  C:3,  D:4,  E:5,  F:6,  G:7,  H:8,  I:9,  J:10,
  K:11, L:12, M:13, N:14, O:15, P:16, Q:17, R:18, S:19, T:20,
  U:21, V:22, W:23, X:24, Y:25, Z:26,
};

const VOWELS = new Set(['A','E','I','O','U']);

// Scrabble-inspired weighted distribution
const DIST: Record<string, number> = {
  A:9, B:2, C:2, D:4, E:12, F:2, G:3, H:2, I:9, J:1,
  K:1, L:4, M:2, N:6,  O:8, P:2, Q:1, R:6, S:4, T:6,
  U:4, V:2, W:2, X:1,  Y:2, Z:1,
};

let _ltId = 0;

export function createLetterDeck(): LetterTile[] {
  const deck: LetterTile[] = [];
  for (const [letter, count] of Object.entries(DIST)) {
    for (let i = 0; i < count; i++) {
      deck.push({
        letter, value: LETTER_VALUES[letter],
        isVowel: VOWELS.has(letter), id: `${letter}${_ltId++}`,
      });
    }
  }
  return deck;
}

export function letterHandValue(hand: LetterTile[]): number {
  return hand.reduce((s, t) => s + t.value, 0);
}

// ─── Ordered word detection ───────────────────────────────────────
// Checks CONTIGUOUS SUBSEQUENCES in draw order only.
// findWordInSequence(['S','E','A']) → { word:'SEA', startIdx:0, endIdx:2 }
// findWordInSequence(['S','A','E']) → null  (SAE is not a word)

export interface FoundWord {
  word: string;
  startIdx: number;  // inclusive
  endIdx: number;    // inclusive
}

export function findWordInSequence(
  letters: string[],
  wordSet: Set<string>,
  minLength = 3,
): FoundWord | null {
  // Guard: wordSet may be undefined if caller forgets to pass it
  if (!wordSet || letters.length === 0) return null;
  let best: FoundWord | null = null;

  for (let start = 0; start < letters.length; start++) {
    for (let end = start + minLength; end <= letters.length; end++) {
      const candidate = letters.slice(start, end).join('');
      if (wordSet.has(candidate)) {
        if (!best || candidate.length > best.word.length) {
          best = { word: candidate, startIdx: start, endIdx: end - 1 };
        }
      }
    }
  }

  return best;
}

// Convenience wrapper for the game
export interface WordClearStatus {
  word: string | null;
  wordStart: number;    // -1 if no word
  wordEnd: number;      // -1 if no word (inclusive)
  isWordClear: boolean;     // word found + value > target (bust saved)
  isPerfectClear: boolean;  // word found + value === target
  isWordBonus: boolean;     // word found + value < target (nice bonus)
}

export function getWordStatus(
  hand: LetterTile[],
  target: number,
  wordSet: Set<string>,
  minLength = 3,
): WordClearStatus {
  if (!wordSet) {
    const val = letterHandValue(hand);
    return { word: null, wordStart: -1, wordEnd: -1,
      isWordClear: false, isPerfectClear: false, isWordBonus: false };
  }
  const letters = hand.map(t => t.letter);
  const result  = findWordInSequence(letters, wordSet, minLength);
  const val     = letterHandValue(hand);
  return {
    word:           result?.word ?? null,
    wordStart:      result?.startIdx ?? -1,
    wordEnd:        result?.endIdx   ?? -1,
    isPerfectClear: !!result && val === target,
    isWordClear:    !!result && val > target,
    isWordBonus:    !!result && val < target,
  };
}

// ─── Dealer AI ────────────────────────────────────────────────────
// Dealer draws from previewPool first (fully visible to player),
// then falls back to deck. Uses ordered word detection same as player.

export function letterDealerAI(
  dealerHand: LetterTile[],
  previewPool: LetterTile[],  // visible to player; drawn first, in order
  deck: LetterTile[],         // fallback if pool exhausted
  playerValue: number,
  playerHasWord: boolean,
  target: number,
  wordSet: Set<string>,
): { steps: LetterTile[][], finalHand: LetterTile[] } {
  let dHand = [...dealerHand];
  const drawSequence = [...previewPool, ...deck];
  let drawIdx = 0;
  const steps: LetterTile[][] = [];

  for (let i = 0; i < 10; i++) {
    const dVal    = letterHandValue(dHand);
    const dResult = findWordInSequence(dHand.map(t => t.letter), wordSet);
    const dWord   = dResult?.word ?? null;

    // Important: a dealer over target with no word has busted.
    // Previously the dealer could keep drawing far past the target until the pool was empty.
    if (dVal > target && !dWord) break;

    const beatsValue = !playerHasWord && dVal >= playerValue && dVal <= target;
    const contestsWord = playerHasWord && !!dWord;
    if (beatsValue || contestsWord) break;
    if (drawIdx >= drawSequence.length) break;

    const tile = drawSequence[drawIdx++];
    dHand = [...dHand, tile];
    steps.push([...dHand]);
  }

  return { steps, finalHand: dHand };
}