# Bemo 架构问题修复（2026-10-31）

范围为 [架构审查](architecture-audit-2026-10-31.md) 中的 BEMO-ARCH-01～09，9 项均已在本地完成修复与验证。修复保留 Web/Desktop 后端主存储、Mobile 本地主存储及独立界面外壳，没有新增功能平台，也没有打包、提交、推送或部署。

## 逐项实现与验证

| 问题 | 最终行为 | 主要回归证据 |
| --- | --- | --- |
| ARCH-01 连续同步操作绕过冲突 | 一条操作冲突后，服务器拒绝同批同笔记的后续依赖；客户端先保存全部拒绝结果再确认出队，中断后也不会单独重发被拒绝的后半段。其他笔记和已确认操作的幂等重试仍可继续。 | `test_architecture_integrity.py` 的批次/独立服务器用例；`architectureIntegrity.spec.ts` 的真实双后端、第二次确认出队失败及重试用例。 |
| ARCH-02 恢复覆盖本地修改 | 活动笔记和回收站笔记的远端恢复都遵守 `preserve_local` 与版本冲突规则，先保存本地副本，再应用远端状态；重放不产生额外副本。 | `architectureIntegrity.spec.ts` 的两种本地状态、收据重放与真实后端副本用例。 |
| ARCH-03 WebDAV 恢复与新写入互相破坏 | 恢复、修复元数据、普通写入和清理共用可续租写锁；取得租约后重新读取。批次和快照文件名含事务唯一身份，暂存文件条件创建，待处理记录按事务身份和强 ETag 删除，清理前持续检查租约。恢复不会删除当前元数据仍引用的文件。 | `webdavArchitectureIntegrity.spec.ts` 的中断写入、恢复过程中插入第二写者、重试拉取、旧事务清理拒绝与文件名隔离；`webdavLocalServer.spec.ts` 的本机 HTTP 服务、租约失效及附件保留用例。 |
| ARCH-04 冲突副本丢失原图 | 后端原附件别名不可被不同字节覆盖；入站同步遇到同名不同内容时按哈希另存，并重写入站正文。IndexedDB 在同一事务中保存安全别名及按哈希索引的字节，检查并发变化。Hosted 接口返回和保存相同的正式内容。 | `architectureIntegrity.spec.ts` 的本地及真实后端正文/字节双保留；`test_architecture_integrity.py` 的上传拒绝和 hosted 正式记录一致性；`syncProtocolIntegrity.spec.ts` 的旧索引与字节复用。 |
| ARCH-05 旧回收站页面误删恢复后的笔记 | 永久删除在写事务内检查笔记仍在回收站，以及用户所见的协议版本、编辑凭据。恢复后再次移入回收站也不会让旧删除请求重新有效；本地永久删除同样检查当前记录。 | `test_architecture_integrity.py::test_purge_requires_current_trash_state_and_its_edit_version`；现有回收站事务及编辑回归。 |
| ARCH-06 备份复用旧版本号 | 每次主存储写入生成独立的 `edit_version`。保存、置顶和永久删除同时校验协议版本与编辑凭据；备份恢复生成新凭据，即使同步版本数值相同，旧编辑器也会被拒绝。该凭据不作为同步协议字段发送。 | `test_architecture_integrity.py` 的备份与远端版本复用用例；`architectureIntegrity.spec.ts` 的本地备份、旧编辑拒绝和重新审阅后保存。 |
| ARCH-07 清理与保存交错破坏附件 | 上传、引用提交和孤立附件元数据清理共用 SQLite 写事务。尚未提交的上传有持久化的 24 小时保留期；笔记提交时解除上传保留，正常引用与待同步记录继续保护附件。 | `test_architecture_integrity.py` 的未提交上传保护、提交解除保留和扫描期间插入上传/保存的并发用例；现有备份一致快照与历史附件用例。 |
| ARCH-08 清空后自动恢复旧笔记 | 清空与备份替换会把旧待发修改替换为最终数据意图，保留目标基线与游标，持久记录待确认删除。首次目标、旧未绑定队列和已确认永久删除后的明确备份恢复都有对应处理。工作区代次阻止其他窗口的旧快照跨替换自动重试；应用远端批次时再次检查删除标记与正式游标。 | `architectureIntegrity.spec.ts` 的两种主存储、真实独立服务器、连续同步、游标重放、备份恢复、未发送修改替换和旧窗口快照；`test_architecture_integrity.py` 的旧队列、空工作区代次及特殊字符目标键。 |
| ARCH-09 同名笔记归档互相覆盖 | 各存储都按 `note_id` 标识笔记，IndexedDB 文件名索引迁移为非唯一。归档按 ID 生成独立目录，保留可读文件名与原始 frontmatter，导出前核对实际文件数量。目录编码也能区分 Windows 上大小写不同的 ID。冲突处理优先按副本 ID 定位，旧的同名歧义会停止处理。 | `architectureIntegrity.spec.ts` 的 v11→v12 迁移、同名、大小写不同 ID、中文及本地往返；真实后端同名笔记导出；`markdownArchive.spec.ts`。 |

## 架构与兼容性

同步版本与主存储编辑凭据承担不同职责。`revision` 可以采用已连接同步目标确认的版本；`edit_version` 只用于当前主存储的并发写入，不能从备份或另一个目标重新获得有效性。后端数据库会自动为已有笔记补齐此字段；前端读取笔记、冻结编辑会话和提交请求均已接入。更新 Web 部署时需要同时更新前后端，并刷新旧网页会话；旧的只发送 `base_revision` 的写入请求会被拒绝。

清空工作区是产品数据操作，重置当前设备缓存仍是独立操作。前者保留发送删除所需的同步依据，后者继续保留后端主数据。明确恢复备份可以恢复已同步的永久删除，但普通旧设备重放和旧 `note.create` 仍不能让永久删除的数据复活。远端并发修改继续按冲突处理。

WebDAV 现有快照和批次仍可读取，新写入采用唯一文件名；归档版本与解析入口不变，旧目录结构仍可导入。IndexedDB v12 的迁移保留已有记录，只修改文件名索引的唯一性要求。备份不会把先前的编辑凭据带回主存储。

## 验证记录

最终检查均通过，结果来自实际执行输出：

- 后端：`python backend/run_tests.py`，57 项。
- 前端：`tsc -p tsconfig.tests.json` 与 `node .test-dist/tests/runAll.js`，34 组 spec。
- Vue：`vue-tsc --noEmit -p tsconfig.app.json --incremental false`。
- 工作区：`git diff --check`。

补审后还定向复跑了 5 组 WebDAV / 协调器回归，均通过，包含两个元数据提交步骤之间丢失租约、旧持有者停止提交、新持有者不被释放，以及随后恢复与幂等重试。新增的本地过期回收站请求、备份后重用附件别名、清空时发生远端冲突，也在 `architectureIntegrity.spec.ts` 中通过。

日志保留在 `D:\Tools\repo-audits\bemo-repair-20261031\`。测试后端均使用独立测试数据；测试数据保留，未清理原有产品数据。验证包括 Windows 上真实 Python 后端、双服务同步、本机 HTTP WebDAV 和内存 IndexedDB/WebDAV 的可控故障顺序。没有验收 Android 实机、远端 WebDAV 账户、Docker 或安装包。
