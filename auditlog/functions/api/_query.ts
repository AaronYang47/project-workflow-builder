/** Turns the console's filters into a WHERE clause with bound values. */
export function eventFilters(url: URL) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  const param = (name: string) => url.searchParams.get(name)?.trim() || "";
  const from = Date.parse(param("from"));
  const to = Date.parse(param("to"));
  if (Number.isFinite(from)) {
    clauses.push("ts_ms >= ?");
    values.push(from);
  }
  if (Number.isFinite(to)) {
    clauses.push("ts_ms <= ?");
    values.push(to);
  }
  for (const [name, column] of [
    ["source", "source"],
    ["category", "category"],
    ["outcome", "outcome"],
    ["session", "session_id"],
    ["ip", "ip"],
  ] as const) {
    if (param(name)) {
      clauses.push(`${column} = ?`);
      values.push(param(name));
    }
  }
  if (param("user")) {
    clauses.push("user_email LIKE ?");
    values.push(`%${param("user").toLowerCase()}%`);
  }
  if (param("action")) {
    clauses.push("action LIKE ?");
    values.push(`${param("action")}%`);
  }
  if (param("q")) {
    const like = `%${param("q")}%`;
    clauses.push(
      "(action LIKE ? OR path LIKE ? OR page LIKE ? OR user_email LIKE ? OR ip LIKE ? OR city LIKE ? OR country LIKE ? OR details_json LIKE ?)",
    );
    values.push(like, like, like, like, like, like, like, like);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", values };
}

export const EVENT_COLUMNS = [
  "id",
  "ts",
  "received_at",
  "source",
  "category",
  "action",
  "outcome",
  "user_id",
  "user_email",
  "session_id",
  "ip",
  "country",
  "region",
  "city",
  "postal_code",
  "latitude",
  "longitude",
  "timezone",
  "asn",
  "as_organization",
  "colo",
  "user_agent",
  "device_type",
  "os",
  "browser",
  "method",
  "path",
  "status",
  "duration_ms",
  "page",
  "details_json",
] as const;
