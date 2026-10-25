// Server-only helpers. Never import this from a "use client" file.
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "avatar_session";
const SESSION_TTL_S = 60 * 60 * 24 * 7; // 1 week

export const sessionCookieOptions = {
  httpOnly: true, // JS in the browser can't read it
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
  maxAge: SESSION_TTL_S,
};

function sessionSecret(): string {
  const s = process.env.AVATAR_SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error("AVATAR_SESSION_SECRET must be set (32+ chars)");
  }
  return s;
}

function sign(value: string): string {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

// Hash both sides first so timingSafeEqual gets equal-length buffers.
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function checkPassword(input: string): boolean {
  const expected = process.env.AVATAR_PASSWORD;
  if (!expected) return false;
  return safeEqual(input, expected);
}

/** Token = "<expiry>.<hmac(expiry)>". Can't be forged without the secret. */
export function createSessionToken(): string {
  const payload = String(Math.floor(Date.now() / 1000) + SESSION_TTL_S);
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  if (!safeEqual(sig, sign(payload))) return false;
  return Number(payload) > Date.now() / 1000;
}

export async function isAuthed(): Promise<boolean> {
  // `await` works on both Next 14 (sync cookies()) and 15+ (async cookies()).
  const store = await cookies();
  return verifySessionToken(store.get(SESSION_COOKIE)?.value);
}
