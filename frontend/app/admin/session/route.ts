// destination: src/app/api/admin/session/route.ts

import { NextRequest, NextResponse } from "next/server";

import {
  ADMIN_COOKIE_NAME,
  verifyAdminSession,
} from "@/app/lib/admin-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authenticated = await verifyAdminSession(
    request.cookies.get(ADMIN_COOKIE_NAME)?.value,
    process.env.ADMIN_SESSION_SECRET,
  );

  return NextResponse.json(
    { authenticated },
    {
      status: authenticated ? 200 : 401,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
