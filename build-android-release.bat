@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "ROOT_DIR=%~dp0"
set "FRONTEND_DIR=%ROOT_DIR%frontend"
set "ENV_FILE=%FRONTEND_DIR%\.env.android.local"
set "APK_PATH=%FRONTEND_DIR%\android\app\build\outputs\apk\release\app-release.apk"

if not exist "%FRONTEND_DIR%\package.json" (
  echo [ERROR] frontend 目录不存在：%FRONTEND_DIR%
  exit /b 1
)

if exist "%ENV_FILE%" (
  echo [INFO] Loading %ENV_FILE%
  for /f "usebackq tokens=1,* delims==" %%A in (`findstr /R /V "^[ ]*# ^[ ]*$" "%ENV_FILE%"`) do (
    set "ENV_KEY=%%A"
    set "ENV_VALUE=%%B"
    if defined ENV_KEY (
      set "!ENV_KEY!=!ENV_VALUE!"
    )
  )
)

if not "%~1"=="" (
  set "VITE_ANDROID_API_BASE_URL=%~1"
)

if defined VITE_ANDROID_API_BASE_URL (
  set "VITE_API_BASE_URL=%VITE_ANDROID_API_BASE_URL%"
  echo [INFO] VITE_ANDROID_API_BASE_URL=%VITE_ANDROID_API_BASE_URL%
) else (
  echo [INFO] 未设置 VITE_ANDROID_API_BASE_URL，将按当前默认配置打 release APK
)

echo [INFO] Frontend directory: %FRONTEND_DIR%

pushd "%FRONTEND_DIR%" >nul

call npm run android:release
if errorlevel 1 (
  popd >nul
  echo [ERROR] Android release build failed.
  exit /b 1
)

popd >nul

if exist "%APK_PATH%" (
  echo [OK] Release APK built successfully.
  echo [OK] APK: %APK_PATH%
  exit /b 0
)

echo [ERROR] 构建命令执行完成，但没有找到 APK：
echo %APK_PATH%
exit /b 1
