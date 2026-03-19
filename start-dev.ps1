param(
  [switch]$WithSyncServer
)

# Development startup script for Bemo

Write-Host ">>> Starting Bemo Local Development Environment <<<" -ForegroundColor Green

if ($WithSyncServer) {
  Write-Host "[1/2] Starting optional Python sync-server (in a new window)..." -ForegroundColor Cyan
  $backendPath = Join-Path $PSScriptRoot "backend"
  $devSyncToken = "bemo-local-dev-sync-token"
  Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$backendPath'; if (!(Test-Path venv)) { python -m venv venv }; .\venv\Scripts\Activate; pip install -r requirements.txt; `$env:BEMO_SYNC_TOKEN='$devSyncToken'; uvicorn main:app --reload --host 0.0.0.0 --port 8000`""
  Write-Host "Sync-server enabled for this run." -ForegroundColor Yellow
} else {
  Write-Host "[1/1] Sync-server not started. Pass -WithSyncServer to enable it." -ForegroundColor Yellow
}

Write-Host "Starting Vue frontend (in current window)..." -ForegroundColor Cyan
Set-Location (Join-Path $PSScriptRoot "frontend")
npm run dev
