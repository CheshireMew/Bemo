# Bemo 同步完成度清单

本文档只记录当前仓库内已经落地到代码的同步能力，以及仍需在真实环境中验证或继续增强的项目。

## 已落地能力

### 1. Local-First 本地优先

- 本地 IndexedDB 保存：
  - 笔记缓存
  - 回收站
  - mutation log
  - sync state
  - conflict records
  - blob index
- 本地先写，远端异步同步
- 离线时保留本地写入，不依赖远端可用性

相关代码：
[frontend/src/utils/db.ts](/E:/Work/Code/Bemo/frontend/src/utils/db.ts)
[frontend/src/domain/sync/syncCoordinator.ts](/E:/Work/Code/Bemo/frontend/src/domain/sync/syncCoordinator.ts)

### 2. 多端同步后端抽象

- 支持 `local`
- 支持 `server`
- 支持 `webdav`

相关代码：
[frontend/src/domain/sync/syncTransportBuilder.ts](/E:/Work/Code/Bemo/frontend/src/domain/sync/syncTransportBuilder.ts)
[frontend/src/utils/serverTransport.ts](/E:/Work/Code/Bemo/frontend/src/utils/serverTransport.ts)
[frontend/src/utils/webdavTransport.ts](/E:/Work/Code/Bemo/frontend/src/utils/webdavTransport.ts)

### 3. WebDAV 同步主链路

- WebDAV 目录初始化
- manifest 读写
- change log push / pull
- blob 上传 / 下载
- 首次同步 snapshot 启动
- operation marker 去重
- 带 token 的 lease 确认
- 分桶 change 目录，避免全量扁平扫描

相关代码：
[frontend/src/domain/sync/webdav/webdavRequest.ts](/E:/Work/Code/Bemo/frontend/src/domain/sync/webdav/webdavRequest.ts)
[frontend/src/domain/sync/webdav/webdavChanges.ts](/E:/Work/Code/Bemo/frontend/src/domain/sync/webdav/webdavChanges.ts)
[frontend/src/domain/sync/webdav/webdavLease.ts](/E:/Work/Code/Bemo/frontend/src/domain/sync/webdav/webdavLease.ts)
[frontend/src/domain/sync/webdav/webdavManifest.ts](/E:/Work/Code/Bemo/frontend/src/domain/sync/webdav/webdavManifest.ts)
[frontend/src/domain/sync/webdav/webdavBlobs.ts](/E:/Work/Code/Bemo/frontend/src/domain/sync/webdav/webdavBlobs.ts)
[frontend/src/domain/sync/webdav/webdavSnapshot.ts](/E:/Work/Code/Bemo/frontend/src/domain/sync/webdav/webdavSnapshot.ts)

### 4. 自动同步调度

- 手动触发同步
- 在线恢复时同步
- 前台恢复时同步
- 周期性同步
- 失败后指数退避

相关代码：
[frontend/src/domain/sync/syncCoordinator.ts](/E:/Work/Code/Bemo/frontend/src/domain/sync/syncCoordinator.ts)

### 5. 冲突记录与处理

- 结构化冲突记录
- 冲突副本生成
- `revision_conflict` 支持：
  - 保留本地并重试
  - 接受当前结果
- `local_note_not_found` 支持：
  - 按远端重建
  - 接受当前结果
- 已自动收敛：
  - 远端 delete 到达时，本地已不存在

相关代码：
[frontend/src/domain/sync/localSyncApply.ts](/E:/Work/Code/Bemo/frontend/src/domain/sync/localSyncApply.ts)
[frontend/src/domain/sync/conflictResolution.ts](/E:/Work/Code/Bemo/frontend/src/domain/sync/conflictResolution.ts)
[frontend/src/store/conflicts.ts](/E:/Work/Code/Bemo/frontend/src/store/conflicts.ts)
[frontend/src/components/MainFeed/ConflictView.vue](/E:/Work/Code/Bemo/frontend/src/components/MainFeed/ConflictView.vue)

### 6. 附件同步与去重

- 出站附件 hash 化
- 入站附件按 blob hash 去重
- 本地附件索引
- 本地附件索引失效自动修复
- 远端未引用 blob 手动清理

相关代码：
[frontend/src/utils/syncAttachments.ts](/E:/Work/Code/Bemo/frontend/src/utils/syncAttachments.ts)
[frontend/src/utils/db.ts](/E:/Work/Code/Bemo/frontend/src/utils/db.ts)
[frontend/src/utils/webdavTransport.ts](/E:/Work/Code/Bemo/frontend/src/utils/webdavTransport.ts)
[frontend/src/components/SettingsSyncSection.vue](/E:/Work/Code/Bemo/frontend/src/components/SettingsSyncSection.vue)

### 7. 设置与可操作性

- 同步配置草稿化
- 测试连接
- 初始化远端目录
- 立即同步
- 清理远端未引用附件

相关代码：
[frontend/src/components/SettingsSyncSection.vue](/E:/Work/Code/Bemo/frontend/src/components/SettingsSyncSection.vue)

## 已有自动化验证

### 1. 纯逻辑测试

- 编辑器附件工具
- 冲突处理规则
- snapshot 状态归并

相关测试：
[frontend/tests/editorAttachments.spec.ts](/E:/Work/Code/Bemo/frontend/tests/editorAttachments.spec.ts)
[frontend/tests/conflictResolution.spec.ts](/E:/Work/Code/Bemo/frontend/tests/conflictResolution.spec.ts)
[frontend/tests/webdavSnapshot.spec.ts](/E:/Work/Code/Bemo/frontend/tests/webdavSnapshot.spec.ts)

### 2. WebDAV 协议级 mock 测试

- `PROPFIND` href 兼容
- `MKCOL` 递归
- lease 确认失败
- operation marker 去重
- snapshot bootstrap
- 远端未引用 blob 清理

相关测试：
[frontend/tests/webdavProtocol.spec.ts](/E:/Work/Code/Bemo/frontend/tests/webdavProtocol.spec.ts)

### 3. 本地 HTTP WebDAV 集成测试

- 真实 HTTP 请求链路
- 目录创建
- change push / pull
- blob 存取
- lease
- manifest / snapshot

相关测试：
[frontend/tests/webdavLocalServer.spec.ts](/E:/Work/Code/Bemo/frontend/tests/webdavLocalServer.spec.ts)

## 仍需真实环境验证

以下项目不是“代码缺失”，而是“还需要真实外部环境确认”。

### 1. 第三方 WebDAV 服务兼容矩阵

建议至少验证：

- 坚果云
- Nextcloud
- 群晖 WebDAV Server

重点关注：

- URL / basePath 填法
- `PROPFIND` href 形式
- `MKCOL` 行为
- `HEAD` / `DELETE` 是否受限
- 大文件与中文文件名

### 2. 多设备真实同步回归

建议至少验证：

- A 创建设备，B 拉取
- A 编辑，B 收敛
- A 删除，B 收敛
- 图片附件同步
- 并发编辑冲突
- 冲突副本处理后再次同步

### 3. 移动端生命周期行为

建议至少验证：

- 前台切后台再恢复
- 网络切换
- 系统挂起恢复
- Android 真机上的定时/恢复同步时机

### 4. 远端清理策略安全性

当前实现只按 snapshot 的当前引用集清理未引用 blob。

后续可继续验证或增强：

- snapshot 落后时是否需要延迟清理
- 是否保留最近 N 次 snapshot 的引用保护
- 是否提供 dry-run / 预览模式

## 当前结论

如果只看代码与自动化测试，Bemo 当前已经具备：

- Local-First 同步核心
- WebDAV 作为正式同步后端
- 冲突处理第一版
- 附件同步去重
- snapshot 基线恢复
- WebDAV 协议层自动化回归

当前最主要的剩余工作已经不是继续堆核心代码，而是：

- 真实第三方 WebDAV 服务验证
- 多设备真机验证
- 移动端生命周期验证
