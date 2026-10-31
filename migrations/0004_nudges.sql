CREATE TABLE IF NOT EXISTS nudges (
  id TEXT PRIMARY KEY,
  from_user TEXT NOT NULL,
  to_user TEXT NOT NULL,
  created_at TEXT NOT NULL,
  seen_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_nudges_to ON nudges(to_user, seen_at);
CREATE INDEX IF NOT EXISTS idx_nudges_from ON nudges(from_user, created_at);
