// destination: src/app/admin/login/page.tsx

"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useRef, useState } from "react";

function safeDestination(candidate: string | null): string {
  if (
    !candidate ||
    !candidate.startsWith("/admin") ||
    candidate.startsWith("//") ||
    candidate.startsWith("/admin/login")
  ) {
    return "/admin";
  }

  return candidate;
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={<p className="p-8 text-slate-400">Loading login…</p>}>
      <AdminLoginContent />
    </Suspense>
  );
}

function AdminLoginContent() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? "Sign-in failed.");
      }

      router.replace(safeDestination(searchParams.get("from")));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reach the server.");
      setPassword("");
      inputRef.current?.focus();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.35em] text-cyan-300">OJ Builds</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-white">Admin access</h1>
          <p className="mt-2 text-sm text-slate-400">
            Sign in to view private Raspberry Pi status and controls.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <label className="sr-only" htmlFor="admin-password">Admin password</label>
          <input
            id="admin-password"
            ref={inputRef}
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Admin password"
            autoComplete="current-password"
            autoFocus
            className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-slate-100 placeholder-slate-500 outline-none transition focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400/50"
          />

          {error && (
            <p role="alert" className="rounded-xl border border-red-900/60 bg-red-950/40 px-4 py-2 text-sm text-red-300">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="rounded-2xl bg-cyan-300 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          <Link href="/" className="transition hover:text-cyan-300">Return to portfolio</Link>
        </p>
      </div>
    </main>
  );
}
