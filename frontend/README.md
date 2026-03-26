# Frontend

`frontend` 是 Bemo 的产品层，但它不是“所有平台共用一套壳”的意思。

当前前端需要同时承担两类事情：

- 共享产品语义：笔记、附件、同步、导入导出、AI、编辑器数据 contract
- 分平台交互外壳：Web / Desktop shell 与 Mobile shell

所以读这个目录时，不要再默认“移动端只是桌面端加几个适配分支”。

## 当前边界

前端负责：

- UI 与交互
- 编辑器流程
- AI 功能与设置
- 导入导出格式语义
- 同步流程与 WebDAV 客户端语义
- 运行时适配入口

前端不应该直接到处散落平台分支。存储、附件、文件能力、同步传输这些差异，应该尽量收口在 runtime / adapter 边界。

## 两条运行路径

### Web / Desktop

- 主存储走 backend
- 前端负责产品界面、状态和流程
- 开发时通常需要和仓库根目录下的 backend 一起启动

### Mobile

- 主存储走本地
- 某些功能需要额外原生能力处理
- UI 不能直接照搬 Web / Desktop，需要独立交互设计

## 运行时配置

当前运行时仍通过环境变量解析：

- `VITE_WEB_API_BASE_URL` / `VITE_API_BASE_URL`
- `VITE_ANDROID_API_BASE_URL` / `VITE_API_BASE_URL`
- `VITE_WEB_APP_STORAGE_MODE`
- `VITE_ANDROID_APP_STORAGE_MODE`
- `VITE_APP_STORAGE_MODE`

其中当前默认方向是：

- Web 默认 `backend`
- Android 默认 `local`

这些配置表达的是运行时事实，不是未来迁移目标。

## 开发建议

开发 Web / Desktop 时，优先从仓库根目录启动：

```powershell
..\start-dev.ps1
```

或：

```bat
..\start-dev.bat
```

开发 Android 时，请结合：

- [ANDROID_RELEASE_GUIDE.md](E:/Work/Code/Bemo/ANDROID_RELEASE_GUIDE.md)
- [ANDROID_PRELAUNCH_CHECKLIST.md](E:/Work/Code/Bemo/ANDROID_PRELAUNCH_CHECKLIST.md)

## 改代码时怎么判断

如果你改的是产品语义、contract、同步规则、导入导出格式，优先在共享 domain 收口。

如果你改的是存储落地、附件访问、原生文件能力或网页端代理，优先在 runtime / adapter 收口。

如果你改的是页面组织、导航、编辑器交互、设置结构，允许 Web / Desktop 与 Mobile 分开实现，不要强行共用一个外壳。

更完整的当前架构说明请看 [CURRENT_ARCHITECTURE.md](E:/Work/Code/Bemo/CURRENT_ARCHITECTURE.md)。
