// destination: src/lib/admin-auth.ts

export const ADMIN_COOKIE_NAME = "oj_admin_session";
export const ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 12;

const SESSION_VERSION = "v1";
const textEncoder = new TextEncoder();

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  const maxLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;

  for (let index = 0; index < maxLength; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }

  return difference === 0;
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));
  return bytesToHex(new Uint8Array(digest));
}

async function sign(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );

  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(payload));
  return bytesToHex(new Uint8Array(signature));
}

export async function secretsMatch(provided: string, expected: string): Promise<boolean> {
  const [providedHash, expectedHash] = await Promise.all([
    sha256(provided),
    sha256(expected),
  ]);

  return constantTimeEqual(providedHash, expectedHash);
}

export async function createAdminSession(signingSecret: string): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + ADMIN_SESSION_TTL_SECONDS;
  const nonceBytes = new Uint8Array(16);
  crypto.getRandomValues(nonceBytes);

  const payload = `${SESSION_VERSION}.${expiresAt}.${bytesToHex(nonceBytes)}`;
  const signature = await sign(payload, signingSecret);

  return `${payload}.${signature}`;
}

export async function verifyAdminSession(
  session: string | undefined,
  signingSecret: string | undefined,
): Promise<boolean> {
  if (!session || !signingSecret) return false;

  const parts = session.split(".");
  if (parts.length !== 4) return false;

  const [version, rawExpiresAt, nonce, providedSignature] = parts;
  const expiresAt = Number(rawExpiresAt);
  const now = Math.floor(Date.now() / 1000);

  if (
    version !== SESSION_VERSION ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= now ||
    expiresAt > now + ADMIN_SESSION_TTL_SECONDS + 60 ||
    !/^[a-f0-9]{32}$/.test(nonce) ||
    !/^[a-f0-9]{64}$/.test(providedSignature)
  ) {
    return false;
  }

  const expectedSignature = await sign(
    `${version}.${rawExpiresAt}.${nonce}`,
    signingSecret,
  );

  return constantTimeEqual(providedSignature, expectedSignature);
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;

  return origin === new URL(request.url).origin;
}
