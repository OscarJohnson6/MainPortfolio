// Forwards every /project/avatar/api/* request (except /login) to the gateway,
// after checking the session cookie. Streams pass straight through.
import { NextResponse } from "next/server";
import { isAuthed } from "../../_lib/auth";
import { gatewayFetch } from "../../_lib/gateway";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path: string[] }> };

async function proxy(req: Request, ctx: Ctx) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { path } = await ctx.params;
  const search = new URL(req.url).search;
  const target = "/" + path.map(encodeURIComponent).join("/") + search;

  const init: RequestInit = {
    method: req.method,
    headers: { "Content-Type": req.headers.get("content-type") ?? "application/json" },
    signal: req.signal, // Stop in the UI -> gateway -> worker -> Ollama all stop
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }

  let upstream: Response;
  try {
    upstream = await gatewayFetch(target, init);
  } catch {
    return NextResponse.json(
      { error: "Gateway unreachable. Is the gateway terminal (port 8200) running?" },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
