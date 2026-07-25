# Unified Diagnosis Catalog Plan

## Goal

Make the diagnosis workflow use one doctor-facing catalog: the doctor selects a clinical diagnosis only. ICD-10 remains managed as the catalog's approved primary mapping and is automatically copied into confirmed diagnosis snapshots.

## Decisions

- Reuse the existing platform `Thuật ngữ lâm sàng` page for mapping administration.
- Keep one `primary` ICD-10 mapping per approved diagnosis concept/version. Alternative mappings are not exposed in the doctor workflow.
- A diagnosis without a primary mapping can be saved as `Nghi ngờ`, but cannot be confirmed.
- Do not remove existing ICD-10 columns, snapshots, terminology versions, mappings, or historical diagnosis records. They remain necessary for audit, reporting, and immutable clinical history.
- New doctor-created or updated diagnoses use the catalog primary mapping automatically; no ICD-10 selector is shown in the visit form.

## Implementation Steps

1. Update the shared/API diagnosis contract and service resolution path.
   - Treat the catalog's active primary mapping as the source of truth when creating or confirming a diagnosis.
   - Validate that a confirmed diagnosis has an approved primary mapping and retain the existing validation error when it does not.
   - Preserve snapshotting of code, Vietnamese display, terminology version, mapping id, and mapping role.
   - Prevent a new doctor workflow from selecting an alternative mapping; retain read compatibility for historical records and explicitly supported non-doctor callers only if current tests/workflows require it.
   - Add focused service tests for: primary mapping auto-selection, suspected diagnosis without mapping, confirmed diagnosis without mapping rejection, and primary mapping snapshot persistence.

2. Simplify `apps/web/src/components/ClinicalDiagnosesCard.tsx`.
   - Remove the ICD-10 request state, ICD-10 dropdown, and ICD-10 selection from the form.
   - Keep concept selection, status, source finding, evidence, notes, and edit/change-reason behavior.
   - Show a short inline status near the selected diagnosis indicating whether the catalog has an ICD-10 mapping, without exposing a second diagnosis choice.
   - Keep the current rule that `confirmed` requires a mapped ICD-10; make the error explain that an administrator must complete the catalog mapping.
   - Stop loading `/api/clinical-terminology/icd10` from this component if it is no longer needed by any remaining control.

3. Improve the existing platform terminology mapping workflow.
   - On `apps/web/src/pages/platform/PlatformClinicalTerminologyPage.tsx`, present the diagnosis catalog with its current primary ICD-10 mapping beside each diagnosis.
   - Make the mapping action explicitly “Gắn ICD-10 chính” and remove the alternative-role choice from the administrator path.
   - Reuse the existing approved ICD-10 list and mapping endpoint; do not create a parallel catalog or route.
   - Display an actionable “Chưa gắn mã” state so administrators can complete missing mappings before doctors confirm diagnoses.
   - Keep platform permission and audit behavior unchanged.

4. Verify data readiness and migration needs.
   - Add a read-only readiness query or admin summary for active diagnosis concepts without an approved primary mapping.
   - Do not invent ICD-10 codes automatically. Existing unmapped concepts require administrator mapping from the approved ICD-10 catalog.
   - If current production data contains duplicate/alternative active mappings, resolve them through the existing primary uniqueness rule and an explicit data migration only after inspecting actual rows; never overwrite historical diagnosis snapshots.

5. Update tests and validation.
   - Update component/API tests that currently assume the doctor selects `icd10_code_id`.
   - Run web and API typechecks, focused diagnosis/visit route tests, and the terminology/platform tests.
   - Review the final diff to confirm no clinical history columns or unrelated terminology behavior were removed.

## Affected Boundaries

- Frontend: diagnosis entry form and platform terminology administration.
- API/service: diagnosis mapping resolution and confirmation validation.
- Database: likely no schema change; possible data-only migration for existing invalid/duplicate active mappings after inspection.
- Historical data: preserved through existing snapshots and revision records.

## Risks

- Some AI or legacy callers may still send `icd10_code_id`; the implementation must identify those callers before tightening the service contract.
- A confirmed diagnosis can remain blocked until administrators map every active diagnosis concept used by clinicians.
- Removing the ICD-10 API request from the form must not remove ICD-10 display data needed by existing diagnosis cards or reports.
