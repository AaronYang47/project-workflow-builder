const encoder = new TextEncoder();
const COOKIE = "audit_console";
const SESSION_SECONDS = 12 * 60 * 60;

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

async function signingKey(password: string) {
  // Changing the console password signs everyone out.
  const material = await crypto.subtle.digest("SHA-256", encoder.encode(`audit-console|${password}`));
  return crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
}

async function signature(password: string, value: string) {
  return hex(await crypto.subtle.sign("HMAC", await signingKey(password), encoder.encode(value)));
}

/** Compares without leaking how much of the text matched. */
export function sameText(left: string, right: string) {
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) difference |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return difference === 0;
}

export async function sessionCookie(password: string) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const value = `${expires}.${await signature(password, String(expires))}`;
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_SECONDS}`;
}

export const clearedCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export async function signedIn(request: Request, password: string | undefined) {
  if (!password) return false;
  const value = request.headers.get("cookie")?.match(new RegExp(`(?:^|; )${COOKIE}=([^;]+)`))?.[1];
  const [expires, mac] = value?.split(".") ?? [];
  if (!expires || !mac || Number(expires) < Date.now() / 1000) return false;
  return sameText(mac, await signature(password, expires));
}

export const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
