// destination: src/app/status/page.tsx
// Public — no auth required. Shows enough to be interesting without exposing anything sensitive.

import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Status",
  description: "Live system status for OJ Builds — service health, Pi uptime, and more.",
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

type ServiceStatus = {
  name: string;
  status: "ok" | "degraded" | "error";
  latency_ms: number;
};

type StatusResponse = {
  overall: "ok" | "degraded";
  services: ServiceStatus[];
  cpu_percent: number;
  temperature: number | null;
  uptime_label: string;
  uptime_seconds: number;
  psutil_available: boolean;
};

// This is a server component — data is fetched on the server at request time.
// No polling here; the user refreshes the page to get fresh data.
// For live updates, this could be converted to a client component with polling.
async function getStatus(): Promise<StatusResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/api/status`, {
      next: { revalidate: 10 }, // ISR: re-fetch every 10 seconds at most
    });
    if (!res.ok) return null;
    return res.json() as Promise<StatusResponse>;
  } catch {
    return null;
  }
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    ok: "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]",
    degraded: "bg-amber-400",
    error: "bg-red-500",
  };
  return (
    <span
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${colors[status] ?? colors.error}`}
    />
  );
}

export default async function StatusPage() {
  const data = await getStatus();
  const now = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
      <div className="mx-auto max-w-4xl">

        {/* Header */}
        <div className="mb-10">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-cyan-300">
            OJ Builds
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight text-white md:text-5xl">
            System status
          </h1>
          <p className="mt-3 text-slate-400">
            Live health for all services running on the Pi 5.
            {data && (
              <span className="ml-2 text-slate-600">Last checked at {now}.</span>
            )}
          </p>
        </div>

        {/* Could not reach backend */}
        {!data && (
          <div className="rounded-3xl border border-red-900/50 bg-red-950/30 p-8 text-center">
            <p className="text-lg font-semibold text-red-400">Backend is unreachable</p>
            <p className="mt-2 text-sm text-slate-400">
              The API server could not be contacted. It may be offline or starting up.
            </p>
          </div>
        )}

        {data && (
          <div className="flex flex-col gap-5">

            {/* Overall banner */}
            <div
              className={`flex items-center gap-4 rounded-3xl border px-6 py-4 ${
                data.overall === "ok"
                  ? "border-emerald-900/60 bg-emerald-950/30"
                  : "border-amber-900/60 bg-amber-950/30"
              }`}
            >
              <StatusDot status={data.overall} />
              <div>
                <p className="font-semibold text-white">
                  {data.overall === "ok" ? "All systems operational" : "Partial outage"}
                </p>
                <p className="text-sm text-slate-400">
                  {data.services.filter((s) => s.status === "ok").length} of{" "}
                  {data.services.length} services healthy
                </p>
              </div>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              {/* Services */}
              <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
                <h2 className="mb-4 font-semibold text-white">Services</h2>
                <div className="space-y-2">
                  {data.services.map((svc) => (
                    <div
                      key={svc.name}
                      className="flex items-center justify-between rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <StatusDot status={svc.status} />
                        <span className="text-sm font-medium text-slate-200">{svc.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs ${
                            svc.status === "ok" ? "text-emerald-400" : "text-red-400"
                          }`}
                        >
                          {svc.status}
                        </span>
                        {svc.latency_ms >= 0 && (
                          <span className="font-mono text-xs text-slate-600">
                            {svc.latency_ms}ms
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pi health */}
              <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5">
                <h2 className="mb-4 font-semibold text-white">Pi 5 health</h2>

                {!data.psutil_available ? (
                  <p className="text-sm text-slate-500">
                    Install psutil on the Pi to see system metrics.
                  </p>
                ) : (
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">CPU usage</span>
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-800">
                          <div
                            className={`h-full rounded-full ${
                              data.cpu_percent > 80 ? "bg-amber-400" : "bg-cyan-400"
                            }`}
                            style={{ width: `${data.cpu_percent}%` }}
                          />
                        </div>
                        <span className="w-10 text-right font-mono text-slate-300">
                          {data.cpu_percent}%
                        </span>
                      </div>
                    </div>

                    {data.temperature !== null && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Temperature</span>
                        <span
                          className={`font-mono ${
                            data.temperature > 75 ? "text-amber-300" : "text-slate-300"
                          }`}
                        >
                          {data.temperature}°C
                          {data.temperature > 75 && (
                            <span className="ml-1 text-xs text-amber-400">warm</span>
                          )}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Uptime</span>
                      <span className="font-mono text-slate-300">{data.uptime_label}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer note */}
            <p className="text-center text-xs text-slate-700">
              This portfolio runs on a Raspberry Pi 5 with nginx, uvicorn, and Next.js.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
