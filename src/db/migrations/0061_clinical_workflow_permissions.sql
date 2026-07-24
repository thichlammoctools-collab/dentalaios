-- Migration 0061 - Clinical workflow permissions.
-- Grants doctor role the new review/sign/consent permissions, and assistant
-- role the pre-exam draft permission. Additive only; preserves any custom
-- permissions previously added to these roles.

UPDATE roles
SET permissions = '["read_patients","write_findings","write_plans","approve_plans","review_clinical_drafts","sign_clinical_records","manage_consents"]'
WHERE system_key = 'doctor';

UPDATE roles
SET permissions = '["read_patients","write_visits","write_pre_exam_drafts"]'
WHERE system_key = 'assistant';
