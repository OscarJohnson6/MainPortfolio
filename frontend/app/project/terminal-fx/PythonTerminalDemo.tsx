"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import type { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

type TerminalMode = {
  id: string;
  label: string;
  description?: string;
  safeForWeb?: boolean;
};

type ModesResponse = {
  modes: TerminalMode[];
  colorModes: string[];
  staticPalettes: string[];
  spectrumThemes: string[];
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

function toWebSocketUrl(path: string) {
  const base = API_BASE.replace(/^http/, "ws").replace(/\/$/, "");
  return `${base}${path}`;
}

export function PythonTerminalDemo() {
  const terminalShellRef = useRef<HTMLDivElement | null>(null);
  const terminalHostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal>(null);
  const fitAddonRef = useRef<FitAddon>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const hasAutoStartedRef = useRef(false);

  const [modes, setModes] = useState<TerminalMode[]>([]);
  const [selectedMode, setSelectedMode] = useState("bounce");
  const [fps, setFps] = useState(24);
  const [speed, setSpeed] = useState(1);
  const [colorMode, setColorMode] = useState("rainbow");
  const [staticPalette, setStaticPalette] = useState("cyan");
  const [spectrumTheme, setSpectrumTheme] = useState("ocean");
  const [isConnected, setIsConnected] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [terminalReady, setTerminalReady] = useState(false);
  const [statusText, setStatusText] = useState("Starting browser demo...");
  const [modesResponse, setModesResponse] = useState<ModesResponse | null>(null);

  const selectedModeDetails = useMemo(
    () => modes.find((mode) => mode.id === selectedMode),
    [modes, selectedMode]
  );

  useEffect(() => {
    async function loadModes() {
      try {
        const response = await fetch(`${API_BASE}/api/terminalfx/modes`);
        if (!response.ok) {
          throw new Error(`Could not load modes: ${response.status}`);
        }

        const data = (await response.json()) as ModesResponse;
        setModesResponse(data);
        setModes(data.modes);

        if (data.modes.length > 0 && !data.modes.some((mode) => mode.id === selectedMode)) {
          setSelectedMode(data.modes[0].id);
        }
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : "Could not load modes.");
      }
    }

    void loadModes();
  }, [selectedMode]);

  useEffect(() => {
    let disposed = false;

    async function setupTerminal() {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);

      if (disposed || !terminalHostRef.current) return;

      const terminal = new Terminal({
        cursorBlink: false,
        convertEol: true,
        fontFamily:
          'var(--font-geist-mono), "Cascadia Code", "Fira Code", Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.05,
        scrollback: 0,
        disableStdin: true,
        theme: {
          background: "#020617",
          foreground: "#e2e8f0",
          cursor: "#67e8f9",
          black: "#020617",
          red: "#f87171",
          green: "#34d399",
          yellow: "#fbbf24",
          blue: "#60a5fa",
          magenta: "#c084fc",
          cyan: "#22d3ee",
          white: "#e2e8f0",
          brightBlack: "#475569",
          brightRed: "#fca5a5",
          brightGreen: "#6ee7b7",
          brightYellow: "#fde68a",
          brightBlue: "#93c5fd",
          brightMagenta: "#d8b4fe",
          brightCyan: "#67e8f9",
          brightWhite: "#f8fafc",
        },
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(terminalHostRef.current);
      fitAddon.fit();

      terminal.write("\x1b[2J\x1b[H");
      terminal.writeln("TerminalFX browser demo");
      terminal.writeln("Starting stream...");
      terminal.writeln("");

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      setTerminalReady(true);

      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
        sendResize();
      });

      resizeObserver.observe(terminalHostRef.current);

      return () => {
        resizeObserver.disconnect();
        terminal.dispose();
      };
    }

    let cleanup: void | (() => void) | undefined;
    void setupTerminal().then((dispose) => {
      cleanup = dispose;
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    if (!terminalReady) return;
    if (modes.length === 0) return;
    if (hasAutoStartedRef.current) return;

    hasAutoStartedRef.current = true;
    connect();
  }, [terminalReady, modes.length]);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(Boolean(document.fullscreenElement));

      window.setTimeout(() => {
        fitAddonRef.current?.fit();
        sendResize();
      }, 100);
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    sendSettings();
  }, [fps, speed, colorMode, staticPalette, spectrumTheme]);

  useEffect(() => {
    return () => {
      socketRef.current?.close();
    };
  }, []);

  function getTerminalSize() {
    const terminal = terminalRef.current;
    return {
      cols: Math.max(20, terminal?.cols ?? 100),
      rows: Math.max(8, terminal?.rows ?? 32),
    };
  }

  function sendResize() {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    const { cols, rows } = getTerminalSize();
    socket.send(
      JSON.stringify({
        type: "resize",
        width: cols,
        height: rows,
      })
    );
  }

  function connect() {
    if (socketRef.current?.readyState === WebSocket.OPEN) return;

    fitAddonRef.current?.fit();

    const { cols, rows } = getTerminalSize();
    const params = new URLSearchParams({
      mode: selectedMode,
      width: String(cols),
      height: String(rows),
      fps: String(fps),
      speed: String(speed),
      color_mode: colorMode,
      static_palette: staticPalette,
      spectrum_theme: spectrumTheme,
      color_speed: "1",
    });

    const socket = new WebSocket(toWebSocketUrl(`/api/terminalfx/ws?${params}`));
    socketRef.current = socket;

    socket.onopen = () => {
      setIsConnected(true);
      setStatusText(`Running ${selectedMode}.`);
      terminalRef.current?.focus();
      sendResize();
    };

    socket.onmessage = (event) => {
      terminalRef.current?.write(event.data);
    };

    socket.onerror = () => {
      setStatusText("WebSocket error. Check the FastAPI terminal.");
    };

    socket.onclose = () => {
      setIsConnected(false);
      setStatusText("Paused.");
      socketRef.current = null;
    };
  }

  function disconnect() {
    socketRef.current?.close();
    socketRef.current = null;
    setIsConnected(false);
    setStatusText("Paused.");
  }

  async function toggleFullscreen() {
    const shell = terminalShellRef.current;
    if (!shell) return;

    try {
      if (!document.fullscreenElement) {
        await shell.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }

      window.setTimeout(() => {
        fitAddonRef.current?.fit();
        sendResize();
      }, 100);
    } catch {
      setStatusText("Fullscreen request failed.");
    }
  }

  function sendSettings() {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    socket.send(
      JSON.stringify({
        type: "settings",
        fps,
        speedFactor: speed,
        colorSpeedFactor: 1,
      })
    );

    socket.send(
      JSON.stringify({
        type: "color",
        colorMode,
        staticPalette: staticPalette,
        spectrumTheme: spectrumTheme,
      })
    );
  }

  function changeMode(nextMode: string) {
    setSelectedMode(nextMode);

    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "mode", mode: nextMode }));
      setStatusText(`Running ${nextMode}.`);
    }
  }

  return (
    <section className="mx-auto max-w-7xl px-6 py-12">
      <header className="mb-10 grid gap-8 lg:grid-cols-[1fr_24rem] lg:items-end">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">
            Python / Rust / Terminal UI
          </p>

          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white md:text-5xl">
            Terminal FX
          </h1>

          <p className="mt-4 max-w-3xl leading-8 text-slate-300">
            A terminal wallpaper engine with animated ASCII modes. This page
            streams the Python implementation through FastAPI WebSockets into a
            browser terminal. The Rust implementation is the native,
            performance-focused version.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            {["Python", "FastAPI", "WebSocket", "xterm.js", "Rust", "ANSI"].map(
              (tech) => (
                <span
                  key={tech}
                  className="rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-slate-300 ring-1 ring-slate-800"
                >
                  {tech}
                </span>
              )
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
          <p className="text-sm font-semibold text-white">Demo controls</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">{statusText}</p>

          <div className="mt-4 flex flex-wrap gap-3">
            {!isConnected ? (
              <button
                type="button"
                onClick={connect}
                className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
              >
                Start
              </button>
            ) : (
              <button
                type="button"
                onClick={disconnect}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-300 hover:text-cyan-200"
              >
                Pause
              </button>
            )}

            <button
              type="button"
              onClick={toggleFullscreen}
              className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-300 hover:text-cyan-200"
            >
              {isFullscreen ? "Exit fullscreen" : "Fullscreen"}
            </button>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <main
        ref={terminalShellRef}
        // We keep a strict height here so the page layout doesn't bounce around,
        // but let the native Fullscreen API handle monitor stretching naturally.
        className="relative h-[34rem] min-w-0 rounded-[2rem] border border-slate-800 bg-[#020617] p-2 shadow-2xl shadow-black/30 md:p-3 lg:h-[38rem]"
      >
        {/* THE FIX: This wrapper decouples the xterm canvas from the DOM layout.
            It physically prevents xterm from ever spawning an external scrollbar. */}
        <div className="relative h-full w-full overflow-hidden rounded-xl">
          <div 
            ref={terminalHostRef} 
            className="absolute inset-0 h-full w-full [&_.xterm-viewport]:overflow-hidden" 
          />
        </div>
      </main>

        <aside className="space-y-6">
          <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="font-semibold text-white">Mode</h2>

            <select
              value={selectedMode}
              onChange={(event) => changeMode(event.target.value)}
              className="mt-4 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300"
            >
              {modes.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.label}
                </option>
              ))}
            </select>

            {selectedModeDetails?.description && (
              <p className="mt-3 text-sm leading-6 text-slate-400">
                {selectedModeDetails.description}
              </p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2">
              {modes.slice(0, 8).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => changeMode(mode.id)}
                  className={`rounded-xl border px-3 py-2 text-left text-xs font-semibold transition ${
                    selectedMode === mode.id
                      ? "border-cyan-300 bg-cyan-300 text-slate-950"
                      : "border-slate-800 bg-slate-950 text-slate-300 hover:border-cyan-300 hover:text-cyan-200"
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="font-semibold text-white">Controls</h2>

            <label className="mt-4 flex flex-col gap-2">
              <span className="text-sm text-slate-400">FPS: {fps}</span>
              <input
                type="range"
                min={1}
                max={60}
                value={fps}
                onChange={(event) => setFps(Number(event.target.value))}
              />
            </label>

            <label className="mt-4 flex flex-col gap-2">
              <span className="text-sm text-slate-400">
                Speed: {speed.toFixed(1)}x
              </span>
              <input
                type="range"
                min={0.1}
                max={5}
                step={0.1}
                value={speed}
                onChange={(event) => setSpeed(Number(event.target.value))}
              />
            </label>
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="font-semibold text-white">Color</h2>

            <label className="mt-4 flex flex-col gap-2">
              <span className="text-sm text-slate-400">Color mode</span>
              <select
                value={colorMode}
                onChange={(event) => setColorMode(event.target.value)}
                className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300"
              >
                {(modesResponse?.colorModes ?? ["rainbow", "static", "spectrum"]).map(
                  (mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  )
                )}
              </select>
            </label>

            {colorMode === "static" && (
              <label className="mt-4 flex flex-col gap-2">
                <span className="text-sm text-slate-400">Static palette</span>
                <select
                  value={staticPalette}
                  onChange={(event) => setStaticPalette(event.target.value)}
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300"
                >
                  {(modesResponse?.staticPalettes ?? ["cyan"]).map((palette) => (
                    <option key={palette} value={palette}>
                      {palette}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {colorMode === "spectrum" && (
              <label className="mt-4 flex flex-col gap-2">
                <span className="text-sm text-slate-400">Spectrum theme</span>
                <select
                  value={spectrumTheme}
                  onChange={(event) => setSpectrumTheme(event.target.value)}
                  className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-300"
                >
                  {(modesResponse?.spectrumThemes ?? ["ocean"]).map((theme) => (
                    <option key={theme} value={theme}>
                      {theme}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </section>

          <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
            <h2 className="font-semibold text-white">Native version</h2>

            <p className="mt-3 text-sm leading-6 text-slate-400">
              The browser demo runs the Python modes. The Rust version is the
              native high-performance build and is better treated as its own
              downloadable/runtime target.
            </p>

            <a
              href="https://github.com/OscarJohnson6/terminal-fx"
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-cyan-300 hover:text-cyan-200"
            >
              View repository
            </a>
          </section>
        </aside>
      </div>
    </section>
  );
}
