# Debug cache + check latest deploys
$ErrorActionPreference = "Stop"
$env:CLOUDFLARE_API_TOKEN = "cfut_0LKl0F0xMjWjihrWE7Po8JWUpQJBJdAA8KQdCsh6b5f5da5f"
$env:CLOUDFLARE_ACCOUNT_ID = "6c99b69a2ef00c1754fae70793262cd3"

Write-Host "==> Latest Worker deployments" -ForegroundColor Cyan
Set-Location C:\Github\dentalaios\apps\api
npx wrangler deployments list 2>&1 | Select-Object -First 20

Write-Host "`n==> Latest Pages deployments" -ForegroundColor Cyan
Set-Location C:\Github\dentalaios\apps\web
npx wrangler pages deployment list --project-name=dentalaios-web 2>&1 | Select-Object -First 15

Write-Host "`n==> Test CORS preflight (bypass all cache)" -ForegroundColor Cyan
$workerUrl = "https://dentalaios.thichlammoctools.workers.dev"
$pagesUrl = "https://dentalaios-web.pages.dev"
$deployUrl = "https://c7c35014.dentalaios-web.pages.dev"

foreach ($origin in @($pagesUrl, $deployUrl)) {
    Write-Host "`n  Testing Origin: $origin" -ForegroundColor Yellow
    $headers = @{
        Origin = $origin
        "Access-Control-Request-Method" = "POST"
        "Access-Control-Request-Headers" = "authorization,content-type"
        "Cache-Control" = "no-cache"
        "Pragma" = "no-cache"
    }
    try {
        $response = Invoke-WebRequest -Uri "$workerUrl/api/auth/login" -Method OPTIONS -Headers $headers -TimeoutSec 10
        Write-Host "    Status: $($response.StatusCode)" -ForegroundColor Green
        foreach ($h in $response.Headers.GetEnumerator()) {
            if ($h.Key -like "*Control*") {
                Write-Host "    $($h.Key): $($h.Value)" -ForegroundColor Gray
            }
        }
    } catch {
        Write-Host "    FAILED: $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Host "`n==> Test actual login (bypass cache)" -ForegroundColor Cyan
try {
    $headers = @{
        "Content-Type" = "application/json"
        "Cache-Control" = "no-cache"
    }
    $body = '{"email":"admin@demo.clinic","password":"password123"}'
    $response = Invoke-WebRequest -Uri "$workerUrl/api/auth/login" -Method POST -Headers $headers -Body $body -TimeoutSec 10
    Write-Host "  Status: $($response.StatusCode)" -ForegroundColor Green
    $json = $response.Content | ConvertFrom-Json
    Write-Host "  User: $($json.session.user.email)" -ForegroundColor Green
    Write-Host "  Token (first 30): $($json.session.token.Substring(0, 30))..." -ForegroundColor Gray
} catch {
    Write-Host "  FAILED: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n==> Force purge Cloudflare cache for Pages" -ForegroundColor Cyan
Write-Host "  Use this URL to purge: https://dash.cloudflare.com/?to=/:account/pages/view/dentalaios-web" -ForegroundColor Yellow
Write-Host "  Click on the deployment and 'Purge cache'" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Or open browser DevTools, go to Application > Storage > Clear site data" -ForegroundColor Yellow
Write-Host "  Then reload https://dentalaios-web.pages.dev" -ForegroundColor Yellow