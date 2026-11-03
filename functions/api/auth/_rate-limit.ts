import { json } from "../_lib";

const encoder = new TextEncoder();

const hashKey = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const checkAuthRateLimit = async (
  request: Request,
  env: Env,
  action: "login" | "register",
  email: string,
) => {
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const rules = action === "login"
    ? [
        { scope: "login-account", identity: `${ip}|${email}`, limit: 8, windowSeconds: 900 },
        { scope: "login-email", identity: email, limit: 20, windowSeconds: 900 },
        { scope: "login-ip", identity: ip, limit: 40, windowSeconds: 900 },
      ]
    : [
        { scope: "register-ip", identity: ip, limit: 5, windowSeconds: 3600 },
      ];

  for (const rule of rules) {
    const now = Math.floor(Date.now() / 1000);
    const windowStart = Math.floor(now / rule.windowSeconds) * rule.windowSeconds;
    const key = await hashKey(`${env.SESSION_SECRET}|${rule.scope}|${rule.identity}`);
    await env.DB.prepare(
      `INSERT INTO auth_rate_limits (key_hash, window_start, attempts)
       VALUES (?, ?, 1)
       ON CONFLICT(key_hash) DO UPDATE SET
         window_start = excluded.window_start,
         attempts = CASE
           WHEN auth_rate_limits.window_start = excluded.window_start
           THEN auth_rate_limits.attempts + 1
           ELSE 1
         END`,
    ).bind(key, windowStart).run();
    const row = await env.DB.prepare("SELECT attempts FROM auth_rate_limits WHERE key_hash = ?")
      .bind(key).first<{ attempts: number }>();
    if ((row?.attempts || 0) > rule.limit) {
      const retryAfter = Math.max(1, windowStart + rule.windowSeconds - now);
      return json(
        { error: "Too many attempts. Please try again later." },
        429,
        { "retry-after": String(retryAfter) },
      );
    }
  }
  return null;
};
