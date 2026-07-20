# S3 Governance With LarkSuite

## Objective

Provide an opt-in, multi-tenant S3 (Sociocracy 3.0) governance capability for DentalAIOS. Each clinic connects its own internal Lark app. Lark Base becomes the operational source of truth for circles, S3 roles, accountabilities, tensions, proposals, objections, consent decisions, and operational actions. DentalAIOS remains the source of truth for accounts, fixed clinical RBAC, patient/clinical/financial data, and security audit trails.

## Confirmed Decisions

- Launch as a multi-tenant feature, gated per tenant with `s3_lark_enabled`.
- Each tenant supplies credentials for its own Lark internal app; do not introduce a shared multi-tenant OAuth app in this release.
- Onboarding creates a dedicated S3 governance Base from a controlled template. Attaching an existing Base is out of scope.
- DentalAIOS owns user accounts and all fixed RBAC. Map a DentalAIOS user to a verified Lark person ID/email for assignment only.
- S3 role assignments are governance/accountability assignments. They never grant DentalAIOS `system_key` roles or permissions automatically.
- Lark Base/Docs implement S3 consent; Lark Task manages actions; Calendar manages governance/tactical meetings.
- Lark Approval is only a mandatory guardrail, not the normal consent mechanism.
- Mandatory guardrails: patient-data access, security/retention/integration changes, and clinical-safety exceptions. Tenants configure finance thresholds, approvers, and additional guardrails.
- Webhooks update S3 mappings and audit metadata only. They must never update appointments, treatment plans, clinical data, or DentalAIOS RBAC.
- Lark S3 Base, Docs, Tasks, Calendar events, logs, and payloads contain no PII or clinical data: no patient names, phone numbers, patient record IDs, diagnoses, treatment details, detailed appointments, or payment details. Use a generic work classification and a DentalAIOS deep link protected by API RBAC when needed.
- Initial automation: create Base template, map Lark users, create actions as Tasks, create meetings in Calendar, reminders, and receive Task/Approval webhook events. Chat bot creation and Directory synchronization are out of scope.

## Current-System Constraints

- `src/db/migrations/0001_init.sql` defines tenant isolation, `roles`, a single `users.role_id`, audit logs, and `lark_sync_logs`.
- `src/db/migrations/0018_system_roles.sql` and `src/shared/constants/index.ts` make system roles platform-defined. `apps/api/src/services/users.service.ts` only assigns those system roles. Do not overload these records for S3 roles.
- `apps/api/src/lib/lark-client.ts` currently supports tenant access token, Task, and Calendar calls only.
- `apps/api/src/services/lark.service.ts` and `apps/api/src/jobs/lark-retry.ts` provide queue-based Lark work but no generic event webhook or outbox.
- `apps/api/src/routes/clinic.ts` and `lark_configs` already hold encrypted tenant-specific app credentials. Extend this configuration rather than storing unencrypted Lark credentials elsewhere.
- Architecture rule 7 in `apps/api/src/index.ts` says Lark receives operational fields only. This plan narrows it further for S3 governance: no PII or clinical fields.

## Target Responsibilities

| System | Owns | Must not own |
|---|---|---|
| DentalAIOS | tenant, user account, system role/RBAC, patient and clinical data, payments, protected deep links, integration configuration, webhook receipt, mapping IDs, delivery state, audit | Circle/role governance content as an editable duplicate of Base |
| Lark Base | Circle topology, S3 roles, accountabilities, assignments, tensions, proposals, objections, decision log, action metadata | DentalAIOS permissions, patient/clinical/financial records |
| Lark Docs | Governance agenda, meeting minutes, decision rationale, linked evidence without patient data | Clinical notes or attachments |
| Lark Task | Assigned follow-up actions, generic title, due date, status, link to governance decision | Clinical workflow state |
| Lark Calendar | Governance/tactical meeting times and participants | Patient schedules |
| Lark Approval | Required guardrail approval instances and their final state | General S3 consent voting |

## Base Template

Create one private Base per tenant. The app service account and tenant S3 administrators receive the minimum necessary Base access. Do not place it in a shared public folder. Use Base advanced permissions so role holders can access operational tables/views but only tenant S3 administrators can edit schema, workflow, or sensitive configuration.

### Seeded Circles

Create these records at onboarding. Tenant members may change the structure only through the Governance Proposal process.

| Circle | Parent | Purpose |
|---|---|---|
| General Circle | none | Integrate strategy, cross-circle constraints, and organization-wide governance |
| Clinical Care | General Circle | Deliver safe, effective clinical service and quality improvement |
| Patient Experience | General Circle | Improve patient communication and operational service flow without carrying patient records in Lark |
| Business Operations | General Circle | Coordinate finance, people, facilities, and non-clinical operations |
| Digital & Compliance | General Circle | Maintain digital workflows, information security, compliance, and integrations |

### Base Tables

Use a single Base with the following tables. Field names are stable API contracts; user-visible Vietnamese labels may be localized without changing stored identifiers or mapping records.

| Table | Required fields |
|---|---|
| `Circles` | Circle Key (unique), Name, Parent Circle link, Purpose, Domain summary, Status, Lead Link person, Rep Link person, Facilitator person, Secretary person, Review date, Constraints |
| `S3 Roles` | Role Key (unique), Circle link, Name, Purpose, Domain, Accountabilities long text, Decision boundaries, Status, Review date |
| `Role Assignments` | Assignment Key (unique), S3 Role link, DentalAIOS User ID (read-only mapping text), Lark person, Assignment type, Effective from/to, Status |
| `Tensions` | Tension Key, Circle link, Raised by, Type, Description, Priority, Owner role, Status, Related DentalAIOS deep link, Created/closed dates |
| `Governance Proposals` | Proposal Key, Circle link, Source tension, Title, Proposal text, Classification, Guardrail type, Proposer, Status, Meeting link, Effective date, Review date, Decision link |
| `Objections` | Objection Key, Proposal link, Raised by, Harm/risk statement, Evidence, Integration proposal, Status, Resolved by, Resolved date |
| `Decisions` | Decision Key, Proposal link, Circle link, Decision type, Consent result, Decision text, Owner role, Effective/review dates, Lark Doc link, Guardrail approval ID/status, Status |
| `Actions` | Action Key, Decision link, Circle link, Title, Owner role, Assignee, Due date, Status, Lark Task ID/URL, DentalAIOS deep link, Last sync date |
| `Meetings` | Meeting Key, Circle link, Meeting type (governance/tactical/retrospective), Agenda Doc link, Calendar event ID/URL, Facilitator, Secretary, Start/end, Status |
| `Integration Events` | Event Key, Source, External event ID, Object type, Object ID, Received date, Processing status, Error summary, Retry count |

Implementation details:

- Use `link` fields instead of duplicated labels for all Circle, proposal, decision, and action relationships.
- Use person fields only after a DentalAIOS-to-Lark identity mapping exists. Until then, use an onboarding exception queue instead of free-text names.
- `Related DentalAIOS deep link` is optional and contains only a signed/resource-scoped URL, never an identifier or summary in adjacent text. The API validates current JWT and RBAC on every request.
- Lark Base automation may notify assignees and create views, but it may not call DentalAIOS clinical endpoints.
- Create views: `My Actions`, `Open Tensions`, `Governance Queue`, `Awaiting Objection Resolution`, `Guardrail Pending`, `Circle Health`, and `Overdue Reviews`.

## Consent and Guardrail Workflow

### Standard S3 governance change

1. A role holder records a tension in `Tensions`.
2. The relevant Circle owner triages it as operational, governance, cross-circle, or guardrail.
3. A governance change becomes a `Governance Proposal` with a linked Circle, source tension, bounded proposal, effective date, and review date.
4. During the governance meeting, the facilitator runs: presentation, clarifying questions, reaction round, amendment, objection round, integration, and consent confirmation.
5. An objection is valid only when it identifies concrete harm to the Circle purpose or a role's ability to fulfil its accountability. Preference or disagreement is not an objection.
6. Secretary records each objection and its integration in `Objections`; then records the final consent decision in `Decisions` and links the minutes Doc.
7. Decision actions are created in `Actions`; DentalAIOS creates linked Lark Tasks through the Queue. Task status is mirrored only to the action metadata.
8. At review date, the Circle either renews, amends, or retires the decision.

### Guardrail path

1. Classify a proposal with one or more guardrail categories.
2. The platform always requires Lark Approval before activation for: access to patient data, security/retention/integration changes, and clinical-safety exceptions.
3. Tenant configuration adds finance threshold rules, approver routes, and optional guardrails. A tenant cannot disable mandatory categories.
4. `Decision.Status` remains `awaiting_guardrail` after S3 consent until the Approval instance reports approved.
5. A rejected, canceled, expired, or unverifiable Approval leaves the decision inactive and creates an escalation Action; no automatic fallback approval is allowed.
6. Approval webhook delivery records the external instance/task IDs, verified final status, timestamp, and event ID. It never changes DentalAIOS permissions or operational clinical records.

## Tenant Onboarding and Configuration

### Configuration extensions

Add an S3-specific configuration record, separate from the basic `lark_configs` credentials record. It must contain at least:

- `tenant_id` unique key and `enabled` state.
- onboarding state: `not_configured`, `credentials_valid`, `webhook_verified`, `base_created`, `ready`, `disabled`, `error`.
- Base token, Base URL, table IDs, default Calendar ID, Task list/section IDs when created.
- Lark webhook verification token and encrypt key, encrypted at rest using the same secret utility as `lark_configs`.
- mandatory guardrail policy version and tenant-configured finance/additional guardrail JSON.
- template version, created/updated timestamps, last health-check timestamp, last error code/category.

Create a separate identity mapping table:

- one row per `tenant_id + dentalaios_user_id + lark_open_id`.
- verified Lark person identifier, verified work email hash/display metadata as needed, mapping status, verification method, timestamps, revocation fields.
- unique constraints preventing one active Lark person mapping to multiple active DentalAIOS users in the same tenant without explicit administrator resolution.

Create a mapping/event table instead of extending `lark_sync_logs` beyond its simple existing purpose:

- external object type: Base record, Task, Calendar event, Approval instance/task.
- local S3 object key and Lark object ID.
- source version/update timestamp, last synchronization status, idempotency key, retry/error metadata.
- inbound event id plus unique `(tenant_id, lark_event_id)` deduplication.

### Onboarding API and UI

Extend `ClinicSettingsPage.tsx` or add a dedicated organization-governance settings page visible only to `MANAGE_USERS` plus a new narrowly scoped `MANAGE_GOVERNANCE_INTEGRATION` permission. Do not use `all` as a default access boundary for this feature.

The onboarding wizard must:

1. Explain the strict data policy and require administrator acknowledgment.
2. Accept tenant internal-app credentials and Base/Task/Calendar/webhook configuration only over authenticated API; never expose secrets after submission.
3. Test Lark authentication and required API scopes before saving ready state.
4. Register and verify the webhook endpoint/challenge using a tenant-specific configuration. Validate verification token/signature and decrypt payloads before any event handling.
5. Display missing scopes/configuration requirements without logging credentials or raw payloads.
6. Create the dedicated Base from the versioned template and store returned Base/table IDs.
7. Seed the five circles, default roles (Lead Link, Rep Link, Facilitator, Secretary) as S3 definitions, views, and governance templates.
8. Invite/map initial S3 administrators and verify Lark identity mappings before creating person-based assignments.
9. Configure the minimum guardrail policies and require tenant finance threshold/approvers if finance guardrails are enabled.
10. Run a health check: create one synthetic governance action/task and one test calendar event, verify callback/mapping, then remove or close the test artifacts.
11. Enable the tenant only after all required steps pass. Failed onboarding remains resumable and idempotent.

Disable behavior:

- Set `s3_lark_enabled` false, stop new outbound writes and scheduled reminders, reject new S3 automation calls, preserve audit/mapping/config metadata, and leave Lark Base unchanged.
- Do not hard-delete a tenant Base or Lark artifacts from an in-product disable operation.
- Credential rotation must revalidate scopes and webhook settings before returning to `ready`.

## API, Worker, and Data Design

### New database migrations

Create new, additive D1 migrations for:

- `tenant_governance_lark_configs` as described above.
- `lark_user_mappings`.
- `lark_governance_mappings` / `lark_governance_events` with per-tenant event deduplication.
- `tenant_governance_settings` only if generic `tenant_settings` is not appropriate for the structured policy data.
- indexes on tenant/status, Lark object IDs, external event IDs, due/retry fields.

Do not change existing `users.role_id`, `roles.system_key`, or clinical table schemas to represent S3 roles.

### Backend modules

Add focused modules rather than expanding the existing handover service:

- `services/lark-governance-onboarding.service.ts`: state machine, capability checks, Base template provisioning, seeding, health check.
- `services/lark-governance-sync.service.ts`: idempotent outbound Base/Task/Calendar operations and mapping updates.
- `services/lark-governance-webhook.service.ts`: challenge, request signature/token verification, decrypt payload, dedupe, allowlisted event dispatch.
- `services/lark-identity-link.service.ts`: map and revoke user-to-Lark identities.
- `repositories/lark-governance*.repo.ts`: tenant-scoped configuration, mapping, and event persistence.
- `lib/lark-governance-client.ts`: Base, Task, Calendar, Approval APIs with token retrieval shared safely from `lark-client.ts` or a dedicated tenant-auth module.
- `routes/governance-lark.ts`: settings, onboarding progress/retry, identity link, guardrail policy, and read-only integration health endpoints.
- `routes/lark-webhooks.ts`: public, unauthenticated only at transport level; it must perform Lark verification before route dispatch and must never accept user JWT authorization as a substitute.
- extend `jobs/lark-retry.ts` or replace it with a typed integration queue dispatcher for governance provisioning, outbound task/calendar sync, reminder work, and retry. Preserve existing message behavior.

### Required Lark app capabilities

Document exact current Lark scopes and event subscriptions from official API schema before implementation. At minimum validate capability for:

- tenant access token.
- Base create/configure/read/write and advanced permission setup, subject to APIs actually available to the tenant internal app.
- Task create/update/read and task event subscription.
- Calendar create/update/delete and calendar event handling for governance meetings.
- Approval status event subscription and read access for guardrail instances. Approval definition creation/launch must use the tenant's supported Lark configuration path; do not assume all internal apps can programmatically create definitions.
- user identity resolution required for mapping. If internal app APIs cannot safely resolve user by email, use an admin-mediated account-link flow.
- event webhook verification, encryption/decryption, and tenant routing.

If a required Lark resource cannot be provisioned by API for tenant internal apps, make it an explicit onboarding manual step with an admin-provided resource ID and a health check; do not silently substitute another resource type.

### Queue and webhook reliability

- Every outbound command uses an idempotency/mapping key derived from tenant, local S3 object, operation, and source version.
- Persist intent/mapping before queueing; workers update success/failure transactionally where D1 allows.
- Queue retry only transient errors, with a bounded retry count and dead-letter monitoring. Permanent scope/validation errors mark onboarding or operation `error` and surface remediation to the tenant administrator.
- Verify webhook signature/token and decrypt payload before parsing event data.
- Deduplicate events by Lark event ID per tenant. Persist first receipt before side effects.
- Make handlers replay-safe and restrict dispatch to Task completion/assignment, Approval final state, and configured Calendar events. Ignore unsupported events with an audit entry.
- Never log Authorization headers, secrets, decrypted webhook payloads, PII, or clinical references.

### Frontend changes

- Add a Governance/Lark integration settings screen, onboarding wizard, integration health/status, identity-link management, guardrail policy configuration, and read-only Base/Calendar links.
- Use clear separation in wording: `Quyền hệ thống DentalAIOS` versus `Vai trò S3`. The UI must state that assigning an S3 role does not grant patient-data access.
- Add an S3 deep-link panel to relevant non-clinical operating screens only after explicit tenant enablement. Links open the tenant's Base views or governance Docs; never embed a Base with patient context.
- Do not expose Lark app secrets, webhook verification values, raw Approval payloads, or Lark user IDs unnecessarily in the browser.

## Delivery Sequence

1. Define the S3 operating constitution, mandatory guardrail policy, Base field contract, event allowlist, data classification, and template versioning. Get security/compliance sign-off on the no-PII policy.
2. Validate the tenant internal Lark app API surface and scopes against Lark documentation/sandbox before coding assumptions about Base provisioning, Approval launch, person mapping, or event subscription.
3. Implement additive schema/repositories and server-side encrypted governance configuration. Add tenant feature flag and onboarding state machine.
4. Build the Lark governance client and template provisioner. Make creation retryable/idempotent; record all generated resource IDs.
5. Build protected configuration/onboarding/identity APIs and the web settings wizard. Enforce tenant scope and distinct governance-integration permission.
6. Build outbound Task/Calendar synchronization and action mapping via Cloudflare Queue. Use generic action labels and protected deep links only.
7. Build verified webhook ingestion, event deduplication, Task/Approval metadata handlers, and integration health diagnostics.
8. Configure/validate mandatory guardrail Approval routes. Provide tenant controls only for finance thresholds, approvers, and additional policies.
9. Add end-to-end audit coverage and dashboards for onboarding health, failed delivery, stale mappings, overdue decision reviews, and pending guardrails.
10. Run an opt-in pilot with non-clinical governance work. Review Base schema/template, guardrail rules, meeting facilitation, and error telemetry before tenant-wide enablement.
11. Expand availability by allowing each tenant administrator to opt in after passing onboarding health checks. Keep chat bot, Directory sync, existing Base import, and automatic S3-to-RBAC mapping out of scope.

## Training and Operating Adoption

### Roles to train

| Audience | Required training |
|---|---|
| Tenant administrators | Internal Lark app setup, scope/webhook requirements, Base access, onboarding recovery, credential rotation, disabling integration |
| General Circle and Lead Links | S3 purpose/domain/accountability design, delegation boundaries, cross-circle agreements, guardrail escalation |
| Facilitators and Secretaries | Governance meeting flow, valid objection test, integration, decision logging, review cadence, Base maintenance without schema drift |
| Role holders | Tension capture, operational versus governance distinction, action ownership, consent behavior, no-PII policy |
| Clinical/compliance/security owners | Mandatory guardrails, Approval routes, exceptions, audit review, prohibited automatic RBAC/clinical updates |
| Technical support | Tenant isolation, secret handling, queue/webhook failure recovery, audit and incident response |

### Learning path

1. Orientation: distinction between S3 governance and DentalAIOS clinical RBAC; explain the data boundary.
2. Workshop: map actual work into the four seeded circles; create/assign the first S3 roles and accountabilities.
3. Simulation: run tension-to-consent, including an invalid preference objection and a valid risk objection.
4. Guardrail simulation: consent a data-access or clinical-safety proposal, then follow its Approval branch while proving it cannot self-activate.
5. Tactical practice: create actions, assign Lark Tasks, complete tasks, and review webhook metadata without changing clinical state.
6. Facilitated live governance sessions: operate with a coach until Circles reliably record decisions and review dates.
7. Monthly review: examine Circle health, action cycle time, decision review compliance, rejected guardrails, data-policy incidents, and integration errors.

## Validation Plan

### Automated tests

- Migration tests: unique tenant config, mapping constraints, tenant isolation, disabled behavior, and no modifications to existing RBAC semantics.
- Repository/service tests: encryption/decryption, state-machine transitions, template mapping persistence, source version idempotency, retry classification, and policy validation.
- Route tests: auth/permission checks, tenant boundaries, secret redaction, onboarding resume/disable, identity-link revocation, policy restrictions, and integration health responses.
- Lark client tests: tenant token cache isolation, scope/error normalization, outgoing payload data classification, and no PII fields in Base/Task/Calendar payloads.
- Webhook tests: challenge response, invalid signature/token/encryption rejection, duplicate event handling, unknown-event ignore, Task metadata update, Approval final-state update, and proof that webhook code cannot mutate appointment/treatment/RBAC data.
- Queue tests: exactly-once effect under duplicate delivery, transient retry, permanent failure escalation, DLQ behavior, and resource mapping updates.
- Frontend tests: S3 versus system-role labeling, onboarding failure/resume, restricted controls, and secret fields never rendered after save.

### Integration and acceptance checks

- Use a dedicated sandbox tenant and separate Lark workspace/internal app.
- Provision Base, inspect all table IDs/schema/permissions, and confirm only expected users and app identity can access it.
- Create a tension through a full consent cycle; verify decision log, minutes Doc link, Task creation, Calendar event, webhook event, and mapping/audit records.
- Exercise every mandatory guardrail: consent does not activate a decision until valid Lark Approval arrives; rejection keeps it inactive.
- Attempt cross-tenant mapping, tampered webhook, duplicate webhook, expired credential, missing Lark scope, task completion replay, and a deep-link request without RBAC. All must fail safely and be auditable.
- Verify Base/Task/Calendar/Approval payload capture contains no PII, patient IDs, clinical data, detailed appointment information, or payment details.
- Verify disabling a tenant stops new automation without deleting Base or historical audit/mapping data.

## Operational Metrics

- Onboarding completion/failure rate by Lark capability.
- Integration health: expired credentials, missing scope, webhook failures, queue retries/DLQ, stale mappings.
- S3 adoption: open tensions, time to decision, decisions past review date, actions overdue, active circle/role coverage.
- Guardrail outcomes: pending duration, approval/rejection/error rates by category, blocked activations.
- Security: invalid/duplicate webhook count, cross-tenant access attempts, data-policy violation count, sensitive-data payload scan results.

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| Lark tenant internal app cannot provision a required resource or launch Approval by API | Validate capability before implementation; make the resource a verified manual onboarding prerequisite instead of silently degrading behavior |
| Base schema is edited manually and breaks mappings | Store template/schema version and table/field IDs; validate health regularly; restrict schema permissions; require controlled migration steps |
| S3 role assignment is mistaken for clinical access | Separate tables, names, UI, APIs, and audit; prohibit any direct role-to-permission synchronization |
| Lark receives sensitive patient data | Centralize payload builders, schema allowlists, tests and observability scans; no free-form clinical text accepted in governance sync |
| Duplicate/out-of-order webhooks create inconsistent state | Event ID dedupe, idempotent operation keys, source timestamps, replay-safe handlers |
| Tenant disables mandatory approvals | Enforce platform policy server-side; permit only financial parameters and additional restrictions |
| Existing Lark integration leaks secrets/logs or lacks capabilities | Preserve encrypted secret storage; redact logs; separate governance client/config from current handover integration |
| Adoption fails because governance becomes overhead | Start with the seeded circles, concise templates, facilitated sessions, decision review dates, and operational dashboards |

## Out of Scope

- Replacing DentalAIOS authentication, clinical RBAC, patient records, appointments, treatment plans, payment workflows, or audit logging with Lark.
- Syncing Lark Directory into DentalAIOS users.
- Automatically granting DentalAIOS permissions from a Base role assignment.
- Importing/merging an arbitrary existing Base.
- Chat bot-based governance, full workflow automation beyond baseline reminders, or provisioning Lark Approval definitions where Lark does not expose a supported API.
- Storing any PII or clinical data in Lark governance artifacts.
