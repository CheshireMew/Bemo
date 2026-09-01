# 审查修复与验收记录

本轮已经修复数据、同步、恢复、重置、缓存、渲染、错误处理和键盘交互的已知源码问题，并补充相应回归。原始 16 项中，12 项已有当前范围的有效证据，4 项仍有运行环境或验收边界，不能宣布“全部问题已经关闭”。

按 Project Steward 保留原编号、原完成条件和失败记录，不用编译成功代替实际运行验收。结构化记录见 [原条件与证据账本](audit-closure-2026-08-31.json)。其中 `all-findings-resolved` 是交给校验器审查的候选结论，不是本报告的完成声明；校验结果为 `blocked`。

## 范围和身份

项目为 `E:\Code\Bemo`，修复基线为 `main` 的 `83ab007974982b274d92a3b34f56f27a08a7f55c`。原始审查报告来自本任务，全文内容摘要为 `sha256:500cb04d558784370447fa7a73487203d2de32bdae5e218098663b01b7bc796f`。没有查询实时远端，也没有提交或推送。

本轮只验收 Windows 和与改动直接相关的自动化行为，没有扩大到跨平台矩阵、性能目标或真实 WebDAV 账号。Web / Desktop 继续使用 backend 主存储，Mobile 继续使用本地主存储，没有合并两套外壳或强迫它们使用同一存储实现。

## 原发现的逐项结果

| 原编号 | 当前结论 | 修复与证据 |
| --- | --- | --- |
| BEMO-AUD-001 | 已修复并回归 | 同步初始化、拉取、冲突、补发走当前主存储；backend 笔记与出站记录同事务，入站有持久化回执。独立 app/sync 进程验证增改删、刷新读取、游标丢失重放及冲突副本；队列失败会回滚主存储写入。 |
| BEMO-AUD-002 | 已修复并回归 | 导入使用后端返回的正式 ID；验证导入、同步、重新读取、再次编辑仍对应同一条笔记。 |
| BEMO-AUD-003 | 已修复并回归 | `/trash` 路由优先于动态 ID，批量清空生成准确的永久删除事件；正式 API、远端推送和重放均有测试。 |
| BEMO-AUD-004 | 已修复并回归 | 完整验证输入后替换；backend 使用数据库事务，本地使用跨存储 IndexedDB 事务。附件失败、写入中断、ZIP 缺清单或缺附件不会留下半份主数据，Markdown 归档共用此边界。 |
| BEMO-AUD-005 | 已修复并回归 | 重置设备不清 backend；清空主存储另有明确范围提示。保留 backend 笔记的回归通过。 |
| BEMO-AUD-006 | 源码已修复，正式入口未完全验收 | 新 Python 入口提供就绪状态、动态回环地址、固定数据目录和父子进程退出。Python 真进程重启保留与退出测试、Rust 检查和调试编译通过；隔离数据下的 Windows 调试窗口能加载，但窗口内保存、重启和退出链路在用户要求停止电脑操控后未继续，正式发布产物也未验收。 |
| BEMO-AUD-007 | 配置已修复，Docker 未验收 | 同源 Nginx 代理连接 API/附件，数据卷持久化，健康检查约束启动。配置约束测试通过；机器没有 Docker，真实浏览器操作和容器重启保留未运行。 |
| BEMO-AUD-008 | 已修复并回归 | 页面导航网络优先，离线才用最后成功外壳；哈希资源缓存，API/附件不进静态缓存。执行实际 SW 脚本验证旧缓存升级与离线回退，不声称已完成生产发版。 |
| BEMO-AUD-009 | 已修复并回归 | 主数据、缓存和错误分开返回；界面保留内容，显示过期/错误及重试。测试覆盖 503 缓存回退和恢复后的新数据、错误清除；界面接线已检查。 |
| BEMO-AUD-010 | 已修复并回归 | 共享 Markdown 渲染统一过滤危险属性和链接，保留支持的 Markdown 及附件 URL；不扩展为桌面账号系统。 |
| BEMO-AUD-011 | 部署边界已修复，网络实测未完成 | Docker 不公开 backend 端口，app 与附件由 Basic 代理鉴权，sync 由 Bearer 鉴权；未配置令牌时拒绝访问的 API 测试通过。真实部署的未授权读取/清空仍待 Docker 验证。 |
| BEMO-AUD-012 | 已修复并回归 | IndexedDB 调用等待事务提交，错误和中止均拒绝并关闭连接；测试覆盖请求成功后事务仍中止的情况。 |
| BEMO-AUD-013 | 已完成并人工复核 | 用户明确确认仅取消 Git 跟踪、保留本地文件。`venv/`、`backend/venv/`、`frontend/.npm-cache/`、`backend/build/`、`backend/dist/` 共 6,127 个索引条目已取消跟踪；五个目录仍存在、均命中忽略规则，跟踪计数均为 0。 |
| BEMO-AUD-014 | 已补充准确边界测试 | 新增 backend 主存储集成、恢复失败、桌面后端进程、SW 和焦点测试；Windows CI 补齐 Python 前置依赖及生命周期入口；Docker 真实验证为显式脚本和手动工作流。未声称远端 CI 已执行。 |
| BEMO-AUD-015 | 代码与 DOM 测试完成，Windows 窗口待验收 | 共享焦点进入、Tab 环绕、Escape、背景隔离及关闭后返回；七个覆盖层接入，键盘笔记操作可见，搜索有独立名称。jsdom 通过；真实调试窗口能加载，但用户要求停止电脑操控后没有继续完整键盘和焦点返回验收。 |
| BEMO-AUD-016 | 已修正并对照检查 | 文档明确当前主存储、离线限制、启动和数据管理范围；旧同步设计标注历史身份，修正链接和桌面元数据。新操作说明见 [运行与部署](operations.md)。 |

## 本机验证

前端正式 runner 先收集、后执行了 17 个测试文件：`archiveValidation`、`attachmentUrls`、`backendAppStore`、`conflictResolution`、`displayBoundary`、`indexedDbTransactions`、`localAttachments`、`localImportExport`、`markdownArchive`、`modalFocus`、`pendingQueueSummary`、`remoteDeleteConflictFlow`、`serverSyncE2E`、`syncAttachmentRuntime`、`syncCoordinator`、`syncIntegrity`、`webDeployment`，全部通过。这里是 17 个 `.spec.js` 文件，不是 17 个断言或单独用例；未运行整个前端测试集合。

最后两项补测还发现并修复了两个问题：从回收站按远端冲突重建时，同一 ID 留在两个列表而无法提交；应用同步请求强制跨域携带凭据，与桌面回环 CORS 配置不一致。对应测试先失败，修复后重新收集并运行 `backendAppStore.spec` 和 `displayBoundary.spec`，全部通过。

后端正式 runner 共收集并执行 20 个用例：`test_api_remediation.py` 7 个、`test_desktop_lifecycle.py` 1 个、`test_api_app.py` 2 个、`test_api_sync.py` 10 个，全部通过。测试使用独立临时数据库，没有打开或改写用户的笔记数据库。

Vue 类型检查通过。`cargo check --locked` 和 Windows `cargo build --locked` 调试编译通过；后者使用独立测试窗口配置，没有启动该 GUI，没有生成安装包。链接器输出的一条“创建库和对象”提示不影响成功退出。四个 PowerShell 脚本 AST、Compose 和两个工作流 YAML 解析、Git 空白检查通过。

复现命令从对应目录执行，Python 使用 `D:\Tools\Python310\python.exe`，Node 使用 `D:\Tools\NodeJS`。测试目录保留开关为 `BEMO_TEST_KEEP_DATA=1`。

```powershell
# frontend：先收集，再运行相同 selector
npm run test:unit -- --list backendAppStore.spec displayBoundary.spec
npm run test:unit -- backendAppStore.spec displayBoundary.spec
node node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.app.json

# backend：同样先确认实际用例身份
python run_tests.py --pattern test_api_remediation.py --list
python run_tests.py --pattern test_api_remediation.py
python run_tests.py --pattern test_desktop_lifecycle.py
python run_tests.py --pattern test_api_app.py
python run_tests.py --pattern test_api_sync.py
```

## 保留的失败与未执行项

修复前的数据、渲染和事务回归、ZIP 缺项测试、冲突重建与凭据模式测试都有失败记录，最终同范围测试已通过。修复期间也纠正了测试夹具、TypeScript 类型、HTTP 尾斜杠和一次 SW 语法问题，没有删除失败断言或跳过用例。首次离线 Rust 检查缺依赖，改用 D 盘 Cargo 缓存获取后成功。一次关闭 CRLF 归一化的 Git 检查产生历史行尾误报，恢复适当检查配置后通过；没有为此批量重写文件。

用户后来确认了真实窗口验收，隔离数据目录下的 Windows 调试窗口成功加载；在执行完整键盘、保存与重启步骤前，用户要求停止电脑操控。操作随即停止，调试实例和 Vite 服务均已退出，没有改用其他方式绕过。Windows GUI 完整链路和正式发行入口仍未验证。Docker 不可用，没有安装 Docker、构建镜像或执行手动工作流。没有运行 PyInstaller、Tauri release、安装程序、真实 WebDAV、远端 CI 或 Release。

测试输出及依赖仍保留在原来的本地目录。经用户明确确认，`venv/`、`backend/venv/`、`frontend/.npm-cache/`、`backend/build/`、`backend/dist/` 已仅取消 Git 跟踪，共形成 6,127 项索引删除；没有删除、归档或改写历史，本地目录全部保留。旧 sidecar 不在这份清理清单内，也不再由新发布入口直接消费。

原审查的 V01 性能、V02 完整窗口尺寸/DPI、V03 外部能力、V04 旧发行物组成与许可证仍是原有证据缺口，不自动扩张成本轮新增修复目标。剩余 4 项分别受用户停止窗口操控、禁止未经要求打包以及本机没有 Docker 限制；本轮不再执行这些动作，也不会把源码检查冒充运行验收。
