# Tail Worker logs to debug 500 errors
$ErrorActionPreference = "Stop"
$env:CLOUDFLARE_API_TOKEN = "cfut_0LKl0F0xMjWjihrWE7Po8JWUpQJBJdAA8KQdCsh6b5f5da5f"
$env:CLOUDFLARE_ACCOUNT_ID = "6c99b69a2ef00c1754fae70793262cd3"

Set-Location C:\Github\dentalaios\apps\api
Write-Host "==> Tailing Worker logs (Ctrl+C to stop)..." -ForegroundColor Cyan
npx wrangler tail --format=pretty 2>&1 | Select-Object -First 30