param(
  [string]$SyncToken = "bemo-local-dev-sync-token",
  [string]$CorsOrigins = "http://localhost:5173,http://127.0.0.1:5173",
  [int]$Port = 8000
)

$backendPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$pythonPath = Join-Path $backendPath "venv\Scripts\python.exe"

Set-Location $backendPath

if (!(Test-Path $pythonPath)) {
  python -m venv venv
}

& $pythonPath -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$env:BEMO_SYNC_TOKEN = $SyncToken
$env:BEMO_CORS_ORIGINS = $CorsOrigins

& $pythonPath -m uvicorn main:app --reload --host 0.0.0.0 --port $Port
exit $LASTEXITCODE
