# Bemo

Bemo 是一个面向个人使用的笔记应用。当前实现不是“纯前端 + 可选后端”，而是按平台分层的混合架构。

现在应当这样理解它：

- `frontend` 仍然是产品客户端，负责界面、编辑器、AI、导入导出语义、同步引擎和 WebDAV 客户端逻辑
- `backend` 不只是可选 `sync-server`，它现在还承担网页端和桌面端的应用数据存储
- `android` 是例外路径。因为打包和运行时约束，移动端仍然保留本地数据库作为主存储

一句话概括就是：网页端和桌面端走 `frontend + backend`，移动端走 `frontend + local db`。

## 先用正确方式理解这个仓库

第一次看这个项目时，先不要把它套进“前后端分离”或者“纯本地优先”这两种固定模板里。

当前真实边界是：

- 网页端和桌面端的笔记、附件、备份恢复，当前仍然落在 Python 服务上
- Android 端的笔记和附件主存储仍然在本地
- 同步逻辑仍主要在前端，后端同时提供同步接口和网页端需要的 WebDAV 代理

所以，这个仓库现在更像是一个“同一套产品前端 + 两种运行存储形态”的项目，而不是单一运行时。

## 当前产品能力

Bemo 当前已经具备这些能力：

- 笔记增删改查
- 搜索、置顶、回收站
- 图片和附件
- AI 设置与 AI 对话
- 导入导出
- 同步队列、冲突处理
- WebDAV 同步
- 自部署同步服务

但这些能力的落点按平台不同：

- Web / Desktop：主要依赖 backend 提供应用数据存储
- Android：主要依赖本地数据库

## 仓库结构

仓库的核心目录可以这样看：

- [frontend](./frontend)：产品客户端代码，包含 UI、编辑器、AI、导入导出和同步逻辑
- [backend](./backend)：网页端和桌面端当前使用的应用数据服务，同时提供同步与代理能力
- [scripts](./scripts)：仓库级脚本
- [Example](./Example)：示例资源

## 快速开始

### Web / Desktop 开发

当前网页端和桌面端默认需要 backend 参与，因此开发时建议直接使用仓库脚本：

```powershell
.\start-dev.ps1
```

或者：

```bat
start-dev.bat
```

这两个脚本默认都会启动 Python 服务，再启动前端开发服务器。

如果你显式只想看前端界面或做纯样式调试，才使用：

```powershell
.\start-dev.ps1 -FrontendOnly
```

或者：

```bat
start-dev.bat --frontend-only
```

但要注意，这种方式不代表网页端主功能就能完整工作，因为当前网页端主数据路径仍然在 backend。

### 单独启动 backend

如果你只想先把 Python 服务跑起来：

```powershell
cd backend
.\start-sync-server.ps1
```

### Android 开发

Android 仍然保留本地数据库路径，所以它和 Web / Desktop 的运行假设不一样。Android 相关说明建议直接看：

- [frontend/README.md](./frontend/README.md)
- [ANDROID_RELEASE_GUIDE.md](./ANDROID_RELEASE_GUIDE.md)
- [ANDROID_PRELAUNCH_CHECKLIST.md](./ANDROID_PRELAUNCH_CHECKLIST.md)

## 什么时候需要 backend

这个问题现在要分平台回答。

对于 Web / Desktop：

- backend 是当前主存储的一部分，通常需要一起运行

对于 Android：

- 单机使用时可以走本地数据库
- 需要同步、网页端代理、或特定联调时再连接 backend

## 当前边界

### frontend 负责

- UI 和交互
- 编辑器工作流
- AI 配置与请求
- 导入导出格式语义
- 同步引擎
- WebDAV 客户端语义

### backend 负责

- Web / Desktop 当前的笔记与附件存储
- 备份恢复和相关应用存储接口
- 同步 change/blob API
- 网页端 WebDAV 代理

### Android 本地负责

- 移动端本地笔记与附件主存储
- 移动端离线使用

## 相关文档

- 当前运行边界：[LOCAL_FIRST_ARCHITECTURE.md](./LOCAL_FIRST_ARCHITECTURE.md)
- 同步设计：[SYNC_ARCHITECTURE.md](./SYNC_ARCHITECTURE.md)
- 前端说明：[frontend/README.md](./frontend/README.md)
- 后端说明：[backend/README.md](./backend/README.md)

## 结论

Bemo 当前不是“backend 只做 sync-server”的状态。

更准确的描述是：

- `frontend` 是产品客户端和同步逻辑主体
- `backend` 既做同步，也做 Web / Desktop 当前的数据存储
- `android` 因打包与运行时原因，仍保留本地数据库这条独立路径
