# Clinical Copilot Launcher + Tooth Findings Two-Pane UX

## Goal
Nâng cấp UI/UX cho tab "Khám" của `VisitDetailPage`:
1. Thay chỗ đặt `EndodonticPainPathwayCard` (đang là card cứng) bằng **Copilot Launcher Row** có thể chứa nhiều Copilot khi hệ thống mở rộng, phân biệt rõ Copilot đang bật / đã mua / bị khóa (upsell).
2. Thay card "Ghi nhận theo răng ({toothFindings.length})" (đang render dọc full-width, khó lướt 8+ răng) bằng **two-pane: FDI rail bên trái + detail panel bên phải**.

Không thay đổi backend, không thay đổi schema `clinical_findings`, không đụng `FdiToothChart` ngoài việc bổ sung callback focus/anchor.

## Non-goals
- Không thay `POST/PATCH/DELETE /api/visits/:id/findings` hay `clinical_pathways` API.
- Không xây flow mua Copilot / thanh toán / marketplace thật — chỉ hiển thị trạng thái "Locked + Upsell" (CTA điều hướng tới trang platform hiện có).
- Không đổi tab shell của `workspaceTab === "exam"` (giữ nguyên `<Card>` FDI chart phía trên).
- Không tạo `Toggle`/`Switch` primitive mới cho UI kit — dùng button + state có sẵn.

## Decisions (đã chốt với user)
1. **Surface Copilot** = Copilot Launcher Row (grid chips ở đầu tab "Khám", panel Copilot render inline bên dưới).
2. **Nguồn Copilot** = Frontend registry (`clinical-copilots.ts` + `registerCopilot`) + backend feature flag (`clinical_copilot.<key>_v<n>`). Registry là single source of truth cho card metadata; feature flag quyết định `enabled/locked`.
3. **Trạng thái Locked** = hiển thị chip với badge "Cần kích hoạt" + CTA `Kích hoạt / Liên hệ` mở link tới `PlatformPages` (route hiện có, không tạo route mới).
4. **Layout Copilot panel** = single-active, inline expand. Bấm chip → set `activeCopilotKey`; bấm lại chip đó → collapse. Chỉ 1 panel mở tại 1 thời điểm.
5. **Card findings** = two-pane: rail FDI đầy đủ 32 răng vĩnh viễn bên trái, detail bên phải hiển thị findings của răng đang chọn.
6. **Rail render đầy đủ FDI**, kể cả răng chưa có finding. Răng có finding: badge số ghi nhận + màu theo category dominant. Răng không có finding: nút mờ (dashed).
7. **Empty tooth interaction** = rail read-only. Bấm răng chưa có finding → panel phải hiện empty state với 2 nút: `Thêm ghi nhận cho răng #N` (tái dùng `FdiToothChart` bằng cách gọi callback `onRequestOpenTooth(tooth)` → scroll + open dialog tooth đó) và `Bỏ chọn`. **Không** dựng form add mới trong panel phải để giữ single source of truth.

## Files to change / create

### Create
- `apps/web/src/features/clinical-copilots/registry.ts`
  - Export `type ClinicalCopilotDefinition = { key: string; featureFlagKey: string; title: string; shortLabel: string; description: string; iconKey: "endodontic" | "perio" | "occlusion" | "generic"; accent: "cyan" | "amber" | "violet" | "emerald"; render: (props: CopilotRenderProps) => ReactNode; }`.
  - Export `type CopilotRenderProps = { visitId: string; canWrite: boolean; canReview: boolean; }`.
  - Export `registerCopilot(def)` push vào module-scoped array; `getRegisteredCopilots()` trả bản copy readonly.
  - Export `getCopilotIcon(iconKey)` trả JSX `<svg>` inline (tránh phụ thuộc icon lib mới).
- `apps/web/src/features/clinical-copilots/index.ts`
  - Import registry + register Copilot đầu tiên: `endodontic_pain_v1` với `featureFlagKey = "clinical_copilot.endodontic_pain_v1"`, `render` bọc `EndodonticPainPathwayCard`.
  - Bảo đảm file này được import 1 lần từ nơi mount tab "Khám" để side-effect register chạy.
- `apps/web/src/components/ClinicalCopilotLauncher.tsx`
  - Props: `{ visitId: string; canWrite: boolean; canReview: boolean; enabledFlags: Record<string, boolean>; }`.
  - Render:
    - Header: `Trợ lý lâm sàng` + phụ đề ngắn.
    - Grid `grid-cols-2 md:grid-cols-3 xl:grid-cols-4` các chip Copilot từ `getRegisteredCopilots()`.
    - Mỗi chip: icon + tiêu đề + 1 dòng description + badge trạng thái (`Đang hoạt động` / `Cần kích hoạt`) + accent border theo `def.accent`.
    - Chip disabled visual khi `enabledFlags[def.featureFlagKey] !== true` → CTA "Kích hoạt" điều hướng `navigate("/platform/feature-flags")` (dùng route có sẵn trong `PlatformPages`; nếu route path khác thực tế, agent phải bám path thật trong `App.tsx`/router — kiểm tra trước khi hardcode).
  - State `activeCopilotKey: string | null`; click chip đang locked → không set active, chỉ điều hướng CTA (chip là 1 nút, CTA "Kích hoạt" là nút phụ ở góc chip để tránh mismatch mục đích).
  - Panel active render inline dưới grid: `def.render({ visitId, canWrite, canReview })` bọc trong `<Card className="mt-3">` có nút "Đóng" ở header để reset `activeCopilotKey`.
  - A11y: chip là `<button type="button" aria-pressed={active} aria-disabled={locked}>`.
- `apps/web/src/components/ToothFindingsBoard.tsx`
  - Props: `{ visitId: string; findings: ClinicalFinding[]; readOnly: boolean; onUpdate: (f: ClinicalFinding) => void; onDeleted: (id: string) => void; onRequestOpenTooth: (tooth: number) => void; }`.
  - Filter chỉ findings có `scope === "tooth"` (findings region / full-mouth vẫn ở `FindingsList` bên chart FDI như cũ — thấy `toothFindings` ở `VisitDetailPage.tsx:785` là `category === "tooth_hard_tissue" || category === "periodontal"`; giữ tiêu chí này).
  - Left rail (`min-w-64`):
    - 4 nhóm FDI: `ADULT_UPPER_RIGHT`, `ADULT_UPPER_LEFT`, `ADULT_LOWER_RIGHT`, `ADULT_LOWER_LEFT` (copy hằng số nội bộ hoặc export từ `FdiToothChart`).
    - Mỗi răng là nút vuông ~40×40. Có finding → chip đậm, hiển thị count badge góc trên; không có → dashed muted.
    - Highlight răng đang chọn (`ring-2 ring-primary`).
    - Trên rail có nhóm chip "Nhảy nhanh": các răng đang có finding (order theo số răng) để user không phải soi grid.
  - Right pane:
    - Nếu `selectedTooth == null`: hint chọn răng + summary "Đang có {n} răng được ghi nhận".
    - Nếu răng có findings: dùng lại đúng markup từ `FindingsList` cho danh sách findings răng đó (list các finding card với nút Sửa/Xóa/edit inline). Có thể refactor `FindingsList` để nhận `findings` đã filter sẵn theo `tooth_number` và bỏ layer `grouped by locationKey` khi caller đã đảm bảo single-location — tối ưu: thêm prop `flat?: boolean` cho `FindingsList` bỏ qua bước group. Không thay đổi API save/delete.
    - Nếu răng không có finding: empty state có nút `Thêm ghi nhận cho răng #N` → gọi `onRequestOpenTooth(tooth)`; nút `Bỏ chọn`.
  - Toolbar phía trên board: input filter category (`Tất cả` / `Răng & mô cứng` / `Nha chu`) chỉ ảnh hưởng hiển thị badge trên rail + right pane, không đổi dữ liệu.

### Update
- `apps/web/src/pages/VisitDetailPage.tsx`
  - Trong nhánh `workspaceTab === "exam"` (line ~933):
    - Trước card FDI chart: gọi `import "@/features/clinical-copilots"` (side-effect register) ở top file. Không render Copilot ở vị trí này.
    - Ngay sau card "Khám răng hàm mặt": thay `<EndodonticPainPathwayCard ... />` bằng `<ClinicalCopilotLauncher visitId={visit.id} canWrite={canWritePathways && !isClinicalReadOnly} canReview={canReviewPathways && !isClinicalReadOnly} enabledFlags={featureFlags} />`.
    - `featureFlags` được lấy như hiện có (kiểm tra chỗ `canWritePathways`/`EndodonticPainPathwayCard` hiện đang biết feature flag qua API `visits/:id/clinical-pathways/endodontic-pain` trả `feature_enabled`). Agent PHẢI: hoặc (a) thêm 1 hook `useClinicalFeatureFlags(visitId)` fetch một lần, hoặc (b) mỗi Copilot tự fetch trạng thái flag riêng (giữ hành vi cũ của EndodonticPain là fetch lazy). Chọn (b) để không thay backend: `ClinicalCopilotLauncher` không cần biết flag trước — mỗi chip có prop optional `checkEnabled?: (visitId) => Promise<boolean>` mặc định `() => Promise.resolve(true)`; chip locked khi promise resolve false.
    - Chỉnh lại prop trong `registerCopilot` cho `endodontic_pain_v1` để expose `checkEnabled` gọi `apiGet` endpoint `feature_enabled` field.
  - Thay card `<Card id="findings">...FindingsList...</Card>` bằng `<Card id="findings"><CardHeader>...</CardHeader><CardContent><ToothFindingsBoard ... onRequestOpenTooth={(tooth) => { document.getElementById("fdi-chart")?.scrollIntoView({ behavior: "smooth" }); setPendingToothOpen(tooth); }} /></CardContent></Card>`.
  - Truyền `pendingToothOpen` xuống `FdiToothChart` qua prop mới `openToothOnMount?: number | null` + callback `onOpenedTooth` để reset. `FdiToothChart` khi nhận prop → gọi `openTooth(number)` sau mount / khi prop đổi.
- `apps/web/src/components/FdiToothChart.tsx`
  - Thêm 2 prop optional: `openToothRequest?: number | null; onOpenToothRequestConsumed?: () => void`.
  - Trong `useEffect([openToothRequest])`: khi có số răng và `!readOnly` → gọi `openTooth(openToothRequest)` (hàm nội bộ đã có ở line ~100), rồi `onOpenToothRequestConsumed?.()`.
  - Thêm `id="fdi-chart"` cho wrapper root để anchor scroll.
  - Không đổi hành vi khác.
- `apps/web/src/components/FindingsList.tsx`
  - Thêm prop optional `flat?: boolean` (default false).
  - Khi `flat === true`: bỏ layer group by `locationKey`, render trực tiếp mảng `findings` như 1 danh sách (giữ nguyên logic edit/delete/pocket).
  - Không đổi shape hiện tại cho các caller khác (voice dialog, v.v.) — mặc định vẫn group như cũ.

### Delete
- Không xóa file nào. `EndodonticPainPathwayCard` vẫn được dùng gián tiếp qua registry render.

## Data / API
- Không thêm endpoint. Copilot detect trạng thái flag qua endpoint đã có (`GET /api/visits/:visitId/clinical-pathways/endodontic-pain` trả `feature_enabled`). Với Copilot tương lai, đặt convention `checkEnabled` trong metadata registry.
- Rail và detail dùng cùng array `effectiveFindings` đã có trong `VisitDetailPage`; không thêm fetch mới.

## Visual / component conventions
- Chip Copilot dùng `Card` bo góc `rounded-xl`, border accent 30% opacity, dark-mode-safe (theo pattern hiện có ở `EndodonticPainPathwayCard` với `border-cyan-500/30 bg-cyan-500/[0.03]`).
- Locked chip: `opacity-70 border-dashed`, badge `Cần kích hoạt` (Badge variant `secondary`).
- FDI rail: dark-mode chấp nhận, dùng token `bg-muted` cho răng trống, `bg-primary/10` cho răng có finding, `ring-2 ring-primary` cho răng đang chọn.
- Không thêm dependency mới (không cần `Toggle`/`Switch` primitive; button + `aria-pressed` là đủ).
- Giữ ASCII trong code, giữ tiếng Việt dấu chuẩn (UTF-8) trong string UI. Không thêm emoji.

## Accessibility
- Mỗi tooth button trên rail: `aria-label="Răng {n}, {count} ghi nhận"` khi có, `aria-label="Răng {n}, chưa có ghi nhận"` khi không.
- Chip Copilot: `aria-pressed`, `aria-disabled` cho locked; CTA "Kích hoạt" là `<Button variant="link">` bên trong chip nhưng dùng `event.stopPropagation()` để không toggle chip.
- Rail hỗ trợ điều hướng bàn phím: `role="listbox"` + tooth `role="option"`, arrow keys chuyển tooth trong cùng quadrant (nice-to-have, có thể defer nếu tốn thời gian; ghi TODO trong code).

## Failure modes to handle
- Registry rỗng (chưa register Copilot nào): Launcher render placeholder "Chưa có Copilot nào được cấu hình cho phòng khám này."
- `checkEnabled` throw / timeout: coi như locked, log `console.warn`.
- Findings có `tooth_number` không thuộc bảng FDI 32 răng vĩnh viễn (răng sữa 51–85): rail vẫn phải nhóm chúng vào section riêng "Răng sữa" (lấy `PRIMARY_*` constants) để không mất dữ liệu.
- `readOnly` true: rail vẫn cho phép chọn xem, panel phải ẩn nút "Thêm ghi nhận" và nút Sửa/Xóa (đã theo prop `readOnly` của `FindingsList`).

## Ordered task list for implementation agent
1. Copy `ADULT_*` + `PRIMARY_*` tooth constants từ `FdiToothChart.tsx` sang `apps/web/src/features/clinical-copilots/fdi-constants.ts` (hoặc export từ chính `FdiToothChart`); tránh duplicate.
2. Tạo `apps/web/src/features/clinical-copilots/registry.ts` với types + `registerCopilot` + `getRegisteredCopilots` + `getCopilotIcon`.
3. Tạo `apps/web/src/features/clinical-copilots/index.ts` register `endodontic_pain_v1` bọc `EndodonticPainPathwayCard`, với `checkEnabled` gọi endpoint hiện tại.
4. Tạo `apps/web/src/components/ClinicalCopilotLauncher.tsx` theo spec ở trên.
5. Sửa `FdiToothChart.tsx` thêm props `openToothRequest` / `onOpenToothRequestConsumed` + id anchor.
6. Sửa `FindingsList.tsx` thêm prop `flat?: boolean`.
7. Tạo `apps/web/src/components/ToothFindingsBoard.tsx` với two-pane theo spec.
8. Sửa `VisitDetailPage.tsx` nhánh `workspaceTab === "exam"`:
   - Import side-effect `@/features/clinical-copilots`.
   - Thay `EndodonticPainPathwayCard` bằng `ClinicalCopilotLauncher`.
   - Thay `<Card id="findings">...FindingsList...</Card>` bằng `<Card id="findings">...ToothFindingsBoard...</Card>`.
   - Wire `pendingToothOpen` state + prop `openToothRequest` cho `FdiToothChart`.
9. Kiểm tra layout responsive: rail collapse thành strip trên < md (`md:flex-row`, dưới md: rail nằm trên, panel dưới).
10. Kiểm tra dark mode với các accent classes.

## Validation
- `pnpm -F web typecheck` (hoặc script tương đương trong `apps/web`) phải pass.
- Manual smoke:
  - Mở visit có findings ở nhiều răng (11, 17, 41, 48) → thấy rail highlight đúng, bấm 17 hiển thị 2 findings (sâu răng + vôi răng) như trong screenshot.
  - Bấm răng 12 (chưa có finding) → panel phải hiện empty state; nút "Thêm ghi nhận cho răng #12" scroll lên FDI chart và mở dialog với răng 12 selected.
  - Copilot `endodontic_pain_v1`: khi flag off, chip locked + CTA hiển thị; khi on, bấm chip mở panel `EndodonticPainPathwayCard` inline, nút "Đóng" ẩn panel.
  - Chuyển `visit.locked_at` (`isClinicalReadOnly = true`): rail vẫn cho chọn, panel không show nút Sửa/Xóa/Thêm.
- Regression: các tab khác (`diagnosis`, `images`, `plan`) không đổi; `VoiceFindingsDialog` (dùng `FindingsList` gián tiếp qua state cha) vẫn hoạt động vì default `flat=false`.

## Rollout
- Không cần migration DB. Không cần feature flag mới (dùng flag `clinical_copilot.endodontic_pain_v1` đã có). Deploy 1 pha.
- Nếu muốn A/B: gate `ClinicalCopilotLauncher` sau flag mới `ui.clinical_copilot_launcher_v1` (optional, không bắt buộc trong lần này).

## Open items (out of scope, note only)
- Trang marketplace/upsell thực tế cho Copilot mới: CTA hiện tại chỉ điều hướng tới `platform/feature-flags`. Sản phẩm cần định nghĩa route thanh toán riêng ở milestone sau.
- Rail keyboard navigation đầy đủ (arrow keys) có thể tách task follow-up nếu triển khai không kịp.
