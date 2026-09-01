<!-- readme-header:start -->

<p align="center">
  <img src="./assets/readme/logo.svg" width="152" alt="Bemo">
</p>

<h1 align="center">Bemo</h1>

<p align="center">
  <strong>一款为持续记录而做的开源碎片笔记应用：随手记下文字、图片和标签，再按时间、日期和搜索把它们找回来。</strong>
</p>

<p align="center">
  <strong>中文</strong> | <a href="./docs/operations.md">文档</a> | <a href="./CONTRIBUTING.md">贡献</a> | <a href="https://github.com/CheshireMew/Bemo/issues">反馈</a>
</p>

<p align="center">
  <a href="https://x.com/0xCheshire" title="X"><img src="https://img.shields.io/badge/X-%400xCheshire-000000?logo=x&amp;logoColor=white" alt="X：@0xCheshire"></a>
  <a href="https://t.me/CheshireBTC" title="Telegram"><img src="https://img.shields.io/badge/Telegram-CheshireBTC-26A5E4?logo=telegram&amp;logoColor=white" alt="Telegram：CheshireBTC"></a>
  <a href="https://blog.blacknico.com/" title="Blog"><img src="https://img.shields.io/badge/Blog-blog.blacknico.com-2E7D32?logo=rss&amp;logoColor=white" alt="博客：blog.blacknico.com"></a>
  <a href="https://blacknico.com/" title="Homepage"><img src="https://img.shields.io/badge/Home-blacknico.com-1F6FEB?logo=googlechrome&amp;logoColor=white" alt="个人主页：blacknico.com"></a>
</p>

<p align="center">
  <a href="https://github.com/CheshireMew/Bemo/stargazers"><img src="https://img.shields.io/github/stars/CheshireMew/Bemo?style=flat" alt="GitHub Stars"></a>
  <a href="https://github.com/CheshireMew/Bemo/forks"><img src="https://img.shields.io/github/forks/CheshireMew/Bemo?style=flat" alt="GitHub Forks"></a>
  <a href="https://github.com/CheshireMew/Bemo/blob/main/LICENSE"><img src="https://img.shields.io/github/license/CheshireMew/Bemo?style=flat" alt="Repository License"></a>
</p>

<!-- readme-header:end -->

Bemo 适合记录那些不值得专门建一篇文档、但又不想丢掉的内容。写下一段文字、放进一张图片、补上几个标签，它们就会进入按时间排列的笔记流；之后可以用全文搜索、标签、日期、迷你日历或记录热力图重新找到。

> 写下碎片 → 进入时间流 → 搜索、筛选或回看

## 你能用 Bemo 做什么

| 需要 | Bemo 提供的方式 |
| --- | --- |
| 快速记录 | 富文本与 Markdown 源码两种编辑方式，支持图片、标签、置顶和草稿自动保存 |
| 找回内容 | 全文搜索、标签筛选、日期筛选、迷你日历、记录热力图和随机回看 |
| 整理与恢复 | 回收站、完整备份 ZIP、通用 Markdown 归档，以及 Flomo 数据导入导出 |
| 多端使用 | Web、Tauri 桌面端和 Android 移动端使用同一套笔记与同步语义，同时保留各自合适的交互方式 |
| 跨设备同步 | Server 与 WebDAV 两条同步路径，包含冲突记录、待同步队列和 WebDAV 链路自检 |

## 快速开始

当前仓库以 Windows 源码运行作为明确入口。先准备 Python 和 Node.js，再从仓库根目录执行：

```powershell
.\backend\setup-runtime.ps1
$env:BEMO_PYTHON = 'D:\Tools\Bemo\venv\Scripts\python.exe'

Push-Location .\frontend
npm ci --cache D:\Tools\npm-cache
Pop-Location

.\start-dev.ps1
```

启动脚本会先启动 Web / Desktop 使用的应用后端，再启动前端。终端显示 Vite 地址后，在浏览器中打开该地址即可开始记录。端口被占用时，脚本会选择其它可用端口并在终端中说明。

如果只需要调界面，可以运行 `.\start-dev.ps1 -FrontendOnly`；此时笔记读写等依赖后端的功能不可用。完整的环境、数据目录和故障处理说明见 [运行、部署与验证](./docs/operations.md)。

## 运行方式与数据位置

Bemo 是同一个产品，但不同平台不会强行共用一套存储和界面。这样做是为了让 Web / Desktop 的数据路径保持稳定，同时让 Mobile 能继续使用本地数据库和原生文件能力。

| 运行方式 | 主存储 | 开发或部署入口 |
| --- | --- | --- |
| Web | backend 的应用数据库与附件目录 | `.\start-dev.ps1`；网络部署见 [Docker 说明](./docs/operations.md#docker-网络部署) |
| Desktop | Tauri 管理的本机 backend | 在 `frontend` 运行 `npm run tauri -- dev` |
| Android / Mobile | 设备本地 IndexedDB 与本地附件存储 | [Android 发布指南](./ANDROID_RELEASE_GUIDE.md) |

Web / Desktop 的 backend 不只是同步服务器，它也是笔记与附件的主存储。后端失联时，界面可以保留已有缓存阅读，但不承诺离线写入。Mobile 则以设备本地数据为主，需要跨设备时再连接 Server 或 WebDAV。

笔记、附件、备份格式、同步协议和冲突规则尽量共享；主存储、文件选择、附件打开方式、导航和编辑器交互可以按平台分别实现。更完整的边界见 [当前架构](./CURRENT_ARCHITECTURE.md)。

## 数据可以带走

Bemo 提供三类迁移入口：

- **完整备份**：导出笔记、回收站和引用附件，用于无损恢复或迁移；
- **Markdown 归档**：导出通用 Markdown 文件与附件，方便长期保存和在其它工具中继续使用；
- **Flomo 互通**：导入 Flomo 标准备份，或把内容导出为 CSV。

导入完整备份或 Markdown 归档会替换当前主存储，应用会在执行前要求确认。Web / Desktop 修改的是后端数据，Mobile 修改的是当前设备本地数据；操作前请先保留一份完整备份。

## 仓库结构

```text
Bemo/
├─ frontend/   Vue 产品层、共享 domain、Web / Desktop 与 Mobile 界面
├─ backend/    Web / Desktop 应用数据服务、同步 API 与 WebDAV 代理
├─ docs/       运行、审查和维护文档
└─ scripts/    仓库级验证与数据迁移脚本
```

改动笔记、附件、同步或导入导出的公共规则时，优先修改共享 domain 和 contract；改动存储、原生文件能力或页面交互时，再进入对应 runtime、adapter 或平台 shell。参与开发前请看 [贡献指南](./CONTRIBUTING.md)。

## 文档地图

- [当前架构](./CURRENT_ARCHITECTURE.md)：Web / Desktop 与 Mobile 的职责边界
- [运行、部署与验证](./docs/operations.md)：Windows 环境、桌面调试、Docker 部署和定向验证
- [前端说明](./frontend/README.md)：共享产品层、运行时适配和两套界面外壳
- [后端说明](./backend/README.md)：应用存储、同步服务与启动入口
- [同步架构](./SYNC_ARCHITECTURE.md)：同步协议、状态与冲突处理
- [Android 发布指南](./ANDROID_RELEASE_GUIDE.md)：移动端环境、构建与发布入口
- [版本与发布约定](./RELEASE_VERSIONING.md)：版本号、Git tag 与发布检查

## 许可证

Bemo 的原创应用源码按 [GNU AGPL v3.0 or later](./LICENSE) 授权。第三方库、复制或随仓库分发的材料继续遵循各自的许可证；准确范围见 [LICENSING.md](./LICENSING.md) 与 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
