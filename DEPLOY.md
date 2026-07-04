# Deploy to Cloudflare

Bash classifier chặn việc chạy commands có API token trong command line. Mình đã tạo script PowerShell để bạn chạy thủ công.

## Bước 1: Chạy script deploy

Mở PowerShell tại `C:\Github\dentalaios`:

```powershell
cd C:\Github\dentalaios
.\deploy.ps1
```

Script sẽ tự động:

1. Apply 3 D1 migrations (0001_init, 0002_clinical_tables, 0003_rate_limit)
2. Seed 4 roles + 4 demo users
3. Set Worker secret `JWT_SECRET` (script sẽ prompt paste secret)
4. Deploy Worker lên Cloudflare
5. Build frontend
6. Tạo Pages project `dentalaios-web`
7. Deploy frontend lên Pages
8. Update Worker's `FRONTEND_ORIGIN` cho production
9. Re-deploy Worker với origin mới
10. Smoke test login flow

## Bước 2: Sau khi deploy xong

Script output cuối sẽ cho:
- **Worker URL**: `https://dentalaios.workers.dev`
- **Pages URL**: `https://dentalaios-web.pages.dev`
- **Demo login**: `admin@demo.clinic` / `password123`

## Bước 3: Smoke test thủ công (optional)

Mở browser tại `https://dentalaios-web.pages.dev`:
1. Login v���i `admin@demo.clinic` / `password123`
2. Tạo bệnh nhân mới
3. Mở patient → tạo visit → FDI chart → click răng
4. Tab Plans → tạo plan → add items → approve
5. Generate PDF → download
6. Lark handover (mock nếu chưa set credentials)

## Bước 4: (Optional) Set Lark credentials để enable thật

Nếu bạn có Lark app:

```powershell
cd C:\Github\dentalaios\apps\api
npx wrangler secret put LARK_APP_ID
# paste your Lark App ID

npx wrangler secret put LARK_APP_SECRET
# paste your Lark App Secret
```

Sau đó `npx wrangler deploy` lại. Lark handover sẽ tạo task thật thay vì mock.

## Rollback

Nếu cần rollback:

```powershell
# Xem deployments gần đây
cd C:\Github\dentalaios\apps\api
npx wrangler deployments list

# Rollback Worker
npx wrangler rollback

# Rollback Pages: redeploy version cũ
npx wrangler pages deployment list --project-name=dentalaios-web
npx wrangler pages deploy <old-dist-folder> --project-name=dentalaios-web
```

## Files changed sau khi deploy

Script sẽ update `apps/api/wrangler.jsonc`:
- `ENVIRONMENT: "production"` (was `development`)
- `FRONTEND_ORIGIN: "https://dentalaios-web.pages.dev"` (was `http://localhost:5173`)

Nhớ commit changes này.

## Cost estimate

Cloudflare free tier bao gồm:
- Workers: 100,000 requests/day
- D1: 5GB storage, 5M reads/day, 100K writes/day
- R2: 10GB storage, 10M reads/month
- Queues: 1M operations/month

Đủ cho MVP testing. Scale khi cần.