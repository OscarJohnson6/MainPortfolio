"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  RefObject,
} from "react";

export interface ModeEntry {
  id: string;
  name: string;
}

export type ColorIdx = 0 | 1 | 2 | 3;

export interface EngineControls {
  setMode: (id: string) => void;
  setSpeed: (speed: number) => void;
  setColor: (idx: ColorIdx) => void;
  setRenderScale: (scale: number) => void;
  restart: () => void;
  resize: (w: number, h: number) => void;
}

export interface CanvasEngineState {
  isReady: boolean;
  error: string | null;
  fps: number;
  modeList: ModeEntry[];
  currentMode: string;
  currentSpeed: number;
  currentColor: ColorIdx;
  renderScale: number;
  controls: EngineControls;
}

interface CanvasEngineInstance {
  free(): void;
  set_mode(id: string): void;
  set_speed(speed: number): void;
  set_color(idx: ColorIdx): void;
  resize(w: number, h: number): void;
  update(dt: number, t_abs: number): void;
  render_pixels(): Uint8Array;
  width(): number;
  height(): number;
}

interface WasmModule {
  default: () => Promise<unknown>;
  CanvasEngine: {
    mode_list(): string;
    new (modeId: string, width: number, height: number): CanvasEngineInstance;
  };
}

const DEFAULT_RENDER_SCALE = 0.30;
const MIN_RENDER_SCALE = 0.20;
const MAX_RENDER_SCALE = 1.00;
const MAX_DEVICE_PIXEL_RATIO = 1.35;

function clampRenderScale(scale: number) {
  if (!Number.isFinite(scale)) return DEFAULT_RENDER_SCALE;
  return Math.min(MAX_RENDER_SCALE, Math.max(MIN_RENDER_SCALE, scale));
}

function nextFrame() {
  return new Promise<number>((resolve) => requestAnimationFrame(resolve));
}

function getEngineSize(canvas: HTMLCanvasElement, renderScale: number) {
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO);
  const scale = clampRenderScale(renderScale);

  return {
    w: Math.max(96, Math.floor(canvas.clientWidth * dpr * scale)),
    h: Math.max(54, Math.floor(canvas.clientHeight * dpr * scale)),
  };
}

export function useCanvasEngine(
  canvasRef: RefObject<HTMLCanvasElement>,
  initialMode = "metaballs",
): CanvasEngineState {
  const wasmModuleRef = useRef<WasmModule | null>(null);
  const wasmInitPromiseRef = useRef<Promise<unknown> | null>(null);
  const engineRef = useRef<CanvasEngineInstance | null>(null);
  const rafRef = useRef<number | null>(null);
  const resizeRafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);
  const frameTimesRef = useRef<number[]>([]);
  const lastCanvasSizeRef = useRef<{ w: number; h: number } | null>(null);

  // This is the important guard. It prevents an older async WASM load from
  // publishing an engine after React has already cleaned up or remounted.
  const mountedRef = useRef(false);
  const runIdRef = useRef(0);

  const currentModeRef = useRef(initialMode);
  const currentSpeedRef = useRef(1.0);
  const currentColorRef = useRef<ColorIdx>(0);
  const renderScaleRef = useRef(DEFAULT_RENDER_SCALE);

  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fps, setFps] = useState(0);
  const [modeList, setModeList] = useState<ModeEntry[]>([]);
  const [currentMode, setCurrentMode] = useState(initialMode);
  const [currentSpeed, setCurrentSpeed] = useState(1.0);
  const [currentColor, setCurrentColor] = useState<ColorIdx>(0);
  const [renderScale, setRenderScaleState] = useState(DEFAULT_RENDER_SCALE);
  const [restartToken, setRestartToken] = useState(0);

  const isActiveRun = useCallback((runId: number) => {
    return mountedRef.current && runIdRef.current === runId;
  }, []);

  const cancelFrameLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const cancelResizeFrame = useCallback(() => {
    if (resizeRafRef.current !== null) {
      cancelAnimationFrame(resizeRafRef.current);
      resizeRafRef.current = null;
    }
  }, []);

  const freeEngine = useCallback((engine: CanvasEngineInstance | null) => {
    if (!engine) return;

    try {
      engine.free();
    } catch (err) {
      // If Rust already panicked, free() can also throw. Ignore cleanup failure.
      console.warn("TerminalFX WASM engine cleanup failed:", err);
    }
  }, []);

  const disposeCurrentEngine = useCallback(() => {
    const engine = engineRef.current;
    engineRef.current = null;
    freeEngine(engine);
  }, [freeEngine]);

  const waitForCanvasBox = useCallback(
    async (runId: number) => {
      const canvas = canvasRef.current;

      if (!canvas) return false;

      // The first Rust mount can happen before layout has produced a useful
      // canvas box. Give the browser a few frames before falling back to the
      // hook minimum size.
      for (let i = 0; i < 8; i += 1) {
        if (!isActiveRun(runId)) return false;

        if (canvas.clientWidth >= 1 && canvas.clientHeight >= 1) {
          return true;
        }

        await nextFrame();
      }

      return isActiveRun(runId);
    },
    [canvasRef, isActiveRun],
  );

  const loadWasm = useCallback(
    async (runId: number) => {
      if (!isActiveRun(runId)) return null;

      let wasm = wasmModuleRef.current;

      if (!wasm) {
        wasm = (await import(
          /* webpackIgnore: true */ new URL(
            "/wasm/terminal_fx.js",
            location.origin,
          ).toString()
        )) as WasmModule;

        if (!isActiveRun(runId)) return null;
        wasmModuleRef.current = wasm;
      }

      try {
        // Share one init promise. This avoids two overlapping wasm-bindgen
        // init calls during React Strict Mode's development remount.
        wasmInitPromiseRef.current ??= wasm.default();
        await wasmInitPromiseRef.current;
      } catch (err) {
        wasmInitPromiseRef.current = null;
        throw err;
      }

      if (!isActiveRun(runId)) return null;
      return wasm;
    },
    [isActiveRun],
  );

  const applyCanvasSize = useCallback(
    (scale = renderScaleRef.current) => {
      const canvas = canvasRef.current;
      const engine = engineRef.current;

      if (!canvas || !engine) return;
      if (canvas.clientWidth < 1 || canvas.clientHeight < 1) return;

      const { w, h } = getEngineSize(canvas, scale);
      const previous = lastCanvasSizeRef.current;

      if (previous?.w === w && previous?.h === h) return;

      lastCanvasSizeRef.current = { w, h };
      canvas.width = w;
      canvas.height = h;

      try {
        engine.resize(w, h);
      } catch (err) {
        console.warn("TerminalFX WASM resize failed:", err);
        setError(`WASM resize error in mode "${currentModeRef.current}".`);
      }
    },
    [canvasRef],
  );

  const createEngine = useCallback(
    async (runId: number) => {
      const canvas = canvasRef.current;

      if (!canvas) {
        throw new Error("Canvas element was not mounted.");
      }

      const hasCanvasBox = await waitForCanvasBox(runId);
      if (!hasCanvasBox || !isActiveRun(runId)) return null;

      const wasm = await loadWasm(runId);
      if (!wasm || !isActiveRun(runId)) return null;

      const modes = JSON.parse(wasm.CanvasEngine.mode_list()) as ModeEntry[];
      if (isActiveRun(runId)) {
        setModeList(modes);
      }

      const { w, h } = getEngineSize(canvas, renderScaleRef.current);
      lastCanvasSizeRef.current = { w, h };
      canvas.width = w;
      canvas.height = h;

      let engine: CanvasEngineInstance | null = null;

      try {
        engine = new wasm.CanvasEngine(currentModeRef.current, w, h);
        engine.set_speed(currentSpeedRef.current);
        engine.set_color(currentColorRef.current);
      } catch (err) {
        freeEngine(engine);
        throw err;
      }

      if (!isActiveRun(runId)) {
        freeEngine(engine);
        return null;
      }

      return engine;
    },
    [canvasRef, freeEngine, isActiveRun, loadWasm, waitForCanvasBox],
  );

  useEffect(() => {
    mountedRef.current = true;

    const runId = runIdRef.current + 1;
    runIdRef.current = runId;

    let cancelled = false;

    async function run() {
      setIsReady(false);
      setError(null);
      setFps(0);

      cancelFrameLoop();
      cancelResizeFrame();
      disposeCurrentEngine();

      lastCanvasSizeRef.current = null;
      frameTimesRef.current = [];

      try {
        const engine = await createEngine(runId);

        if (cancelled || !isActiveRun(runId) || !engine) {
          freeEngine(engine);
          return;
        }

        engineRef.current = engine;
        frameTimesRef.current = [];
        lastTimeRef.current = performance.now();

        setIsReady(true);
        setError(null);
      } catch (err) {
        if (!cancelled && isActiveRun(runId)) {
          console.warn("TerminalFX WASM failed to load:", err);
          setError(err instanceof Error ? err.message : String(err));
          setIsReady(false);
        }
      }
    }

    void run();

    return () => {
      cancelled = true;

      // Do not let an old cleanup destroy a newer engine.
      if (runIdRef.current !== runId) return;

      mountedRef.current = false;
      runIdRef.current += 1;

      cancelFrameLoop();
      cancelResizeFrame();
      disposeCurrentEngine();

      lastCanvasSizeRef.current = null;
      frameTimesRef.current = [];
    };
  }, [
    restartToken,
    createEngine,
    cancelFrameLoop,
    cancelResizeFrame,
    disposeCurrentEngine,
    freeEngine,
    isActiveRun,
  ]);

  useEffect(() => {
    if (!isReady) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });

    if (!ctx) {
      setError("Canvas 2D context is unavailable.");
      setIsReady(false);
      return;
    }

    let stopped = false;

    function frame(now: number) {
      if (stopped || !mountedRef.current) return;

      const engine = engineRef.current;

      if (!engine) {
        rafRef.current = requestAnimationFrame(frame);
        return;
      }

      const previous = lastTimeRef.current || now;
      const dt = Math.min((now - previous) / 1000, 0.1);
      const tAbs = now / 1000;
      lastTimeRef.current = now;

      try {
        engine.update(dt, tAbs);

        const rgba = engine.render_pixels();
        const w = engine.width();
        const h = engine.height();

        if (rgba.length === w * h * 4) {
          ctx.putImageData(
            new ImageData(new Uint8ClampedArray(rgba), w, h),
            0,
            0,
          );
        }
      } catch (err) {
        console.warn("TerminalFX WASM frame stopped:", err);

        stopped = true;
        rafRef.current = null;

        // After a Rust allocator panic, treat the current engine as poisoned.
        disposeCurrentEngine();
        lastCanvasSizeRef.current = null;
        frameTimesRef.current = [];

        setIsReady(false);
        setError(
          `WASM renderer stopped in mode "${currentModeRef.current}". Restart the renderer or switch tabs.`,
        );
        return;
      }

      frameTimesRef.current.push(now);
      const cutoff = now - 1000;

      while (
        frameTimesRef.current.length > 0 &&
        frameTimesRef.current[0]! < cutoff
      ) {
        frameTimesRef.current.shift();
      }

      if (mountedRef.current) {
        setFps(frameTimesRef.current.length);
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      stopped = true;
      cancelFrameLoop();
    };
  }, [isReady, canvasRef, cancelFrameLoop, disposeCurrentEngine]);

  useEffect(() => {
    if (!isReady) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    function scheduleResize() {
      cancelResizeFrame();

      resizeRafRef.current = requestAnimationFrame(() => {
        resizeRafRef.current = null;
        applyCanvasSize(renderScaleRef.current);
      });
    }

    const observer = new ResizeObserver(scheduleResize);
    observer.observe(canvas);

    scheduleResize();

    return () => {
      observer.disconnect();
      cancelResizeFrame();
    };
  }, [isReady, canvasRef, applyCanvasSize, cancelResizeFrame]);

  const setMode = useCallback((id: string) => {
    currentModeRef.current = id;

    try {
      engineRef.current?.set_mode(id);
    } catch (err) {
      console.warn("TerminalFX WASM set_mode failed:", err);
      setError(`WASM mode switch failed for "${id}".`);
    }

    frameTimesRef.current = [];
    lastTimeRef.current = performance.now();

    setCurrentMode(id);
    setError(null);
  }, []);

  const setSpeed = useCallback((speed: number) => {
    const nextSpeed = Math.min(3, Math.max(0.1, speed));
    currentSpeedRef.current = nextSpeed;

    try {
      engineRef.current?.set_speed(nextSpeed);
    } catch {
      // Ignore. A later restart can restore this setting.
    }

    setCurrentSpeed(nextSpeed);
  }, []);

  const setColor = useCallback((idx: ColorIdx) => {
    currentColorRef.current = idx;

    try {
      engineRef.current?.set_color(idx);
    } catch {
      // Ignore. A later restart can restore this setting.
    }

    setCurrentColor(idx);
  }, []);

  const setRenderScale = useCallback(
    (scale: number) => {
      const nextScale = clampRenderScale(scale);
      renderScaleRef.current = nextScale;
      setRenderScaleState(nextScale);

      frameTimesRef.current = [];
      lastTimeRef.current = performance.now();

      applyCanvasSize(nextScale);
    },
    [applyCanvasSize],
  );

  const restart = useCallback(() => {
    setRestartToken((value) => value + 1);
  }, []);

  const resize = useCallback(
    (w: number, h: number) => {
      const canvas = canvasRef.current;
      const engine = engineRef.current;

      if (!canvas || !engine) return;
      if (canvas.width === w && canvas.height === h) return;

      canvas.width = w;
      canvas.height = h;
      lastCanvasSizeRef.current = { w, h };

      try {
        engine.resize(w, h);
      } catch (err) {
        console.warn("TerminalFX WASM manual resize failed:", err);
        setError(`WASM resize error in mode "${currentModeRef.current}".`);
      }
    },
    [canvasRef],
  );

  return {
    isReady,
    error,
    fps,
    modeList,
    currentMode,
    currentSpeed,
    currentColor,
    renderScale,
    controls: {
      setMode,
      setSpeed,
      setColor,
      setRenderScale,
      restart,
      resize,
    },
  };
}
