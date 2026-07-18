"use client";

import { useEffect, useMemo, useState } from "react";
import PortfolioValueChart from "./components/PortfolioValueChart";
import {
  STOCKS,
  EXAMPLE_SCENARIOS,
  blankScenario,
  cloneTemplate,
  calculateScenario,
  buildSimulationRows,
  currency,
  percent,
  parseCsvPositions,
  positionsToCsv,
  exportScenarioJson,
  importScenarioJson,
  readStoredScenarios,
  writeStoredScenarios,
  readActiveId,
  writeActiveId,
  makeId,
  getFinderGroups,
} from "./lib/financeLab";

import PredictorView from "./PredictorView";
import { DEFAULT_CONFIG } from "./lib/moveTree";

function downloadText(filename, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function event(message) {
  return { id: makeId("event"), at: new Date().toISOString(), message };
}

const emptyBulkDraft = {
  symbol: "",
  buyDate: "",
  inputMode: "",
  inputAmount: "",
  thesis: "",
};

export default function FinanceLabApp() {
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState("portfolio");
  const [scenarios, setScenarios] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [finderQuery, setFinderQuery] = useState("");
  const [finderSector, setFinderSector] = useState("All");
  const [selectedPositionIds, setSelectedPositionIds] = useState([]);
  const [bulkDraft, setBulkDraft] = useState(emptyBulkDraft);
  const [predictorConfig, setPredictorConfig] = useState(DEFAULT_CONFIG);
  const [draft, setDraft] = useState({
    symbol: "CAT",
    buyDate: "2024-01-02",
    inputMode: "dollars",
    inputAmount: 1000,
    thesis: "",
  });

  useEffect(() => {
    const saved = readStoredScenarios();
    const initial = saved.length ? saved : [cloneTemplate(EXAMPLE_SCENARIOS[0])];
    const savedActiveId = readActiveId();
    const active = initial.find((item) => item.id === savedActiveId)?.id || initial[0].id;
    setScenarios(initial);
    setActiveId(active);
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    writeStoredScenarios(scenarios);
  }, [mounted, scenarios]);

  useEffect(() => {
    if (!mounted || !activeId) return;
    writeActiveId(activeId);
  }, [mounted, activeId]);

  const scenario = scenarios.find((item) => item.id === activeId) || scenarios[0] || cloneTemplate(EXAMPLE_SCENARIOS[0]);
  const calc = useMemo(() => calculateScenario(scenario), [scenario]);
  const rows = useMemo(() => buildSimulationRows(scenario), [scenario]);

  const finderGroups = useMemo(() => getFinderGroups(STOCKS), []);
  const filteredStocks = useMemo(() => {
    const q = finderQuery.trim().toLowerCase();
    return STOCKS.filter((stock) => {
      const matchesQuery = !q || `${stock.symbol} ${stock.name} ${stock.sector} ${stock.industry} ${stock.risk} ${stock.sentiment}`.toLowerCase().includes(q);
      const matchesSector = finderSector === "All" || stock.sector === finderSector;
      return matchesQuery && matchesSector;
    });
  }, [finderQuery, finderSector]);

  function replaceScenario(next, message) {
    const updated = {
      ...next,
      updatedAt: new Date().toISOString(),
      events: message ? [event(message), ...(next.events || [])] : next.events || [],
    };
    setScenarios((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  function updateScenario(patch, message) {
    replaceScenario({ ...scenario, ...patch }, message);
  }

  function createFromTemplate(template) {
    const next = cloneTemplate(template);
    setScenarios((current) => [...current, next]);
    setActiveId(next.id);
    setSelectedPositionIds([]);
    setBulkDraft(emptyBulkDraft);
    setTab("portfolio");
  }

  function createBlank() {
    const next = blankScenario();
    setScenarios((current) => [...current, next]);
    setActiveId(next.id);
    setSelectedPositionIds([]);
    setBulkDraft(emptyBulkDraft);
    setTab("portfolio");
  }

  function saveScenario() {
    updateScenario({}, "Saved scenario.");
  }

  function saveAsScenario() {
    const copy = {
      ...scenario,
      id: makeId("scenario"),
      title: `${scenario.title} copy`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      positions: (scenario.positions || []).map((p) => ({ ...p, id: makeId(p.symbol) })),
      events: [event(`Created copy of ${scenario.title}.`), ...(scenario.events || [])],
    };
    setScenarios((current) => [...current, copy]);
    setActiveId(copy.id);
    setSelectedPositionIds([]);
    setBulkDraft(emptyBulkDraft);
  }

  function addPosition(position = draft) {
    const symbol = String(position.symbol || "").trim().toUpperCase();
    const amount = Number(position.inputAmount || 0);
    if (!symbol || amount <= 0) return;

    const nextPosition = {
      id: makeId(symbol),
      symbol,
      buyDate: position.buyDate || "2024-01-02",
      inputMode: position.inputMode || "dollars",
      inputAmount: amount,
      thesis: position.thesis || "",
    };

    replaceScenario(
      { ...scenario, positions: [...(scenario.positions || []), nextPosition] },
      `Added ${symbol} ${nextPosition.inputMode === "dollars" ? currency(amount) : `${amount} shares`}.`
    );

    setDraft((current) => ({ ...current, thesis: "" }));
  }

  function updatePosition(id, patch) {
    replaceScenario(
      { ...scenario, positions: (scenario.positions || []).map((p) => (p.id === id ? { ...p, ...patch } : p)) },
      "Edited a position."
    );
  }

  function removePosition(id) {
    const removed = (scenario.positions || []).find((p) => p.id === id);
    replaceScenario(
      { ...scenario, positions: (scenario.positions || []).filter((p) => p.id !== id) },
      `Removed ${removed?.symbol || "position"}.`
    );
    setSelectedPositionIds((current) => current.filter((item) => item !== id));
  }

  function togglePositionSelection(id, clickEvent) {
    const multi = clickEvent?.ctrlKey || clickEvent?.metaKey;
    setSelectedPositionIds((current) => {
      if (multi) {
        return current.includes(id) ? current.filter((item) => item !== id) : [...current, id];
      }
      return current.includes(id) && current.length === 1 ? [] : [id];
    });
  }

  function clearSelectedPositions() {
    setSelectedPositionIds([]);
    setBulkDraft(emptyBulkDraft);
  }

  function applyBulkEdit() {
    const patch = {};
    if (bulkDraft.symbol.trim()) patch.symbol = bulkDraft.symbol.trim().toUpperCase();
    if (bulkDraft.buyDate) patch.buyDate = bulkDraft.buyDate;
    if (bulkDraft.inputMode) patch.inputMode = bulkDraft.inputMode;
    if (bulkDraft.inputAmount !== "") patch.inputAmount = Number(bulkDraft.inputAmount || 0);
    if (bulkDraft.thesis.trim()) patch.thesis = bulkDraft.thesis.trim();
    if (!selectedPositionIds.length || Object.keys(patch).length === 0) return;

    replaceScenario(
      {
        ...scenario,
        positions: (scenario.positions || []).map((position) =>
          selectedPositionIds.includes(position.id) ? { ...position, ...patch } : position
        ),
      },
      `Edited ${selectedPositionIds.length} selected position${selectedPositionIds.length === 1 ? "" : "s"}.`
    );
    setBulkDraft(emptyBulkDraft);
  }

  async function handleCsvImport(file) {
    if (!file) return;
    const text = await file.text();
    const imported = parseCsvPositions(text);
    if (!imported.length) return;
    replaceScenario(
      { ...scenario, positions: [...(scenario.positions || []), ...imported] },
      `Imported ${imported.length} CSV position${imported.length === 1 ? "" : "s"}.`
    );
  }

  async function handleJsonImport(file) {
    if (!file) return;
    const text = await file.text();
    const imported = importScenarioJson(text);
    setScenarios((current) => [...current, imported]);
    setActiveId(imported.id);
  }

  const resolvedPositions = calc.resolved;
  const overLimit = calc.cash < 0;

  if (!mounted) {
    return (
      <main className="min-h-screen bg-[#07101f] p-6 text-slate-100">
        <div className="mx-auto max-w-7xl rounded-2xl border border-slate-800 bg-slate-950 p-6">
          Loading Finance Lab…
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#07101f] text-slate-100">
      <div className="mx-auto max-w-[1480px] px-4 py-4 lg:px-6">
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-3 shadow-2xl lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <p className="px-2 text-xs font-black uppercase tracking-[0.28em] text-cyan-300">
              Finance Lab
            </p>
            {["portfolio", "finder", "predictor"].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setTab(item)}
                className={`rounded-xl px-4 py-2 text-sm font-bold capitalize ${
                  tab === item
                    ? "bg-cyan-300 text-slate-950"
                    : "border border-slate-800 text-slate-300 hover:border-cyan-300 hover:text-cyan-200"
                }`}
              >
                {item === "finder" ? "Stock finder" : item}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={scenario.id}
              onChange={(e) => {
                setActiveId(e.target.value);
                setSelectedPositionIds([]);
                setBulkDraft(emptyBulkDraft);
              }}
              className="max-w-xs rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white"
            >
              {scenarios.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
            <button onClick={saveScenario} className="rounded-xl border border-slate-800 px-3 py-2 text-sm font-semibold text-slate-300 hover:border-cyan-300 hover:text-cyan-200">
              Save
            </button>
            <button onClick={saveAsScenario} className="rounded-xl border border-slate-800 px-3 py-2 text-sm font-semibold text-slate-300 hover:border-cyan-300 hover:text-cyan-200">
              Save as
            </button>
            <button onClick={() => setUnlockOpen(true)} className="rounded-xl bg-cyan-300 px-3 py-2 text-sm font-black text-slate-950 hover:bg-cyan-200">
              Refresh data
            </button>
          </div>
        </div>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(20rem,1fr)]">
          <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-2xl">
            {tab === "portfolio" && (
              <>
                <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
                  <div className="min-w-0">
                    <input
                      value={scenario.title}
                      onChange={(e) => updateScenario({ title: e.target.value })}
                      className="w-full rounded-xl border border-transparent bg-transparent text-2xl font-black tracking-tight text-white outline-none hover:border-slate-800 hover:bg-slate-900/50 lg:text-3xl"
                    />
                    <p className="mt-1 text-sm text-slate-400">{scenario.description || "No description."}</p>
                  </div>
                  <p className={`font-mono text-xl font-black ${calc.gain >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {currency(calc.accountValue)} · {percent(calc.gainPct)}
                  </p>
                </div>

                <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {[
                    ["Start", currency(scenario.startingCash, true)],
                    ["Invested", currency(calc.invested, true)],
                    ["Cash", currency(calc.cash, true)],
                    ["Value", currency(calc.accountValue, true)],
                    ["Return", percent(calc.gainPct)],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-slate-800 bg-slate-900/55 px-3 py-2">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
                      <p className={`mt-1 font-mono text-base font-bold ${label === "Return" && calc.gain >= 0 ? "text-emerald-300" : "text-white"}`}>
                        {value}
                      </p>
                    </div>
                  ))}
                </div>

                {overLimit && (
                  <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                    This scenario spends more than starting cash. Edit a position or increase starting cash.
                  </div>
                )}

                <PortfolioValueChart rows={rows} benchmarkSymbol={scenario.benchmarkSymbol} />

                <SelectedPositionEditor
                  selectedIds={selectedPositionIds}
                  positions={resolvedPositions}
                  bulkDraft={bulkDraft}
                  setBulkDraft={setBulkDraft}
                  applyBulkEdit={applyBulkEdit}
                  clearSelectedPositions={clearSelectedPositions}
                />

                <PositionsTable
                  positions={resolvedPositions}
                  selectedIds={selectedPositionIds}
                  toggleSelection={togglePositionSelection}
                  updatePosition={updatePosition}
                  removePosition={removePosition}
                />

                <button
                  type="button"
                  onClick={() => setHistoryOpen((value) => !value)}
                  className="mt-3 text-sm font-semibold text-cyan-300 hover:text-cyan-200"
                >
                  {historyOpen ? "Hide" : "Show"} recent changes
                </button>
                {historyOpen && <HistoryPanel events={scenario.events || []} />}
              </>
            )}

            {tab === "finder" && (
              <StockFinder
                query={finderQuery}
                setQuery={setFinderQuery}
                sector={finderSector}
                setSector={setFinderSector}
                stocks={filteredStocks}
                groups={finderGroups}
                onPick={(stock) => {
                  setDraft((current) => ({ ...current, symbol: stock.symbol, thesis: `Testing ${stock.name}.` }));
                  setTab("portfolio");
                }}
              />
            )}

            {tab === "predictor" && <PredictorView scenario={scenario} calc={calc} config={predictorConfig} setConfig={setPredictorConfig} />}
          </div>

          <aside className="rounded-2xl border border-slate-800 bg-slate-950 p-4 shadow-2xl xl:sticky xl:top-20 xl:max-h-[calc(100vh-6rem)] xl:overflow-auto">
            <SidePanel
              scenario={scenario}
              draft={draft}
              setDraft={setDraft}
              addPosition={addPosition}
              updateScenario={updateScenario}
              createBlank={createBlank}
              createFromTemplate={createFromTemplate}
              handleCsvImport={handleCsvImport}
              handleJsonImport={handleJsonImport}
            />
          </aside>
        </section>
      </div>

      {unlockOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-5">
          <div className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-950 p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-white">Fresh data is locked</h2>
            <p className="mt-3 leading-7 text-slate-400">
              Live market data should use adjusted closing prices. Keep using demo/cached adjusted-close data, or enter a Finance Lab refresh key before spending API quota.
            </p>
            <input type="password" placeholder="Finance refresh key" className="mt-5 w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white" />
            <div className="mt-5 flex gap-3">
              <button onClick={() => setUnlockOpen(false)} className="flex-1 rounded-xl border border-slate-700 px-4 py-3 text-sm font-bold text-slate-200 hover:border-cyan-300 hover:text-cyan-200">
                Use cached/demo
              </button>
              <button onClick={() => setUnlockOpen(false)} className="flex-1 rounded-xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 hover:bg-cyan-200">
                Unlock
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function SidePanel({ scenario, draft, setDraft, addPosition, updateScenario, createBlank, createFromTemplate, handleCsvImport, handleJsonImport }) {
  const [panel, setPanel] = useState("buy");

  return (
    <div>
      <div className="mb-3 grid grid-cols-3 rounded-xl border border-slate-800 bg-slate-900/50 p-1 text-xs font-bold">
        {[
          ["buy", "Buy"],
          ["setup", "Setup"],
          ["examples", "Examples"],
        ].map(([key, label]) => (
          <button key={key} onClick={() => setPanel(key)} className={`rounded-lg px-2 py-2 ${panel === key ? "bg-cyan-300 text-slate-950" : "text-slate-400 hover:text-cyan-200"}`}>
            {label}
          </button>
        ))}
      </div>

      {panel === "buy" && (
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.22em] text-slate-400">Add simulated buy</h2>
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-400">Symbol</span>
              <input value={draft.symbol} onChange={(e) => setDraft((current) => ({ ...current, symbol: e.target.value.toUpperCase() }))} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-white" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-400">Buy date</span>
              <input type="date" value={draft.buyDate} onChange={(e) => setDraft((current) => ({ ...current, buyDate: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>
            <div className="grid grid-cols-[7rem_1fr] gap-2">
              <label className="block">
                <span className="text-xs font-semibold text-slate-400">By</span>
                <select value={draft.inputMode} onChange={(e) => setDraft((current) => ({ ...current, inputMode: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">
                  <option value="dollars">Dollars</option>
                  <option value="shares">Shares</option>
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-slate-400">{draft.inputMode === "dollars" ? "Amount" : "Shares"}</span>
                <input type="number" value={draft.inputAmount} onChange={(e) => setDraft((current) => ({ ...current, inputAmount: Number(e.target.value || 0) }))} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
              </label>
            </div>
            <label className="block">
              <span className="text-xs font-semibold text-slate-400">Reason</span>
              <textarea value={draft.thesis} onChange={(e) => setDraft((current) => ({ ...current, thesis: e.target.value }))} rows={3} className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>
            <button onClick={() => addPosition()} className="w-full rounded-xl bg-cyan-300 px-4 py-3 text-sm font-black text-slate-950 hover:bg-cyan-200">Add position</button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <label className="cursor-pointer rounded-xl border border-slate-800 px-3 py-2 text-center text-xs font-semibold text-slate-300 hover:border-cyan-300 hover:text-cyan-200">
              Import JSON
              <input type="file" accept="application/json,.json" className="hidden" onChange={(e) => handleJsonImport(e.target.files?.[0])} />
            </label>
            <button onClick={() => downloadText(`${scenario.title || "finance-scenario"}.json`, exportScenarioJson(scenario))} className="rounded-xl border border-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-cyan-300 hover:text-cyan-200">Export JSON</button>
            <label className="cursor-pointer rounded-xl border border-slate-800 px-3 py-2 text-center text-xs font-semibold text-slate-300 hover:border-cyan-300 hover:text-cyan-200">
              Import CSV
              <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => handleCsvImport(e.target.files?.[0])} />
            </label>
            <button onClick={() => downloadText("finance-positions.csv", positionsToCsv(scenario.positions), "text/csv")} className="rounded-xl border border-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-cyan-300 hover:text-cyan-200">Export CSV</button>
          </div>
        </div>
      )}

      {panel === "setup" && (
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.22em] text-slate-400">Portfolio setup</h2>
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-400">Title</span>
              <input value={scenario.title} onChange={(e) => updateScenario({ title: e.target.value })} className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-400">Start cash</span>
              <input type="number" value={scenario.startingCash} onChange={(e) => updateScenario({ startingCash: Number(e.target.value || 0) }, "Changed starting cash.")} className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-400">Benchmark</span>
              <input value={scenario.benchmarkSymbol || "VOO"} onChange={(e) => updateScenario({ benchmarkSymbol: e.target.value.toUpperCase() })} className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-400">Description</span>
              <textarea value={scenario.description} onChange={(e) => updateScenario({ description: e.target.value })} rows={4} className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-white" />
            </label>
            <button onClick={createBlank} className="w-full rounded-xl border border-slate-800 px-3 py-2 text-sm font-bold text-slate-200 hover:border-cyan-300 hover:text-cyan-200">New blank portfolio</button>
          </div>
        </div>
      )}

      {panel === "examples" && (
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.22em] text-slate-400">Examples</h2>
          <p className="mt-2 text-xs leading-5 text-slate-500">Use one as a starter, then save as or edit positions.</p>
          <div className="mt-4 space-y-2">
            {EXAMPLE_SCENARIOS.map((template) => (
              <button key={template.id} onClick={() => createFromTemplate(template)} className="w-full rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-left hover:border-cyan-400/70 hover:bg-slate-900">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-white">{template.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-400">{template.description}</p>
                  </div>
                  <span className="rounded-full bg-slate-950 px-2 py-1 font-mono text-[10px] text-cyan-300">{template.positions.length}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {template.positions.map((p) => (
                    <span key={p.symbol} className="rounded-full bg-slate-950 px-2 py-1 font-mono text-[10px] text-slate-300">{p.symbol}</span>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SelectedPositionEditor({ selectedIds, positions, bulkDraft, setBulkDraft, applyBulkEdit, clearSelectedPositions }) {
  const selected = positions.filter((position) => selectedIds.includes(position.id));
  if (selected.length === 0) {
    return (
      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-900/35 px-4 py-3 text-sm text-slate-500">
        Select a position row to edit it here. Ctrl-click or Cmd-click to select multiple rows.
      </div>
    );
  }

  const single = selected.length === 1 ? selected[0] : null;

  return (
    <div className="mt-4 rounded-xl border border-cyan-400/30 bg-cyan-300/5 p-4">
      <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-[0.22em] text-cyan-300">
            {single ? `Editing ${single.symbol}` : `Editing ${selected.length} positions`}
          </h2>
          <p className="mt-1 text-xs text-slate-400">
            {single ? "Use this focused editor or change the table row directly." : "Only filled fields below are applied to every selected row."}
          </p>
        </div>
        <button type="button" onClick={clearSelectedPositions} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-cyan-300 hover:text-cyan-200">
          Clear selection
        </button>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <label className="block">
          <span className="text-xs font-semibold text-slate-400">Symbol</span>
          <input value={bulkDraft.symbol} placeholder={single?.symbol || "Leave unchanged"} onChange={(e) => setBulkDraft((c) => ({ ...c, symbol: e.target.value.toUpperCase() }))} className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-sm text-white" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-400">Buy date</span>
          <input type="date" value={bulkDraft.buyDate} onChange={(e) => setBulkDraft((c) => ({ ...c, buyDate: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-400">Buy by</span>
          <select value={bulkDraft.inputMode} onChange={(e) => setBulkDraft((c) => ({ ...c, inputMode: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white">
            <option value="">Leave unchanged</option>
            <option value="dollars">Dollars</option>
            <option value="shares">Shares</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-400">Amount / shares</span>
          <input type="number" value={bulkDraft.inputAmount} placeholder={single ? String(single.inputAmount) : "Leave unchanged"} onChange={(e) => setBulkDraft((c) => ({ ...c, inputAmount: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" />
        </label>
        <label className="block">
          <span className="text-xs font-semibold text-slate-400">Reason</span>
          <input value={bulkDraft.thesis} placeholder="Leave unchanged" onChange={(e) => setBulkDraft((c) => ({ ...c, thesis: e.target.value }))} className="mt-1 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-white" />
        </label>
      </div>

      <div className="mt-3 flex justify-end">
        <button type="button" onClick={applyBulkEdit} className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-black text-slate-950 hover:bg-cyan-200">
          Apply to selected
        </button>
      </div>
    </div>
  );
}

function PositionsTable({ positions, selectedIds, toggleSelection, updatePosition, removePosition }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-xl border border-slate-800">
      <table className="w-full min-w-[820px] text-sm">
        <thead className="bg-slate-900/70 text-left text-xs uppercase tracking-[0.16em] text-slate-500">
          <tr>
            <th className="px-3 py-2">Sel.</th>
            <th className="px-3 py-2">Symbol</th>
            <th className="px-3 py-2">Buy date</th>
            <th className="px-3 py-2">Input</th>
            <th className="px-3 py-2 text-right">Buy price</th>
            <th className="px-3 py-2 text-right">Shares</th>
            <th className="px-3 py-2 text-right">Value</th>
            <th className="px-3 py-2 text-right">G/L</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {positions.length === 0 ? (
            <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-500">No positions yet. Use an example or add a simulated buy.</td></tr>
          ) : (
            positions.map((p) => {
              const selected = selectedIds.includes(p.id);
              return (
                <tr key={p.id} onClick={(e) => toggleSelection(p.id, e)} className={`cursor-pointer border-t border-slate-800 text-slate-200 transition ${selected ? "bg-cyan-300/10 ring-1 ring-inset ring-cyan-300/40" : "hover:bg-slate-900/60"}`}>
                  <td className="px-3 py-2"><input type="checkbox" checked={selected} readOnly className="h-4 w-4 accent-cyan-300" /></td>
                  <td className="px-3 py-2"><input value={p.symbol} onClick={(e) => e.stopPropagation()} onChange={(e) => updatePosition(p.id, { symbol: e.target.value.toUpperCase() })} className="w-20 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 font-mono text-xs" /></td>
                  <td className="px-3 py-2"><input type="date" value={p.buyDate} onClick={(e) => e.stopPropagation()} onChange={(e) => updatePosition(p.id, { buyDate: e.target.value })} className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs" /></td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      <select value={p.inputMode} onClick={(e) => e.stopPropagation()} onChange={(e) => updatePosition(p.id, { inputMode: e.target.value })} className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs">
                        <option value="dollars">$</option>
                        <option value="shares">shares</option>
                      </select>
                      <input type="number" value={p.inputAmount} onClick={(e) => e.stopPropagation()} onChange={(e) => updatePosition(p.id, { inputAmount: Number(e.target.value || 0) })} className="w-24 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs" />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-slate-400">{currency(p.buyPrice)}</td>
                  <td className="px-3 py-2 text-right font-mono text-slate-400">{p.shares.toFixed(3)}</td>
                  <td className="px-3 py-2 text-right font-mono">{currency(p.value)}</td>
                  <td className={`px-3 py-2 text-right font-mono ${p.gain >= 0 ? "text-emerald-300" : "text-red-300"}`}>{currency(p.gain)} <span className="text-xs">({percent(p.gainPct)})</span></td>
                  <td className="px-3 py-2 text-right"><button onClick={(e) => { e.stopPropagation(); removePosition(p.id); }} className="rounded-lg border border-red-500/30 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10">Remove</button></td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function HistoryPanel({ events }) {
  return (
    <div className="mt-3 max-h-40 overflow-auto rounded-xl border border-slate-800 bg-slate-900/50 p-3">
      {events.length === 0 ? <p className="text-sm text-slate-500">No changes logged yet.</p> : (
        <ul className="space-y-2 text-sm text-slate-400">
          {events.map((evt) => (
            <li key={evt.id} className="flex gap-3">
              <span className="font-mono text-xs text-slate-600">{new Date(evt.at).toLocaleTimeString()}</span>
              <span>{evt.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StockFinder({ query, setQuery, sector, setSector, stocks, groups, onPick }) {
  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-black text-white">Stock finder</h1>
          <p className="mt-1 text-sm text-slate-400">Discovery sandbox only. These labels are demo signals, not recommendations.</p>
        </div>
        <div className="flex flex-col gap-2 md:flex-row">
          <select value={sector} onChange={(e) => setSector(e.target.value)} className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white">
            <option value="All">All sectors</option>
            {groups.sectors.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search symbol, sector, risk..." className="w-full rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white md:w-80" />
        </div>
      </div>

      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <FinderStrip title="Top movers" subtitle="Largest absolute demo weekly moves" stocks={groups.topMovers} onPick={onPick} />
        <FinderStrip title="Earnings watch" subtitle="Demo upcoming earnings-style labels" stocks={groups.earningsSoon} onPick={onPick} />
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {stocks.map((stock) => (
          <StockCard key={stock.symbol} stock={stock} onPick={onPick} />
        ))}
      </div>
    </div>
  );
}

function FinderStrip({ title, subtitle, stocks, onPick }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
      <div className="mb-3">
        <h2 className="text-sm font-bold uppercase tracking-[0.22em] text-slate-400">{title}</h2>
        <p className="mt-1 text-xs text-slate-500">{subtitle}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {stocks.slice(0, 4).map((stock) => (
          <button key={stock.symbol} onClick={() => onPick(stock)} className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-left hover:border-cyan-300/70">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono font-black text-white">{stock.symbol}</span>
              <span className={stock.weekMove >= 0 ? "font-mono text-xs text-emerald-300" : "font-mono text-xs text-red-300"}>{percent(stock.weekMove)}</span>
            </div>
            <p className="mt-1 truncate text-xs text-slate-500">{stock.name}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

function StockCard({ stock, onPick }) {
  return (
    <button onClick={() => onPick(stock)} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-left hover:border-cyan-400/70 hover:bg-slate-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-lg font-black text-white">{stock.symbol}</p>
          <p className="mt-1 text-sm text-slate-300">{stock.name}</p>
        </div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${stock.sentiment === "Buy" ? "bg-emerald-300/10 text-emerald-300" : stock.sentiment === "Sell" ? "bg-red-300/10 text-red-300" : "bg-slate-950 text-cyan-300"}`}>
          Demo {stock.sentiment}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className="rounded-lg bg-slate-950 p-2">
          <p className="text-slate-500">Week</p>
          <p className={stock.weekMove >= 0 ? "font-mono text-emerald-300" : "font-mono text-red-300"}>{percent(stock.weekMove)}</p>
        </div>
        <div className="rounded-lg bg-slate-950 p-2">
          <p className="text-slate-500">Month</p>
          <p className={stock.monthMove >= 0 ? "font-mono text-emerald-300" : "font-mono text-red-300"}>{percent(stock.monthMove)}</p>
        </div>
        <div className="rounded-lg bg-slate-950 p-2">
          <p className="text-slate-500">Earnings</p>
          <p className="font-mono text-slate-300">{stock.earnings}</p>
        </div>
      </div>
      <p className="mt-3 text-xs uppercase tracking-[0.2em] text-slate-500">{stock.sector}</p>
      <p className="mt-2 text-xs leading-5 text-slate-400">{stock.note}</p>
    </button>
  );
}
