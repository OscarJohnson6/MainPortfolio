// destination: proxy.ts (Next.js project root)

import { NextRequest, NextResponse } from "next/server";

import {
  ADMIN_COOKIE_NAME,
  verifyAdminSession,
} from "@/app/hooks/admin-auth";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  const signingSecret = process.env.ADMIN_SESSION_SECRET;
  if (!signingSecret) {
    return new NextResponse("Admin access is not configured.", { status: 503 });
  }

  const authenticated = await verifyAdminSession(
    request.cookies.get(ADMIN_COOKIE_NAME)?.value,
    signingSecret,
  );

  if (!authenticated) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("from", `${pathname}${search}`);

    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete(ADMIN_COOKIE_NAME);
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
