"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useChat } from "../_hooks/useChat";
import { api, errorMessage, textOn } from "../_lib/api";
import { API } from "../_lib/config";
import type { Avatar, ChatMessage, GlobalSettings, Stats, Status } from "../_lib/types";
import AvatarIcon from "./AvatarIcon";
import ThinkingBlock from "./ThinkingBlock";

type Props = {
  avatar: Avatar;
  conversationId: string | null;
  status: Status | null;
  globalSettings: GlobalSettings | null;
  onConversationCreated: (id: string) => void;
  onReplyFinished: () => void;
  onNewChat: () => void;
  onEdit: () => void;
  onOpenSidebar: () => void;
  onOpenSettings: () => void;
};

export default function ChatPanel({
  avatar,
  conversationId,
  status,
  globalSettings,
  onConversationCreated,
  onReplyFinished,
  onNewChat,
  onEdit,
  onOpenSidebar,
  onOpenSettings,
}: Props) {
  const { messages, send, stop, isStreaming, loading, loadError, liveModel } = useChat({
    avatarId: avatar.id,
    conversationId,
    onConversationCreated,
    onReplyFinished,
  });
  const [input, setInput] = useState("");
  // The brain toggle: starts at the avatar's default, flip it for any message.
  const [think, setThink] = useState(avatar.settings.thinking === "on");
  const [warm, setWarm] = useState<"idle" | "warming" | "ready" | "failed">("idle");

  // Warm-up: start loading this avatar's model as soon as it's opened (or 🧠 flips),
  // so the first message doesn't wait for the model to load from disk. Fires once
  // per model, and only after the worker is confirmed online.
  const canWarm = (globalSettings?.warmup ?? false) && status?.online === true;
  const warmKey = `${avatar.id}|${think}|${avatar.settings.model ?? (think ? globalSettings?.think_model : globalSettings?.fast_model) ?? ""}`;
  useEffect(() => {
    if (!canWarm) return;
    let cancelled = false;
    setWarm("warming");
    api<{ model: string; seconds: number }>("/warmup", {
      method: "POST",
      body: JSON.stringify({ avatar_id: avatar.id, think }),
    })
      .then(() => !cancelled && setWarm("ready"))
      .catch(() => !cancelled && setWarm("failed"));
    return () => {
      cancelled = true;
    };
    // warmKey captures avatar, toggle and chosen model; think/avatar.id are read through it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [warmKey, canWarm]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: isStreaming ? "auto" : "smooth" });
  }, [messages, isStreaming]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [avatar.id, conversationId]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [input]);

  function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!input.trim() || isStreaming) return;
    void send(input, think);
    setInput("");
  }

  async function exportChat() {
    if (!conversationId) return;
    try {
      const res = await fetch(`${API}/conversations/${conversationId}/export`);
      if (!res.ok) throw new Error(await errorMessage(res));
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      const slug = avatar.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "avatar";
      a.href = url;
      a.download = `${slug}-chat-${new Date().toISOString().slice(0, 10)}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Export failed: ${(e as Error).message}`);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  const online = liveModel ? true : status?.online;
  const plannedModel =
    avatar.settings.model || (think ? globalSettings?.think_model : globalSettings?.fast_model) || status?.model;
  const model = isStreaming ? (liveModel?.model ?? plannedModel) : plannedModel;
  const worker = liveModel?.worker ?? status?.worker;
  const lastStats = [...messages].reverse().find((m) => m.role === "assistant" && m.stats)?.stats;

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <button
          onClick={onOpenSidebar}
          className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 md:hidden"
          aria-label="Open avatar list"
        >
          ☰
        </button>
        <AvatarIcon name={avatar.name} emoji={avatar.emoji} color={avatar.color} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold leading-tight">{avatar.name}</h2>
          <p className="flex items-center gap-1.5 truncate text-xs text-zinc-400">
            <span
              className={`size-1.5 shrink-0 rounded-full ${
                online === undefined ? "bg-zinc-500" : online ? "bg-emerald-400" : "bg-rose-500"
              }`}
            />
            {online === undefined ? (
              "Checking…"
            ) : !online ? (
              "Offline. Is the worker running?"
            ) : warm === "warming" && !isStreaming ? (
              <span className="animate-pulse">Loading {model ?? "model"} into memory…</span>
            ) : (
              `${model ?? "model"} · ${worker ?? "worker"}${lastStats?.tokens_per_s ? ` · ${lastStats.tokens_per_s} tok/s` : ""}`
            )}
          </p>
        </div>
        <button
          onClick={exportChat}
          disabled={!conversationId || isStreaming}
          className={headerBtn}
          title="Download this conversation, including every thought process, as a Markdown file"
        >
          Export
        </button>
        <button onClick={onEdit} className={headerBtn}>
          Edit
        </button>
        <button onClick={onNewChat} disabled={!conversationId && messages.length === 0} className={headerBtn}>
          New chat
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
          {loading ? (
            <p className="mt-16 text-center text-sm text-zinc-500">Loading…</p>
          ) : loadError ? (
            <p className="mt-16 text-center text-sm text-rose-400">{loadError}</p>
          ) : messages.length === 0 ? (
            <div className="mt-16 flex flex-col items-center gap-3 text-center">
              <AvatarIcon name={avatar.name} emoji={avatar.emoji} color={avatar.color} size="lg" />
              <p className="text-sm text-zinc-300">Start a conversation with {avatar.name}.</p>
              {avatar.description && <p className="max-w-sm text-xs text-zinc-500">{avatar.description}</p>}
            </div>
          ) : (
            messages.map((m, i) => (
              <Bubble
                key={m.id}
                message={m}
                color={avatar.color}
                live={isStreaming && i === messages.length - 1 && m.role === "assistant"}
              />
            ))
          )}
          <div ref={bottomRef} />
        </div>
      </main>

      <form onSubmit={submit} className="border-t border-zinc-800 p-3">
        {globalSettings && !globalSettings.fast_model && !think && (
          <p className="mx-auto mb-2 max-w-3xl text-center text-[11px] text-zinc-500">
            No fast model set, so replies use the default model and may think for a while.{" "}
            <button type="button" onClick={onOpenSettings} className="underline hover:text-zinc-300">
              Pick one in Settings
            </button>
          </p>
        )}
        <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-zinc-800 bg-zinc-900 p-2 focus-within:border-zinc-600">
          <button
            type="button"
            onClick={() => setThink((v) => !v)}
            aria-pressed={think}
            title={think ? "Thinking on: reasons before answering (slower)" : "Thinking off: answers directly (faster)"}
            className={`flex h-8 shrink-0 items-center gap-1 rounded-xl px-2 text-xs transition ${
              think ? "bg-zinc-100 text-zinc-900" : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            }`}
          >
            <span className={think ? "" : "opacity-50 grayscale"}>🧠</span>
            <span className="hidden sm:inline">{think ? "Think" : "Fast"}</span>
          </button>
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={`Message ${avatar.name}…`}
            className="max-h-40 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-zinc-500"
          />
          {isStreaming ? (
            <button type="button" onClick={stop} className="rounded-xl bg-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-600">
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              className="rounded-xl px-3 py-1.5 text-sm font-medium transition hover:opacity-90 disabled:opacity-40"
              style={{ backgroundColor: avatar.color, color: textOn(avatar.color) }}
            >
              Send
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

const headerBtn =
  "rounded-lg border border-zinc-800 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-zinc-900 disabled:opacity-40";

function Bubble({ message, color, live }: { message: ChatMessage; color: string; live: boolean }) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className="max-w-[85%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md px-4 py-2.5 text-sm leading-relaxed"
          style={{ backgroundColor: color, color: textOn(color) }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  const waiting = live && !message.content && !message.thinking;
  return (
    <div className="flex flex-col items-start">
      <div
        className={`max-w-[85%] break-words rounded-2xl rounded-bl-md px-4 py-2.5 text-sm leading-relaxed ${
          message.error ? "border border-rose-900/60 bg-rose-950/40 text-rose-200" : "bg-zinc-800/80 text-zinc-100"
        }`}
      >
        {message.thinking ? <ThinkingBlock text={message.thinking} live={live && !message.content} /> : null}
        {waiting ? (
          <span className="flex gap-1 py-1">
            <span className="size-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.3s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-zinc-400 [animation-delay:-0.15s]" />
            <span className="size-1.5 animate-bounce rounded-full bg-zinc-400" />
          </span>
        ) : (
          <div className="whitespace-pre-wrap">{message.content}</div>
        )}
      </div>
      {message.stats && <StatsLine stats={message.stats} />}
    </div>
  );
}

function StatsLine({ stats }: { stats: Stats }) {
  const parts: string[] = [];
  if (stats.tokens) parts.push(`${stats.tokens} tokens`);
  if (stats.tokens_per_s) parts.push(`${stats.tokens_per_s} tok/s`);
  if (stats.duration_s) parts.push(`${stats.duration_s}s`);
  if (stats.stopped) parts.push("stopped");
  if (!parts.length) return null;
  return <p className="mt-1 pl-2 text-[11px] text-zinc-600">{parts.join(" · ")}</p>;
}
