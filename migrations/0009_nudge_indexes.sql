CREATE INDEX IF NOT EXISTS idx_nudges_from_created ON nudges(from_user, created_at);
CREATE INDEX IF NOT EXISTS idx_nudges_to_seen ON nudges(to_user, seen_at);
