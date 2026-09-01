# 参与 Bemo 开发

感谢你愿意改进 Bemo。开始之前，请先阅读 [当前架构](./CURRENT_ARCHITECTURE.md) 和 [运行、部署与验证说明](./docs/operations.md)。这两份文档分别说明平台边界和本机开发入口。

## 先判断改动应该放在哪里

Bemo 在不同平台共享笔记、附件、同步和导入导出的产品语义，但不强求共用同一种存储实现或界面外壳。

- 修改数据结构、导入导出格式、同步规则或冲突语义时，优先放在共享 domain 与 contract 中。
- 修改存储、附件访问、文件选择、分享或网络传输时，优先收口到 runtime / adapter 边界。
- 修改页面结构、导航、手势、编辑器交互或设置布局时，可以分别处理 Web / Desktop 与 Mobile。

不要把 Web / Desktop 改回浏览器本地存储主路径，也不要让 Mobile 强行依赖桌面后端主存储。

## 本地运行

当前仓库按 Windows 环境验收。先按 [运行、部署与验证说明](./docs/operations.md) 准备 Python 与 Node.js 依赖，再从仓库根目录启动：

```powershell
.\start-dev.ps1
```

桌面源码调试和 Android 开发分别参考 [桌面源码与数据目录](./docs/operations.md#桌面源码与数据目录) 与 [Android 发布指南](./ANDROID_RELEASE_GUIDE.md)。

## 提交改动前

请运行能直接覆盖本次改动的检查，并在说明中写清：

- 用户能够观察到的变化；
- 影响 Web、Desktop、Mobile 中的哪些运行时；
- 实际运行的测试或检查命令及结果；
- 尚未验证的平台、打包产物或真实部署边界。

普通代码改动不需要顺手打包。只有改动确实影响安装包、原生桥接或发布链时，才运行对应的桌面或 Android 构建入口。

## 许可证

Bemo 原创应用源码按 [AGPL-3.0-or-later](./LICENSE) 授权；第三方代码、依赖与素材仍遵循各自的许可证和说明。详情见 [LICENSING.md](./LICENSING.md) 与 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。
