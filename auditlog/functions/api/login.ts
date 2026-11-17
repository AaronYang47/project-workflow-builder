import { overAuditRateLimit, writeAuditEvents } from "../../../functions/api/_audit";
import { json, sameText, sessionCookie } from "./_auth";

/** Console sign-in with the shared password; every attempt is itself recorded. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const password = env.AUDIT_CONSOLE_PASSWORD;
  if (!password || !env.AUDIT_DB)
    return json({ error: "The audit console is not set up yet." }, 503);
  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  if (await overAuditRateLimit(env.AUDIT_DB, `console-login|${ip}`, 5, 900)) {
    waitUntil(
      writeAuditEvents(env.AUDIT_DB, request, [
        {
          source: "console",
          category: "console",
          action: "console.login.blocked",
          outcome: "failure",
          method: "POST",
          path: "/api/login",
          status: 429,
        },
      ]),
    );
    return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
  }
  const body = (await request.json().catch(() => null)) as { password?: unknown } | null;
  const ok = typeof body?.password === "string" && sameText(body.password, password);
  waitUntil(
    writeAuditEvents(env.AUDIT_DB, request, [
      {
        source: "console",
        category: "console",
        action: ok ? "console.login.success" : "console.login.failure",
        outcome: ok ? "success" : "failure",
        method: "POST",
        path: "/api/login",
        status: ok ? 200 : 401,
      },
    ]),
  );
  if (!ok) return json({ error: "Wrong password." }, 401);
  return json({ ok: true }, 200, { "set-cookie": await sessionCookie(password) });
};
