CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  region TEXT NOT NULL,
  instance_type TEXT NOT NULL,
  observed_at INTEGER NOT NULL,
  price REAL NOT NULL,
  bandwidth_mbps REAL,
  vram_gb REAL,
  capacity_score REAL NOT NULL,
  preempted INTEGER NOT NULL CHECK (preempted IN (0, 1)),
  dirty_flags TEXT NOT NULL DEFAULT '[]'
);

CREATE INDEX IF NOT EXISTS idx_observation_series
ON observations(provider, region, instance_type, observed_at DESC);
