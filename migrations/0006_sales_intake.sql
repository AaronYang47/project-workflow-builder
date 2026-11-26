-- Sales intake site (/sales): access codes, Sales accounts, Sales drafts and
-- project templates. Only new tables; nothing existing changes.

-- Codes the team issues. A Sales account that enters one sees the issuing
-- account's project names. Only a hash is stored; the code is shown once.
CREATE TABLE IF NOT EXISTS sales_access_codes (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL UNIQUE,
  code_hint TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sales_access_codes_owner
ON sales_access_codes(owner_user_id, created_at DESC);

-- Accounts created on the Sales site. They may use only the Sales API.
CREATE TABLE IF NOT EXISTS sales_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  access_code_id TEXT REFERENCES sales_access_codes(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  linked_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sales_accounts_code ON sales_accounts(access_code_id);

-- What Sales typed before Submit. Projects change only on Submit.
CREATE TABLE IF NOT EXISTS sales_drafts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  draft_key TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  draft_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, draft_key)
);

-- Projects saved as templates. The one marked sales_default is used when
-- Sales create a new project.
CREATE TABLE IF NOT EXISTS project_templates (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  workflow_json TEXT NOT NULL,
  sales_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_templates_user
ON project_templates(user_id, updated_at DESC);
