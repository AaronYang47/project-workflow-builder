import { overAuditRateLimit, writeAuditEvents, type AuditEvent } from "../_audit";
import { currentUser, json } from "../_lib";

type ClientEvent = { ts?: unknown; category?: unknown; action?: unknown; page?: unknown; details?: unknown };
type ClientBatch = { sessionId?: unknown; client?: unknown; events?: unknown };

const MAX_EVENTS = 50;
const label = (value: unknown, max: number) => typeof value === "string" && /^[\w.:-]+$/.test(value) ? value.slice(0, max) : null;

/** Receives the browser's activity (page views, clicks, edits, exports, time on site) in batches. */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  if (!env.AUDIT_DB) return new Response(null, { status: 204 });
  const raw = await request.text();
  if (raw.length > 200_000) return json({ error: "Too much activity in one report." }, 413);
  let batch: ClientBatch;
  try {
    batch = JSON.parse(raw) as ClientBatch;
  } catch {
    return json({ error: "Activity report is not valid." }, 400);
  }
  const incoming = Array.isArray(batch.events) ? batch.events.slice(0, MAX_EVENTS) as ClientEvent[] : [];
  if (!incoming.length) return new Response(null, { status: 204 });

  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  // A real visitor sends a few events a minute; cap one address at 3,000 per 10 minutes.
  if (await overAuditRateLimit(env.AUDIT_DB, `client-events|${ip}`, 3000, 600, incoming.length)) {
    return json({ error: "Too much activity reported." }, 429);
  }

  const user = await currentUser(request, env.DB, env.SESSION_SECRET).catch(() => null);
  const sessionId = typeof batch.sessionId === "string" ? batch.sessionId.slice(0, 80) : null;
  const client = batch.client && typeof batch.client === "object" ? batch.client as Record<string, unknown> : {};
  const events: AuditEvent[] = incoming.flatMap((event) => {
    const category = label(event.category, 40);
    const action = label(event.action, 120);
    if (!category || !action) return [];
    const details = event.details && typeof event.details === "object" ? event.details as Record<string, unknown> : {};
    return [{
      ts: typeof event.ts === "string" ? event.ts : undefined,
      source: "client" as const,
      category,
      action,
      outcome: action.endsWith(".failure") || category === "error" ? "failure" as const : "info" as const,
      userId: user?.id ?? null,
      userEmail: user?.email ?? null,
      sessionId,
      page: typeof event.page === "string" ? event.page : null,
      details: { ...details, client },
    }];
  });
  await writeAuditEvents(env.AUDIT_DB, request, events);
  return new Response(null, { status: 204 });
};
