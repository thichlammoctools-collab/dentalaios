-- Aggregate AI runtime telemetry. No prompt, response, patient, tenant, or error text is stored.
CREATE TABLE IF NOT EXISTS ai_model_metrics (
  metric_date TEXT NOT NULL,
  use_case TEXT NOT NULL,
  model_id TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  successes INTEGER NOT NULL DEFAULT 0,
  failures INTEGER NOT NULL DEFAULT 0,
  fallback_uses INTEGER NOT NULL DEFAULT 0,
  total_latency_ms INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (metric_date, use_case, model_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_model_metrics_use_case_date
  ON ai_model_metrics(use_case, metric_date DESC);
