ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'Coordinator'
CHECK (role IN ('Coordinator', 'Project Manager', 'Estimator', 'Engineering', 'Finance', 'CRO', 'CEO', 'Client'));

CREATE TABLE IF NOT EXISTS project_versions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  name TEXT NOT NULL,
  project_number TEXT NOT NULL DEFAULT '',
  workflow_json TEXT NOT NULL,
  content_hash TEXT NOT NULL CHECK (length(content_hash) = 64),
  hash_algorithm TEXT NOT NULL DEFAULT 'SHA-256' CHECK (hash_algorithm = 'SHA-256'),
  change_kind TEXT NOT NULL CHECK (change_kind IN ('baseline', 'created', 'updated', 'restored', 'approval')),
  restored_from_version_id TEXT,
  created_by_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_project_versions_project_number
ON project_versions(project_id, version_number DESC);

CREATE INDEX IF NOT EXISTS idx_project_versions_owner_created
ON project_versions(owner_user_id, created_at DESC);

-- Audit rows intentionally do not foreign-key project_id. This preserves the
-- deletion event even after a project and its recoverable versions are removed.
CREATE TABLE IF NOT EXISTS project_audit_log (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_role TEXT NOT NULL CHECK (actor_role IN ('Coordinator', 'Project Manager', 'Estimator', 'Engineering', 'Finance', 'CRO', 'CEO', 'Client')),
  action TEXT NOT NULL CHECK (action IN (
    'project.created', 'project.updated', 'project.restored', 'project.deleted',
    'approval.approved', 'approval.rejected'
  )),
  version_id TEXT,
  restored_from_version_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_project_audit_project_created
ON project_audit_log(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_project_audit_owner_created
ON project_audit_log(owner_user_id, created_at DESC);
