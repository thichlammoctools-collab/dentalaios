# Debug login 500 error
$ErrorActionPreference = "Continue"
$env:CLOUDFLARE_API_TOKEN = "cfut_0LKl0F0xMjWjihrWE7Po8JWUpQJBJdAA8KQdCsh6b5f5da5f"
$env:CLOUDFLARE_ACCOUNT_ID = "6c99b69a2ef00c1754fae70793262cd3"

$workerUrl = "https://dentalaios.thichlammoctools.workers.dev"

Write-Host "==> 1. Test login directly" -ForegroundColor Cyan
try {
    $body = '{"email":"admin@demo.clinic","password":"password123"}'
    $response = Invoke-WebRequest -Uri "$workerUrl/api/auth/login" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 10
    Write-Host "  Status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "  Body: $($response.Content.Substring(0,[Math]::Min(100,$response.Content.Length)))" -ForegroundColor Green
} catch {
    Write-Host "  Status: $($_.Exception.Response.StatusCode.value__)" -ForegroundColor Red
    Write-Host "  Body: $($_.ErrorDetails.Message)" -ForegroundColor Red
}

Write-Host "`n==> 2. Tail logs then trigger login again" -ForegroundColor Cyan
$env:CLOUDFLARE_API_TOKEN = "cfut_0LKl0F0xMjWjihrWE7Po8JWUpQJBJdAA8KQdCsh6b5f5da5f"
$env:CLOUDFLARE_ACCOUNT_ID = "6c99b69a2ef00c1754fae70793262cd3"

Set-Location C:\Github\dentalaios\apps\api

# Start tail in background
$tailJob = Start-Job -ScriptBlock {
    $env:CLOUDFLARE_API_TOKEN = "cfut_0LKl0F0xMjWjihrWE7Po8JWUpQJBJdAA8KQdCsh6b5f5da5f"
    $env:CLOUDFLARE_ACCOUNT_ID = "6c99b69a2ef00c1754fae70793262cd3"
    Set-Location C:\Github\dentalaios\apps\api
    npx wrangler tail --format=json 2>&1
}

# Wait for tail to connect
Start-Sleep -Seconds 5

# Trigger login again
Write-Host "  Triggering login..." -ForegroundColor Yellow
try {
    Invoke-WebRequest -Uri "$workerUrl/api/auth/login" -Method POST -Body '{"email":"admin@demo.clinic","password":"password123"}' -ContentType "application/json" -UseBasicParsing -TimeoutSec 5 | Out-Null
} catch {
    # Expected to fail - we want to capture the log
}

# Wait and capture logs
Start-Sleep -Seconds 3
Stop-Job $tailJob

Write-Host "`n==> Worker logs:" -ForegroundColor Cyan
$logs = Receive-Job $tailJob
$logs | ForEach-Object {
    try {
        $json = $_ | ConvertFrom-Json
        if ($json.logs) {
            foreach ($log in $json.logs) {
                if ($log.message -match "error|Error|500|exception" -or $log.message -match "unhandled" -or $log.message -match "Cannot" -or $log.message -match "undefined") {
                    Write-Host "  [ERROR] $($log.message)" -ForegroundColor Red
                } else {
                    Write-Host "  [LOG] $($log.message)" -ForegroundColor Gray
                }
            }
        }
        if ($json.exceptions) {
            foreach ($ex in $json.exceptions) {
                Write-Host "  [EXCEPTION] $($ex.message)" -ForegroundColor Red
                Write-Host "  Stack: $($ex.stack)" -ForegroundColor DarkRed
            }
        }
    } catch {
        # Raw line
        Write-Host "  $_" -ForegroundColor Gray
    }
}