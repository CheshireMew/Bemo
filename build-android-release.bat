@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0"
set "FRONTEND_DIR=%ROOT_DIR%frontend"
set "BUILD_SCRIPT=%FRONTEND_DIR%\scripts\android-build.ps1"
set "ENV_FILE=%FRONTEND_DIR%\.env.android.local"
set "APK_PATH=%FRONTEND_DIR%\android\app\build\outputs\apk\release\app-release.apk"

if not exist "%FRONTEND_DIR%\package.json" (
  echo [ERROR] frontend directory not found: %FRONTEND_DIR%
  exit /b 1
)

if not exist "%BUILD_SCRIPT%" (
  echo [ERROR] Android build script not found: %BUILD_SCRIPT%
  exit /b 1
)

if exist "%ENV_FILE%" (
  echo [INFO] Using env file: %ENV_FILE%
)

if not "%~1"=="" (
  set "VITE_ANDROID_API_BASE_URL=%~1"
)

if defined VITE_ANDROID_API_BASE_URL (
  set "VITE_API_BASE_URL=%VITE_ANDROID_API_BASE_URL%"
  echo [INFO] VITE_ANDROID_API_BASE_URL=%VITE_ANDROID_API_BASE_URL%
) else (
  echo [INFO] VITE_ANDROID_API_BASE_URL is not set. Building with current defaults.
)

echo [INFO] Frontend directory: %FRONTEND_DIR%

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%BUILD_SCRIPT%" -Task release
if errorlevel 1 (
  echo [ERROR] Android release build failed.
  exit /b 1
)

if exist "%APK_PATH%" (
  echo [OK] Release APK built successfully.
  echo [OK] APK: %APK_PATH%
  exit /b 0
)

echo [ERROR] Build finished but APK was not found:
echo %APK_PATH%
exit /b 1
