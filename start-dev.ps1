# Development startup script for Bemo

Write-Host ">>> Starting Bemo Local Development Environment <<<" -ForegroundColor Green

# 1. Start Backend
Write-Host "[1/2] Starting FastAPI backend (in a new window)..." -ForegroundColor Cyan
$backendPath = Join-Path $PSScriptRoot "backend"
Start-Process powershell -ArgumentList "-NoExit -Command `"cd '$backendPath'; if (!(Test-Path venv)) { python -m venv venv }; .\venv\Scripts\Activate; pip install -r requirements.txt; uvicorn main:app --reload`""

# 2. Start Frontend
Write-Host "[2/2] Starting Vue frontend (in current window)..." -ForegroundColor Cyan
Set-Location (Join-Path $PSScriptRoot "frontend")
npm run dev
