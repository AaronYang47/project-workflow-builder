import { classifyApiRequest, writeAuditEvents } from "./_audit";
import { currentUser } from "./_lib";

/**
 * Records every request to the app's server in the permanent audit log: who
 * (account, or the email tried at sign-in), from where, on what device, what
 * was asked for, the result and how long it took. Bodies are never stored, so
 * passwords and file contents stay out of the log.
 */
export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  // The browser's own activity reports are recorded by /api/audit/events itself.
  if (!env.AUDIT_DB || url.pathname.startsWith("/api/audit/")) return context.next();

  const started = Date.now();
  // Read the account first: signing out or deleting the account ends the session.
  const user = await currentUser(request, env.DB, env.SESSION_SECRET).catch(() => null);
  let attemptedEmail: string | null = null;
  if (request.method === "POST" && /^\/api\/auth\/(login|register)\/?$/.test(url.pathname)) {
    const body = await request.clone().json().catch(() => null) as { email?: unknown } | null;
    attemptedEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase().slice(0, 254) : null;
  }

  let response: Response | null = null;
  let failure: unknown = null;
  try {
    response = await context.next();
    return response;
  } catch (error) {
    failure = error;
    throw error;
  } finally {
    const status = response?.status ?? 500;
    const classified = classifyApiRequest(request.method, url.pathname, status);
    let signedIn = user;
    if (!signedIn && response && classified.outcome === "success" && attemptedEmail) {
      const body = await response.clone().json().catch(() => null) as { user?: { id?: string; email?: string } } | null;
      if (body?.user?.id) signedIn = { id: body.user.id, email: body.user.email ?? attemptedEmail, name: "", role: "Coordinator" };
    }
    context.waitUntil(writeAuditEvents(env.AUDIT_DB, request, [{
      source: "server",
      category: classified.category,
      action: classified.action,
      outcome: classified.outcome,
      userId: signedIn?.id ?? null,
      userEmail: signedIn?.email ?? attemptedEmail,
      method: request.method,
      path: url.pathname,
      status,
      durationMs: Date.now() - started,
      details: {
        query: url.search || undefined,
        referer: request.headers.get("referer") || undefined,
        requestBytes: Number(request.headers.get("content-length")) || undefined,
        role: signedIn?.role || undefined,
        error: failure instanceof Error ? failure.message.slice(0, 300) : undefined,
      },
    }]).catch(() => undefined));
  }
};
