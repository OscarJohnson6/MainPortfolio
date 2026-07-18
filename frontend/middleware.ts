// destination: middleware.ts (root of Next.js project, same level as src/)
//
// Runs on every request matching the config.matcher pattern.
// Checks for the admin_token HTTP-only cookie before allowing access to /admin pages.
// The login page is explicitly excluded so it doesn't redirect-loop.

import { NextRequest, NextResponse } from "next/server";

const PUBLIC_ADMIN_PATHS = ["/admin/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Only intercept /admin routes
  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  // The login page itself is always allowed through
  if (PUBLIC_ADMIN_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const token = request.cookies.get("admin_token")?.value;
  const secret = process.env.ADMIN_SECRET;

  // If no secret is configured, block access entirely to avoid accidental exposure
  if (!secret) {
    return new NextResponse("Admin access is not configured.", { status: 503 });
  }

  if (!token || token !== secret) {
    const loginUrl = new URL("/admin/login", request.url);
    // Preserve the intended destination so we can redirect back after login
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
