param(
  [string]$SyncToken = "bemo-local-dev-sync-token",
  [string]$CorsOrigins = "http://localhost:5173,http://127.0.0.1:5173",
  [int]$Port = 8000,
  [ValidateSet("app", "server")]
  [string]$Mode = "app",
  [string]$PythonPath = $env:BEMO_PYTHON
)

$backendPath = Split-Path -Parent $MyInvocation.MyCommand.Path
if (!$PythonPath) { $PythonPath = (Get-Command python -ErrorAction Stop).Source }

Set-Location $backendPath

& $PythonPath -c "import fastapi, uvicorn, httpx, multipart"
if ($LASTEXITCODE -ne 0) {
  throw "缺少运行依赖。请先运行 backend/setup-runtime.ps1，然后设置 BEMO_PYTHON。启动不会自动安装依赖。"
}

$env:BEMO_SYNC_TOKEN = $SyncToken
$env:BEMO_CORS_ORIGINS = $CorsOrigins
$env:BEMO_APP_MODE = $Mode

$uvicornTarget = if ($Mode -eq "server") { "sync_server:app" } else { "main:app" }
if (!$env:BEMO_DATA_DIR) { $env:BEMO_DATA_DIR = Join-Path $backendPath 'data' }
& $PythonPath -m uvicorn $uvicornTarget --host 127.0.0.1 --port $Port
exit $LASTEXITCODE
