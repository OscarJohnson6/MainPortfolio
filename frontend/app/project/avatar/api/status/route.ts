// Public, read-only health check for the login page: is the gateway up, and
// does it have a worker with Ollama behind it? Returns only a state word, so
// nothing about the setup leaks before sign-in.
import { NextResponse } from "next/server";
import { gatewayFetch } from "../../_lib/gateway";

export const dynamic = "force-dynamic";

export type AvatarStatus = "online" | "no-model" | "offline";

export async function GET() {
  let status: AvatarStatus = "offline";
  try {
    const res = await gatewayFetch("/status", { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const body = (await res.json()) as { online?: boolean };
      status = body.online ? "online" : "no-model";
    }
  } catch {
    status = "offline";
  }
  return NextResponse.json({ status });
}
