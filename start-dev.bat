@echo off
:: Set console to UTF-8
chcp 65001 >nul

echo === Starting Bemo Local Development Environment ===

echo [1/2] Starting FastAPI backend in a new window...
start "Bemo Backend" cmd /k "cd /d "%~dp0backend" && call venv\Scripts\activate.bat && pip install -r requirements.txt -q && echo [Backend] Starting uvicorn... && uvicorn main:app --reload --host 0.0.0.0 --port 8000 || (echo [Backend] FAILED! Check errors above. && pause)"

:: Wait a moment for backend to start
timeout /t 3 /nobreak >nul

echo [2/2] Starting Vue frontend in current window...
cd /d "%~dp0frontend"
npm run dev
