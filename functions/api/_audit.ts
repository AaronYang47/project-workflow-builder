/** One row of the permanent activity record (see auditlog/migrations). */
export type AuditEvent = {
  ts?: string;
  source: "server" | "client" | "console";
  category: string;
  action: string;
  outcome?: "success" | "failure" | "info";
  userId?: string | null;
  userEmail?: string | null;
  sessionId?: string | null;
  method?: string | null;
  path?: string | null;
  status?: number | null;
  durationMs?: number | null;
  page?: string | null;
  details?: Record<string, unknown> | null;
};

type RequestFacts = {
  ip: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  postalCode: string | null;
  latitude: string | null;
  longitude: string | null;
  timezone: string | null;
  asn: number | null;
  asOrganization: string | null;
  colo: string | null;
  userAgent: string | null;
  deviceType: string;
  os: string;
  browser: string;
};

const text = (value: unknown, max = 500) => typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

/** Rough device, system and browser names from the browser's own description. */
export function describeUserAgent(userAgent: string | null) {
  const ua = userAgent || "";
  const deviceType = /bot|crawl|spider|curl|wget|python|headless/i.test(ua) ? "Bot"
    : /ipad|tablet|(android(?!.*mobile))/i.test(ua) ? "Tablet"
      : /mobile|iphone|ipod|android/i.test(ua) ? "Mobile" : "Desktop";
  const os = /windows nt 10/i.test(ua) ? "Windows 10/11" : /windows/i.test(ua) ? "Windows"
    : /iphone|ipad|ipod/i.test(ua) ? `iOS ${ua.match(/OS (\d+)[_.](\d+)/)?.slice(1, 3).join(".") ?? ""}`.trim()
      : /mac os x/i.test(ua) ? `macOS ${ua.match(/Mac OS X (\d+)[_.](\d+)/)?.slice(1, 3).join(".") ?? ""}`.trim()
        : /android/i.test(ua) ? `Android ${ua.match(/Android (\d+(?:\.\d+)?)/)?.[1] ?? ""}`.trim()
          : /cros/i.test(ua) ? "ChromeOS" : /linux/i.test(ua) ? "Linux" : ua ? "Other" : "Unknown";
  const version = (pattern: RegExp) => ua.match(pattern)?.[1]?.split(".")[0] ?? "";
  const browser = /edg\//i.test(ua) ? `Edge ${version(/Edg\/([\d.]+)/)}`
    : /opr\//i.test(ua) ? `Opera ${version(/OPR\/([\d.]+)/)}`
      : /firefox\//i.test(ua) ? `Firefox ${version(/Firefox\/([\d.]+)/)}`
        : /chrome\//i.test(ua) ? `Chrome ${version(/Chrome\/([\d.]+)/)}`
          : /safari\//i.test(ua) ? `Safari ${version(/Version\/([\d.]+)/)}`
            : ua ? "Other" : "Unknown";
  return { deviceType, os, browser: browser.trim() };
}

/** Where a request came from and on what device, from Cloudflare's request details. */
export function describeRequest(request: Request): RequestFacts {
  const cf = (request as Request & { cf?: Record<string, unknown> }).cf ?? {};
  const userAgent = request.headers.get("user-agent");
  return {
    ip: request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null,
    country: text(cf.country, 8),
    region: text(cf.region, 120),
    city: text(cf.city, 120),
    postalCode: text(cf.postalCode, 20),
    latitude: text(cf.latitude, 20),
    longitude: text(cf.longitude, 20),
    timezone: text(cf.timezone, 60),
    asn: typeof cf.asn === "number" ? cf.asn : null,
    asOrganization: text(cf.asOrganization, 160),
    colo: text(cf.colo, 10),
    userAgent: text(userAgent, 600),
    ...describeUserAgent(userAgent),
  };
}

/** What a request to the app's server means, in plain words. */
export function classifyApiRequest(method: string, path: string, status: number) {
  const outcome = status >= 200 && status < 400 ? "success" : "failure";
  const rules: [RegExp, string, string][] = [
    [/^POST \/api\/auth\/login$/, "auth", "auth.login"],
    [/^POST \/api\/auth\/register$/, "auth", "auth.register"],
    [/^POST \/api\/auth\/logout$/, "auth", "auth.logout"],
    [/^GET \/api\/auth\/me$/, "auth", "auth.check_session"],
    [/^DELETE \/api\/auth\/account$/, "auth", "auth.delete_account"],
    [/^GET \/api\/projects$/, "project", "project.list"],
    [/^POST \/api\/projects$/, "project", "project.create"],
    [/^GET \/api\/projects\/[^/]+$/, "project", "project.open"],
    [/^PUT \/api\/projects\/[^/]+$/, "project", "project.save"],
    [/^DELETE \/api\/projects\/[^/]+$/, "project", "project.delete"],
    [/^GET \/api\/projects\/[^/]+\/versions$/, "project", "project.versions"],
    [/^GET \/api\/projects\/[^/]+\/audit$/, "project", "project.activity_log"],
    [/^POST \/api\/projects\/[^/]+\/restore$/, "project", "project.restore"],
    [/^POST \/api\/projects\/[^/]+\/approvals\/[^/]+$/, "project", "project.approval_decision"],
    [/^GET \/api\/files$/, "file", "file.list"],
    [/^DELETE \/api\/files$/, "file", "file.delete"],
    [/^POST \/api\/files\/upload$/, "file", "file.upload"],
    [/^GET \/api\/files\/download$/, "file", "file.download"],
    [/^GET \/api\/falcon\/customers\/search$/, "lookup", "customer.search"],
    [/^GET \/api\/falcon\/customers\/[^/]+$/, "lookup", "customer.open"],
    [/^GET \/api\/falcon\/leads\/[^/]+$/, "lookup", "lead.open"],
    [/^PUT \/api\/falcon\/leads\/[^/]+$/, "lookup", "lead.save"],
    [/^(GET|PUT|OPTIONS) \/api\/cms\/leads\/[^/]+$/, "integration", "cms.lead_sync"],
  ];
  const key = `${method} ${path.replace(/\/$/, "")}`;
  const match = rules.find(([pattern]) => pattern.test(key));
  const action = match ? `${match[2]}.${outcome}` : `api.${method.toLowerCase()}.${outcome}`;
  return { category: match?.[1] ?? "api", action, outcome } as const;
}

const insertSql = `INSERT INTO audit_events (
  id, ts, ts_ms, received_at, source, category, action, outcome, user_id, user_email, session_id,
  ip, country, region, city, postal_code, latitude, longitude, timezone, asn, as_organization, colo,
  user_agent, device_type, os, browser, method, path, status, duration_ms, page, details_json
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

/** Stores events permanently, each tagged with where and on what device the request came from. */
export async function writeAuditEvents(db: D1Database, request: Request, events: AuditEvent[]) {
  if (!events.length) return;
  const facts = describeRequest(request);
  const now = new Date();
  const statements = events.map((event) => {
    const parsed = event.ts ? Date.parse(event.ts) : Number.NaN;
    // Trust a browser's own clock only within a day of the server's.
    const when = Number.isFinite(parsed) && Math.abs(parsed - now.getTime()) < 86_400_000 ? new Date(parsed) : now;
    const details = event.details ? JSON.stringify(event.details).slice(0, 8000) : null;
    return db.prepare(insertSql).bind(
      crypto.randomUUID(), when.toISOString(), when.getTime(), now.toISOString(),
      event.source, event.category.slice(0, 40), event.action.slice(0, 120), event.outcome ?? "info",
      event.userId ?? null, event.userEmail ?? null, event.sessionId?.slice(0, 80) ?? null,
      facts.ip, facts.country, facts.region, facts.city, facts.postalCode, facts.latitude, facts.longitude,
      facts.timezone, facts.asn, facts.asOrganization, facts.colo,
      facts.userAgent, facts.deviceType, facts.os, facts.browser,
      event.method ?? null, event.path?.slice(0, 400) ?? null, event.status ?? null, event.durationMs ?? null,
      event.page?.slice(0, 400) ?? null, details,
    );
  });
  await db.batch(statements);
}

/** True when this key has gone over `limit` uses in the current window. */
export async function overAuditRateLimit(db: D1Database, key: string, limit: number, windowSeconds: number, weight = 1) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
  await db.prepare(
    `INSERT INTO audit_rate_limits (key_hash, window_start, attempts) VALUES (?, ?, ?)
     ON CONFLICT(key_hash) DO UPDATE SET
       attempts = CASE WHEN audit_rate_limits.window_start = excluded.window_start THEN audit_rate_limits.attempts + excluded.attempts ELSE excluded.attempts END,
       window_start = excluded.window_start`,
  ).bind(hash, windowStart, weight).run();
  const row = await db.prepare("SELECT attempts FROM audit_rate_limits WHERE key_hash = ?").bind(hash).first<{ attempts: number }>();
  return (row?.attempts ?? 0) > limit;
}
