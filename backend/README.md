# Backend

这个目录现在不能再简单写成“只剩 sync-server”。

按当前实现，它同时承担两类职责：

- Web / Desktop 当前的应用数据存储
- 同步相关 API 与网页端代理能力

## 当前角色

backend 现在负责的内容包括：

- Web / Desktop 的笔记数据接口
- Web / Desktop 的附件接口
- 备份导入导出相关接口
- sync `push / pull / blobs`
- 网页端 WebDAV 代理

所以它现在更接近“应用数据服务 + 同步服务”的组合，而不是一个纯远端同步目标。

## 与 Android 的关系

Android 是当前例外路径。

由于打包和运行时约束，移动端仍然保留本地数据库作为主存储，所以不能用 Web / Desktop 的运行方式去理解它。

这也意味着：

- 不启动 backend，Web / Desktop 的主数据路径通常不完整
- 不启动 backend，Android 单机本地路径仍然可以成立

## 开发启动

仓库根目录下的启动脚本已经按这个现实来组织：

- [start-dev.ps1](E:/Work/Code/Bemo/start-dev.ps1) 默认会启动 backend 和 frontend
- [start-dev.bat](E:/Work/Code/Bemo/start-dev.bat) 也默认会这样做
- 只有显式传 `-FrontendOnly` 或 `--frontend-only` 时，才只启动前端

如果你只想单独启动 backend：

```powershell
.\start-sync-server.ps1
```

如果你要显式启动纯同步服务模式，而不是当前 Web / Desktop 使用的 app 模式：

```powershell
.\start-sync-server.ps1 -Mode server
```

## 环境变量

当前最重要的变量仍然是：

- `BEMO_SYNC_TOKEN`
- `BEMO_CORS_ORIGINS`
- `BEMO_MAX_SYNC_BLOB_BYTES`

即使 backend 现在不只是 sync-server，这几个变量依然控制同步和网页端代理行为。

## 代码阅读建议

读 backend 时，先按职责分两块：

- `/api/app/*` 和对应 service：Web / Desktop 当前的应用存储接口
- `/api/sync/*` 和对应 service：同步接口与远端传输能力

不要再默认把 backend 里的所有东西都当成“历史兼容层”或者“只给 sync 用”。

## 结论

当前 backend 的准确定位是：

- Web / Desktop 的应用数据服务
- 同步服务
- 网页端代理桥接

如果以后要把它重新收窄成纯 sync-server，需要先完成真实迁移，再改这份文档，而不是先沿用旧说法。
