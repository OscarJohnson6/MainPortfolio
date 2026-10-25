'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { compile, type Compiled } from '../lib/evaluate';
import type { AnalyzeResponse, EngineSettings, PlotLine, PlotMarker } from '../lib/types';

export interface GraphMarker extends PlotMarker {
  id: string;
  label: string;
}

export interface GraphLine {
  id: string;
  line: PlotLine;
  label: string;
  tone: 'asymptote' | 'tangent';
}

interface View {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

interface Props {
  plot: NonNullable<AnalyzeResponse['plot']> | null;
  settings: EngineSettings;
  markers: GraphMarker[];
  lines: GraphLine[];
  highlightId: string | null;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
  interval: { a: number; b: number } | null;
  stale: boolean;
  description: string;
}

const MAX_LINES = 400;

function fmt(v: number): string {
  if (!Number.isFinite(v)) return '—';
  if (Math.abs(v) < 1e-12) return '0';
  const a = Math.abs(v);
  if (a >= 1e7 || a < 1e-5) return v.toExponential(3);
  return String(parseFloat(v.toPrecision(6)));
}

function tickLabel(t: number, step: number): string {
  if (Math.abs(t) < step * 1e-6) return '0';
  return String(parseFloat(t.toPrecision(10)));
}

/** 1, 2 or 5 × 10ⁿ — the steps people find easy to read. */
export function niceStep(range: number, target: number): number {
  const raw = range / Math.max(2, target);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / mag;
  return (n < 1.5 ? 1 : n < 3.5 ? 2 : n < 7.5 ? 5 : 10) * mag;
}

function fitView(f: Compiled | null): View {
  const x0 = -10;
  const x1 = 10;
  if (!f) return { x0, x1, y0: -10, y1: 10 };
  const ys: number[] = [];
  for (let i = 0; i <= 400; i++) {
    const y = f(x0 + ((x1 - x0) * i) / 400);
    if (Number.isFinite(y)) ys.push(y);
  }
  if (ys.length < 10) return { x0, x1, y0: -10, y1: 10 };
  ys.sort((a, b) => a - b);
  let lo = ys[Math.floor(ys.length * 0.05)];
  let hi = ys[Math.floor(ys.length * 0.95)];
  if (hi - lo < 1e-9) {
    lo -= 5;
    hi += 5;
  }
  // Include the x-axis when it's reasonably close.
  if (lo > 0 && lo < (hi - lo) * 2) lo = 0;
  if (hi < 0 && -hi < (hi - lo) * 2) hi = 0;
  const pad = (hi - lo) * 0.2;
  return { x0, x1, y0: lo - pad, y1: hi + pad };
}

function buildPath(fn: Compiled, gate: Compiled | null, v: View, W: number, H: number): string {
  const n = Math.max(300, Math.round(W * 1.5));
  const yr = v.y1 - v.y0;
  const sx = (x: number) => ((x - v.x0) / (v.x1 - v.x0)) * W;
  const sy = (y: number) => H - ((y - v.y0) / yr) * H;
  const clampY = (y: number) => Math.min(v.y1 + yr * 10, Math.max(v.y0 - yr * 10, y));
  let d = '';
  let pen = false;
  let prevY = NaN;
  let prevX = NaN;
  for (let i = 0; i <= n; i++) {
    const x = v.x0 + ((v.x1 - v.x0) * i) / n;
    const y = gate && !Number.isFinite(gate(x)) ? NaN : fn(x);
    if (!Number.isFinite(y)) {
      pen = false;
      continue;
    }
    if (pen && Math.abs(y - prevY) > yr * 2) {
      // Big jump: if the midpoint is way off (or undefined), it's an asymptote — lift the pen.
      const mid = fn((x + prevX) / 2);
      if (!Number.isFinite(mid) || Math.abs(mid - (y + prevY) / 2) > yr) pen = false;
    }
    d += `${pen ? 'L' : 'M'}${sx(x).toFixed(1)},${sy(clampY(y)).toFixed(1)}`;
    pen = true;
    prevY = y;
    prevX = x;
  }
  return d;
}

function NumberField({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const id = useId();
  return (
    <span className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs text-zinc-500 dark:text-zinc-400">
        {label}
      </label>
      <input
        id={id}
        key={value}
        defaultValue={fmt(value)}
        inputMode="decimal"
        onBlur={(e) => {
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) onCommit(n);
          else e.target.value = fmt(value);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        className="w-full rounded-lg border border-zinc-300 bg-white px-2 py-1 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-950"
      />
    </span>
  );
}

const MARKER_STYLE: Record<PlotMarker['kind'], { r: number; fill: string; stroke: string }> = {
  max: { r: 4.5, fill: 'var(--fa-accent)', stroke: 'var(--fa-bg)' },
  min: { r: 4.5, fill: 'var(--fa-accent)', stroke: 'var(--fa-bg)' },
  stationary: { r: 4.5, fill: 'var(--fa-accent)', stroke: 'var(--fa-bg)' },
  extreme: { r: 4.5, fill: 'var(--fa-accent)', stroke: 'var(--fa-bg)' },
  inflection: { r: 4, fill: 'var(--fa-d2)', stroke: 'var(--fa-bg)' },
  hole: { r: 5, fill: 'var(--fa-bg)', stroke: 'var(--fa-accent)' },
  'x-intercept': { r: 3.5, fill: 'var(--fa-ink)', stroke: 'var(--fa-bg)' },
  'y-intercept': { r: 3.5, fill: 'var(--fa-ink)', stroke: 'var(--fa-bg)' },
  point: { r: 5, fill: 'var(--fa-point)', stroke: 'var(--fa-bg)' },
};

export function Graph({ plot, settings, markers, lines, highlightId, onSelect, onHover, interval, stale, description }: Props) {
  const helpId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<{ px: number; py: number; view: View; moved: boolean } | null>(null);
  const [width, setWidth] = useState(640);
  const [focused, setFocused] = useState(false);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [show, setShow] = useState({ d1: false, d2: false, markers: true });
  const [autoGrid, setAutoGrid] = useState(true);
  const [stepText, setStepText] = useState({ x: '1', y: '1' });

  const fns = useMemo(() => {
    if (!plot) return null;
    const opts = { settings, mainVar: plot.mainVar, params: plot.paramValues };
    return {
      f: compile(plot.f, opts),
      d1: plot.d1 ? compile(plot.d1, opts) : null,
      d2: plot.d2 ? compile(plot.d2, opts) : null,
    };
  }, [plot, settings]);

  // The view resets to a fresh fit whenever the function itself changes.
  const fitKey = useMemo(() => (plot ? JSON.stringify([plot.f, plot.mainVar]) : ''), [plot]);
  const defaultView = useMemo(() => fitView(fns?.f ?? null), [fns]);
  const [viewState, setViewState] = useState<{ key: string; view: View } | null>(null);
  const view = viewState && viewState.key === fitKey ? viewState.view : defaultView;
  const setView = (next: View | ((v: View) => View)) =>
    setViewState((prev) => {
      const cur = prev && prev.key === fitKey ? prev.view : defaultView;
      return { key: fitKey, view: typeof next === 'function' ? next(cur) : next };
    });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = width;
  const H = Math.round(Math.min(Math.max(W * 0.72, 300), 540));

  const zoom = (k: number, fx = 0.5, fy = 0.5) =>
    setView((v) => {
      const cx = v.x0 + fx * (v.x1 - v.x0);
      const cy = v.y0 + fy * (v.y1 - v.y0);
      return { x0: cx - (cx - v.x0) * k, x1: cx + (v.x1 - cx) * k, y0: cy - (cy - v.y0) * k, y1: cy + (v.y1 - cy) * k };
    });
  const pan = (dx: number, dy: number) =>
    setView((v) => {
      const ox = (v.x1 - v.x0) * dx;
      const oy = (v.y1 - v.y0) * dy;
      return { x0: v.x0 + ox, x1: v.x1 + ox, y0: v.y0 + oy, y1: v.y1 + oy };
    });
  const reset = () => setViewState({ key: fitKey, view: defaultView });

  // Scroll-to-zoom only once the graph has focus, so it never hijacks page scrolling.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      if (document.activeElement !== svg) return;
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const fx = (e.clientX - rect.left) / rect.width;
      const fy = 1 - (e.clientY - rect.top) / rect.height;
      const k = Math.exp(e.deltaY * 0.0015);
      setViewState((prev) => {
        const v = prev && prev.key === fitKey ? prev.view : defaultView;
        const cx = v.x0 + fx * (v.x1 - v.x0);
        const cy = v.y0 + fy * (v.y1 - v.y0);
        return { key: fitKey, view: { x0: cx - (cx - v.x0) * k, x1: cx + (v.x1 - cx) * k, y0: cy - (cy - v.y0) * k, y1: cy + (v.y1 - cy) * k } };
      });
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, [fitKey, defaultView]);

  // ---- Grid ----
  const autoX = niceStep(view.x1 - view.x0, W / 90);
  const autoY = niceStep(view.y1 - view.y0, H / 70);
  let gridWarning: string | null = null;
  let xStep = autoX;
  let yStep = autoY;
  if (!autoGrid) {
    const mx = parseFloat(stepText.x);
    const my = parseFloat(stepText.y);
    if (!(mx > 0) || !(my > 0)) gridWarning = 'Steps must be positive numbers — using automatic spacing.';
    else if ((view.x1 - view.x0) / mx > MAX_LINES || (view.y1 - view.y0) / my > MAX_LINES) {
      gridWarning = `That would draw more than ${MAX_LINES} lines at this zoom — using automatic spacing until you zoom in or pick a bigger step.`;
    } else {
      xStep = mx;
      yStep = my;
    }
  }
  const ticks = (a: number, b: number, s: number) => {
    const out: number[] = [];
    for (let k = Math.ceil(a / s); k <= Math.floor(b / s); k++) out.push(k * s);
    return out;
  };
  const xTicks = ticks(view.x0, view.x1, xStep);
  const yTicks = ticks(view.y0, view.y1, yStep);
  const sx = (x: number) => ((x - view.x0) / (view.x1 - view.x0)) * W;
  const sy = (y: number) => H - ((y - view.y0) / (view.y1 - view.y0)) * H;
  const axisY = Math.min(H - 4, Math.max(14, sy(0)));
  const axisX = Math.min(W - 4, Math.max(4, sx(0)));
  const labelEvery = Math.max(1, Math.ceil(xTicks.length / (W / 60)));
  const labelEveryY = Math.max(1, Math.ceil(yTicks.length / (H / 28)));

  const paths = useMemo(() => {
    if (!fns) return null;
    return {
      f: buildPath(fns.f, null, view, W, H),
      d1: show.d1 && fns.d1 ? buildPath(fns.d1, fns.f, view, W, H) : '',
      d2: show.d2 && fns.d2 ? buildPath(fns.d2, fns.f, view, W, H) : '',
    };
  }, [fns, view, W, H, show.d1, show.d2]);

  const hoverY = hoverX !== null && fns ? fns.f(hoverX) : NaN;

  // ---- Table of values ----
  const table = useMemo(() => {
    if (!fns) return [];
    let s = xStep;
    while ((view.x1 - view.x0) / s > 40) s *= 2;
    return ticks(view.x0, view.x1, s).map((x) => ({
      x,
      f: fns.f(x),
      d1: Number.isFinite(fns.f(x)) && fns.d1 ? fns.d1(x) : NaN,
      d2: Number.isFinite(fns.f(x)) && fns.d2 ? fns.d2(x) : NaN,
    }));
  }, [fns, view, xStep]);

  const lineEnds = (l: PlotLine): [number, number, number, number] => {
    if (l.kind === 'vertical') return [sx(l.x), 0, sx(l.x), H];
    if (l.kind === 'horizontal') return [0, sy(l.y), W, sy(l.y)];
    return [0, sy(l.m * view.x0 + l.b), W, sy(l.m * view.x1 + l.b)];
  };

  return (
    <section
      aria-labelledby="fa-graph-heading"
      className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm sm:p-4 dark:border-zinc-800 dark:bg-zinc-900 [--fa-accent:#4f46e5] [--fa-bg:#ffffff] [--fa-d1:#0ea5e9] [--fa-d2:#8b5cf6] [--fa-grid:#e4e4e7] [--fa-grid-strong:#a1a1aa] [--fa-ink:#3f3f46] [--fa-point:#f59e0b] dark:[--fa-accent:#818cf8] dark:[--fa-bg:#09090b] dark:[--fa-grid:#27272a] dark:[--fa-grid-strong:#71717a] dark:[--fa-ink:#d4d4d8]"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 id="fa-graph-heading" className="mr-auto text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          Graph
        </h2>
        <div className="flex items-center gap-1" role="group" aria-label="Zoom and pan">
          {[
            { l: '−', a: 'Zoom out', f: () => zoom(1.25) },
            { l: '+', a: 'Zoom in', f: () => zoom(0.8) },
            { l: '⟲', a: 'Reset view', f: reset },
          ].map((b) => (
            <button
              key={b.a}
              type="button"
              onClick={b.f}
              aria-label={b.a}
              title={b.a}
              className="grid size-8 place-items-center rounded-lg border border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {b.l}
            </button>
          ))}
        </div>
      </div>

      <div ref={wrapRef} className={`relative ${stale ? 'opacity-50' : ''}`}>
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          role="img"
          aria-label={description}
          aria-describedby={helpId}
          tabIndex={0}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{ touchAction: focused ? 'none' : 'pan-y' }}
          className="block cursor-grab rounded-xl bg-white outline-none select-none focus-visible:ring-2 focus-visible:ring-indigo-500 active:cursor-grabbing dark:bg-zinc-950"
          onKeyDown={(e) => {
            const map: Record<string, () => void> = {
              ArrowLeft: () => pan(-0.1, 0),
              ArrowRight: () => pan(0.1, 0),
              ArrowUp: () => pan(0, 0.1),
              ArrowDown: () => pan(0, -0.1),
              '+': () => zoom(0.8),
              '=': () => zoom(0.8),
              '-': () => zoom(1.25),
              _: () => zoom(1.25),
              '0': reset,
              Home: reset,
            };
            const fn = map[e.key];
            if (fn) {
              e.preventDefault();
              fn();
            }
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            (e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
            drag.current = { px: e.clientX, py: e.clientY, view, moved: false };
          }}
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const d = drag.current;
            if (d) {
              const dx = ((e.clientX - d.px) / rect.width) * (d.view.x1 - d.view.x0);
              const dy = ((e.clientY - d.py) / rect.height) * (d.view.y1 - d.view.y0);
              if (Math.abs(e.clientX - d.px) + Math.abs(e.clientY - d.py) > 3) d.moved = true;
              setView({ x0: d.view.x0 - dx, x1: d.view.x1 - dx, y0: d.view.y0 + dy, y1: d.view.y1 + dy });
            } else {
              setHoverX(view.x0 + ((e.clientX - rect.left) / rect.width) * (view.x1 - view.x0));
            }
          }}
          onPointerUp={() => {
            drag.current = null;
          }}
          onPointerLeave={() => {
            setHoverX(null);
          }}
        >
          {/* Interval shading */}
          {interval && (
            <rect
              x={sx(Math.min(interval.a, interval.b))}
              y={0}
              width={Math.abs(sx(interval.b) - sx(interval.a))}
              height={H}
              fill="var(--fa-accent)"
              opacity={0.08}
            />
          )}

          {/* Grid */}
          <g stroke="var(--fa-grid)" strokeWidth={1}>
            {xTicks.map((t) => (
              <line key={`gx${t}`} x1={sx(t)} x2={sx(t)} y1={0} y2={H} />
            ))}
            {yTicks.map((t) => (
              <line key={`gy${t}`} x1={0} x2={W} y1={sy(t)} y2={sy(t)} />
            ))}
          </g>
          <g stroke="var(--fa-grid-strong)" strokeWidth={1.25}>
            <line x1={0} x2={W} y1={axisY} y2={axisY} />
            <line x1={axisX} x2={axisX} y1={0} y2={H} />
          </g>
          <g fill="var(--fa-ink)" fontSize={11} className="tabular-nums" opacity={0.75}>
            {xTicks.map((t, i) =>
              i % labelEvery === 0 && Math.abs(t) > xStep * 1e-6 && sx(t) > 14 && sx(t) < W - 14 ? (
                <text key={`lx${t}`} x={sx(t)} y={axisY > H - 18 ? axisY - 5 : axisY + 13} textAnchor="middle">
                  {tickLabel(t, xStep)}
                </text>
              ) : null,
            )}
            {yTicks.map((t, i) =>
              i % labelEveryY === 0 && Math.abs(t) > yStep * 1e-6 && sy(t) > 10 && sy(t) < H - 6 ? (
                <text key={`ly${t}`} x={axisX > W - 40 ? axisX - 5 : axisX + 5} y={sy(t) + 4} textAnchor={axisX > W - 40 ? 'end' : 'start'}>
                  {tickLabel(t, yStep)}
                </text>
              ) : null,
            )}
          </g>

          {/* Asymptotes and tangent lines */}
          {lines.map((l) => {
            const [x1, y1, x2, y2] = lineEnds(l.line);
            const hl = highlightId === l.id;
            return (
              <line
                key={l.id}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={l.tone === 'tangent' ? 'var(--fa-point)' : 'var(--fa-ink)'}
                strokeWidth={hl ? 2.5 : 1.25}
                strokeDasharray={l.tone === 'tangent' ? '2 4' : '6 5'}
                opacity={hl ? 1 : 0.6}
              >
                <title>{l.label}</title>
              </line>
            );
          })}

          {/* Curves */}
          {paths?.d2 && <path d={paths.d2} fill="none" stroke="var(--fa-d2)" strokeWidth={1.75} strokeDasharray="1 3" strokeLinecap="round" />}
          {paths?.d1 && <path d={paths.d1} fill="none" stroke="var(--fa-d1)" strokeWidth={1.75} strokeDasharray="6 4" />}
          {paths?.f && <path d={paths.f} fill="none" stroke="var(--fa-accent)" strokeWidth={2.5} strokeLinejoin="round" />}

          {/* Markers */}
          {show.markers &&
            markers.map((m) => {
              const s = MARKER_STYLE[m.kind];
              const hl = highlightId === m.id;
              const cx = sx(m.x);
              const cy = sy(m.y);
              if (cx < -10 || cx > W + 10 || cy < -10 || cy > H + 10) return null;
              return (
                <g
                  key={m.id}
                  className="cursor-pointer"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={() => onSelect(m.id)}
                  onPointerEnter={() => onHover(m.id)}
                  onPointerLeave={() => onHover(null)}
                >
                  <title>{`${m.label} (${fmt(m.x)}, ${fmt(m.y)})`}</title>
                  {hl && <circle cx={cx} cy={cy} r={s.r + 7} fill="var(--fa-accent)" opacity={0.18} />}
                  <circle cx={cx} cy={cy} r={hl ? s.r + 1.5 : s.r} fill={s.fill} stroke={s.stroke} strokeWidth={2} />
                  <circle cx={cx} cy={cy} r={12} fill="transparent" />
                  {hl && (
                    <text x={cx} y={cy - s.r - 10} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--fa-ink)" stroke="var(--fa-bg)" strokeWidth={4} paintOrder="stroke">
                      ({fmt(m.x)}, {fmt(m.y)})
                    </text>
                  )}
                </g>
              );
            })}

          {/* Hover readout */}
          {hoverX !== null && Number.isFinite(hoverY) && (
            <g pointerEvents="none">
              <line x1={sx(hoverX)} x2={sx(hoverX)} y1={0} y2={H} stroke="var(--fa-accent)" opacity={0.2} />
              <circle cx={sx(hoverX)} cy={sy(hoverY)} r={4} fill="var(--fa-accent)" />
            </g>
          )}
        </svg>
        {!plot && (
          <div className="absolute inset-0 grid place-items-center text-sm text-zinc-500">Type a function to see its graph.</div>
        )}
      </div>

      <p className="mt-2 h-5 font-mono text-xs text-zinc-600 tabular-nums dark:text-zinc-400" aria-hidden>
        {hoverX !== null ? `x = ${fmt(hoverX)}   f(x) = ${fmt(hoverY)}` : ''}
      </p>
      <p id={helpId} className="text-xs text-zinc-500 dark:text-zinc-400">
        Drag to pan. Click the graph first, then scroll to zoom. Keyboard: arrow keys pan, + / − zoom, 0 resets.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <span className="inline-flex items-center gap-2 text-zinc-700 dark:text-zinc-300">
          <span aria-hidden className="h-0.5 w-5 rounded bg-indigo-600 dark:bg-indigo-400" />
          f(x)
        </span>
        <label className="inline-flex cursor-pointer items-center gap-2 text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" checked={show.d1} onChange={(e) => setShow({ ...show, d1: e.target.checked })} className="size-4 accent-sky-500" />
          <span aria-hidden className="w-5 border-t-2 border-dashed border-sky-500" />
          f′(x)
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" checked={show.d2} onChange={(e) => setShow({ ...show, d2: e.target.checked })} className="size-4 accent-violet-500" />
          <span aria-hidden className="w-5 border-t-2 border-dotted border-violet-500" />
          f″(x)
        </label>
        <label className="inline-flex cursor-pointer items-center gap-2 text-zinc-700 dark:text-zinc-300">
          <input type="checkbox" checked={show.markers} onChange={(e) => setShow({ ...show, markers: e.target.checked })} className="size-4 accent-indigo-600" />
          Points
        </label>
      </div>

      <details className="group mt-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
        <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-zinc-800 select-none dark:text-zinc-200">
          <span aria-hidden className="mr-2 inline-block text-[10px] text-zinc-400 transition-transform group-open:rotate-90">▶</span>
          Window and grid
        </summary>
        <div className="space-y-3 border-t border-zinc-200 px-3 py-3 dark:border-zinc-800">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <NumberField label="x min" value={view.x0} onCommit={(n) => n < view.x1 && setView({ ...view, x0: n })} />
            <NumberField label="x max" value={view.x1} onCommit={(n) => n > view.x0 && setView({ ...view, x1: n })} />
            <NumberField label="y min" value={view.y0} onCommit={(n) => n < view.y1 && setView({ ...view, y0: n })} />
            <NumberField label="y max" value={view.y1} onCommit={(n) => n > view.y0 && setView({ ...view, y1: n })} />
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
            <input
              type="checkbox"
              checked={autoGrid}
              onChange={(e) => {
                setAutoGrid(e.target.checked);
                if (!e.target.checked) setStepText({ x: tickLabel(autoX, autoX), y: tickLabel(autoY, autoY) });
              }}
              className="size-4 accent-indigo-600"
            />
            Automatic grid spacing <span className="text-zinc-500">(currently x every {tickLabel(xStep, xStep)}, y every {tickLabel(yStep, yStep)})</span>
          </label>
          {!autoGrid && (
            <div className="grid grid-cols-2 gap-2 sm:max-w-xs">
              {(['x', 'y'] as const).map((axis) => (
                <span key={axis} className="flex flex-col gap-1">
                  <label htmlFor={`${helpId}-${axis}`} className="text-xs text-zinc-500 dark:text-zinc-400">
                    {axis} step
                  </label>
                  <input
                    id={`${helpId}-${axis}`}
                    value={stepText[axis]}
                    inputMode="decimal"
                    onChange={(e) => setStepText({ ...stepText, [axis]: e.target.value })}
                    className="rounded-lg border border-zinc-300 bg-white px-2 py-1 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  />
                </span>
              ))}
            </div>
          )}
          {gridWarning && <p className="text-xs text-amber-700 dark:text-amber-300">{gridWarning}</p>}
        </div>
      </details>

      <details className="group mt-2 rounded-xl border border-zinc-200 dark:border-zinc-800">
        <summary className="cursor-pointer list-none px-3 py-2 text-sm font-medium text-zinc-800 select-none dark:text-zinc-200">
          <span aria-hidden className="mr-2 inline-block text-[10px] text-zinc-400 transition-transform group-open:rotate-90">▶</span>
          Table of values
        </summary>
        <div className="max-h-72 overflow-auto border-t border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-right font-mono text-xs tabular-nums">
            <caption className="sr-only">Values of f, f′ and f″ across the visible window</caption>
            <thead className="sticky top-0 bg-zinc-50 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
              <tr>
                <th scope="col" className="px-3 py-1.5">x</th>
                <th scope="col" className="px-3 py-1.5">f(x)</th>
                <th scope="col" className="px-3 py-1.5">f′(x)</th>
                <th scope="col" className="px-3 py-1.5">f″(x)</th>
              </tr>
            </thead>
            <tbody className="text-zinc-800 dark:text-zinc-200">
              {table.map((r) => (
                <tr key={r.x} className="border-t border-zinc-100 dark:border-zinc-800">
                  <th scope="row" className="px-3 py-1 font-normal text-zinc-500">{tickLabel(r.x, xStep)}</th>
                  <td className="px-3 py-1">{Number.isFinite(r.f) ? fmt(r.f) : 'undef'}</td>
                  <td className="px-3 py-1">{fmt(r.d1)}</td>
                  <td className="px-3 py-1">{fmt(r.d2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
