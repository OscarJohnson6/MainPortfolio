"use client";

import { useEffect, useState, type ReactNode } from "react";
import { api } from "../_lib/api";
import type { GlobalSettings, KeepAlive, Status } from "../_lib/types";
import InfoTip from "@/components/InfoTip";

type Props = {
  settings: GlobalSettings;
  status: Status | null;
  onSaved: (s: GlobalSettings) => void;
  onClose: () => void;
};

const CONTEXT_SIZES = [4096, 8192, 16384, 32768];

const KEEP_ALIVE: { value: KeepAlive; label: string }[] = [
  { value: "5m", label: "5 minutes" },
  { value: "30m", label: "30 minutes" },
  { value: "2h", label: "2 hours" },
  { value: "forever", label: "Always (until Ollama restarts)" },
];

export default function SettingsPanel({ settings, status, onSaved, onClose }: Props) {
  const [draft, setDraft] = useState<GlobalSettings>(settings);
  const [models, setModels] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ models: string[] }>("/models")
      .then((r) => setModels(r.models))
      .catch((e: Error) => setError(`Couldn't list models: ${e.message}`));
  }, []);

  const set = <K extends keyof GlobalSettings>(key: K, value: GlobalSettings[K]) => setDraft((d) => ({ ...d, [key]: value }));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      onSaved(await api<GlobalSettings>("/settings", { method: "PUT", body: JSON.stringify(draft) }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const defaultLabel = `Worker default${status?.model ? ` (${status.model})` : ""}`;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <span className="grid size-9 place-items-center rounded-full bg-zinc-800 text-base">⚙</span>
        <h2 className="flex-1 text-sm font-semibold">Settings</h2>
        <button onClick={onClose} className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900">
          Close
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-900 hover:bg-white disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-8 px-4 py-6">
          {error && <p className="rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">{error}</p>}

          {/* Models */}
          <section className="flex flex-col gap-4">
            <SectionTitle info="Settings here apply to every avatar. Each avatar's own personality lives in its Edit screen.">Models</SectionTitle>
            <Select
              label="⚡ Fast model"
              hint="Used when 🧠 is off."
              info="Answers directly without a thinking phase. Pick an 'instruct' model, such as qwen3:30b-instruct, for quick, chatty replies. Character sheets are also generated with this model."
              value={draft.fast_model ?? ""}
              onChange={(v) => set("fast_model", v || null)}
              disabled={!models}
            >
              <option value="">{models ? defaultLabel : "Loading models…"}</option>
              {modelOptions(models, draft.fast_model)}
            </Select>
            <Select
              label="🧠 Thinking model"
              hint="Used when 🧠 is on."
              info="Reasons step by step before answering, and you can read its thought process. Smarter on puzzles, code and planning, but often several times slower."
              value={draft.think_model ?? ""}
              onChange={(v) => set("think_model", v || null)}
              disabled={!models}
            >
              <option value="">{models ? defaultLabel : "Loading models…"}</option>
              {modelOptions(models, draft.think_model)}
            </Select>
            <p className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-[11px] leading-relaxed text-zinc-500">
              Only one large model fits in memory at a time, so switching between the fast and thinking model means a reload. New
              models show up here after <code className="text-zinc-400">ollama pull &lt;name&gt;</code>.
            </p>
          </section>

          {/* Advanced */}
          <section className="flex flex-col gap-4">
            <SectionTitle info="These override the worker's models.yaml defaults. Leave them on the default if you're unsure; that file still picks sensible values for each machine (PC or Pi).">
              Advanced
            </SectionTitle>
            <Select
              label="Context length"
              hint="How much of the conversation the model can see at once."
              info="Measured in tokens (about ¾ of a word each). Larger lets the avatar remember more of a long chat, but uses more memory and slows replies. 8192 suits an 8GB GPU; 16384 is comfortable on 16GB."
              value={draft.num_ctx ? String(draft.num_ctx) : ""}
              onChange={(v) => set("num_ctx", v ? Number(v) : null)}
            >
              <option value="">Worker default (models.yaml)</option>
              {CONTEXT_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n.toLocaleString()} tokens
                </option>
              ))}
            </Select>
            <Select
              label="Keep model loaded"
              hint="How long a model stays in memory after the last message."
              info="Longer means fewer slow first replies, but the model keeps holding GPU and system memory the whole time. Pick a short time (or quit Ollama) before gaming."
              value={draft.keep_alive ?? ""}
              onChange={(v) => set("keep_alive", (v || null) as KeepAlive | null)}
            >
              <option value="">Worker default (models.yaml, 30 minutes)</option>
              {KEEP_ALIVE.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </Select>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={draft.warmup}
                onChange={(e) => set("warmup", e.target.checked)}
                className="mt-0.5 size-4 accent-zinc-200"
              />
              <span className="flex flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
                  Warm up on open
                  <InfoTip text="When you open an avatar (or flip 🧠), its model starts loading in the background, so your first message doesn't wait 30–60 seconds for the load. Turn this off if you're browsing without chatting and want to leave memory free." />
                </span>
                <span className="text-[11px] text-zinc-500">Load the model as soon as you open an avatar, not when you send.</span>
              </span>
            </label>
          </section>

          {/* Worker */}
          <section className="flex flex-col gap-2">
            <SectionTitle info="The machine actually running the model. 'Profile' is the hardware tier it picked from models.yaml based on its GPU memory.">
              Worker
            </SectionTitle>
            <dl className="grid grid-cols-[8rem_1fr] gap-y-1.5 text-sm">
              <dt className="text-zinc-500">Status</dt>
              <dd className={status?.online ? "text-emerald-400" : "text-rose-400"}>{status?.online ? "Online" : "Offline"}</dd>
              <dt className="text-zinc-500">Machine</dt>
              <dd>{status?.worker ?? "—"}</dd>
              <dt className="text-zinc-500">Profile</dt>
              <dd>{status?.profile ?? "—"}</dd>
              <dt className="text-zinc-500">GPU memory</dt>
              <dd>{status?.vram_mb ? `${(status.vram_mb / 1024).toFixed(1)} GB` : "—"}</dd>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

function modelOptions(models: string[] | null, value: string | null) {
  // Keep a saved model visible even if it's no longer downloaded.
  const list = models && value && !models.includes(value) ? [value, ...models] : (models ?? []);
  return list.map((m) => (
    <option key={m} value={m}>
      {m}
      {models && !models.includes(m) ? " (not downloaded)" : ""}
    </option>
  ));
}

function SectionTitle({ children, info }: { children: ReactNode; info?: string }) {
  return (
    <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-400">
      {children}
      {info && <InfoTip text={info} />}
    </h3>
  );
}

function Select({
  label,
  hint,
  info,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string;
  hint: string;
  info: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
        {label}
        <InfoTip text={info} />
      </span>
      <span className="-mt-1 text-[11px] text-zinc-500">{hint}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label={label}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-600 disabled:opacity-50"
      >
        {children}
      </select>
    </div>
  );
}
