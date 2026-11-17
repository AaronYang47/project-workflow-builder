import { EVENT_COLUMNS, eventFilters } from "./_query";

const cell = (value: unknown) => {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** The filtered events as a spreadsheet file (up to 50,000 rows per download). */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const { where, values } = eventFilters(new URL(request.url));
  const { results } = await env
    .AUDIT_DB!.prepare(
      `SELECT ${EVENT_COLUMNS.join(", ")} FROM audit_events ${where} ORDER BY ts_ms DESC LIMIT 50000`,
    )
    .bind(...values)
    .all<Record<string, unknown>>();
  const csv = [
    EVENT_COLUMNS.join(","),
    ...results.map((row) => EVENT_COLUMNS.map((column) => cell(row[column])).join(",")),
  ].join("\r\n");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return new Response(`﻿${csv}`, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="audit-log-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
};
