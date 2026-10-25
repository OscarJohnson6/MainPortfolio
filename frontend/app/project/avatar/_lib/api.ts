"use client";

import { API, BASE } from "./config";
import type { StreamEvent } from "./types";

export async function errorMessage(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { detail?: unknown; error?: unknown };
  if (typeof data.detail === "string") return data.detail;
  if (Array.isArray(data.detail)) {
    // FastAPI validation errors: [{ loc, msg }, ...]
    const first = data.detail[0] as { msg?: string; loc?: unknown[] } | undefined;
    if (first?.msg) return `${first.loc?.slice(-1)[0] ?? "Input"}: ${first.msg}`;
  }
  if (typeof data.error === "string") return data.error;
  return `Request failed (${res.status})`;
}

function onUnauthorized(): never {
  window.location.href = `${BASE}/login`;
  throw new Error("Signed out");
}

/** JSON request to the gateway (through the Next.js proxy). */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  if (res.status === 401) onUnauthorized();
  if (!res.ok) throw new Error(await errorMessage(res));
  return (await res.json()) as T;
}

/** Streaming request: calls onEvent for each NDJSON event until the stream ends. */
export async function streamApi(
  path: string,
  body: unknown,
  onEvent: (ev: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (res.status === 401) onUnauthorized();
  if (!res.ok || !res.body) throw new Error(await errorMessage(res));

  // NDJSON: split on newlines, keep the partial last line in the buffer.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line) as StreamEvent);
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as StreamEvent);
}

let idCounter = 0;
// crypto.randomUUID only exists on https/localhost; this works anywhere.
export const localId = () => `local-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

/** Readable text color (dark or light) on top of a hex background. */
export function textOn(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 160 ? "#18181b" : "#ffffff";
}
