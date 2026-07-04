# Get the actual Worker URL from latest deploy
Set-Location C:\Github\dentalaios\apps\api
$env:CLOUDFLARE_API_TOKEN = "cfut_0LKl0F0xMjWjihrWE7Po8JWUpQJBJdAA8KQdCsh6b5f5da5f"
$env:CLOUDFLARE_ACCOUNT_ID = "6c99b69a2ef00c1754fae70793262cd3"

Write-Host "==> Trying wrangler info..." -ForegroundColor Cyan
npx wrangler info 2>&1 | Select-Object -First 30

Write-Host "`n==> Attempting wrangler deploy (capture published URL only)..." -ForegroundColor Cyan
npx wrangler deploy 2>&1 | Tee-Object -Variable deployOutput | Select-Object -First 40

Write-Host "`n==> Looking for Published URL in deploy output..." -ForegroundColor Cyan
$urls = ($deployOutput | Select-String -Pattern 'https://[a-z0-9-]+\.workers\.dev').Matches.Value | Select-Object -Unique
foreach ($u in $urls) {
    Write-Host "  Candidate URL: $u" -ForegroundColor Cyan
    try {
        $h = Invoke-WebRequest -Uri "$u/api/health" -Method GET -TimeoutSec 10 -UseBasicParsing
        Write-Host "    OK ($($h.StatusCode))" -ForegroundColor Green
        Write-Host "    Body: $($h.Content)" -ForegroundColor Green
    } catch {
        Write-Host "    FAILED: $($_.Exception.Message)" -ForegroundColor Red
    }
}