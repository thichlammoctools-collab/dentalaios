# Deploy dark mode fix v2
$ErrorActionPreference = "Stop"
$env:CLOUDFLARE_API_TOKEN = "cfut_0LKl0F0xMjWjihrWE7Po8JWUpQJBJdAA8KQdCsh6b5f5da5f"
$env:CLOUDFLARE_ACCOUNT_ID = "6c99b69a2ef00c1754fae70793262cd3"

Set-Location C:\Github\dentalaios\apps\web
npx wrangler pages deploy dist --project-name=dentalaios-web --branch=main --commit-dirty=true

Write-Host "`nDone! Hard reload https://dentalaios-web.pages.dev (Ctrl+Shift+R)" -ForegroundColor Green