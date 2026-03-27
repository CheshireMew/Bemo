@echo off
setlocal

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-dev.ps1" %*
exit /b %ERRORLEVEL%
