# Frontend

This directory is the primary product runtime for Bemo.

Do not treat `frontend` as a thin client for a general Python business backend.

The optional Python service is retained only for self-hosted `sync-server` mode.

## API base URL

The app resolves its optional sync-server URL by platform when you explicitly configure one:

- Web: `VITE_WEB_API_BASE_URL` -> `VITE_API_BASE_URL`
- Android: `VITE_ANDROID_API_BASE_URL` -> `VITE_API_BASE_URL`

Why Android is different:

- `localhost` inside an Android app points to the phone or emulator itself.
- Android emulator can reach the host machine with `10.0.2.2`.
- A real device usually needs your computer's LAN IP, for example `http://192.168.1.100:8000/api`.

## Android build example

PowerShell:

```powershell
$env:JAVA_HOME="D:\Android\Android Studio\jbr"
$env:VITE_ANDROID_API_BASE_URL="http://192.168.1.100:8000/api"
npm run sync:android
```

如果你不想每次手动设置环境变量，可以复制 [`.env.android.local.example`](E:/Work/Code/Bemo/frontend/.env.android.local.example) 为 `.env.android.local`。`npm run sync:android`、`npm run android:debug`、`npm run android:release`、`npm run android:bundle` 现在都会走 Android 专用 build mode，并正确读取这个文件。

## Current Role of `VITE_*_API_BASE_URL`

The frontend is now local-first, so this URL is no longer required for basic note usage.

It is only relevant when you want to connect to an optional Python `sync-server` or deliberately keep legacy backend compatibility for older attachment data.

## Backup Format

For manual migration between devices, the recommended format is the frontend-generated `Bemo ZIP` backup.

- `Bemo ZIP` is the complete backup format and is intended for full restore on another device.
- `Bemo JSON` remains supported as a legacy import format.
- `Markdown archive` is a `Markdown + attachments` zip for archiving or manual inspection, not a full restore format.
- `Flomo CSV` is an interchange format for note content only and does not preserve attachments, trash state, or sync metadata.

The runtime source of truth is the local database on each device, not a Markdown note directory.

## Real-device checklist

- Start the optional sync-server with [start-dev.ps1](E:/Work/Code/Bemo/start-dev.ps1) using `-WithSyncServer`, or [start-dev.bat](E:/Work/Code/Bemo/start-dev.bat) using `--with-sync-server`. It binds Uvicorn to `0.0.0.0:8000`.
- Make sure the phone and your computer are on the same LAN.
- Use your computer's IPv4 address in `VITE_ANDROID_API_BASE_URL`, not `localhost`.
- Allow port `8000` through Windows Firewall if the phone still cannot connect.

## Android HTTP note

The Android shell only allows cleartext HTTP in the debug build now:

- [AndroidManifest.xml](E:/Work/Code/Bemo/frontend/android/app/src/debug/AndroidManifest.xml)
- [network_security_config.xml](E:/Work/Code/Bemo/frontend/android/app/src/debug/res/xml/network_security_config.xml)

Release builds fall back to Android's default HTTPS-only behavior.

## Android release signing

Copy [keystore.properties.example](E:/Work/Code/Bemo/frontend/android/keystore.properties.example) to `keystore.properties` and fill in your real values:

```properties
storeFile=../keystore/bemo-release.jks
storePassword=your-store-password
keyAlias=bemo
keyPassword=your-key-password
```

Then place the keystore file at the matching path. When `keystore.properties` exists, the release build in [build.gradle](E:/Work/Code/Bemo/frontend/android/app/build.gradle) will automatically use it.

## Android doctor

在真正出包前，建议先运行：

```powershell
npm run android:doctor
```

这一步会先检查：

- `JAVA_HOME` 是否存在且版本兼容
- Android SDK 是否可被 Gradle 找到
- release 构建需要的 `keystore.properties` 是否已准备

如果你看到 `Unsupported class file major version 70`，通常表示当前机器用了过新的 JDK。把 `JAVA_HOME` 切回 JDK 17 后再执行即可。

For the full Android packaging flow, see [ANDROID_RELEASE_GUIDE.md](E:/Work/Code/Bemo/ANDROID_RELEASE_GUIDE.md).

Android display name and version metadata now live in [gradle.properties](E:/Work/Code/Bemo/frontend/android/gradle.properties).

For the broader product architecture, see [LOCAL_FIRST_ARCHITECTURE.md](E:/Work/Code/Bemo/LOCAL_FIRST_ARCHITECTURE.md).
