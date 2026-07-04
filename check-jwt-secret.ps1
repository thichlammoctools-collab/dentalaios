# Check if JWT_SECRET is set on worker
$ErrorActionPreference = "Continue"
$env:CLOUDFLARE_API_TOKEN = "cfut_0LKl0F0xMjWjihrWE7Po8JWUpQJBJdAA8KQdCsh6b5f5da5f"
$env:CLOUDFLARE_ACCOUNT_ID = "6c99b69a2ef00c1754fae70793262cd3"

Set-Location C:\Github\dentalaios\apps\api

Write-Host "==> List Worker secrets" -ForegroundColor Cyan
npx wrangler secret list 2>&1

Write-Host "`n==> Test /api/auth/login with verbose output" -ForegroundColor Cyan
$body = '{"email":"admin@demo.clinic","password":"password123"}'
try {
    $response = Invoke-WebRequest -Uri "https://dentalaios.thichlammoctools.workers.dev/api/auth/login" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 10
    Write-Host "  Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "  Body: $($response.Content.Substring(0,[Math]::Min(200,$response.Content.Length)))" -ForegroundColor Green
} catch {
    Write-Host "  Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    try {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Host "  Body: $($reader.ReadToEnd())" -ForegroundColor Red
    } catch {
        Write-Host "  ErrorDetails: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
}