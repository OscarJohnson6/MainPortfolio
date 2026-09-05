// destination: src/app/api/admin-proxy/[...path]/route.ts

import { NextRequest, NextResponse } from "next/server";

import {
  ADMIN_COOKIE_NAME,
  isSameOriginRequest,
  verifyAdminSession,
} from "@/app/hooks/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GET_ENDPOINTS = new Set(["overview", "stats", "services", "logs", "config"]);
const POST_ENDPOINTS = new Set(["wol"]);

async function isAuthenticated(request: NextRequest): Promise<boolean> {
  return verifyAdminSession(
    request.cookies.get(ADMIN_COOKIE_NAME)?.value,
    process.env.ADMIN_SESSION_SECRET,
  );
}

function backendConfiguration():
  | { baseUrl: string; token: string }
  | { error: NextResponse } {
  const baseUrl = process.env.API_BASE_URL?.trim().replace(/\/$/, "") ?? "";
  const token = process.env.BACKEND_ADMIN_TOKEN?.trim() ?? "";

  if (!baseUrl || !token) {
    return {
      error: NextResponse.json(
        { error: "Admin backend is not configured." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }

  try {
    const parsed = new URL(baseUrl);
    if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
      throw new Error("Production API_BASE_URL must use HTTPS.");
    }
  } catch {
    return {
      error: NextResponse.json(
        { error: "Admin backend URL is invalid." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      ),
    };
  }

  return { baseUrl, token };
}

async function forward(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
  method: "GET" | "POST",
) {
  if (!(await isAuthenticated(request))) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (method === "POST" && !isSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const { path } = await context.params;
  const endpoint = path.join("/");
  const allowed = method === "GET" ? GET_ENDPOINTS : POST_ENDPOINTS;

  if (path.length !== 1 || !allowed.has(endpoint)) {
    return NextResponse.json(
      { error: "Admin endpoint not found." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const configuration = backendConfiguration();
  if ("error" in configuration) return configuration.error;

  const target = new URL(
    `/api/admin/${encodeURIComponent(endpoint)}`,
    `${configuration.baseUrl}/`,
  );
  target.search = request.nextUrl.search;

  const headers = new Headers({
    "X-Admin-Token": configuration.token,
    Accept: "application/json",
  });

  let body: ArrayBuffer | undefined;
  if (method === "POST") {
    body = await request.arrayBuffer();
    const contentType = request.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);
  }

  try {
    const backendResponse = await fetch(target, {
      method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    return new NextResponse(backendResponse.body, {
      status: backendResponse.status,
      headers: {
        "Cache-Control": "no-store",
        "Content-Type":
          backendResponse.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    console.error("Admin backend request failed", error);

    return NextResponse.json(
      { error: timedOut ? "Admin backend timed out." : "Could not reach admin backend." },
      {
        status: timedOut ? 504 : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return forward(request, context, "GET");
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  return forward(request, context, "POST");
}
