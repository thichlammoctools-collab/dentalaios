# Super Admin Dashboard Plan

## Muc Tieu Va Quyet Dinh Da Chot

- Xay dung mot console quan tri nen tang rieng cho Super Admin, quan tri xuyen tenant (tat ca phong kham), tach biet hoan toan voi dashboard van hanh cua mot tenant tai `/management-dashboard`.
- Super Admin V1 duoc phep tao, xem, cap nhat thong tin van hanh, kich hoat/tam ngung tenant; xem chi so tong hop, logs nen tang, feature flags, gioi han va trang thai tich hop. Khong xem PII/du lieu lam sang, khong impersonate, khong xoa cung tenant.
- Dung danh tinh nen tang rieng: `platform_users`, `platform_roles`, JWT co `scope: "platform"`, API duoi `/api/platform/*`. Khong them co `super_admin` vao `users`, khong dung quyen `all` cua tenant de cap quyen nen tang.
- Bat buoc TOTP MFA. Phien nen tang toi da 8 gio, idle timeout 30 phut; can xac thuc lai trong 15 phut truoc khi thay doi trang thai tenant, cap quyen Super Admin, hoac sua cau hinh nhay cam.
- RBAC V1 la catalog co dinh, khong cho role tuy bien: `platform_owner`, `platform_operator`, `platform_auditor`.
- Quan ly noi dung V1 bao gom thong bao trong ung dung va bai viet tro giup van hanh, pham vi global hoac tenant, co lich phat hanh. Khong xay CMS marketing, media library, hay noi dung lam sang.
- Secrets va gia tri credential khong bao gio hien thi/sua trong dashboard. Van hanh bang Cloudflare/Wrangler secrets; dashboard chi hien thi metadata trang thai va thoi diem cap nhat.

## Hien Trang Va Ranh Gioi Can Giu

- `users`, `roles`, `audit_logs`, JWT hien tai deu bat buoc `tenant_id`; `requireAuth()` tai `apps/api/src/middleware/auth.ts` rehydrate user theo tenant va `getTenantId()` tai `apps/api/src/middleware/tenant.ts` la ranh gioi cach ly clinical. Giu nguyen luong nay.
- `requirePermission()` tai `apps/api/src/middleware/rbac.ts` va `PERMISSIONS.ALL` chi ap dung tenant. Tao middleware va permission catalog nen tang rieng thay vi mo rong middleware nay theo cach co the bo qua tenant scope.
- Dashboard hien tai tai `apps/web/src/pages/ManagementDashboardPage.tsx` va `/api/dashboard/management` la bao cao cua mot tenant, khong duoc dung lai lam API cross-tenant. Co the tai su dung cac quy tac aggregate da duoc kiem chung, nhung phai loai bo du lieu dinh danh/clinical o query nen tang.
- `audit_logs` hien tai co FK den `users`; can bang audit nen tang rieng de tranh chen `platform_user_id` vao schema va de giu audit tenant hien tai on dinh.

## Mo Hinh Du Lieu, Auth Va RBAC

1. Them migration D1 ke tiep theo (sau migration so lon nhat hien co; kiem tra lai khi implement) voi cac bang:
   - `platform_roles`: `id`, `key` unique, `name`, `permissions` JSON, `created_at`; seed ba role co dinh.
   - `platform_users`: `id`, `role_id`, `email` unique, `name`, `password_hash`, `is_active`, `mfa_secret_encrypted`, `mfa_enabled_at`, `last_login_at`, `created_at`, `updated_at`. Khong co `tenant_id`, `branch_id`, hoac lien ket den bang `users`.
   - `platform_sessions`: `id`/`jti`, `platform_user_id`, `issued_at`, `expires_at`, `last_seen_at`, `revoked_at`, `mfa_verified_at`, `ip_hash`, `user_agent_hash`. Middleware kiem tra session chua bi revoke, user dang active, va thoi han idle/tuyet doi tren moi request.
   - `platform_mfa_recovery_codes`: hash code recovery, `platform_user_id`, `used_at`, `created_at`; cung cap bo code mot lan sau khi kich hoat TOTP.
   - `platform_audit_logs`: `id`, `platform_user_id`, `action`, `entity_type`, `entity_id`, `tenant_id` nullable, `result`, `reason` nullable, `request_id`, `ip_hash`, `user_agent_hash`, `details` JSON da allow-list, `created_at`. Chi insert, khong co API update/delete.
   - `platform_feature_flags`: `key` unique, `description`, `default_enabled`, `created_at`, `updated_at`; va `platform_tenant_feature_overrides` voi unique `(tenant_id, flag_key)`, `enabled`, `updated_by`, `updated_at`.
   - `platform_tenant_limits`: unique `tenant_id`, chi cac cot allow-list nhu `max_users`, `max_branches`, `storage_quota_bytes`, `updated_by`, `updated_at`.
   - `platform_content`: `id`, `kind` (`announcement` | `help_article`), `title`, `body_markdown`, `status` (`draft` | `scheduled` | `published` | `archived`), `audience` (`global` | `tenant`), `tenant_id` nullable, `publish_at`, `expire_at` nullable, `created_by`, `updated_by`, timestamps. Rang buoc: `tenant_id` bat buoc khi audience la tenant va null khi global.
   - `platform_integration_status`: metadata allow-list theo integration/global hoac tenant: `provider`, `tenant_id` nullable, `enabled`, `health_status`, `last_checked_at`, `last_success_at`, `last_error_code` da sanitize, `updated_at`; tuyet doi khong co secret/token/URL day du.
2. Them index cho login (`platform_users.email`), session active/expiry, audit (`created_at`, `platform_user_id`, `tenant_id`, `action`), content publication, flag override va tenant lifecycle filter. Dung `IF NOT EXISTS` va khong backfill du lieu clinical.
3. Them cac shared contracts trong `src/shared/types/index.ts` va schema Zod trong `src/shared/validation/index.ts`:
   - `PlatformRoleKey`, `PlatformPermission`, `PlatformUser`, session/claims, tenant summary/detail an toan, aggregate KPI, feature flag, limit, content va audit DTO.
   - Query schema pagination cursor/limit, sort allow-list, keyword da gioi han; filter tenant status, date range gioi han, content status/audience va audit action. Khong chap nhan raw SQL field/sort, arbitrary tenant scope, hay detail clinical.
   - Permission catalog toi thieu: `platform_dashboard.read`, `platform_tenants.read`, `platform_tenants.write`, `platform_content.read`, `platform_content.write`, `platform_config.read`, `platform_config.write`, `platform_admins.read`, `platform_admins.write`, `platform_audit.read`.
   - Role mapping: owner co tat ca; operator co dashboard/tenant/content/config, khong `platform_admins.write`; auditor chi co cac quyen `.read`. Cac quyen `write` nhay cam phai them `step_up_required` o route.
4. Tao `apps/api/src/lib/platform-jwt.ts` cho token co issuer/audience rieng, `scope: "platform"`, `sid`/`jti`, role key va permission; dung signing secret rieng `PLATFORM_JWT_SECRET`, khong tai su dung `JWT_SECRET`. TTL token phu hop voi absolute session 8 gio; session DB la nguon revocation.
5. Tao `platformAuth`, `requirePlatformPermission`, `requireRecentPlatformMfa`, va helper request metadata rieng trong `apps/api/src/middleware/`. Middleware phai tu choi token tenant o namespace platform va tu choi token platform o namespace tenant. `requireRecentPlatformMfa` kiem tra `mfa_verified_at >= now - 15 minutes`.
6. Ma hoa TOTP secret truoc khi luu bang key rieng `PLATFORM_MFA_ENCRYPTION_KEY` (AES-256-GCM, versioned encrypted envelope); chi giai ma trong Worker de verify. Recovery code chi luu hash manh va danh dau da dung trong transaction.

## API Va Dich Vu

1. Tao router `apps/api/src/routes/platform-auth.ts` va dich vu/repository tuong ung:
   - `POST /api/platform/auth/login`: email/password, rate limit nghiem hon login tenant, khong cap session hoan chinh neu chua MFA.
   - `POST /api/platform/auth/mfa/verify`: verify TOTP hoac recovery code, tao session/token, audit login thanh cong/that bai ma khong ghi bi mat.
   - `POST /api/platform/auth/logout`, `GET /api/platform/auth/me`, `POST /api/platform/auth/reauth`: reauth password + TOTP de cap lai `mfa_verified_at`.
   - Cac endpoint provision/rotate TOTP va recovery code chi dung cho user dang authenticated, yeu cau reauth, tra QR provisioning URI mot lan qua response `no-store`, va ghi audit.
2. Tao `apps/api/src/routes/platform.ts` (hoac router con theo resource), mount tai `apps/api/src/index.ts` duoi `/api/platform`; moi endpoint tru endpoint login/MFA deu bat buoc platform middleware:
   - `GET /dashboard`: KPI toan nen tang theo khoang 7/30/90 ngay, trend tenant active/new/suspended, user active aggregate, branch aggregate, request/integration health aggregate. Khong truy van/tra patient, visit detail, payment reference, hay clinical data.
   - `GET /tenants`, `POST /tenants`, `GET /tenants/:id`, `PATCH /tenants/:id`: danh sach va ho so van hanh an toan. Detail chi gom tenant, branch/user count, aggregate usage, limits, flags, integration metadata va audit link.
   - `POST /tenants/:id/suspend` va `POST /tenants/:id/activate`: yeu cau `platform_tenants.write`, reauth gan day, reason bat buoc, optimistic-version/updated-at de tranh ghi de, idempotent transition va `platform_audit_logs`. Khong `DELETE`.
   - `GET/PUT /feature-flags`, `GET/PUT /tenants/:id/feature-flags`, `GET/PUT /tenants/:id/limits`, `GET /integrations/status`: validate key/limit allow-list; cac PUT nhay cam yeu cau step-up va audit before/after da redact.
   - `GET/POST/PATCH /content` va transition `publish/archive`: draft/scheduled/published lifecycle, validate scope/audience, sanitize Markdown at render time, cho phep archive thay vi delete; publish/schedule la audited mutation.
   - `GET /admins`, `POST /admins`, `PATCH /admins/:id`: chi owner; tao/kich hoat/tam ngung/gan role Super Admin. Khong cho phep owner tu demote/tam ngung chinh minh, khong cho phep vo hieu hoa owner cuoi cung.
   - `GET /audit-logs`: filters allow-list, cursor pagination, readonly, mask request metadata; khong tra `details` nhay cam neu role auditor khong co quyen can thiet.
3. Tao repository moi `platform-users.repo.ts`, `platform-sessions.repo.ts`, `platform-tenants.repo.ts`, `platform-config.repo.ts`, `platform-content.repo.ts`, `platform-audit-logs.repo.ts`; moi query cross-tenant nam trong repository platform, khong them “tenantId optional” vao repository clinical.
4. Dinh nghia chi so dashboard ro rang va chi dung aggregate:
   - Active tenant: `tenants.is_active = 1`; new tenant theo `tenants.created_at`; suspended trong ky tu `platform_audit_logs` action `tenant.suspended`.
   - Usage chi dem `users`, `branches`, appointment/visit/payment theo tenant theo gioi han ky; neu hien thi doanh thu, chi hien thi tong VND theo tenant/nen tang va khong tra reference/nguon thanh toan. Xac nhan yeu cau tu phap ly/ke toan truoc khi bat metric doanh thu cross-tenant trong production.
   - Health dua tren integration metadata va Cloudflare/application telemetry da redact; khong dua stack trace, token, email, patient ID vao API/UI/log.
5. Them `platformAuditLog()` middleware/helper chi ghi sau mutation thanh cong, co action taxonomy on dinh (vi du `tenant.created`, `tenant.suspended`, `flag.override.updated`, `admin.role.changed`, `content.published`). Audit failure duoc dua vao security telemetry va khong lam mat tinh nhat quan mutation nhay cam: voi suspend/activate va cap quyen, thuc hien ghi domain change + audit cung `DB.batch()`; neu batch that bai thi rollback/bao loi.

## Sitemap Va UX

1. Tao khu vuc web tach biet duoi `/platform`, dung `PlatformAppShell`, `PlatformRequireAuth`, `PlatformSidebar`, `PlatformTopbar` va platform auth storage rieng (`platform_session`), khong dung `AuthContext`/`AppShell` cua tenant. Co the cung deploy cung React app, nhung khong hien navigation platform trong sidebar tenant va khong cho platform token truy cap API tenant.
2. Sitemap V1:
   - `/platform/login` va `/platform/mfa`: login, MFA, recovery code, logout.
   - `/platform/dashboard`: tong quan nen tang.
   - `/platform/tenants`: tenant directory voi tim kiem/filter trang thai.
   - `/platform/tenants/:id`: tabs `Tong quan`, `Cau hinh`, `Gioi han`, `Feature flags`, `Noi dung`, `Audit`; khong co tab du lieu lam sang hay user detail cua phong kham.
   - `/platform/content`: announcements va help articles.
   - `/platform/configuration`: feature flags global, limits mac dinh, integration status va template thong bao.
   - `/platform/admins`: Super Admin va role, chi owner.
   - `/platform/audit-logs`: audit nen tang readonly.
3. Dashboard UX:
   - Header co khoang thoi gian 7/30/90, last refreshed va canh bao health tong hop; query state luu tren URL.
   - KPI cards: active/suspended/new tenants, tenant co loi integration, aggregate active users/branches, usage theo limit. Chart trend co bang du lieu thay the, khong chi dung mau sac.
   - “Can xu ly” chi hien thi tenant name, loai loi/count/trang thai, CTA den tenant detail; khong hien thi patient, clinical action, email nguoi dung tenant, hoac noi dung loi nhay cam.
4. Tenant directory UX:
   - Server-side cursor pagination, filter active/suspended, search theo tenant name/slug, sort allow-list; rows chi co ma tenant, ten, trang thai, branch/user count, usage, integration health, cap nhat gan nhat.
   - Tenant detail lam viec theo action card. Suspend/activate bat buoc dialog hai buoc: ly do, nhap lai tenant slug, reauth MFA neu stale, ket qua va audit reference. Hien thi ro rang anh huong “toan bo user tenant se khong dang nhap duoc”.
5. Content UX:
   - Table draft/scheduled/published/archived, filter audience. Editor Markdown co preview sanitiszed, pham vi global/tenant, publish_at/expire_at, validation timezone Asia/Ho_Chi_Minh, va archive thay delete.
6. Configuration UX:
   - Flags hien effective value (default va override); limits so voi usage; integration chi hien badge status va `last_checked_at`. Tat ca ghi thay doi hien diff allow-list, confirmation, step-up neu nhay cam va toast co audit ID.
7. UX chung: responsive mobile-first, desktop table co card fallback tren man hinh nho, skeleton/loading/error/retry/empty states, focus management trong dialog, keyboard navigation, label/ARIA, va toast khong tiet lo error nhay cam.

## Tech Stack Va Tich Hop

- Giu stack hien tai: React 18 + Vite + TypeScript + React Router 7 + Tailwind v4 o `apps/web`; Hono + TypeScript tren Cloudflare Workers o `apps/api`; D1 cho relational state, R2 chi khi sau nay can attachment noi dung, Cloudflare Queues cho job health-check/publish scheduled.
- Giu nguyen UI primitives hien co trong `apps/web/src/components/ui`; khong them chart/CMS library o V1. Dung SVG/HTML accessible chart nhu dashboard hien tai.
- Them thu vien TOTP Workers-compatible chi neu can (RFC 6238 implementation thu vien da duoc audit), va dung `crypto.subtle`/helper AES-GCM hien co de ma hoa secret. Khong dua Node-only dependency vao Worker.
- Dung Cloudflare Cron Trigger hoac Queue consumer de cap nhat `platform_integration_status`, phat hanh/huy phat hanh scheduled content va cleanup sessions/expired recovery records; job phai idempotent, retry-safe va audit system action co actor `system` tach biet.
- Them Cloudflare bindings/secrets: `PLATFORM_JWT_SECRET`, `PLATFORM_MFA_ENCRYPTION_KEY`, va logging/telemetry binding neu duoc phep. Cap nhat `apps/api/wrangler.jsonc`, tai lieu deployment environment va secret provisioning, nhung khong ghi gia tri secret vao repo.

## Bao Mat Va Kiem Soat Truy Cap

- Tach biet issuer/audience/secret, route prefix, storage key va middleware cua platform va tenant. Tu choi bat ky token sai `scope`; day la control bat buoc truoc RBAC.
- Password platform toi thieu 14 ky tu, kiem tra password bi lo (neu dich vu/nguon duoc phep), bcrypt cost phu hop Workers, generic login errors, rate limit theo IP va email hash, delay/backoff va audit failed login khong ghi email raw.
- MFA TOTP bat buoc truoc khi co quyen platform; recovery code mot lan; revoke tat ca platform sessions sau reset password, disable user, doi role, hoac rotate MFA. Cookie/session response dung `Cache-Control: no-store`; neu van dung bearer token trong SPA, khong luu localStorage, giu memory va refresh qua Secure/HttpOnly/SameSite=Strict cookie hoac danh gia client architecture truoc khi implement.
- Kiem tra session DB moi request cho revocation, absolute 8h, idle 30 phut; renew `last_seen_at` co throttle de tranh write amplification. Step-up 15 phut cho mutation nhay cam va ket hop server-side, khong chi an/hien UI.
- Apply least privilege o route, repository va data projection. API platform chi tra DTO aggregate/allow-list; cam query patient, medical alert, finding, note, image, file object, dia chi, phone, email tenant user, password hash, token, R2 key va raw integration error.
- Tenant lifecycle: suspend chi set `tenants.is_active = 0`; `requireAuth()` tenant da tu choi user khi tenant inactive. Can mo rong cac public/invite/verify endpoints de khong kich hoat hay cap session cho tenant suspended; activate khoi phuc access ma khong thay doi clinical data.
- Protect mutation bang schema validation, parameterized D1 bind, optimistic concurrency, CSRF protection neu dung cookie, CORS origin explicit, CSP/anti-clickjacking/Referrer-Policy, rate limiting, correlation ID va structured redacted logging.
- Audit nen tang append-only: ghi actor/action/target/result/reason/metadata allow-list, IP va UA hash co salt quay vong; retention va export access duoc quy dinh bang chinh sach phap ly. Khong log TOTP, recovery code, bearer token, password, secret, PII hoac HTML/Markdown raw nhay cam.
- Khong co impersonation, no hard delete, no secret management, no SQL console, no arbitrary export o V1. Moi action nguy hiem can confirmation, reauth va immutable audit.

## Trinh Tu Trien Khai

1. Ra soat migration number, `wrangler.jsonc`, auth storage/context va test harness; chot enum permission/action, policy retention audit va danh sach metric duoc phep truoc khi viet schema.
2. Them migration, seed bootstrap owner qua quy trinh deploy an toan (khong hard-code credential), shared types/constants/validation va repository platform. Apply truoc tren D1 local trong moi truong disposable.
3. Implement platform JWT/session/MFA/auth router va middleware; giu test tenant auth/RBAC de xac nhan khong co regression/cross-scope acceptance.
4. Implement tenant lifecycle, dashboard aggregate-safe, flags/limits/integration metadata, content va admin/audit APIs theo thu tu read truoc write; mount tai `/api/platform`.
5. Implement platform layout, auth flow, dashboard, tenant pages, config/content/admin/audit pages va route guards; them mobile/accessibility/error states.
6. Them cron/queue jobs cho content schedule, session cleanup va health metadata neu binding/scheduler da san sang; neu chua, hien thi manual refresh va ghi ro scope out-of-band.
7. Chay test, typecheck/build, security acceptance, apply migration remote va deploy Worker/Pages. Bootstrap owner/MFA qua runbook ngoai repo, kiem tra audit log va rollback plan truoc khi mo quyen.

## Validation Va Rollout

1. Unit test JWT/scope, TOTP/recovery code, encryption envelope, session absolute/idle/revocation, step-up expiry, RBAC matrix, optimistic concurrency va audit redaction.
2. Route/integration test:
   - Tenant JWT bi tu choi o `/api/platform/*`; platform JWT bi tu choi o tenant API; unauthenticated 401 va thieu permission 403.
   - Operator khong the quan ly admins; auditor khong the mutate; owner khong the tu vo hieu hoa owner cuoi cung.
   - Suspend/activate idempotent, bat buoc reason/reauth, ghi audit va chan tenant login/verify/invite nhu ky vong; khong thay doi du lieu clinical.
   - Tenant list/detail/dashboard khong serialize PII, patient IDs, clinical fields, file keys hay integration secrets; foreign tenant override khong the doc/ghi sai target.
   - Content scheduling/audience/timezone/archive va feature flag effective-value behavior dung nhu DTO.
3. Frontend manual acceptance: login -> MFA -> dashboard; session idle/absolute timeout; stale reauth dialog; role-specific navigation/API denial; tenant filter/pagination; suspend/activate confirmation; content preview/schedule; config diff; desktop/mobile, keyboard va screen reader smoke pass.
4. Chay `npm run typecheck`, `npm run build`, `npm run test --workspace apps/api`. Bo sung web test harness chi khi duoc thong qua; neu khong, luu checklist manual trong PR/deploy record.
5. Rollout: migration local -> staging/remote, deploy API truoc UI, bootstrap duy nhat owner va bat MFA, test canary voi tenant demo, monitor auth failure/rate-limit/audit health, sau do mo quyen operator/auditor. Rollback bang disable route/UI va revoke platform sessions; khong rollback schema pha huy.

## Ngoai Pham Vi V1

- Xem/chinh sua ho so benh nhan, hinh anh, PDF, findings, visits, ghi chu, thanh toan chi tiet hoac PII cua tenant.
- Impersonation, hard delete, secret/token editor, SQL console, CMS marketing, media library, SSO/SAML/SCIM, role tuy bien, bao cao/export cross-tenant chi tiet va tu dong cap quyen tenant.
- Thay doi luong auth, RBAC, dashboard, clinical APIs va cach ly tenant hien tai, ngoai cac check can thiet de tenant suspended khong the tao session.
