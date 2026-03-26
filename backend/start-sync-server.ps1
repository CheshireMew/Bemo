param(
  [string]$SyncToken = "bemo-local-dev-sync-token",
  [string]$CorsOrigins = "http://localhost:5173,http://127.0.0.1:5173",
  [int]$Port = 8000,
  [ValidateSet("app", "server")]
  [string]$Mode = "app"
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
$env:BEMO_APP_MODE = $Mode

$uvicornTarget = if ($Mode -eq "server") { "sync_server:app" } else { "main:app" }
& $pythonPath -m uvicorn $uvicornTarget --reload --host 0.0.0.0 --port $Port
exit $LASTEXITCODE
