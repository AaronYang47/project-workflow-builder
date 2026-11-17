import { json } from "./_auth";
import { eventFilters } from "./_query";

/** One row per browser visit: who, where, on what, when, and how long they were active. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const { where, values } = eventFilters(url);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 200));
  const { results } = await env
    .AUDIT_DB!.prepare(
      `
    SELECT session_id,
      MAX(user_email) AS user_email,
      MIN(ts) AS started, MAX(ts) AS ended,
      (MAX(ts_ms) - MIN(ts_ms)) / 1000 AS span_seconds,
      MAX(CAST(json_extract(details_json, '$.activeSeconds') AS INTEGER)) AS active_seconds,
      COUNT(*) AS events,
      SUM(action = 'ui.click') AS clicks,
      SUM(action = 'page.view') AS page_views,
      MAX(ip) AS ip, MAX(city) AS city, MAX(region) AS region, MAX(country) AS country,
      MAX(device_type) AS device_type, MAX(os) AS os, MAX(browser) AS browser,
      MAX(json_extract(details_json, '$.client.screen')) AS screen,
      MAX(json_extract(details_json, '$.client.timeZone')) AS time_zone
    FROM audit_events ${where ? `${where} AND` : "WHERE"} session_id IS NOT NULL
    GROUP BY session_id ORDER BY MAX(ts_ms) DESC LIMIT ?`,
    )
    .bind(...values, limit)
    .all();
  return json({ sessions: results });
};
