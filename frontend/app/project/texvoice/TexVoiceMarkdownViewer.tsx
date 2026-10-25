"use client";

import katex from "katex";
import "katex/dist/katex.min.css";
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import {
  alignSentences,
  buildBlockTextIndex,
  highlightedSentence,
  sentenceForSelection,
  type SentenceTiming,
} from "./highlight";
import { parseMarkdown } from "./markdown";

type Props = {
  title: string;
  markdown: string;
  currentTime?: number;
  timings?: SentenceTiming[] | null;
  onSeek?: (seconds: number) => void;
  onTextSelected?: (text: string) => void;
};

// Same look and timing as the PDF view, so both formats feel the same.
const MANUAL_SCROLL_PAUSE_MS = 5000;
const HIGHLIGHT_STYLE: CSSProperties = { backgroundColor: "rgba(250, 204, 21, 0.3)", boxShadow: "inset 3px 0 0 rgb(234, 179, 8)" };

function MathHtml({ tex, display }: { tex: string; display: boolean }) {
  // KaTeX escapes its input and never runs code, so its HTML is safe to insert.
  const html = useMemo(() => katex.renderToString(tex, { throwOnError: false, displayMode: display, strict: "ignore" }), [tex, display]);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

const INLINE = /(\$\$[^$]+\$\$|\$[^$\n]+?\$|`[^`]+`|!\[[^\]]*\]\([^)]*\)|\[[^\]]+\]\([^)]*\)|\*\*.+?\*\*|__.+?__|\*[^*\s][^*]*?\*|_[^_\s][^_]*?_|~~.+?~~)/g;

/** Render inline Markdown as React elements (no raw HTML from the file is ever inserted). */
function renderInline(text: string): ReactNode[] {
  const parts = text.split(INLINE);
  return parts.map((part, index) => {
    if (!part) return null;
    if (index % 2 === 0) return <Fragment key={index}>{part.replace(/<[^>]+>/g, "")}</Fragment>;

    if (part.startsWith("$$")) return <MathHtml key={index} tex={part.slice(2, -2)} display={false} />;
    if (part.startsWith("$")) return <MathHtml key={index} tex={part.slice(1, -1)} display={false} />;
    if (part.startsWith("`")) {
      return (
        <code key={index} className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[0.9em] text-zinc-200">
          {part.slice(1, -1)}
        </code>
      );
    }
    const image = /^!\[([^\]]*)\]\(([^)]*)\)$/.exec(part);
    if (image) {
      return (
        <span key={index} className="rounded border border-dashed border-zinc-700 px-1.5 py-0.5 text-sm italic text-zinc-500">
          image{image[1] ? `: ${image[1]}` : ""}
        </span>
      );
    }
    const link = /^\[([^\]]+)\]\(([^)\s]*)[^)]*\)$/.exec(part);
    if (link) {
      const safe = /^(https?:|mailto:)/i.test(link[2]);
      return safe ? (
        <a key={index} href={link[2]} target="_blank" rel="noreferrer" className="text-cyan-300 underline underline-offset-2">
          {renderInline(link[1])}
        </a>
      ) : (
        <Fragment key={index}>{renderInline(link[1])}</Fragment>
      );
    }
    if (part.startsWith("**") || part.startsWith("__")) return <strong key={index}>{renderInline(part.slice(2, -2))}</strong>;
    if (part.startsWith("~~")) return <del key={index}>{renderInline(part.slice(2, -2))}</del>;
    return <em key={index}>{renderInline(part.slice(1, -1))}</em>;
  });
}

const HEADING_CLASS: Record<number, string> = {
  1: "mt-2 text-2xl font-bold text-zinc-50",
  2: "mt-6 border-b border-zinc-800 pb-1 text-xl font-semibold text-zinc-100",
  3: "mt-5 text-lg font-semibold text-zinc-100",
};

export default function TexVoiceMarkdownViewer({ title, markdown, currentTime = 0, timings = null, onSeek, onTextSelected }: Props) {
  const [followAlong, setFollowAlong] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const lastManualScroll = useRef(0);

  const parsed = useMemo(() => parseMarkdown(markdown), [markdown]);
  const index = useMemo(() => buildBlockTextIndex(parsed.units), [parsed]);
  const matches = useMemo(() => (timings?.length ? alignSentences(timings, index) : []), [timings, index]);
  const placedCount = useMemo(() => matches.filter(Boolean).length, [matches]);

  const activeSentence = timings && matches.length ? highlightedSentence(timings, matches, currentTime) : -1;
  const activeMatch = activeSentence >= 0 ? matches[activeSentence] : null;
  const isActive = (unit: number) => activeMatch !== null && unit >= activeMatch.firstLine && unit <= activeMatch.lastLine;
  const unitProps = (unit: number) =>
    isActive(unit)
      ? { style: HIGHLIGHT_STYLE, "data-reading-pointer": unit === activeMatch?.firstLine ? "" : undefined }
      : {};

  // Follow along: keep the block being read in view.
  useEffect(() => {
    const surface = surfaceRef.current;
    if (!followAlong || activeSentence < 0 || !surface) return;
    if (Date.now() - lastManualScroll.current < MANUAL_SCROLL_PAUSE_MS) return;
    const target = surface.querySelector<HTMLElement>("[data-reading-pointer]");
    if (!target) return;
    const offset = target.getBoundingClientRect().top - surface.getBoundingClientRect().top - surface.clientHeight / 3;
    if (Math.abs(offset) > surface.clientHeight / 4) {
      surface.scrollTo({ top: surface.scrollTop + offset, behavior: "smooth" });
    }
  }, [activeSentence, followAlong]);

  function handleSelection() {
    const text = window.getSelection()?.toString().replace(/\s+/g, " ").trim();
    if (!text || text.length < 3) return;
    const trimmed = text.length > 160 ? `${text.slice(0, 160).trim()}...` : text;
    setSelected(trimmed);
    onTextSelected?.(trimmed);
  }

  function playFromSelection() {
    if (!selected || !timings || !onSeek) return;
    const sentence = sentenceForSelection(selected, index, matches, activeMatch?.lastWord ?? 0);
    if (sentence >= 0) {
      lastManualScroll.current = 0;
      onSeek(timings[sentence].start);
    }
  }

  const hasTimings = Boolean(timings?.length);
  const blockGap = "rounded-md px-2 -mx-2 transition-colors duration-200";

  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
      <div className="flex flex-col gap-2 border-b border-zinc-800 bg-zinc-950/95 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-zinc-200">{title}</p>
          <p className="text-xs text-zinc-500">
            Markdown view
            {hasTimings && ` • read-along: ${placedCount.toLocaleString()} of ${(timings?.length ?? 0).toLocaleString()} sentences placed`}
          </p>
        </div>
        {hasTimings && (
          <label
            className="flex items-center gap-2 self-start rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-300 sm:self-auto"
            title="Highlight the block being read and keep it in view. Scrolling by hand pauses this for a few seconds."
          >
            <input
              type="checkbox"
              checked={followAlong}
              onChange={(event) => {
                setFollowAlong(event.target.checked);
                lastManualScroll.current = 0;
              }}
              className="accent-emerald-300"
            />
            Follow along
          </label>
        )}
      </div>

      <div
        ref={surfaceRef}
        onWheel={() => (lastManualScroll.current = Date.now())}
        onTouchMove={() => (lastManualScroll.current = Date.now())}
        className="h-[36rem] overflow-auto bg-zinc-900 p-4"
      >
        {selected && (
          <div className="sticky top-0 z-10 mb-3 rounded-xl border border-cyan-700/60 bg-cyan-950/80 p-3 text-sm text-cyan-100 backdrop-blur">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <p className="line-clamp-2">Selected for Start at: “{selected}”</p>
              <div className="flex gap-2 self-start md:self-auto">
                {hasTimings && onSeek && (
                  <button
                    type="button"
                    onClick={playFromSelection}
                    className="rounded-lg border border-cyan-700/70 px-3 py-1 text-xs text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-400/10"
                  >
                    Play from here
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="rounded-lg border border-cyan-700/70 px-3 py-1 text-xs text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-400/10"
                >
                  Clear
                </button>
              </div>
            </div>
          </div>
        )}

        <article onMouseUp={handleSelection} className="mx-auto max-w-3xl space-y-3 rounded-xl bg-zinc-950 px-6 py-6 leading-7 text-zinc-300">
          {parsed.blocks.map((block, blockIndex) => {
            switch (block.kind) {
              case "heading": {
                const Tag = `h${Math.min(block.level, 6)}` as "h1";
                return (
                  <Tag key={blockIndex} className={`${HEADING_CLASS[block.level] ?? "mt-4 font-semibold text-zinc-100"} ${blockGap}`} {...unitProps(block.unit)}>
                    {renderInline(block.text)}
                  </Tag>
                );
              }
              case "paragraph":
                return (
                  <p key={blockIndex} className={blockGap} {...unitProps(block.unit)}>
                    {renderInline(block.text)}
                  </p>
                );
              case "quote":
                return (
                  <blockquote key={blockIndex} className={`border-l-2 border-zinc-600 pl-3 italic text-zinc-400 ${blockGap}`} {...unitProps(block.unit)}>
                    {renderInline(block.text)}
                  </blockquote>
                );
              case "list": {
                const ListTag = block.ordered ? "ol" : "ul";
                return (
                  <ListTag key={blockIndex} className={`space-y-1 pl-6 ${block.ordered ? "list-decimal" : "list-disc"}`}>
                    {block.items.map((item, itemIndex) => (
                      <li key={itemIndex} className={blockGap} style={{ marginLeft: `${item.depth * 1.25}rem`, ...(isActive(item.unit) ? HIGHLIGHT_STYLE : {}) }}
                        data-reading-pointer={isActive(item.unit) && item.unit === activeMatch?.firstLine ? "" : undefined}
                      >
                        {renderInline(item.text)}
                      </li>
                    ))}
                  </ListTag>
                );
              }
              case "table":
                return (
                  <div key={blockIndex} className="overflow-x-auto">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr {...unitProps(block.units[0])}>
                          {block.header.map((cell, cellIndex) => (
                            <th key={cellIndex} className="border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-left font-semibold text-zinc-100">
                              {renderInline(cell)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {block.rows.map((row, rowIndex) => (
                          <tr key={rowIndex} {...unitProps(block.units[rowIndex + 1])}>
                            {row.map((cell, cellIndex) => (
                              <td key={cellIndex} className="border border-zinc-800 px-3 py-1.5">
                                {renderInline(cell)}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              case "code":
                return (
                  <pre key={blockIndex} className="overflow-x-auto rounded-lg bg-zinc-900 p-3 font-mono text-xs leading-5 text-zinc-300">
                    {block.language && <span className="mb-1 block text-[10px] uppercase tracking-wider text-zinc-500">{block.language}</span>}
                    <code>{block.text}</code>
                  </pre>
                );
              case "math":
                return (
                  <div key={blockIndex} className="overflow-x-auto py-1 text-zinc-100">
                    <MathHtml tex={block.tex} display />
                  </div>
                );
              case "rule":
                return <hr key={blockIndex} className="border-zinc-800" />;
            }
          })}
        </article>
      </div>
    </div>
  );
}
