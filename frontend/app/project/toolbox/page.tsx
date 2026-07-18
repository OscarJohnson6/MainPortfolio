"use client";

import { useMemo, useState } from "react";

type Mode = "electron" | "divisions" | "audio";
type ToolStatus = "ready" | "local" | "backend";

type ShellResult = {
  shell: number;
  electrons: number;
  capacity: number;
};

type DivisionResult = {
  steps: number;
  decrement: number;
  expression: string;
};

type QuickAudioJob = {
  jobId: string;
  status: string;
  message: string;
  progress: number;
  audio_url?: string;
  log_url?: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

const priorityQueue: Array<[shellIndex: number, blockSize: number, orbital: string]> = [
  [1, 2, "1s"], [2, 2, "2s"], [2, 6, "2p"], [3, 2, "3s"],
  [3, 6, "3p"], [4, 2, "4s"], [3, 10, "3d"], [4, 6, "4p"],
  [5, 2, "5s"], [4, 10, "4d"], [5, 6, "5p"], [6, 2, "6s"],
  [4, 14, "4f"], [5, 10, "5d"], [6, 6, "6p"], [7, 2, "7s"],
  [5, 14, "5f"], [6, 10, "6d"], [7, 6, "7p"],
];

const tools: Array<{
  id: Mode;
  title: string;
  description: string;
  status: ToolStatus;
}> = [
  {
    id: "electron",
    title: "Electron Shell Calculator",
    description: "Atomic number to shell distribution and orbital filling.",
    status: "local",
  },
  {
    id: "divisions",
    title: "Even Division Finder",
    description: "Find step counts that divide values cleanly to a chosen decimal precision.",
    status: "ready",
  },
  {
    id: "audio",
    title: "Quick Text Audio",
    description: "Send short text to the TexVoice backend without the full upload workflow.",
    status: "backend",
  },
];

function calculateShells(atomicNumber: number): ShellResult[] {
  const shellMap = new Map<number, number>();
  let electronsLeft = atomicNumber;

  for (const [shellIndex, blockSize] of priorityQueue) {
    if (electronsLeft <= 0) break;

    const fillAmount = Math.min(electronsLeft, blockSize);
    shellMap.set(shellIndex, (shellMap.get(shellIndex) ?? 0) + fillAmount);
    electronsLeft -= fillAmount;
  }

  return [...shellMap.entries()]
    .sort(([shellA], [shellB]) => shellA - shellB)
    .map(([shell, electrons]) => ({
      shell,
      electrons,
      capacity: 2 * shell ** 2,
    }));
}

function getOrbitalFilling(atomicNumber: number) {
  let electronsLeft = atomicNumber;
  const filled: Array<{ orbital: string; electrons: number; blockSize: number }> = [];

  for (const [, blockSize, orbital] of priorityQueue) {
    if (electronsLeft <= 0) break;

    const electrons = Math.min(electronsLeft, blockSize);
    filled.push({ orbital, electrons, blockSize });
    electronsLeft -= electrons;
  }

  return filled;
}

function parseInteger(value: string, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return null;
  if (parsed < min || parsed > max) return null;
  return parsed;
}

function findEvenDivisions(value: number, maxSteps: number, decimalPlaces: number, maxResults: number): DivisionResult[] {
  const scale = 10 ** decimalPlaces;
  const scaledValue = Math.round(value * scale);
  const results: DivisionResult[] = [];

  for (let steps = 1; steps <= maxSteps; steps++) {
    if (scaledValue % steps !== 0) continue;

    const decrement = scaledValue / steps / scale;
    results.push({
      steps,
      decrement,
      expression: `${value} / ${steps} = ${decrement.toFixed(decimalPlaces)}`,
    });

    if (results.length >= maxResults) break;
  }

  return results;
}

function modeButtonClass(active: boolean) {
  return active
    ? "border-cyan-300 bg-cyan-300 text-slate-950"
    : "border-slate-800 bg-slate-950 text-slate-300 hover:border-cyan-400 hover:text-cyan-200";
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function ToolboxPage() {
  const [activeMode, setActiveMode] = useState<Mode>("electron");

  return (
    <section className="mx-auto max-w-7xl px-6 py-12">
      <header className="mb-10">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-cyan-300">
          Tools / Scripts / Calculators
        </p>

        <h1 className="mt-3 text-4xl font-bold tracking-tight text-white md:text-5xl">
          Toolbox
        </h1>

        <p className="mt-4 max-w-3xl leading-8 text-slate-300">
          Small scripts converted into browser tools. This page is for useful
          calculators and utilities that do not need a full project page.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <aside className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-4 lg:sticky lg:top-28 lg:self-start">
          <p className="px-2 pb-3 text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
            Modes
          </p>

          <div className="space-y-3">
            {tools.map((tool) => (
              <button
                key={tool.id}
                type="button"
                onClick={() => setActiveMode(tool.id)}
                className={`w-full rounded-2xl border p-4 text-left transition ${modeButtonClass(activeMode === tool.id)}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="font-semibold">{tool.title}</span>
                  <span className="rounded-full bg-slate-900/60 px-2 py-1 text-[0.65rem] uppercase tracking-[0.14em]">
                    {tool.status}
                  </span>
                </div>

                <p className="mt-2 text-sm opacity-75">{tool.description}</p>
              </button>
            ))}
          </div>
        </aside>

        <main>
          {activeMode === "electron" && <ElectronShellTool />}
          {activeMode === "divisions" && <EvenDivisionTool />}
          {activeMode === "audio" && <QuickAudioTool />}
        </main>
      </div>
    </section>
  );
}

function ElectronShellTool() {
  const [atomicNumberInput, setAtomicNumberInput] = useState("26");

  const atomicNumber = parseInteger(atomicNumberInput, 1, 118);
  const shellResults = useMemo(
    () => (atomicNumber ? calculateShells(atomicNumber) : []),
    [atomicNumber]
  );
  const orbitalFilling = useMemo(
    () => (atomicNumber ? getOrbitalFilling(atomicNumber) : []),
    [atomicNumber]
  );

  const totalElectrons = shellResults.reduce((sum, result) => sum + result.electrons, 0);

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6 shadow-2xl shadow-black/30">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
          Electron Shell Calculator
        </p>

        <h2 className="mt-2 text-2xl font-semibold text-white">
          Atomic number to shell distribution
        </h2>

        <p className="mt-3 max-w-2xl leading-7 text-slate-400">
          Enter an atomic number and the tool fills orbitals using the same
          priority order as the original Python script, then summarizes electrons by shell.
        </p>

        <div className="mt-8 grid gap-5 md:grid-cols-[18rem_1fr]">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium text-slate-300">Atomic number</span>

            <input
              type="number"
              min={1}
              max={118}
              value={atomicNumberInput}
              onChange={(event) => setAtomicNumberInput(event.target.value)}
              className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg font-semibold text-white outline-none transition focus:border-cyan-300"
            />

            {!atomicNumber && (
              <span className="text-sm text-amber-300">
                Enter a whole number from 1 to 118.
              </span>
            )}
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Atomic number" value={atomicNumber ?? "—"} />
            <StatCard label="Total electrons" value={atomicNumber ? totalElectrons : "—"} />
            <StatCard label="Occupied shells" value={atomicNumber ? shellResults.length : "—"} />
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-xl font-semibold text-white">Shell distribution</h2>

        <div className="mt-5 grid gap-3">
          {shellResults.map((result) => {
            const percent = Math.min(100, (result.electrons / result.capacity) * 100);

            return (
              <div key={result.shell} className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-semibold text-white">Shell {result.shell}</p>
                    <p className="text-sm text-slate-500">Capacity formula: 2n²</p>
                  </div>

                  <p className="text-right font-mono text-sm text-slate-300">
                    {result.electrons}/{result.capacity}
                  </p>
                </div>

                <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-800">
                  <div className="h-full rounded-full bg-cyan-300" style={{ width: `${percent}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6">
        <h2 className="text-xl font-semibold text-white">Orbital filling order</h2>

        <div className="mt-5 flex flex-wrap gap-2">
          {orbitalFilling.map((item) => (
            <span key={item.orbital} className="rounded-full border border-slate-800 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-300">
              {item.orbital}
              <sup>{item.electrons}</sup>
            </span>
          ))}
        </div>
      </section>
    </div>
  );
}

function EvenDivisionTool() {
  const [valueInput, setValueInput] = useState("255");
  const [maxStepsInput, setMaxStepsInput] = useState("1000");
  const [decimalPlacesInput, setDecimalPlacesInput] = useState("3");
  const [maxResultsInput, setMaxResultsInput] = useState("200");

  const value = Number(valueInput);
  const maxSteps = parseInteger(maxStepsInput, 1, 10000);
  const decimalPlaces = parseInteger(decimalPlacesInput, 0, 6);
  const maxResults = parseInteger(maxResultsInput, 1, 1000);

  const canCalculate = Number.isFinite(value) && value > 0 && maxSteps !== null && decimalPlaces !== null && maxResults !== null;

  const results = useMemo(() => {
    if (!canCalculate) return [];
    return findEvenDivisions(value, maxSteps, decimalPlaces, maxResults);
  }, [canCalculate, value, maxSteps, decimalPlaces, maxResults]);

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6 shadow-2xl shadow-black/30">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
          Even Division Finder
        </p>

        <h2 className="mt-2 text-2xl font-semibold text-white">
          Find clean frame/LED decrement steps
        </h2>

        <p className="mt-3 max-w-3xl leading-7 text-slate-400">
          This finds step counts where a value can be divided into a finite
          decimal decrement at your chosen precision. For example, a value of 255
          with 3 decimal places shows step counts where each frame can subtract a
          clean decimal amount.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <NumberField label="Value" value={valueInput} onChange={setValueInput} />
          <NumberField label="Max steps" value={maxStepsInput} onChange={setMaxStepsInput} />
          <NumberField label="Decimal places" value={decimalPlacesInput} onChange={setDecimalPlacesInput} />
          <NumberField label="Max results" value={maxResultsInput} onChange={setMaxResultsInput} />
        </div>

        {!canCalculate && (
          <p className="mt-4 text-sm text-amber-300">
            Enter a positive value, max steps from 1–10000, decimal places from 0–6, and max results from 1–1000.
          </p>
        )}
      </section>

      <section className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Matching divisions</h2>
            <p className="mt-2 text-sm text-slate-400">
              Showing {results.length.toLocaleString()} result{results.length === 1 ? "" : "s"}.
            </p>
          </div>

          <p className="font-mono text-sm text-slate-500">
            scaled check: value × 10^places
          </p>
        </div>

        <div className="mt-5 max-h-[34rem] overflow-auto rounded-2xl border border-slate-800">
          <table className="w-full min-w-[36rem] text-left text-sm">
            <thead className="sticky top-0 bg-slate-950 text-slate-400">
              <tr>
                <th className="px-4 py-3 font-medium">Steps</th>
                <th className="px-4 py-3 font-medium">Decrement</th>
                <th className="px-4 py-3 font-medium">Expression</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-800">
              {results.map((result) => (
                <tr key={`${result.steps}-${result.decrement}`} className="bg-slate-950/60">
                  <td className="px-4 py-3 font-mono text-slate-200">{result.steps}</td>
                  <td className="px-4 py-3 font-mono text-cyan-200">{result.decrement.toFixed(decimalPlaces ?? 0)}</td>
                  <td className="px-4 py-3 font-mono text-slate-400">{result.expression}</td>
                </tr>
              ))}

              {results.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-slate-500">
                    No matching divisions at this precision/range.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function QuickAudioTool() {
  const [text, setText] = useState("This is a short audio test from the Toolbox.");
  const [status, setStatus] = useState("Ready.");
  const [progress, setProgress] = useState(0);
  const [job, setJob] = useState<QuickAudioJob | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function pollJob(jobId: string) {
    while (true) {
      const response = await fetch(`${API_BASE}/api/texvoice/jobs/${jobId}`);
      if (!response.ok) throw new Error(`Could not poll job: ${response.status}`);

      const data = (await response.json()) as QuickAudioJob;
      setJob(data);
      setStatus(data.message);
      setProgress(data.progress);

      if (data.status === "done" || data.status === "error") {
        if (data.status === "error") {
          throw new Error(data.message || "Generation failed.");
        }
        return;
      }

      await sleep(900);
    }
  }

  async function generateAudio() {
    const cleanedText = text.trim();
    if (!cleanedText) {
      setError("Enter text first.");
      return;
    }

    setError(null);
    setJob(null);
    setStatus("Creating quick audio job...");
    setProgress(3);

    try {
      const file = new File([cleanedText], "toolbox-quick-audio.txt", {
        type: "text/plain",
      });

      const formData = new FormData();
      formData.append("file", file);
      formData.append("profile", "study");
      formData.append("style", "narrated");
      formData.append("voice_preset", "aria");
      formData.append("max_words", "600");

      const response = await fetch(`${API_BASE}/api/texvoice/generate`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      const data = (await response.json()) as { jobId: string };
      setStatus("Job created. Watching backend progress...");
      await pollJob(data.jobId);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Audio generation failed.";
      setError(message);
      setStatus("Generation failed.");
      setProgress(0);
    }
  }

  return (
    <section className="rounded-[2rem] border border-slate-800 bg-slate-900/60 p-6 shadow-2xl shadow-black/30">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan-300">
        Quick Text Audio
      </p>

      <h2 className="mt-2 text-2xl font-semibold text-white">
        Generate audio from short text
      </h2>

      <p className="mt-3 max-w-3xl leading-7 text-slate-400">
        This is a smaller entry point into the TexVoice backend. It sends a
        temporary text file to the same generation route, but avoids the full
        upload/options interface.
      </p>

      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        className="mt-6 min-h-48 w-full rounded-2xl border border-slate-700 bg-slate-950 p-4 text-slate-100 outline-none transition focus:border-cyan-300"
      />

      <div className="mt-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm text-slate-500">Status</p>
          <p className="mt-1 font-medium text-white">{status}</p>
        </div>

        <button
          type="button"
          onClick={() => void generateAudio()}
          className="rounded-2xl bg-cyan-300 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
        >
          Generate quick audio
        </button>
      </div>

      <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-cyan-300 transition-all" style={{ width: `${progress}%` }} />
      </div>

      {job?.audio_url && (
        <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950 p-4">
          <audio src={job.audio_url} controls className="w-full" />

          <div className="mt-4 flex flex-wrap gap-3">
            <a href={job.audio_url} target="_blank" rel="noreferrer" className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-950">
              Open audio
            </a>

            {job.log_url && (
              <a href={job.log_url} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200">
                Log
              </a>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-5 rounded-2xl border border-red-900/70 bg-red-950/40 p-4 text-sm text-red-200">
          {error}
        </div>
      )}
    </section>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-slate-300">{label}</span>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-lg font-semibold text-white outline-none transition focus:border-cyan-300"
      />
    </label>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-white">{value}</p>
    </div>
  );
}
