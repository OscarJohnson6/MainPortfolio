// destination: src/app/api/admin/logout/route.ts
//
// Clears the admin_token cookie and redirects to the login page.

import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ ok: true });

  response.cookies.set("admin_token", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 0, // expires immediately
    path: "/",
  });

  return response;
}
