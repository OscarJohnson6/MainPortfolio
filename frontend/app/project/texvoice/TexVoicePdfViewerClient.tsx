"use client";

import dynamic from "next/dynamic";

const TexVoicePdfViewer = dynamic(() => import("./TexVoicePdfViewer"), {
  ssr: false,
  loading: () => (
    <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-500">
      Loading PDF viewer...
    </div>
  ),
});

export default TexVoicePdfViewer;
