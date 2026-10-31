CREATE TABLE IF NOT EXISTS couple_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  together_since TEXT NOT NULL,
  next_meeting TEXT,
  city_a_name TEXT NOT NULL,
  city_a_lat REAL NOT NULL,
  city_a_lon REAL NOT NULL,
  city_b_name TEXT NOT NULL,
  city_b_lat REAL NOT NULL,
  city_b_lon REAL NOT NULL,
  birthday_a TEXT,
  birthday_b TEXT,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO couple_settings (
  id, together_since, next_meeting,
  city_a_name, city_a_lat, city_a_lon,
  city_b_name, city_b_lat, city_b_lon,
  birthday_a, birthday_b, updated_at
) VALUES (
  1, '2020-01-01', NULL,
  '北京', 39.9042, 116.4074,
  '上海', 31.2304, 121.4737,
  NULL, NULL, '2026-01-01T00:00:00.000Z'
);
