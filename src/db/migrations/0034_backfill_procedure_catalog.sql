-- Backfill the global catalog from all existing tenant-owned procedure values.
-- INSERT OR IGNORE preserves Platform Admin edits and makes the migration safe
-- to run in environments where part of the catalog is already populated.
INSERT OR IGNORE INTO procedure_catalog (code, name, sort_order)
SELECT procedure, procedure, 9000
FROM (
  SELECT DISTINCT trim(procedure) AS procedure
  FROM treatment_services
  WHERE length(trim(procedure)) >= 2

  UNION

  SELECT DISTINCT trim(procedure) AS procedure
  FROM treatment_plan_items
  WHERE length(trim(procedure)) >= 2
)
ORDER BY procedure;
