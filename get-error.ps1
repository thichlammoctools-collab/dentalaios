$ErrorActionPreference="Continue"
$env:CLOUDFLARE_API_TOKEN="cfut_0LKl0F0xMjWjihrWE7Po8JWUpQJBJdAA8KQdCsh6b5f5da5f"
$env:CLOUDFLARE_ACCOUNT_ID="6c99b69a2ef00c1754fae70793262cd3"

Set-Location C:\Github\dentalaios\apps\api

$tailJob = Start-Job -ScriptBlock {
    $env:CLOUDFLARE_API_TOKEN="cfut_0LKl0F0xMjWjihrWE7Po8JWUpQJBJdAA8KQdCsh6b5f5da5f"
    $env:CLOUDFLARE_ACCOUNT_ID="6c99b69a2ef00c1754fae70793262cd3"
    Set-Location C:\Github\dentalaios\apps\api
    npx wrangler tail --format=json 2>&1
}

Start-Sleep -Seconds 4

$body = '{"email":"admin@demo.clinic","password":"password123"}'
try {
    Invoke-WebRequest -Uri "https://dentalaios.thichlammoctools.workers.dev/api/auth/login" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing -TimeoutSec 5 | Out-Null
} catch {}

Start-Sleep -Seconds 3
Stop-Job $tailJob

$logs = Receive-Job $tailJob
$logs | ForEach-Object {
    if ($_ -match "error|exception|500|Cannot") {
        Write-Host $_
    }
}
Remove-Job $tailJob