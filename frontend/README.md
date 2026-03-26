# Frontend

`frontend` 仍然是 Bemo 的产品客户端，但现在不能把它理解成“完全脱离 backend 独立运行”的统一运行时。

当前按平台分成两条主路径：

- Web / Desktop：前端负责界面和产品逻辑，数据主路径仍然依赖 backend
- Android：前端配合本地数据库运行，保留独立本地存储

## API Base URL

`VITE_*_API_BASE_URL` 现在不是单纯“可选 sync-server 地址”。

对 Web / Desktop 来说，它关系到当前应用数据路径是否可用。

对 Android 来说，基础笔记使用仍可走本地数据库；只有在你要联调同步、代理或特定后端路径时，这个地址才重要。

平台解析规则仍然是：

- Web: `VITE_WEB_API_BASE_URL` -> `VITE_API_BASE_URL`
- Android: `VITE_ANDROID_API_BASE_URL` -> `VITE_API_BASE_URL`

应用存储模式也可以显式指定：

- Web: `VITE_WEB_APP_STORAGE_MODE`
- Android: `VITE_ANDROID_APP_STORAGE_MODE`
- 通用回退: `VITE_APP_STORAGE_MODE`

可选值只有两个：

- `backend`
- `local`

## Web / Desktop 开发

如果你在开发 Web 或 Desktop，通常不要只跑前端，而是直接从仓库根目录启动整套开发环境：

```powershell
..\start-dev.ps1
```

或者：

```bat
..\start-dev.bat
```

这两个脚本默认会一起启动 backend 和 frontend。

## Android Build Example

PowerShell:

```powershell
$env:JAVA_HOME="D:\Android\Android Studio\jbr"
$env:VITE_ANDROID_API_BASE_URL="http://192.168.1.100:8000/api"
npm run sync:android
```

如果你不想每次手动设置环境变量，可以复制 [`.env.android.local.example`](E:/Work/Code/Bemo/frontend/.env.android.local.example) 为 `.env.android.local`。

## 当前运行边界

frontend 负责的仍然是这些：

- UI
- 编辑器
- AI
- 导入导出格式语义
- 同步流程
- WebDAV 客户端语义

但当前不要再把“前端负责产品逻辑”误读成“前端自己持有所有平台的主存储”。

## Backup Format

备份格式说明不变：

- `Bemo ZIP` 适合完整恢复
- `Bemo JSON` 是旧版兼容导入格式
- `Markdown archive` 适合归档和人工检查
- `Flomo CSV` 只适合内容交换

其中 Android 和 Web / Desktop 在运行时主存储不同，但导入导出入口仍在前端产品层。

## Android Note

Android 仍然是当前最接近“本地优先”那条路径的平台。

也正因为这样，Android 的联调方式和 Web / Desktop 不一样：前者可以保留本地数据库主路径，后者通常需要 backend 一起参与。

完整 Android 打包流程请看 [ANDROID_RELEASE_GUIDE.md](E:/Work/Code/Bemo/ANDROID_RELEASE_GUIDE.md)。

更完整的当前架构说明请看 [LOCAL_FIRST_ARCHITECTURE.md](E:/Work/Code/Bemo/LOCAL_FIRST_ARCHITECTURE.md)。
