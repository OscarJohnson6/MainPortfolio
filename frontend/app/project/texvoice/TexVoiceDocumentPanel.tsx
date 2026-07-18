"use client";

import type { Chapter } from "./types";
import TexVoicePdfViewer from "./TexVoicePdfViewerClient";

type TexVoiceDocumentPanelProps = {
  title: string;
  pdfUrl?: string | null;
  sourceUrl?: string | null;
  activeChapter?: Chapter | null;
};

export default function TexVoiceDocumentPanel({
  title,
  pdfUrl,
  sourceUrl,
  activeChapter,
}: TexVoiceDocumentPanelProps) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900/70 p-5">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm text-zinc-500">Document preview</p>
          <h2 className="text-xl font-semibold text-zinc-100">{title}</h2>

          {activeChapter ? (
            <p className="mt-1 text-sm text-emerald-300">
              Active section: {activeChapter.title}
            </p>
          ) : (
            <p className="mt-1 text-sm text-zinc-500">
              Select an archive item or generate audio to preview a document.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 text-sm">
          {sourceUrl && (
            <a
              href={sourceUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-zinc-700 px-4 py-2 text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-800"
            >
              Source
            </a>
          )}
        </div>
      </div>

      {pdfUrl ? (
        <TexVoicePdfViewer title={title} pdfUrl={pdfUrl} />
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-700 bg-zinc-950 p-8 text-center text-sm text-zinc-500">
          No PDF is available for this document yet.
        </div>
      )}
    </section>
  );
}
