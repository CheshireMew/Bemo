param(
  [string]$BackendHost = "127.0.0.1",
  [int]$BackendPort = 8000,
  [int]$DeviceAPort = 4173,
  [int]$DeviceBPort = 4174,
  [string]$SyncToken = "dev-sync-token"
)

$ErrorActionPreference = "Stop"

function Start-BemoWindow {
  param(
    [string]$Title,
    [string]$WorkingDirectory,
    [string]$Command
  )

  $escapedDir = $WorkingDirectory.Replace("'", "''")
  $script = "Set-Location '$escapedDir'; `$Host.UI.RawUI.WindowTitle = '$Title'; $Command"
  Start-Process powershell -ArgumentList "-NoExit", "-Command", $script | Out-Null
}

$root = $PSScriptRoot
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"
$backendUrl = "http://$BackendHost`:$BackendPort"
$deviceAUrl = "http://127.0.0.1:$DeviceAPort"
$deviceBUrl = "http://127.0.0.1:$DeviceBPort"

Write-Host "Starting Bemo sync E2E environment..." -ForegroundColor Green
Write-Host "Backend : $backendUrl" -ForegroundColor Cyan
Write-Host "Device A: $deviceAUrl" -ForegroundColor Cyan
Write-Host "Device B: $deviceBUrl" -ForegroundColor Cyan

Start-BemoWindow `
  -Title "Bemo Backend" `
  -WorkingDirectory $backendDir `
  -Command "`$env:BEMO_SYNC_TOKEN='$SyncToken'; if (!(Test-Path venv)) { python -m venv venv }; .\venv\Scripts\Activate; pip install -r requirements.txt; uvicorn main:app --reload --host $BackendHost --port $BackendPort"

Start-BemoWindow `
  -Title "Bemo Device A" `
  -WorkingDirectory $frontendDir `
  -Command "`$env:VITE_API_BASE_URL='$backendUrl/api'; npm run dev -- --host 127.0.0.1 --port $DeviceAPort"

Start-BemoWindow `
  -Title "Bemo Device B" `
  -WorkingDirectory $frontendDir `
  -Command "`$env:VITE_API_BASE_URL='$backendUrl/api'; npm run dev -- --host 127.0.0.1 --port $DeviceBPort"

Write-Host ""
Write-Host "Server mode settings for both devices:" -ForegroundColor Yellow
Write-Host "  Mode: 自部署服务器"
Write-Host "  Server URL: $backendUrl"
Write-Host "  Access Token: $SyncToken"
Write-Host ""
Write-Host "Use the checklist in SYNC_E2E_GUIDE.md for manual acceptance." -ForegroundColor Yellow
