# 运行、部署与验证

Web / Desktop 的笔记和附件主存储在 backend，Mobile 在本地。后端失联时，Web / Desktop 只提供已有缓存阅读和错误提示，不保证离线写入。修改代码、通过类型检查、通过进程测试和通过安装包验收是不同结论。

## Windows 开发环境

先准备依赖，再启动；两个操作分开执行。以下命令从仓库根目录运行，缓存和 Python 环境默认放在 D 盘。

```powershell
.\backend\setup-runtime.ps1
$env:BEMO_PYTHON = 'D:\Tools\Bemo\venv\Scripts\python.exe'
cd frontend
npm ci --cache D:\Tools\npm-cache
cd ..
.\start-dev.ps1
```

已有 Python 环境也可以直接通过 `BEMO_PYTHON` 指定，但需要先安装 `backend/requirements.txt` 中的固定版本。不要使用仓库里历史提交的虚拟环境。开发脚本启动 app 后端，等待健康检查后启动网页，并在前端进程结束时关闭它所启动的后端进程树。`-FrontendOnly` 只用于界面调试，不代表笔记功能可用。

## 桌面源码与数据目录

在 `frontend` 运行 `npm run tauri -- dev`。设置 `BEMO_PYTHON` 后，Tauri 直接从源码启动 `backend/desktop_server.py`；它只监听 `127.0.0.1`，由系统分配端口，并在就绪后向界面提供地址。应用持有子进程句柄，关闭时先请求正常退出，超时再终止；父进程异常断开时，后端也会退出。

`BEMO_DATA_DIR` 可以指定绝对数据目录，例如 `D:\BemoData`。未指定时，桌面使用操作系统的应用数据目录，标识为 `com.cheshire.bemo`；Web 开发使用 `backend/data`。旧桌面启动方式没有稳定的数据路径，因此升级不会猜测或自动搬移旧数据。已有数据请先备份，再把 `BEMO_DATA_DIR` 指向原目录，确认内容后继续使用。不要把“新目录为空”当作原数据已丢失。

正式发布只使用 `npm run build:desktop`，并先用 `setup-runtime.ps1 -DesktopBuild` 准备构建依赖。该入口生成当前源码对应的后端、写入源文件与二进制 SHA-256 摘要，再调用 Tauri。旧的根目录 `bemo-api-*.exe` 不参与构建；摘要不匹配会拒绝发布。普通修复和本轮验证不执行此发布命令，也不证明旧安装包已更新。

## Docker 网络部署

默认只把鉴权代理绑定到 `127.0.0.1:8080`，后端端口不发布到宿主机。代理将 `/api/` 和 `/images/` 转发到后端，并支持网页路由回退。部署前必须准备 Nginx 支持的 htpasswd 文件；`BEMO_AUTH_FILE` 未配置或文件不存在时应拒绝启动。

```powershell
$env:BEMO_AUTH_FILE = 'D:\BemoConfig\users.htpasswd'
docker compose up --build -d
```

用 htpasswd 工具交互式创建文件，不要把明文密码、鉴权文件或它的内容提交进仓库。浏览器使用此账号访问页面、应用 API 和附件。若修改 `BEMO_BIND_ADDRESS` 对局域网或公网开放，必须在可信 HTTPS 入口后部署；不要直接公开未经鉴权的 Python app API。桌面回环服务不因此增加账号系统。

`/api/sync/` 不叠加 Basic 登录，而由后端逐请求校验 Bearer 令牌，避免两个协议争用同一个 Authorization 请求头。需要同步或网页 WebDAV 代理时，在构建前配置非默认的 `BEMO_SYNC_TOKEN`；Compose 同时传给后端和前端构建。前端代理令牌会进入受 Basic 登录保护的网页资源，因此仅适用于单用户可信部署，不能给不可信用户共享同一个网页账号。不配置令牌时，同步 API 拒绝所有访问，笔记 CRUD 不受影响。

`bemo_data` 卷保存数据库与附件。普通容器重启不删除它；不要用 `down -v` 处理日常重启。更新后导航请求优先读取新页面，断网才回退到最后成功缓存的应用外壳；私人 API 和附件不进入 Service Worker 静态缓存。

Docker 验证入口为 `scripts/verify-docker.ps1 -ConfirmTestDeployment`；设置 `BEMO_TEST_USER` 与 `BEMO_TEST_PASSWORD` 为鉴权文件中的测试账号后运行。它创建单独的 Compose 项目和卷，检查未登录访问、同源 API 写入、附件和重启保留，完成后停止容器并保留测试卷。GitHub 中对应的是手动工作流，不会在普通提交时自动打 Docker 镜像。当前机器未找到 Docker，因此容器运行结果尚未验收。

## 恢复、清空和重置

完整备份和 Markdown 归档导入会替换当前主存储，执行前会显示确认。解析阶段校验清单、附件和 ZIP 完整性，写入失败通过事务保留原数据；后端先准备内容寻址附件，再替换元数据。失败时产生的未引用附件文件保留，不在本轮自动清理。恢复前应停止其它窗口的编辑。

“清空数据”作用于当前主存储；Web / Desktop 会清空后端。“重置设备”只清本机状态，不清空后端；Mobile 的本机就是主存储，因此重置前应备份。二者均不会删除远端同步目标中的内容；仍启用同步时，远端内容可能再次被拉取。

## 定向验证与仓库清理

前端 `npm run test:unit -- --list <spec名称>` 先列出将执行的测试文件，再去掉 `--list` 执行。后端使用 `python run_tests.py --pattern test_api_remediation.py --list` 和相同 selector 的执行命令。`backendAppStore.spec` 启动独立的 app 与 sync 服务；Mobile 模式用明确选择本地存储的测试，不能互相冒充。

本机保留测试数据时设置 `BEMO_TEST_KEEP_DATA=1`，目录为 `backend/tests/.tmp`。Vue 类型检查使用 `node node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.app.json`；Windows Rust 检查使用 `cargo check --locked`，不是安装包验证。

虚拟环境、缓存和历史产物已加入忽略规则；已被 Git 跟踪的历史文件不会因为忽略规则自动消失。从索引移除这些文件、归档或删除均待用户单独确认，本轮没有执行。原始发现及验证结果见[审查修复记录](audit-remediation-2026-08-31.md)。
