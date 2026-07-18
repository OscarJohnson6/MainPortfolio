"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import type { PDFDocumentProxy } from "pdfjs-dist";

import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type PdfViewMode = "auto" | "single" | "continuous";

type MiniChapter = {
  title: string;
  start_seconds: number;
  end_seconds: number | null;
  kind: string;
  word_count: number;
};

type TexVoicePdfViewerProps = {
  title: string;
  pdfUrl: string;
  className?: string;
  audioUrl?: string | null;
  audioLabel?: string | null;
  currentTime?: number;
  duration?: number;
  isAudioPlaying?: boolean;
  activeChapter?: MiniChapter | null;
  chapters?: MiniChapter[];
  onSeek?: (seconds: number) => void;
  onTogglePlay?: () => void;
  onPdfTextSelected?: (text: string) => void;
};

const CONTINUOUS_PAGE_LIMIT = 8;
const PRELOAD_BEFORE = 1;
const PRELOAD_AFTER = 2;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getPageNumbers(numPages: number) {
  return Array.from({ length: numPages }, (_, index) => index + 1);
}

function formatTimestamp(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  }

  return `${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function getAudioPercent(currentTime: number, duration: number) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return clamp((currentTime / duration) * 100, 0, 100);
}

export default function TexVoicePdfViewer({
  title,
  pdfUrl,
  className = "",
  audioUrl = null,
  audioLabel = null,
  currentTime = 0,
  duration = 0,
  isAudioPlaying = false,
  activeChapter = null,
  chapters = [],
  onSeek,
  onTogglePlay,
  onPdfTextSelected,
}: TexVoicePdfViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [scale, setScale] = useState(1.05);
  const [viewMode, setViewMode] = useState<PdfViewMode>("auto");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [selectedPdfText, setSelectedPdfText] = useState<string | null>(null);

  const file = useMemo(() => ({ url: pdfUrl, withCredentials: false }), [pdfUrl]);

  const resolvedViewMode = useMemo<"single" | "continuous">(() => {
    if (viewMode === "continuous") return "continuous";
    if (viewMode === "single") return "single";
    return numPages > 0 && numPages <= CONTINUOUS_PAGE_LIMIT ? "continuous" : "single";
  }, [numPages, viewMode]);

  const renderedPages = useMemo(() => {
    if (numPages <= 0) return [];

    if (resolvedViewMode === "continuous") {
      return getPageNumbers(numPages);
    }

    const start = clamp(pageNumber - PRELOAD_BEFORE, 1, numPages);
    const end = clamp(pageNumber + PRELOAD_AFTER, 1, numPages);
    const pages: number[] = [];

    for (let page = start; page <= end; page += 1) {
      pages.push(page);
    }

    return pages;
  }, [numPages, pageNumber, resolvedViewMode]);

  function handleLoadSuccess(pdf: PDFDocumentProxy) {
    setNumPages(pdf.numPages);
    setPageNumber(1);
    setPageInput("1");
    setLoadError(null);
  }

  function goToPage(nextPage: number) {
    const next = clamp(nextPage, 1, Math.max(numPages, 1));
    setPageNumber(next);
    setPageInput(String(next));
  }

  function submitPageJump(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsed = Number(pageInput);
    if (!Number.isFinite(parsed)) {
      setPageInput(String(pageNumber));
      return;
    }

    goToPage(Math.trunc(parsed));
  }

  function seekAudio(seconds: number) {
    if (!onSeek) return;
    onSeek(clamp(seconds, 0, Math.max(duration, 0)));
  }

  useEffect(() => {
    if (!isFullscreen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isFullscreen]);

  function handlePdfTextSelection() {
    const selected = window.getSelection()?.toString().replace(/\s+/g, " ").trim();
    if (!selected || selected.length < 3) return;

    const trimmed = selected.length > 160 ? `${selected.slice(0, 160).trim()}...` : selected;
    setSelectedPdfText(trimmed);
    onPdfTextSelected?.(trimmed);
  }

  const controls = (
    <div className="flex flex-col gap-3 border-b border-zinc-800 bg-zinc-950/95 p-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-zinc-200">{title}</p>
        <p className="text-xs text-zinc-500">
          {numPages > 0
            ? resolvedViewMode === "continuous"
              ? `${numPages} pages • continuous view`
              : `Page ${pageNumber} of ${numPages} • preloading ${PRELOAD_BEFORE} back / ${PRELOAD_AFTER} ahead`
            : "Loading PDF preview..."}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <div className="flex rounded-lg border border-zinc-800 bg-zinc-900 p-1">
          {(["auto", "single", "continuous"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={`rounded-md px-2.5 py-1.5 text-xs capitalize transition ${
                viewMode === mode
                  ? "bg-zinc-100 text-zinc-950"
                  : "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              }`}
            >
              {mode}
            </button>
          ))}
        </div>

        <form onSubmit={submitPageJump} className="flex items-center gap-2">
          <span className="text-xs text-zinc-500">Page</span>
          <input
            value={pageInput}
            onChange={(event) => setPageInput(event.target.value)}
            disabled={numPages === 0}
            className="w-16 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 disabled:opacity-40"
          />
          <span className="text-xs text-zinc-500">/ {numPages || "?"}</span>
        </form>

        <button
          type="button"
          onClick={() => goToPage(pageNumber - 1)}
          disabled={numPages === 0 || pageNumber <= 1 || resolvedViewMode === "continuous"}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Prev
        </button>

        <button
          type="button"
          onClick={() => goToPage(pageNumber + 1)}
          disabled={numPages === 0 || pageNumber >= numPages || resolvedViewMode === "continuous"}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>

        <button
          type="button"
          onClick={() => setScale((value) => clamp(Number((value - 0.1).toFixed(2)), 0.6, 2.2))}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
        >
          −
        </button>

        <span className="min-w-14 text-center text-xs text-zinc-400">{Math.round(scale * 100)}%</span>

        <button
          type="button"
          onClick={() => setScale((value) => clamp(Number((value + 0.1).toFixed(2)), 0.6, 2.2))}
          className="rounded-lg border border-zinc-700 px-3 py-1.5 text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
        >
          +
        </button>

        <button
          type="button"
          onClick={() => setIsFullscreen((value) => !value)}
          className="rounded-lg border border-cyan-700/70 px-3 py-1.5 text-cyan-100 transition hover:border-cyan-400 hover:bg-cyan-400/10"
        >
          {isFullscreen ? "Exit" : "Fullscreen"}
        </button>
      </div>
    </div>
  );

  const documentSurface = (
    <div className="h-full overflow-auto bg-zinc-900 p-4">
      {selectedPdfText && (
        <div className="sticky top-0 z-10 mb-3 rounded-xl border border-cyan-700/60 bg-cyan-950/80 p-3 text-sm text-cyan-100 backdrop-blur">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <p className="line-clamp-2">Selected for Start at: “{selectedPdfText}”</p>
            <button
              type="button"
              onClick={() => setSelectedPdfText(null)}
              className="self-start rounded-lg border border-cyan-700/70 px-3 py-1 text-xs text-cyan-100 transition hover:border-cyan-300 hover:bg-cyan-400/10 md:self-auto"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {loadError ? (
        <div className="rounded-xl border border-red-900/70 bg-red-950/40 p-4 text-sm text-red-200">
          {loadError}
        </div>
      ) : (
        <Document
          key={pdfUrl}
          file={file}
          loading={<p className="text-sm text-zinc-500">Loading PDF...</p>}
          error={<p className="text-sm text-red-200">Could not render this PDF.</p>}
          onLoadSuccess={handleLoadSuccess}
          onLoadError={(error) => setLoadError(error.message)}
        >
          <div className="relative flex min-w-max flex-col items-center gap-6">
            {renderedPages.map((page) => {
              const isCurrentPage = page === pageNumber;
              const isHiddenPreload = resolvedViewMode === "single" && !isCurrentPage;

              return (
                <div
                  key={page}
                  aria-hidden={isHiddenPreload}
                  onMouseUp={handlePdfTextSelection}
                  className={isHiddenPreload ? "absolute -left-[99999px] top-0 h-0 overflow-hidden" : "flex justify-center"}
                >
                  <Page
                    pageNumber={page}
                    scale={scale}
                    renderAnnotationLayer
                    renderTextLayer
                    loading={<p className="text-sm text-zinc-500">Loading page {page}...</p>}
                  />
                </div>
              );
            })}
          </div>
        </Document>
      )}
    </div>
  );

  const miniMenu = (
    <aside className="flex min-h-0 flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Audio</p>
        <h3 className="mt-2 line-clamp-2 text-base font-semibold text-zinc-100">
          {activeChapter?.title ?? title}
        </h3>
        <p className="mt-1 text-xs text-zinc-500">
          {audioLabel ?? (audioUrl ? "Selected audio" : "No audio selected")}
        </p>
      </div>

      {audioUrl ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onTogglePlay}
              disabled={!onTogglePlay}
              className="rounded-xl bg-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAudioPlaying ? "Pause" : "Play"}
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-zinc-400">
                {formatTimestamp(currentTime)} / {duration > 0 ? formatTimestamp(duration) : "--:--"}
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-emerald-300 transition-all duration-300"
                  style={{ width: `${getAudioPercent(currentTime, duration)}%` }}
                />
              </div>
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={duration > 0 ? duration : 0}
            step={0.1}
            value={duration > 0 ? clamp(currentTime, 0, duration) : 0}
            onChange={(event) => seekAudio(Number(event.target.value))}
            disabled={!onSeek || duration <= 0}
            className="mt-3 w-full accent-emerald-300 disabled:opacity-40"
          />
        </div>
      ) : (
        <p className="rounded-2xl border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-500">
          Generate or select audio to use the fullscreen mini player.
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 p-3">
          <p className="text-sm font-medium text-zinc-200">Timestamps</p>
          <p className="text-xs text-zinc-500">Jump audio while reading</p>
        </div>

        <div className="max-h-full space-y-2 overflow-y-auto p-3">
          {chapters.length === 0 && (
            <p className="text-sm text-zinc-500">Timestamps appear after generation.</p>
          )}

          {chapters.map((chapter) => {
            const isActive =
              activeChapter?.start_seconds === chapter.start_seconds &&
              activeChapter?.title === chapter.title;

            return (
              <button
                key={`${chapter.start_seconds}-${chapter.title}`}
                type="button"
                onClick={() => seekAudio(chapter.start_seconds)}
                disabled={!onSeek}
                className={`w-full rounded-xl border p-3 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${
                  isActive
                    ? "border-emerald-300 bg-emerald-300/10 text-emerald-100"
                    : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="line-clamp-2 font-medium">{chapter.title}</span>
                  <span className="shrink-0 text-xs text-zinc-500">{formatTimestamp(chapter.start_seconds)}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {chapter.kind} • {chapter.word_count} words
                </p>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );

  return (
    <>
      <div className={`overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 ${className}`}>
        {controls}
        <div className="h-[36rem]">{documentSurface}</div>
      </div>

      {isFullscreen && (
        <div className="fixed inset-0 z-[9999] overflow-hidden bg-zinc-950 p-4 text-zinc-100">
          <div className="grid h-full min-h-0 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
            <section className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
              {controls}
              <div className="min-h-0 flex-1">{documentSurface}</div>
            </section>

            {miniMenu}
          </div>
        </div>
      )}
    </>
  );
}
