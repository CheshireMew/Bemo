param(
  [switch]$WithSyncServer,
  [switch]$FrontendOnly
)

# Development startup script for Bemo

Write-Host ">>> Starting Bemo Local Development Environment <<<" -ForegroundColor Green

$startSyncServer = $true
if ($FrontendOnly) {
  $startSyncServer = $false
}
if ($WithSyncServer) {
  $startSyncServer = $true
}

if ($startSyncServer) {
  Write-Host "[1/2] Starting optional Python sync-server (in a new window)..." -ForegroundColor Cyan
  $syncServerScript = Join-Path $PSScriptRoot "backend\start-sync-server.ps1"
  $devSyncToken = "bemo-local-dev-sync-token"
  $devCorsOrigins = "http://localhost:5173,http://127.0.0.1:5173"
  Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-File", $syncServerScript,
    "-SyncToken", $devSyncToken,
    "-CorsOrigins", $devCorsOrigins,
    "-Port", "8000"
  )
  Write-Host "Sync-server enabled for this run on http://127.0.0.1:8000" -ForegroundColor Yellow
} else {
  Write-Host "[1/1] Sync-server not started. Pass -WithSyncServer to force-enable it." -ForegroundColor Yellow
}

Write-Host "Starting Vue frontend (in current window)..." -ForegroundColor Cyan
Set-Location (Join-Path $PSScriptRoot "frontend")
$env:VITE_WEB_API_BASE_URL = "http://127.0.0.1:8000/api"
$env:VITE_API_BASE_URL = "http://127.0.0.1:8000/api"
$env:VITE_WEB_SYNC_PROXY_TOKEN = "bemo-local-dev-sync-token"
$env:VITE_SYNC_PROXY_TOKEN = "bemo-local-dev-sync-token"
npm run dev
