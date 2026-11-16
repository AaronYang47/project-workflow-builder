import { json } from "./_auth";
import { eventFilters } from "./_query";

/** Headline numbers and breakdowns for the selected period. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const { where, values } = eventFilters(new URL(request.url));
  const db = env.AUDIT_DB!;
  const and = (clause: string) => where ? `${where} AND ${clause}` : `WHERE ${clause}`;
  const [totals, logins, countries, actions, days, devices, active] = await db.batch([
    db.prepare(`SELECT COUNT(*) AS events, COUNT(DISTINCT user_email) AS users, COUNT(DISTINCT ip) AS ips, COUNT(DISTINCT session_id) AS visits, MIN(ts) AS first, MAX(ts) AS last FROM audit_events ${where}`).bind(...values),
    db.prepare(`SELECT outcome, COUNT(*) AS count FROM audit_events ${and("action LIKE 'auth.login.%'")} GROUP BY outcome`).bind(...values),
    db.prepare(`SELECT COALESCE(country, '?') AS country, COUNT(*) AS count FROM audit_events ${where} GROUP BY 1 ORDER BY count DESC LIMIT 8`).bind(...values),
    db.prepare(`SELECT action, COUNT(*) AS count FROM audit_events ${where} GROUP BY action ORDER BY count DESC LIMIT 12`).bind(...values),
    db.prepare(`SELECT substr(ts, 1, 10) AS day, COUNT(*) AS count FROM audit_events ${where} GROUP BY day ORDER BY day DESC LIMIT 31`).bind(...values),
    db.prepare(`SELECT COALESCE(device_type, '?') || ' · ' || COALESCE(os, '?') AS device, COUNT(DISTINCT COALESCE(session_id, ip)) AS count FROM audit_events ${where} GROUP BY 1 ORDER BY count DESC LIMIT 8`).bind(...values),
    db.prepare(`SELECT SUM(seconds) AS seconds FROM (SELECT MAX(CAST(json_extract(details_json, '$.activeSeconds') AS INTEGER)) AS seconds FROM audit_events ${and("session_id IS NOT NULL")} GROUP BY session_id)`).bind(...values),
  ]);
  return json({
    totals: totals.results[0],
    logins: Object.fromEntries((logins.results as { outcome: string; count: number }[]).map((row) => [row.outcome, row.count])),
    countries: countries.results,
    actions: actions.results,
    days: days.results,
    devices: devices.results,
    activeSeconds: (active.results[0] as { seconds: number | null } | undefined)?.seconds ?? 0,
  });
};
