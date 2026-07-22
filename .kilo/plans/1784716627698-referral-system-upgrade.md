# Nâng cấp Referral System

## Bối cảnh và phạm vi

Hệ thống hiện chỉ lưu nguồn giới thiệu trực tiếp trên `patients` (`marketing_source`, `referral_type`, `referral_user_id`, `referral_notes`). Chưa có chương trình thưởng, sổ phần thưởng, voucher, báo cáo hoặc portal. Kế hoạch này thay bằng luồng Referral độc lập cho **lượt tạo mới**; giữ nguyên dữ liệu cũ để tra cứu và không tự tính thưởng hồi tố.

Quyết định đã chốt:

- Một bệnh nhân được giới thiệu chỉ gắn với **một** Người giới thiệu và nhận tối đa **một** phần thưởng theo bậc cao nhất tại thời điểm duyệt; không cộng dồn chương trình hoặc bậc.
- Người giới thiệu là thực thể riêng, có loại `patient`, `doctor`, `assistant`, hoặc `partner`; có thể liên kết tùy chọn với hồ sơ bệnh nhân hoặc nhân viên, hoặc được tạo độc lập.
- Mỗi Người giới thiệu có mã duy nhất; nhân viên có thể nhập mã hoặc chọn hồ sơ trực tiếp. Mã hợp lệ tự điền và khóa lựa chọn khác. Chưa xây form đăng ký bệnh nhân công khai; link chia sẻ chỉ là định danh sẵn sàng cho giai đoạn intake sau.
- Chương trình áp dụng theo chi nhánh, khoảng hiệu lực và độ ưu tiên; một lượt luôn chụp chương trình/phiên bản tại thời điểm ghi nhận.
- Lượt đủ điều kiện khi bệnh nhân mới phát sinh tổng **doanh thu ròng** từ thanh toán đã xác nhận, trong cửa sổ ngày cấu hình, đạt một bậc thưởng. Quản lý/quản trị viên phải duyệt thủ công.
- Tiền mặt được xác nhận chi nội bộ. Voucher là sổ voucher nội bộ, chưa dùng tự động để giảm trừ thanh toán.
- Portal có tài khoản email/mật khẩu tách hoàn toàn `users` nội bộ và JWT riêng. Portal chỉ xem mã, lượt và thưởng của chính mình, không có PII hoặc doanh thu bệnh nhân.
- Điều chỉnh/hoàn tiền sau phát hành không xóa lịch sử; phần thưởng chuyển `recovery_required` và quản lý xử lý thu hồi có chứng từ/lý do.

Ngoài phạm vi: tích hợp cổng chi tiền, đổi voucher vào thanh toán, portal đăng ký bệnh nhân công khai, SMS/Google OAuth, và tính thưởng hồi tố tự động.

## Mục tiêu

1. Cho phép phòng khám vận hành các chương trình giới thiệu theo chính sách riêng cho bệnh nhân, bác sĩ, phụ tá và đối tác ngoài hệ thống.
2. Ghi nhận nguồn giới thiệu có thể kiểm chứng, cố định chính sách áp dụng tại thời điểm phát sinh, và đối soát được doanh thu ròng dẫn đến phần thưởng.
3. Tạo quy trình thưởng có phân quyền, phê duyệt, chi trả/phát hành, thu hồi và lịch sử bất biến.
4. Cung cấp dashboard nội bộ có KPI và báo cáo CSV; portal riêng giúp Người giới thiệu tự theo dõi mà không lộ dữ liệu bệnh nhân.
5. Chặn tự giới thiệu, bệnh nhân cũ, đổi người nhận sau doanh thu và các thao tác tự duyệt/tự chi.

## Đối tượng tham gia

| Đối tượng | Vai trò trong luồng |
| --- | --- |
| Người giới thiệu (`patient`, `doctor`, `assistant`, `partner`) | Có mã riêng, có thể có tài khoản portal, nhận một phần thưởng khi lượt của mình đủ điều kiện và được duyệt. |
| Lễ tân/nhân viên có quyền hồ sơ | Nhập hoặc tra mã, chọn Người giới thiệu và tạo hồ sơ bệnh nhân/lượt referral trước khoản thanh toán xác nhận đầu tiên. |
| Quản trị viên/Quản lý | Cấu hình chương trình, biểu thưởng, chi nhánh; duyệt/từ chối thưởng; xử lý yêu cầu điều chỉnh; xử lý thu hồi. |
| Kế toán | Xem công nợ thưởng tiền mặt và xác nhận đã chi, kèm ngày, phương thức, mã chứng từ tùy chọn. Không tự duyệt thưởng. |
| Bác sĩ/Phụ tá | Có thể là Người giới thiệu qua hồ sơ tách biệt, nhưng không được tự tạo/sửa hồ sơ referral của chính mình, tự duyệt, tự chi hoặc thao tác trên phần thưởng có liên kết với mình. |
| Hệ thống | Đánh giá điều kiện sau xác nhận/điều chỉnh thanh toán; hết hạn xét duyệt hằng ngày; lưu event audit không chứa PII. |

## Cơ chế hoạt động

### 1. Chương trình và biểu thưởng

1. Quản trị viên tạo chương trình: tên, mã nội bộ, trạng thái, ngày hiệu lực, thứ tự ưu tiên, chi nhánh áp dụng, `conversion_window_days` (mặc định 90) và `review_window_days` (ví dụ 30).
2. Mỗi lần chỉnh chính sách tạo **phiên bản mới** thay vì ghi đè: tăng `version`, sao chép bộ bậc mới và giữ phiên bản cũ chỉ đọc.
3. Mỗi bậc áp dụng cho một loại Người giới thiệu, có `min_net_revenue`, loại phần thưởng (`cash`/`voucher`), cách tính (`fixed`/`percentage`) và giá trị. Voucher có số ngày hết hạn tính từ ngày phát hành.
4. Khi có nhiều chương trình hiệu lực tại chi nhánh và loại Người giới thiệu phù hợp, hệ thống lấy chương trình có `priority` cao nhất. Cần từ chối cấu hình trùng ưu tiên cùng phạm vi/loại trong cùng thời gian để kết quả không mơ hồ.
5. Khi ghi nhận referral, case lưu `program_id` và `program_version`; các sửa cấu hình sau đó không thay đổi chính sách của case đã tạo.

### 2. Ghi nhận lượt giới thiệu

1. Màn hình tạo/sửa bệnh nhân thêm vùng “Referral mới”, tách khỏi các trường marketing cũ.
2. Nhân viên có thể nhập mã. API tra mã theo tenant, chỉ chấp nhận Người giới thiệu đang `active`; khi hợp lệ trả về định danh không nhạy cảm và UI khóa ô chọn. Mã không tồn tại/đã vô hiệu hóa trả lỗi, không bỏ qua.
3. Nếu không nhập mã, người dùng tìm/chọn một Người giới thiệu. Với trường hợp liên kết, màn hình quản lý Người giới thiệu hỗ trợ tạo từ hồ sơ bệnh nhân, user bác sĩ/phụ tá, hoặc đối tác độc lập có tên và một kênh liên hệ tối thiểu.
4. Trong transaction tạo bệnh nhân, service kiểm tra bệnh nhân thực sự mới trên **toàn tenant**: không tồn tại bất kỳ hồ sơ nào có CCCD đó, bao gồm hồ sơ đã archive. Nếu hợp lệ, tạo `referral_case` duy nhất cho bệnh nhân, chọn chương trình/phiên bản và chụp chi nhánh, nguồn (`code`/`manual`) và cờ rủi ro ban đầu.
5. Không có chương trình phù hợp thì vẫn tạo bệnh nhân nhưng không tạo case thưởng; UI nêu rõ lý do. Không cho “gắn chờ” để tránh chọn chương trình hồi tố.
6. Sau khoản thanh toán xác nhận đầu tiên, khóa chỉnh trực tiếp thông tin referral. Thay hoặc hủy phải qua yêu cầu điều chỉnh có lý do; người duyệt khác người yêu cầu và có quyền quản lý.

### 3. Xác thực thành công và phát hành thưởng

1. Bổ sung `confirmed_at` cho `payments`; chỉ ghi khi chuyển `pending` sang `confirmed`. Khoản điều chỉnh đã xác nhận dùng thời điểm tạo giao dịch điều chỉnh làm thời điểm hiệu lực.
2. Sau `POST /payments/:id/confirm` và sau khi tạo điều chỉnh, gọi `referralService.evaluateCaseForPatient()` trong cùng luồng ứng dụng sau khi ghi payment thành công.
3. Doanh thu ròng là tổng `amount` của tất cả payment `confirmed` thuộc bệnh nhân có thời điểm hiệu lực nằm trong cửa sổ chuyển đổi, bao gồm amount âm từ giao dịch điều chỉnh/hoàn tiền. Không cộng `discount_amount`, vì đây không phải tiền đã thu.
4. Service chọn bậc cao nhất của chính `program_version` có ngưỡng không vượt doanh thu ròng. Khi đạt, case chuyển `eligible`, lưu thời điểm đủ điều kiện/hạn xét duyệt và tạo duy nhất một `referral_reward` ở `pending_approval`, chụp doanh thu và công thức tính. Nếu chưa duyệt và doanh thu rơi xuống dưới ngưỡng, thu hồi record chờ và trả case về `pending_conversion`.
5. Quản lý/quản trị viên duyệt hoặc từ chối. Khi duyệt, chụp vĩnh viễn số tiền tính được: bậc cố định là giá trị bậc; bậc phần trăm là tỷ lệ nhân doanh thu ròng tại lúc duyệt, theo VND và quy tắc làm tròn được ghi trong snapshot.
6. Với `cash`, trạng thái thành `cash_payable`; kế toán xác nhận `cash_paid` với `paid_at`, phương thức và mã chứng từ tùy chọn. Với `voucher`, sinh mã ngẫu nhiên không đoán được, giá trị, hạn dùng và record voucher `issued`; reward thành `voucher_issued`.
7. Cron hằng ngày chuyển case/reward chờ duyệt quá `review_due_at` sang `expired`. Quản lý có thể mở lại một lần thao tác có lý do và audit.
8. Khi đánh giá lại do điều chỉnh khiến case đã phát hành không còn đạt bậc đã duyệt, giữ mọi snapshot, đặt reward `recovery_required` và tạo event. Quản lý hoàn tất thu hồi: hủy voucher chưa đổi hoặc ghi bù trừ/hoàn tiền mặt với chứng từ; khi đó trạng thái `recovered`. Không có thao tác xóa.

### 4. Portal Người giới thiệu

1. Mỗi `referrer` có tối đa một `referrer_account` trong tenant. Account dùng email/mật khẩu tách hoàn toàn `users`, có trạng thái active/disabled và JWT portal dùng `REFERRAL_PORTAL_JWT_SECRET` riêng.
2. Vì email chỉ có ý nghĩa trong tenant, trang portal/login truyền clinic slug (hoặc được mở từ link tenant-scoped); unique email đặt trên `(tenant_id, email)`. Không cho JWT nội bộ gọi API portal hoặc JWT portal gọi API nội bộ.
3. Quản trị viên tạo/kích hoạt/khóa tài khoản và tạo token một lần cho kích hoạt/đặt lại mật khẩu. Lưu hash token, hạn dùng, thời điểm sử dụng, không lưu hoặc trả raw token trong API response thông thường.
4. Gửi link qua Resend bằng `fetch` Workers-native, dùng secrets `RESEND_API_KEY`, `REFERRAL_EMAIL_FROM`, `FRONTEND_ORIGIN`; không thêm SDK/dependency và không đưa secret/token vào log. Nếu Resend chưa cấu hình hoặc gửi thất bại, response nội bộ chỉ cho quản trị viên copy link một lần để gửi thủ công, ghi event không chứa token.
5. Portal chỉ có `/referrer/login`, kích hoạt/đặt lại mật khẩu, dashboard cá nhân, danh sách lượt với trạng thái đã làm mờ, phần thưởng và voucher của chính account. Không trả tên, CCCD, số điện thoại, chi nhánh hoặc doanh thu của bệnh nhân.

## Các tính năng quản lý cấu hình

### Màn hình nội bộ

| Khu vực | Chức năng |
| --- | --- |
| `/settings/referral-programs` | Danh sách chương trình, bật/tắt, hiệu lực, ưu tiên, cửa sổ doanh thu/hạn duyệt, chi nhánh và lịch sử phiên bản. Chỉ admin/manager. |
| Form chương trình | Cấu hình bảng bậc riêng cho `patient`, `doctor`, `assistant`, `partner`; kiểm tra ngưỡng tăng dần, không âm, phần trăm hợp lệ, voucher có hạn dùng và không có vùng hiệu lực/ưu tiên mơ hồ. |
| `/referrers` | CRUD Người giới thiệu, mã sinh tự động/cấp lại vô hiệu hóa mã cũ, liên kết bệnh nhân/user, loại, liên hệ, trạng thái, cờ rủi ro, tạo/khóa/reset portal account. Không hard-delete nếu đã có case/reward. |
| `/referrals` | Hàng đợi case theo trạng thái: chờ chuyển đổi, đủ điều kiện, chờ duyệt, hết hạn, bị từ chối, cần thu hồi. Xem case, snapshot chính sách, payment IDs và event log; không đưa PII ra export mặc định. |
| `/referrals/rewards` | Hàng đợi duyệt, công nợ tiền mặt, phát hành voucher, thu hồi; yêu cầu lý do khi từ chối/mở lại/thu hồi và chứng từ khi chi trả/thu hồi. |
| `/reports/referrals` | KPI và bảng drill-down theo thời gian, chương trình, phiên bản, chi nhánh, loại/người giới thiệu, trạng thái. Xuất CSV cho quyền nội bộ phù hợp. |

### Phân quyền

1. Thêm permissions hẹp: `manage_referral_programs`, `manage_referrers`, `read_referrals`, `review_referral_rewards`, `pay_referral_rewards`, `view_referral_reports`.
2. Chỉ `admin`/`manager` được cấu hình, duyệt, mở lại, chấp nhận yêu cầu chỉnh case và hoàn tất thu hồi. `accountant` chỉ xem/đánh dấu đã chi tiền mặt sau khi reward đã được duyệt; không được duyệt, từ chối hoặc thu hồi.
3. API cưỡng chế phân tách nhiệm vụ: `requested_by != reviewed_by`; user liên kết với referrer không thể tạo/sửa referrer của mình, tạo/chỉnh case dùng chính mình, duyệt, chi trả hoặc thu hồi reward của referrer đó.
4. Bổ sung action audit cho toàn bộ mutation nội bộ qua middleware `audit.ts`; event ledger referral lưu actor user/system, trạng thái trước/sau và lý do nhưng tuyệt đối không lưu PII/CCCD/số điện thoại.

### Báo cáo

1. KPI: số case ghi nhận, tỷ lệ case đạt điều kiện, tỷ lệ duyệt, tổng doanh thu ròng quy thuộc (nội bộ), tổng thưởng đã duyệt/đã chi, tiền chờ chi, voucher đã phát hành/hết hạn/thu hồi và case rủi ro.
2. Bộ lọc: khoảng thời gian ghi nhận/đủ điều kiện, chương trình + phiên bản, chi nhánh snapshot, loại referrer, referrer, trạng thái case/reward và cờ rủi ro.
3. Export CSV nội bộ dùng bản ghi ID/mã/referrer, trạng thái, giá trị, thời điểm và chứng từ; tuân thủ permission. Portal không có export và chỉ xem số lượt, trạng thái, giá trị phần thưởng/voucher của chính mình.

## Mô hình dữ liệu và migration

Tạo migration mới sau `0045` thay vì sửa migration cũ. Mọi bảng có `tenant_id`, FK tenant-scoped hợp lý và index theo các truy vấn bên dưới.

1. `referrers`: `id`, `tenant_id`, `type`, `code`, `name`, `email`, `phone`, `linked_patient_id`, `linked_user_id`, `status`, `created_by`, timestamps. Ràng buộc mã unique trong tenant; một liên kết bệnh nhân/user chỉ thuộc một referrer đang quản lý; validate loại liên kết (`doctor` phải là system role doctor, `assistant` phải là assistant, `patient` phải có patient).
2. `referrer_accounts`: `id`, `tenant_id`, `referrer_id` unique, `email`, `password_hash`, `is_active`, `last_login_at`, timestamps; unique `(tenant_id, lower(email))` được enforce bằng cột email chuẩn hóa.
3. `referrer_account_tokens`: token hash unique, account/tenant, loại `activate`/`reset_password`, hết hạn, đã dùng, tạo bởi. Có index lookup token hash và expiry.
4. `referral_programs`: `id`, `tenant_id`, `name`, `status`, `starts_at`, `ends_at`, `priority`, `conversion_window_days`, `review_window_days`, `current_version`, creator/timestamps. `referral_program_branches` liên kết chương trình-chi nhánh; danh sách rỗng nghĩa là tất cả chi nhánh.
5. `referral_reward_rules`: `id`, `tenant_id`, `program_id`, `program_version`, `referrer_type`, `min_net_revenue`, `reward_kind`, `calculation_type`, `value`, `voucher_valid_days`, timestamps. Quy tắc phiên bản cũ bất biến.
6. `referral_cases`: `id`, `tenant_id`, `patient_id` unique, `referrer_id`, `branch_id` snapshot, `program_id`, `program_version`, `source`, `status`, `registered_at`, `conversion_ends_at`, `eligible_at`, `review_due_at`, `risk_flags` JSON IDs/keys, timestamps. Không lưu PII snapshot.
7. `referral_rewards`: `id`, `tenant_id`, `referral_case_id` unique, `rule_id`, `reward_kind`, `calculation_type`, `configured_value`, `basis_net_revenue`, `calculated_amount`, `currency`, `status`, reviewer/approval/rejection/recovery/paid metadata, lý do và timestamps. Đây là sổ nghiệp vụ bất biến về giá trị sau duyệt.
8. `referral_vouchers`: `id`, `tenant_id`, `reward_id` unique, `code` unique, `face_value`, `issued_at`, `expires_at`, `status`, cancellation/recovery metadata. Chưa thêm FK tới `payments` hay logic redemption.
9. `referral_case_change_requests`: `id`, `tenant_id`, `case_id`, loại `replace_referrer`/`cancel`, `proposed_referrer_id`, lý do, requester/reviewer, trạng thái và timestamps. Cấm requester tự duyệt.
10. `referral_events`: `id`, `tenant_id`, `case_id`, `reward_id`, actor kiểu `user`/`system`, actor ID nullable cho system, event type, state from/to, reason, created_at. Dùng để tái dựng luồng và điều tra gian lận.
11. Bổ sung `payments.confirmed_at`; set khi confirm. Điều chỉnh/hoàn tiền ghi nhận thời điểm hiện tại theo `created_at`, không sửa payment đã confirmed.
12. Bổ sung index cho: `(tenant_id, code)` referrers, liên kết patient/user, account email; chương trình trạng thái/ngày/priority; rule program-version-type-ngưỡng; case patient/status/branch/referrer/program; reward status; voucher status/expiry; payments patient-status-confirmed_at.

Giữ nguyên các cột referral hiện tại của `patients` và UI hiển thị dữ liệu lịch sử. Bỏ không dùng các cột này khỏi form ghi nhận referral mới sau rollout; không migration/backfill case tự động. Cho phép quản lý tạo case lịch sử thủ công chỉ qua endpoint riêng, bắt buộc lý do và trạng thái cần duyệt, nhưng mặc định không tạo reward nếu không được bật cờ ngoại lệ rõ ràng.

## API, services và giao diện cần bổ sung

1. Shared: bổ sung enums/interfaces/schemas Zod cho referrer, program/rule version, case, reward, voucher, account/portal session, filter/report và action payload. Ràng buộc số tiền VND, số ngày, loại liên kết, mã hợp lệ và lý do bắt buộc theo action.
2. API nội bộ: thêm `routes/referrers.ts`, `referral-programs.ts`, `referrals.ts`, `referral-reports.ts`; repositories và services tương ứng. Mount tại `apps/api/src/index.ts`; dùng `requireAuth`, permission mới, tenant scope và audit middleware.
3. Patient flow: thay input referral cũ trong `PatientForm` bằng tìm mã/chọn referrer; `patientService.create` gọi service tạo case trong transaction. `patientService.update` chặn sửa referral cũ/new case khi patient đã có confirmed payment; thêm endpoint change request thay vì mở PUT.
4. Payment flow: sau confirm/adjust gọi đánh giá case idempotent. Repository tính doanh thu phải không double-count payment, chỉ dùng tenant/patient và timestamps; test cả payment allocation nhiều item vì revenue theo payment, không theo item.
5. Reward operations: endpoint list/get/review/reopen/mark-paid/recover; enforce trạng thái chuyển đổi và tách người thực hiện. Voucher code chỉ trả đầy đủ cho nội bộ có quyền và portal owner sau xác thực.
6. Portal: thêm router `/api/referrer-auth` (login, activate, reset request, reset confirm, logout) và `/api/referrer-portal` (me/dashboard/cases/rewards/vouchers). Viết middleware portal JWT riêng, không tái sử dụng `requireAuth`/`JwtPayload` nội bộ.
7. Web: thêm `ReferrersPage`, `ReferralProgramsPage`, `ReferralsPage`, `ReferralReportsPage`, `ReferrerPortalLoginPage`, `ReferrerPortalActivatePage`, `ReferrerPortalDashboardPage`; route/shell/context portal riêng. Cập nhật constants routes, Sidebar và các API clients để nội bộ/portal không chia session storage hay header.
8. Scheduling: thêm Cloudflare Cron hằng ngày và `scheduled` handler để hết hạn case/reward chờ duyệt và voucher đã quá hạn. Handler chỉ ghi `referral_events` actor `system`; không giả danh user. Cập nhật `wrangler.jsonc` theo cơ chế deploy hiện có, không thay đổi các secret/production origin.

## Quy trình kiểm soát gian lận

1. **Bệnh nhân mới:** truy vấn CCCD toàn tenant, gồm hồ sơ archive; thấy bản ghi trước đó thì case không được tạo/không hợp lệ. Vẫn để hệ thống nghiệp vụ hiện tại xử lý duplicate đăng ký, nhưng referral tuyệt đối không đủ điều kiện.
2. **Tự giới thiệu:** chặn `referrer.linked_patient_id === case.patient_id`. Với referrer liên kết nhân viên, chặn nhân viên đó thao tác case/reward liên quan chính mình. Không tự chặn người cùng gia đình; trùng số điện thoại, số gia đình hoặc địa chỉ chỉ sinh `risk_flag` để reviewer xem xét.
3. **Mã và người nhận:** dùng mã ngẫu nhiên đủ dài, unique, hoạt động/inactive rõ ràng; một patient có unique case; mã không hợp lệ bị từ chối. Code lookup và portal login bị rate-limit theo IP/tài khoản để chống dò mã/brute-force.
4. **Chính sách không hồi tố:** case chụp program/version/branch/rule lựa chọn; thay đổi cấu hình không đổi case tồn tại. Case chỉ được tạo trong lúc bệnh nhân mới được đăng ký, ngoại lệ lịch sử cần quyền quản lý + lý do.
5. **Khóa sau doanh thu:** sau payment confirmed đầu tiên, thay/hủy referrer chỉ qua request hai người; log lý do, requester/reviewer và transition. Không cho xóa hard case/reward/voucher/payment.
6. **Đối soát tài chính:** chỉ payment confirmed trong cửa sổ mới tính; điều chỉnh âm làm đánh giá lại. Reward duyệt rồi không tự biến mất: chuyển `recovery_required`, cần chứng từ để kết thúc thu hồi. Cấm duyệt/chi/thu hồi bởi cùng người yêu cầu hoặc người liên kết referrer.
7. **Quyền và riêng tư:** tenant predicate ở toàn bộ query; RBAC ở Worker; audit nội bộ và event ledger; portal chỉ truy vấn bằng `referrer_id` từ JWT. Không log mã token, PII, CCCD, số điện thoại hay nội dung lâm sàng.
8. **Bất biến và cạnh tranh:** dùng D1 batch/conditional update để tạo một case/reward/voucher duy nhất; update trạng thái với `WHERE status IN (...)`; unique constraint là lớp bảo vệ cuối cùng. Khi có conflict, đọc lại state thay vì sinh trùng thưởng.

## Kế hoạch triển khai tuần tự

1. Thêm migration/schema/indexes và seed tối thiểu cho chương trình demo tắt mặc định; cập nhật shared types/constants/validation/permissions. Chạy migration local + seed để xác nhận tương thích dữ liệu cũ.
2. Xây repositories và services theo thứ tự: referrer/account/token, program/rule version, case/event/change request, reward/voucher/report. Bao bọc mọi truy vấn bằng `tenant_id` và dùng transaction/batch cho create/update liên quan.
3. Tích hợp ghi nhận case vào patient create/update và đánh giá case vào payment confirm/adjust; thêm `confirmed_at`. Không sửa behavior thanh toán ngoài hook đánh giá idempotent.
4. Cài API nội bộ, RBAC/audit, xử lý chi trả/thu hồi và cron hết hạn; triển khai email Resend native fetch + fallback link thủ công.
5. Xây các trang quản trị Người giới thiệu/chương trình/hàng đợi thưởng/báo cáo, sau đó cập nhật PatientForm/PatientDetail để dùng case mới và vẫn hiển thị referral lịch sử.
6. Xây portal auth/middleware/shell/pages tách session; kiểm tra API không thể truy cập chéo giữa JWT portal và JWT nội bộ.
7. Thêm dashboard/report query và CSV, tối ưu bằng index sau khi đo truy vấn local; chạy rollout chương trình ở trạng thái draft, tạo UAT cases, rồi mới active ở một chi nhánh thí điểm.

## Kiểm thử và tiêu chí nghiệm thu

1. **Migration:** `npm run d1:migrations:local` thành công trên schema/seed hiện tại; kiểm tra unique CCCD lịch sử/active không làm hỏng bảng cũ; dữ liệu referral legacy còn hiển thị.
2. **Chương trình:** chọn đúng chương trình ưu tiên theo chi nhánh/ngày/loại; case giữ đúng phiên bản khi chỉnh rule; từ chối ngưỡng/trùng ưu tiên/cửa sổ không hợp lệ.
3. **Ghi nhận:** mã hợp lệ tự chọn đúng referrer; mã sai/inactive và simultaneous code+manual bị chặn; patient cũ theo CCCD archive không có case; một patient không có hai case; tự giới thiệu bị chặn và quan hệ gần tạo flag.
4. **Tài chính:** pending/failed payment không đủ điều kiện; confirm đạt ngưỡng tạo đúng một reward chờ duyệt; nhiều payment chọn bậc cao nhất; percentage/fixed làm tròn đúng; điều chỉnh âm trước duyệt rút eligibility; điều chỉnh sau voucher/cash tạo recovery required.
5. **Workflow:** reviewer không thể duyệt request/reward của chính mình; accountant không duyệt nhưng mark paid được khi `cash_payable`; voucher có mã duy nhất/hạn dùng; hết hạn, mở lại, từ chối và thu hồi buộc lý do/chứng từ theo rule.
6. **Bảo mật:** tenant A không lookup/case/report/referrer portal của tenant B; JWT nội bộ và portal bị từ chối ở router của nhau; disabled portal account và token một lần/hết hạn không đăng nhập; response portal không chứa patient ID/name/phone/CCCD hoặc revenue.
7. **Báo cáo:** số liệu dashboard/CSV khớp sổ reward và payment fixtures theo filter; portal chỉ thấy aggregate/case/reward của chính referrer.
8. Chạy `npm run typecheck`, `npm run test --workspace apps/api`, `npm run build --workspace apps/web`, migration local + seed, và smoke API/portal auth trên môi trường local. Bổ sung Vitest service/route tests cho toàn bộ transition và test UI build cho route mới.

## Rollout và rủi ro

1. Deploy migration trước; code mới giữ referral legacy chỉ đọc nên không cần downtime/backfill. Chương trình mặc định `draft`/`inactive`, không tạo thưởng đến khi admin active.
2. Pilot một chương trình tại một chi nhánh trong cửa sổ ngắn; đối chiếu manual payment/referral/reward trước khi mở rộng chi nhánh hoặc loại referrer.
3. Xác minh `RESEND_API_KEY` và `REFERRAL_EMAIL_FROM` được đặt bằng secret Worker, sender đã xác thực. Fallback manual link chỉ hiển thị đúng một lần cho admin có quyền; không log token.
4. Theo dõi các case `risk_flag`, `expired`, `recovery_required`, thất bại email và conflict tạo case/reward. Không triển khai remote migration/deploy trong phạm vi kế hoạch này.
