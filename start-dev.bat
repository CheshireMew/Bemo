@echo off
setlocal

set "WITH_SYNC_SERVER=1"
if /I "%~1"=="--frontend-only" set "WITH_SYNC_SERVER=0"
if /I "%~1"=="-FrontendOnly" set "WITH_SYNC_SERVER=0"
if /I "%~1"=="--with-sync-server" set "WITH_SYNC_SERVER=1"
if /I "%~1"=="-WithSyncServer" set "WITH_SYNC_SERVER=1"

echo ^>^>^> Starting Bemo Local Development Environment ^<^<^<

if "%WITH_SYNC_SERVER%"=="1" (
  echo [1/2] Starting optional Python sync-server in a new window...
  start "Bemo Sync Server" powershell -NoExit -ExecutionPolicy Bypass -File "%~dp0backend\start-sync-server.ps1" -SyncToken "bemo-local-dev-sync-token" -CorsOrigins "http://localhost:5173,http://127.0.0.1:5173" -Port 8000
  echo Sync-server enabled for this run on http://127.0.0.1:8000
) else (
  echo [1/1] Sync-server not started. Pass --with-sync-server to force-enable it.
)

echo Starting Vue frontend in current window...
cd /d "%~dp0frontend"
set "VITE_WEB_API_BASE_URL=http://127.0.0.1:8000/api"
set "VITE_API_BASE_URL=http://127.0.0.1:8000/api"
set "VITE_WEB_SYNC_PROXY_TOKEN=bemo-local-dev-sync-token"
set "VITE_SYNC_PROXY_TOKEN=bemo-local-dev-sync-token"
echo Opening http://localhost:5173/ in your default browser...
start "Bemo Browser Launcher" cmd /c "timeout /t 5 /nobreak >nul && start \"\" http://localhost:5173/"
call npm run dev
