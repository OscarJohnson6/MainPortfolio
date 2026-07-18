"use client";

import type { TexVoiceLibraryItem } from "./types";

type TexVoiceLibraryPanelProps = {
  items: TexVoiceLibraryItem[];
  selectedSlug?: string | null;
  isLoading?: boolean;
  error?: string | null;
  onSelect: (item: TexVoiceLibraryItem) => void;
};

export default function TexVoiceLibraryPanel({
  items,
  selectedSlug,
  isLoading = false,
  error = null,
  onSelect,
}: TexVoiceLibraryPanelProps) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5">
      <div className="mb-4">
        <p className="font-medium">Archive examples</p>
        <p className="text-sm text-zinc-500">
          Imported LaTeX notes and PDFs from backend/imports/latex.
        </p>
      </div>

      {isLoading && (
        <p className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 text-sm text-zinc-500">
          Loading archive...
        </p>
      )}

      {error && (
        <p className="rounded-2xl border border-red-900/70 bg-red-950/40 p-3 text-sm text-red-200">
          {error}
        </p>
      )}

      {!isLoading && !error && items.length === 0 && (
        <p className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-950 p-4 text-sm text-zinc-500">
          No archive items found. Add .tex and .pdf pairs to backend/imports/latex.
        </p>
      )}

      <div className="space-y-2">
        {items.map((item) => {
          const isSelected = selectedSlug === item.slug;

          return (
            <button
              key={item.slug}
              type="button"
              onClick={() => onSelect(item)}
              className={`w-full rounded-2xl border p-3 text-left text-sm transition ${
                isSelected
                  ? "border-cyan-400 bg-cyan-400/10 text-cyan-100"
                  : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <span className="font-medium">{item.title}</span>
                <span className="shrink-0 text-xs text-zinc-500">
                  {item.pdf_url ? "PDF" : "No PDF"}
                </span>
              </div>

              <p className="mt-1 text-xs text-zinc-500">
                {item.source_filename ?? "No source"}
                {item.audio_url ? " • audio ready" : " • audio not generated"}
                {item.chapters_json_url ? " • chapters ready" : ""}
              </p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
