"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { api, streamApi, textOn } from "../_lib/api";
import { DEFAULT_SETTINGS, type Avatar, type AvatarDraft, type AvatarSettings, type ThinkingMode } from "../_lib/types";
import AvatarIcon from "./AvatarIcon";
import InfoTip from "@/components/InfoTip";

const COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#ef4444", "#f59e0b", "#10b981", "#0ea5e9", "#64748b"];

const DIALS: { key: keyof Pick<AvatarSettings, "humor" | "verbosity" | "formality" | "warmth">; low: string; high: string; info: string }[] = [
  { key: "humor", low: "Serious", high: "Playful", info: "How much the avatar jokes around versus staying serious." },
  {
    key: "verbosity",
    low: "Brief",
    high: "Detailed",
    info: "How long replies usually are: from a single sentence (far left) to several paragraphs (far right). If you ask for more or less detail in a message, the avatar follows that instead.",
  },
  { key: "formality", low: "Casual", high: "Formal", info: "Relaxed, slangy wording versus polished, proper wording." },
  { key: "warmth", low: "Reserved", high: "Warm", info: "Dry and distant versus friendly and encouraging." },
];

// Rough time for a local model to think through and write a 150–300 word sheet.
// Only drives the countdown; generation itself has no time limit.
const GENERATE_ESTIMATE_S = 120;

const THINKING: { value: ThinkingMode; label: string; hint: string }[] = [
  { value: "off", label: "Off", hint: "Starts with the fast model: answers directly." },
  { value: "on", label: "On", hint: "Starts with the thinking model: reasons first, slower." },
];

type Props = {
  avatar?: Avatar; // undefined = creating a new one
  onSaved: (avatar: Avatar) => void;
  onDeleted: (id: string) => void;
  onCancel: () => void;
};

export default function AvatarEditor({ avatar, onSaved, onDeleted, onCancel }: Props) {
  const [draft, setDraft] = useState<AvatarDraft>(() =>
    avatar
      ? { name: avatar.name, description: avatar.description, persona: avatar.persona, emoji: avatar.emoji, color: avatar.color, settings: { ...avatar.settings } }
      : { name: "", description: "", persona: "", emoji: "", color: COLORS[0], settings: { ...DEFAULT_SETTINGS } },
  );
  const [generating, setGenerating] = useState<"idle" | "thinking" | "writing">("idle");
  const [genStartedAt, setGenStartedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [previousPersona, setPreviousPersona] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const set = <K extends keyof AvatarDraft>(key: K, value: AvatarDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setSetting = <K extends keyof AvatarSettings>(key: K, value: AvatarSettings[K]) =>
    setDraft((d) => ({ ...d, settings: { ...d.settings, [key]: value } }));

  async function generate() {
    if (!draft.name.trim() || !draft.description.trim()) {
      setError("Give it a name and a short description first.");
      return;
    }
    setError(null);
    setPreviousPersona(draft.persona);
    set("persona", "");
    setGenStartedAt(Date.now());
    setNow(Date.now());
    setGenerating("thinking");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await streamApi(
        "/avatars/generate-persona",
        { name: draft.name, description: draft.description, settings: draft.settings },
        (ev) => {
          if (ev.type === "delta") {
            setGenerating("writing");
            setDraft((d) => ({ ...d, persona: d.persona + ev.text }));
          } else if (ev.type === "error") {
            throw new Error(ev.message);
          }
        },
        controller.signal,
      );
      setDraft((d) => ({ ...d, persona: d.persona.trim() }));
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) setError((e as Error).message);
    } finally {
      abortRef.current = null;
      setGenerating("idle");
    }
  }

  function undoGenerate() {
    if (previousPersona === null) return;
    set("persona", previousPersona);
    setPreviousPersona(null);
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft.persona.trim()) {
      setError("Write or generate a character sheet before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const saved = avatar
        ? await api<Avatar>(`/avatars/${avatar.id}`, { method: "PATCH", body: JSON.stringify(draft) })
        : await api<Avatar>("/avatars", { method: "POST", body: JSON.stringify(draft) });
      onSaved(saved);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!avatar || !confirm(`Delete ${avatar.name} and all of its conversations? This can't be undone.`)) return;
    try {
      await api(`/avatars/${avatar.id}`, { method: "DELETE" });
      onDeleted(avatar.id);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const busy = generating !== "idle";

  // Tick once a second while generating, for the countdown.
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [busy]);
  const elapsedS = Math.max(0, Math.floor((now - genStartedAt) / 1000));
  const remainingS = GENERATE_ESTIMATE_S - elapsedS;
  const progress = Math.min(1, elapsedS / GENERATE_ESTIMATE_S);
  const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const words = draft.persona.trim() ? draft.persona.trim().split(/\s+/).length : 0;

  return (
    <form onSubmit={save} className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <AvatarIcon name={draft.name || "?"} emoji={draft.emoji} color={draft.color} />
        <h2 className="flex-1 truncate text-sm font-semibold">{avatar ? `Edit ${avatar.name}` : "Create an avatar"}</h2>
        <button type="button" onClick={onCancel} className="rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-900">
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || busy}
          className="rounded-lg px-3 py-1.5 text-xs font-medium transition hover:opacity-90 disabled:opacity-40"
          style={{ backgroundColor: draft.color, color: textOn(draft.color) }}
        >
          {saving ? "Saving…" : avatar ? "Save changes" : "Create"}
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-6">
          {error && <p className="rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">{error}</p>}

          {/* Identity */}
          <section className="grid gap-4 sm:grid-cols-[1fr_6rem]">
            <Field label="Name" info="What the avatar is called. It's also used when generating the character sheet.">
              <input value={draft.name} onChange={(e) => set("name", e.target.value)} maxLength={40} placeholder="Germos" className={inputCls} />
            </Field>
            <Field label="Emoji" info="Optional. Shown in the avatar's icon instead of its first letter.">
              <input value={draft.emoji} onChange={(e) => set("emoji", e.target.value)} maxLength={8} placeholder="🧙" className={`${inputCls} text-center`} />
            </Field>
          </section>

          <Field label="Color" info="Just for looks: the avatar's icon, your message bubbles and its buttons.">
            <div className="flex flex-wrap gap-2">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => set("color", c)}
                  className={`size-7 rounded-full transition ${draft.color === c ? "ring-2 ring-white ring-offset-2 ring-offset-zinc-950" : "opacity-70 hover:opacity-100"}`}
                  style={{ backgroundColor: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </Field>

          <Field
            label="Short description"
            hint="Who are they? A sentence or two is plenty."
            info="Only used to generate the character sheet. Changing it later does nothing until you regenerate. The character sheet is what the avatar actually follows."
          >
            <textarea
              value={draft.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="A grumpy retired wizard who complains constantly but secretly loves helping."
              className={inputCls}
            />
          </Field>

          {/* Personality dials */}
          <section className="flex flex-col gap-3">
            <h3 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-zinc-400">
              Personality
              <InfoTip text="These sliders are added to the avatar's instructions on every message, so changes apply right away, even without regenerating the character sheet." />
            </h3>
            {DIALS.map(({ key, low, high, info }) => (
              <label key={key} className="grid grid-cols-[6rem_1fr_5rem] items-center gap-3 text-xs text-zinc-400">
                <span className="flex items-center gap-1.5">
                  {low}
                  <InfoTip text={info} />
                </span>
                <input
                  type="range"
                  min={0}
                  max={10}
                  value={draft.settings[key]}
                  onChange={(e) => setSetting(key, Number(e.target.value))}
                  style={{ accentColor: draft.color }}
                />
                <span className="text-right">{high}</span>
              </label>
            ))}
            <p className="text-[11px] text-zinc-600">These apply live on every message, even without regenerating the character sheet.</p>
          </section>

          {/* Character sheet */}
          <Field
            label="Character sheet"
            hint="This is the avatar's actual instructions. Generate one from the description, then edit it freely."
            info="Sent to the model as its system prompt at the start of every conversation: identity, personality, speech style. The model copies the example lines closely, so if replies feel samey, edit or vary those examples."
          >
            <div className="mb-2 flex items-center gap-3">
              {busy ? (
                <button type="button" onClick={() => abortRef.current?.abort()} className="rounded-lg bg-zinc-700 px-3 py-1.5 text-xs hover:bg-zinc-600">
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  onClick={generate}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 transition hover:bg-zinc-800"
                >
                  ✨ {draft.persona ? "Regenerate" : "Generate"} from description
                </button>
              )}
              {busy && (
                <span className="text-xs tabular-nums text-zinc-500" aria-live="polite">
                  <span className="animate-pulse">{generating === "thinking" ? "Thinking it through…" : `Writing… ${words} words`}</span>
                  {" · "}
                  {remainingS > 0 ? `about ${clock(remainingS)} left` : `taking longer than usual (${clock(elapsedS)})`}
                </span>
              )}
              {!busy && previousPersona !== null && (
                <button type="button" onClick={undoGenerate} className="text-xs text-zinc-500 underline hover:text-zinc-300">
                  Undo
                </button>
              )}
            </div>
            {busy && (
              <div className="mb-2 h-1 overflow-hidden rounded-full bg-zinc-800" aria-hidden="true">
                <div
                  className="h-full rounded-full bg-indigo-500 transition-[width] duration-1000 ease-linear"
                  style={{ width: `${Math.max(3, progress * 100)}%` }}
                />
              </div>
            )}
            <textarea
              value={draft.persona}
              onChange={(e) => set("persona", e.target.value)}
              rows={14}
              maxLength={20000}
              readOnly={busy}
              placeholder={"You are Germos, ...\n\n## Personality\n..."}
              className={`${inputCls} font-mono text-xs leading-relaxed`}
            />
          </Field>

          {/* Model behavior */}
          <section className="flex flex-col gap-4">
            <h3 className="text-xs font-medium uppercase tracking-wide text-zinc-400">Model behavior</h3>
            <Field
              label={`Creativity (temperature): ${draft.settings.temperature.toFixed(2)}`}
              hint="Lower = more predictable, higher = more surprising."
              info="How randomly the model picks each next word. 0.2–0.5: consistent and focused. 0.7–0.9: natural conversation. 1.0+: creative and surprising, but more likely to ramble or go off the rails."
            >
              <input
                type="range"
                min={0}
                max={1.5}
                step={0.05}
                value={draft.settings.temperature}
                onChange={(e) => setSetting("temperature", Number(e.target.value))}
                style={{ accentColor: draft.color }}
                className="w-full"
              />
            </Field>
            <Field
              label="Thinking by default"
              hint="The 🧠 button next to the message box flips this for any single message."
              info="Whether chats with this avatar start in Think mode (reasons before answering using the thinking model) or Fast mode (answers directly using the fast model). Thinking is smarter on hard questions but much slower."
            >
              <div className="flex flex-wrap gap-2">
                {THINKING.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    title={t.hint}
                    onClick={() => setSetting("thinking", t.value)}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition ${
                      (draft.settings.thinking === "on" ? "on" : "off") === t.value ? "border-zinc-400 bg-zinc-800 text-zinc-100" : "border-zinc-800 text-zinc-400 hover:bg-zinc-900"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-zinc-600">{THINKING.find((t) => t.value === (draft.settings.thinking === "on" ? "on" : "off"))?.hint}</p>
            </Field>
          </section>

          {avatar && (
            <section className="border-t border-zinc-800 pt-6">
              <button type="button" onClick={remove} className="text-xs text-rose-400 hover:text-rose-300">
                Delete {avatar.name}
              </button>
            </section>
          )}
        </div>
      </div>
    </form>
  );
}

const inputCls =
  "w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-600";

function Field({ label, hint, info, children }: { label: string; hint?: string; info?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="flex items-center gap-1.5 text-xs font-medium text-zinc-300">
        {label}
        {info && <InfoTip text={info} />}
      </span>
      {hint && <span className="-mt-1 text-[11px] text-zinc-500">{hint}</span>}
      {children}
    </div>
  );
}
