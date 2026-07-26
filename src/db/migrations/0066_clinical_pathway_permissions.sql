-- Migration 0066 - Clinical pathway permissions.
-- Doctors complete effective assessments; assistants may only create/update drafts.

UPDATE roles
SET permissions = '["read_patients","write_findings","write_plans","approve_plans","review_clinical_drafts","sign_clinical_records","manage_consents","write_pathways","review_pathways"]'
WHERE system_key = 'doctor';

UPDATE roles
SET permissions = '["read_patients","write_visits","write_pre_exam_drafts","write_pathways"]'
WHERE system_key = 'assistant';
