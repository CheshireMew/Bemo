# 服务器与本机同步修复记录

2026-10-29。本次只修复前次检查指出的服务器数据互通、后台同步中断和请求缺少超时三个问题，以及保证这些改动可用所需的迁移和回归。

## 修复结果

| 问题 | 当前行为 | 验证 |
| --- | --- | --- |
| 设备同步数据与服务器网页笔记分离 | app / desktop 模式的应用数据和协议表共同保存在 app.db。网页写入、设备推送、同步日志和回执在同一事务中更新。独立 server 模式继续使用 sync.db。 | test_hosted_sync；serverDeploymentSync 的两个独立 Windows 后端进程 |
| 需要打开网页连接两套数据，桌面最小化会暂停 | 服务器在处理写入时直接保持应用数据与协议一致，不需要网页客户端。桌面最小化后继续定时同步；网页默认同步设置下也会检查主存储变更并刷新显示。 | 无服务器网页客户端的双向笔记与图片传输；syncRuntimeRecovery 的隐藏窗口调度、重试及显示刷新测试 |
| 服务器连接不返回时一直卡住 | 所有 Server 请求默认 30 秒超时；超时释放本次同步、保留队列，后续请求可以重试成功。 | syncRuntimeRecovery 的真实 HTTP 停滞连接、完整协调器失败后重试，以及 bootstrap / pull / push / blob 请求 |

旧安装升级保留原数据库和文件，迁入历史游标、回执、删除记录和历史附件。两边正文有分歧时保留副本，同名不同内容的旧附件改名并修正引用。失败不会提交半份元数据，重复启动不会重复迁移。

协议版本保持递增，即使本机采用其它同步目标确认的版本号，也不会让旧设备的过期基础版本重新有效。连接自身服务时识别同一主存储，避免回放自身历史；复制到另一目录或设备的数据库不会因此被误判为同一份正在使用的主存储。历史日志仍需要的 Blob 不会因清空或孤立附件清理而失效。

## 已完成的验证

- 后端共 42 个不同用例通过：test_api_sync、test_sync_integrity、test_hosted_sync、test_desktop_lifecycle、test_api_remediation，以及 AppApiTests 的笔记、附件和备份往返用例。
- 前端正式 runner 的 11 个测试文件通过：backendAppStore、serverSyncE2E、syncCoordinator、syncIntegrity、syncProtocolIntegrity、syncRemediation、syncAttachmentRuntime、conflictResolution、remoteDeleteConflictFlow、serverDeploymentSync、syncRuntimeRecovery。
- 测试 TypeScript 编译、应用 Vue / TypeScript 检查和 git diff --check 通过。
- Windows 桌面后端真实进程完成启动、写入、退出、重启后数据保留验证。
- 原 backend/data/app.db 仍为 294 条正常笔记、1 条回收站笔记、3 个附件；SQLite 检查通过，三个附件的字节、大小和哈希仍匹配。没有对原数据执行升级迁移。

主要复现命令：

```powershell
$env:BEMO_TEST_KEEP_DATA='1'
$env:BEMO_PYTHON='D:\Tools\Python310\python.exe'
Set-Location E:\Code\Bemo\backend
& D:\Tools\Python310\python.exe -m unittest tests.test_api_sync tests.test_sync_integrity tests.test_hosted_sync tests.test_desktop_lifecycle tests.test_api_app.AppApiTests.test_app_routes_round_trip_notes_attachments_and_backup -v
& D:\Tools\Python310\python.exe run_tests.py --pattern test_api_remediation.py
Set-Location E:\Code\Bemo\frontend
& D:\Tools\NodeJS\node.exe node_modules\typescript\bin\tsc -p tsconfig.tests.json
& D:\Tools\NodeJS\node.exe .test-dist/tests/runAll.js backendAppStore.spec serverSyncE2E.spec syncCoordinator.spec syncIntegrity.spec syncProtocolIntegrity.spec syncRemediation.spec syncAttachmentRuntime.spec conflictResolution.spec remoteDeleteConflictFlow.spec serverDeploymentSync.spec syncRuntimeRecovery.spec
& D:\Tools\NodeJS\node.exe node_modules\vue-tsc\bin\vue-tsc.js --noEmit -p tsconfig.app.json
```

## 使用边界

服务器和客户端源码应一起更新。桌面保留本机主存储，在应用运行时自动同步，完全退出后关闭本机后端。网页版使用服务器主存储，浏览器缓存仍不是完整的离线写入数据库。Mobile 的本地主存储与界面边界保持原设计。

本次使用隔离目录，设置 BEMO_TEST_KEEP_DATA=1 保留测试数据。没有打包、部署到实际服务器、删除工作区文件，也没有验收 Android 或安装包 GUI。上述 Windows 进程与共享逻辑验证不代替这些环境的验收。
