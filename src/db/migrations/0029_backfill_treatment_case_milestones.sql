-- Existing operational cases predate milestone tracking. Project each approved
-- plan item into an initial timeline milestone without changing the plan itself.
PRAGMA foreign_keys = ON;

INSERT INTO treatment_case_milestones (
  id, tenant_id, treatment_case_id, treatment_plan_item_id, sort_order, status,
  planned_at, started_at, completed_at, updated_by, created_at, updated_at
)
SELECT
  lower(hex(randomblob(16))),
  tc.tenant_id,
  tc.id,
  item.id,
  ordered.sort_order,
  CASE item.status
    WHEN 'completed' THEN 'completed'
    WHEN 'in_progress' THEN 'in_progress'
    ELSE 'not_started'
  END,
  tc.activated_at,
  CASE WHEN item.status IN ('in_progress', 'completed') THEN tc.activated_at END,
  CASE WHEN item.status = 'completed' THEN tc.activated_at END,
  tc.created_by,
  tc.created_at,
  tc.updated_at
FROM treatment_cases tc
JOIN (
  SELECT id, tenant_id, treatment_plan_id, status,
         ROW_NUMBER() OVER (PARTITION BY tenant_id, treatment_plan_id ORDER BY created_at, id) AS sort_order
  FROM treatment_plan_items
) AS ordered ON ordered.tenant_id = tc.tenant_id AND ordered.treatment_plan_id = tc.treatment_plan_id
JOIN treatment_plan_items item ON item.id = ordered.id AND item.tenant_id = ordered.tenant_id
WHERE NOT EXISTS (
  SELECT 1 FROM treatment_case_milestones milestone
  WHERE milestone.tenant_id = tc.tenant_id
    AND milestone.treatment_case_id = tc.id
    AND milestone.treatment_plan_item_id = item.id
);

INSERT INTO treatment_case_milestone_history (
  id, tenant_id, treatment_case_milestone_id, from_status, to_status, changed_by, changed_at
)
SELECT
  lower(hex(randomblob(16))),
  milestone.tenant_id,
  milestone.id,
  NULL,
  milestone.status,
  milestone.updated_by,
  milestone.created_at
FROM treatment_case_milestones milestone
WHERE NOT EXISTS (
  SELECT 1 FROM treatment_case_milestone_history history
  WHERE history.tenant_id = milestone.tenant_id
    AND history.treatment_case_milestone_id = milestone.id
);
