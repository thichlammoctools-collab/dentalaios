-- Snapshot each service's estimated treatment time on plan items.
ALTER TABLE treatment_services
  ADD COLUMN estimated_duration_min INTEGER NOT NULL DEFAULT 30
  CHECK (estimated_duration_min BETWEEN 1 AND 480);

ALTER TABLE treatment_plan_items
  ADD COLUMN estimated_duration_min INTEGER NOT NULL DEFAULT 30
  CHECK (estimated_duration_min BETWEEN 1 AND 480);
