CREATE TABLE IF NOT EXISTS wishes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  note TEXT,
  category TEXT NOT NULL DEFAULT '其他',
  target_date TEXT,
  done INTEGER NOT NULL DEFAULT 0,
  done_at TEXT,
  entry_id TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wishes_created ON wishes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wishes_done ON wishes(done);
