-- A case completed before milestone tracking represents completion of every
-- plan item at the case level. Reflect that historical fact in its timeline.
PRAGMA foreign_keys = ON;

UPDATE treatment_case_milestones
SET
  status = 'completed',
  started_at = COALESCE(started_at, (
    SELECT treatment_cases.activated_at FROM treatment_cases
    WHERE treatment_cases.id = treatment_case_milestones.treatment_case_id
      AND treatment_cases.tenant_id = treatment_case_milestones.tenant_id
  )),
  completed_at = COALESCE(completed_at, (
    SELECT treatment_cases.completed_at FROM treatment_cases
    WHERE treatment_cases.id = treatment_case_milestones.treatment_case_id
      AND treatment_cases.tenant_id = treatment_case_milestones.tenant_id
  )),
  updated_at = COALESCE((
    SELECT treatment_cases.completed_at FROM treatment_cases
    WHERE treatment_cases.id = treatment_case_milestones.treatment_case_id
      AND treatment_cases.tenant_id = treatment_case_milestones.tenant_id
  ), updated_at)
WHERE status NOT IN ('completed', 'skipped')
  AND EXISTS (
    SELECT 1 FROM treatment_cases
    WHERE treatment_cases.id = treatment_case_milestones.treatment_case_id
      AND treatment_cases.tenant_id = treatment_case_milestones.tenant_id
      AND treatment_cases.status = 'completed'
  );

INSERT INTO treatment_case_milestone_history (
  id, tenant_id, treatment_case_milestone_id, from_status, to_status, reason, changed_by, changed_at
)
SELECT
  lower(hex(randomblob(16))),
  milestone.tenant_id,
  milestone.id,
  NULL,
  'completed',
  'Backfill từ ca điều trị đã hoàn tất trước khi theo dõi milestone.',
  treatment_case.created_by,
  COALESCE(treatment_case.completed_at, milestone.updated_at)
FROM treatment_case_milestones milestone
JOIN treatment_cases treatment_case
  ON treatment_case.id = milestone.treatment_case_id
 AND treatment_case.tenant_id = milestone.tenant_id
WHERE treatment_case.status = 'completed'
  AND NOT EXISTS (
    SELECT 1 FROM treatment_case_milestone_history history
    WHERE history.tenant_id = milestone.tenant_id
      AND history.treatment_case_milestone_id = milestone.id
        AND history.to_status = 'completed'
  );
