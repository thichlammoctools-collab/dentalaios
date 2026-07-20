# S3 Governance With LarkSuite

## Goal

Deliver an opt-in, multi-tenant S3 (Sociocracy 3.0) governance feature for DentalAIOS, with each clinic using its own Lark internal app.

- Lark Base is the source of truth for S3 circles, S3 roles, accountabilities, tensions, proposals, objections, decisions, actions, and meetings.
- DentalAIOS remains the source of truth for tenants, branches, user accounts, system RBAC, patient/clinical/payment data, integration secrets, delivery state, and audit.
- This is a governance layer. It must not make Lark a second clinical system or allow S3 role assignments to grant access to DentalAIOS.

## Fixed Decisions

- Release S3 as tenant opt-in behind `s3_lark_enabled`; do not enable it by default.
- Each tenant configures credentials for its own Lark internal app. Shared multi-tenant OAuth is out of scope.
- Onboarding creates one dedicated governance Base from a controlled template. Importing or attaching an existing Base is out of scope.
- DentalAIOS user accounts remain authoritative. A user self-links to Lark through OAuth only to verify their `open_id` for assignment; Lark is not a DentalAIOS login provider and Directory sync is out of scope.
- Lark Base access is granted manually by the tenant Lark administrator. DentalAIOS shows mapping/access-health warnings but does not automatically change Base membership or advanced permissions.
- S3 roles are distinct from existing system roles in `roles.system_key`; no automatic S3-to-RBAC mapping is permitted.
- S3 consent is recorded in Base and meeting minutes. Lark Approval is a guardrail only, never the normal consent mechanism.
- Mandatory Approval categories: patient-data access, clinical-safety exceptions, and security/retention/integration changes. Tenants may configure finance thresholds, approvers, and stricter extra guardrails; they cannot disable the mandatory categories.
- An S3 decision marked `active` means consent plus all mandatory guardrails are verified. It does not automatically change DentalAIOS configuration, records, or permissions. It must have execution actions.
- Lark webhook events update integration metadata only. They must never alter patient records, appointments, treatment plans, payment records, or permissions.
- S3 Lark artifacts contain no PII or clinical data: no patient name, phone, email, record ID, diagnosis, treatment detail, detailed appointment, payment detail, or clinical file. Do not create clinical deep links. Staff find clinical context from DentalAIOS under normal RBAC.
- Apply three-layer data protection: mandatory policy/training, payload validation for Console writes, and periodic audit/remediation. Do not claim complete DLP for direct edits in Lark Base/Docs.
- Initial automation is limited to Base provisioning, identity linking, Task creation/synchronization from S3 Console, Calendar event creation, reminders, and Task/Approval webhooks. No polling Base, chat bot, Directory sync, automatic Base permission changes, automatic Calendar invitations, or automatic Doc provisioning.

## Existing Boundaries To Preserve

- `src/db/migrations/0001_init.sql` defines tenant isolation, users, a single `users.role_id`, roles, audit logs, and `lark_sync_logs`.
- `src/db/migrations/0018_system_roles.sql`, `src/shared/constants/index.ts`, and `apps/api/src/services/users.service.ts` enforce platform-owned system roles. Do not reuse these tables for dynamic S3 roles.
- `apps/api/src/lib/lark-client.ts` currently supports tenant access token, Task creation, and Calendar events only.
- `apps/api/src/services/lark.service.ts` and `apps/api/src/jobs/lark-retry.ts` are legacy handover/notification flows. Keep S3 clients, payload builders, mapping, and retries separate.
- Existing treatment-plan Lark handover currently contains patient name and phone. It is legacy functionality outside this S3 scope; create a follow-up security decision to migrate it to metadata-only. Do not silently change this production behavior during the S3 delivery.
- Current `manager` has `all` permissions. This conflicts with least-privilege S3 integration controls and requires a separate RBAC hardening release before S3 rollout.
- Current branch deletion is hard delete. This conflicts with retained S3 branch scope and requires branch archival before branch-scoped S3 rollout.

## Workstream 0: Platform Hardening Release

Deliver and stabilize this work independently from S3; it affects every tenant whether or not it enables Lark.

### 0.1 Make manager permissions explicit

1. Add the permissions:
   - `view_governance`
   - `manage_governance`
   - `manage_governance_integration`
   - split existing user administration into non-sensitive user administration and RBAC/access administration as required by route changes.
2. Change the system-role catalog so only `admin` has `all`.
3. Replace `manager`'s current `['all']` with an explicit least-privilege set.
4. Preserve routine manager operations: management dashboard, patient read access, appointments/schedules, payments, chairs/rooms, and governance console operations.
5. Do not grant managers by default: integration secrets, webhook/guardrail configuration, clinical write/plan approval, or direct permission escalation.
6. Refactor existing `MANAGE_USERS` route behavior so creating a user or expanding a user's patient-data access cannot bypass access-request guardrails. Retaining/deactivating users and permitted branch administration may use the non-sensitive administration permission.
7. Add `auth_version` or `permissions_version` to users/role assignments. Include it in JWTs and compare it in middleware against D1 or a safe bounded cache. Increment it whenever permissions/role assignment are changed so existing tokens lose old privileges on the next request.
8. Add migration/backfill and regression coverage for every affected system role and route. Publish release notes before enabling the new model.

### 0.2 Archive branches instead of hard deleting them

1. Add `is_active`/archival metadata to `branches`; preserve historical records.
2. Replace destructive branch deletion with archive/deactivation behavior.
3. Block archival or require explicit resolution when a branch still has active users, patients, appointments, or active S3 decisions/actions.
4. Preserve historic branch scope in Lark Base; archived branches remain linkable for historical decisions but are unavailable for new scope selection.
5. Add tests for scope preservation, tenant isolation, blocked archival, and existing branch APIs.

Use a separate feature flag such as `branch_archival_enabled` during migration. Do not couple the rollout to tenant S3 activation.

## Workstream 1: S3 Data Contract And Tenant Configuration

### 1.1 Add tenant-scoped integration data

Create additive migrations and repositories. Do not alter `users.role_id`, `roles.system_key`, or clinical tables for S3 purposes.

1. `tenant_governance_lark_configs`:
   - unique `tenant_id`, `enabled`, `s3_lark_enabled`/feature state.
   - onboarding state: `not_configured`, `credentials_valid`, `webhook_verified`, `base_created`, `ready`, `degraded`, `disabled`, `error`.
   - Base token/URL, template version, Base table IDs, governance Calendar ID, Task list/section ID if used.
   - random `webhook_endpoint_id`; do not put actual tenant ID in callback URLs.
   - encrypted webhook verification token and encrypt key, using the existing AES-GCM secret utility and `ENCRYPTION_KEY`.
   - configured Lark Approval definition IDs for each mandatory category.
   - mandatory policy version plus tenant finance thresholds, approver routes, and extra guardrail policy.
   - health-check status/timestamps and redacted error category.
2. `lark_user_mappings`:
   - `tenant_id`, DentalAIOS user ID, verified Lark `open_id`, mapping status, OAuth verification method, linked/revoked timestamps.
   - unique active mapping for `(tenant_id, dentalaios_user_id)` and `(tenant_id, lark_open_id)`.
3. `lark_governance_mappings`:
   - tenant, Base record type/ID, local S3 object key, external Task/Calendar/Approval IDs, source version, idempotency key, sync state, retry/error metadata.
4. `lark_governance_events`:
   - tenant, source, Lark event ID, object type/ID, received/processed timestamp, normalized outcome, retry count, redacted error category.
   - unique `(tenant_id, lark_event_id)` for replay protection.
5. `access_requests`:
   - immutable request code, requester, target user, requested old/new system role/permissions, branch scope, rationale classification, state, expiry, linked Approval definition/instance, verified decision timestamp, applied-by user/timestamp, cancellation reason.
   - request expires in 7 days, may link to only one Approval instance, and may be applied once.
   - invalidate the request if target user, requested role/permissions, or branch scope changes.
6. Add indexes for tenant/state, external IDs, event ID, request expiry, and retry work.

### 1.2 Integrate with the existing Lark config safely

- Keep app credentials in existing encrypted `lark_configs`; S3 config references that tenant configuration rather than duplicating app secrets.
- Extend public configuration responses only with redacted status and resource metadata. Never return secrets, webhook tokens, encrypt keys, raw event data, or unneeded `open_id` values.
- Credential rotation resets S3 state to revalidation required; only a successful full health check can return it to `ready`.
- Disabling S3 stops new outbound writes and reminders, preserves Base, mappings, and audit data, and never hard-deletes Lark artifacts.

## Workstream 2: Lark Base Template And Governance Process

### 2.1 Provision one private Base per tenant

The app provisions only the Base and Base schema after capability validation. The tenant Lark administrator assigns Base membership/advanced permissions manually. The app must not grant broader Base access automatically.

Seed these circles:

| Circle | Scope | Purpose |
|---|---|---|
| General Circle | tenant | Integrate strategy, cross-circle constraints, and organization governance |
| Clinical Care | tenant or selected branches | Improve safe clinical service and quality without placing clinical records in Lark |
| Patient Experience | tenant or selected branches | Improve communication and service flow without patient data in Lark |
| Business Operations | tenant or selected branches | Coordinate finance, people, facilities, and non-clinical operations |
| Digital & Compliance | tenant | Own digital workflow, security, compliance, and integrations |

### 2.2 Define the Base schema

Store Lark table/field IDs after creation. Use link fields for relationships and controlled choices for statuses/categories; do not rely on editable text names as API keys.

| Table | Required fields |
|---|---|
| `Branches` | DentalAIOS Branch Key, Display Name, Active/Archived, Last Synced At. DentalAIOS-managed and read-only to normal Base users. |
| `Circles` | Circle Key, Name, Parent Circle link, Purpose, Domain summary, Scope (`tenant`/`selected_branches`), Applicable Branches link, Status, Lead Link, Rep Link, Facilitator, Secretary, Review Date, Constraints. |
| `S3 Roles` | Role Key, Circle link, Name, Purpose, Domain, Accountabilities, Decision Boundaries, Status, Review Date. |
| `Role Assignments` | Assignment Key, S3 Role link, DentalAIOS User Mapping reference, Lark Person, Assignment Type, Effective From/To, Status. |
| `Tensions` | Tension Key, Circle link, Scope, Applicable Branches, Raised By, Type, Description, Priority, Owner Role, Status, Created/Closed dates. |
| `Governance Proposals` | Proposal Key, Circle link, Source Tension, Scope, Applicable Branches, Title, Proposal, Classification, Guardrail Category, Proposer, Status, Meeting link, Effective/Review Date, Decision link. |
| `Objections` | Objection Key, Proposal link, Raised By, concrete Harm/Risk, Evidence, Integration proposal, Status, Resolution and date. |
| `Decisions` | Decision Key, Proposal link, Circle link, Scope, Applicable Branches, Consent Result, Decision Text, Owner Role, Effective/Review dates, Minutes Doc URL, Guardrail request code/Approval status, Status. |
| `Actions` | Action Key, Decision link, Circle link, Scope, Applicable Branches, Title, Owner Role, Assignee mapping, Due Date, Status, Task ID/URL, Sync State, Last Synced At. |
| `Meetings` | Meeting Key, Circle link, Meeting Type, Agenda/Minutes Doc URL, Calendar Event ID/URL, Facilitator, Secretary, Start/End, Status. |

Create the views: `My Actions`, `Open Tensions`, `Governance Queue`, `Awaiting Objection Resolution`, `Guardrail Pending`, `Circle Health`, and `Overdue Reviews`.

Rules:

- General Circle is tenant-wide. A tenant-wide Circle/Proposal/Decision/Action must explicitly declare that scope; a branch-scoped record must use links to the synchronized `Branches` table.
- When DentalAIOS creates, renames, archives, or restores a branch, S3 Console updates the Base `Branches` reference table. It never deletes a historical branch record from Base.
- Only a Circle Secretary and tenant S3 administrator can update `Consent Result`, `Decision Status`, `Effective/Review Date`, and `Guardrail Status`. The Facilitator confirms the process in meeting minutes. Role holders can create tensions/proposals/objections but cannot mark their own proposal as consented.
- Base history and minutes Doc are the required evidence of consent. Secretary creates/copies agenda/minutes Docs from a tenant-managed Lark template and links the URL; auto-provisioning Docs is out of scope.
- Base edits must never contain hidden DentalAIOS record IDs or clinical deep links.

### 2.3 Standard consent procedure

1. Role holder records a tension.
2. Circle triages it as operational, governance, cross-circle, or guardrail.
3. Secretary/role holder creates a bounded proposal with scope, review date, and necessary evidence.
4. Facilitator runs presentation, clarification, reaction, amendment, objection, integration, and consent rounds.
5. An objection is valid only if it identifies concrete harm to Circle purpose or ability to fulfil an accountability; preference alone is not valid.
6. Secretary records objections and integrations, records the decision, links minutes, and creates execution actions.
7. At review date, Circle renews, changes, or retires the decision.

## Workstream 3: Approval Guardrails And Access Requests

### 3.1 Manual Approval creation with verified linkage

Do not assume tenant internal apps can create Lark Approval definitions or instances through API.

1. Each tenant Lark administrator creates the mandatory Approval definitions using supplied templates and configures the definition IDs in onboarding.
2. Every template includes mandatory `DentalAIOS Request Code`, guardrail category, and requested scope fields.
3. When an S3 decision needs a guardrail, S3 Console creates a one-time, opaque guardrail request code and action. Secretary initiates the correct Approval instance manually in Lark and enters that code.
4. Secretary links the Approval instance code/URL in S3 Console.
5. Webhook/API verification accepts an Approval only when all of these match: tenant, configured definition ID, required request code, guardrail category, and final state.
6. A rejected, canceled, expired, duplicated, unverifiable, or mismatched Approval keeps the decision inactive and creates an escalation action. There is no manual override.
7. If tenant Approval capability/webhook verification is unavailable, tenant is `degraded`; no new guarded decisions can activate.

### 3.2 Enforce patient-data access guardrails in DentalAIOS

1. Any creation or expansion of system permissions that can read/write patient data must create an `access_request`; this includes current Users screens and APIs, not only S3 proposals.
2. Granting a new user a patient-data role, switching a user to a broader role, or adding a broader permission must remain `awaiting_approval` until the request has a verified Approval.
3. Once verified, an authorized DentalAIOS administrator performs a final explicit apply action. Webhook approval never automatically changes RBAC.
4. Removing/reducing access is immediate, fully audited, and does not require Approval.
5. Permit only the narrow tenant-registration bootstrap admin exception; log it and do not reuse it for subsequent user changes.
6. A tenant that cannot verify its Lark Approval integration may not use the new S3 guarded access-expansion path. Do not accept an administrator attestation as a replacement for verified Approval.

### 3.3 Other guarded changes

- Security, retention, and integration decisions require verified Approval plus an implementation action/change ticket. Approval does not directly modify Worker config, credentials, retention jobs, or deployment state.
- Finance guardrails apply when configured tenant threshold/rules match. Tenant may add stricter rules but cannot weaken mandatory rules.

## Workstream 4: Identity, S3 Console, Task, and Calendar

### 4.1 Self-service Lark identity link

1. Add authenticated start/callback routes for Lark OAuth linked to the current DentalAIOS user and tenant.
2. Generate a one-time, short-lived `state` that binds DentalAIOS user ID, tenant ID, nonce, callback intent, and expiry. Validate it before token exchange.
3. Verify the OAuth identity belongs to the configured tenant Lark app/workspace. Store only the verified `open_id` and minimal metadata required for the mapping; discard user OAuth tokens after verification unless a documented future feature requires them.
4. Allow self-unlink/revoke. Revoke must stop automatic assignment but leave historical action evidence intact.
5. When an S3 role holder lacks a valid mapping or Base access, show a health warning. Do not infer identity from a typed name/email.

### 4.2 S3 Console

Add a dedicated `S3 Console` page under settings/operations. It is a command surface, not a second editable governance database.

- `view_governance`: read tenant integration health and Base/Calendar links.
- `manage_governance`: read approved Base records through server-side Lark API, create/synchronize Tasks and Calendar events, link Approval instances, and update mapping/audit metadata.
- `manage_governance_integration`: credential configuration, onboarding, webhook/key rotation, Approval policy/definition configuration, and disable operation.
- All reads/writes are tenant-scoped and backed by API permission checks; frontend hiding is not authorization.
- Console loads the current source record from Base, validates allowed fields/status/schema/version/no-PII, queues idempotent operations, then writes Task/Event mapping metadata back to the matching Base record.
- Do not poll Base. If a direct Base edit needs a Task or Calendar event, Secretary invokes Console against that Base record.

### 4.3 Task behavior

1. Console creates a generic Task in the tenant-configured task list/section from a selected `Actions` record.
2. Use linked `open_id` to assign only after identity mapping exists and capability preflight proves the tenant app can create/assign Tasks.
3. If mapping or capability is absent, create the Task with `needs_manual_assignment` metadata and require Secretary to assign it in Lark. Do not substitute name/email text.
4. Lark Task completion/assignment webhooks update only the Base Action mapping/status and D1 integration metadata. They never affect clinical workflow state.
5. Queue operations use deterministic idempotency keys `(tenant, action record, source version, operation)` and retry only transient failures.

### 4.4 Calendar behavior

1. Console creates governance/tactical events in the tenant-configured shared governance Calendar from a `Meetings` record.
2. Event payload has only generic meeting title, times, Circle context, and non-sensitive agenda/minutes URL.
3. Secretary/Facilitator adds participants manually in Lark. Do not automatically invite via `open_id` until Calendar attendee capability and permissions are separately validated.
4. Calendar webhook processing is limited to mapping/audit metadata; it cannot alter patient appointments.

## Workstream 5: Lark Client, Webhooks, Queue, and Reliability

### 5.1 Capability validation before provisioning

Before allowing a tenant `ready`, validate documented Lark capability and scopes for the tenant internal app:

- tenant access token;
- Base create/read/write plus required schema/views/permissions API support;
- Task create/read/update and subscribed Task events;
- Calendar event create/update/delete;
- OAuth identity link;
- Approval instance status read/event subscription for configured definitions;
- webhook verification and event encryption/decryption.

If an API cannot be used by tenant internal apps, use an explicit verified manual prerequisite where viable. Do not silently substitute another Lark product or report readiness without the capability.

### 5.2 Per-tenant webhook endpoints

1. Generate an opaque, random `webhook_endpoint_id` per tenant and configure Lark with `/api/integrations/lark/events/{endpoint_id}`.
2. Worker looks up tenant config using this opaque ID, then verifies event token/signature and decrypts payload with that tenant's encrypted event key before parsing it.
3. Do not expose actual tenant ID in URL and do not route a common endpoint based on untrusted/decrypted fields.
4. Persist normalized event receipt with event ID before side effects; deduplicate by `(tenant_id, lark_event_id)`.
5. Allowlist only Task metadata events, final Approval events, and configured Calendar metadata events. Ignore unsupported events with a redacted audit entry.
6. Never persist raw webhook payloads, authorization headers, secrets, PII, or clinical references.

### 5.3 Queue, mapping, and health state

- Keep S3-specific queue message types/services separate from `lark_retry` and `branch_lark_sync`; preserve existing behavior.
- Persist operation intent/mapping before enqueueing. Workers update mapping state after each idempotent attempt.
- Retry transient transport/rate-limit failures with bounded retries and DLQ monitoring. Mark scope/schema/permission failures as permanent, show admin remediation, and do not loop.
- `ready` means full health check passed. `degraded` means credentials/scopes/webhook/Base/Approval checks fail after onboarding.
- In `degraded`, preserve current clinical system behavior and existing access. Fail closed for new guarded decisions and patient-data permission expansion, and stop new Task/Calendar synchronization. Queue only safe retries. Admin must pass health check before returning to `ready`.

## Onboarding Sequence

1. Admin opens S3 Lark integration settings and accepts the no-PII policy.
2. Admin saves internal-app credentials through authenticated API; server encrypts secrets and tests authentication.
3. Admin configures opaque webhook URL, verification token, and encryption key in Lark; Console completes challenge and event verification.
4. Admin supplies/validates shared governance Calendar, Task list/section, and the three mandatory Approval definition IDs.
5. Service validates capabilities/scopes and displays specific missing prerequisites without exposing secrets or raw payloads.
6. Service provisions Base template, stores resource IDs/schema version, seeds Circles and `Branches` reference records.
7. Tenant Lark administrator grants Base access/advanced permissions manually and creates/copies the governance minutes Doc template.
8. Users self-link their Lark identities; Console highlights missing mapping/Base-access prerequisites for proposed role holders.
9. Service runs health check using synthetic non-sensitive artifacts where supported, closes/removes test artifacts, and verifies mapping/webhook behavior.
10. Admin enables S3 only after every mandatory check passes. Onboarding is resumable and idempotent.

## Rollout

1. Release Workstream 0 independently with migration, route regression tests, permission-version invalidation, and branch archival monitoring.
2. Implement S3 behind feature flag without exposing it to regular tenants.
3. Validate one sandbox tenant with a separate Lark workspace/internal app, including approved and rejected guardrails, OAuth mapping, Console Task/Calendar operations, webhook replay, and degraded recovery.
4. Run an opt-in pilot with non-clinical governance work first.
5. Review template usability, guardrail routing, delivery failures, data-policy findings, and access behavior.
6. Enable tenant-by-tenant only after successful onboarding health checks. Keep existing Base import, chat bot, Directory sync, Doc auto-provisioning, Calendar auto-invites, and automatic S3-to-RBAC mapping out of scope.

## Training and Operating Model

| Audience | Required content |
|---|---|
| Tenant Lark administrators | Internal app configuration, required scopes/events, webhook setup, Base permissions, Approval definition template, credential rotation, degraded recovery. |
| DentalAIOS administrators | RBAC hardening, access-request procedure, final apply step, no manual guardrail bypass, S3 Console permissions. |
| Lead/Rep Links | Circle purpose/domain/accountability, scope by branch, cross-circle agreements, escalation. |
| Facilitators/Secretaries | Consent process, valid objection test, minutes/record integrity, Base status controls, review cadence, Console Task/Calendar flow. |
| S3 role holders | Tension/proposal/action process, no-PII policy, difference between S3 roles and system permissions. |
| Clinical/compliance/security owners | Mandatory guardrails, approval verification, implementation actions, incident response. |

Use a live simulation covering: a valid/invalid objection, branch-scoped decision, guardrail request code linkage, rejected Approval, approved access request requiring final apply, Task fallback to manual assignment, and a Lark degraded incident.

## Validation

### Automated

- D1 migration/backfill tests for explicit manager permissions, branch archive behavior, tenant isolation, governance config, user mapping uniqueness, event dedupe, and access-request lifecycle.
- JWT/version tests proving permission reduction or revocation invalidates existing tokens.
- RBAC route regression tests proving manager retains intended operational access but cannot configure integration or directly expand patient-data access.
- Service/repository tests for secret encryption, onboarding state transitions, template/resource mapping, request expiry/one-time use, policy validation, and no-PHI payload builders.
- Console route tests for permission boundaries, tenant scope, Base schema/status validation, no-PHI validation, replay-safe Task/Calendar operations, and secret redaction.
- OAuth tests for state binding/expiry, tenant mismatch rejection, identity uniqueness, unlink, and token disposal.
- Webhook tests for challenge, invalid token/signature/decryption, per-tenant endpoint lookup, duplicate/out-of-order events, allowlist behavior, and proof that events cannot mutate clinical/RBAC records.
- Approval tests proving definition/request code/category/tenant mismatch cannot activate a decision or access request.
- Queue tests for idempotency, transient retry, permanent failures, DLQ behavior, degraded transition, and recovery.

### Acceptance

- Provision Base in a sandbox tenant; inspect schema, IDs, advanced permissions, and seeded branch/circle scope.
- Complete tension-to-consent with minutes evidence; create action Task and governance Calendar event through Console.
- Verify Task completion only changes action metadata.
- Test every mandatory guardrail with approved, rejected, expired, duplicated, and mismatched Approval instances.
- Test patient-data access request: pending does not change role, verified approval still requires final admin apply, reduced access applies immediately, and existing JWT is invalidated.
- Test branch archive prevents active-scope loss and preserves historic Base links.
- Test self-service OAuth identity mapping and manual Base access grant; verify fallback manual Task assignment when scope/capability is absent.
- Test tampered/duplicate webhook, revoked credential, missing scope, Base schema drift, unavailable Approval webhook, and recovery from `degraded`.
- Inspect all captured outbound data/logs to prove no PII, patient IDs, clinical data, payment detail, or raw payload persists in S3 artifacts.

## Retention, Monitoring, and Risks

- Keep normalized/redacted webhook event logs for 90 days. Never retain raw payloads.
- Keep Task/Calendar/Approval mappings and access-request audit evidence for 24 months after close/revocation.
- Base history and minutes retention follow tenant Lark retention policy.
- Monitor onboarding success by capability, missing scopes, health/degraded transitions, queue/DLQ failures, stale mappings, pending guardrails, decision review overdue, data-policy violations, invalid/duplicate webhooks, and cross-tenant access attempts.

| Risk | Mitigation |
|---|---|
| Tenant app lacks a required Lark API | Verify capability before `ready`; make supported manual prerequisites explicit; fail closed for guardrails. |
| Base schema drift | Store schema/template IDs/version, limit schema editors, health-check before Console commands, and add controlled template migrations. |
| S3 assignment mistaken for RBAC | Separate data/UI/permissions; prohibit mapping to `system_key`; test every access route. |
| PII manually typed in Base/Docs | Policy/training, Console validation, audit/remediation; clearly document residual direct-edit risk. |
| Approval reused/mismatched | One-time 7-day request code plus tenant/definition/category/instance verification. |
| Webhook replay or wrong tenant decryption | Opaque per-tenant endpoint, signature/decryption verification, receipt-before-side-effect, unique event dedupe. |
| Lark outage weakens security | `degraded` mode blocks new guarded changes and access expansion but does not disrupt existing clinical care. |
| RBAC migration breaks manager operations | Separate rollout, explicit permission matrix, exhaustive route tests, JWT permission versioning. |

## Out Of Scope

- Replacing DentalAIOS account management, system RBAC, patient/clinical/payment systems, or audit logging with Lark.
- Storing patient or clinical identifiers/details in governance Base, Docs, Tasks, Calendar, Approval, payloads, or logs.
- Directory synchronization or Lark SSO for DentalAIOS.
- Automatic Base membership/advanced-permission changes.
- Automatic creation of Lark Docs, automatic Calendar invitations, Base polling, or chat-bot governance.
- Existing Base import/merge.
- Automatic Approval instance creation unless tenant-internal-app capability is separately verified and approved in a later phase.
- Automatic execution of system/clinical/security changes from an S3 decision or Lark webhook.
- Changing legacy clinical handover payloads in this workstream; track that remediation separately.
