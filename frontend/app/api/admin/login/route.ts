import { NextRequest, NextResponse } from "next/server";

import {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_TTL_SECONDS,
  createAdminSession,
  isSameOriginRequest,
  secretsMatch,
} from "@/app/lib/admin-auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const adminSecret = process.env.ADMIN_SECRET?.trim() ?? "";
  const sessionSecret = process.env.ADMIN_SESSION_SECRET?.trim() ?? "";

  if (!adminSecret || !sessionSecret) {
    return NextResponse.json(
      { error: "Admin access is not configured on this server." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  let body: { password?: unknown };

  try {
    body = (await request.json()) as { password?: unknown };
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const providedPassword =
    typeof body.password === "string" ? body.password.trim() : "";

  if (!providedPassword || !(await secretsMatch(providedPassword, adminSecret))) {
    return NextResponse.json(
      { error: "Invalid credentials." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const session = await createAdminSession(sessionSecret);
  const response = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );

  response.cookies.set(ADMIN_COOKIE_NAME, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: ADMIN_SESSION_TTL_SECONDS,
    path: "/",
  });

  return response;
}