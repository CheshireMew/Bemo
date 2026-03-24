# Bemo Local-First Architecture

## 当前目标

Bemo 现在的目标架构是：

- 前端本地优先
- 单机默认可用
- Python 不再是业务主流程前提
- Python 仅保留为可选 `Sync Server`
- AI 由前端直接调用用户配置的第三方 AI API

这意味着：

- 用户不需要部署后端也能正常记笔记
- 用户不需要部署后端也能使用 AI 功能
- 只有在需要多端同步时，才需要配置 `Sync Server` 或 `WebDAV`

## 前端现在已经本地化的能力

以下能力已经不再依赖 Python 业务后端：

- 笔记增删改查
- 本地搜索
- 置顶
- 回收站
- AI 设置存储
- AI 会话历史
- AI 对话请求
- 图片附件插入
- 备份导出
- 导入恢复
- 同步本地变更应用

对应实现主要在：

- `frontend/src/domain/notes/localNotesRepository.ts`
- `frontend/src/domain/ai/localAiSettings.ts`
- `frontend/src/domain/ai/localAiConversations.ts`
- `frontend/src/domain/ai/aiClient.ts`
- `frontend/src/domain/importExport/localImportExport.ts`
- `frontend/src/domain/sync/localSyncApply.ts`
- `frontend/src/utils/db.ts`

## Python 后端现在的正确角色

Python 后端不再承担这些职责：

- 笔记 CRUD
- AI 设置接口
- AI 聊天接口
- 导入导出接口
- 本地同步应用接口

Python 后端现在应被视为：

- 可选 `Sync Server`

也就是：

- 有它：用户可以使用自部署同步
- 没有它：用户仍然可以单机完整使用 Bemo

## Sync Server 与 WebDAV

### Sync Server

专用同步后端，懂 Bemo 的同步语义：

- changes
- cursor
- operation_id
- blob
- 冲突

优点：

- 更稳
- 更容易处理冲突和增量同步
- 更适合进阶用户

### WebDAV

通用远端文件仓库，不懂 Bemo 业务语义。

优点：

- 门槛更低
- 对个人用户更友好
- 不要求自建专用服务

补充说明：

- WebDAV 的同步语义和客户端实现仍然归前端所有
- 但在网页端运行时，很多第三方 WebDAV 服务不会放开浏览器 `CORS`
- 因此网页端通常需要借助 `Sync Server` 提供的代理转发访问 WebDAV
- 这只是浏览器环境下的传输桥接，不表示 WebDAV 的业务所有权回到后端

## 当前推荐模式

默认模式：

- 本地模式

可选增强：

- WebDAV 同步
- 自部署 Sync Server 同步

## 前端与远端的职责边界

### 前端负责

- 本地数据存储
- UI
- 笔记主流程
- AI 配置
- AI 请求
- mutation log
- 冲突副本
- 同步引擎

### 远端负责

- 作为多设备共享同步目标
- 保存 changes / blobs / cursor

### 远端不负责

- 单机笔记主流程
- 单机 AI 功能入口
- 本地导入导出

## 当前保留的远端客户端实现

这些文件仍然应该保留：

- `frontend/src/utils/serverTransport.ts`
- `frontend/src/utils/webdavTransport.ts`
- `frontend/src/domain/sync/syncTransportBuilder.ts`

原因：

- 它们不是历史包袱
- 它们是“可选同步后端”的客户端实现

## 当前已删除或已退役的旧业务后端门面

以下旧门面已经被移除：

- `frontend/src/services/aiSettings.ts`
- `frontend/src/domain/settings/aiSettingsApi.ts`
- `frontend/src/domain/importExport/importExportApi.ts`
- `frontend/src/domain/notes/notesApi.ts`

## 结论

Bemo 现在的正式方向是：

- 本地优先
- 单机完整可用
- 同步是可选能力
- Python 服务只作为可选 Sync Server

后续改动如果重新把笔记主流程、AI 主流程、导入导出主流程放回 Python 业务后端，就会偏离当前架构目标。
