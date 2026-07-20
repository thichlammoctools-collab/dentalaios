# Tenant Operations Dashboard Plan

## Scope and Decisions

- Build a new Vietnamese tenant-wide management dashboard for all `branches` belonging to the signed-in tenant. This is not a cross-tenant/platform operator console.
- Restrict access in the Worker and UI to admins and managers through a new `view_management_dashboard` permission. Existing `all` remains the administrative bypass, so existing admin and manager role records continue to work.
- Default view combines live operational metrics for the current Asia/Ho_Chi_Minh day with trailing 30 completed calendar days of performance. The range selector supports 7, 30, and 90 days; a branch selector defaults to all branches.
- Use a tenant-keyed Cloudflare Durable Object and browser WebSocket connection for near-live invalidations. The WebSocket transmits no KPI values, patient data, or clinical detail; the client refetches the normal authenticated dashboard snapshot after an invalidation.
- V1 is monitor-and-drill-down only. It must not add inline edits, appointment status updates, branch activation, or alert configuration/acknowledgement workflows.
- First-class comparison metrics are confirmed revenue, visits, appointments, completion rate, cancellation/no-show counts, new patients, and pending treatment plans. No capacity, chair, attendance, or staffing-utilization metrics are inferred because the schema does not model them.
- Attention items are derived at read time: today’s cancellations/no-shows, appointments already due today but not in a terminal state, and draft treatment plans awaiting approval. No alert rows, thresholds, or notification persistence are introduced.

## Data Semantics

- A clinic location is the existing `branches` entity under one `tenant`; all aggregations always bind `tenant_id` and optionally bind a validated `branch_id`.
- Use `Asia/Ho_Chi_Minh` to calculate the current calendar day, trailing range boundaries, and previous equal-period comparison boundaries. Convert these local boundaries to UTC before querying stored timestamps; use half-open intervals `[start, end)`.
- Treat the selected performance range as completed calendar days ending at the current local day, not future appointments.
- Attribute revenue to the branch of the payment’s treatment plan visit (`payments -> treatment_plans -> visits.branch_id`) and to `payments.created_at`; only `payments.status = 'confirmed'` contributes revenue.
- Attribute patients to `patients.branch_id` and `patients.created_at`, visits to `visits.branch_id` and `visits.date`, and appointments to `appointments.branch_id` and `appointments.scheduled_at`.
- Define appointment completion rate as `completed / (completed + cancelled + no_show)` within the selected period; return `null` when there are no terminal appointments so the UI shows `--`, not a misleading 0%.
- Define overdue-today appointments as appointments whose scheduled end time is before the current HCM time and whose status is one of `booked`, `confirmed`, or `arrived`. Keep the dashboard aggregate-only: show branch and count, not patient names.

## API, Permissions, and Shared Contracts

1. Update `src/shared/constants/index.ts`:
   - Add `ROUTES.MANAGEMENT_DASHBOARD` (`/management-dashboard`).
   - Add `PERMISSIONS.VIEW_MANAGEMENT_DASHBOARD`.
   - Keep the existing `all` bypass behavior in `requirePermission`; do not weaken tenant isolation or grant the new permission to other default roles.
2. Add dashboard DTOs to `src/shared/types/index.ts`, keeping the frontend and Worker contract in one place:
   - `ManagementDashboardRange` (`7 | 30 | 90`) and filter shape with optional `branch_id`.
   - Snapshot metadata: generated time, HCM current-day bounds, selected range, branch filter, and available branch summaries.
   - Today KPI group: scheduled, arrived, completed, in-progress visits, confirmed revenue, cancellation count, and no-show count.
   - Range KPI group: confirmed revenue and prior-period delta, visits and prior-period delta, appointments, completion rate, new patients, pending-plan count, cancellations, and no-shows.
   - Daily time-series points for visits and revenue, per-branch comparison rows with the operational-core metrics/deltas, and aggregate exception rows with stable `kind`, `branch_id`, `branch_name`, and `count` fields.
   - A minimal `DashboardInvalidation` event payload containing a version/timestamp and entity category only.
3. Add a shared Zod query schema in `src/shared/validation/index.ts` for `range` (`7`, `30`, `90`, default 30) and optional non-empty `branch_id`. Do not accept arbitrary dates in V1.
4. Replace the current broad `read_patients` guard in `apps/api/src/routes/dashboard.ts` with `view_management_dashboard` for the management endpoints, leaving compatibility decisions for the existing `/stats` endpoint explicit:
   - Add `GET /api/dashboard/management?range=30&branch_id=<id?>`, returning one complete tenant-scoped snapshot.
   - Add `POST /api/dashboard/stream-ticket`, returning a short-lived stream ticket and WebSocket path only after authentication and dashboard permission checks.
   - Add `GET /api/dashboard/stream?ticket=...`, which proxies the upgrade request to the tenant Durable Object. Reject non-WebSocket requests, invalid/expired/reused tickets, and unauthorized callers with normal API errors.
   - Retain `/api/dashboard/stats` temporarily for `TodayPage` compatibility, but move its date handling to the same HCM boundary helper so its “today” value is no longer UTC-based. Do not have the new page compose its snapshot from multiple legacy endpoints.
5. Rework `apps/api/src/services/dashboard.service.ts` around a single `getManagementSnapshot(db, tenantId, filter, now)` entry point:
   - Validate an optional branch through `createBranchRepository(db).getById(tenantId, branchId)` and return `not_found` rather than silently producing an empty cross-tenant result.
   - Compute current-day, selected-range, and prior-equal-range UTC bounds with a testable HCM date-boundary helper. Do not use the current `new Date().toISOString().slice(0, 10)` or SQLite server-local `date('now')` logic.
   - Issue bounded, tenant-index-friendly aggregate queries in parallel rather than listing clinical records into memory. Return zero-filled daily series for every day in the selected range so charts do not skip quiet days.
   - Query the branch comparison table from the tenant’s branches, left joining/pre-aggregating operational data so a newly created branch appears with zero values.
   - Count pending plans as `treatment_plans.status = 'draft'`; because plans have no `branch_id`, assign them through their visit’s branch.
   - Query the three exception groups by branch and return only counts. Do not join or serialize patient identifiers, names, notes, procedures, diagnoses, payment references, or clinical findings.
   - Update the legacy stats implementation to call common aggregate/date helpers where possible instead of maintaining contradictory metric definitions.
6. Add any needed composite D1 indexes in a new next-numbered migration after `0017_patient_notes.sql` (for example tenant/branch/timestamp and tenant/status/timestamp access patterns actually used by the new queries). Use `IF NOT EXISTS`; do not alter or backfill clinical data. Confirm query plans/index use against representative local data before retaining an index.

## Live Update Transport

1. Add `apps/api/src/durable-objects/tenant-dashboard-hub.ts` exporting `TenantDashboardHub`:
   - One Durable Object instance is named from `tenant_id`; it is the isolation boundary for stream tickets and subscribers.
   - Its private binding endpoints mint and persist a random, opaque ticket with tenant, user, expiry (60 seconds), and consumed flag using Durable Object storage. The public upgraded path atomically consumes that ticket before accepting a WebSocket.
   - The object verifies the ticket belongs to its tenant, is unused, and is unexpired. It accepts the socket, tracks it with the WebSocket hibernation API, periodically cleans expired tickets, and removes sockets on close/error.
   - A Worker-internal publish request broadcasts a JSON `dashboard:invalidate` message with `{ type, entity_type, occurred_at }`; it must never carry response data or patient/clinical fields. Dead sockets are removed without failing the mutation.
2. Update `apps/api/src/index.ts` and `apps/api/wrangler.jsonc`:
   - Export the Durable Object class, add a `DASHBOARD_HUB` Durable Object namespace to `Env`, configure the binding, and add a versioned `migrations.new_classes` entry for the class.
   - Route the stream upgrade through the authenticated dashboard router to the correct `DASHBOARD_HUB.idFromName(jwt.tenant_id)` stub. Browser clients never access a DO URL directly.
3. Add a best-effort dashboard invalidation publisher to `apps/api/src/middleware/audit.ts` after a successful audited mutation and audit attempt:
   - Read the authenticated JWT, publish to that tenant’s hub, and swallow/log transport failures so successful clinical/administrative mutations never fail because the live dashboard is unavailable.
   - Use the existing audited entity type as the invalidation category. This covers patient, visit, treatment-plan, payment, appointment, and branch mutations without duplicating notification calls in every handler.
   - Ignore entity types that do not change dashboard data on the client; a harmless extra invalidation is preferable to a stale tenant-wide view.
4. Add `apps/web/src/lib/dashboard-stream.ts` (or an equally focused hook) that:
   - Fetches a stream ticket through `apiPost`, derives `ws:`/`wss:` from the configured API base URL/current origin, then connects to the returned path.
   - Refetches the snapshot on a valid invalidation, debounced so several mutations yield one refresh.
   - Reconnects with bounded exponential backoff after disconnects, pauses reconnect/revalidation while the tab is hidden, and resumes/revalidates on visibility return.
   - Shows a subtle “live/reconnecting/last updated” status. Initial load and manual refresh work normally when WebSockets are unavailable; do not add polling because V1 selected live push.

## Web Application

1. Add `apps/web/src/pages/ManagementDashboardPage.tsx` plus small local presentation components only where they improve readability. Use existing Tailwind/shadcn primitives and the established responsive AppShell visual language; do not introduce a chart dependency solely for this page.
2. Add the route in `apps/web/src/routes/index.tsx` and a primary “Quản trị tổng quan” sidebar entry in `apps/web/src/components/Sidebar.tsx`. Derive visibility from `session.role.permissions` (`all` or `view_management_dashboard`) only as a UX hint; route/API enforcement remains authoritative.
3. Update `apps/web/src/components/Topbar.tsx` with the management-dashboard title and tenant-wide context (“Tất cả chi nhánh” or selected branch), rather than incorrectly displaying the user’s assigned branch as the dashboard scope.
4. Implement the page layout, responsive from a single-column mobile view through desktop comparison tables:
   - Header with the tenant name, HCM date context, range select (7/30/90), all/individual branch selector, manual refresh button, and live/last-updated status.
   - Top KPI cards separating today’s live operations from trailing-range performance. Include prior-period change indicators only where the previous range has a meaningful comparison value.
   - Daily visits/revenue visualization with accessible labels/tooltips or data-table fallback, zero-state treatment, and no reliance on color alone.
   - Ranked branch performance table/card list with revenue, visits, appointments, completion rate, new patients, pending plans, and cancellation/no-show exceptions. Selecting a row changes the branch filter while preserving the range in URL search parameters for shareable drill-down state.
   - “Cần chú ý” aggregate exception list grouped by branch and exception type, with buttons/links that preserve the branch context and take the operator to the central dashboard filtered view, schedule view, or existing clinic settings as appropriate. Never show patient-level details in this overview.
   - Clear loading skeletons, error state with retry, empty state for a tenant with no branch activity, and zero/`--` formatting distinctions.
5. Keep `TodayPage` available as the branch-facing workflow dashboard. It may be visually simplified later, but this work must not replace it or change its existing data access behavior beyond the shared HCM date-correctness fix.
6. Update the schedule page only if needed for links from exceptions to honor a `branch_id` URL query parameter; validate that the selected branch is in the snapshot’s tenant and keep existing appointment permission checks. Do not add cross-tenant selection or inline management controls.

## Failure Modes and Security

- Every snapshot and stream-ticket request requires JWT auth plus `view_management_dashboard`; the Worker rehydrates permissions in non-test environments as it already does. The WebSocket ticket is opaque, one-use, tenant-bound, short-lived, and never placed in logs.
- The DO sends invalidations only. The client must discard malformed messages and never mutate displayed KPIs from socket payloads.
- If a connection, ticket, DO, or broadcast fails, the page remains usable through the authenticated initial/manual snapshot request and reports reconnect status. Mutation endpoints and audit behavior remain successful even when dashboard broadcasting fails.
- Dashboard SQL must bind tenant and optional branch parameters, validate branch ownership, and return aggregate/minimized data only. No change may broaden existing tenant-scoped list/detail APIs.
- Existing `branches` do not carry active/inactive state. V1 must not imply operating status from missing activity or offer activation controls; that is out of scope until a branch lifecycle model exists.
- Existing timestamp data created by SQLite defaults and ISO client payloads may differ in textual format. Normalize comparisons through SQLite datetime conversion where required, document the UTC storage assumption, and avoid any data rewrite in this release.

## Validation and Rollout

1. Add API route/service tests under `apps/api/tests/routes/dashboard.test.ts` and focused date-helper tests:
   - unauthenticated and non-dashboard-permission requests return 401/403;
   - admin/manager (`all`) can retrieve tenant snapshots;
   - optional branch filtering is tenant-safe and rejects a foreign/missing branch;
   - snapshots have zero-filled series, correct null completion rate behavior, correct prior-period comparison, and HCM midnight boundaries;
   - revenue joins through plan/visit branch ownership and excludes pending/failed payments;
   - exception counts include only the defined statuses and never include patient fields.
2. Add Durable Object/stream tests with the project’s Workers-compatible test harness (add the appropriate Cloudflare Vitest pool only if necessary): ticket expiry, single-use rejection, tenant mismatch rejection, authorized upgrade, data-free invalidation broadcast, and best-effort mutation behavior when publishing fails.
3. Add frontend coverage if a web test harness is introduced; otherwise validate with type checking plus a documented manual acceptance pass: permission-hidden/forbidden navigation, all-branch and one-branch filters, 7/30/90 range changes, zero/loading/error states, mobile table/card layout, live refresh after appointment/payment/visit/plan mutations, reconnect after offline/online, and no patient data visible in dashboard exceptions.
4. Run `npm run typecheck`, `npm run build`, and `npm run test --workspace apps/api` after implementation. Apply the new D1 migration in a disposable local D1 database first, inspect the migration/index query plan, then apply through the existing remote migration workflow before deploying the Worker/PAGES bundle with the new Durable Object binding.
5. Do not modify the user’s existing uncommitted appointment, role, schedule, shared-type, or validation changes outside the minimal conflict-aware integration required for this dashboard.

## Out of Scope

- Platform-wide administration across independent tenants.
- Polling fallback, configurable alerts, persisted acknowledgements, push notifications, staff attendance, chair/room capacity, branch activation/lifecycle, and new inline operations controls.
- Historical data migration/backfill, new reporting exports, and replacement of the existing branch-facing Today dashboard.
