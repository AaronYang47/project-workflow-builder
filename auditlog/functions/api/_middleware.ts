import { writeAuditEvents } from "../../../functions/api/_audit";
import { json, signedIn } from "./_auth";

/**
 * Everything under /api except signing in needs a valid console session.
 * Refused requests are recorded, so attempts to read the log show up in it.
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const { pathname } = new URL(request.url);
  if (pathname === "/api/login" || pathname === "/api/login/") return context.next();
  if (!env.AUDIT_DB) return json({ error: "The audit database is not connected." }, 503);
  if (!(await signedIn(request, env.AUDIT_CONSOLE_PASSWORD))) {
    context.waitUntil(writeAuditEvents(env.AUDIT_DB, request, [{
      source: "console", category: "console", action: "console.access.refused", outcome: "failure",
      method: request.method, path: pathname, status: 401,
    }]).catch(() => undefined));
    return json({ error: "Please sign in." }, 401);
  }
  return context.next();
};
