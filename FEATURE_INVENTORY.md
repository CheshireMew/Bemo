# Feature Inventory

本表记录当前源码能力；架构边界以 [CURRENT_ARCHITECTURE.md](CURRENT_ARCHITECTURE.md) 为准，验证入口见 [运行说明](docs/operations.md)。

| 范围 | 当前实现 |
| --- | --- |
| 主存储 | Web / Desktop 使用 backend 的 SQLite 与附件目录；Mobile 使用本机 IndexedDB 与附件存储 |
| 笔记 | 创建、编辑、置顶、标签、全文搜索、日期筛选、热力图与日历；编辑按打开时的版本校验，拒绝覆盖新版本 |
| 附件 | 图片、音频、视频及文件上传、展示和打开；保存方式由运行时适配 |
| 回收站 | 移入、恢复、永久删除和清空；没有按 90 天自动清理的功能 |
| 编辑器 | Markdown、预览、附件、自动保存新笔记草稿；正常关闭或刷新前刷新草稿存储 |
| 同步 | Server / WebDAV、冲突处理、设备状态与队列；Mobile 支持本地编辑后同步，Web / Desktop 后端失联时只保留缓存阅读 |
| 导入导出 | ZIP 完整备份、Markdown 归档、Flomo ZIP / CSV 导入与 CSV 导出；Markdown 是交换格式，不是 Web / Desktop 主存储 |
| 界面 | Web / Desktop 与 Mobile 独立外壳；浅色、深色、系统主题及皮肤设置 |
| 运行入口 | Web 开发脚本、Tauri Windows 桌面源码入口、PWA 与 Mobile 工程；Docker 自托管配置及操作说明已提供 |
| 质量入口 | 前端按 spec 选择测试；后端默认收集 app、hosted sync、integrity 和桌面生命周期套件；Windows Rust 源码检查 |

源码具备入口与通过安装包、容器或所有平台验收是不同结论。本轮只验收 Windows 本地修复，不执行打包、Docker 部署或 Mobile 设备验收。低资源占用和性能没有在本轮建立量化验收结论。
