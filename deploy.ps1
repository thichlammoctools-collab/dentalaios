# Deploy Dental Empire OS Clinic to Cloudflare
# Run from repo root: powershell -ExecutionPolicy Bypass -File deploy.ps1

$ErrorActionPreference = "Stop"
$env:CLOUDFLARE_API_TOKEN = "cfut_aV43XAEeMnIkjpwsQLxsUDmhFldW92bD3Get1jxbd9e290d9"
$env:CLOUDFLARE_ACCOUNT_ID = "6c99b69a2ef00c1754fae70793262cd3"

Write-Host "==> Step 1: Apply D1 migrations to remote" -ForegroundColor Cyan
Set-Location apps/api
npx wrangler d1 migrations apply dentalaios-db --remote

Write-Host "`n==> Step 2: Seed remote D1 (roles + demo users)" -ForegroundColor Cyan
npx wrangler d1 execute dentalaios-db --remote --file=../../src/db/seeds/0001_roles.sql

Write-Host "`n==> Step 3: Set Worker secrets (JWT_SECRET)" -ForegroundColor Cyan
Write-Host "Paste a strong secret when prompted (e.g. a random 64-char string):" -ForegroundColor Yellow
npx wrangler secret put JWT_SECRET

Write-Host "`n==> Step 4: Update Worker vars for production" -ForegroundColor Cyan
# Read existing wrangler.jsonc
$wranglerPath = "wrangler.jsonc"
$content = Get-Content $wranglerPath -Raw
# Update ENVIRONMENT to production
$content = $content -replace '"ENVIRONMENT": "development"', '"ENVIRONMENT": "production"'
# Update FRONTEND_ORIGIN to the Pages URL (we'll know after deploy)
$content | Set-Content $wranglerPath
Write-Host "ENVIRONMENT set to 'production' in wrangler.jsonc" -ForegroundColor Green

Write-Host "`n==> Step 5: Deploy Worker" -ForegroundColor Cyan
npx wrangler deploy

Write-Host "`n==> Step 6: Build frontend" -ForegroundColor Cyan
Set-Location ../web
npm run build

Write-Host "`n==> Step 7: Create Cloudflare Pages project" -ForegroundColor Cyan
Write-Host "If project exists, this step is skipped automatically" -ForegroundColor Yellow
try {
    npx wrangler pages project create dentalaios-web --production-branch=main 2>&1 | Out-Null
    Write-Host "Pages project created" -ForegroundColor Green
} catch {
    Write-Host "Pages project may already exist, continuing..." -ForegroundColor Yellow
}

Write-Host "`n==> Step 8: Deploy frontend to Pages" -ForegroundColor Cyan
npx wrangler pages deploy dist --project-name=dentalaios-web --branch=main

Write-Host "`n==> Step 9: Update Worker FRONTEND_ORIGIN to Pages URL" -ForegroundColor Cyan
$pagesUrl = "https://dentalaios-web.pages.dev"
Set-Location ../api
$content = Get-Content $wranglerPath -Raw
$newValue = "`"FRONTEND_ORIGIN`": `"$pagesUrl`""
$content = $content -replace '"FRONTEND_ORIGIN": "http://localhost:5173"', $newValue
$content | Set-Content $wranglerPath
npx wrangler deploy

Write-Host "`n==> Step 10: Smoke test against production" -ForegroundColor Cyan
$workerUrl = "https://dentalaios.thichlammoctools.workers.dev"
Write-Host "Worker URL: $workerUrl" -ForegroundColor Cyan
Write-Host "Frontend URL: $pagesUrl" -ForegroundColor Cyan

Write-Host "`nTest 1: Health check"
$health = Invoke-RestMethod -Uri "$workerUrl/api/health" -Method GET
Write-Host "  Health: $($health.ok) env=$($health.env)" -ForegroundColor Green

Write-Host "`nTest 2: Login"
$loginResponse = Invoke-RestMethod -Uri "$workerUrl/api/auth/login" -Method POST `
    -ContentType "application/json" `
    -Body '{"email":"admin@demo.clinic","password":"password123"}'
Write-Host "  User: $($loginResponse.session.user.email)" -ForegroundColor Green
Write-Host "  Role: $($loginResponse.session.role.name)" -ForegroundColor Green

$token = $loginResponse.session.token
$tenant = $loginResponse.session.tenant.id

Write-Host "`nTest 3: List patients"
$headers = @{ Authorization = "Bearer $token" }
$patients = Invoke-RestMethod -Uri "$workerUrl/api/patients" -Method GET -Headers $headers
Write-Host "  Patients count: $($patients.total)" -ForegroundColor Green

Write-Host "`nDone!" -ForegroundColor Green
Write-Host "Frontend: $pagesUrl"
Write-Host "Worker:   $workerUrl"
Write-Host "Worker (alt): https://dentalaios.6c99b69a2ef00c1754fae70793262cd3.workers.dev"
Write-Host "Login:    admin@demo.clinic / password123"