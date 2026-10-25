/**
 * Minimal Markdown block parser for TexVoice's document view. It mirrors the
 * backend's md_cleaner.py closely enough that read-along highlighting can
 * match each spoken sentence to the block it came from.
 *
 * Not a full CommonMark implementation: notes use headings, paragraphs,
 * lists, tables, quotes, code and math, and that's what's handled.
 */

export type MarkdownBlock =
  | { kind: "heading"; level: number; text: string; unit: number }
  | { kind: "paragraph"; text: string; unit: number }
  | { kind: "quote"; text: string; unit: number }
  | { kind: "list"; ordered: boolean; items: { text: string; depth: number; unit: number }[] }
  | { kind: "table"; header: string[]; rows: string[][]; units: number[] }
  | { kind: "code"; language: string; text: string; unit: number }
  | { kind: "math"; tex: string; unit: number }
  | { kind: "rule" };

export type ParsedMarkdown = {
  blocks: MarkdownBlock[];
  /** Plain text of every highlightable unit, in reading order (index = unit id). */
  units: string[];
};

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCE = /^(```+|~~~+)\s*([\w+-]*)/;
const BULLET = /^(\s*)[-*+]\s+(?:\[[ xX]\]\s+)?(.*)$/;
const NUMBERED = /^(\s*)\d+[.)]\s+(.*)$/;
const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;

/** The words a reader sees, without Markdown syntax (for matching speech). */
export function inlinePlainText(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/([*_])(?!\s)(.+?)(?<!\s)\1/g, "$2")
    .replace(/~~(.+?)~~/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function tableCells(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|")) row = row.slice(0, -1);
  return row.split(/(?<!\\)\|/).map((cell) => cell.trim());
}

export function parseMarkdown(source: string): ParsedMarkdown {
  const text = source
    .replace(/\r\n/g, "\n")
    .replace(/^---\n[\s\S]*?\n---\n/, "") // YAML front matter
    .replace(/<!--[\s\S]*?-->/g, "");
  const lines = text.split("\n");
  const blocks: MarkdownBlock[] = [];
  const units: string[] = [];
  const unit = (plain: string) => units.push(plain) - 1;

  let paragraph: string[] = [];
  let list: Extract<MarkdownBlock, { kind: "list" }> | null = null;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const joined = paragraph.join(" ");
    blocks.push({ kind: "paragraph", text: joined, unit: unit(inlinePlainText(joined)) });
    paragraph = [];
  };
  const closeList = () => {
    if (list) blocks.push(list);
    list = null;
  };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const stripped = line.trim();

    const fence = FENCE.exec(stripped);
    if (fence) {
      flushParagraph();
      closeList();
      const body: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1].slice(0, 3))) {
        body.push(lines[i]);
        i += 1;
      }
      blocks.push({ kind: "code", language: fence[2].toLowerCase(), text: body.join("\n"), unit: unit("") });
      continue;
    }

    if (stripped.startsWith("$$") && !(stripped.length > 4 && stripped.endsWith("$$"))) {
      flushParagraph();
      closeList();
      const body = [stripped.slice(2)];
      i += 1;
      while (i < lines.length && !lines[i].includes("$$")) {
        body.push(lines[i]);
        i += 1;
      }
      if (i < lines.length) body.push(lines[i].split("$$")[0]);
      blocks.push({ kind: "math", tex: body.join("\n").trim(), unit: unit("") });
      continue;
    }
    if (stripped.length > 4 && stripped.startsWith("$$") && stripped.endsWith("$$")) {
      flushParagraph();
      closeList();
      blocks.push({ kind: "math", tex: stripped.slice(2, -2).trim(), unit: unit("") });
      continue;
    }

    if (!stripped) {
      flushParagraph();
      continue;
    }

    const heading = HEADING.exec(stripped);
    if (heading) {
      flushParagraph();
      closeList();
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2], unit: unit(inlinePlainText(heading[2])) });
      continue;
    }

    if (stripped.includes("|") && i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1])) {
      flushParagraph();
      closeList();
      const header = tableCells(stripped);
      const rows: string[][] = [];
      const tableUnits = [unit(header.map(inlinePlainText).join(" "))];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        const cells = tableCells(lines[i]);
        rows.push(cells);
        tableUnits.push(unit(cells.map(inlinePlainText).join(" ")));
        i += 1;
      }
      i -= 1;
      blocks.push({ kind: "table", header, rows, units: tableUnits });
      continue;
    }

    if (RULE.test(stripped)) {
      flushParagraph();
      closeList();
      blocks.push({ kind: "rule" });
      continue;
    }

    const item = BULLET.exec(line) ?? NUMBERED.exec(line);
    if (item) {
      flushParagraph();
      const ordered = !BULLET.test(line);
      const depth = Math.floor(item[1].replace(/\t/g, "    ").length / 2);
      if (!list || (depth === 0 && list.ordered !== ordered)) {
        closeList();
        list = { kind: "list", ordered, items: [] };
      }
      list.items.push({ text: item[2], depth, unit: unit(inlinePlainText(item[2])) });
      continue;
    }

    // Indented continuation of the last list item.
    const currentList = list as Extract<MarkdownBlock, { kind: "list" }> | null;
    if (currentList && /^\s/.test(line) && currentList.items.length) {
      const last = currentList.items[currentList.items.length - 1];
      last.text += ` ${stripped}`;
      units[last.unit] = inlinePlainText(last.text);
      continue;
    }

    closeList();
    if (stripped.startsWith(">")) {
      flushParagraph();
      const quote = stripped.replace(/^(>\s?)+/, "");
      blocks.push({ kind: "quote", text: quote, unit: unit(inlinePlainText(quote)) });
      continue;
    }
    paragraph.push(stripped);
  }

  flushParagraph();
  closeList();
  return { blocks, units };
}
