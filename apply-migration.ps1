$ErrorActionPreference="Continue"
$env:CLOUDFLARE_API_TOKEN="cfut_0LKl0F0xMjWjihrWE7Po8JWUpQJBJdAA8KQdCsh6b5f5da5f"
$env:CLOUDFLARE_ACCOUNT_ID="6c99b69a2ef00c1754fae70793262cd3"

Set-Location C:\Github\dentalaios\apps\api

Write-Host "=== Check rate_limit_buckets table on remote ==="
npx wrangler d1 execute dentalaios-db --remote --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name" 2>&1

Write-Host ""
Write-Host "=== Apply migration 0003 (rate_limit_buckets) ==="
npx wrangler d1 migrations apply dentalaios-db --remote 2>&1 | Select-Object -First 20