# Check Worker secrets - text output only, no JSON parsing
$ErrorActionPreference = "Continue"
$env:CLOUDFLARE_API_TOKEN = "cfut_0LKl0F0xMjWjihrWE7Po8JWUpQJBJdAA8KQdCsh6b5f5da5f"
$env:CLOUDFLARE_ACCOUNT_ID = "6c99b69a2ef00c1754fae70793262cd3"

Set-Location C:\Github\dentalaios\apps\api

Write-Host "List secrets:" -ForegroundColor Cyan
npx wrangler secret list 2>&1

Write-Host "`nLogin test:" -ForegroundColor Cyan
$body = '{"email":"admin@demo.clinic","password":"password123"}'
try {
    $r = Invoke-WebRequest -Uri "https://dentalaios.thichlammoctools.workers.dev/api/auth/login" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 10
    Write-Host "  OK $($r.StatusCode) $($r.Content.Substring(0,100))" -ForegroundColor Green
} catch {
    Write-Host "  FAIL $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "  $($_.ErrorDetails.Message)" -ForegroundColor Red
}