-- Permanent activity record for project-workflow-builder. Rows are only ever
-- inserted: nothing in the app or the audit console updates or deletes them.
CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  ts TEXT NOT NULL,                -- ISO 8601 time the event happened (UTC)
  ts_ms INTEGER NOT NULL,          -- same moment in milliseconds, for sorting and ranges
  received_at TEXT NOT NULL,       -- when the server stored it
  source TEXT NOT NULL,            -- server | client | console
  category TEXT NOT NULL,          -- auth, project, file, lookup, page, click, edit, export, session, error, ...
  action TEXT NOT NULL,            -- e.g. auth.login.success, ui.click, session.heartbeat
  outcome TEXT,                    -- success | failure | info
  user_id TEXT,
  user_email TEXT,
  session_id TEXT,                 -- browser visit id (client events)
  ip TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  postal_code TEXT,
  latitude TEXT,
  longitude TEXT,
  timezone TEXT,
  asn INTEGER,
  as_organization TEXT,
  colo TEXT,                       -- Cloudflare data centre that served the request
  user_agent TEXT,
  device_type TEXT,                -- Desktop | Mobile | Tablet | Bot
  os TEXT,
  browser TEXT,
  method TEXT,
  path TEXT,
  status INTEGER,
  duration_ms INTEGER,
  page TEXT,                       -- page the user was on (client events)
  details_json TEXT                -- anything else, as JSON
);

CREATE INDEX IF NOT EXISTS idx_audit_events_ts ON audit_events(ts_ms DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_user ON audit_events(user_email, ts_ms DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_ip ON audit_events(ip, ts_ms DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON audit_events(action, ts_ms DESC);
CREATE INDEX IF NOT EXISTS idx_audit_events_session ON audit_events(session_id, ts_ms);

-- Counters that cap how fast one address may send events or try the console password.
CREATE TABLE IF NOT EXISTS audit_rate_limits (
  key_hash TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL
);
