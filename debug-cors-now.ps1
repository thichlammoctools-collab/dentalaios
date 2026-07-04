# Debug CORS + login NOW
$ErrorActionPreference = "Stop"
$env:CLOUDFLARE_API_TOKEN = "cfut_0LKl0F0xMjWjihrWE7Po8JWUpQJBJdAA8KQdCsh6b5f5da5f"
$env:CLOUDFLARE_ACCOUNT_ID = "6c99b69a2ef00c1754fae70793262cd3"

$workerUrl = "https://dentalaios.thichlammoctools.workers.dev"
$pagesUrl = "https://dentalaios-web.pages.dev"
$deployUrl = "https://c7c35014.dentalaios-web.pages.dev"

Write-Host "==> Health check (no auth)" -ForegroundColor Cyan
try {
    $h = Invoke-RestMethod -Uri "$workerUrl/api/health" -Method GET
    Write-Host "  OK: env=$($h.env) ok=$($h.ok)" -ForegroundColor Green
} catch {
    Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n==> CORS preflight from canonical Pages URL" -ForegroundColor Cyan
$headers = @{
    Origin = $pagesUrl
    "Access-Control-Request-Method" = "POST"
    "Access-Control-Request-Headers" = "authorization,content-type"
}
try {
    $r = Invoke-WebRequest -Uri "$workerUrl/api/auth/login" -Method OPTIONS -Headers $headers
    Write-Host "  Status: $($r.StatusCode)" -ForegroundColor Green
    Write-Host "  ACAO: $($r.Headers['Access-Control-Allow-Origin'])" -ForegroundColor $(if ($r.Headers['Access-Control-Allow-Origin'] -like "https://*") { "Green" } else { "Red" })
    Write-Host "  ACAC: $($r.Headers['Access-Control-Allow-Credentials'])" -ForegroundColor Gray
} catch {
    Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n==> CORS preflight from deployment URL" -ForegroundColor Cyan
$headers.Origin = $deployUrl
try {
    $r = Invoke-WebRequest -Uri "$workerUrl/api/auth/login" -Method OPTIONS -Headers $headers
    Write-Host "  Status: $($r.StatusCode)" -ForegroundColor Green
    Write-Host "  ACAO: $($r.Headers['Access-Control-Allow-Origin'])" -ForegroundColor $(if ($r.Headers['Access-Control-Allow-Origin'] -like "https://*") { "Green" } else { "Red" })
} catch {
    Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n==> Actual login from canonical URL" -ForegroundColor Cyan
$headers = @{
    Origin = $pagesUrl
    "Content-Type" = "application/json"
}
try {
    $r = Invoke-WebRequest -Uri "$workerUrl/api/auth/login" -Method POST -Headers $headers -Body '{"email":"admin@demo.clinic","password":"password123"}'
    Write-Host "  Status: $($r.StatusCode)" -ForegroundColor Green
    $json = $r.Content | ConvertFrom-Json
    Write-Host "  User: $($json.session.user.email)" -ForegroundColor Green
} catch {
    Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $body = $reader.ReadToEnd()
            Write-Host "  Body: $body" -ForegroundColor Red
        } catch {
            Write-Host "  (no body)" -ForegroundColor Red
        }
    }
}

Write-Host "`n==> Tail Worker logs (last 20 entries, 10 sec)" -ForegroundColor Cyan
Set-Location C:\Github\dentalaios\apps\api
$logJob = Start-Job -ScriptBlock {
    Set-Location C:\Github\dentalaios\apps\api
    npx wrangler tail --format=pretty 2>&1
}
Start-Sleep -Seconds 10
Stop-Job $logJob
Receive-Job $logJob -Keep | Select-Object -First 30