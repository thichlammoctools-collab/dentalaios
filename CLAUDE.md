# CLAUDE.md

Behavioral guidelines + project-specific instructions cho **Dental Empire OS Clinic**.
Tradeoff: thiên về **cẩn trọng** hơn tốc độ. Với task tầm thường, dùng judgment.

---

## 0. Project snapshot (đọc trước khi sửa code)

**Stack cố định — không đề xuất thay thế khi chưa hỏi:**

| Layer | Tech |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind v4 + react-router-dom v7 + shadcn/ui |
| API | Hono trên Cloudflare Workers, TypeScript |
| Storage | Cloudflare D1 (SQLite) + R2 (private) |
| Jobs | Cloudflare Queues (`dentalaios-jobs`) |
| Tooling | Wrangler 4, npm workspaces, Node 24+ |

**Layout monorepo:**

```
dentalaios/
├── apps/
│   ├── web/        # React → Cloudflare Pages (alias @/*)
│   └── api/        # Hono Worker → Cloudflare Workers
├── src/
│   ├── shared/     # @shared/* — types, constants, validation (cả 2 app)
│   └── db/         # @db/* — migrations + seeds
```

**Resource names (cố định):** Worker `dentalaios`, D1 `dentalaios-db`, R2 `dentalaios-files`, Queue `dentalaios-jobs`.

**Aliases:** `@/*` (chỉ web) → `apps/web/src/*`; `@shared/*`, `@db/*` → `src/...`.

**Reference bắt buộc:** [`#dentalaiosguide.md.txt`](dentalaiosguide.md.txt) — định nghĩa sản phẩm, kiến trúc, security requirements. Bất kỳ đề xuất nào mâu thuẫn file này phải hỏi user trước khi làm.

---

## 1. Think Before Coding

**Đừng giả định. Đừng giấu sự mơ hồ. Surface tradeoffs.**

Trước khi implement:
- Nêu assumptions rõ ràng. Nếu không chắc → hỏi.
- Nếu có nhiều cách hiểu → trình bày, đừng chọn âm thầm.
- Nếu có approach đơn giản hơn → nói ra. Push back khi cần.
- Nếu thiếu thông tin → dừng. Name rõ điểm mơ hồ. Hỏi.

Đặc biệt với project này:
- Mọi thay đổi liên quan tới **schema D1** → xác nhận có cần migration mới không (file 4 chữ số ở `src/db/migrations/`).
- Mọi thay đổi **CORS / FRONTEND_ORIGIN** → nhắc user: production bắt buộc URL cụ thể, không được `*`.
- Mọi thay đổi **Lark** payload → xác nhận chỉ gửi field vận hành, không gửi dữ liệu lâm sàng.

---

## 2. Simplicity First

**Code tối thiểu giải quyết vấn đề. Không speculative.**

- Không feature ngoài yêu cầu.
- Không abstraction cho code dùng 1 lần.
- Không "flexibility" / "configurability" không được yêu cầu.
- Không error handling cho tình huống bất khả thi.
- 200 dòng có thể gọn 50 dòng → viết lại.

Tự hỏi: "Senior engineer đọc có nói overcomplicated không?" → Có → đơn giản hoá.

Project context: Worker có giới hạn bundle size và cold start — prefer Hono route gọn + repo function thẳng, tránh DI container / generic factory vô ích.

---

## 3. Surgical Changes

**Chỉ chạm chỗ cần. Chỉ dọn phần mình tạo ra.**

Khi sửa code có sẵn:
- Đừng "improve" code lân cận, comment, formatting.
- Đừng refactor thứ không hỏng.
- Match style hiện tại, kể cả khi bạn sẽ làm khác.
- Thấy dead code không liên quan → mention, **không tự xoá**.

Khi thay đổi của bạn tạo orphan:
- Xoá import/var/function mà **bạn** làm thừa.
- Không xoá dead code có sẵn trừ khi user yêu cầu.

Test: mỗi dòng đổi phải trace thẳng về request của user.

**Domain boundaries (rất quan trọng):**
- Frontend **chỉ** gọi Worker API — không truy cập D1/R2 trực tiếp.
- Worker truy cập D1/R2 qua **bindings** (`env.DB`, `env.FILES`), không qua URL public.
- Mọi clinical table có `tenant_id` — không bỏ qua khi viết migration.
- Mọi clinical action ghi `audit_logs` — dùng middleware `audit.ts` có sẵn.

---

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Biến task thành goal có thể verify:
- "Add validation" → "Viết test cho input invalid, rồi làm pass"
- "Fix bug" → "Viết test reproduce, rồi làm pass"
- "Refactor X" → "Test pass trước và sau"

Multi-step task → state plan ngắn:
```
1. [Bước] → verify: [check]
2. [Bước] → verify: [check]
3. [Bước] → verify: [check]
```

**Verification lệnh cụ thể của project:**

| Hành động | Verify |
|---|---|
| Đổi TS code | `npm run typecheck` |
| Đổi API behavior | `npm run test --workspace apps/api` (vitest) + smoke `curl :8787/api/health` |
| Đổi migration | `npm run d1:migrations:local` + xác nhận seed vẫn pass |
| Đổi CORS | Test với origin giả lập cả dev (`*`) và prod (URL cụ thể) |
| Đổi frontend route/page | `npm run build --workspace apps/web` |
| Deploy | Dùng `deploy.ps1` — không gõ lệnh có API token inline (bash classifier chặn) |

Strong criteria = loop độc lập. Weak criteria ("làm cho chạy") = hỏi lại liên tục.

---

## 5. Architecture rules (non-negotiable)

Từ `#dentalaiosguide.md.txt` — vi phạm bất kỳ rule nào phải hỏi user:

1. Frontend chỉ gọi Worker API.
2. Worker truy cập D1/R2 qua **bindings**, không qua URL public.
3. Mọi bảng clinical có `tenant_id`.
4. Mọi action clinical ghi `audit_logs`.
5. R2 bucket **private** — file access qua Worker kiểm tra quyền.
6. Không trust frontend role checks — RBAC middleware ở Worker (`middleware/rbac.ts`).
7. Gửi Lark chỉ field vận hành — **không gửi dữ liệu lâm sàng nhạy cảm**.
8. Không log patient data.
9. Repository pattern — D1 có thể migrate sau (đừng rải raw SQL ngoài `repositories/`).
10. Mọi request qua Vite proxy trong dev, hoặc `VITE_API_URL` trong prod.

---

## 6. Code style (project-specific)

**Khi viết API route mới:**
- Validate input bằng `@hono/zod-validator` với schema trong `src/shared/validation/`.
- Throw `AppError` từ `lib/errors.ts` — không return raw `Response` cho lỗi business.
- Audit log qua middleware `audit.ts`, không log tay trong handler.
- Nếu chạm R2 → dùng presigned URL qua `services/files.service.ts` (không trả key public).

**Khi viết migration:**
- Tên file 4 chữ số: `NNNN_descriptive_name.sql`.
- Bảng mới có clinical data → kèm `tenant_id` + index trên `tenant_id`.
- Không drop column trong cùng migration đã rename → tách migration.
- Có `down.sql` chỉ khi cần rollback production.

**Khi viết frontend page:**
- Page dùng `AppShell` + `RequireAuth` wrapper.
- API call qua `lib/api.ts` (đã có auth header), không fetch trực tiếp.
- Style dùng Tailwind v4 + component từ `components/ui/` — không inline `<style>`.
- State global chỉ qua `auth-context`; còn lại dùng local state hoặc React Router loader.

**Naming:**
- Routes: kebab-case trong URL (`/treatment-plans/:id`).
- React components: PascalCase.
- Repo functions: verb + noun (`getPatientById`, `listActiveVisits`).
- Constants: SCREAMING_SNAKE trong `src/shared/constants/`.

---

## 7. Không tự ý làm (danh sách cấm)

- Đẩy secret (JWT, Lark credentials) lên git hoặc in ra log.
- Đổi `wrangler.jsonc` `database_id`, `FRONTEND_ORIGIN` production mà chưa hỏi.
- Tạo R2 public URL / signed URL dài hạn cho file clinical.
- Thêm dependency mới mà chưa xác nhận cần (Worker bundle size + cold start).
- Refactor toàn bộ theo style khác "vì thấy hơi xấu".
- Sửa UI trong khi user chỉ hỏi về API (và ngược lại).
- Chạy `wrangler deploy` / `wrangler d1 execute --remote` mà chưa được yêu cầu rõ.
- Commit thay cho user — chỉ stage/commit khi user nói.

---

## 8. Khi user báo bug

1. Reproduce: đọc code + check `git log` + check D1 local nếu cần.
2. Tìm root cause, đừng patch triệu chứng.
3. Sửa tối thiểu, có test nếu project đang dùng vitest.
4. Verify: `typecheck` + test + smoke flow thật (qua `dev:api` + `dev:web`).
5. Báo cáo ngắn: nguyên nhân, fix, cách verify.

---

## 9. Working memory

- Test login demo: `admin@demo.clinic` / `password123`.
- Production URL: Worker `dentalaios.workers.dev`, Pages `dentalaios-web.pages.dev`.
- D1 database_id: xem `apps/api/wrangler.jsonc` (commit `32560ab`).
- Bash classifier chặn command có API token inline → dùng `deploy.ps1` hoặc `wrangler secret put` interactive.
- CORS wildcard `*` ở `FRONTEND_ORIGIN` chỉ OK ở dev — prod phải URL cụ thể.

---

**Guidelines hoạt động tốt nếu:** diff gọn hơn, ít phải rewrite vì overcomplicate, và câu hỏi làm rõ đến **trước** khi implement thay vì sau khi sai.
