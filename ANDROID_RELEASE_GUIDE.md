# Android 打包指南

本文档基于当前仓库结构：

- 前端：`frontend`，Vue + Vite + Capacitor
- Android 工程：`frontend/android`
- 后端：`backend`

版本与 Git tag 约定见 [RELEASE_VERSIONING.md](E:/Work/Code/Bemo/RELEASE_VERSIONING.md)。

## 先确认当前 Android 的产品边界

不要把 Android 包理解成 Web / Desktop 的另一种壳。

当前准确事实是：

- Android 主运行时是 `local-backed`
- backend 对 Android 主要用于同步、联调、代理或特定远端能力，不应被理解成 Android 的主存储依赖
- Android 不提供“从坚果云同步目录恢复”入口
- Android 不提供“快捷键说明”设置页
- Android 的复制笔记、图片预览、文件打开走原生 bridge

如果后面出现“为什么 Android 和桌面页结构不一样”的讨论，先按运行时边界理解，不要先按缺功能理解。

## 1. 环境要求

- Android Studio
- JDK 17
- Android SDK
- `JAVA_HOME` 已正确设置

快速自检：

```powershell
java -version
echo $env:JAVA_HOME
npm run android:doctor
```

如果当前机器装的是更高版本 JDK，例如 JDK 26，Gradle 可能直接报：

```text
Unsupported class file major version 70
```

这种情况不要继续排查 Gradle 脚本，先把 `JAVA_HOME` 切回 JDK 17。

## 2. 调试联机准备

先启动本机后端：

```powershell
cd E:\Work\Code\Bemo
.\start-dev.ps1
```

这个脚本会把后端绑定到 `0.0.0.0:8000`，便于模拟器或真机访问。

然后在前端目录配置 Android 后端地址：

```powershell
cd E:\Work\Code\Bemo\frontend
$env:JAVA_HOME="D:\Android\Android Studio\jbr"
$env:VITE_ANDROID_API_BASE_URL="http://192.168.1.100:8000/api"
```

说明：

- 模拟器默认可走 `http://10.0.2.2:8000/api`
- 真机必须改成你电脑的局域网 IPv4 地址
- 手机和电脑要在同一局域网
- 也可以复制 `frontend/.env.android.local.example` 为 `.env.android.local`，Android 构建脚本会自动读取

## 3. 同步 Web 资源到 Android

```powershell
cd E:\Work\Code\Bemo\frontend
npm run sync:android
```

这一步会：

1. 执行前端构建
2. 把 `dist` 同步到 Capacitor Android 工程

## 4. 调试包

直接生成 debug APK：

```powershell
cd E:\Work\Code\Bemo\frontend
npm run android:debug
```

产物位置：

```text
frontend/android/app/build/outputs/apk/debug/app-debug.apk
```

说明：

- `debug` 允许明文 HTTP，适合局域网联调
- 包名会追加 `.debug`
- 该命令会先执行 Android 环境预检，再构建前端并同步到 Capacitor

## 5. 发布签名

先生成 keystore，建议放在仓库外，或者放在 `frontend/keystore/` 并确保不提交。

示例命令：

```powershell
keytool -genkeypair -v -keystore E:\Work\Code\Bemo\frontend\keystore\bemo-release.jks -alias bemo -keyalg RSA -keysize 2048 -validity 10000
```

然后复制：

```text
frontend/android/keystore.properties.example
```

为：

```text
frontend/android/keystore.properties
```

填写真实值，例如：

```properties
storeFile=../keystore/bemo-release.jks
storePassword=your-store-password
keyAlias=bemo
keyPassword=your-key-password
```

## 6. Release APK / AAB

先确认 release API 地址是 HTTPS。

如果要生成 release APK：

```powershell
cd E:\Work\Code\Bemo\frontend
$env:JAVA_HOME="D:\Android\Android Studio\jbr"
$env:VITE_ANDROID_API_BASE_URL="https://your-api.example.com/api"
npm run android:release
```

产物位置：

```text
frontend/android/app/build/outputs/apk/release/app-release.apk
```

如果要生成上架用 AAB：

```powershell
cd E:\Work\Code\Bemo\frontend
$env:JAVA_HOME="D:\Android\Android Studio\jbr"
$env:VITE_ANDROID_API_BASE_URL="https://your-api.example.com/api"
npm run android:bundle
```

产物位置：

```text
frontend/android/app/build/outputs/bundle/release/app-release.aab
```

## 7. 推荐的版本管理

发布前至少更新：

- `frontend/android/gradle.properties` 里的 `BEMO_APP_NAME`
- `frontend/android/gradle.properties` 里的 `BEMO_VERSION_CODE`
- `frontend/android/gradle.properties` 里的 `BEMO_VERSION_NAME`

建议规则：

- `versionCode` 每次发布递增整数
- `versionName` 用面向用户的版本号，如 `0.1.0`

当前建议的首发默认值：

- `BEMO_APP_NAME=Bemo`
- `BEMO_VERSION_CODE=1`
- `BEMO_VERSION_NAME=0.1.0`
- Android package name: `io.github.cheshiremew.bemo`

## 8. 发布前检查

- 应用名、图标、启动图是否为正式版本
- `applicationId` 是否最终确定
- release 是否只使用 HTTPS
- 真机是否完成核心流程验证：创建、编辑、删除、搜索、图片上传、同步
- Windows 本地联调配置是否未误带入正式环境

更完整的发布检查见 [ANDROID_PRELAUNCH_CHECKLIST.md](E:/Work/Code/Bemo/ANDROID_PRELAUNCH_CHECKLIST.md)。

图标和启动图替换入口见 [ASSET_REPLACEMENT_NOTES.md](E:/Work/Code/Bemo/frontend/android/ASSET_REPLACEMENT_NOTES.md)。

## 9. 常用命令

在 `frontend` 目录下：

```powershell
npm run android:doctor
npm run sync:android
npm run android:open
npm run android:debug
npm run android:release
npm run android:bundle
```
