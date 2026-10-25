/**
 * Read-along highlighting: works out which PDF lines each spoken sentence
 * covers, so the viewer can highlight the line being read.
 *
 * The audio's timings.json says when each sentence of the speech script is
 * spoken. The PDF's text layer says where each word is drawn. The two texts
 * differ (math is spoken as "x squared" but printed as "x²", headings get
 * "Next topic." in front), so sentences are matched on the words they share.
 *
 * Matching walks forward through the PDF with a pointer, like a reader's
 * finger: each sentence is looked for just ahead of where the last one ended,
 * with a small window behind it for figures and tables LaTeX moved, and a
 * wider search only when nothing nearby matches.
 */
import type { PDFDocumentProxy } from "pdfjs-dist";

export type SentenceTiming = { start: number; end: number; text: string };
export type TimingsFile = { version: number; sentences: SentenceTiming[] };

/** A line of text on a page; the rect is in fractions of the page size (0–1). */
export type PdfLine = {
  page: number;
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * The words of a document in reading order, grouped into "lines": real lines
 * of a PDF page, or blocks (paragraphs, list items, table rows) of Markdown.
 */
export type TextIndex = {
  /** Every word in reading order, normalized. */
  words: string[];
  /** For each word, the index of the line it's on. */
  wordLine: number[];
  /** Positions of each word, for jumping straight to candidates. */
  positions: Map<string, number[]>;
};

export type PdfTextIndex = TextIndex & { lines: PdfLine[] };

/** Which words a sentence matched, or null when it couldn't be placed. */
export type SentenceMatch = { firstWord: number; lastWord: number; firstLine: number; lastLine: number } | null;

// How far behind the pointer to look (about 3–5 lines of text), and how far ahead.
const BACK_WINDOW = 40;
const NEAR_WINDOW = 400;
const SHORT_SENTENCE_WINDOW = 80;
const FAR_WINDOW = 4000;
// A matched word may sit at most this many PDF words after the previous one.
const MAX_GAP = 10;

export function tokenize(text: string): string[] {
  return (
    text
      .normalize("NFKC")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? []
  );
}

// Common words that appear on nearly every line, so they say little about where a sentence is.
const COMMON_WORDS = new Set(
  (
    "the and for are but not you all can was one our out has his how its may new now see two who did get let put " +
    "say she too use this that with from have they will which there their then than them these those what when " +
    "where into also each such only over were been more most some just very"
  ).split(" "),
);

// Words TexVoice adds while speaking that aren't in the document: list
// ordinals ("First."), heading and list intros ("Next topic.", "A few key
// points."), and skipped-content notices ("Table skipped."). Never matched on.
const SPOKEN_FILLER = new Set(
  (
    "first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth thirteenth " +
    "fourteenth fifteenth sixteenth seventeenth eighteenth nineteenth twentieth item next topic starting " +
    "part section subsection few key points skipped summary diagram graph image example"
  ).split(" "),
);

/**
 * Words worth matching on. Short and common words match almost anywhere, and
 * so do numbers: math is full of 0, 1, 2, so a formula would "match" whatever
 * digits come next and drag the pointer far ahead. Formulas are spoken
 * differently from how they're printed anyway, so they stay unplaced and the
 * highlight holds on the last line of prose until the reading catches up.
 */
function keyWords(tokens: string[]): string[] {
  const words = tokens.filter((word) => word.length >= 3 && /\p{L}/u.test(word) && !SPOKEN_FILLER.has(word));
  const keys = words.filter((word) => !COMMON_WORDS.has(word));
  // A sentence made only of common words ("This is the one.") still gets a try;
  // one made only of filler ("First.", "Next topic.") stays unplaced.
  return keys.length > 0 ? keys : words;
}

type TextItemLike = { str: string; transform: number[]; width: number; height: number; hasEOL?: boolean };

export async function buildPdfTextIndex(pdf: PDFDocumentProxy): Promise<PdfTextIndex> {
  const lines: PdfLine[] = [];
  const words: string[] = [];
  const wordLine: number[] = [];
  // A word split across lines by hyphenation ("differ-" / "entiation").
  let carry = "";

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    let lineTop = Number.NaN;
    let line: PdfLine | null = null;

    for (const raw of content.items) {
      if (!("str" in raw)) continue;
      const item = raw as TextItemLike;
      if (!item.str.trim()) continue;

      // PDF coordinates start at the bottom-left; flip to top-left fractions.
      const fontHeight = Math.hypot(item.transform[2], item.transform[3]) || item.height;
      const left = item.transform[4] / viewport.width;
      const top = (viewport.height - item.transform[5] - fontHeight * 0.85) / viewport.height;
      const width = item.width / viewport.width;
      const height = (fontHeight * 1.15) / viewport.height;

      // Same baseline (within half a line) means the same line; sub/superscripts stay with it.
      const sameLine = line !== null && Math.abs(top - lineTop) < height * 0.5;
      if (!sameLine) {
        line = { page: pageNumber, left, top, width, height };
        lines.push(line);
        lineTop = top;
      } else if (line) {
        const right = Math.max(line.left + line.width, left + width);
        const bottom = Math.max(line.top + line.height, top + height);
        line.left = Math.min(line.left, left);
        line.top = Math.min(line.top, top);
        line.width = right - line.left;
        line.height = bottom - line.top;
      }

      const lineIndex = lines.length - 1;
      const tokens = tokenize(item.str);
      tokens.forEach((token, index) => {
        let word = token;
        if (index === 0 && carry) {
          word = carry + token;
          carry = "";
        }
        const isLast = index === tokens.length - 1;
        if (isLast && /[\p{L}]-\s*$/u.test(item.str)) {
          carry = word;
          return;
        }
        words.push(word);
        wordLine.push(lineIndex);
      });
    }
  }

  if (carry) {
    words.push(carry);
    wordLine.push(lines.length - 1);
  }

  return { lines, words, wordLine, positions: positionsOf(words) };
}

function positionsOf(words: string[]): Map<string, number[]> {
  const positions = new Map<string, number[]>();
  words.forEach((word, index) => {
    const list = positions.get(word);
    if (list) list.push(index);
    else positions.set(word, [index]);
  });
  return positions;
}

/** Index plain-text blocks (e.g. rendered Markdown); block i becomes "line" i. */
export function buildBlockTextIndex(blocks: string[]): TextIndex {
  const words: string[] = [];
  const wordLine: number[] = [];
  blocks.forEach((text, blockIndex) => {
    for (const word of tokenize(text)) {
      words.push(word);
      wordLine.push(blockIndex);
    }
  });
  return { words, wordLine, positions: positionsOf(words) };
}

function firstIndexAtLeast(sorted: number[], value: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

type Candidate = { matched: number; first: number; last: number };

/** Greedily match `keys` in order starting near `start`, allowing small gaps. */
function matchFrom(index: TextIndex, keys: string[], start: number): Candidate {
  let cursor = Math.max(0, start);
  let matched = 0;
  let first = -1;
  let last = -1;

  for (const key of keys) {
    const limit = Math.min(index.words.length, cursor + (matched === 0 ? 4 : MAX_GAP));
    for (let pos = cursor; pos < limit; pos += 1) {
      if (index.words[pos] === key) {
        matched += 1;
        if (first < 0) first = pos;
        last = pos;
        cursor = pos + 1;
        break;
      }
    }
  }
  return { matched, first, last };
}

function findBest(index: TextIndex, keys: string[], pointer: number, back: number, ahead: number): Candidate | null {
  const lo = Math.max(0, pointer - back);
  const hi = Math.min(index.words.length, pointer + ahead);
  let best: Candidate | null = null;
  let bestDistance = Infinity;

  // Candidate starts: anywhere one of the sentence's first few key words appears.
  for (const key of new Set(keys.slice(0, 3))) {
    const list = index.positions.get(key);
    if (!list) continue;
    for (let i = firstIndexAtLeast(list, lo); i < list.length && list[i] < hi; i += 1) {
      const candidate = matchFrom(index, keys, list[i] - 1);
      if (candidate.matched === 0) continue;
      // Prefer more matched words, then the spot closest ahead of the pointer;
      // going backwards counts double so the pointer doesn't drift back.
      const offset = candidate.first - pointer;
      const distance = offset >= 0 ? offset : -offset * 2;
      if (!best || candidate.matched > best.matched || (candidate.matched === best.matched && distance < bestDistance)) {
        best = candidate;
        bestDistance = distance;
      }
    }
  }
  return best;
}

function accepted(candidate: Candidate | null, keyCount: number): candidate is Candidate {
  if (!candidate) return false;
  if (keyCount <= 2) return candidate.matched === keyCount;
  return candidate.matched >= 2 && candidate.matched / keyCount >= 0.5;
}

/** Big jumps need much stronger evidence, since a wrong one strands the pointer. */
function acceptedFar(candidate: Candidate | null, keyCount: number): candidate is Candidate {
  return candidate !== null && candidate.matched >= 4 && candidate.matched / keyCount >= 0.75;
}

// After this many prose sentences in a row fail to place, assume the pointer
// went wrong and look for the reading position anywhere in the document.
const MISSES_BEFORE_RECOVERY = 6;

/** Place every spoken sentence in the PDF, in order. */
export function alignSentences(sentences: SentenceTiming[], index: TextIndex): SentenceMatch[] {
  let pointer = 0;
  let misses = 0;
  const everywhere = index.words.length;

  return sentences.map((sentence) => {
    const keys = keyWords(tokenize(sentence.text));
    if (keys.length === 0) return null;

    // One or two words ("Derivatives.") match too many places to risk going
    // backwards, so short sentences only look a little way ahead.
    const short = keys.length <= 2;
    let candidate = findBest(index, keys, pointer, short ? 0 : BACK_WINDOW, short ? SHORT_SENTENCE_WINDOW : NEAR_WINDOW);

    if (!accepted(candidate, keys.length)) {
      candidate = null;
      // Nothing nearby: try much further ahead, but only on strong evidence.
      if (keys.length >= 4) {
        const far = findBest(index, keys, pointer, BACK_WINDOW, FAR_WINDOW);
        if (acceptedFar(far, keys.length)) candidate = far;
      }
      // Still lost after several sentences: the pointer probably jumped wrong
      // earlier. Search the whole document, backwards included, to get back on track.
      if (!candidate && keys.length >= 4 && misses >= MISSES_BEFORE_RECOVERY) {
        const anywhere = findBest(index, keys, pointer, everywhere, everywhere);
        if (acceptedFar(anywhere, keys.length)) candidate = anywhere;
      }
    }

    if (!candidate) {
      if (keys.length >= 4) misses += 1;
      return null;
    }

    misses = 0;
    pointer = candidate.last + 1;
    return {
      firstWord: candidate.first,
      lastWord: candidate.last,
      firstLine: index.wordLine[candidate.first],
      lastLine: index.wordLine[candidate.last],
    };
  });
}

/** Index of the sentence being spoken at `time`, or -1 before the first one. */
export function sentenceAt(sentences: SentenceTiming[], time: number): number {
  let lo = 0;
  let hi = sentences.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sentences[mid].start <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

/**
 * The sentence to highlight at `time`: the one being spoken, or, if that one
 * couldn't be placed in the PDF (e.g. "Next topic."), the last one that was,
 * so the highlight holds still instead of flickering off.
 */
export function highlightedSentence(sentences: SentenceTiming[], matches: SentenceMatch[], time: number): number {
  for (let i = sentenceAt(sentences, time); i >= 0; i -= 1) {
    if (matches[i]) return i;
  }
  return -1;
}

/** Find selected PDF text and return the sentence that reads it, preferring spots near `nearWord`. */
export function sentenceForSelection(
  selection: string,
  index: TextIndex,
  matches: SentenceMatch[],
  nearWord: number,
): number {
  const keys = keyWords(tokenize(selection)).slice(0, 12);
  if (keys.length === 0) return -1;

  const hit = findBest(index, keys, nearWord, index.words.length, index.words.length);
  if (!hit || hit.matched < Math.min(keys.length, 2)) return -1;

  // The first sentence that reaches the selected words.
  return matches.findIndex((match) => match !== null && match.lastWord >= hit.first);
}

/** Make a sentence comparable across regenerated audio (for resuming). */
export function sentenceKey(text: string): string {
  return tokenize(text).join(" ");
}
