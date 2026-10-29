# 同步缺陷修复记录

2026-10-05：原同步审计确认的 8 类问题均已修复，并完成 Windows 上的针对性回归。Web / Desktop 仍以后端 app 存储为主，Mobile 仍使用本地存储；同步协议、冲突语义和数据契约保持共享，没有改成同一存储或同一界面。

## 修复与证据

| 原问题 | 当前行为 | 回归证据 |
| --- | --- | --- |
| 1. 自动补发导致远端删除或恢复被反向覆盖 | 每个目标保存已同步基线，只有真实本地变化才补发；永久删除保留不含正文的删除记录。重复同步、进度重放及快照压缩不会恢复旧笔记；未发送的编辑保留为冲突副本。 | syncRemediation、syncProtocolIntegrity、test_sync_integrity |
| 2. 服务端版本检查、笔记、日志、回执分开提交 | 同一写事务覆盖去重、版本校验、笔记修改、日志和回执。写日志失败整体回滚；两个设备从同一基础版本修改只接受一个；重试返回原先接受的正式内容。 | test_sync_integrity 的故障注入、并发修改和同操作并发重试 |
| 3. WebDAV 接受过期版本覆盖 | 持有写租约时读取远端状态并验证基础版本，返回远端快照及结构化冲突。服务器和 WebDAV 都拒绝不匹配的明确基础版本，避免旧正文相同但属性不同的更新覆盖新属性。 | syncProtocolIntegrity、test_sync_integrity、test_api_sync |
| 4. 缺批次或分片仍推进进度 | 批次数量和进度连续性、快照及分片完整性检查失败即停止；并发压缩使旧文件失效时重读 manifest 后恢复。持久化进度仅在变更成功应用后推进。 | syncProtocolIntegrity、webdavProtocol、webdavRecovery、webdavSnapshot |
| 5. 不同同步地址共用队列、进度与回执 | 用规范化 URL 绑定服务器目标，WebDAV 另包含账号和目录；发送队列、进度、基线、回执和冲突都绑定目标。旧状态只归属首次绑定的目标，更换地址不会搬走旧队列；切回后可以继续。 | syncRemediation 的两个真实隔离 sync 服务；syncProtocolIntegrity 的账号、目录及旧状态迁移 |
| 6. 附件哈希索引只对应一个文件名 | 内容 Blob 按哈希保存，文件名引用独立保存。同一内容的多个名称都能读取；同名 A→B→A 不会误用 B；迁移旧索引时重新验证字节哈希。恢复备份和重置覆盖新增缓存。 | syncProtocolIntegrity、attachmentUrls、localAttachments、localImportExport、syncAttachmentRuntime |
| 7. 只有入站变化时界面不刷新 | 成功完成次数驱动实际应用刷新回调，即使发送队列为空也会刷新。 | syncRemediation 调用真实 initSync 回调 |
| 8. 手动同步失败仍显示成功 | 协调器返回完成、失败或未执行结果，按钮据此显示成功、冲突、错误或信息提示，后台重试继续保留。 | syncRemediation 调用实际 useSyncOperations，验证错误 Token 的 401 提示及本地模式提示 |

相关收尾包括：入站使用远端正式版本号；暂停同步期间连续编辑后按确认版本校正本地版本，保护推送过程中产生的新编辑；新目标为空时，针对该目标明确产生的编辑会先建立笔记；接受远端删除时按正式回收站或永久删除状态应用，保留冲突副本；保留本地重试包含置顶属性，切换目标后禁止误处理原目标的冲突。

## 验证

前端正式 runner 运行 22 个相关测试文件全部通过：archiveValidation、attachmentUrls、backendAppStore、conflictResolution、indexedDbTransactions、localAttachments、localImportExport、markdownArchive、pendingQueueSummary、remoteDeleteConflictFlow、serverSyncE2E、syncAttachmentRuntime、syncCoordinator、syncIntegrity、syncProtocolIntegrity、syncRemediation、webdavChanges、webdavLocalServer、webdavProtocol、webdavRecovery、webdavRequest、webdavSnapshot。22 是测试文件数，不是用例数。后端 test_api_sync 与 test_sync_integrity 共 18 个用例通过。服务端版本检查收尾后另复跑 serverSyncE2E、syncIntegrity、syncRemediation，全部通过。

应用 TypeScript 检查及 git diff --check 通过。测试使用隔离的 app / sync 数据目录和内存或本地 WebDAV 服务，BEMO_TEST_KEEP_DATA=1 保留本次测试数据；没有清理工作区文件，也没有打包或安装依赖。

复现命令（在对应目录运行）：

```powershell
$env:BEMO_TEST_KEEP_DATA='1'
Set-Location E:\Code\Bemo\frontend
& .\node_modules\.bin\tsc.cmd -p tsconfig.tests.json
& D:\Tools\NodeJS\node.exe .test-dist/tests/runAll.js archiveValidation.spec attachmentUrls.spec backendAppStore.spec conflictResolution.spec indexedDbTransactions.spec localAttachments.spec localImportExport.spec markdownArchive.spec pendingQueueSummary.spec remoteDeleteConflictFlow.spec serverSyncE2E.spec syncAttachmentRuntime.spec syncCoordinator.spec syncIntegrity.spec syncProtocolIntegrity.spec syncRemediation.spec webdavChanges.spec webdavLocalServer.spec webdavProtocol.spec webdavRecovery.spec webdavRequest.spec webdavSnapshot.spec
& .\node_modules\.bin\vue-tsc.cmd --noEmit -p tsconfig.app.json
Set-Location E:\Code\Bemo\backend
& D:\Tools\Python310\python.exe -m unittest tests.test_api_sync tests.test_sync_integrity
```

本轮结论限定于原审计的 8 类缺陷及必要集成。没有验收真实 WebDAV 厂商账号、Android 真机或桌面 GUI，不把共享逻辑测试描述为这些环境的验收。客户端和自部署同步服务器应一起更新，以使用相同的版本检查和永久删除语义。已有旧数据库会补充删除字段；旧日志中能识别的永久删除会迁移为删除记录。旧客户端已经造成的删除回流或历史覆盖，需要依据保留的备份或历史记录人工确认，代码修复不能还原已经丢失的历史内容。
