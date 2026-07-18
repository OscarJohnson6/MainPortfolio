"use client";

import { useState } from "react";
import { PythonTerminalDemo } from "./PythonTerminalDemo";
import { TerminalCanvas } from "./TerminalCanvas";

type Renderer = "python" | "rust";

export function TerminalFxShowcase() {
  const [activeRenderer, setActiveRenderer] = useState<Renderer>("python");

  return (
    <>
      <section className="mx-auto max-w-7xl px-6 pt-12">
        <div className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/60 p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">
              Renderer
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Only one Terminal FX renderer is mounted at a time.
            </p>
          </div>

          <div className="flex w-full rounded-2xl border border-slate-800 bg-slate-950 p-1 md:w-auto">
            <button
              type="button"
              onClick={() => setActiveRenderer("python")}
              aria-pressed={activeRenderer === "python"}
              className={`flex-1 rounded-xl px-5 py-2.5 text-sm font-semibold transition md:flex-none ${
                activeRenderer === "python"
                  ? "bg-cyan-300 text-slate-950"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
              }`}
            >
              Python
            </button>

            <button
              type="button"
              onClick={() => setActiveRenderer("rust")}
              aria-pressed={activeRenderer === "rust"}
              className={`flex-1 rounded-xl px-5 py-2.5 text-sm font-semibold transition md:flex-none ${
                activeRenderer === "rust"
                  ? "bg-cyan-300 text-slate-950"
                  : "text-slate-400 hover:bg-slate-900 hover:text-slate-100"
              }`}
            >
              Rust
            </button>
          </div>
        </div>
      </section>

      {activeRenderer === "python" ? (
        <PythonTerminalDemo key="python-renderer" />
      ) : (
        <TerminalCanvas key="rust-renderer" />
      )}
    </>
  );
}
