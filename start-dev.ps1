param(
  [switch]$WithSyncServer,
  [switch]$FrontendOnly,
  [int]$BackendPort = 8000,
  [int]$FrontendPort = 5173
)

# Development startup script for Bemo

Write-Host ">>> Starting Bemo Local Development Environment <<<" -ForegroundColor Green

function Test-PortInUse {
  param(
    [Parameter(Mandatory = $true)]
    [int]$Port
  )

  return $null -ne (Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1)
}

function Get-AvailablePort {
  param(
    [Parameter(Mandatory = $true)]
    [int]$PreferredPort,
    [int[]]$ExcludedPorts = @()
  )

  if (($ExcludedPorts -notcontains $PreferredPort) -and -not (Test-PortInUse -Port $PreferredPort)) {
    return $PreferredPort
  }

  while ($true) {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
    try {
      $listener.Start()
      $port = ([System.Net.IPEndPoint]$listener.LocalEndpoint).Port
      if ($ExcludedPorts -notcontains $port) {
        return $port
      }
    } finally {
      $listener.Stop()
    }
  }
}

$resolvedBackendPort = Get-AvailablePort -PreferredPort $BackendPort
$resolvedFrontendPort = Get-AvailablePort -PreferredPort $FrontendPort -ExcludedPorts @($resolvedBackendPort)
$backendOrigin = "http://127.0.0.1:$resolvedBackendPort"
$backendApiBase = "$backendOrigin/api"
$frontendOrigins = @(
  "http://localhost:$resolvedFrontendPort",
  "http://127.0.0.1:$resolvedFrontendPort"
)
$devCorsOrigins = $frontendOrigins -join ","

if ($resolvedBackendPort -ne $BackendPort) {
  Write-Host "Backend port $BackendPort is already in use. Falling back to $resolvedBackendPort." -ForegroundColor Yellow
}

if ($resolvedFrontendPort -ne $FrontendPort) {
  Write-Host "Frontend port $FrontendPort is already in use. Falling back to $resolvedFrontendPort." -ForegroundColor Yellow
}

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
  Start-Process powershell -ArgumentList @(
    "-NoExit",
    "-ExecutionPolicy", "Bypass",
    "-File", $syncServerScript,
    "-SyncToken", $devSyncToken,
    "-CorsOrigins", $devCorsOrigins,
    "-Port", $resolvedBackendPort.ToString()
  )
  Write-Host "Backend enabled for this run on $backendOrigin" -ForegroundColor Yellow
} else {
  Write-Host "[1/1] Sync-server not started. Pass -WithSyncServer to force-enable it." -ForegroundColor Yellow
}

Write-Host "Starting Vue frontend (in current window)..." -ForegroundColor Cyan
Set-Location (Join-Path $PSScriptRoot "frontend")
$env:VITE_WEB_APP_STORAGE_MODE = "backend"
$env:VITE_APP_STORAGE_MODE = "backend"
$env:VITE_WEB_API_BASE_URL = $backendApiBase
$env:VITE_API_BASE_URL = $backendApiBase
$env:VITE_WEB_SYNC_PROXY_TOKEN = "bemo-local-dev-sync-token"
$env:VITE_SYNC_PROXY_TOKEN = "bemo-local-dev-sync-token"
npm run dev -- --host 127.0.0.1 --port $resolvedFrontendPort
