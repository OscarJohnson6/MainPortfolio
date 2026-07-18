export const STORAGE_KEY = "finance_lab_v5_scenarios";
export const ACTIVE_KEY = "finance_lab_v5_active_scenario_id";

// Finance Lab currently uses deterministic demo prices. Treat every demo
// price as a synthetic adjusted closing price so the simulator has one clear
// price basis. When live APIs are added, prefer adjusted close for historical
// buys and chart history because it handles splits/dividends better than raw
// close.
export const PRICE_MODE = {
  dataMode: "demo",
  source: "deterministic-demo",
  timing: "close",
  field: "adjustedClose",
  label: "Demo adjusted close",
  isDemo: true,
  note: "Synthetic demo values modeled as adjusted closing prices; no live API call is made.",
};

export function priceSourceLabel() {
  return `${PRICE_MODE.label} · ${PRICE_MODE.timing} · ${PRICE_MODE.source}`;
}


export const STOCKS = [
  { symbol: "AAPL", name: "Apple Inc.", sector: "Consumer electronics", industry: "Devices", risk: "Medium", weekMove: 1.4, monthMove: 4.1, sentiment: "Hold", earnings: "Jul 31", note: "Mature consumer-tech business." },
  { symbol: "MSFT", name: "Microsoft Corp.", sector: "Software", industry: "Enterprise software", risk: "Medium", weekMove: 0.9, monthMove: 3.2, sentiment: "Buy", earnings: "Jul 25", note: "Cloud and enterprise software exposure." },
  { symbol: "NVDA", name: "NVIDIA Corp.", sector: "Semiconductors", industry: "GPUs", risk: "High", weekMove: 4.8, monthMove: 15.6, sentiment: "Hold", earnings: "Aug 28", note: "High-growth chip exposure." },
  { symbol: "AMD", name: "Advanced Micro Devices", sector: "Semiconductors", industry: "CPUs / GPUs", risk: "High", weekMove: -2.2, monthMove: 6.9, sentiment: "Hold", earnings: "Jul 30", note: "Volatile semiconductor exposure." },
  { symbol: "AMZN", name: "Amazon.com Inc.", sector: "Retail / cloud", industry: "E-commerce", risk: "Medium", weekMove: 1.8, monthMove: 5.4, sentiment: "Buy", earnings: "Aug 1", note: "Retail plus cloud exposure." },
  { symbol: "TSLA", name: "Tesla Inc.", sector: "Automotive", industry: "EVs", risk: "High", weekMove: -4.4, monthMove: 8.8, sentiment: "Hold", earnings: "Jul 23", note: "High-volatility auto/energy exposure." },
  { symbol: "F", name: "Ford Motor Co.", sector: "Automotive", industry: "Automakers", risk: "High", weekMove: -1.1, monthMove: 1.2, sentiment: "Hold", earnings: "Jul 24", note: "Traditional auto manufacturer." },
  { symbol: "GM", name: "General Motors", sector: "Automotive", industry: "Automakers", risk: "High", weekMove: 2.0, monthMove: 5.8, sentiment: "Hold", earnings: "Jul 23", note: "Traditional auto manufacturer." },
  { symbol: "TM", name: "Toyota Motor Corp.", sector: "Automotive", industry: "Automakers", risk: "Medium", weekMove: 0.6, monthMove: 2.9, sentiment: "Hold", earnings: "Aug 6", note: "Global automotive manufacturer." },
  { symbol: "BA", name: "Boeing Co.", sector: "Aviation / defense", industry: "Aircraft", risk: "High", weekMove: -3.5, monthMove: -8.6, sentiment: "Sell", earnings: "Jul 31", note: "Commercial aircraft manufacturer." },
  { symbol: "RTX", name: "RTX Corp.", sector: "Aviation / defense", industry: "Aerospace systems", risk: "Medium", weekMove: 1.2, monthMove: 4.7, sentiment: "Buy", earnings: "Jul 25", note: "Aerospace and defense systems." },
  { symbol: "LMT", name: "Lockheed Martin", sector: "Defense manufacturing", industry: "Defense", risk: "Medium", weekMove: 0.4, monthMove: 1.9, sentiment: "Hold", earnings: "Jul 23", note: "Defense manufacturing exposure." },
  { symbol: "CAT", name: "Caterpillar Inc.", sector: "Industrial manufacturing", industry: "Machinery", risk: "Medium", weekMove: 2.6, monthMove: 7.5, sentiment: "Buy", earnings: "Aug 6", note: "Heavy equipment exposure." },
  { symbol: "DE", name: "Deere & Co.", sector: "Industrial manufacturing", industry: "Agriculture machinery", risk: "Medium", weekMove: -0.8, monthMove: 3.1, sentiment: "Hold", earnings: "Aug 15", note: "Agriculture and machinery exposure." },
  { symbol: "HON", name: "Honeywell", sector: "Industrial manufacturing", industry: "Industrial technology", risk: "Medium", weekMove: 1.1, monthMove: 2.6, sentiment: "Hold", earnings: "Jul 25", note: "Industrial technology exposure." },
  { symbol: "JNJ", name: "Johnson & Johnson", sector: "Health care", industry: "Pharma / devices", risk: "Lower", weekMove: 0.3, monthMove: 1.1, sentiment: "Hold", earnings: "Jul 17", note: "Defensive health care base." },
  { symbol: "UNH", name: "UnitedHealth Group", sector: "Health care", industry: "Insurance", risk: "Medium", weekMove: -1.9, monthMove: -4.2, sentiment: "Hold", earnings: "Jul 16", note: "Health insurance and services exposure." },
  { symbol: "PFE", name: "Pfizer Inc.", sector: "Health care", industry: "Pharma", risk: "Medium", weekMove: 1.7, monthMove: -0.9, sentiment: "Hold", earnings: "Jul 30", note: "Pharmaceutical exposure." },
  { symbol: "AMT", name: "American Tower", sector: "Real estate", industry: "Tower REIT", risk: "Medium", weekMove: 1.3, monthMove: 2.3, sentiment: "Hold", earnings: "Jul 25", note: "Tower real estate exposure." },
  { symbol: "PLD", name: "Prologis", sector: "Real estate", industry: "Industrial REIT", risk: "Medium", weekMove: -0.4, monthMove: 1.8, sentiment: "Hold", earnings: "Jul 17", note: "Warehouse real estate exposure." },
  { symbol: "O", name: "Realty Income", sector: "Real estate", industry: "Retail REIT", risk: "Medium", weekMove: 0.5, monthMove: 1.5, sentiment: "Hold", earnings: "Aug 5", note: "Income-focused REIT test." },
  { symbol: "JPM", name: "JPMorgan Chase", sector: "Financials", industry: "Banking", risk: "Medium", weekMove: 1.9, monthMove: 6.1, sentiment: "Buy", earnings: "Jul 12", note: "Large bank exposure." },
  { symbol: "VOO", name: "Vanguard S&P 500 ETF", sector: "Index ETF", industry: "ETF", risk: "Lower", weekMove: 0.8, monthMove: 3.0, sentiment: "Hold", earnings: "N/A", note: "Broad S&P 500 exposure." },
  { symbol: "SPY", name: "SPDR S&P 500 ETF Trust", sector: "Index ETF", industry: "ETF", risk: "Lower", weekMove: 0.8, monthMove: 3.0, sentiment: "Hold", earnings: "N/A", note: "Broad market benchmark." },
  { symbol: "QQQ", name: "Invesco QQQ ETF", sector: "Index ETF", industry: "ETF", risk: "Medium", weekMove: 1.2, monthMove: 4.8, sentiment: "Hold", earnings: "N/A", note: "Growth-heavy index exposure." },
  { symbol: "SCHD", name: "Schwab U.S. Dividend Equity ETF", sector: "Dividend ETF", industry: "ETF", risk: "Lower", weekMove: 0.2, monthMove: 1.0, sentiment: "Hold", earnings: "N/A", note: "Dividend ETF tilt." },
];

export const EXAMPLE_SCENARIOS = [
  {
    id: "template-industrial-manufacturing",
    title: "Industrial manufacturing",
    description: "A practical basket tied to equipment, industrial systems, and production.",
    startingCash: 10000,
    benchmarkSymbol: "VOO",
    positions: [
      { id: "pos-cat", symbol: "CAT", buyDate: "2024-01-02", inputMode: "dollars", inputAmount: 3000, thesis: "Heavy equipment exposure." },
      { id: "pos-de", symbol: "DE", buyDate: "2024-01-02", inputMode: "dollars", inputAmount: 2500, thesis: "Agriculture and machinery exposure." },
      { id: "pos-hon", symbol: "HON", buyDate: "2024-01-02", inputMode: "dollars", inputAmount: 2500, thesis: "Industrial technology exposure." },
    ],
  },
  {
    id: "template-health-stability",
    title: "Health care stability",
    description: "Lower-flash test focused on health care and defensive business models.",
    startingCash: 10000,
    benchmarkSymbol: "VOO",
    positions: [
      { id: "pos-jnj", symbol: "JNJ", buyDate: "2024-01-02", inputMode: "dollars", inputAmount: 3500, thesis: "Defensive health care base." },
      { id: "pos-unh", symbol: "UNH", buyDate: "2024-01-02", inputMode: "dollars", inputAmount: 3000, thesis: "Health insurance and services exposure." },
      { id: "pos-pfe", symbol: "PFE", buyDate: "2024-01-02", inputMode: "dollars", inputAmount: 1500, thesis: "Pharmaceutical exposure." },
    ],
  },
  {
    id: "template-real-estate-income",
    title: "Real estate income",
    description: "REIT-oriented scenario for testing property and income-style exposure.",
    startingCash: 10000,
    benchmarkSymbol: "VOO",
    positions: [
      { id: "pos-amt", symbol: "AMT", buyDate: "2024-01-02", inputMode: "dollars", inputAmount: 3000, thesis: "Tower real estate exposure." },
      { id: "pos-pld", symbol: "PLD", buyDate: "2024-01-02", inputMode: "dollars", inputAmount: 3000, thesis: "Industrial warehouse real estate." },
      { id: "pos-o", symbol: "O", buyDate: "2024-01-02", inputMode: "dollars", inputAmount: 2000, thesis: "Monthly income REIT test." },
    ],
  },
  {
    id: "template-transport-builders",
    title: "Aviation and autos",
    description: "Higher-volatility test using companies tied to aircraft and vehicle manufacturing.",
    startingCash: 10000,
    benchmarkSymbol: "VOO",
    positions: [
      { id: "pos-ba", symbol: "BA", buyDate: "2024-01-02", inputMode: "dollars", inputAmount: 2500, thesis: "Commercial aircraft manufacturer." },
      { id: "pos-rtx", symbol: "RTX", buyDate: "2024-01-02", inputMode: "dollars", inputAmount: 2500, thesis: "Aerospace and defense systems." },
      { id: "pos-f", symbol: "F", buyDate: "2024-01-02", inputMode: "dollars", inputAmount: 1500, thesis: "Traditional auto manufacturer." },
      { id: "pos-gm", symbol: "GM", buyDate: "2024-01-02", inputMode: "dollars", inputAmount: 1500, thesis: "Traditional auto manufacturer." },
    ],
  },
  {
    id: "template-broad-core",
    title: "Broad ETF core",
    description: "Simple benchmark-like starter that is easier to understand than a stock-picking basket.",
    startingCash: 10000,
    benchmarkSymbol: "VOO",
    positions: [
      { id: "pos-voo", symbol: "VOO", buyDate: "2024-01-02", inputMode: "dollars", inputAmount: 6000, thesis: "Broad S&P 500 exposure." },
      { id: "pos-qqq", symbol: "QQQ", buyDate: "2024-01-02", inputMode: "dollars", inputAmount: 2500, thesis: "Growth-heavy index exposure." },
      { id: "pos-schd", symbol: "SCHD", buyDate: "2024-01-02", inputMode: "dollars", inputAmount: 1500, thesis: "Dividend ETF tilt." },
    ],
  },
];

const SYMBOL_PROFILE = Object.fromEntries(
  STOCKS.map((stock, index) => [
    stock.symbol,
    {
      base: stock.sector.includes("ETF") ? 100 + index * 8 : 30 + index * 18,
      trend: stock.monthMove / 90,
      wave: Math.max(0.4, Math.abs(stock.weekMove) * 1.5),
    },
  ])
);

Object.assign(SYMBOL_PROFILE, {
  VOO: { base: 435, trend: 0.06, wave: 2 },
  SPY: { base: 470, trend: 0.065, wave: 2.2 },
  QQQ: { base: 405, trend: 0.085, wave: 3 },
  SCHD: { base: 76, trend: 0.012, wave: 0.8 },
  CAT: { base: 295, trend: 0.07, wave: 5 },
  DE: { base: 390, trend: 0.035, wave: 7 },
  HON: { base: 205, trend: 0.026, wave: 2.5 },
  BA: { base: 255, trend: -0.035, wave: 8 },
  RTX: { base: 85, trend: 0.035, wave: 1.8 },
});

export function currency(value, compact = false) {
  const n = Number(value || 0);
  if (compact && Math.abs(n) >= 1000) {
    return `$${(n / 1000).toFixed(Math.abs(n) >= 10000 ? 0 : 1)}k`;
  }
  return n.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

export function percent(value) {
  const n = Number(value || 0);
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function makeId(prefix = "id") {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function cloneTemplate(template) {
  return {
    ...template,
    id: makeId("scenario"),
    positions: template.positions.map((p) => ({ ...p, id: makeId(p.symbol) })),
    events: [{ id: makeId("event"), at: new Date().toISOString(), message: `Started from template: ${template.title}` }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function blankScenario() {
  return {
    id: makeId("scenario"),
    title: "Untitled stock test",
    description: "Build a what-if portfolio by adding dated stock buys.",
    startingCash: 10000,
    benchmarkSymbol: "VOO",
    positions: [],
    events: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

function dateToIndex(dateStr) {
  const start = new Date("2024-01-02").getTime();
  const current = new Date(dateStr).getTime();
  return Math.max(0, Math.round((current - start) / 86400000));
}

export function offsetDate(dateStr, days) {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function demoClosePrice(symbol, dateStr) {
  const s = String(symbol || "").toUpperCase();
  const profile = SYMBOL_PROFILE[s] || { base: 100, trend: 0.03, wave: 2 };
  const i = dateToIndex(dateStr);
  const seasonal = Math.sin(i / 17) * profile.wave + Math.sin(i / 43) * profile.wave * 0.55;
  const price = profile.base + i * profile.trend + seasonal;
  return Math.max(1, Math.round(price * 100) / 100);
}

// Backward-compatible name used across the current simulator.
// It returns the synthetic adjusted closing price for the requested date.
export function demoPrice(symbol, dateStr) {
  return demoClosePrice(symbol, dateStr);
}

export function getDemoPricePoint(symbol, dateStr) {
  const close = demoClosePrice(symbol, dateStr);
  return {
    symbol: String(symbol || "").toUpperCase(),
    date: dateStr,
    close,
    adjustedClose: close,
    price: close,
    source: PRICE_MODE.source,
    timing: PRICE_MODE.timing,
    field: PRICE_MODE.field,
    isDemo: PRICE_MODE.isDemo,
  };
}

export function growth(symbol, days, endDate = todayISO()) {
  const startDate = offsetDate(endDate, -Math.abs(days));
  const start = demoPrice(symbol, startDate);
  const end = demoPrice(symbol, endDate);
  return start > 0 ? ((end - start) / start) * 100 : 0;
}

export function predictionForSymbol(symbol, benchmark = "SPY", endDate = todayISO()) {
  const stockWeek = growth(symbol, 7, endDate);
  const stockMonth = growth(symbol, 30, endDate);
  const spyWeek = growth(benchmark, 7, endDate);
  const spyMonth = growth(benchmark, 30, endDate);
  const numerator = stockWeek + spyWeek;
  const denominator = Math.max(0.15, Math.abs(stockMonth) + Math.abs(spyMonth));
  const raw = (numerator / denominator) * 10;
  const estimatedNextWeek = Math.max(-12, Math.min(12, raw));
  return { symbol, benchmark, stockWeek, stockMonth, spyWeek, spyMonth, estimatedNextWeek };
}

export function makeDateSeries(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const output = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 7)) {
    output.push(d.toISOString().slice(0, 10));
  }
  const endIso = end.toISOString().slice(0, 10);
  if (output[output.length - 1] !== endIso) output.push(endIso);
  return output;
}

export function resolvePosition(position, endDate = todayISO()) {
  const symbol = String(position.symbol || "").trim().toUpperCase();
  const buyDate = position.buyDate || "2024-01-02";
  const buyPricePoint = getDemoPricePoint(symbol, buyDate);
  const latestPricePoint = getDemoPricePoint(symbol, endDate);
  const buyPrice = buyPricePoint.adjustedClose;
  const latestPrice = latestPricePoint.adjustedClose;
  const inputAmount = Math.max(0, Number(position.inputAmount || 0));
  const inputMode = position.inputMode || "dollars";
  const shares = inputMode === "shares" ? inputAmount : inputAmount / buyPrice;
  const cost = shares * buyPrice;
  const value = shares * latestPrice;
  return {
    ...position,
    symbol,
    buyDate,
    inputMode,
    inputAmount,
    buyPrice,
    latestPrice,
    shares,
    cost,
    value,
    gain: value - cost,
    gainPct: cost > 0 ? ((value - cost) / cost) * 100 : 0,
    priceBasis: PRICE_MODE.field,
    priceTiming: PRICE_MODE.timing,
    dataSource: PRICE_MODE.source,
    isDemoPrice: PRICE_MODE.isDemo,
    buyPricePoint,
    latestPricePoint,
  };
}

export function calculateScenario(scenario) {
  const endDate = todayISO();
  const resolved = (scenario.positions || []).map((p) => resolvePosition(p, endDate));
  const invested = resolved.reduce((sum, p) => sum + p.cost, 0);
  const value = resolved.reduce((sum, p) => sum + p.value, 0);
  const cash = Number(scenario.startingCash || 0) - invested;
  const accountValue = cash + value;
  const gain = accountValue - Number(scenario.startingCash || 0);
  const gainPct = Number(scenario.startingCash || 0) > 0 ? (gain / Number(scenario.startingCash || 0)) * 100 : 0;
  return { resolved, invested, value, cash, accountValue, gain, gainPct };
}

export function calculatePredictionImpact(scenario) {
  const calc = calculateScenario(scenario);
  const benchmark = scenario.benchmarkSymbol || "SPY";
  let predictedValue = calc.cash;
  const rows = calc.resolved.map((position) => {
    const prediction = predictionForSymbol(position.symbol, benchmark);
    const nextValue = position.value * (1 + prediction.estimatedNextWeek / 100);
    predictedValue += nextValue;
    return { ...position, prediction, nextValue, nextGain: nextValue - position.value };
  });
  return {
    rows,
    currentAccountValue: calc.accountValue,
    predictedAccountValue: predictedValue,
    predictedDollarChange: predictedValue - calc.accountValue,
    predictedPctChange: calc.accountValue > 0 ? ((predictedValue - calc.accountValue) / calc.accountValue) * 100 : 0,
  };
}

export function buildSimulationRows(scenario) {
  const positions = scenario.positions || [];
  const earliest = positions.length ? positions.map((p) => p.buyDate || todayISO()).sort()[0] : "2024-01-02";
  const dates = makeDateSeries(earliest, todayISO());
  const benchmark = scenario.benchmarkSymbol || "VOO";
  const startingCash = Number(scenario.startingCash || 0);
  const benchmarkStart = demoPrice(benchmark, earliest);
  const benchmarkShares = benchmarkStart > 0 ? startingCash / benchmarkStart : 0;

  return dates.map((date) => {
    let investedByDate = 0;
    let marketByDate = 0;
    const row = { date, portfolio: startingCash, costBasis: 0, cash: startingCash, benchmark: benchmarkShares * demoPrice(benchmark, date) };
    for (const p of positions) {
      if ((p.buyDate || "") > date) continue;
      const resolved = resolvePosition(p, date);
      investedByDate += resolved.cost;
      marketByDate += resolved.shares * demoPrice(resolved.symbol, date);
    }
    row.costBasis = investedByDate;
    row.cash = startingCash - investedByDate;
    row.portfolio = row.cash + marketByDate;
    return row;
  });
}

export function getFinderGroups(stocks = STOCKS) {
  const topMovers = [...stocks].sort((a, b) => Math.abs(b.weekMove) - Math.abs(a.weekMove)).slice(0, 6);
  const earningsSoon = stocks.filter((s) => s.earnings && s.earnings !== "N/A").slice(0, 8);
  const sectors = [...new Set(stocks.map((s) => s.sector))].sort();
  return { topMovers, earningsSoon, sectors };
}

export function parseCsvPositions(text) {
  const lines = String(text || "").split(/\\r?\\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const raw = Object.fromEntries(header.map((key, index) => [key, values[index] || ""]));
    const symbol = (raw.symbol || raw.ticker || "").toUpperCase();
    if (!symbol) continue;
    rows.push({ id: makeId("csv"), symbol, buyDate: raw.buydate || raw.date || "2024-01-02", inputMode: raw.inputmode || raw.mode || "dollars", inputAmount: Number(raw.inputamount || raw.amount || raw.dollars || raw.shares || 0), thesis: raw.thesis || raw.reason || "" });
  }
  return rows;
}

export function positionsToCsv(positions) {
  const header = "symbol,buyDate,inputMode,inputAmount,thesis";
  const rows = (positions || []).map((p) => [p.symbol, p.buyDate, p.inputMode, p.inputAmount, String(p.thesis || "").replaceAll(",", " ")].join(","));
  return [header, ...rows].join("\\n");
}

export function exportScenarioJson(scenario) {
  return JSON.stringify({ version: 1, kind: "finance_lab_scenario", exportedAt: new Date().toISOString(), scenario }, null, 2);
}

export function importScenarioJson(text) {
  const parsed = JSON.parse(text);
  if (parsed?.kind !== "finance_lab_scenario" || parsed?.version !== 1 || !parsed?.scenario) {
    throw new Error("Unsupported Finance Lab scenario JSON.");
  }
  return { ...parsed.scenario, id: makeId("scenario"), events: [...(parsed.scenario.events || []), { id: makeId("event"), at: new Date().toISOString(), message: "Imported scenario JSON." }] };
}

export function readStoredScenarios() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeStoredScenarios(scenarios) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios));
}

export function readActiveId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_KEY);
}

export function writeActiveId(id) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ACTIVE_KEY, id);
}
