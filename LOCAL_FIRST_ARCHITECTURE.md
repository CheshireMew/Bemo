# Bemo Current Runtime Architecture

这个文件名保留了历史名字，但内容以当前真实实现为准。

Bemo 现在不是纯 `local-first` 的单一路径运行时，而是混合架构：

- Web：前端负责产品交互，backend 负责当前应用数据存储
- Desktop：前端外壳仍是产品主体，但当前数据同样落在 backend
- Android：保留本地数据库作为主存储

## 为什么会变成现在这样

核心原因不是产品概念改变，而是运行时约束不同。

- Web 和 Desktop 当前这条链路，仍然依赖 Python 服务来承接笔记、附件和备份恢复
- Android 因为打包、网络和运行时限制，继续保留本地数据库路径更稳

所以现在真正成立的不是“所有端都本地优先”，而是“只有移动端仍然把本地数据库作为主存储”。

## 当前职责边界

### frontend 负责

- UI
- 编辑器
- AI 配置和 AI 请求
- 导入导出格式语义
- 同步引擎
- WebDAV 客户端语义

### backend 负责

- Web / Desktop 当前的笔记数据存储
- Web / Desktop 当前的附件存储
- 备份导入导出相关服务接口
- 同步 `changes / blobs / cursor`
- 网页端 WebDAV 代理

### Android 本地负责

- 本地笔记主存储
- 本地附件主存储
- 离线读写

## 现在不要再这样理解 backend

下面这些说法已经不准确了：

- “backend 只是可选 sync-server”
- “不部署 backend 也能完整使用所有端”
- “网页端和桌面端默认都走纯前端本地存储”

当前真实情况是：

- Web / Desktop 默认需要 backend
- Android 才保留了本地数据库主路径

## Sync Server 与 WebDAV

虽然 backend 现在不只是 `sync-server`，但同步相关边界依然存在。

### Sync Server

backend 继续负责：

- 远端 change API
- blob API
- token 校验
- 同步状态持久化

### WebDAV

WebDAV 的同步语义和客户端流程依然主要在前端。

但网页端受浏览器限制，访问第三方 WebDAV 时往往还需要 backend 代理转发。这说明 backend 在当前实现里既是应用存储服务，也是网页端同步桥接的一部分。

## 当前推荐理解

如果你要改代码，先按下面这条线判断：

- 改 UI、编辑器、AI、导入导出语义、同步流程，优先看 `frontend`
- 改 Web / Desktop 当前的数据存储、附件接口、同步服务，优先看 `backend`
- 改 Android 本地数据行为，优先看移动端本地存储相关实现

## 结论

Bemo 当前的准确描述是：

- 前端仍然是产品客户端
- 后端当前同时承担 Web / Desktop 的数据存储和同步服务
- Android 因运行时原因保留本地数据库

如果后续架构再调整，应当先更新这份文档，再改其它说明文件，避免继续出现“目标架构”和“当前实现”混在一起的情况。
