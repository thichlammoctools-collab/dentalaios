# Kế hoạch: Dashboard Điều Hành Chi Nhánh và Tổng Hợp P0

## Mục tiêu và quyết định đã chốt

- Phát hành P0 chung gồm:
  - biến `/today` thành dashboard **Điều hành chi nhánh**;
  - nâng dashboard `/management-dashboard` theo hướng ưu tiên ngoại lệ và drill-down.
- Dashboard chi nhánh luôn scope theo `jwt.branch_id`; không nhận `branch_id` từ browser và không cho đổi chi nhánh tại màn này.
- Dashboard tổng hợp vẫn tenant-wide, chỉ người có `view_management_dashboard` được truy cập, được chọn một chi nhánh để phân tích sâu.
- Dashboard chi nhánh dùng `read_patients`, giữ tương thích quyền của trang “Hôm nay”; management dashboard tiếp tục dùng `view_management_dashboard`.
- Realtime dùng lại Durable Object invalidation hiện có. Socket chỉ gửi invalidation tenant-scoped, không gửi KPI/PII; client refetch snapshot đã được server authorize/scope.
- Action Center P0 trên dashboard chi nhánh gồm: lịch quá giờ, lịch hôm nay chưa xác nhận, hủy/không đến hôm nay, và treatment plan draft.
- Không làm P0: target/forecast, KPI công suất ghế, payment pending, benchmark theo quy mô, hay list treatment-plan độc lập.

## Định nghĩa nghiệp vụ P0

- Timezone báo cáo: `Asia/Ho_Chi_Minh`; mọi mốc “hôm nay”, window và tuổi dữ liệu dùng helper `getDashboardBounds()` hiện có.
- Lịch hôm nay: `scheduled_at` thuộc `[today_start, today_end)`.
- Chưa xác nhận: appointment có `status = 'booked'` trong ngày.
- Quá giờ: appointment hôm nay có status `booked | confirmed | arrived` và `scheduled_at + duration_min < now`.
- Hủy/vắng: appointment hôm nay có `status = 'cancelled' | 'no_show'`.
- Plan nháp: treatment plan `status = 'draft'`, branch được suy ra từ visit; hiển thị tuổi chờ từ `created_at` theo ngày cục bộ.
- Tỷ lệ completion: `completed / (completed + cancelled + no_show)`; mẫu số bằng 0 trả `null`, UI hiển thị `--` thay vì 0%.
- Revenue: chỉ là payment `confirmed`; nhãn UI luôn ghi đầy đủ khoảng thời gian, ví dụ “Doanh thu xác nhận hôm nay” hoặc “Doanh thu xác nhận 30 ngày”.

## API và shared contracts

1. Trong `src/shared/types/index.ts`, thêm contract tường minh cho branch snapshot:
   - `BranchDashboardToday`: scheduled, booked/unconfirmed, arrived, completed, in_progress_visits, confirmed_revenue, cancellations, no_shows.
   - `BranchDashboardKpis`: 7 ngày hoàn tất mặc định gồm confirmed revenue/current-vs-previous, visits/current-vs-previous, appointments, completion rate, new patients, pending plans, cancellations, no shows.
   - `BranchDashboardActionKind`: `overdue_appointment`, `unconfirmed_appointment`, `appointment_outcome`, `pending_plan`.
   - `BranchDashboardActionItem`: chỉ trường phục vụ hành động: kind, entity id/type, scheduled/created timestamp, status, patient name hoặc plan identifier/value tối thiểu cần nhận biết bản ghi trong scope `read_patients`, và display metadata không chứa dữ liệu lâm sàng.
   - `BranchDashboardActionGroup`: kind, count, items tối đa 5, `remaining_count`.
   - `BranchDashboardSnapshot`: generated_at, timezone, branch id/name, today boundaries, current 7-day bounds, today KPI, period KPI, daily series, action groups.
2. Không thay đổi public shape của `DashboardStats` hiện có trong P0. Gắn chú thích deprecated nội bộ ở service/route vì endpoint này đang tenant-wide và không phù hợp cho branch operations.
3. Thêm `GET /api/dashboard/branch` trong `apps/api/src/routes/dashboard.ts`:
   - `requireAuth()` + `requirePermission(PERMISSIONS.READ_PATIENTS)`.
   - Lấy duy nhất `jwt.tenant_id` và `jwt.branch_id`; bỏ qua hoàn toàn query `branch_id` để không cho browser mở rộng scope.
   - Trả snapshot branch-scoped từ `dashboardService.getBranchSnapshot(db, tenantId, branchId)`.
   - Lỗi/response tuân theo `AppError` hiện có; branch không tồn tại/đã mất context là lỗi được xử lý server-side.
4. Giữ `GET /api/dashboard/management` aggregate-only:
   - Không bổ sung action item có patient/clinical data cho endpoint này.
   - Duy trì filter `range=7|30|90` và `branch_id` đã có, kiểm tra branch thuộc tenant trước aggregate.
5. Generalize `POST /api/dashboard/stream-ticket` để dùng `requireAnyPermission([READ_PATIENTS, VIEW_MANAGEMENT_DASHBOARD])`:
   - Preserve ticket TTL, single-use consumption, tenant object routing và no-data socket protocol.
   - Không đổi Durable Object ticket payload nếu không cần; authenticated API đã quyết định quyền trước khi mint ticket.
   - Người dùng chỉ có `read_patients` được nhận invalidation nhưng mọi refetch branch snapshot vẫn server-lock theo JWT.

## Backend aggregation và truy vấn

1. Trong `apps/api/src/services/dashboard.service.ts`, tách rõ hai read models:
   - giữ `getManagementSnapshot()` cho tenant aggregate;
   - thêm `getBranchSnapshot()` cho branch operations;
   - giữ `getStats()` cho backward compatibility và đánh dấu không dùng cho UI mới.
2. Dùng chung timezone helpers (`getDashboardBounds`, local dates, HCM midnight) để tránh nhầm UTC/local date giữa hai dashboard.
3. `getBranchSnapshot()` chạy các aggregate song song, toàn bộ có `tenant_id` + `branch_id`:
   - today appointments grouped/count by status;
   - today in-progress visits;
   - today confirmed revenue qua payment -> plan -> visit branch;
   - 7 completed local days và 7 ngày trước đó cho revenue/visits delta;
   - 7 daily points cho visits/revenue;
   - current branch draft plans.
4. Action Center query design:
   - 4 count queries và 4 detail queries, mỗi query chi tiết `LIMIT 5`; chi tiết được sort theo độ khẩn cấp:
     - overdue: appointment end time cũ nhất trước;
     - unconfirmed: scheduled time sớm nhất trước;
     - outcomes: scheduled time mới nhất trước;
     - pending plan: created_at cũ nhất trước.
   - Join patient chỉ với `name` cho appointment action item; join visits/patients cho plan item nếu cần title/action link. Không select notes, diagnosis, procedures, findings, contact fields hay audit data.
   - Return `remaining_count = max(count - items.length, 0)`.
5. Sửa các dashboard aggregate range predicate để so sánh trực tiếp ISO timestamps (`column >= ? AND column < ?`) thay vì bọc indexed column trong `datetime(column)`:
   - appointments `scheduled_at`, visits `date`, patients `created_at`, payments `created_at`.
   - Chỉ thực hiện sau khi kiểm tra các timestamps lưu trữ nhất quán ISO sortable; retain SQLite datetime operations chỉ nơi phải tính appointment end time hoặc chuyển date group sang HCM.
   - Verify with `EXPLAIN QUERY PLAN` that timestamp range part of existing indexes is used.
6. Không cần D1 migration cho branch snapshot nếu các index hiện tại đủ. Nếu `EXPLAIN QUERY PLAN` chứng minh action query quá giờ/draft không bounded, thêm migration nhỏ kế tiếp chỉ với index cần thiết; không chỉnh migration đã apply.

## Dashboard chi nhánh: UI và luồng thao tác

1. Refactor `apps/web/src/pages/TodayPage.tsx` thành dashboard Điều hành chi nhánh:
   - Fetch một `GET /api/dashboard/branch` snapshot thay cho fan-out `/stats`, `/visits`, `/patients`, `/treatment-plans`.
   - Dùng `session.branch.name` và response branch metadata để hiển thị scope rõ ràng: “Điều hành chi nhánh · <tên chi nhánh>”.
   - Hiển thị ngày HCM, timestamp cập nhật, trạng thái stream, refresh button, CTA “Tạo lịch hẹn” và “Tạo bệnh nhân”.
   - Dùng `createDashboardStream()` đã có; refetch có debounce, reconnect/visibility handling giữ nguyên.
2. Replace KPI hero grid bằng phân cấp vận hành:
   - Nhóm “Luồng khách hôm nay”: Đã đặt lịch, Chưa xác nhận, Đã đến, Đang khám, Hoàn thành.
   - Nhóm “Ngoại lệ hôm nay”: Đã hủy, Không đến.
   - Nhóm “Kết quả hôm nay”: Doanh thu xác nhận hôm nay.
   - Thẻ “Hiệu quả 7 ngày hoàn tất”: doanh thu và lượt khám có delta so với 7 ngày trước; completion rate, bệnh nhân mới, plan draft hiển thị ở đây.
   - Dùng semantic color và icon nhất quán; không đặt KPI tích lũy lịch sử (“tổng bệnh nhân”, “tổng doanh thu”) ở phần điều hành.
3. Tạo Action Center nổi bật ngay dưới KPI:
   - Render 4 action group theo severity: overdue -> unconfirmed -> outcomes -> pending plan.
   - Group có `count`, item preview tối đa 5, age/time, status và CTA rõ ràng.
   - Appointment item dẫn tới `/schedule` với query context phù hợp và/hoặc mở bản ghi có thể xử lý; plan item dẫn tới `/treatment-plans/:id`.
   - CTA “Xem thêm” phải hiển thị số lượng còn lại; nếu chưa có UI list hỗ trợ filter tương ứng, điều hướng đến Schedule scoped branch cho appointment groups; không giả vờ filter plan list chưa tồn tại.
   - Không render Action Center khi hoàn toàn không có item; hiển thị success empty state ngắn “Không có việc vận hành cần xử lý ngay”.
4. Dùng 7-day trend gọn bên dưới Action Center:
   - Hiển thị visits/revenue theo ngày với legend và tooltip/title accessible.
   - Không hiển thị biểu đồ 6 tháng ở P0 trên màn điều hành; historical totals/charts không phục vụ quyết định trong ngày.
5. Responsive/accessibility:
   - Mobile ưu tiên: scope/date -> primary KPI -> Action Center -> trend.
   - KPI/action card có label đầy đủ, không chỉ dựa vào màu; trạng thái stream có text.
   - Table/chart có accessible alternative/titles; currency and number formatting `vi-VN`.
6. Update labels consistently:
   - Sidebar `Hôm nay` thành `Điều hành chi nhánh`.
   - Topbar title trên route `/today` thành `Điều hành chi nhánh`.
   - Giữ route `/today` để tránh bookmark/navigation breakage trong P0.

## Dashboard tổng hợp: UI và decision support P0

1. Giữ route, permission, realtime, range/branch filters và aggregate-only data behavior của `ManagementDashboardPage`.
2. Refine visual hierarchy:
   - Chia KPI thành “Kết quả kỳ” và “Rủi ro cần theo dõi” thay vì đặt 8 thẻ tương đương.
   - “Doanh thu xác nhận” và “Lượt khám” là primary cards, giữ delta hiện có.
   - Completion rate, bệnh nhân mới, kế hoạch chờ duyệt là secondary cards.
   - Hủy + không đến là risk card tổng hợp với số tuyệt đối và tỷ lệ trên lịch; cần bổ sung field/derive `appointment_outcome_rate` vào management contract nếu API đã có mẫu số appointments.
   - Với delta không thể tính do previous = 0, UI dùng “Chưa có kỳ đối chiếu” thay vì `--` mơ hồ nếu UX space cho phép.
3. Nâng AttentionList thành danh sách ưu tiên:
   - Sort: overdue -> outcomes -> pending plan; trong từng loại sort count giảm dần.
   - Thêm severity label/text (“Cần xử lý ngay”, “Cần theo dõi”), mô tả action và CTA branch-scoped hiện có.
   - Không thêm PII; chỉ branch name, type, count.
4. Nâng BranchComparison:
   - Default sort theo revenue vẫn giữ nhưng thêm nút/segmented sort tối thiểu: “Doanh thu”, “Tăng trưởng”, “Rủi ro”.
   - “Rủi ro” sort theo overdue/outcome/pending counts nếu available; nếu snapshot không đưa per-branch overdue thì dùng cancellations + no_shows + pending plan ở P0 và ghi rõ nhãn.
   - Highlight soft outlier theo semantic status (không chỉ màu): branch có high cancellation/no-show hoặc high pending plan có badge “Cần xem”.
   - Giữ mobile cards và desktop table, preserve click-to-filter behavior.
5. Cải thiện trend chart trong scope P0:
   - Giữ dữ liệu daily aggregate hiện có, nhưng legend phải có label rõ “Cột: lượt khám”, “Điểm: doanh thu”; title tooltip bao gồm ngày, visits, revenue.
   - Không thực hiện target line/forecast/two-axis fully interactive trong P0 do target data chưa tồn tại.
6. Drill-down behavior:
   - Alert appointment outcome/overdue đi tới `/schedule?branch_id=<id>`; Schedule tiếp tục hiển thị banner branch context.
   - Pending plan giữ dashboard branch filter/context hoặc deep link chi tiết chỉ khi có action item được server trả từ branch endpoint; management dashboard không lộ plan/patient item.

## Tương tác với Schedule và action deep links

1. Trong `SchedulePage`, parse query params `branch_id` và optional `status`/`action` on initial load:
   - Preserve existing selected branch context behavior.
   - Initialize status chips from a supported list or explicit `status` query values.
   - Display active-filter text and reset behavior.
2. Do not make Schedule a security boundary; its API calls remain tenant authenticated. Branch dashboard links only provide convenience context, while `GET /api/dashboard/branch` itself is locked by JWT branch.
3. For plan action items, use existing `/treatment-plans/:id` route. No standalone plan list is introduced in P0.

## Tests và validation

1. Extend `apps/api/tests/routes/dashboard.test.ts`:
   - `GET /api/dashboard/branch` returns 401 unauthenticated, 403 without `read_patients`.
   - Snapshot always passes `jwt.branch_id` to service/query and does not honor a malicious `?branch_id=other-branch`.
   - Shape tests for today KPIs, 7-day boundaries, action group counts/items/remaining count, HCM timezone, and no clinical fields in action payloads.
   - Existing management 403, range validation, tenant aggregate contract continue passing.
2. Add service-focused tests for `getDashboardBounds()` / branch snapshot using fixed `now`:
   - HCM midnight rollover.
   - past scheduled appointment classified overdue only for nonterminal statuses.
   - booked classified unconfirmed.
   - terminal cancelled/no-show excluded from overdue and included in outcome group.
   - null completion denominator serializes correctly.
3. Add stream route tests:
   - `read_patients` can mint a ticket after authorization change.
   - `view_management_dashboard` still can mint a ticket.
   - user lacking both is rejected.
4. Add/extend frontend tests if test harness is introduced/available; otherwise verify component behavior through typecheck/build plus focused manual acceptance:
   - light and dark modes;
   - mobile width;
   - normal snapshot, no-action state, empty branch, API error/retry, stream reconnect;
   - click each Action Center CTA and management branch/exception drill-down.
5. Required commands before rollout:
   - `npm run typecheck --workspace apps/api`
   - `npm run typecheck --workspace apps/web`
   - `npm run test --workspace apps/api`
   - `npm run build --workspace apps/web`
   - `git diff --check`
   - Remote `EXPLAIN QUERY PLAN` for updated date range queries if query expressions change.

## Rollout and safety

1. Implement shared types/API/service/tests before replacing `TodayPage`; deploy Worker first so the new endpoint exists before Pages references it.
2. Deploy Pages after Worker; `/today` remains available throughout, so no route migration or data migration is needed.
3. Keep `/api/dashboard/stats` operational in this release; do not remove it until external usage is audited.
4. Monitor Worker logs for dashboard aggregation/query errors and Durable Object stream-ticket failures after deploy.
5. Production verification with two authenticated roles:
   - `read_patients` user at branch A: `/api/dashboard/branch` returns only branch A and receives/refetches after an audited mutation.
   - management user: `/api/dashboard/management` can inspect tenant aggregate and selected branches, while responses contain branch aggregates only.
6. Preserve user-owned/unrelated worktree changes. Do not modify already-applied migrations; create a new migration only if actual query-plan validation demonstrates a missing index.

## Explicitly out of scope for P0

- Revenue/visit/appointment targets, target configuration UI, target-versus-actual, forecast.
- Chair utilization, staffing capacity or occupancy KPI; available schema does not establish robust capacity/attendance semantics.
- Payment pending action group and payment list/drill-down by branch.
- Marketing/referral attribution and cross-branch patient movement metrics.
- Platform-wide administration across tenants.
