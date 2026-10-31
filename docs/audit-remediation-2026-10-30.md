# 2026-10-30 审查修复

本次仅处理已确认的 BEMO-01～09，基线为 `39ad08a087704cf8c32978c9259e172e1b9c95ef`。
本地修复和 Windows 定向验证后停止，不打包、提交、推送、部署或清理既有文件。

| 发现 | 原完成条件 | 正式边界与验证 |
| --- | --- | --- |
| BEMO-01 过期编辑覆盖 | 01-C1 固定并传递编辑基准版本；01-C2 在写事务中拒绝过期保存，保留编辑内容 | 编辑会话 → notes adapter → app API / IndexedDB → 重读；过期与缺失版本、正常重试 |
| BEMO-02 备份一致性 | 02-C1 正文、回收站和附件同一快照；02-C2 并发恢复/删除时不漏记不重复、能重新导入 | 后端读事务、本地 IndexedDB 读事务 → 正式备份/导入 |
| BEMO-03 WebDAV 附件清理 | 03-C1 仍可重放的历史引用保持可读；03-C2 清理与上传、提交有并发保护 | WebDAV transport → 写租约、保留批次和快照 → 落后设备拉取 |
| BEMO-04 CSV 多行正文 | 04-C1 完整记录解析换行/逗号/引号；04-C2 正式往返保持正文和数量 | 导出 CSV → File → 正式导入 → 主存储 |
| BEMO-05 关闭草稿 | 05-C1 正常关闭/刷新前保存待写草稿；05-C2 重开恢复末次输入 | 编辑器 → localStorage → 页面/桌面关闭与重开 |
| BEMO-06 本地回收站 | 06-C1 笔记移动和引用更新同一事务；06-C2 中途失败和重开后唯一归属、备份有效 | localTrashMutations → IndexedDB → 查询/备份 |
| BEMO-07 CI 漏收集 | 07-C1 默认收集 hosted/integrity 套件；07-C2 正式 runner 执行并传播失败 | run_tests.py → unittest 真实收集/执行 → CI |
| BEMO-08 桌面日志 | 08-C1 正式入口保留可定位的后端诊断；08-C2 启动失败提供准确原因 | Rust 启动器 → Python stdout/stderr → 持久日志/错误表面 |
| BEMO-09 文档漂移 | 09-C1 能力清单与架构/入口一致；09-C2 第三方说明与跟踪内容一致 | 既有项目文档与 Git 清单人工核对 |

修复前证据来自上一轮报告及本轮源码复核。关键回归先在旧实现运行，之后使用同一入口复查。
测试只使用 `backend/tests/.tmp` 内的独立数据目录，设置 `BEMO_TEST_KEEP_DATA=1` 保留证据。
前端测试编译物属于 `frontend/.test-dist`，日志和报告由本项目维护流程消费。未获清理授权时保留。
预计先运行定向后端和前端套件、类型检查，再检查 Windows 原生源；不运行完整仓库套件或发布矩阵。

## 最终逐项对账

| ID | 状态与修复 | 最后有效证据 | 验证边界 |
| --- | --- | --- | --- |
| BEMO-01 | 已解决。两种编辑外壳固定会话版本；PUT / PATCH 必传版本，后端与本地写事务校验 | `test_api_data_integrity`、`auditRemediation.spec`；真实 Windows 窗口中先打开编辑、另存新版本、刷新列表再保存旧输入，出现冲突提示，旧输入与新主存储均保留 | 实际 Web / Desktop 窗口与本地适配器；未声称 Mobile 设备验收 |
| BEMO-02 | 已解决。SQLite 与 IndexedDB 分别在单一读事务中取正文、回收站、引用和附件记录 | 后端并发恢复、附件替换、移入回收站后永久删除的回归；本地并发恢复回归，备份均可重新导入，旧附件字节保持一致 | 独立数据库与内存 IndexedDB；不替换现有用户数据 |
| BEMO-03 | 已解决。上传到提交、清理共用可续租写锁；保留最新快照原始引用及所有保留批次引用；失锁停止提交/删除 | `webdavLocalServer.spec` 的真实回环 HTTP 服务：上传等待时清理被拒绝、旧游标附件可读、滚动压缩后仅快照引用的附件可读、失锁不提交且不释放新持有者；`webdavProtocol.spec` 条件写入与无强 ETag 拒绝 | 本机 HTTP WebDAV 协议服务；未访问用户第三方 WebDAV 账户 |
| BEMO-04 | 已解决。CSV 按完整带引号记录解析，保留正文内 CRLF、空行、逗号、引号及首尾空格 | `auditRemediation.spec` 调用正式 CSV 导出、File 读取、正式导入与主存储重读，数量为 1、正文逐字一致；未闭合引号明确报错 | 文件内容与导入链；下载 UI 用测试捕获 |
| BEMO-05 | 已解决。刷新、页面隐藏、组件卸载与 Tauri 正常关闭前立即保存启用自动保存的新笔记草稿 | `auditRemediation.spec`；真实 Windows 窗口将延迟设为 60 秒，输入后正常关闭并重开，末次输入恢复；随后立即刷新同样恢复 | 正常生命周期；强杀、断电不在原完成条件内 |
| BEMO-06 | 已解决。移动笔记、目标文件名判定、清除旧引用与写新引用共用一个 IndexedDB 写事务 | `auditRemediation.spec` 在目标写入成功后主动中止事务；关闭连接后重读、唯一归属与引用范围保持一致，备份重导入成功；恢复正常执行后只有正文区一份 | fake-indexeddb 事务故障注入；未声称 Mobile 系统断电实测 |
| BEMO-07 | 已解决。默认发现所有维护中的后端套件，CI 直接消费同一入口，不再单独重复生命周期 | 最终 `run_tests.py --list` 唯一收集并实际执行 46 项，含 hosted 15 项、integrity 8 项、生命周期 1 项；修复前正式 runner 的失败为退出 1，成功为退出 0 | Windows 本地正式入口及 CI 配置；未运行远程 GitHub 作业 |
| BEMO-08 | 已解决。日志插件在启动后端前无条件初始化；另存后端 stdout/stderr，并在启动错误显示日志路径、系统原因与最近输出 | Windows Rust 测试 `backend::tests::startup_failure_retains_stderr_and_log_path`；实际桌面成功启动的 ready 输出落盘；无效 Python 路径启动时界面显示 os error 3 和真实 `backend.log` 路径 | 当前源码调试入口及 release 共用日志代码；遵照要求未重建安装包 |
| BEMO-09 | 已解决。更新能力清单、依赖说明、运行和验证文档 | 对照当前存储/API/主题源码、CI 与 `git ls-files backend/venv` 空结果；移除“90 天自动清理”和“当前跟踪虚拟环境”的错误描述 | 当前 Git 工作区；未作新增许可合规结论 |

## 正式验证结果

后端最终默认命令通过 46 项，耗时 12.387 秒。前端最终定向命令通过以下 9 个唯一 spec；重跑没有累计为新增覆盖。

```powershell
# backend，保留各测试的独立数据目录
$env:BEMO_TEST_KEEP_DATA = '1'
python -B run_tests.py --list
python -B run_tests.py

# frontend，先使用相同 selector 加 --list 确认收集身份
npm run test:unit -- auditRemediation.spec indexedDbTransactions.spec localImportExport.spec backendAppStore.spec serverDeploymentSync.spec syncRemediation.spec webdavProtocol.spec webdavLocalServer.spec uxState.spec
node node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.app.json

# frontend/src-tauri，源码测试，不是打包
cargo test --locked --offline --lib backend::tests::startup_failure_retains_stderr_and_log_path
```

本次实际 Python 为 `D:\Tools\Python310\python.exe`，Node 为 `D:\Tools\NodeJS\node.exe`。Rust 使用 `D:\Tools\Rust\cargo` 与 `D:\Tools\Rust\rustup`，没有下载依赖。Vue 类型检查与最终 `git diff --check` 均通过。后端提示已有 Starlette/httpx 弃用警告，本轮没有改动依赖。

真实桌面验收通过 `cargo run --locked --offline` 的源码入口进行，`BEMO_DATA_DIR` 和 `WEBVIEW2_USER_DATA_FOLDER` 均指定在 `backend/tests/.tmp/audit-native-*20261030`，通过 WebView2 的本机调试接口操作实际编辑器。关闭使用已核对路径的 Windows 进程 `CloseMainWindow()`，随后以同一测试配置重开验证。测试标记分别为 `native-close-final-input-20261030`、`native-refresh-final-input-20261030` 和 `audit-ui-stale-local-input`。日志实际写入 `%LOCALAPPDATA%\com.cheshire.bemo\logs\backend.log`。测试桌面和本次创建的 Vite 进程已停止，数据和测试产物保留。

## 过程中的失败与修正

| 事件 | 归类 | 处理结果 |
| --- | --- | --- |
| 修复前，备份在并发恢复后漏记，过期 PUT 返回 200 | 产品缺陷，预期红灯 | 同一正式回归在修复后通过；后续增加附件替换与并发删除覆盖 |
| 新编辑会话回归发现基准版本随同一笔记更新而变为 8 | 产品缺陷 | 改为分别监听打开状态和 note ID，最终回归及真实桌面冲突链通过 |
| 首次 WebDAV guard 参数落在错误的内部函数位置 | 实施中的类型错误 | 移到正式 push 边界；NodeNext 与 Vue 类型检查通过 |
| 新测试引入未带扩展名的设置导入，及旧 WebDAV 夹具未初始化 IndexedDB/锁响应 | 验证入口和夹具 | 使用项目支持的 `.js` 模块导入，补齐本地存储、强 ETag 与锁读写夹具；正式回归通过 |
| `npm exec --offline -- node` 误尝试解析 npm 的 node 包；首次 Rust 调用未设置既有 D 盘工具链变量 | 环境/调用错误 | 未安装软件；改用既有 Node 绝对路径和 D 盘 Rust 环境 |
| 诊断脚本以 `D:` 直接作 ESM URL、原生应用尚未就绪时连接调试端口、手写 API_BASE 请求空响应 | 验证脚本 | 改用 file URL，等待已存在的启动会话，调用正式后端客户端；实际桌面链通过 |
| CI 文件末尾多一个空行，diff 检查失败 | 格式 | 修正后 `git diff --check` 通过 |
| 首次结项账本缺少证据 ID 对应的验证事件，验证器拒绝 | 账本结构 | 补齐同一次真实验证的引用关系，没有改产品、完成条件或测试结论；重新验证退出 0 |
| 结束时原生进程已经退出，旧 PID 关闭检查找不到；主动停止 Vite 后包装进程退出 1 | 受控退出 | 原生会话退出 0；仅核对并停止本次创建的 Vite PID，无遗留测试窗口，无文件清理 |

原完成条件未改写。机器可读的逐条件证据为 [audit-closure-2026-10-30.json](audit-closure-2026-10-30.json)。验证器只检查账本结构与状态，实际结论同时依赖上表测试、源码和真实窗口证据。

最终账本验证为 `status=eligible`、`condition_coverage_verified=true`、`closure_complete=true`、`all_findings_resolved=true`。`all_checks_passed=false` 刻意保留，因为过程中的红灯与调用错误没有被抹掉；它不表示最后一轮仍有未修复的失败。

## 后续修改的预防点

编辑与跨存储移动的最早预防点是版本/事务边界，备份与同步清理的最早预防点是快照和历史引用边界。已有回归通过过期版本、并发写入、事务中止和真实生命周期产生确定信号；后续修改这些链路时使用相同入口验证。没有把本次机器端口、临时 PID、测试路径或一次性错误沉淀为产品默认，也没有修改外部 Skill 或个人记忆。

本轮没有执行发布、部署、安装包构建、文件删除或仓库提交。
