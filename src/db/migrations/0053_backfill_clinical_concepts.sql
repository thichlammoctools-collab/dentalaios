-- Deterministic, idempotent terminology backfill for legacy findings.
-- Diagnosis rows are deliberately not created here: an approved ICD-10 artifact
-- and clinical-governance mapping are prerequisites for confirmed diagnoses.

UPDATE clinical_findings
SET concept_id = (
  SELECT concept.id
  FROM clinical_concepts concept
  WHERE concept.category = clinical_findings.category
    AND concept.default_scope = clinical_findings.scope
    AND concept.legacy_condition = clinical_findings.condition
  LIMIT 1
)
WHERE concept_id IS NULL
  AND EXISTS (
    SELECT 1
    FROM clinical_concepts concept
    WHERE concept.category = clinical_findings.category
      AND concept.default_scope = clinical_findings.scope
      AND concept.legacy_condition = clinical_findings.condition
  );
