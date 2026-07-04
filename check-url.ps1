# Verify Worker URL after deploy.
# Run from apps/api directory: cd C:\Github\dentalaios\apps\api; powershell -File ..\check-url.ps1

$ErrorActionPreference = "Stop"
$env:CLOUDFLARE_API_TOKEN = "cfut_0LKl0F0xMjWjihrWE7Po8JWUpQJBJdAA8KQdCsh6b5f5da5f"
$env:CLOUDFLARE_ACCOUNT_ID = "6c99b69a2ef00c1754fae70793262cd3"

Write-Host "==> Listing Worker deployments..." -ForegroundColor Cyan
Set-Location C:\Github\dentalaios\apps\api
npx wrangler deployments list

Write-Host "`n==> Trying common Worker URLs..." -ForegroundColor Cyan

$urls = @(
    "https://dentalaios.workers.dev",
    "https://dentalaios.6c99b69a2ef00c1754fae70793262cd3.workers.dev",
    "https://dentalaios-thichlammoctools.workers.dev"
)

foreach ($url in $urls) {
    try {
        $response = Invoke-WebRequest -Uri "$url/api/health" -Method GET -TimeoutSec 5 -UseBasicParsing
        Write-Host "  FOUND: $url" -ForegroundColor Green
        Write-Host "  Status: $($response.StatusCode)" -ForegroundColor Green
        Write-Host "  Body: $($response.Content)" -ForegroundColor Green
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode) {
            Write-Host "  $url - HTTP $statusCode (may need auth)" -ForegroundColor Yellow
        } else {
            Write-Host "  $url - $($_.Exception.Message)" -ForegroundColor Red
        }
    }
}

Write-Host "`n==> Verifying Pages URL..." -ForegroundColor Cyan
try {
    $pages = Invoke-WebRequest -Uri "https://dentalaios-web.pages.dev" -Method GET -TimeoutSec 5 -UseBasicParsing
    Write-Host "  Pages OK: $($pages.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "  Pages not reachable: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n==> Listing Pages deployments..." -ForegroundColor Cyan
Set-Location C:\Github\dentalaios\apps\web
npx wrangler pages deployment list --project-name=dentalaios-web 2>&1 | Select-Object -First 10