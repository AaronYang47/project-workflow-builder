import { json } from "./_auth";
import { EVENT_COLUMNS, eventFilters } from "./_query";

/** Newest first, a page at a time; `before` continues from the last row shown. */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const { where, values } = eventFilters(url);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit")) || 100));
  const [beforeMs, beforeId] = (url.searchParams.get("before") || "").split("|");
  const page = beforeMs && beforeId
    ? { clause: `${where ? `${where} AND` : "WHERE"} (ts_ms < ? OR (ts_ms = ? AND id < ?))`, values: [...values, Number(beforeMs), Number(beforeMs), beforeId] }
    : { clause: where, values };
  const { results } = await env.AUDIT_DB!.prepare(
    `SELECT ts_ms, ${EVENT_COLUMNS.join(", ")} FROM audit_events ${page.clause} ORDER BY ts_ms DESC, id DESC LIMIT ?`,
  ).bind(...page.values, limit).all<Record<string, unknown>>();
  const last = results.at(-1);
  return json({ events: results, next: results.length === limit && last ? `${last.ts_ms}|${last.id}` : null });
};
