# Bemo

Bemo 现在应该被理解成同一套产品语义下的两种运行时和两套交互外壳，而不是所有平台共用一套实现。

当前稳定边界是：

- Web / Desktop：以前端承载产品界面与流程，以 backend 承载主存储
- Mobile：以前端承载移动端界面与流程，以本地存储承载主存储

这样划分不是临时兼容，而是当前产品现实。

Web / Desktop 继续使用 backend 主存储，是因为本地存储在这些运行时里不够稳定，存在丢数据风险。Mobile 继续使用本地存储，是因为打包和运行时约束决定了它不能直接复用 Web / Desktop 这条路径。同时，移动端在交互和功能处理上也需要单独设计，不能把桌面界面直接缩到手机上。

## 现在怎样理解这个仓库

不要再把仓库套进下面两种错误模型：

- “backend 只是可选 sync-server”
- “移动端只是桌面版的例外实现”

更准确的理解是：

- `frontend` 负责共享产品语义，以及各端界面与交互壳
- `backend` 负责 Web / Desktop 的应用数据存储，同时提供同步服务和网页端代理能力
- `mobile` 在存储、文件能力和 UI 结构上都有自己的运行时处理

共享的是产品语义，不是所有平台的存储实现或界面骨架。

## 当前共享与分离

下面这些应该尽量共享：

- 笔记、附件、同步、导入导出、AI 的产品语义
- 数据 contract 和归一化规则
- 同步协议和冲突语义

下面这些允许按端分开：

- 主存储实现
- 附件落地与打开方式
- 文件选择、分享、原生能力接入
- 页面结构、导航、编辑器交互和设置页布局

## 仓库结构

- [frontend](./frontend)：产品前端、共享 domain、Web/Desktop shell、Mobile shell
- [backend](./backend)：Web / Desktop 应用数据服务、同步 API、网页端代理
- [scripts](./scripts)：仓库级脚本
- [Example](./Example)：示例资源

## 开发启动

### Web / Desktop

Web / Desktop 默认需要 backend 一起参与，建议直接从仓库根目录启动：

```powershell
.\start-dev.ps1
```

或：

```bat
start-dev.bat
```

只有显式做纯界面调试时，才使用：

```powershell
.\start-dev.ps1 -FrontendOnly
```

但这种方式不代表 Web / Desktop 主功能完整可用。

### Backend

如果只想单独启动 backend：

```powershell
cd backend
.\start-sync-server.ps1
```

### Mobile

移动端相关开发和打包请看：

- [frontend/README.md](./frontend/README.md)
- [ANDROID_RELEASE_GUIDE.md](./ANDROID_RELEASE_GUIDE.md)
- [ANDROID_PRELAUNCH_CHECKLIST.md](./ANDROID_PRELAUNCH_CHECKLIST.md)

## 什么时候需要 backend

对 Web / Desktop：

- backend 是主存储的一部分，通常必须启动

对 Mobile：

- 单机使用可以只走本地存储
- 需要同步、网页端联调或特定代理能力时再连接 backend

## 当前文档入口

- 当前架构事实来源：[CURRENT_ARCHITECTURE.md](./CURRENT_ARCHITECTURE.md)
- 前端说明：[frontend/README.md](./frontend/README.md)
- 后端说明：[backend/README.md](./backend/README.md)

## 结论

Bemo 当前不是“所有端同一实现”，也不是“backend 只剩 sync-server”。

当前准确描述是：

- Web / Desktop：backend-backed product runtime
- Mobile：local-backed product runtime
- 两边共享产品语义，但不强求共享存储实现和 UI 外壳
