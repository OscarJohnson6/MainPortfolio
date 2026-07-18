// Finance Lab — Move Tree engine
// A daily-turn scenario engine. It does NOT predict an exact price.
// It evaluates a "Day 0" setup, then rolls the setup forward across
// up/flat/down daily branches and reports how well the setup survives.
//
// All prices come from the deterministic demo model in financeLab.js.
// The demo model is treated as adjusted closing-price data, so every result
// here is reproducible and contains no live market data.

import { STOCKS, demoPrice, growth, offsetDate, todayISO } from "./financeLab";

const STOCK_BY_SYMBOL = Object.fromEntries(STOCKS.map((s) => [s.symbol, s]));

// ---------------------------------------------------------------------------
// Formula configuration (what the Formula Lab tab edits)
// ---------------------------------------------------------------------------

export const DEFAULT_CONFIG = {
  horizonDays: 5, // one trading week
  branches: 3, // 3 = up/flat/down, 5 = adds strong/slight buckets
  weights: {
    oneMonth: 0.2,
    oneYear: 0.3,
    yearsTwoToFive: 0.35,
    sector: 0.1,
    benchmark: 0.05,
  },
  penalties: {
    overextension: 0.2,
    volatility: 0.15,
    earnings: 0.1,
    modelFit: 0.1,
  },
  benchmarkMode: "blend", // blend | self | sectorHeavy | marketHeavy
};

const BENCHMARK_PRESETS = {
  blend: { sector: 1, market: 1 },
  self: { sector: 0, market: 0 },
  sectorHeavy: { sector: 1.6, market: 0.6 },
  marketHeavy: { sector: 0.5, market: 1.6 },
};

export const HORIZON_OPTIONS = [
  { value: 5, label: "1 week" },
  { value: 10, label: "2 weeks" },
  { value: 20, label: "1 month" },
];

export const BENCHMARK_MODE_OPTIONS = [
  { value: "blend", label: "Self + sector + market" },
  { value: "self", label: "Self only" },
  { value: "sectorHeavy", label: "Sector heavy" },
  { value: "marketHeavy", label: "Market heavy" },
];

export function normalizeConfig(config = {}) {
  return {
    ...DEFAULT_CONFIG,
    ...config,
    weights: { ...DEFAULT_CONFIG.weights, ...(config.weights || {}) },
    penalties: { ...DEFAULT_CONFIG.penalties, ...(config.penalties || {}) },
  };
}

// ---------------------------------------------------------------------------
// Small math helpers
// ---------------------------------------------------------------------------

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

function returnBetween(symbol, startDate, endDate) {
  const start = demoPrice(symbol, startDate);
  const end = demoPrice(symbol, endDate);
  return start > 0 ? ((end - start) / start) * 100 : 0;
}

const RISK_DAILY_VOL = { Lower: 0.7, Medium: 1.3, High: 2.2 };
const RISK_VOL_FLOOR = { Lower: 0.6, Medium: 0.9, High: 1.4 };

// Daily volatility (%). The demo price series is intentionally smooth, so its
// raw realized vol is uninformative. We instead derive a realistic daily vol
// from each stock's designed move magnitudes (weekMove / monthMove) blended
// with its risk tier. Unknown symbols fall back to a medium default.
function estimateDailyVol(stock) {
  const risk = stock?.risk || "Medium";
  const base = RISK_DAILY_VOL[risk] ?? 1.3;
  const week = Math.abs(Number(stock?.weekMove || 0));
  const month = Math.abs(Number(stock?.monthMove || 0));
  if (!week && !month) return base; // unknown symbol
  const fromWeekly = week / Math.sqrt(5); // weekly magnitude -> daily
  const fromMonthly = month / Math.sqrt(21); // monthly magnitude -> daily
  const blended = 0.45 * fromWeekly + 0.2 * fromMonthly + 0.35 * base;
  return clamp(blended, RISK_VOL_FLOOR[risk] ?? 0.9, 6);
}

// Detrended overextension: fit a trend line to the recent price path and
// measure how far the latest price sits above/below that line, in residual
// std-devs. This is the doc's "better overextension" idea and, unlike a
// trailing-average ratio, it does not read "high" for every uptrending name.
function overextension(symbol, endDate, lookbackDays = 120, step = 3) {
  const xs = [];
  const ys = [];
  for (let d = lookbackDays; d >= 0; d -= step) {
    xs.push(lookbackDays - d); // increasing with time
    ys.push(demoPrice(symbol, offsetDate(endDate, -d)));
  }
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const intercept = my - slope * mx;
  let ssr = 0;
  for (let i = 0; i < n; i++) ssr += (ys[i] - (intercept + slope * xs[i])) ** 2;
  const residualStd = Math.sqrt(ssr / n) || 1;
  const current = ys[n - 1];
  const predicted = intercept + slope * xs[n - 1];
  const z = (current - predicted) / residualStd;
  const trendPrice = predicted > 0 ? predicted : current;
  return { z, ratio: trendPrice > 0 ? current / trendPrice : 1 };
}

// ---------------------------------------------------------------------------
// Sector pressure: the "opponent" in the chess analogy is the environment.
// Built from the demo universe itself so the engine stays self-contained.
// ---------------------------------------------------------------------------

function sectorTrend(sector, excludeSymbol, endDate) {
  const peers = STOCKS.filter((s) => s.sector === sector && s.symbol !== excludeSymbol);
  if (!peers.length) return 0;
  const blended = peers.map((s) => 0.5 * growth(s.symbol, 30, endDate) + 0.5 * growth(s.symbol, 365, endDate));
  return blended.reduce((a, b) => a + b, 0) / blended.length;
}

// ---------------------------------------------------------------------------
// Behavior + model-fit classification
// ---------------------------------------------------------------------------

function classifyBehavior(stock, metrics) {
  const sector = stock?.sector || "";
  if (sector.includes("ETF")) return "index-like";
  const { oneYearReturn, dailyVol, overextZ } = metrics;
  if (oneYearReturn < -8) return "falling-knife";
  if (overextZ > 1.5 && oneYearReturn > 18) return "breakout";
  if (dailyVol > 1.8) return "high-volatility";
  if (stock?.risk === "Lower" && Math.abs(oneYearReturn) < 12) return "defensive";
  if (Math.abs(oneYearReturn) < 5) return "range-bound";
  if (sector === "Industrial manufacturing" || sector === "Automotive" || sector === "Aviation / defense")
    return "cyclical";
  return "trend";
}

function modelFitFor(stock, metrics) {
  const sector = stock?.sector || "";
  if (sector.includes("ETF")) return "high";
  if (stock?.risk === "High" || metrics.dailyVol > 1.4) return "low";
  if (stock?.risk === "Lower") return "high";
  return "medium";
}

const MODEL_FIT_SCORE = { low: 0.35, medium: 0.65, high: 0.95 };

function earningsSoon(stock) {
  // Demo heuristic: any stock carrying an earnings label is treated as
  // "event risk on" for the weekly horizon. (Real dates land in v12.)
  return Boolean(stock?.earnings && stock.earnings !== "N/A");
}

// ---------------------------------------------------------------------------
// Day 0: build the opening board for one symbol
// ---------------------------------------------------------------------------

export function buildStockSetup(symbol, benchmarkSymbol = "VOO", endDate = todayISO()) {
  const sym = String(symbol || "").toUpperCase();
  const stock = STOCK_BY_SYMBOL[sym] || { symbol: sym, sector: "Unknown", risk: "Medium", earnings: "N/A" };

  const oneMonthReturn = growth(sym, 30, endDate);
  const oneYearReturn = growth(sym, 365, endDate);
  const fiveYearReturn = growth(sym, 365 * 5, endDate);
  const yearsTwoToFiveReturn = returnBetween(sym, offsetDate(endDate, -365 * 5), offsetDate(endDate, -365));

  const dailyVol = estimateDailyVol(stock);
  const weeklyVol = dailyVol * Math.sqrt(5);

  const current = demoPrice(sym, endDate);
  const { z: overextZ, ratio: overextRatio } = overextension(sym, endDate);

  const metrics = { oneYearReturn, dailyVol, overextZ };
  const behaviorType = classifyBehavior(stock, metrics);
  const modelFit = modelFitFor(stock, metrics);

  return {
    symbol: sym,
    name: stock.name || sym,
    sector: stock.sector || "Unknown",
    benchmark: benchmarkSymbol,
    oneMonthReturn,
    oneYearReturn,
    fiveYearReturn,
    yearsTwoToFiveReturn,
    dailyVol,
    weeklyVol,
    overextZ,
    overextRatio,
    overextLabel: overextLabel(overextZ),
    behaviorType,
    modelFit,
    earningsSoon: earningsSoon(stock),
    sectorTrend: sectorTrend(stock.sector, sym, endDate),
    benchmarkTrend: 0.5 * growth(benchmarkSymbol, 30, endDate) + 0.5 * growth(benchmarkSymbol, 365, endDate),
    currentPrice: current,
  };
}

function overextLabel(z) {
  if (z >= 2.5) return "extreme";
  if (z >= 1.5) return "high";
  if (z >= 0.6) return "medium";
  return "low";
}

// ---------------------------------------------------------------------------
// Translate the Day-0 setup into a daily drift + spread
// ---------------------------------------------------------------------------

function setupToDailyModel(setup, config) {
  const w = config.weights;
  const preset = BENCHMARK_PRESETS[config.benchmarkMode] || BENCHMARK_PRESETS.blend;

  // Weighted blend of trend signals (longer windows scaled toward a weekly pace).
  const bias =
    w.oneMonth * setup.oneMonthReturn +
    w.oneYear * (setup.oneYearReturn / 4) +
    w.yearsTwoToFive * (setup.yearsTwoToFiveReturn / 12) +
    preset.sector * w.sector * setup.sectorTrend +
    preset.market * w.benchmark * setup.benchmarkTrend;

  const p = config.penalties;

  // (1) DRIFT drag: overextension pulls an extended name back toward its trend
  // (mean-reversion risk). Only positive overextension is a drag.
  const overextDrag = p.overextension * Math.max(0, setup.overextZ) * 0.18;

  // Raw daily drift, then capped relative to the stock's own movement scale so
  // a quiet name can't post an implausibly large daily drift.
  const driftCap = 0.8 * setup.dailyVol;
  const dailyDrift = clamp(bias * 0.045 - overextDrag, -driftCap, driftCap);

  // (2) SPREAD inflation: event risk, raw volatility and poor model fit widen
  // the daily branches (they make outcomes less certain, not just worse).
  const spreadInflation =
    1 +
    p.volatility * 0.15 +
    (setup.earningsSoon ? p.earnings * 0.6 : 0) +
    p.modelFit * (1 - MODEL_FIT_SCORE[setup.modelFit]);
  const dailyVol = Math.max(0.25, setup.dailyVol * spreadInflation);

  return {
    dailyDrift,
    dailyVol,
    flags: { bias, overextDrag, spreadInflation },
  };
}

// Per-day branch probabilities + magnitudes.
function dayBranches(dailyDrift, dailyVol, branches) {
  const z = dailyDrift / Math.max(dailyVol, 0.2);

  if (branches === 5) {
    const pFlat = clamp(0.26 - 0.05 * Math.abs(z), 0.1, 0.4);
    const remaining = 1 - pFlat;
    const upShare = remaining * sigmoid(1.4 * z);
    const downShare = remaining - upShare;
    return [
      { dir: "up", bucket: "strong-up", move: +2 * dailyVol, prob: upShare * 0.35 },
      { dir: "up", bucket: "slight-up", move: +1 * dailyVol, prob: upShare * 0.65 },
      { dir: "flat", bucket: "flat", move: 0, prob: pFlat },
      { dir: "down", bucket: "slight-down", move: -1 * dailyVol, prob: downShare * 0.65 },
      { dir: "down", bucket: "strong-down", move: -2 * dailyVol, prob: downShare * 0.35 },
    ];
  }

  const pFlat = clamp(0.32 - 0.05 * Math.abs(z), 0.12, 0.45);
  const remaining = 1 - pFlat;
  const pUp = remaining * sigmoid(1.4 * z);
  const pDown = remaining - pUp;
  return [
    { dir: "up", bucket: "up", move: +dailyVol, prob: pUp },
    { dir: "flat", bucket: "flat", move: 0, prob: pFlat },
    { dir: "down", bucket: "down", move: -dailyVol, prob: pDown },
  ];
}

// ---------------------------------------------------------------------------
// Roll the tree out across the horizon.
// Exact enumeration when small; Monte Carlo sampling when the tree is huge.
// Returns a weighted distribution of final cumulative returns (%).
// ---------------------------------------------------------------------------

const MAX_EXACT_PATHS = 60000;

function rollout(dailyDrift, dailyVol, branches, horizonDays) {
  const totalPaths = Math.pow(branches, horizonDays);

  if (totalPaths <= MAX_EXACT_PATHS) {
    const dist = [];
    const recurse = (day, prob, cumFactor) => {
      if (day === horizonDays) {
        dist.push({ prob, ret: (cumFactor - 1) * 100 });
        return;
      }
      for (const b of dayBranches(dailyDrift, dailyVol, branches)) {
        recurse(day + 1, prob * b.prob, cumFactor * (1 + b.move / 100));
      }
    };
    recurse(0, 1, 1);
    return dist;
  }

  // Monte Carlo fallback for long horizons.
  const samples = 20000;
  const weight = 1 / samples;
  const dist = [];
  for (let i = 0; i < samples; i++) {
    let factor = 1;
    for (let d = 0; d < horizonDays; d++) {
      const bs = dayBranches(dailyDrift, dailyVol, branches);
      const r = Math.random();
      let acc = 0;
      for (const b of bs) {
        acc += b.prob;
        if (r <= acc) {
          factor *= 1 + b.move / 100;
          break;
        }
      }
    }
    dist.push({ prob: weight, ret: (factor - 1) * 100 });
  }
  return dist;
}

// Probability-weighted percentile over the distribution.
function weightedPercentile(dist, q) {
  const sorted = [...dist].sort((a, b) => a.ret - b.ret);
  let acc = 0;
  for (const point of sorted) {
    acc += point.prob;
    if (acc >= q) return point.ret;
  }
  return sorted[sorted.length - 1]?.ret ?? 0;
}

// ---------------------------------------------------------------------------
// Confidence + setup-quality labelling
// ---------------------------------------------------------------------------

function confidenceFrom(setup, spread) {
  const fit = MODEL_FIT_SCORE[setup.modelFit];
  // Confidence leans on how well the name fits the model, with a secondary
  // penalty for very wide branch spreads. Event risk trims it slightly.
  const tightness = 1 - clamp(spread / 16, 0, 1);
  let score = 0.55 * fit + 0.45 * tightness;
  if (setup.earningsSoon) score -= 0.08;
  if (score >= 0.7) return "high";
  if (score >= 0.45) return "medium";
  return "low";
}

function setupQualityFrom(expected, survival, setup) {
  if (setup.overextLabel === "extreme" && expected > 0) return "high-risk";
  if (survival >= 0.62 && expected > 0.6) return "strong";
  if (survival >= 0.5 && expected >= -0.4) return "watch";
  if (survival < 0.4 || expected < -1.2) return "weak";
  return "neutral";
}

function buildReasonsAndWarnings(setup, model) {
  const reasons = [];
  const warnings = [];

  if (setup.oneMonthReturn > 1.5) reasons.push("1-month trend is positive");
  if (setup.sectorTrend > 1) reasons.push(`${setup.sector.toLowerCase()} sector is supportive`);
  if (setup.benchmarkTrend > 1) reasons.push("broad market is trending up");
  if (setup.modelFit === "high") reasons.push("behavior fits the model well");
  if (setup.overextLabel === "low") reasons.push("not extended above its normal range");

  if (setup.overextLabel === "high" || setup.overextLabel === "extreme")
    warnings.push("trading well above its long-run range — late-entry risk");
  if (setup.dailyVol > 1.2) warnings.push("high day-to-day volatility widens the branches");
  if (setup.earningsSoon) warnings.push("earnings-style event risk in the window");
  if (setup.behaviorType === "falling-knife") warnings.push("weak long-term trend (possible falling knife)");
  if (setup.modelFit === "low") warnings.push("event-sensitive — the model fits this name poorly");
  if (setup.sectorTrend < -1) warnings.push("sector pressure is currently negative");

  if (!reasons.length) reasons.push("setup is roughly neutral");
  if (!warnings.length) warnings.push("no major red flags in the setup");
  return { reasons, warnings };
}

// ---------------------------------------------------------------------------
// Public: run the move tree for one symbol -> StockTreeResult
// ---------------------------------------------------------------------------

export function runMoveTree(symbolOrSetup, config = DEFAULT_CONFIG, benchmarkSymbol = "VOO", endDate = todayISO()) {
  const cfg = normalizeConfig(config);
  const setup =
    typeof symbolOrSetup === "string" ? buildStockSetup(symbolOrSetup, benchmarkSymbol, endDate) : symbolOrSetup;

  const model = setupToDailyModel(setup, cfg);
  const dist = rollout(model.dailyDrift, model.dailyVol, cfg.branches, cfg.horizonDays);

  const expectedMovePct = dist.reduce((sum, d) => sum + d.prob * d.ret, 0);
  const bestCasePct = weightedPercentile(dist, 0.9);
  const worstCasePct = weightedPercentile(dist, 0.1);

  // Direction split using a small dead-band around zero.
  const band = Math.max(0.5, 0.35 * setup.weeklyVol);
  let up = 0;
  let down = 0;
  let flat = 0;
  for (const d of dist) {
    if (d.ret > band) up += d.prob;
    else if (d.ret < -band) down += d.prob;
    else flat += d.prob;
  }

  // Survival = probability the horizon ends above a drawdown floor. The floor
  // is mostly fixed (a "normal bad week") with a small volatility allowance,
  // so genuinely shaky setups show lower survival.
  const floor = Math.max(2, 0.6 * setup.weeklyVol);
  const survivalRaw = dist.reduce((sum, d) => sum + (d.ret >= -floor ? d.prob : 0), 0);
  const survivalRate = clamp(survivalRaw, 0, 1);

  const spread = bestCasePct - worstCasePct;
  const confidence = confidenceFrom(setup, spread);
  const setupQuality = setupQualityFrom(expectedMovePct, survivalRate, setup);
  const { reasons, warnings } = buildReasonsAndWarnings(setup, model);

  return {
    symbol: setup.symbol,
    name: setup.name,
    sector: setup.sector,
    horizonDays: cfg.horizonDays,
    branches: cfg.branches,
    upProbability: up,
    flatProbability: flat,
    downProbability: down,
    expectedMovePct,
    bestCasePct,
    worstCasePct,
    survivalRate,
    confidence,
    setupQuality,
    modelFit: setup.modelFit,
    behaviorType: setup.behaviorType,
    overextLabel: setup.overextLabel,
    reasons,
    warnings,
    setup,
    _dist: dist, // retained for portfolio-level sampling
  };
}

// ---------------------------------------------------------------------------
// Portfolio aggregation
// ---------------------------------------------------------------------------

function sampleFromDist(dist) {
  const r = Math.random();
  let acc = 0;
  for (const d of dist) {
    acc += d.prob;
    if (r <= acc) return d.ret;
  }
  return dist[dist.length - 1]?.ret ?? 0;
}

// scenario: { positions, startingCash, benchmarkSymbol }
// resolvedPositions: output of calculateScenario(scenario).resolved (has .value, .symbol)
export function runPortfolioMoveTree(scenario, resolvedPositions, calc, config = DEFAULT_CONFIG, endDate = todayISO()) {
  const cfg = normalizeConfig(config);
  const benchmark = scenario.benchmarkSymbol || "VOO";
  const accountValue = calc?.accountValue || 0;
  const cash = calc?.cash || 0;

  // De-duplicate symbols (combine identical tickers by value) but keep rows
  // for display.
  const stockResults = [];
  const distByWeight = []; // { ret-distribution, weightFraction }

  for (const pos of resolvedPositions) {
    if (!(pos.value > 0)) continue;
    const result = runMoveTree(pos.symbol, cfg, benchmark, endDate);
    const weightFraction = accountValue > 0 ? pos.value / accountValue : 0;
    result.value = pos.value;
    result.weightFraction = weightFraction;
    stockResults.push(result);
    distByWeight.push({ dist: result._dist, w: weightFraction });
  }

  const cashWeight = accountValue > 0 ? cash / accountValue : 0;

  // Expected portfolio move = value-weighted expected stock move (cash = 0).
  const expectedMovePct = stockResults.reduce((sum, r) => sum + r.weightFraction * r.expectedMovePct, 0);

  // Monte Carlo over the portfolio assuming independent stock branches.
  // This is where diversification shows up vs. a single concentrated name.
  const samples = 4000;
  const portfolioRets = new Array(samples);
  for (let i = 0; i < samples; i++) {
    let ret = 0;
    for (const item of distByWeight) ret += item.w * sampleFromDist(item.dist);
    portfolioRets[i] = ret; // cash sleeve contributes 0
  }
  portfolioRets.sort((a, b) => a - b);
  const pct = (q) => portfolioRets[Math.min(samples - 1, Math.floor(q * samples))];
  const bestCasePct = pct(0.9);
  const worstCasePct = pct(0.1);

  const floor = 2;
  const survivalRate = portfolioRets.filter((r) => r >= -floor).length / samples;

  const expectedDollarChange = (accountValue * expectedMovePct) / 100;
  const bestCaseDollarChange = (accountValue * bestCasePct) / 100;
  const worstCaseDollarChange = (accountValue * worstCasePct) / 100;

  // Sector concentration
  const sectorValue = {};
  let investedValue = 0;
  for (const r of stockResults) {
    sectorValue[r.sector] = (sectorValue[r.sector] || 0) + r.value;
    investedValue += r.value;
  }
  const sectorBreakdown = Object.entries(sectorValue)
    .map(([sector, value]) => ({ sector, value, weight: investedValue > 0 ? value / investedValue : 0 }))
    .sort((a, b) => b.weight - a.weight);
  const topSector = sectorBreakdown[0];

  // Confidence: value-weighted stock confidence, knocked down by concentration.
  const confScore = stockResults.reduce((sum, r) => {
    const fit = r.confidence === "high" ? 0.9 : r.confidence === "medium" ? 0.6 : 0.35;
    return sum + r.weightFraction * fit;
  }, 0) + cashWeight * 0.9;
  const concentrationPenalty = topSector ? clamp((topSector.weight - 0.5) * 0.5, 0, 0.25) : 0;
  const adjConf = confScore - concentrationPenalty;
  const confidence = adjConf >= 0.7 ? "high" : adjConf >= 0.45 ? "medium" : "low";

  // Drivers + risks
  const ranked = [...stockResults].sort((a, b) => b.weightFraction * b.expectedMovePct - a.weightFraction * a.expectedMovePct);
  const mainDrivers = ranked.slice(0, 3).map((r) => `${r.symbol}: ${r.reasons[0]}`);
  const mainRisks = [];
  if (topSector && topSector.weight >= 0.5)
    mainRisks.push(`${Math.round(topSector.weight * 100)}% concentrated in ${topSector.sector.toLowerCase()}`);
  for (const r of stockResults) {
    if (r.setupQuality === "high-risk" || r.setupQuality === "weak")
      mainRisks.push(`${r.symbol}: ${r.warnings[0]}`);
  }
  if (cashWeight < 0.05 && stockResults.length) mainRisks.push("almost fully invested — little cash buffer");
  if (!mainRisks.length) mainRisks.push("no dominant single risk detected");

  return {
    horizonDays: cfg.horizonDays,
    branches: cfg.branches,
    accountValue,
    cashWeight,
    expectedMovePct,
    bestCasePct,
    worstCasePct,
    expectedDollarChange,
    bestCaseDollarChange,
    worstCaseDollarChange,
    survivalRate,
    confidence,
    sectorBreakdown,
    mainDrivers: mainDrivers.length ? mainDrivers : ["No positions to drive a result."],
    mainRisks: mainRisks.slice(0, 4),
    stockResults,
  };
}

// ---------------------------------------------------------------------------
// Backtest harness (Formula Lab). Runs the engine from a past "pretend date"
// and scores predicted direction against the demo model's realized move.
// Honest note: against demo data this measures the formula's mechanics, not
// real-world accuracy.
// ---------------------------------------------------------------------------

export function backtestFormula(symbols, config = DEFAULT_CONFIG, pretendDate, horizonDays) {
  const cfg = normalizeConfig({ ...config, horizonDays: horizonDays || config.horizonDays });
  const results = [];
  let correct = 0;
  let magError = 0;
  const sectorHits = {};
  const sectorTotals = {};

  for (const symbol of symbols) {
    const setup = buildStockSetup(symbol, "VOO", pretendDate);
    const tree = runMoveTree(setup, cfg, "VOO", pretendDate);

    const predictedDir = tree.expectedMovePct > 0.3 ? "up" : tree.expectedMovePct < -0.3 ? "down" : "flat";
    const predictedMove = tree.expectedMovePct;

    const futureDate = offsetDate(pretendDate, cfg.horizonDays);
    const actualMove = returnBetween(symbol, pretendDate, futureDate);
    const actualDir = actualMove > 0.3 ? "up" : actualMove < -0.3 ? "down" : "flat";

    const hit = predictedDir === actualDir;
    if (hit) correct++;
    magError += Math.abs(predictedMove - actualMove);

    const sec = setup.sector;
    sectorTotals[sec] = (sectorTotals[sec] || 0) + 1;
    if (hit) sectorHits[sec] = (sectorHits[sec] || 0) + 1;

    results.push({
      symbol,
      sector: sec,
      predictedDir,
      actualDir,
      predictedMove,
      actualMove,
      hit,
      missType: classifyMiss(tree, predictedDir, actualDir),
    });
  }

  const n = symbols.length || 1;
  const sectorAccuracy = Object.keys(sectorTotals)
    .map((sec) => ({ sector: sec, accuracy: (sectorHits[sec] || 0) / sectorTotals[sec] }))
    .sort((a, b) => b.accuracy - a.accuracy);

  return {
    pretendDate,
    horizonDays: cfg.horizonDays,
    directionAccuracy: correct / n,
    averageMagnitudeError: magError / n,
    bestSector: sectorAccuracy[0]?.sector || "—",
    worstSector: sectorAccuracy[sectorAccuracy.length - 1]?.sector || "—",
    rows: results,
  };
}

function classifyMiss(tree, predictedDir, actualDir) {
  if (predictedDir === actualDir) return "correct";
  if (tree.confidence === "low") return "expected_branch";
  if (tree.confidence === "high") return "bad_confidence";
  if (tree.setup.earningsSoon) return "event_driven";
  return "stock_specific";
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export const SETUP_QUALITY_META = {
  strong: { label: "Strong", tone: "emerald" },
  watch: { label: "Watch", tone: "cyan" },
  neutral: { label: "Neutral", tone: "slate" },
  weak: { label: "Weak", tone: "amber" },
  "high-risk": { label: "High risk", tone: "red" },
};

export const BEHAVIOR_LABELS = {
  trend: "Trend",
  "range-bound": "Range-bound",
  cyclical: "Cyclical",
  defensive: "Defensive",
  "high-volatility": "High volatility",
  breakout: "Breakout",
  "falling-knife": "Falling knife",
  "index-like": "Index-like",
};
