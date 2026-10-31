# Bemo 前后端架构审查（2026-10-31）

后续修复状态：BEMO-ARCH-01～09 已在本地工作区完成修复和回归验证，详见 [逐项修复记录](architecture-repair-2026-10-31.md)。下文保留修复前的审查结论与原始复现。

审查结论：在当前工作区确认 **9 项 P1 问题**，均能影响数据保存、同步冲突保护或备份恢复。未确认需要列为 P0 的问题。本次只记录问题与修复方向，没有修改业务代码。

审查基线为 `main`，HEAD `39ad08a`，包含审查开始前已有的未提交修复。没有把上一轮修复报告当作当前行为的证明。平台验证限于 Windows；未进行 Android、Docker、安装包或远端 WebDAV 账户验收。

产品边界仍按 `CURRENT_ARCHITECTURE.md`：Web/Desktop 的主存储在后端，Mobile 的主存储在本地；前端负责产品语义、同步流程和导入导出，后端负责 Web/Desktop 数据存储与同步服务。这种分工本身不是问题，不建议把不同运行时强行合并成一种存储或一套界面。

## 已确认的问题

### BEMO-ARCH-01 · P1 · 同一批同步操作发生冲突后，后续依赖操作仍可覆盖远端

位置：[sync_service.py](E:/Code/Bemo/backend/services/sync_service.py:39)，对照 [webdavChangeValidation.ts](E:/Code/Bemo/frontend/src/domain/sync/webdav/webdavChangeValidation.ts:12)。

后端逐条处理推送，遇到冲突只跳过当前操作，没有阻止同一笔记的后续操作。离线设备连续编辑两次，会排出基于版本 1 和版本 2 的两个操作。如果另一设备先将远端更新到版本 2，第一个离线操作会冲突，但第二个操作恰好满足 `base_revision = 2`，于是覆盖另一设备的内容。数值相等不能证明两个版本具有同一来源。

复现：远端先保存 `another device important edit`，随后推送 `offline-first(base=1)`、`offline-second(base=2)`。接口返回第一条冲突、第二条接受，最终远端内容变成 `offline edit two`。WebDAV 的验证器已经按笔记阻止后续依赖操作，两条传输路径的冲突语义不一致。

修复方向：同一笔记的一条操作被拒绝后，在这批操作中阻止其后续依赖操作，保留可供用户处理的本地修改；用同一组协议用例约束服务器与 WebDAV。不能仅依靠版本号碰巧相等来继续执行。

证据：`batch-conflict-reproduction.json`。

### BEMO-ARCH-02 · P1 · 远端恢复笔记会直接覆盖需要保留的本地修改

位置：[localSyncApply.ts](E:/Code/Bemo/frontend/src/domain/sync/localSyncApply.ts:355)，调用路径 [syncReplicaAdapter.ts](E:/Code/Bemo/frontend/src/domain/appStore/syncReplicaAdapter.ts:15)。

协调器能够识别本地待同步或偏离基线的内容，并设置 `preserve_local`。但是 `note.restore` 分支没有处理这个标记：当本地已有活动笔记时直接覆盖；当本地在回收站且远端版本更高时，也会恢复后覆盖，没有像 `note.update` 那样保存冲突副本。

复现：本地版本 3 包含 `unsynced local important body`，接收 `note.restore(base=2, revision=4, preserve_local=true)`。在真实 Web/Desktop 后端存储路径上，结果为 `conflicts = 0`，本地内容被替换成 `remote restored old body`，未留下本地副本。共享算法的内存复现结果相同。

修复方向：恢复也是写入正文和状态的命令，必须遵守与更新相同的冲突保留约束。对活动、回收站、已永久删除状态分别定义合法转换，不能让恢复成为绕过冲突检查的入口。

证据：`backend-runtime-conflict-reproductions.json`、`frontend-reproductions.json`。

### BEMO-ARCH-03 · P1 · WebDAV 自动恢复没有取得写锁，可能删除新写入的有效文件

位置：[webdavRemoteState.ts](E:/Code/Bemo/frontend/src/domain/sync/webdav/webdavRemoteState.ts:359)，尤其是第 366、393–395 行；文件命名见 [webdavRemoteSnapshot.ts](E:/Code/Bemo/frontend/src/domain/sync/webdav/webdavRemoteSnapshot.ts:40) 和 [webdavRemoteSnapshot.ts](E:/Code/Bemo/frontend/src/domain/sync/webdav/webdavRemoteSnapshot.ts:147)。

正常写入和附件清理使用租约，但中断恢复只是读取一次“当前是否有人持锁”，随后直接提交、清理文件及删除 `pending-write.json`。检查之后，另一个设备仍可取得有效租约并开始写入。批次、快照文件名又只由游标生成，新旧操作可能使用相同路径，旧恢复流程因此可能删除新写入的文件。删除待处理记录时也没有校验事务身份。

复现使用支持强 ETag 和条件请求的内存 WebDAV 服务：先留下写入 A 的不完整快照；恢复 A 检查到无锁之后，写入 B 取得有效租约并写完同名批次、快照，再暂停于提交前。恢复 A 随后删除 B 的批次、快照和待处理记录。B 继续提交后返回接受，`verifyWebDavPushResult` 也通过，但下一次拉取报 `同步快照缺失：snapshot_00000001.json`。

修复方向：所有会修改远端状态的恢复、修复和清理流程必须处于同一租约协议内；取得租约后重新读取恢复依据。暂存文件须使用事务唯一身份，删除 pending 记录必须校验对应事务或 ETag，避免旧操作触碰新事务文件。

证据：`webdav-recovery-race.json`、可重跑脚本 `webdav-recovery-repro.mjs`。此次仅操作内存模拟服务，没有删除任何真实远端文件。

### BEMO-ARCH-04 · P1 · 笔记冲突副本没有保住原附件

位置：[syncCoordinator.ts](E:/Code/Bemo/frontend/src/domain/sync/syncCoordinator.ts:227)、[syncAttachmentRuntime.ts](E:/Code/Bemo/frontend/src/domain/sync/syncAttachmentRuntime.ts:82)、[app_store_repository.py](E:/Code/Bemo/backend/services/app_store_repository.py:403)。

入站同步在判断笔记冲突之前，先把远端附件按文件名写入主存储。同名附件会直接修改 `filename → blob_hash` 映射。之后即使保存了本地正文的冲突副本，副本里的 `/images/同名文件` 也已经指向远端数据；附件字节本身并没有随冲突副本保留。恢复过不同附件版本、同步不同来源的数据或发生文件名碰撞时会触发。

复现：本地正文引用 `conflict-shared.png`，内容为 `local important image`。接收带同名不同哈希附件的冲突更新后，真实后端路径确实创建了本地正文副本，报告 1 项冲突，但该副本引用的图片已经是 `remote image bytes`。内存本地存储路径也有相同问题。

修复方向：先按内容哈希暂存入站数据，不覆盖现有文件名映射；在应用笔记及处理冲突时，原子提交附件引用。同名不同内容需要稳定区分，并重写各自正文引用，使本地副本始终保留原附件。

证据：`backend-runtime-conflict-reproductions.json`、`frontend-reproductions.json`。

### BEMO-ARCH-05 · P1 · 回收站永久删除接口可以删除已经恢复的活动笔记

位置：[note_store_service.py](E:/Code/Bemo/backend/services/note_store_service.py:131)，接口见 [notes_app.py](E:/Code/Bemo/backend/api/notes_app.py:91)。

`purge_note` 只检查笔记存在，没有检查它是否仍在回收站，也不携带用户看到的版本。一个窗口显示旧回收站列表，另一个窗口或设备已经恢复笔记时，旧窗口的永久删除仍然成功，直接删除活动笔记，并传播永久删除状态。

复现：新建 → 移入回收站 → 恢复 → 调用旧的 `/api/app/notes/trash/{id}` 删除请求。响应为 200，活动笔记列表变为空。

修复方向：永久删除必须在同一写事务内验证“仍在回收站”和预期版本；过期的页面操作应返回冲突。

证据：`backend-reproductions.json` 中 `stale_trash_purge`。

### BEMO-ARCH-06 · P1 · 恢复备份会复用旧版本号，旧编辑器因此可以覆盖恢复结果

位置：[app_storage_service.py](E:/Code/Bemo/backend/services/app_storage_service.py:234)，编辑检查见 [note_store_service.py](E:/Code/Bemo/backend/services/note_store_service.py:144)。

恢复备份直接采用备份中的 `revision`。同一笔记 ID 的内容可能已经替换，但版本号与仍打开的编辑器相同。普通保存只比较这个数字，因此无法识别恢复造成的数据替换。后端 hosted 同步日志维持单调版本的机制没有同步解决应用编辑版本的复用。

复现：编辑器保留版本 1；恢复同 ID、同版本 1、不同正文的备份；旧编辑器再按 `base_revision = 1` 提交。恢复和过期保存均返回 200，最终存储是旧编辑器内容。

修复方向：备份中的版本用于历史说明，不能直接成为新主存储的并发凭据。恢复应建立新的存储代次或新的不可复用编辑版本，保存时同时验证身份和版本，统一处理恢复、导入替换及同步确认引起的版本变化。

证据：`backend-reproductions.json` 中 `revision_reuse_after_restore`。

### BEMO-ARCH-07 · P1 · 清理孤立附件与笔记写入之间没有一致性保护

位置：[app_storage_service.py](E:/Code/Bemo/backend/services/app_storage_service.py:134)。

清理先读取引用集合，再逐个删除附件记录和文件，没有在删除时重新确认引用，也不与笔记写入共享事务。扫描之后新增的合法引用可能被忽略。更一般地，附件上传与笔记提交是分开的请求，上传到提交之间也缺少保护期或持有记录。

复现固定了一个合法并发顺序：扫描得到未引用的 `race.png` → 另一个请求成功保存引用该图的笔记 → 清理继续。结果笔记仍在，图片请求变成 404。复现拦截了实际 blob 文件删除，仅通过真实元数据删除即可证明损坏。

修复方向：引用判断与元数据删除须在同一串行化事务中完成，并覆盖所有仍需要附件的所有者；上传待提交、同步暂存、草稿和冲突副本需有明确的持有状态。物理回收应在确认不存在新引用后执行，不能依靠一次过期扫描结果。

证据：`backend-reproductions.json` 中 `cleanup_new_reference`。

### BEMO-ARCH-08 · P1 · 清空工作区没有为外部同步目标保留删除语义，数据会立即回来

位置：[app_store_repository.py](E:/Code/Bemo/backend/services/app_store_repository.py:424)、[app_store_repository.py](E:/Code/Bemo/backend/services/app_store_repository.py:437)、[importExportCommands.ts](E:/Code/Bemo/frontend/src/domain/importExport/importExportCommands.ts:48)、[syncCoordinator.ts](E:/Code/Bemo/frontend/src/domain/sync/syncCoordinator.ts:52)。

清空操作同时清掉主数据、外部同步 outbox、基线和进度，只向当前后端自己的 hosted 协议日志发布删除。随后前端立即恢复外部同步。由于外部目标未收到删除，且本地用于表达删除的状态也没有了，协调器会把远端笔记当作缺失数据重新拉回。备份替换同样清理这批同步状态，对外部目标缺少完整的替换语义。

复现使用两个真实 Python 服务：一个 app 模式作为主存储，一个独立 server 模式作为外部同步目标。新建并同步 1 篇笔记后，调用产品实际使用的 `clearCurrentWorkspaceData()`，再等待自动同步完成。操作报告成功，原 ID、原正文的笔记却重新出现在主存储中。直接连接当前后端自己的 hosted 地址走特殊路径，不属于这个复现场景。

修复方向：区分“清空产品工作区”和“重建本机缓存”，为前者定义清晰且持久的外部同步删除行为，在确认远端接受前保留删除记录和必要基线。恢复备份也需要统一定义与已连接目标的关系，不能先丢弃所有同步依据后自动续传。

证据：`clear-sync-reproduction.json`。

### BEMO-ARCH-09 · P1 · 笔记文件名唯一性约定不一致，会导出丢失笔记的 Markdown 归档

位置：[app_store_repository.py](E:/Code/Bemo/backend/services/app_store_repository.py:28)、[indexedDb.ts](E:/Code/Bemo/frontend/src/domain/storage/indexedDb.ts:30)、[markdownArchive.ts](E:/Code/Bemo/frontend/src/domain/importExport/markdownArchive.ts:34)、[markdownArchiveFormat.ts](E:/Code/Bemo/frontend/src/domain/importExport/markdownArchiveFormat.ts:138)。

后端以 note_id 为主键，允许不同笔记使用相同 filename；本地 IndexedDB 却要求 filename 唯一；Markdown 归档又直接拿 filename 当 ZIP 路径。同名笔记可由不同设备的独立命名、合法同步输入或恢复数据产生。导出时 JSZip 会让后一篇覆盖前一篇，清单仍填写原笔记数量，导出过程没有报错。

复现：通过 hosted 同步接口推送两个不同 ID、同文件名的笔记，两条都接受。主存储总计 3 篇笔记，正常导出后清单声明 3 篇，ZIP 中却只有 2 个 Markdown 文件；同名位置只剩笔记 B。再使用产品解析函数导入时，报“Markdown 归档文件数与清单不一致”。导出的归档已经缺了一篇，后续拒绝导入不能恢复缺失内容。

修复方向：明确 note_id 与 filename 各自的职责，并在所有存储与格式中执行相同约束。归档路径应使用稳定唯一身份或可逆的去重映射，导出完成前核对实际文件集合。不要只靠补一个前端 filename 唯一索引阻止合法笔记进入。

证据：`markdown-collision-reproduction.json`。

## 架构层面的修复顺序

这些问题集中在共享语义没有贯穿所有入口，而不是目录应该怎样重新拆分。

1. 先修同步保护：ARCH-01、02、03。服务器推送、WebDAV 写入和远端状态应用须遵守相同冲突规则，恢复流程也要遵守写入协议。
2. 再固定身份和引用：ARCH-04、05、06、09。明确笔记身份、并发版本、附件身份及展示文件名，避免把文件名或可复用版本号当成唯一凭据。
3. 最后统一数据管理命令：ARCH-07、08。保存、清理、清空和备份替换需要共享完整的数据所有权与同步规则，不能分别清理几张表后交给自动同步猜测用户意图。

实现可以继续保留 Python 后端存储、IndexedDB 本地存储以及 WebDAV 协议实现；应共享可执行的契约和场景验收，避免三处各自实现略有不同的产品规则。

## 验证与证据

所有测试数据和复现结果保留在 [隔离证据目录](D:/Tools/repo-audits/bemo-architecture-20261031-7f0afc09)。没有操作原有产品数据，也没有删除真实文件。临时启动的两个后端仅使用此目录下的独立数据。

本轮已完成：

- 后端真实 FastAPI 路由复现：ARCH-01、05、06、07。
- 两个真实后端与前端同步协调器联调：ARCH-08。
- 前端算法与真实后端主存储联调：ARCH-02、04。
- 支持强 ETag/条件请求的内存 WebDAV 并发复现：ARCH-03。未连接第三方账户。
- 真实后端输入与产品 Markdown 导出/解析函数联调：ARCH-09。生成的 ZIP 仅用于在内存中验证现有导出功能，没有打包应用。
- `node node_modules/typescript/bin/tsc -p tsconfig.tests.json`：通过。
- `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.app.json --incremental false`：通过。
- 现有 8 组相关 spec：`archiveValidation`、`auditRemediation`、`conflictResolution`、`markdownArchive`、`syncAttachmentRuntime`、`syncIntegrity`、`syncProtocolIntegrity`、`webdavProtocol`，全部通过。

现有检查通过只证明已有覆盖没有失败；本报告的复现展示了覆盖之外的实际缺陷。本次没有执行全量后端测试、没有做原生窗口交互验收，也没有声称已验证未运行的环境。
