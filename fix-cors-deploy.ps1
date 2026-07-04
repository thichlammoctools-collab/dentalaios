# Fix CORS + re-deploy Worker (wildcard Pages URLs) + re-build/redeploy Pages
$ErrorActionPreference = "Stop"
$env:CLOUDFLARE_API_TOKEN = "cfut_0LKl0F0xMjWjihrWE7Po8JWUpQJBJdAA8KQdCsh6b5f5da5f"
$env:CLOUDFLARE_ACCOUNT_ID = "6c99b69a2ef00c1754fae70793262cd3"

Write-Host "==> Step 1: Re-deploy Worker (with wildcard CORS)" -ForegroundColor Cyan
Set-Location C:\Github\dentalaios\apps\api
npx wrangler deploy 2>&1 | Select-Object -First 8

Write-Host "`n==> Step 2: Verify CORS preflight from deployment URL" -ForegroundColor Cyan
$deployUrl = "https://c7c35014.dentalaios-web.pages.dev"
$workerUrl = "https://dentalaios.thichlammoctools.workers.dev"

# OPTIONS preflight from deployment URL
$headers = @{
    Origin = $deployUrl
    "Access-Control-Request-Method" = "POST"
    "Access-Control-Request-Headers" = "authorization,content-type"
}
try {
    $response = Invoke-WebRequest -Uri "$workerUrl/api/auth/login" -Method OPTIONS -Headers $headers -TimeoutSec 10
    $acao = $response.Headers["Access-Control-Allow-Origin"]
    Write-Host "  Preflight status: $($response.StatusCode)" -ForegroundColor Green
    Write-Host "  Access-Control-Allow-Origin: $acao" -ForegroundColor $(if ($acao -like "https://*") { "Green" } else { "Red" })
} catch {
    Write-Host "  Preflight failed: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n==> Step 3: Test actual login" -ForegroundColor Cyan
try {
    $login = Invoke-RestMethod -Uri "$workerUrl/api/auth/login" -Method POST -ContentType 'application/json' -Body '{"email":"admin@demo.clinic","password":"password123"}'
    Write-Host "  Login OK: user=$($login.session.user.email) role=$($login.session.role.name)" -ForegroundColor Green
    $token = $login.session.token

    Write-Host "`n  Testing /api/treatment-plans/tp-001..." -ForegroundColor Cyan
    $plan = Invoke-RestMethod -Uri "$workerUrl/api/treatment-plans/tp-001" -Method GET -Headers @{Authorization="Bearer $token"}
    Write-Host "  Plan OK: id=$($plan.id) status=$($plan.status)" -ForegroundColor Green
} catch {
    Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        Write-Host "  Body: $($reader.ReadToEnd())" -ForegroundColor Red
    }
}

Write-Host "`n==> Step 4: Rebuild + redeploy Pages (with new error UI)" -ForegroundColor Cyan
Set-Location C:\Github\dentalaios\apps\web
npm run build 2>&1 | Select-Object -First 5
npx wrangler pages deploy dist --project-name=dentalaios-web --branch=main --commit-dirty=true 2>&1 | Select-Object -First 8

Write-Host "`nDone!" -ForegroundColor Green
Write-Host "Try refreshing https://dentalaios-web.pages.dev - should stay logged in."