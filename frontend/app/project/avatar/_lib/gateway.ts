// Server-only: talks to the FastAPI gateway with the shared secret.
// The secret never reaches the browser.

export async function gatewayFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const base = process.env.AVATAR_GATEWAY_URL;
  const secret = process.env.AVATAR_GATEWAY_SECRET;
  if (!base || !secret) {
    throw new Error("AVATAR_GATEWAY_URL and AVATAR_GATEWAY_SECRET must be set");
  }
  return fetch(`${base.replace(/\/$/, "")}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(init.headers ?? {}),
      "X-Gateway-Secret": secret,
    },
  });
}
