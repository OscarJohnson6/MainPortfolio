"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import { useCanvasEngine, ColorIdx, ModeEntry } from "./useCanvasEngine";

const COLOR_OPTIONS: { label: string; idx: ColorIdx }[] = [
  { label: "Rainbow", idx: 0 },
  { label: "Ocean", idx: 1 },
  { label: "Sunset", idx: 2 },
  { label: "Matrix", idx: 3 },
];

export function TerminalCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null!);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const {
    isReady,
    error,
    fps,
    modeList,
    currentMode,
    currentSpeed,
    currentColor,
    renderScale,
    controls,
  } = useCanvasEngine(canvasRef, "metaballs");

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    if (!document.fullscreenElement) {
      void el.requestFullscreen?.();
    } else {
      void document.exitFullscreen?.();
    }
  }, []);

  return (
    <section className="mx-auto max-w-7xl px-6 py-12">
      <header className="mb-10 grid gap-8 lg:grid-cols-[1fr_24rem] lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">
            Rust / WASM / Canvas
          </p>

          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white md:text-5xl">
            Terminal FX
          </h1>

          <p className="mt-4 max-w-3xl leading-8 text-slate-300">
            Rust simulation modes compiled to WebAssembly and rendered directly
            to a canvas element. No server, no WebSocket — the physics runs
            entirely in your browser.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {["Rust", "WASM", "Canvas", "No Server", "60fps"].map((tech) => (
              <span
                key={tech}
                className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-slate-300 ring-1 ring-slate-800"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-white">Runtime</p>

            <a
              href="/downloads/RustWallpaper/TerminalFX-Windows.zip"
              download
              title="Download native Rust build"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-950/70 px-2.5 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-cyan-400/70 hover:text-cyan-300"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M8 2v8m0 0 3-3m-3 3L5 7M3 13h10"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Download
            </a>
          </div>

          <div className="mt-3 space-y-2 text-sm text-slate-400">
            <div className="flex justify-between">
              <span>Engine</span>
              <span className="font-mono text-cyan-300">
                {isReady ? "Rust WASM" : "loading…"}
              </span>
            </div>

            <div className="flex justify-between">
              <span>Renderer</span>
              <span className="font-mono text-cyan-300">Canvas 2D</span>
            </div>

            <div className="flex justify-between">
              <span>FPS</span>
              <span className="font-mono text-cyan-300">
                {isReady ? fps : "—"}
              </span>
            </div>

            <div className="flex justify-between">
              <span>Mode</span>
              <span className="font-mono text-cyan-300">{currentMode}</span>
            </div>

            <div className="flex justify-between">
              <span>Render scale</span>
              <span className="font-mono text-cyan-300">
                {Math.round(renderScale * 100)}%
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <main
          ref={containerRef}
          className="relative h-[34rem] overflow-hidden rounded-[2rem] border border-slate-800 bg-slate-900/60 p-4 shadow-2xl shadow-black/30 md:p-5"
          style={
            isFullscreen
              ? { height: "100dvh", padding: 0, borderRadius: 0 }
              : undefined
          }
        >
          <canvas
            ref={canvasRef}
            className="block h-full w-full rounded-[1.5rem] border border-slate-800 bg-slate-950"
            style={{
              imageRendering: "pixelated",
              borderRadius: isFullscreen ? 0 : undefined,
            }}
          />

          {!isReady && !error && (
            <div className="absolute inset-0 flex items-center justify-center rounded-[2rem]">
              <div className="flex flex-col items-center gap-3">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                <span className="font-mono text-sm text-slate-400">
                  Loading WASM…
                </span>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center rounded-[2rem] bg-black/60">
              <div className="max-w-sm rounded-2xl border border-red-900 bg-slate-950 p-5 text-center">
                <p className="text-sm font-semibold text-red-400">
                  Rust renderer stopped
                </p>
                <p className="mt-2 text-xs leading-5 text-slate-400">{error}</p>

                <button
                  type="button"
                  onClick={controls.restart}
                  className="mt-4 rounded-xl bg-cyan-300 px-4 py-2 text-xs font-semibold text-slate-950 transition hover:bg-cyan-200"
                >
                  Restart Rust renderer
                </button>
              </div>
            </div>
          )}

          <div className="absolute right-6 top-6 flex items-center gap-2">
            {isReady && (
              <span className="rounded-lg bg-black/40 px-2 py-1 font-mono text-xs text-slate-400 backdrop-blur-sm">
                {fps} fps
              </span>
            )}

            <button
              type="button"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              className="rounded-lg bg-black/40 p-1.5 text-slate-400 backdrop-blur-sm transition hover:bg-black/60 hover:text-white"
            >
              {isFullscreen ? "↙" : "↗"}
            </button>
          </div>
        </main>

        <aside className="space-y-6">
          <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="font-semibold text-white">Mode</h2>

            <div className="mt-3 flex flex-col gap-2">
              {modeList.length === 0 ? (
                <p className="text-sm text-slate-500">Loading modes…</p>
              ) : (
                modeList.map((m: ModeEntry) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => controls.setMode(m.id)}
                    className={`rounded-xl px-4 py-2 text-left text-sm font-medium transition ${
                      currentMode === m.id
                        ? "bg-cyan-300 text-slate-950"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    }`}
                  >
                    {m.name}
                  </button>
                ))
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="font-semibold text-white">Render scale</h2>

            <p className="mt-2 text-sm leading-6 text-slate-400">
              Lower values zoom in and usually improve FPS. Higher values show
              more detail but make the mode feel farther away.
            </p>

            <div className="mt-4 flex items-center gap-3">
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.05}
                value={renderScale}
                onChange={(event) =>
                  controls.setRenderScale(parseFloat(event.target.value))
                }
                disabled={!isReady}
                className="flex-1 accent-cyan-400 disabled:opacity-40"
              />

              <span className="w-12 text-right font-mono text-sm text-slate-300">
                {Math.round(renderScale * 100)}%
              </span>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              {[0.25, 0.3, 0.45, 0.7].map((scale) => (
                <button
                  key={scale}
                  type="button"
                  disabled={!isReady}
                  onClick={() => controls.setRenderScale(scale)}
                  className={`rounded-xl px-2 py-2 text-xs font-semibold transition disabled:opacity-40 ${
                    Math.abs(renderScale - scale) < 0.001
                      ? "bg-cyan-300 text-slate-950"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {Math.round(scale * 100)}%
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="font-semibold text-white">Speed</h2>

            <div className="mt-3 flex items-center gap-3">
              <input
                type="range"
                min={0.1}
                max={3}
                step={0.1}
                value={currentSpeed}
                onChange={(event) =>
                  controls.setSpeed(parseFloat(event.target.value))
                }
                disabled={!isReady}
                className="flex-1 accent-cyan-400 disabled:opacity-40"
              />

              <span className="w-10 text-right font-mono text-sm text-slate-300">
                {currentSpeed.toFixed(1)}×
              </span>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="font-semibold text-white">Colour</h2>

            <div className="mt-3 grid grid-cols-2 gap-2">
              {COLOR_OPTIONS.map(({ label, idx }) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => controls.setColor(idx)}
                  disabled={!isReady}
                  className={`rounded-xl px-3 py-2 text-sm font-medium transition disabled:opacity-40 ${
                    currentColor === idx
                      ? "bg-cyan-300 text-slate-950"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </section>
  );
}