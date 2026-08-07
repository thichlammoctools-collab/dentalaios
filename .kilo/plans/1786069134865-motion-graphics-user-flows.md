# Kế hoạch motion graphics cho 4 luồng trọng tâm

## Mục tiêu

Dùng chuyển động nhẹ, có ý nghĩa để làm rõ các trạng thái và bước chuyển trong 4 luồng: marketing → demo, lịch hẹn/ghế, khám theo răng, và AI Copilot. Motion phải hỗ trợ thao tác lâm sàng; không được che khuất cảnh báo, làm chậm nhập liệu, hoặc ngụ ý kết quả AI là quyết định chuyên môn.

## Quyết định

- Phạm vi đợt đầu: 4 luồng trọng tâm, không bao gồm referral/Lark.
- Công nghệ: CSS transitions/keyframes kết hợp React state; không thêm Framer Motion/GSAP/Lottie.
- Accessibility: toàn bộ motion tuân theo `prefers-reduced-motion`; khi được bật, đổi sang trạng thái tức thì nhưng vẫn giữ nhãn, toast, focus và phản hồi API.
- Nguyên tắc: 150–300ms cho phản hồi thao tác; animation nền tối đa 12s; không animation lặp trên màn hình khám hoặc biểu đồ răng.
- Chỉ chạy success motion sau khi API xác nhận. Lỗi, cảnh báo y khoa và xung đột lịch có mức ưu tiên thị giác cao hơn motion.

## 1. Nền tảng motion dùng chung

1. Mở rộng `apps/web/src/index.css` bằng các utility/semantic class riêng:
   - `.motion-enter`, `.motion-enter-stagger`, `.motion-success`, `.motion-settle`, `.motion-highlight`.
   - Keyframes: `fade-slide-up`, `success-pulse`, `card-settle`, `tooth-select`, `ai-reveal`.
   - `@media (prefers-reduced-motion: reduce)` đặt `animation-duration: 1ms`, `animation-iteration-count: 1`, tắt smooth scroll/transform nhưng không tắt focus outlines hoặc loading indicators.
2. Không dùng selector global quá rộng; scope marketing dưới `.marketing-site`, clinical/scheduling theo component class để không ảnh hưởng Platform Control.
3. Dùng biến state cục bộ dạng `lastActionId`, `isSettling`, `isSuccess` để gắn class trong khoảng thời gian ngắn; cleanup `setTimeout` khi unmount.
4. Không chạy animation khi dữ liệu đang stale/loading hoặc khi thao tác API thất bại.

## 2. Marketing → demo

### Mục tiêu

Biến trải nghiệm từ website thành demo có cảm giác “AI clinical system” nhưng vẫn nhanh và tin cậy.

### Thay đổi

1. `apps/web/src/pages/MarketingSite.tsx`
   - Giữ nền dental-scan/tooth pulse hiện có.
   - Thêm entrance nhẹ, chạy một lần khi vào Home: eyebrow → tiêu đề → mô tả → CTA → `ClinicPreview`, với stagger 50–80ms.
   - CTA demo có micro-interaction hover/focus: icon mũi tên trượt 2–3px, nền quét sáng ngắn; không dùng loop.
2. `apps/web/src/components/LoginForm.tsx`
   - Khi URL là `/login?demo=doctor`, sau khi `useEffect` điền credentials, gắn class `motion-highlight` cho 2 field trong tối đa 600ms, rồi focus email hoặc nút đăng nhập (không tự submit).
   - Banner dữ liệu mô phỏng reveal nhẹ; mật khẩu không được animate ký tự hay tự hiển thị.
   - Nếu login thành công, để navigation tức thì; không thêm splash làm chậm vào workspace.

### Kiểm thử

- Query `demo=doctor` luôn điền credentials cả khi router giữ nguyên component.
- Tab/keyboard focus và reduced motion hoạt động đúng.
- Không phá Dark Mode marketing/login.

## 3. Lịch hẹn và ghế

### Mục tiêu

Làm rõ kết quả kéo-thả/đổi trạng thái/đổi ghế mà không thay đổi hình học timeline hoặc làm người dùng nhầm rằng API đã thành công trước khi xác nhận.

### Thay đổi

1. `apps/web/src/pages/SchedulePage.tsx`
   - Sau optimistic update đã được API xác nhận, lưu ID lịch vừa cập nhật và gắn `.motion-settle` cho card tương ứng: scale rất nhẹ 0.98 → 1, outline xanh 200ms.
   - Nếu backend điều chỉnh slot vì tránh xung đột, hiển thị nhãn ngắn “Đã điều chỉnh để tránh trùng lịch” cạnh card/toast; highlight vị trí cuối cùng, không animate đường bay.
   - Khi API lỗi, hoàn nguyên đúng như hiện tại; chỉ hiện error state, không success animation.
2. `apps/web/src/components/schedule/AppointmentTimeline.tsx`
   - Card mới từ empty slot reveal bằng opacity/translate 8px sau khi form lưu thành công.
   - Không thêm transition vào các giá trị `top`, `height`, hay transform drag đang do timeline tính toán để tránh jitter.
3. `apps/web/src/pages/ChairBoardPage.tsx` và `apps/web/src/components/schedule/SeatCard.tsx`
   - Thay đổi trạng thái ghế sau API thành công: badge/background color transition 200ms và ring pulse một lần.
   - Chuyển ghế: highlight nguồn mờ dần nhẹ và đích settle sau khi refresh hoàn tất; không mô phỏng appointment bay giữa ghế để tránh sai lệch dữ liệu.

### Kiểm thử

- Kéo-thả vẫn đúng vị trí trên day/3-day/week view, kể cả xung đột và màn nhỏ.
- Không có animation trước khi response success.
- Ghế unavailable/cleaning/maintenance vẫn phân biệt được ở light/dark.

## 4. Khám theo răng và bắt đầu lượt khám

### Mục tiêu

Tạo ranh giới rõ giữa front desk và lâm sàng, đồng thời giúp bác sĩ nhận biết răng đang thao tác mà không phân tán khỏi cảnh báo y khoa.

### Thay đổi

1. `apps/web/src/pages/PatientDetailPage.tsx`
   - Khi “Bắt đầu lượt khám” tạo visit thành công: nút chuyển sang trạng thái xác nhận ngắn (check + “Đã tạo lượt khám”), sau đó điều hướng đến `#findings` như hiện tại.
   - Chỉ dùng transition trên nút; không animation cả trang để giữ nguyên scroll restoration theo patient/section.
2. `apps/web/src/components/FdiToothChart.tsx`
   - Khi chọn răng: vẽ outline/ring 180ms và fill settle 120ms; selected tooth luôn có trạng thái tĩnh dễ nhận biết sau animation.
   - Khi lưu finding thành công: check nhỏ xuất hiện ngay trên răng/legend liên quan trong 300ms, sau đó giữ icon trạng thái tĩnh nếu có dữ liệu.
   - Không pulse liên tục; không animate răng có alert trừ khi người dùng chủ động chọn.
3. `apps/web/src/pages/VisitDetailPage.tsx`
   - Task states Exam → Diagnosis → Images → Plan đổi bằng content fade 150ms, giữ layout height ổn định nhất có thể.
   - Cảnh báo y khoa và acknowledgment không được delay, fade-in, hoặc bị che bởi task transition.

### Kiểm thử

- Deep links/anchors và scroll restoration vẫn chính xác.
- Keyboard selection/focus trên FDI chart thể hiện tương đương click.
- Alerts high severity vẫn là phần nổi bật nhất trên màn hình.

## 5. AI Copilot → kế hoạch điều trị

### Mục tiêu

Trực quan hóa “AI đang tổng hợp dữ liệu lâm sàng thành đề xuất để bác sĩ duyệt”, không trình bày AI như kết luận chẩn đoán tự động.

### Thay đổi

1. `apps/web/src/components/AiTreatmentPlanSuggest.tsx`
   - Khi bắt đầu gọi AI: thay spinner đơn bằng trạng thái 3 bước tĩnh/tiến trình nhẹ:
     1. “Đọc phát hiện lâm sàng”
     2. “Đối chiếu dịch vụ và thời lượng”
     3. “Tạo đề xuất để bác sĩ duyệt”
   - Các bước phải có `aria-live="polite"`; không tạo phần trăm giả hoặc ETA.
   - Khi có response, reveal các proposed item theo cascade 40–60ms/item, giới hạn tối đa 6 item để không kéo dài với plan lớn; các item còn lại xuất hiện ngay.
   - Hiển thị nhãn cố định “Đề xuất cần bác sĩ rà soát trước khi áp dụng”.
2. `apps/web/src/pages/TreatmentPlanAiPage.tsx`
   - Sau apply thành công: button chuyển check state trong lúc navigation; treatment-plan detail giữ trạng thái bình thường sau route change.
   - Validation errors vẫn xuất hiện tức thì tại field/item lỗi, không animation success.

### Kiểm thử

- Mọi item vẫn chọn/bỏ chọn/chỉnh duration được ngay khi hiện.
- AI error, timeout, empty proposal và validation error không chạy reveal/success state.
- Màn hình reader/keyboard có thể hiểu progress qua text và `aria-live`.

## Rủi ro và kiểm soát

- **Jitter timeline:** không animate `top`, `height`, layout positioning trong drag/drop.
- **Sai ý nghĩa lâm sàng:** motion AI chỉ nói “đề xuất”, luôn yêu cầu bác sĩ rà soát.
- **Motion overload:** chỉ animation khi route/action đổi trạng thái; không lặp ngoài hero marketing.
- **Reduced motion:** áp dụng quy tắc toàn app, không chỉ marketing.
- **Dark Mode:** bổ sung counterpart màu motion cho semantic success/highlight ở CSS, kiểm tra tương phản văn bản/badge sau khi thay màu.

## Validation

1. Chạy `npm run typecheck` trong `apps/web`.
2. Chạy `npm run build` trong `apps/web`.
3. Kiểm thử thủ công light/dark và `prefers-reduced-motion: reduce` trên:
   - `/vi` → `/login?demo=doctor` → Today.
   - Schedule: drag, conflict adjustment, status update, error rollback.
   - Chair board: cập nhật trạng thái và chuyển ghế.
   - Patient → start visit → FDI selection → save finding.
   - AI suggestion: loading, success, select/edit/apply, error/empty response.
4. Kiểm tra keyboard navigation, focus order, aria-live, contrast và không có layout shift đáng kể.
5. Xác nhận no regression cho URL-backed tabs, patient scroll restoration, permission-gated actions và current-time timeline marker.
