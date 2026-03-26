# Backend

`backend` 当前不是“只剩 sync-server”的辅助模块。

它在现阶段承担两类正式职责：

- Web / Desktop 的应用数据存储
- 同步 API 与网页端代理能力

## 当前角色

backend 现在负责：

- Web / Desktop 的笔记接口
- Web / Desktop 的附件接口
- Web / Desktop 的备份相关接口
- sync `push / pull / blobs`
- 网页端 WebDAV 代理

因此它更接近“Web / Desktop 应用数据服务 + 同步服务”，而不是一个纯远端同步目标。

## 与 Mobile 的关系

Mobile 主存储在本地，所以它不是通过 backend 才能单机运行。

但这不代表 backend 是可删的兼容层。对整个产品来说：

- Web / Desktop 依赖 backend 作为主存储
- Mobile 在需要同步、联调和网页端互通时也会与 backend 协作

## 启动方式

仓库根目录的开发脚本默认会一起启动 frontend 和 backend：

- [start-dev.ps1](E:/Work/Code/Bemo/start-dev.ps1)
- [start-dev.bat](E:/Work/Code/Bemo/start-dev.bat)

如果只想单独启动 backend：

```powershell
.\start-sync-server.ps1
```

如果你明确要跑纯同步服务模式，而不是 Web / Desktop 当前使用的 app 模式：

```powershell
.\start-sync-server.ps1 -Mode server
```

## 读代码时的判断

读 backend 时，优先按下面两块看：

- `/api/app/*` 和对应 service：Web / Desktop 当前的应用数据服务
- `/api/sync/*` 和对应 service：同步协议与远端传输能力

不要默认把 `/api/app/*` 当作“迟早会删掉的历史兼容层”。

## 结论

当前 backend 的准确定位是：

- Web / Desktop 主存储服务
- 同步服务
- 网页端代理桥接

更完整的当前架构说明请看 [CURRENT_ARCHITECTURE.md](E:/Work/Code/Bemo/CURRENT_ARCHITECTURE.md)。
