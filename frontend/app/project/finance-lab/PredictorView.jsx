// ===========================================================================
// Predictor (Move Tree) — three sub-modes:
//   Basic     — readable portfolio outlook
//   Formula Lab — tunable signal weights / penalties + backtest
//   Move Tree — single-stock branch detail (Day-0 board → horizon)
//
// Drop in next to FinanceLabApp.jsx. Default export is <PredictorView/>.
// ===========================================================================
"use client";

import { useMemo, useState } from "react";
import { currency, percent, STOCKS, PRICE_MODE, priceSourceLabel } from "./data/financeLab";
import {
  DEFAULT_CONFIG,
  HORIZON_OPTIONS,
  BENCHMARK_MODE_OPTIONS,
  normalizeConfig,
  buildStockSetup,
  runMoveTree,
  runPortfolioMoveTree,
  backtestFormula,
  SETUP_QUALITY_META,
  BEHAVIOR_LABELS,
} from "./data/moveTree";

const CONF_TONE = {
  high: "text-emerald-300",
  medium: "text-cyan-300",
  low: "text-amber-300",
};

const QUALITY_TONE = {
  emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  cyan: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  slate: "border-slate-600/40 bg-slate-600/10 text-slate-300",
  amber: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  red: "border-red-500/40 bg-red-500/10 text-red-300",
};

function moveTone(value) {
  return value >= 0 ? "text-emerald-300" : "text-red-300";
}

function QualityBadge({ quality }) {
  const meta = SETUP_QUALITY_META[quality] || SETUP_QUALITY_META.neutral;
  const tone = QUALITY_TONE[meta.tone] || QUALITY_TONE.slate;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] ${tone}`}>
      {meta.label}
    </span>
  );
}

function SubTabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] transition ${
        active
          ? "bg-cyan-400/15 text-cyan-200 ring-1 ring-cyan-400/40"
          : "text-slate-400 hover:text-slate-200"
      }`}
    >
      {children}
    </button>
  );
}

function StatTile({ label, value, tone = "text-white", sub }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`mt-1 font-mono text-lg font-black ${tone}`}>{value}</p>
      {sub ? <p className="mt-0.5 font-mono text-xs text-slate-500">{sub}</p> : null}
    </div>
  );
}

function ProbBar({ up, flat, down }) {
  const u = Math.round(up * 100);
  const f = Math.round(flat * 100);
  const d = Math.max(0, 100 - u - f);
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full border border-slate-800 bg-slate-950">
        <div className="bg-emerald-500/70" style={{ width: `${u}%` }} />
        <div className="bg-slate-600/70" style={{ width: `${f}%` }} />
        <div className="bg-red-500/70" style={{ width: `${d}%` }} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[11px] text-slate-400">
        <span className="text-emerald-300">Up {u}%</span>
        <span className="text-slate-400">Flat {f}%</span>
        <span className="text-red-300">Down {d}%</span>
      </div>
    </div>
  );
}

function RangeBar({ worst, expected, best }) {
  const lo = Math.min(worst, 0);
  const hi = Math.max(best, 0);
  const span = hi - lo || 1;
  const pos = (v) => `${((v - lo) / span) * 100}%`;
  return (
    <div>
      <div className="relative h-8 w-full rounded-full border border-slate-800 bg-slate-950">
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-gradient-to-r from-red-500/50 via-slate-500/50 to-emerald-500/50"
          style={{ left: pos(worst), right: `calc(100% - ${pos(best)})` }}
        />
        {/* zero line */}
        <div className="absolute top-1 bottom-1 w-px bg-slate-600" style={{ left: pos(0) }} />
        {/* expected marker */}
        <div
          className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-300"
          style={{ left: pos(expected) }}
          title="Expected"
        />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[11px]">
        <span className="text-red-300">{percent(worst)}</span>
        <span className="text-cyan-200">exp {percent(expected)}</span>
        <span className="text-emerald-300">{percent(best)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Basic predictor — readable portfolio outlook
// ---------------------------------------------------------------------------

function BasicPredictor({ portfolio, scenario }) {
  const empty = !portfolio.stockResults.length;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              Portfolio outlook · next {portfolio.horizonDays} trading days
            </p>
            <p className={`mt-1 font-mono text-3xl font-black ${moveTone(portfolio.expectedMovePct)}`}>
              {percent(portfolio.expectedMovePct)}
            </p>
            <p className={`font-mono text-sm ${moveTone(portfolio.expectedDollarChange)}`}>
              {currency(portfolio.expectedDollarChange)} expected change
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Confidence</p>
            <p className={`font-mono text-xl font-black uppercase ${CONF_TONE[portfolio.confidence]}`}>
              {portfolio.confidence}
            </p>
            <p className="mt-1 font-mono text-xs text-slate-500">
              survival {Math.round(portfolio.survivalRate * 100)}%
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <StatTile label="Worst case (10%)" value={percent(portfolio.worstCasePct)} tone="text-red-300" sub={currency(portfolio.worstCaseDollarChange)} />
          <StatTile label="Expected" value={percent(portfolio.expectedMovePct)} tone="text-cyan-200" sub={currency(portfolio.expectedDollarChange)} />
          <StatTile label="Best case (90%)" value={percent(portfolio.bestCasePct)} tone="text-emerald-300" sub={currency(portfolio.bestCaseDollarChange)} />
        </div>

        <div className="mt-4">
          <RangeBar worst={portfolio.worstCasePct} expected={portfolio.expectedMovePct} best={portfolio.bestCasePct} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Main drivers</p>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
            {portfolio.mainDrivers.map((d, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-emerald-400">+</span>
                <span>{d}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Main risks</p>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
            {portfolio.mainRisks.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-amber-400">!</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-800">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-slate-900/70 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
            <tr>
              <th className="px-3 py-2">Symbol</th>
              <th className="px-3 py-2 text-right">Weight</th>
              <th className="px-3 py-2 text-right">Expected</th>
              <th className="px-3 py-2 text-right">Range</th>
              <th className="px-3 py-2 text-right">Survival</th>
              <th className="px-3 py-2 text-center">Setup</th>
              <th className="px-3 py-2">Why</th>
            </tr>
          </thead>
          <tbody>
            {empty ? (
              <tr><td colSpan={7} className="px-3 py-8 text-center text-slate-500">Add positions first.</td></tr>
            ) : (
              portfolio.stockResults.map((r) => (
                <tr key={r.symbol} className="border-t border-slate-800 align-top">
                  <td className="px-3 py-2 font-mono font-bold text-white">{r.symbol}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-300">{Math.round(r.weightFraction * 100)}%</td>
                  <td className={`px-3 py-2 text-right font-mono font-bold ${moveTone(r.expectedMovePct)}`}>{percent(r.expectedMovePct)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-slate-400">{percent(r.worstCasePct)} … {percent(r.bestCasePct)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-300">{Math.round(r.survivalRate * 100)}%</td>
                  <td className="px-3 py-2 text-center"><QualityBadge quality={r.setupQuality} /></td>
                  <td className="px-3 py-2 text-xs text-slate-400">{r.reasons[0]}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="px-1 text-xs leading-5 text-slate-600">
        Branch-based scenario model on deterministic demo adjusted closing prices — for {scenario.benchmarkSymbol || "VOO"}-relative
        experimentation, not investment advice. Current data mode: {PRICE_MODE.dataMode}.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Formula Lab — tunable weights/penalties + backtest
// ---------------------------------------------------------------------------

function LabSlider({ label, value, onChange, min = 0, max = 1, step = 0.05 }) {
  return (
    <label className="block">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">{label}</span>
        <span className="font-mono text-xs text-cyan-200">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-cyan-400"
      />
    </label>
  );
}

function FormulaLab({ config, setConfig, scenario }) {
  const cfg = normalizeConfig(config);
  const [pretendDate, setPretendDate] = useState("2025-01-02");
  const [backtest, setBacktest] = useState(null);

  const setWeight = (key, v) => setConfig({ ...cfg, weights: { ...cfg.weights, [key]: v } });
  const setPenalty = (key, v) => setConfig({ ...cfg, penalties: { ...cfg.penalties, [key]: v } });

  const runBacktest = () => {
    const symbols = (scenario.positions || []).map((p) => p.symbol);
    const universe = symbols.length ? Array.from(new Set(symbols)) : STOCKS.map((s) => s.symbol);
    setBacktest(backtestFormula(universe, cfg, pretendDate, cfg.horizonDays));
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Structure */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Tree structure</p>
          <div className="mt-3 space-y-3">
            <label className="block">
              <span className="text-xs text-slate-400">Horizon</span>
              <select
                value={cfg.horizonDays}
                onChange={(e) => setConfig({ ...cfg, horizonDays: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-200"
              >
                {HORIZON_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Branches per day</span>
              <select
                value={cfg.branches}
                onChange={(e) => setConfig({ ...cfg, branches: Number(e.target.value) })}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-200"
              >
                <option value={3}>3 — up / flat / down</option>
                <option value={5}>5 — adds strong / slight</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs text-slate-400">Benchmark mode</span>
              <select
                value={cfg.benchmarkMode}
                onChange={(e) => setConfig({ ...cfg, benchmarkMode: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-200"
              >
                {BENCHMARK_MODE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Weights */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Signal weights</p>
          <div className="mt-3 space-y-3">
            <LabSlider label="1-month trend" value={cfg.weights.oneMonth} onChange={(v) => setWeight("oneMonth", v)} />
            <LabSlider label="1-year trend" value={cfg.weights.oneYear} onChange={(v) => setWeight("oneYear", v)} />
            <LabSlider label="2–5 year trend" value={cfg.weights.yearsTwoToFive} onChange={(v) => setWeight("yearsTwoToFive", v)} />
            <LabSlider label="Sector trend" value={cfg.weights.sector} onChange={(v) => setWeight("sector", v)} />
            <LabSlider label="Benchmark / market" value={cfg.weights.benchmark} onChange={(v) => setWeight("benchmark", v)} />
          </div>
        </div>
      </div>

      {/* Penalties */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Penalties (uncertainty + mean-reversion)</p>
          <button
            type="button"
            onClick={() => setConfig({ ...DEFAULT_CONFIG })}
            className="rounded-lg border border-slate-700 px-3 py-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-400 hover:text-slate-200"
          >
            Reset defaults
          </button>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <LabSlider label="Overextension" value={cfg.penalties.overextension} onChange={(v) => setPenalty("overextension", v)} />
          <LabSlider label="Volatility" value={cfg.penalties.volatility} onChange={(v) => setPenalty("volatility", v)} />
          <LabSlider label="Earnings" value={cfg.penalties.earnings} onChange={(v) => setPenalty("earnings", v)} />
          <LabSlider label="Model fit" value={cfg.penalties.modelFit} onChange={(v) => setPenalty("modelFit", v)} />
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-600">
          Overextension applies a mean-reversion drag to drift. Volatility, earnings and poor model fit widen the
          branch spread and lower confidence — they add uncertainty rather than forcing a direction.
        </p>
      </div>

      {/* Backtest */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Backtest</p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="text-xs text-slate-400">Pretend it is</span>
            <input
              type="date"
              value={pretendDate}
              onChange={(e) => setPretendDate(e.target.value)}
              className="mt-1 block rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-200"
            />
          </label>
          <button
            type="button"
            onClick={runBacktest}
            className="rounded-lg bg-cyan-400/15 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-cyan-200 ring-1 ring-cyan-400/40 hover:bg-cyan-400/25"
          >
            Run backtest
          </button>
          <span className="font-mono text-xs text-slate-500">
            {(scenario.positions || []).length ? "uses your holdings" : "uses full stock list"}
          </span>
        </div>

        {backtest ? (
          <div className="mt-4 space-y-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <StatTile label="Direction accuracy" value={`${Math.round(backtest.directionAccuracy * 100)}%`} tone="text-cyan-200" />
              <StatTile label="Avg magnitude error" value={`${backtest.averageMagnitudeError.toFixed(2)} pp`} />
              <StatTile label="Best sector" value={backtest.bestSector} tone="text-emerald-300" />
              <StatTile label="Worst sector" value={backtest.worstSector} tone="text-amber-300" />
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-slate-900/70 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Symbol</th>
                    <th className="px-3 py-2 text-right">Predicted</th>
                    <th className="px-3 py-2 text-right">Actual</th>
                    <th className="px-3 py-2 text-center">Hit</th>
                    <th className="px-3 py-2">Miss type</th>
                  </tr>
                </thead>
                <tbody>
                  {backtest.rows.map((row) => (
                    <tr key={row.symbol} className="border-t border-slate-800">
                      <td className="px-3 py-2 font-mono font-bold text-white">{row.symbol}</td>
                      <td className={`px-3 py-2 text-right font-mono ${moveTone(row.predictedMove)}`}>{percent(row.predictedMove)} <span className="text-slate-500">({row.predictedDir})</span></td>
                      <td className={`px-3 py-2 text-right font-mono ${moveTone(row.actualMove)}`}>{percent(row.actualMove)} <span className="text-slate-500">({row.actualDir})</span></td>
                      <td className="px-3 py-2 text-center">{row.hit ? <span className="text-emerald-300">✓</span> : <span className="text-red-300">✗</span>}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-400">{row.missType.replace(/_/g, " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs leading-5 text-slate-600">
              The demo price model is deterministic and smooth, so accuracy here measures the formula&apos;s mechanics
              against synthetic data — not real-world predictive skill.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Pick a past date and run to score predicted vs. realized moves.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Move Tree — single-stock branch detail
// ---------------------------------------------------------------------------

function SetupRow({ label, value, tone = "text-slate-200" }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-800/60 py-1.5 last:border-0">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`font-mono text-sm ${tone}`}>{value}</span>
    </div>
  );
}

function MoveTreeView({ scenario, config }) {
  const portfolioSymbols = Array.from(new Set((scenario.positions || []).map((p) => p.symbol)));
  const initial = portfolioSymbols[0] || "CAT";
  const [symbol, setSymbol] = useState(initial);

  const benchmark = scenario.benchmarkSymbol || "VOO";
  const setup = useMemo(() => buildStockSetup(symbol, benchmark), [symbol, benchmark]);
  const result = useMemo(() => runMoveTree(setup, config, benchmark), [setup, config, benchmark]);

  const allSymbols = STOCKS.map((s) => s.symbol);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="block">
          <span className="text-xs text-slate-400">Stock</span>
          <select
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="mt-1 block rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-200"
          >
            {portfolioSymbols.length ? (
              <optgroup label="In your portfolio">
                {portfolioSymbols.map((s) => <option key={`p-${s}`} value={s}>{s}</option>)}
              </optgroup>
            ) : null}
            <optgroup label="All stocks">
              {allSymbols.map((s) => <option key={s} value={s}>{s}</option>)}
            </optgroup>
          </select>
        </label>
        <div>
          <p className="font-mono text-lg font-black text-white">{result.name}</p>
          <p className="font-mono text-xs text-slate-500">{result.sector} · {BEHAVIOR_LABELS[result.behaviorType] || result.behaviorType}</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Day-0 board */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Day 0 — opening board</p>
          <div className="mt-2">
            <SetupRow label="1-month return" value={percent(setup.oneMonthReturn)} tone={moveTone(setup.oneMonthReturn)} />
            <SetupRow label="1-year return" value={percent(setup.oneYearReturn)} tone={moveTone(setup.oneYearReturn)} />
            <SetupRow label="2–5 year return" value={percent(setup.yearsTwoToFiveReturn)} tone={moveTone(setup.yearsTwoToFiveReturn)} />
            <SetupRow label="Daily volatility" value={`${setup.dailyVol.toFixed(2)}%`} />
            <SetupRow label="Weekly volatility" value={`${setup.weeklyVol.toFixed(2)}%`} />
            <SetupRow label="Overextension" value={`${setup.overextLabel} (z ${setup.overextZ.toFixed(2)})`} tone={setup.overextZ >= 1.5 ? "text-amber-300" : "text-slate-200"} />
            <SetupRow label="Model fit" value={setup.modelFit} />
            <SetupRow label="Earnings soon" value={setup.earningsSoon ? "yes" : "no"} tone={setup.earningsSoon ? "text-amber-300" : "text-slate-200"} />
          </div>
        </div>

        {/* Branch result */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">After {result.horizonDays} days</p>
              <p className={`mt-1 font-mono text-3xl font-black ${moveTone(result.expectedMovePct)}`}>{percent(result.expectedMovePct)}</p>
            </div>
            <div className="text-right">
              <QualityBadge quality={result.setupQuality} />
              <p className={`mt-2 font-mono text-sm font-black uppercase ${CONF_TONE[result.confidence]}`}>{result.confidence}</p>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <ProbBar up={result.upProbability} flat={result.flatProbability} down={result.downProbability} />
            <RangeBar worst={result.worstCasePct} expected={result.expectedMovePct} best={result.bestCasePct} />
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="Survival" value={`${Math.round(result.survivalRate * 100)}%`} />
              <StatTile label="Branches" value={`${result.branches}/day`} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Reasons</p>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
            {result.reasons.map((r, i) => (
              <li key={i} className="flex gap-2"><span className="text-cyan-400">·</span><span>{r}</span></li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4">
          <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Warnings</p>
          <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
            {result.warnings.length ? result.warnings.map((w, i) => (
              <li key={i} className="flex gap-2"><span className="text-amber-400">!</span><span>{w}</span></li>
            )) : <li className="text-slate-500">No specific warnings.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Container
// ---------------------------------------------------------------------------

function PredictorView({ scenario, calc, config, setConfig }) {
  const [subTab, setSubTab] = useState("basic");

  const portfolio = useMemo(
    () => runPortfolioMoveTree(scenario, calc.resolved, calc, config),
    [scenario, calc, config]
  );

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Move Tree predictor</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-400">
            Treats each trading day as a branching turn (up / flat / down) and rolls the tree forward to ask whether a
            setup survives the likely branches — not just whether it goes up. Benchmarked against {scenario.benchmarkSymbol || "VOO"}.
          </p>
          <p className="mt-2 inline-flex rounded-full border border-slate-700 bg-slate-950 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-slate-400">
            Data: {priceSourceLabel()}
          </p>
        </div>
        <div className="flex gap-1 rounded-2xl border border-slate-800 bg-slate-950/60 p-1">
          <SubTabButton active={subTab === "basic"} onClick={() => setSubTab("basic")}>Basic</SubTabButton>
          <SubTabButton active={subTab === "formula"} onClick={() => setSubTab("formula")}>Formula Lab</SubTabButton>
          <SubTabButton active={subTab === "movetree"} onClick={() => setSubTab("movetree")}>Move Tree</SubTabButton>
        </div>
      </div>

      {subTab === "basic" && <BasicPredictor portfolio={portfolio} scenario={scenario} />}
      {subTab === "formula" && <FormulaLab config={config} setConfig={setConfig} scenario={scenario} />}
      {subTab === "movetree" && <MoveTreeView scenario={scenario} config={config} />}
    </div>
  );
}

export default PredictorView;
