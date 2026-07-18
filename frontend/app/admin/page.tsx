// destination: src/app/admin/page.tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";

// ── Types ─────────────────────────────────────────────────────────────────────

type SystemStats = {
  available: boolean;
  cpu_percent: number;
  memory: { used_gb: number; total_gb: number; percent: number };
  disk: { used_gb: number; total_gb: number; percent: number };
  temperature: number | null;
  uptime_seconds: number;
  uptime_label: string;
  load_avg: [number, number, number];
};

type ServiceStatus = {
  name: string;
  status: "ok" | "degraded" | "error";
  latency_ms: number;
};

type AdminConfig = {
  wol_mac: string;
  hostname: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// All admin data calls go through the Next.js proxy at /api/admin-proxy/
// The proxy validates the HTTP-only cookie before forwarding to FastAPI.
async function proxyGet<T>(path: string): Promise<T> {
  const res = await fetch(`/api/admin-proxy/${path}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return res.json() as Promise<T>;
}

async function proxyPost<T>(path: string, body: Record<string, string> = {}): Promise<T> {
  const form = new FormData();
  for (const [k, v] of Object.entries(body)) form.append(k, v);

  const res = await fetch(`/api/admin-proxy/${path}`, { method: "POST", body: form });
  if (!res.ok) {
    const data = await res.json() as { detail?: string };
    throw new Error(data.detail ?? `${path} returned ${res.status}`);
  }
  return res.json() as Promise<T>;
}

function StatCard({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${warn ? "text-amber-300" : "text-white"}`}>
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function ServiceDot({ status }: { status: ServiceStatus["status"] }) {
  const color =
    status === "ok"
      ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
      : status === "degraded"
      ? "bg-amber-400"
      : "bg-red-500";
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminPage() {
  const router = useRouter();

  const [stats, setStats] = useState<SystemStats | null>(null);
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [config, setConfig] = useState<AdminConfig | null>(null);
  const [wolMac, setWolMac] = useState("");
  const [wolState, setWolState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [wolError, setWolError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // ── Data fetching ────────────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    try {
      const [s, sv] = await Promise.all([
        proxyGet<SystemStats>("stats"),
        proxyGet<{ services: ServiceStatus[] }>("services"),
      ]);
      setStats(s);
      setServices(sv.services);
      setLastUpdated(new Date());
      setFetchError(null);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load stats.");
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const data = await proxyGet<{ lines: string[] }>("logs");
      setLogs(data.lines);
    } catch {
      // Logs failing silently is fine — stats are more important
    }
  }, []);

  const fetchConfig = useCallback(async () => {
    try {
      const data = await proxyGet<AdminConfig>("config");
      setConfig(data);
      if (data.wol_mac) setWolMac(data.wol_mac);
    } catch {
      // Config is optional
    }
  }, []);

  // Initial load + polling
  useEffect(() => {
    // Schedule initial fetches asynchronously to avoid calling setState
    // synchronously during the effect body which can trigger cascading renders.
    const initTimer = setTimeout(() => {
      void fetchStats();
      void fetchLogs();
      void fetchConfig();
    }, 0);

    const statsTimer = setInterval(fetchStats, 5000);
    const logsTimer = setInterval(fetchLogs, 3000);

    return () => {
      clearTimeout(initTimer);
      clearInterval(statsTimer);
      clearInterval(logsTimer);
    };
  }, [fetchStats, fetchLogs, fetchConfig]);

  // Auto-scroll logs to bottom when new lines arrive
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // ── Actions ──────────────────────────────────────────────────────────────

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
  }

  async function handleWol() {
    if (!wolMac.trim()) return;
    setWolState("sending");
    setWolError(null);
    try {
      await proxyPost("wol", { mac: wolMac.trim() });
      setWolState("sent");
      setTimeout(() => setWolState("idle"), 3000);
    } catch (err) {
      setWolState("error");
      setWolError(err instanceof Error ? err.message : "WOL failed.");
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const tempWarn = stats?.temperature !== null && (stats?.temperature ?? 0) > 75;

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100">
      <div className="mx-auto max-w-7xl">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.35em] text-cyan-300">
              OJ Builds
            </p>
            <h1 className="mt-1 text-2xl font-bold text-white">
              Admin
              {config?.hostname && (
                <span className="ml-3 font-mono text-sm font-normal text-slate-500">
                  {config.hostname}
                </span>
              )}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            {lastUpdated && (
              <p className="hidden text-xs text-slate-600 sm:block">
                Updated {lastUpdated.toLocaleTimeString()}
              </p>
            )}
            <button
              onClick={handleLogout}
              className="rounded-xl border border-slate-700 px-3 py-1.5 text-sm text-slate-400 transition hover:border-slate-500 hover:text-slate-200"
            >
              Logout
            </button>
          </div>
        </div>

        {/* Fetch error banner */}
        {fetchError && (
          <div className="mb-6 rounded-2xl border border-red-900/60 bg-red-950/30 px-5 py-3 text-sm text-red-300">
            {fetchError}
          </div>
        )}

        {/* System stats row */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            label="CPU"
            value={stats ? `${stats.cpu_percent}%` : "—"}
            warn={(stats?.cpu_percent ?? 0) > 80}
          />
          <StatCard
            label="Memory"
            value={stats ? `${stats.memory.percent}%` : "—"}
            sub={stats ? `${stats.memory.used_gb} / ${stats.memory.total_gb} GB` : undefined}
            warn={(stats?.memory.percent ?? 0) > 85}
          />
          <StatCard
            label="Temperature"
            value={stats?.temperature !== null && stats?.temperature !== undefined
              ? `${stats.temperature}°C`
              : "—"}
            warn={tempWarn}
          />
          <StatCard
            label="Disk"
            value={stats ? `${stats.disk.percent}%` : "—"}
            sub={stats ? `${stats.disk.used_gb} / ${stats.disk.total_gb} GB` : undefined}
            warn={(stats?.disk.percent ?? 0) > 90}
          />
        </div>

        {/* Main two-column grid */}
        <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_20rem]">

          {/* Services */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold text-white">Services</h2>
              <button
                onClick={fetchStats}
                className="text-xs text-slate-500 transition hover:text-cyan-300"
              >
                Refresh
              </button>
            </div>

            {services.length === 0 ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : (
              <div className="space-y-2">
                {services.map((svc) => (
                  <div
                    key={svc.name}
                    className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <ServiceDot status={svc.status} />
                      <span className="text-sm font-medium text-slate-200">{svc.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs ${
                          svc.status === "ok" ? "text-emerald-400" : "text-red-400"
                        }`}
                      >
                        {svc.status}
                      </span>
                      {svc.latency_ms >= 0 && (
                        <span className="font-mono text-xs text-slate-500">
                          {svc.latency_ms}ms
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-4">
            {/* Uptime + load */}
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
              <h2 className="mb-3 font-semibold text-white">System</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-500">Uptime</span>
                  <span className="font-mono text-slate-200">{stats?.uptime_label ?? "—"}</span>
                </div>
                {stats?.load_avg && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Load avg</span>
                    <span className="font-mono text-slate-200">
                      {stats.load_avg.map((v) => v.toFixed(2)).join(" ")}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Wake on LAN */}
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
              <h2 className="mb-3 font-semibold text-white">Wake on LAN</h2>
              <input
                type="text"
                value={wolMac}
                onChange={(e) => setWolMac(e.target.value)}
                placeholder="AA:BB:CC:DD:EE:FF"
                className="mb-3 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm text-slate-100 placeholder-slate-600 outline-none focus:border-cyan-400"
              />
              <button
                onClick={handleWol}
                disabled={!wolMac.trim() || wolState === "sending"}
                className={`w-full rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed ${
                  wolState === "sent"
                    ? "bg-emerald-400 text-slate-950"
                    : wolState === "error"
                    ? "bg-red-500/20 text-red-300"
                    : "bg-cyan-300 text-slate-950 hover:bg-cyan-200 disabled:bg-slate-700 disabled:text-slate-400"
                }`}
              >
                {wolState === "sending"
                  ? "Sending…"
                  : wolState === "sent"
                  ? "Packet sent ✓"
                  : wolState === "error"
                  ? "Failed"
                  : "⚡ Wake main PC"}
              </button>
              {wolError && (
                <p className="mt-2 text-xs text-red-400">{wolError}</p>
              )}
              <p className="mt-2 text-xs text-slate-600">
                Set WOL_MAC in your env to pre-fill this field.
              </p>
            </div>
          </div>
        </div>

        {/* Request logs */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-white">Backend activity</h2>
              <p className="text-xs text-slate-500">Live request log · refreshes every 3s</p>
            </div>
            <span className="rounded-lg bg-slate-800 px-2 py-1 font-mono text-xs text-slate-400">
              {logs.length} entries
            </span>
          </div>

          <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
            {logs.length === 0 ? (
              <p className="text-sm text-slate-500">No requests yet.</p>
            ) : (
              logs.map((line, i) => (
                <div
                  key={i}
                  className="rounded-xl bg-slate-950 px-3 py-1.5 font-mono text-xs text-slate-400"
                >
                  {line}
                </div>
              ))
            )}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>
    </main>
  );
}
