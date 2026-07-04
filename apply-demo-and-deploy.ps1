# Apply demo data to remote D1 + rebuild + redeploy frontend
$ErrorActionPreference = "Stop"
$env:CLOUDFLARE_API_TOKEN = "cfut_0LKl0F0xMjWjihrWE7Po8JWUpQJBJdAA8KQdCsh6b5f5da5f"
$env:CLOUDFLARE_ACCOUNT_ID = "6c99b69a2ef00c1754fae70793262cd3"

Write-Host "==> Step 1: Apply demo data to remote D1" -ForegroundColor Cyan
Set-Location C:\Github\dentalaios\apps\api
npx wrangler d1 execute dentalaios-db --remote --file=../../src/db/seeds/0002_demo_data.sql

Write-Host "`n==> Step 2: Rebuild frontend (with VITE_API_URL already in .env.production)" -ForegroundColor Cyan
Set-Location C:\Github\dentalaios\apps\web
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nBUILD FAILED" -ForegroundColor Red
    exit 1
}

Write-Host "`n==> Step 3: Redeploy to Pages" -ForegroundColor Cyan
npx wrangler pages deploy dist --project-name=dentalaios-web --branch=main --commit-dirty=true

Write-Host "`nDone!" -ForegroundColor Green
Write-Host "Visit https://dentalaios-web.pages.dev to see demo data" -ForegroundColor Green
Write-Host "`nDemo patients:" -ForegroundColor Cyan
Write-Host "  - Nguyễn Văn A (3 visits, 1 plan completed)"
Write-Host "  - Trần Thị B (allergy, 1 plan approved)"
Write-Host "  - Lê Văn C (1 in-progress visit, draft plan)"
Write-Host "  - Phạm Thị D (chronic, 0 visits - no plan)"
Write-Host "  - Hoàng Văn E (orthodontic, draft plan 35M VND)"
Write-Host "  - Vũ Thị F (no visits)"