# Re-deploy Worker with fixed CORS regex (match canonical + subdomain URLs)
$ErrorActionPreference = "Stop"
$env:CLOUDFLARE_API_TOKEN = "cfut_0LKl0F0xMjWjihrWE7Po8JWUpQJBJdAA8KQdCsh6b5f5da5f"
$env:CLOUDFLARE_ACCOUNT_ID = "6c99b69a2ef00c1754fae70793262cd3"

Write-Host "==> Re-deploy Worker (fixed CORS regex)" -ForegroundColor Cyan
Set-Location C:\Github\dentalaios\apps\api
npx wrangler deploy 2>&1 | Select-Object -First 8

Write-Host "`n==> Test CORS preflight from BOTH URLs" -ForegroundColor Cyan
$workerUrl = "https://dentalaios.thichlammoctools.workers.dev"
$urls = @(
    "https://dentalaios-web.pages.dev",
    "https://c7c35014.dentalaios-web.pages.dev"
)

foreach ($origin in $urls) {
    Write-Host "`n  Origin: $origin" -ForegroundColor Yellow
    $headers = @{
        Origin = $origin
        "Access-Control-Request-Method" = "POST"
        "Access-Control-Request-Headers" = "authorization,content-type"
    }
    try {
        $r = Invoke-WebRequest -Uri "$workerUrl/api/auth/login" -Method OPTIONS -Headers $headers -UseBasicParsing
        $acao = $r.Headers['Access-Control-Allow-Origin']
        $color = if ($acao -like "https://*") { "Green" } else { "Red" }
        Write-Host "    ACAO: $acao" -ForegroundColor $color
    } catch {
        Write-Host "    FAILED: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`nDone! Reload https://dentalaios-web.pages.dev" -ForegroundColor Green
Write-Host "If still error, clear browser data (DevTools > Application > Storage > Clear site data)" -ForegroundColor Yellow