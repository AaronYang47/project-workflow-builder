-- Preserve existing legacy access without transferring it when accounts change.
-- Deliberately no cascading foreign key: an owner deletion cannot reassign files.
CREATE TABLE IF NOT EXISTS legacy_file_owner (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  user_id TEXT NOT NULL
);

INSERT OR IGNORE INTO legacy_file_owner (singleton, user_id)
SELECT 1, id FROM users ORDER BY created_at ASC, id ASC LIMIT 1;
