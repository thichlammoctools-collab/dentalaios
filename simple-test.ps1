$ErrorActionPreference="Continue"
$env:CLOUDFLARE_API_TOKEN="cfut_0LKl0F0xMjWjihrWE7Po8JWUpQJBJdAA8KQdCsh6b5f5da5f"
$env:CLOUDFLARE_ACCOUNT_ID="6c99b69a2ef00c1754fae70793262cd3"

Set-Location C:\Github\dentalaios\apps\api

Write-Host "Secrets:"
npx wrangler secret list 2>&1

Write-Host ""
Write-Host "Login test:"
$body = '{"email":"admin@demo.clinic","password":"password123"}'
try {
    $r = Invoke-WebRequest -Uri "https://dentalaios.thichlammoctools.workers.dev/api/auth/login" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 10
    Write-Host ("Status: " + $r.StatusCode)
    Write-Host ("Body: " + $r.Content.Substring(0,100))
} catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Host ("Status: " + $code)
    Write-Host ("Error: " + $_.ErrorDetails.Message)
}

Write-Host ""
Write-Host "Health:"
$h = Invoke-RestMethod -Uri "https://dentalaios.thichlammoctools.workers.dev/api/health" -UseBasicParsing
Write-Host ($h | ConvertTo-Json -Compress)