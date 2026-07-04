# Rebuild frontend with VITE_API_URL pointing to Worker
$ErrorActionPreference = "Stop"
$env:CLOUDFLARE_API_TOKEN = "cfut_0LKl0F0xMjWjihrWE7Po8JWUpQJBJdAA8KQdCsh6b5f5da5f"
$env:CLOUDFLARE_ACCOUNT_ID = "6c99b69a2ef00c1754fae70793262cd3"

$workerUrl = "https://dentalaios.thichlammoctools.workers.dev"

Write-Host "==> Setting VITE_API_URL=$workerUrl" -ForegroundColor Cyan
Set-Location C:\Github\dentalaios\apps\web

"VITE_API_URL=$workerUrl" | Out-File -FilePath ".env.production" -Encoding utf8
Write-Host "  Wrote .env.production" -ForegroundColor Green

Write-Host "`n==> Building frontend (vite only)..." -ForegroundColor Cyan
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "`nBUILD FAILED" -ForegroundColor Red
    exit 1
}

Write-Host "`n==> Deploying to Pages..." -ForegroundColor Cyan
npx wrangler pages deploy dist --project-name=dentalaios-web --branch=main --commit-dirty=true

Write-Host "`nDone! Frontend now configured to call Worker at $workerUrl" -ForegroundColor Green
Write-Host "Try login at https://dentalaios-web.pages.dev"