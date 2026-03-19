@echo off
setlocal

set "WITH_SYNC_SERVER=0"
if /I "%~1"=="--with-sync-server" set "WITH_SYNC_SERVER=1"
if /I "%~1"=="-WithSyncServer" set "WITH_SYNC_SERVER=1"

echo ^>^>^> Starting Bemo Local Development Environment ^<^<^<

if "%WITH_SYNC_SERVER%"=="1" (
  echo [1/2] Starting optional Python sync-server in a new window...
  start "Bemo Sync Server" cmd /k "cd /d "%~dp0backend" && if not exist venv python -m venv venv && call venv\Scripts\activate.bat && pip install -r requirements.txt && set BEMO_SYNC_TOKEN=bemo-local-dev-sync-token && uvicorn main:app --reload --host 0.0.0.0 --port 8000"
  echo Sync-server enabled for this run.
) else (
  echo [1/1] Sync-server not started. Pass --with-sync-server to enable it.
)

echo Starting Vue frontend in current window...
cd /d "%~dp0frontend"
call npm run dev
