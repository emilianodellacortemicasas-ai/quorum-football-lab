-- Monthly OddsPapi request counter. November 2026 already used about 165 requests with the old schedule
-- (Lottomatica every 12h, Snai/Sisal/Eurobet every 72h, catalogue): start from that estimate.
INSERT INTO model_state (id,built_at,payload) VALUES ('oddspapi:usage','2026-11-26T08:00:00.000Z','{"month":"2026-11","n":165,"targeted":0,"day":"2026-11-26","today":0}') ON CONFLICT(id) DO NOTHING;
