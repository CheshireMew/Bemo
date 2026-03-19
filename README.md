# Bemo

Bemo 是一个 **frontend-first / local-first** 的个人笔记工具。

默认理解应当是：

- 前端是产品主体
- 不要求先部署后端
- AI 由前端直接连接用户配置的第三方 AI API
- 同步是可选增强能力
- Python 端不是默认业务后端

## 项目定位

这个仓库**不应再被理解为传统前后端双核心项目**。

当前目标状态是：

- `frontend` 承担产品主流程
- `backend` 只保留可选的自部署 `sync-server` API

前端应当拥有的能力包括：

- 笔记增删改查
- 搜索
- 回收站
- AI 设置与 AI 对话
- 图片/附件用户体验
- 本地导入导出
- Local-First 同步队列与冲突处理
- WebDAV 同步

Python 端当前只应保留：

- 自部署同步 change API
- 自部署同步 blob API
- 同步鉴权与相关测试

也就是：

- 不部署 Python 服务，Bemo 仍应能正常单机使用
- 只有在用户需要 `Sync Server` 模式时，才需要 Python 服务

## 同步方式

Bemo 当前面向两种可选同步目标：

1. `Sync Server`
2. `WebDAV`

区别见 [LOCAL_FIRST_ARCHITECTURE.md](E:/Work/Code/Bemo/LOCAL_FIRST_ARCHITECTURE.md)。

## 关键文档

- 本地优先架构说明：[LOCAL_FIRST_ARCHITECTURE.md](E:/Work/Code/Bemo/LOCAL_FIRST_ARCHITECTURE.md)
- 前端迁移待办：[FRONTEND_MIGRATION_BACKLOG.md](E:/Work/Code/Bemo/FRONTEND_MIGRATION_BACKLOG.md)
- Android 打包指南：[ANDROID_RELEASE_GUIDE.md](E:/Work/Code/Bemo/ANDROID_RELEASE_GUIDE.md)
- Android 上架前检查：[ANDROID_PRELAUNCH_CHECKLIST.md](E:/Work/Code/Bemo/ANDROID_PRELAUNCH_CHECKLIST.md)
- 版本与 Git tag 策略：[RELEASE_VERSIONING.md](E:/Work/Code/Bemo/RELEASE_VERSIONING.md)

## 目录说明

- [frontend](E:/Work/Code/Bemo/frontend): 主产品代码，默认承接新功能
- [backend](E:/Work/Code/Bemo/backend): 可选 `sync-server`，不再作为默认业务后端

## 开发说明

如果你要同时启动前端和 Python sync-server，可使用：

```powershell
.\start-dev.ps1 -WithSyncServer
```

如果只跑前端，本地优先模式不需要 Python 服务：

```powershell
.\start-dev.ps1
```

部署远程 `sync-server` 时，至少需要配置：

- `BEMO_SYNC_TOKEN`
- `BEMO_CORS_ORIGINS`（网页端跨域访问时）

## 备份与迁移

手动在两台电脑之间迁移时，推荐使用前端导出的 `Bemo ZIP` 完整备份。

- `Bemo ZIP`：完整备份格式，包含 `manifest.json`、笔记、回收站、附件和必要元数据，适合完整恢复
- `Bemo JSON`：旧版兼容格式，仍可导入，但附件多时体积和解析成本更高
- `Markdown 归档包`：`Markdown + attachments` 归档格式，适合长期归档和人工检查，不适合完整恢复
- `Flomo CSV`：兼容交换格式，只适合内容迁移，不包含附件、回收站和同步状态

运行时主数据应保存在各端本地数据库中；`Markdown/CSV/JSON` 都属于导入导出格式，不是运行时主存储。

## CI

仓库默认 CI 现在分成两层：

- 默认 CI：前端 + Python `sync-server`
- legacy backend 兼容测试：单独手动触发
