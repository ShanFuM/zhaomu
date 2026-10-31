UPDATE letters
SET unlock_at = '2020-01-01T00:00:00.000Z', read_at = NULL
WHERE body LIKE '下雨的时候%';
