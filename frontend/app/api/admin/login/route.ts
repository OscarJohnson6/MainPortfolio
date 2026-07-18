// destination: src/app/api/admin/login/route.ts
//
// Accepts a POST with { token: string }.
// If it matches ADMIN_SECRET, sets an HTTP-only cookie and returns ok.
// The redirect happens client-side after receiving the ok response.

import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "admin_token";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export async function POST(request: NextRequest) {
  const body = await request.json() as { token?: string };
  const provided = body.token?.trim() ?? "";
  const secret = process.env.ADMIN_SECRET ?? "";

  if (!secret) {
    return NextResponse.json(
      { error: "Admin access is not configured on this server." },
      { status: 503 }
    );
  }

  if (!provided || provided !== secret) {
    // Generic error — don't reveal whether the secret exists or what it is
    return NextResponse.json({ error: "Invalid token." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });

  // HTTP-only: JS cannot read this cookie. Secure: HTTPS only in production.
  // SameSite lax: allows the cookie on navigation but not cross-site POST.
  response.cookies.set(COOKIE_NAME, secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: COOKIE_MAX_AGE,
    path: "/",
  });

  return response;
}
