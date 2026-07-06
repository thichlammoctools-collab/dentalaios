-- Migration 0003 — Rate limit buckets.
--
-- Used by rateLimit() middleware to throttle abusive IPs.
-- Schema: key = "ip:route:bucket", expires_at for cleanup.

CREATE TABLE IF NOT EXISTS rate_limit_buckets (
  key        TEXT PRIMARY KEY,
  count      INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_expires ON rate_limit_buckets(expires_at);