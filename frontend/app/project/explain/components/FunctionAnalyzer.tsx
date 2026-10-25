'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { analyze } from '../lib/api';
import { ancestors, diffSteps } from '../lib/diff';
import type {
  AnalyzeRequest, AnalyzeResponse, EngineSettings, LimitQuery, LimitSide, LimitTarget, ResultItem, Step, Suggestion,
} from '../lib/types';
import { ExpressionInput } from './ExpressionInput';
import { Graph, type GraphLine, type GraphMarker } from './Graph';
import { IOPanel } from './IOPanel';
import { StepsPanel } from './StepsPanel';

const DEFAULT_SETTINGS: EngineSettings = { recognizeConstants: true, piMode: 'exact', logBase: '10' };
const SCAN = { min: -20, max: 20 };
const DEBOUNCE_MS = 350;

export function FunctionAnalyzer() {
  // ---- What the user asked ----
  const [expression, setExpression] = useState('(x^2 - 1)/(x - 1)');
  const [settings, setSettings] = useState<EngineSettings>(DEFAULT_SETTINGS);
  const [paramValues, setParamValues] = useState<Record<string, number | null>>({});
  const [limits, setLimits] = useState<LimitQuery[]>([{ id: 'l1', target: 1, side: 'both' }]);
  const [points, setPoints] = useState<number[]>([]);
  const [interval, setInterval] = useState<{ a: number; b: number } | null>(null);
  const nextLimitId = useRef(2);

  // ---- What the engine answered ----
  const [latest, setLatest] = useState<AnalyzeResponse | null>(null);
  const [good, setGood] = useState<{ res: AnalyzeResponse; prevSteps: Step[] | null } | null>(null);
  const [pending, setPending] = useState(false);

  // ---- View state ----
  const [stepsOpen, setStepsOpen] = useState(false);
  const [compare, setCompare] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const request = useMemo<AnalyzeRequest>(
    () => ({ expression, params: paramValues, settings, limits, points, interval, scan: SCAN }),
    [expression, paramValues, settings, limits, points, interval],
  );

  const seq = useRef(0);
  useEffect(() => {
    const my = ++seq.current;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      setPending(true);
      try {
        const res = await analyze(request, ctrl.signal);
        if (my !== seq.current) return;
        setLatest(res);
        // Keep the last successful run so the diff can compare against it.
        if (res.ok) setGood((prev) => ({ res, prevSteps: prev ? prev.res.steps : null }));
      } catch {
        // Aborted by a newer request — nothing to do.
      } finally {
        if (my === seq.current) setPending(false);
      }
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [request]);

  const result = good?.res ?? null;
  const stale = !!latest && !latest.ok && !!good;
  const diff = useMemo(() => diffSteps(good?.prevSteps ?? null, good?.res.steps ?? []), [good]);

  const allItems = useMemo(() => result?.sections.flatMap((s) => s.items) ?? [], [result]);
  const markers = useMemo<GraphMarker[]>(
    () => allItems.filter((i) => i.marker).map((i) => ({ id: i.id, label: i.label, ...i.marker! })),
    [allItems],
  );
  const lines = useMemo<GraphLine[]>(
    () => allItems.filter((i) => i.line).map((i) => ({ id: i.id, label: i.label, line: i.line!, tone: i.id.endsWith('-t') ? 'tangent' : 'asymptote' })),
    [allItems],
  );

  const select = (item: ResultItem) => {
    setSelected(item.id);
    if (item.stepId) {
      const stepId = item.stepId;
      setStepsOpen(true);
      setExpanded((prev) => new Set([...prev, ...ancestors(stepId)]));
      setFocus({ id: stepId, n: Date.now() });
    }
  };

  const applySuggestion = (s: Suggestion) => {
    setExpression(s.expression);
    if (s.addPoint !== undefined) {
      const x = s.addPoint;
      setPoints((p) => (p.includes(x) ? p : [...p, x]));
    }
  };

  const engineLabel = result?.engine === 'python' ? 'Python engine' : 'Mock engine (in-browser)';

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-widest text-indigo-600 uppercase dark:text-indigo-400">OJ Builds</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl dark:text-zinc-50">e(x)plain</h1>
          <p className="mt-2 max-w-2xl text-zinc-600 dark:text-zinc-400">
            Type any function. It reads it, takes it apart, and shows every step — derivatives, critical points, holes, asymptotes and limits —
            with each answer checked against your original input.
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset ${
            result?.engine === 'python'
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300'
              : 'bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300'
          }`}
        >
          {engineLabel}
        </span>
      </header>

      <div className="space-y-4">
        <ExpressionInput
          value={expression}
          onChange={setExpression}
          settings={settings}
          onSettingsChange={setSettings}
          echo={latest?.ok && latest.input === expression ? (latest.parsed?.latex ?? null) : null}
          diagnostics={latest?.input === expression ? latest.diagnostics : []}
          pending={pending}
          onApplySuggestion={applySuggestion}
        />

        {result && (
          <StepsPanel
            steps={result.steps}
            diff={diff}
            open={stepsOpen}
            onOpenChange={setStepsOpen}
            compare={compare}
            onCompareChange={setCompare}
            hasPrevious={!!good?.prevSteps}
            expanded={expanded}
            onToggle={(id) =>
              setExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id);
                else next.add(id);
                return next;
              })
            }
            onSetExpanded={setExpanded}
            focus={focus}
            stale={stale}
          />
        )}

        <div className="grid gap-4 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-7">
            <div className="lg:sticky lg:top-4">
              <Graph
                plot={result?.plot ?? null}
                settings={settings}
                markers={markers}
                lines={lines}
                highlightId={hovered ?? selected}
                onSelect={(id) => {
                  const item = allItems.find((i) => i.id === id);
                  if (item) select(item);
                }}
                onHover={setHovered}
                interval={interval}
                stale={stale}
                description={`Graph of ${result?.input ?? 'nothing yet'}. ${markers.length} marked points. The Results list has the same information as text.`}
              />
            </div>
          </div>
          <div className="min-w-0 lg:col-span-5">
            <IOPanel
              mainVar={result?.parsed?.mainVar ?? 'x'}
              params={result?.parsed?.params ?? []}
              paramValues={paramValues}
              onParamChange={(name, v) => setParamValues((prev) => ({ ...prev, [name]: v }))}
              limits={limits}
              onAddLimit={(target: LimitTarget, side: LimitSide) => {
                const id = `l${nextLimitId.current++}`;
                setLimits((prev) =>
                  prev.some((l) => l.target === target && l.side === side) ? prev : [...prev, { id, target, side }],
                );
              }}
              onRemoveLimit={(id) => setLimits((prev) => prev.filter((l) => l.id !== id))}
              points={points}
              onAddPoint={(x) => setPoints((prev) => (prev.includes(x) ? prev : [...prev, x]))}
              onRemovePoint={(x) => setPoints((prev) => prev.filter((p) => p !== x))}
              interval={interval}
              onSetInterval={setInterval}
              sections={result?.sections ?? []}
              notices={result?.notices ?? []}
              highlightId={hovered ?? selected}
              onSelect={select}
              onHover={setHovered}
              stale={stale}
              pending={pending}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
