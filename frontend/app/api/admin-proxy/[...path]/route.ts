// destination: src/app/api/admin-proxy/[...path]/route.ts
//
// This is the security layer between the admin dashboard and the FastAPI backend.
//
// The admin dashboard (running in the browser) cannot read the HTTP-only cookie,
// so it can't authenticate directly to FastAPI. Instead it calls this Next.js route,
// which runs on the server, can read the cookie, verify it, and then forward the
// request to FastAPI using a direct server-to-server call (bypasses nginx).
//
// Why server-to-server? On the Pi, nginx blocks /api/admin/* from external traffic.
// This route calls localhost:8000 directly, which nginx never sees.
//
// nginx config to add (blocks external access to FastAPI admin routes):
//   location /api/admin/ { return 403; }     ← add BEFORE the catch-all /api/ block
//   location /api/ { proxy_pass http://localhost:8000; }

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

// Server-to-server URL — bypasses nginx, always hits FastAPI directly
const FASTAPI_BASE = process.env.API_BASE_URL ?? "http://localhost:8000";

async function authenticate(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get("admin_token")?.value;
  const secret = process.env.ADMIN_SECRET ?? "";
  return Boolean(secret && token === secret);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  if (!(await authenticate())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path } = await context.params;
  const endpoint = path.join("/");

  try {
    const res = await fetch(`${FASTAPI_BASE}/api/admin/${endpoint}`, {
      // Don't cache admin data — always fresh
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Admin proxy GET failed:", err);
    return NextResponse.json(
      { error: "Could not reach backend." },
      { status: 502 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  if (!(await authenticate())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { path } = await context.params;
  const endpoint = path.join("/");

  try {
    const body = await request.json().catch(() => ({}));
    const res = await fetch(`${FASTAPI_BASE}/api/admin/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.status });
  } catch (err) {
    console.error("Admin proxy POST failed:", err);
    return NextResponse.json(
      { error: "Could not reach backend." },
      { status: 502 }
    );
  }
}
