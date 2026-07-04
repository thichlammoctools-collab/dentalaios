# Debug 401 on plan view
# 1. Re-deploy Worker (in case any env var drifted)
# 2. Re-apply demo data
# 3. Tail recent Worker logs to see actual error
# 4. Test login + plan API directly

$ErrorActionPreference = "Stop"
$env:CLOUDFLARE_API_TOKEN = "cfut_0LKl0F0xMjWjihrWE7Po8JWUpQJBJdAA8KQdCsh6b5f5da5f"
$env:CLOUDFLARE_ACCOUNT_ID = "6c99b69a2ef00c1754fae70793262cd3"

$workerUrl = "https://dentalaios.thichlammoctools.workers.dev"

Write-Host "==> Step 1: Re-deploy Worker (apply any pending config)" -ForegroundColor Cyan
Set-Location C:\Github\dentalaios\apps\api
npx wrangler deploy 2>&1 | Select-Object -First 10

Write-Host "`n==> Step 2: Re-apply demo data" -ForegroundColor Cyan
npx wrangler d1 execute dentalaios-db --remote --file=../../src/db/seeds/0002_demo_data.sql 2>&1 | Select-Object -First 5

Write-Host "`n==> Step 3: Test login + plan fetch directly" -ForegroundColor Cyan
try {
    $login = Invoke-RestMethod -Uri "$workerUrl/api/auth/login" -Method POST -ContentType 'application/json' -Body '{"email":"admin@demo.clinic","password":"password123"}'
    $token = $login.session.token
    Write-Host "  Login OK. User: $($login.session.user.email)" -ForegroundColor Green
    Write-Host "  Token (first 30 chars): $($token.Substring(0, [Math]::Min(30, $token.Length)))..." -ForegroundColor Gray

    Write-Host "`n  Testing /api/treatment-plans/tp-001 (a known demo plan)..." -ForegroundColor Cyan
    $plan = Invoke-RestMethod -Uri "$workerUrl/api/treatment-plans/tp-001" -Method GET -Headers @{Authorization="Bearer $token"}
    Write-Host "  Plan fetched OK: id=$($plan.id) status=$($plan.status) total=$($plan.total_cost)" -ForegroundColor Green

    Write-Host "`n  Testing /api/treatment-plans/tp-001/items..." -ForegroundColor Cyan
    $items = Invoke-RestMethod -Uri "$workerUrl/api/treatment-plans/tp-001/items" -Method GET -Headers @{Authorization="Bearer $token"}
    Write-Host "  Items: $($items.items.Count)" -ForegroundColor Green
} catch {
    Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $body = $reader.ReadToEnd()
        Write-Host "  Body: $body" -ForegroundColor Red
    }
}

Write-Host "`n==> Step 4: Tail recent Worker logs (last 5 minutes)" -ForegroundColor Cyan
Write-Host "  (Press Ctrl+C to stop tailing)" -ForegroundColor Yellow
npx wrangler tail --format=pretty 2>&1 | Select-Object -First 30