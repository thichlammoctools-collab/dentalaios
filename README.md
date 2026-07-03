# Dental Empire OS Clinic

Cloudflare-only MVP cho quy trình lâm sàng tại ghế (chairside clinical workflow) của phòng khám nha khoa. Đọc thêm tại [`#dentalaiosguide.md.txt`](#dentalaiosguidemdtxt).

**MVP scope:** visits → findings by tooth → treatment plan → PDF proposal → Lark handover.
**Không trong scope:** appointment scheduling UI (dùng Lark Calendar), payment gateway, AI diagnosis.

---

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18, Vite, TypeScript, Tailwind v4, shadcn/ui, react-router-dom v7 |
| API | Hono trên Cloudflare Workers, TypeScript |
| Storage | Cloudflare D1 (SQL), R2 (private files) |
| Jobs | Cloudflare Queues |
| Tooling | Wrangler 4, npm workspaces |

---

## Cấu trúc project

```
dentalaios/
├── apps/
│   ├── web/                # React app → Cloudflare Pages
│   └── api/                # Hono Worker → Cloudflare Workers
├── src/
│   ├── shared/             # types, constants, validation (dùng chung cả 2 app)
│   │   ├── types/
│   │   ├── constants/
│   │   └── validation/
│   └── db/
│       ├── migrations/     # wrangler d1 migrations apply
│       └── seeds/
└── #dentalaiosguide.md.txt # project guide
```

### Mapping guide → code

| Guide định nghĩa | Code thực tế |
|---|---|
| `src/app/` | `apps/web/src/` |
| `src/worker/` | `apps/api/src/` |
| `src/shared/` | `src/shared/` |
| `src/db/` | `src/db/` |

---

## Prerequisites

- **Node.js 24+** (đã có trong `.nvmrc`)
- **npm 11+**
- **Cloudflare account** + `wrangler login` đã chạy thành công

---

## Install

```bash
npm install
```

Lệnh này cài deps cho cả 2 workspaces (`apps/api` và `apps/web`).

---

## Dev workflow

Mở 2 terminal:

```bash
# Terminal 1 — Worker API (port 8787)
npm run dev:api

# Terminal 2 — Vite frontend (port 5173)
npm run dev:web
```

Vite proxy tự động chuyển `/api/*` sang Worker ở `http://127.0.0.1:8787`, nên browser thấy mọi request là same-origin.

Mở <http://localhost:5173> và kiểm tra `/login` placeholder.

**Smoke test API:**

```bash
curl http://localhost:8787/api/health
# → { "ok": true, "env": "development", "timestamp": "..." }
```

---

## Cloudflare resources

Resource names cố định:

| Resource | Name | Binding trong Worker |
|---|---|---|
| Worker | `dentalaios` | (chính nó) |
| D1 database | `dentalaios-db` | `DB` |
| R2 bucket | `dentalaios-files` | `FILES` |
| Queue | `dentalaios-jobs` | `JOBS` |

### Tạo resources (lần đầu tiên)

```bash
cd apps/api

# 1. Login Cloudflare (mở browser OAuth)
npx wrangler login

# 2. Tạo D1 database — sẽ trả về database_id (UUID)
npx wrangler d1 create dentalaios-db
# → Copy UUID, paste vào apps/api/wrangler.jsonc (database_id field)

# 3. Tạo R2 bucket
npx wrangler r2 bucket create dentalaios-files

# 4. Tạo Queue
npx wrangler queues create dentalaios-jobs
```

### Apply migrations + seeds

```bash
cd apps/api

# Local (SQLite emulation)
npx wrangler d1 migrations apply dentalaios-db --local
npx wrangler d1 execute dentalaios-db --local --file=../../src/db/seeds/0001_roles.sql

# Remote (sau khi deploy lần đầu)
npx wrangler d1 migrations apply dentalaios-db --remote
npx wrangler d1 execute dentalaios-db --remote --file=../../src/db/seeds/0001_roles.sql
```

---

## Scripts tiện ích

Từ root:

| Lệnh | Mô tả |
|---|---|
| `npm install` | Cài deps cho cả workspaces |
| `npm run dev:api` | Chạy Worker dev (wrangler dev, port 8787) |
| `npm run dev:web` | Chạy Vite dev (port 5173) |
| `npm run typecheck` | TypeScript check cho cả 2 workspaces |
| `npm run build` | Build cả 2 workspaces |

Từ `apps/api`:

| Lệnh | Mô tả |
|---|---|
| `npm run deploy` | Deploy Worker lên Cloudflare |
| `npm run d1:migrations:local` | Apply migrations local |
| `npm run d1:seed:local` | Run seed local |
| `npm run d1:migrations:remote` | Apply migrations remote |
| `npm run d1:seed:remote` | Run seed remote |

---

## Path aliases

| Alias | Trỏ tới |
|---|---|
| `@/*` | `apps/web/src/*` (chỉ trong web) |
| `@shared/*` | `src/shared/*` (cả 2 apps) |
| `@db/*` | `src/db/*` (cả 2 apps) |

Ví dụ trong frontend:

```typescript
import { ROUTES, ROLES } from "@shared/constants";
import type { Patient } from "@shared/types";
```

Ví dụ trong Worker:

```typescript
import type { Patient } from "@shared/types";
```

---

## Architecture rules (từ guide)

1. Frontend chỉ gọi Worker API.
2. Worker truy cập D1/R2 qua **bindings** (không qua URL public).
3. Mọi bảng clinical có `tenant_id`.
4. Mọi action clinical ghi `audit_logs`.
5. R2 bucket **private** — file access qua Worker kiểm tra quyền.
6. Không trust frontend role checks — RBAC middleware phía Worker.
7. Gửi Lark chỉ field vận hành — không gửi dữ liệu lâm sàng nhạy cảm.
8. Không log patient data.
9. Repository pattern — D1 có thể migrate sau.
10. Mọi request qua Vite proxy trong dev, hoặc qua `VITE_API_URL` trong prod.

---

## Verification sau Phase 1

1. `npm install` không lỗi
2. `npm run dev:api` → Worker chạy :8787
3. `curl :8787/api/health` → `{ ok: true }`
4. `npm run dev:web` → Vite chạy :5173
5. Mở browser `/login` thấy placeholder
6. Network tab: request `/api/health` được Vite proxy sang Worker
7. Sau khi `wrangler login` + tạo resources: `d1:migrations:local` thành công
8. `npm run typecheck` không lỗi

---

## Roadmap

| Phase | Scope | Trạng thái |
|---|---|---|
| 1 | Skeleton: monorepo, Hono, Vite, shared types, D1 migrations | ✅ Done |
| 2 | Auth (JWT) + RBAC + tenant middleware + clinical tables | Planned |
| 3 | Patient list/detail, basic CRUD | Planned |
| 4 | Visit + clinical finding (FDI) + treatment plan + PDF + Lark | Planned |
| 5 | Payments tracking, queue consumers, audit dashboard | Planned |

---

## License

Private — internal project.