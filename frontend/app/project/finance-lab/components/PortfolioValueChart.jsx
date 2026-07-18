"use client";

import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { currency } from "../data/financeLab";

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-950/95 p-3 text-xs shadow-2xl">
      <div className="mb-2 font-mono font-semibold text-slate-100">{label}</div>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex min-w-44 justify-between gap-4">
            <span className="text-slate-400">{entry.name || entry.dataKey}</span>
            <span className="font-mono text-slate-100">{currency(entry.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PortfolioValueChart({ rows, benchmarkSymbol }) {
  const safeRows = Array.isArray(rows) ? rows : [];

  if (!safeRows.length) {
    return (
      <div className="flex h-[20rem] items-center justify-center rounded-2xl border border-slate-800 bg-slate-950/70 text-center text-sm text-slate-500">
        Start from a template or add a position to generate the chart.
      </div>
    );
  }

  return (
    <div className="h-[20rem] rounded-2xl border border-slate-800 bg-slate-950/70 px-3 py-4 xl:h-[23rem]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={safeRows} margin={{ top: 8, right: 14, left: 4, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" />
          <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 10 }} tickMargin={8} minTickGap={28} />
          <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} tickFormatter={(value) => `$${Math.round(value / 1000)}k`} width={46} />
          <Tooltip content={<ChartTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Line type="monotone" dataKey="portfolio" name="Portfolio" stroke="#67e8f9" strokeWidth={3} dot={false} activeDot={{ r: 5 }} />
          <Line type="monotone" dataKey="costBasis" name="Cost basis" stroke="#64748b" strokeWidth={2} strokeDasharray="5 5" dot={false} />
          <Line type="monotone" dataKey="benchmark" name={benchmarkSymbol || "Benchmark"} stroke="#a78bfa" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
