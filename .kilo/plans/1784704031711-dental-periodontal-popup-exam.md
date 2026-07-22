# Cải Tiến Khám Răng Và Nha Chu

## Mục tiêu
- Đổi thao tác ghi nhận từ form nằm dưới sơ đồ sang popup theo ngữ cảnh để bác sĩ ghi nhanh.
- Ghi nhận `Vôi răng` và `Viêm nha chu` theo răng FDI, với vị trí bề mặt răng.
- Lưu độ sâu túi nha chu chuẩn 6 điểm, bắt buộc tối thiểu một điểm khi chọn Viêm nha chu.
- Mở rộng vị trí mô mềm/tuyến nước bọt có điều kiện theo cơ quan: tuyến cụ thể, trái-phải, trên-dưới, trong-ngoài khi có ý nghĩa giải phẫu.

## Quyết Định Đã Chốt
- Click một răng FDI mở popup, không hiển thị form nhập dài bên dưới sơ đồ.
- Popup theo răng có hai tab: `Răng & mô cứng` và `Nha chu`; sau khi lưu giữ popup mở để có thể ghi tiếp.
- Các nhóm Mô mềm, TMJ, Khớp cắn và Dự phòng dùng nút `Thêm ghi nhận` ở card nhóm, mở popup riêng không gắn răng.
- Điều trị nha chu sử dụng đo túi sáu điểm/răng: `mesiobuccal`, `midbuccal`, `distobuccal`, `mesiolingual`, `midlingual`, `distolingual`, đơn vị mm.
- Với `Viêm nha chu`, bắt buộc ít nhất một giá trị độ sâu túi hợp lệ. Với `Vôi răng` và `Viêm nướu`, chỉ chọn mặt tổn thương; số đo túi là tùy chọn.
- Đổi nhãn hiển thị `Cao răng` thành `Vôi răng`, giữ mã condition `calculus` để tương thích dữ liệu và API hiện tại.
- Vị trí giải phẫu dùng lựa chọn có điều kiện, không đưa các tổ hợp vô nghĩa vào UI.

## Mô Hình Dữ Liệu
1. Cập nhật `src/shared/types/index.ts`.
- Cho `periodontal` có `scope: "tooth"` ở finding mới; `anatomical_site: "gum"` được gán ngầm khi tạo từ popup nha chu.
- Giữ hỗ trợ `periodontal`/`region` cho finding lịch sử đã tồn tại, không di trú hoặc thay đổi chúng.
- Mở rộng `AnatomicalSite` với `parotid_gland`, `submandibular_gland`, `sublingual_gland`, `minor_salivary_gland`.
- Giữ `salivary_gland` trong union để đọc bản ghi legacy, nhưng không dùng nó như lựa chọn tạo mới.
- Mở rộng `FindingLocationDetails`:
  - `laterality: right | left | bilateral | midline` (đã có).
  - `vertical_position: upper | lower` cho môi và niêm mạc má.
  - `surface_orientation: internal | external` cho môi/niêm mạc má khi phù hợp.
  - Giữ `tooth_surfaces` cho mô cứng.
  - Thêm `periodontal_surfaces: mesial | distal | buccal | lingual` cho Vôi răng/viêm nướu theo răng.
- Thêm type hẹp cho số đo `PeriodontalPocketDepths` với sáu điểm nêu trên; lưu trong `measurements.periodontal_pocket_depth_mm` dạng object. Duy trì `FindingMeasurements` tổng quát để tương thích payload và dữ liệu đã lưu.

2. Cập nhật `src/shared/constants/clinical-findings.ts`.
- Thay label `calculus` ở category Nha chu thành `Vôi răng` và ở Dự phòng thành `Vôi răng toàn miệng`.
- Bổ sung nhãn cho các tuyến nước bọt cụ thể.
- Tạo constants dùng chung cho bốn mặt nha chu, sáu điểm túi nha chu, nhãn vị trí giải phẫu và helper format vị trí/độ sâu để tránh nhân bản nhãn trong UI/API.
- Khai báo ma trận vị trí hợp lệ theo anatomical site:
  - Tuyến mang tai, dưới hàm, dưới lưỡi: trái/phải/hai bên.
  - Tuyến nước bọt nhỏ: vị trí tự do theo ghi chú, không hiển thị hướng mặc định.
  - Môi và niêm mạc má: trái/phải, trên/dưới, trong/ngoài.
  - Lưỡi, vòm miệng, sàn miệng: trái/phải/hai bên/đường giữa.
  - Nướu: theo răng cho finding nha chu mới; giữ laterality/quadrant chỉ cho finding vùng legacy.
  - TMJ: trái/phải/hai bên.

3. Cập nhật `src/shared/validation/index.ts`.
- Cho phép `periodontal` có `scope: "tooth"` hoặc `scope: "region"` để đọc/tạo legacy đúng cách, nhưng popup mới chỉ gửi `tooth`.
- Với `periodontal`/`tooth`: bắt buộc FDI hợp lệ và `anatomical_site` là `gum` hoặc được service chuẩn hóa thành `gum`.
- Với `periodontitis`: kiểm tra `measurements.periodontal_pocket_depth_mm` là object, có ít nhất một trong sáu điểm, mọi giá trị là số hữu hạn trong miền lâm sàng hợp lý (0–20 mm).
- Với `periodontal_surfaces`: chỉ cho phép khi category là `periodontal` và scope là `tooth`; ít nhất một mặt khi condition là `calculus` hoặc `gingivitis`.
- Chỉ chấp nhận `vertical_position`/`surface_orientation` ở anatomical site được matrix cho phép; chỉ chấp nhận `laterality` ở site có side.
- Update schema phải cho phép chỉnh toàn bộ location/measurements; cân nhắc payload field null để người dùng có thể xóa metadata thay vì repository `COALESCE` giữ lại dữ liệu cũ.

4. Không cần migration D1 mới.
- Các cột `scope`, `anatomical_site`, `location_details_json`, `measurements_json` trong migration `0019` đã lưu được model mới.
- Không có CHECK constraint ràng buộc `periodontal` với `region`, nên thay đổi là validation/application-level.
- Dữ liệu legacy giữ nguyên: `calculus` không đổi mã, `salivary_gland` vẫn đọc được, finding nha chu vùng vẫn hợp lệ.

## API Và Persistence
1. Cập nhật `apps/api/src/services/visit.service.ts` và `apps/api/src/repositories/findings.repo.ts`.
- Gán `tooth_system: FDI` cho finding Nha chu theo răng, không chỉ scope `tooth_hard_tissue`.
- Chuẩn hóa `anatomical_site: gum` cho Nha chu theo răng ở service để client không thể lưu vị trí sai.
- Mở rộng update repository để phân biệt `undefined` (không thay đổi) và `null` (xóa metadata); loại bỏ hành vi `COALESCE` gây không thể xóa `location_details_json` hoặc `measurements_json`.
- Giữ tenant/visit ownership checks và mapping JSON an toàn hiện có.
- Đổi thứ tự `listByVisit` nếu cần để các finding nha chu theo răng nằm cạnh finding mô cứng cùng răng, nhưng không ảnh hưởng endpoint contract.

2. Cập nhật AI/voice để không mất chi tiết mới.
- `apps/api/src/services/voice-findings.service.ts`: prompt cho phép Nha chu theo răng (`scope=tooth`, FDI, `gum`), bốn mặt nha chu và `periodontal_pocket_depth_mm` sáu điểm; thêm site tuyến nước bọt cụ thể và location details có điều kiện.
- Rule-based fallback nhận dạng `vôi răng` cùng `cao răng`; nếu transcript có số răng, tạo Nha chu theo răng thay vì finding vùng.
- `apps/web/src/components/VoiceFindingsDialog.tsx`: mở rộng `ParsedFinding`, edit state và payload save để giữ `location_details`/`measurements`, thay vì bỏ các field AI trả về.
- `apps/api/src/services/ai.service.ts`, `ai-appointment.service.ts`, `PatientImageGallery.tsx`: cập nhật schema/prompt/mapping và label location để hiển thị răng nha chu, bề mặt, túi nha chu, tuyến cụ thể và hướng vị trí.

## UI
1. Thay form inline trong `apps/web/src/components/FdiToothChart.tsx`.
- Giữ bố cục FDI đã sửa: hai hàng theo hàm và đường giữa.
- Hiển thị trạng thái răng từ cả mô cứng và nha chu; dùng tooltip/legend hoặc badge để phân biệt nếu một răng có cả hai nhóm.
- Click răng mở `Dialog` với tiêu đề `Ghi nhận răng #<FDI>`.
- Tab `Răng & mô cứng`: condition, năm mặt răng hiện có, ghi chú, lưu.
- Tab `Nha chu`: condition; Vôi răng/viêm nướu dùng bốn mặt nha chu; Viêm nha chu mở bảng 2 x 3 cho sáu điểm túi với input mm và validation tại chỗ; ghi chú, lưu.
- Sau save: gọi `onCreated`, reset form của tab đang dùng, giữ dialog và răng đang chọn; toast xác nhận.
- Bảo đảm mobile dùng dialog dạng bottom sheet hiện có, các input túi không tràn ngang, có label thay vì chỉ viết tắt.

2. Nhóm không theo răng.
- Card sáu nhóm vẫn hiển thị count.
- Với Mô mềm, TMJ, Khớp cắn và Dự phòng, hiển thị nút `Thêm ghi nhận`; mỗi nút mở dialog category tương ứng.
- Form mô mềm dùng selector anatomy hai cấp: chọn cơ quan trước, sau đó chỉ hiển thị các control hướng hợp lệ theo ma trận.
- Các selection được trình bày bằng button chips hoặc select rõ nhãn `Bên`, `Trên/dưới`, `Bề mặt`; không render control không áp dụng.

3. `apps/web/src/components/FindingsList.tsx`.
- Hiển thị location đầy đủ: `Răng #36 · ngoài, gần`, `Túi nha chu: G-M 4 mm, G-N 5 mm`, `Tuyến dưới hàm trái`, `Niêm mạc má phải, trong, trên`.
- Form sửa cho phép cập nhật/xóa mặt răng, vị trí giải phẫu và measurements, không chỉ condition/notes.
- Nhãn condition lấy duy nhất từ catalog, vì vậy mọi màn hình tự động đổi `Cao răng` thành `Vôi răng`.

## Kiểm Thử
1. Bổ sung/điều chỉnh `apps/api/tests/routes/visits.test.ts`.
- POST Nha chu theo răng #36, condition `calculus`, bốn mặt hợp lệ.
- POST `periodontitis` #36 có một hoặc nhiều số đo sáu điểm hợp lệ.
- Từ chối `periodontitis` thiếu độ sâu túi, độ sâu ngoài miền, điểm không hợp lệ, Nha chu theo răng không FDI, surface nha chu sai category/scope.
- Từ chối hướng giải phẫu không hợp lệ cho site; chấp nhận tuyến dưới hàm trái và niêm mạc má phải/trên/trong.
- Xác nhận legacy `salivary_gland` và Nha chu scope `region` vẫn đọc/cập nhật được.

2. Thêm unit tests helper format labels/location nếu project có convention phù hợp; nếu không, che phủ qua route/API tests.

3. Chạy:
```powershell
npm run typecheck
npm run test --workspace apps/api -- --run tests/routes/visits.test.ts
npm run build
git diff --check
```
- Thử thủ công desktop và mobile: click #36, nhập Vôi răng theo mặt; nhập Viêm nha chu với sáu điểm; mở mô mềm và chọn tuyến/direction; sửa và xóa measurements; lưu liên tiếp trong popup.

## Rủi Ro Và Tương Thích
- Không đổi mã `calculus`, không đổi cấu trúc bảng, do đó không làm mất dữ liệu hay lịch sử.
- Các consumer hiện phân biệt finding theo `scope === tooth` phải được sửa để nhận diện Nha chu theo răng là location răng, không suy diễn category mô cứng.
- Voice/image AI có thể trả field ngoài catalog; validation phải từ chối an toàn hoặc UI buộc bác sĩ sửa trước khi lưu.
- Bác sĩ vẫn là người duyệt finding AI trước khi persistence; không tự động kết luận chẩn đoán từ transcript/image.
