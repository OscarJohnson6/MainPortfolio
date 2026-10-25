"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import type { AvatarStatus } from "../api/status/route";
import { API, BASE } from "../_lib/config";

const STATUS_TEXT: Record<AvatarStatus | "checking", { dot: string; label: string; detail: string }> = {
  checking: { dot: "bg-zinc-500", label: "Checking the AI server…", detail: "" },
  online: { dot: "bg-emerald-400", label: "AI server online", detail: "The model is loaded and ready to chat." },
  "no-model": {
    dot: "bg-amber-400",
    label: "Model offline",
    detail: "The server is up, but Ollama isn't running on the GPU machine, so chats won't get replies yet.",
  },
  offline: {
    dot: "bg-rose-400",
    label: "AI server offline",
    detail: "The gateway isn't reachable right now. You can still sign in, but nothing will answer.",
  },
};

export default function AvatarLogin() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<AvatarStatus | "checking">("checking");

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/status`, { cache: "no-store" })
      .then((r) => r.json() as Promise<{ status: AvatarStatus }>)
      .then((body) => !cancelled && setStatus(body.status))
      .catch(() => !cancelled && setStatus("offline"));
    return () => {
      cancelled = true;
    };
  }, []);
  const s = STATUS_TEXT[status];

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`${API}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        setError("Wrong access code.");
        setPassword("");
        return;
      }
      router.replace(BASE);
      router.refresh();
    } catch {
      setError("Couldn't reach the server.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-xl"
      >
        <h1 className="text-lg font-semibold">Avatar Lab</h1>
        <p className="mt-1 text-sm leading-6 text-zinc-400">
          AI characters you design and chat with, running on a local model (Ollama) on my own GPU
          instead of a cloud API. It&apos;s private, so it needs an access code.
        </p>

        <div className="mt-4 flex gap-3 rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5" aria-live="polite">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.dot}`} />
          <div className="text-sm">
            <p className="font-medium text-zinc-200">{s.label}</p>
            {s.detail && <p className="mt-0.5 leading-5 text-zinc-500">{s.detail}</p>}
          </div>
        </div>

        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Access code"
          className="mt-5 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none placeholder:text-zinc-500 focus:border-indigo-500"
        />

        {error && <p className="mt-2 text-sm text-rose-400">{error}</p>}

        <button
          type="submit"
          disabled={pending || !password}
          className="mt-4 w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {pending ? "Checking…" : "Enter"}
        </button>
      </form>
    </main>
  );
}
