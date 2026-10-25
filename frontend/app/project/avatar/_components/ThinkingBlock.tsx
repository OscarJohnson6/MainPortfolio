"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The model's reasoning, shown above its reply. Opens automatically while the
 * model is thinking, folds away once the answer starts; click to toggle.
 */
export default function ThinkingBlock({ text, live }: { text: string; live: boolean }) {
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? live;
  const boxRef = useRef<HTMLDivElement>(null);

  // Follow the newest reasoning while it streams in.
  useEffect(() => {
    if (live && open && boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight;
  }, [text, live, open]);

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => setManual(!open)}
        className="flex items-center gap-1.5 text-xs text-zinc-500 transition hover:text-zinc-300"
      >
        <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>▸</span>
        {live ? <span className="animate-pulse">Thinking…</span> : <span>Thought process · {words} words</span>}
      </button>
      {open && (
        <div
          ref={boxRef}
          className="mt-1.5 max-h-64 overflow-y-auto whitespace-pre-wrap border-l-2 border-zinc-700 pl-3 text-xs leading-relaxed text-zinc-500"
        >
          {text}
        </div>
      )}
    </div>
  );
}
