# Appointment Timeline And Working Hours

## Goal

Replace the existing appointment **Day** tab with a vertically timed schedule board. The board displays the selected branch's configured operating hours, supports columns by doctor or dental chair, shows an updating current-time line, and lets users start an appointment from an empty slot. Add branch operating-hours administration within Clinic Settings.

## Confirmed Product Decisions

- Keep the existing **3 days** and **Week** tabs unchanged. Replace only the **Day** tab.
- Timeline bounds derive from the selected branch's `clinic_schedules` entry for the selected weekday, not doctor schedules.
- The visual grid has 30-minute rows. Appointments retain their real start time and duration, including durations not aligned to 30 minutes.
- Show a horizontal current-time marker only when viewing the current date; the existing 30-second clock refresh drives its position.
- The board has a control to switch columns between **Bác sĩ** and **Ghế nha**.
- Doctor mode includes branch doctors. Chair mode includes active chairs and a leading **Chưa gán ghế** column for appointments whose `chair_id` is absent.
- An empty slot click opens the existing appointment form prefilled with selected date/time and the clicked doctor or chair.
- Existing appointments outside configured operating hours expand the board bounds so they remain visible and are visibly flagged as outside operating hours.
- Overlapping cards in the same column render staggered with horizontal offsets, rather than being hidden.
- A configured closed day remains visible as a dimmed grid; creation from empty slots is disabled. Existing appointments remain visible.
- When a branch has no stored schedule, use a seven-day fallback of `08:00-20:00`. This intentionally replaces the current service fallback of Mon-Fri `08:00-17:00` so all clients receive the same behavior.
- Operating-hour settings live in `/settings/clinic`, per branch, and require `manage_schedule`.
- When `branch_id` is in the schedule URL, all board resources, working hours, and new appointments use that branch. Creating for another branch is restricted to admin/manager users; other roles remain restricted to their session branch.

## Implementation Plan

1. Update shared scheduling defaults and API behavior.
   - Change the no-config fallback in `apps/api/src/services/schedule.service.ts` to return all seven weekdays with `08:00-20:00`; update `DEFAULT_CLINIC_OPEN` / `DEFAULT_CLINIC_CLOSE` in `src/shared/constants/index.ts` accordingly.
   - Keep the existing persisted `clinic_schedules` schema and `GET/PUT /api/schedules/clinic/:branchId` contract. No D1 migration is required.
   - Add validation that an open schedule entry has `open_time < close_time`; keep closed entries valid regardless of their time values.
   - Add route/service tests for the new seven-day fallback, valid save, invalid reversed hours, tenant branch isolation, and `manage_schedule` authorization.

2. Make appointment creation explicitly branch-aware and secure for the board.
   - Extend `appointmentCreateSchema` with an optional `branch_id`.
   - In `apps/api/src/routes/appointments.ts`, resolve the target branch as the supplied `branch_id` or `jwt.branch_id`.
   - Permit a different target branch only for the admin/manager role model used by this codebase (including `all` permission); reject other `write_appointments` users when target differs from session branch.
   - Pass the approved target branch to `appointmentsService.create`; retain tenant validation and chair availability against that target branch.
   - Add route tests for same-branch creation, admin/manager cross-branch success, non-admin cross-branch rejection, and cross-tenant branch rejection.

3. Add reusable timeline calculations in the web scheduling area.
   - Create a focused helper under `apps/web/src/components/schedule/` or `apps/web/src/lib/` that converts local appointment times and configured `HH:MM` bounds to minute offsets; derives the selected weekday; creates 30-minute row markers; and expands bounds to include the earliest appointment start and latest appointment end.
   - Return separate configured bounds and display bounds so cards outside working hours can be labeled without changing their real position.
   - Group board cards by active column key (`clinician_id` in doctor mode, `chair_id ?? "unassigned"` in chair mode), then assign staggered overlap offsets per column using interval overlap checks.
   - Use the selected date's local calendar date consistently, avoiding UTC `toISOString()` date shifts.

4. Implement the Day timeline in `apps/web/src/pages/SchedulePage.tsx`.
   - Fetch the selected branch's clinic schedule alongside appointments, users, patients, and chairs. Use `selectedBranchId ?? session.branch.id` as the single board branch identifier.
   - Fetch doctors and chairs for that board branch instead of always using `session.branch.id`.
   - Replace the existing Day list/group UI with a horizontally scrollable board: sticky time gutter, sticky resource headers, 30-minute row lines, and a usable responsive minimum column width.
   - Provide a segmented **Bác sĩ / Ghế nha** switch. Keep existing status, doctor, and assistant filters; apply them before rendering cards. In chair mode, retain a leading unassigned column only when applicable.
   - Render cards with absolute top/height based on true start/duration, status colors, patient name, start/end time, procedure when space allows, and a compact outside-hours indicator. Card click keeps opening the existing edit dialog.
   - Render the red current-time line and label only for today and only if its timestamp is within expanded display bounds; rely on the existing 30-second `now` update.
   - Render closed days with muted board styling, a clear closed notice, and disabled empty-slot creation. Use the expanded bounds if anomalous appointments exist on that date.
   - Empty grid cell click derives the row start and resource prefill, then opens `AppointmentForm`. Clicking occupied cards must not trigger creation.
   - Preserve loading, empty-resource, empty-appointment, keyboard focus, and mobile horizontal-scroll behavior.

5. Extend `apps/web/src/components/schedule/AppointmentForm.tsx` for board context.
   - Add optional props for target `branchId`, prefilled clinician ID, and prefilled chair ID; preserve existing callers without changing their behavior.
   - Use the target branch for user/chair/availability/utilization/schedule requests and include `branch_id` in the create payload when supplied.
   - Reset and initialize prefilled values safely every time the dialog opens, including the unassigned-chair mode.
   - Ensure no-create roles or closed-day clicks cannot bypass existing API permissions; client behavior is only a convenience layer.

6. Add operating-hours controls to `apps/web/src/pages/ClinicSettingsPage.tsx`.
   - Add a **Giờ hoạt động** section with a branch selector sourced from the existing clinic data.
   - Load `GET /api/schedules/clinic/:branchId`; display all seven days with open/close `time` inputs and an open/closed toggle.
   - When closed, visually disable time inputs but retain values; on save, submit all seven entries to the existing `PUT` endpoint.
   - Gate editing and the save action by `session.role.permissions` containing `all` or `manage_schedule`; show the configured schedule read-only for other users who can access the page.
   - Surface API validation/errors with existing toast patterns and clarify the default `08:00-20:00` behavior when no saved schedule exists.

7. Validate and update focused coverage.
   - Add unit tests for board-bound calculations: configured range, all-day default, outside-hours expansion, current-time eligibility, and staggered overlap positioning.
   - Add API tests described above, using the existing mocking style in `apps/api/tests`.
   - Run `npm run typecheck`.
   - Run `npm run test --workspace apps/api`.
   - Run `npm run build --workspace apps/web`.
   - Manually verify desktop and mobile: doctor/chair switch, unassigned-chair column, 30-minute visual rows, open/closed days, today line movement, an outside-hours legacy appointment, overlap display, card editing, empty-slot prefills, branch URL behavior, and settings save/reload.

## Risks And Guardrails

- Server-side conflict validation currently rejects overlapping appointments for the same clinician. The staggered rendering is still required for legacy data and for chair mode, where different clinicians can be assigned to the same chair only if legacy/inconsistent records exist; it must not weaken API conflict rules.
- The existing API has no per-user branch membership restriction beyond tenant scope. Cross-branch creation must therefore explicitly enforce the selected admin/manager policy in the route/service boundary, not in the frontend.
- Operating hours are weekly recurring configuration only. Holiday overrides, split shifts, doctor availability shading, drag/drop rescheduling, and changing the 30-minute grid density are out of scope.
- The board intentionally permits an existing appointment outside the current operating hours to remain visible but does not permit creating new appointments on a closed day from the board.
