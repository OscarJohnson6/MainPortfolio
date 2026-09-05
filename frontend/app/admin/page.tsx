// destination: src/app/admin/page.tsx

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Usage = { used_gb: number; total_gb: number; percent: number };
type SystemStats = {
  available: boolean;
  cpu_percent: number;
  cpu_count: number;
  process_count: number;
  memory: Usage;
  swap: Usage;
  disk: Usage;
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
type SystemdUnit = {
  unit: string;
  active: string;
  sub: string;
  restarts?: number;
  exit_status?: number;
  changed_at?: string | null;
  error?: string;
};
type StorageEntry = {
  path: string;
  exists: boolean;
  bytes: number;
  size_mb: number;
  files: number;
};
type Overview = {
  generated_at: string;
  hostname: string;
  overall: "ok" | "degraded";
  system: SystemStats;
  services: ServiceStatus[];
  systemd_units: SystemdUnit[];
  deployment: {
    commit: string | null;
    short_commit: string | null;
    recorded: boolean;
    log: string[];
    log_updated_at: string | null;
  };
  updates: {
    reboot_required: boolean;
    apt_history_updated_at: string | null;
    apt_history_tail: string[];
    unattended_upgrades_updated_at: string | null;
  };
  storage: Record<"uploads" | "exports" | "latex_library", StorageEntry>;
  requests: { stored: number; server_errors: number };
};
type AdminConfig = { wol_mac: string; hostname: string };

class AdminRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function proxyGet<T>(path: string): Promise<T> {
  const response = await fetch(`/api/admin-proxy/${path}`, { cache: "no-store" });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new AdminRequestError(data.error ?? `${path} returned ${response.status}`, response.status);
  }
  return response.json() as Promise<T>;
}

async function proxyPost<T>(path: string, values: Record<string, string>): Promise<T> {
  const body = new FormData();
  Object.entries(values).forEach(([key, value]) => body.append(key, value));

  const response = await fetch(`/api/admin-proxy/${path}`, { method: "POST", body });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as {
      detail?: string;
      error?: string;
    };
    throw new AdminRequestError(
      data.detail ?? data.error ?? `${path} returned ${response.status}`,
      response.status,
    );
  }
  return response.json() as Promise<T>;
}

function StatCard({
  label,
  value,
  detail,
  warning = false,
}: {
  label: string;
  value: string;
  detail?: string;
  warning?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${warning ? "text-amber-300" : "text-white"}`}>
        {value}
      </p>
      {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
    </div>
  );
}

function StatusDot({ healthy }: { healthy: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-2 w-2 rounded-full ${
        healthy ? "bg-emerald-400" : "bg-red-400"
      }`}
    />
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="mb-4">
        <h2 className="font-semibold text-white">{title}</h2>
        {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? value : parsed.toLocaleString();
}

export default function AdminPage() {
  const router = useRouter();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [wolMac, setWolMac] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [wolState, setWolState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [wolError, setWolError] = useState<string | null>(null);

  const handleRequestError = useCallback(
    (caught: unknown, fallback: string) => {
      if (caught instanceof AdminRequestError && caught.status === 401) {
        router.replace("/admin/login?from=/admin");
        router.refresh();
        return;
      }
      setError(caught instanceof Error ? caught.message : fallback);
    },
    [router],
  );

  const fetchOverview = useCallback(async () => {
    try {
      const data = await proxyGet<Overview>("overview");
      setOverview(data);
      setLastUpdated(new Date());
      setError(null);
    } catch (caught) {
      handleRequestError(caught, "Could not load Pi status.");
    } finally {
      setLoading(false);
    }
  }, [handleRequestError]);

  const fetchLogs = useCallback(async () => {
    try {
      const data = await proxyGet<{ lines: string[] }>("logs?n=75");
      setLogs(data.lines);
    } catch (caught) {
      if (caught instanceof AdminRequestError && caught.status === 401) {
        handleRequestError(caught, "Your session expired.");
      }
    }
  }, [handleRequestError]);

  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState !== "visible") return;
      void fetchOverview();
      void fetchLogs();
    };

    const initialLoad = async () => {
      try {
        const config = await proxyGet<AdminConfig>("config");
        setWolMac(config.wol_mac);
      } catch (caught) {
        handleRequestError(caught, "Could not load admin configuration.");
      }
      refreshVisible();
    };

    void initialLoad();
    const overviewTimer = setInterval(() => {
      if (document.visibilityState === "visible") void fetchOverview();
    }, 30_000);
    const logsTimer = setInterval(() => {
      if (document.visibilityState === "visible") void fetchLogs();
    }, 10_000);
    document.addEventListener("visibilitychange", refreshVisible);

    return () => {
      clearInterval(overviewTimer);
      clearInterval(logsTimer);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [fetchLogs, fetchOverview, handleRequestError]);

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  async function handleWol() {
    if (!wolMac.trim()) return;
    setWolState("sending");
    setWolError(null);
    try {
      await proxyPost<{ sent: boolean }>("wol", { mac: wolMac.trim() });
      setWolState("sent");
      window.setTimeout(() => setWolState("idle"), 3_000);
    } catch (caught) {
      setWolState("error");
      setWolError(caught instanceof Error ? caught.message : "Wake-on-LAN failed.");
    }
  }

  const system = overview?.system;
  const storageEntries = overview ? Object.entries(overview.storage) : [];

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.35em] text-cyan-300">OJ Builds</p>
            <h1 className="mt-1 text-2xl font-bold text-white">
              Pi admin
              {overview?.hostname && (
                <span className="ml-3 font-mono text-sm font-normal text-slate-500">
                  {overview.hostname}
                </span>
              )}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="hidden text-xs text-slate-500 sm:inline">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              type="button"
              onClick={() => { void fetchOverview(); void fetchLogs(); }}
              className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-300 hover:border-cyan-400 hover:text-cyan-300"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-400 hover:border-slate-500 hover:text-white"
            >
              Log out
            </button>
          </div>
        </header>

        {error && (
          <p role="alert" className="mb-6 rounded-2xl border border-red-900/60 bg-red-950/30 px-5 py-3 text-sm text-red-300">
            {error}
          </p>
        )}

        {overview?.updates.reboot_required && (
          <p className="mb-6 rounded-2xl border border-amber-700/50 bg-amber-950/30 px-5 py-3 text-sm text-amber-200">
            The Pi reports that a reboot is required to finish installed updates.
          </p>
        )}

        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="CPU" value={system ? `${system.cpu_percent}%` : "—"} detail={system ? `${system.cpu_count} cores` : undefined} warning={(system?.cpu_percent ?? 0) > 80} />
          <StatCard label="Memory" value={system ? `${system.memory.percent}%` : "—"} detail={system ? `${system.memory.used_gb} / ${system.memory.total_gb} GB` : undefined} warning={(system?.memory.percent ?? 0) > 85} />
          <StatCard label="Temperature" value={system?.temperature == null ? "—" : `${system.temperature}°C`} warning={(system?.temperature ?? 0) > 75} />
          <StatCard label="Disk" value={system ? `${system.disk.percent}%` : "—"} detail={system ? `${system.disk.used_gb} / ${system.disk.total_gb} GB` : undefined} warning={(system?.disk.percent ?? 0) > 90} />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Section title="Application checks" subtitle="Internal health endpoints on 127.0.0.1:8000">
            <div className="space-y-2">
              {overview?.services.map((service) => (
                <div key={service.name} className="flex items-center justify-between rounded-2xl bg-slate-950 px-4 py-3">
                  <span className="flex items-center gap-3 text-sm"><StatusDot healthy={service.status === "ok"} />{service.name}</span>
                  <span className="font-mono text-xs text-slate-500">{service.status} · {service.latency_ms}ms</span>
                </div>
              )) ?? <p className="text-sm text-slate-500">{loading ? "Loading…" : "No checks available."}</p>}
            </div>
          </Section>

          <Section title="System services" subtitle="systemd units required by the deployment">
            <div className="space-y-2">
              {overview?.systemd_units.map((unit) => (
                <div key={unit.unit} className="flex items-center justify-between rounded-2xl bg-slate-950 px-4 py-3">
                  <span className="flex items-center gap-3 text-sm"><StatusDot healthy={unit.active === "active"} />{unit.unit}</span>
                  <span className="font-mono text-xs text-slate-500">{unit.active} / {unit.sub}</span>
                </div>
              )) ?? <p className="text-sm text-slate-500">Loading…</p>}
            </div>
          </Section>

          <Section title="System details">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
              <dt className="text-slate-500">Uptime</dt><dd className="text-right font-mono">{system?.uptime_label ?? "—"}</dd>
              <dt className="text-slate-500">Load average</dt><dd className="text-right font-mono">{system?.load_avg.map((value) => value.toFixed(2)).join("  ") ?? "—"}</dd>
              <dt className="text-slate-500">Processes</dt><dd className="text-right font-mono">{system?.process_count ?? "—"}</dd>
              <dt className="text-slate-500">Swap</dt><dd className="text-right font-mono">{system ? `${system.swap.percent}%` : "—"}</dd>
              <dt className="text-slate-500">Stored requests</dt><dd className="text-right font-mono">{overview?.requests.stored ?? "—"}</dd>
              <dt className="text-slate-500">Server errors</dt><dd className="text-right font-mono">{overview?.requests.server_errors ?? "—"}</dd>
            </dl>
          </Section>

          <Section title="Storage" subtitle="Runtime directories and the TexVoice source library">
            <div className="space-y-3">
              {storageEntries.map(([name, entry]) => (
                <div key={name} className="flex items-center justify-between text-sm">
                  <span className="text-slate-400">{name.replace("_", " ")}</span>
                  <span className="font-mono text-slate-200">{entry.exists ? `${entry.size_mb} MB · ${entry.files} files` : "not created"}</span>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Deployment" subtitle={`Last log update: ${formatDate(overview?.deployment.log_updated_at ?? null)}`}>
            <p className="mb-3 text-sm text-slate-400">
              Commit <span className="font-mono text-cyan-300">{overview?.deployment.short_commit ?? "not recorded"}</span>
            </p>
            <div className="max-h-40 overflow-y-auto rounded-2xl bg-slate-950 p-3 font-mono text-xs text-slate-400">
              {overview?.deployment.log.length ? overview.deployment.log.map((line, index) => <p key={`${index}-${line}`}>{line}</p>) : <p>No deployment log yet.</p>}
            </div>
          </Section>

          <Section title="Updates" subtitle="Read-only apt and reboot information">
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-slate-500">APT activity</dt><dd className="text-right">{formatDate(overview?.updates.apt_history_updated_at ?? null)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Unattended upgrades</dt><dd className="text-right">{formatDate(overview?.updates.unattended_upgrades_updated_at ?? null)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Reboot required</dt><dd>{overview?.updates.reboot_required ? "Yes" : "No"}</dd></div>
            </dl>
          </Section>

          <Section title="Wake main PC" subtitle="Sends a Wake-on-LAN packet from the Pi">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                value={wolMac}
                onChange={(event) => setWolMac(event.target.value)}
                placeholder="AA:BB:CC:DD:EE:FF"
                aria-label="Wake-on-LAN MAC address"
                className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm outline-none focus:border-cyan-400"
              />
              <button
                type="button"
                onClick={() => void handleWol()}
                disabled={!wolMac.trim() || wolState === "sending"}
                className="rounded-xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
              >
                {wolState === "sending" ? "Sending…" : wolState === "sent" ? "Packet sent" : "Wake PC"}
              </button>
            </div>
            {wolError && <p className="mt-2 text-xs text-red-400">{wolError}</p>}
          </Section>
        </div>

        <div className="mt-6">
          <Section title="Backend activity" subtitle="Most recent public API requests; refreshes every 10 seconds while this tab is visible">
            <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
              {logs.length ? logs.map((line, index) => (
                <p key={`${index}-${line}`} className="rounded-xl bg-slate-950 px-3 py-2 font-mono text-xs text-slate-400">{line}</p>
              )) : <p className="text-sm text-slate-500">No requests recorded yet.</p>}
            </div>
          </Section>
        </div>
      </div>
    </main>
  );
}
