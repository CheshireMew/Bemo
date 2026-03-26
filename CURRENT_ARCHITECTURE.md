# Bemo Current Architecture

这份文档是当前架构的单一事实来源。

如果其它文档和这里冲突，以这里为准。

## 一句话描述

Bemo 现在是同一套产品语义下的两种运行时、两套交互外壳：

- Web / Desktop：backend-backed runtime
- Mobile：local-backed runtime

共享的是产品语义，不是所有平台的存储实现和界面骨架。

## 为什么会这样

Web / Desktop 没有继续采用本地存储作为主路径，是因为这条路在实际运行里不够稳定，存在丢数据风险。当前更可靠的做法，是由 backend 承载 Web / Desktop 的主存储。

Mobile 继续采用本地存储，不是因为它代表未来目标，而是因为打包和运行时约束决定了它不能直接复用 Web / Desktop 这条路径。

同时，移动端在交互和能力接入上也确实不同。某些功能需要额外处理，UI 也不能直接照搬桌面布局。

## 当前职责划分

### frontend

frontend 负责：

- 产品 UI 与交互
- 编辑器流程
- AI 功能与设置
- 导入导出格式语义
- 同步流程
- WebDAV 客户端语义
- 共享 domain contract
- Web / Desktop shell 与 Mobile shell

### backend

backend 负责：

- Web / Desktop 笔记主存储接口
- Web / Desktop 附件主存储接口
- Web / Desktop 备份相关接口
- sync `push / pull / blobs`
- 网页端 WebDAV 代理

### mobile runtime

移动端当前额外承担：

- 本地笔记主存储
- 本地附件主存储
- 原生文件与分享能力接入
- 移动端专用交互与页面组织

## 共享什么，分开什么

应该共享的部分：

- 笔记 contract
- 附件 contract
- 同步 contract
- 导入导出格式
- AI 会话与设置数据结构
- 冲突语义与归一化规则

允许分开的部分：

- 主存储实现
- 附件 URL 与打开方式
- 文件选择与分享流程
- 页面布局
- 导航方式
- 编辑器交互细节
- 设置页结构

## 改代码时的判断规则

如果你在改下面这些内容，优先先找共享 domain 和 adapter 边界，而不是直接改某个平台页面：

- 笔记数据结构
- 附件引用格式
- 同步行为
- 导入导出格式
- 冲突处理

如果你在改下面这些内容，允许按运行时或 shell 分开实现：

- 存储落地
- 原生能力调用
- 页面结构
- 导航与手势
- 移动端专用交互

## 当前最重要的工程约束

不要把平台差异继续散落到业务代码里。

更好的做法是把差异压在少数入口：

- runtime config
- app store adapter
- attachment adapter
- sync transport adapter
- shell-level UI composition

业务层应当尽量读取“能力与 contract”，而不是自己判断“是不是 mobile”“是不是 desktop”。

## 结论

Bemo 当前不是“backend 只是 sync-server”，也不是“移动端只是桌面端的例外适配”。

当前准确事实是：

- Web / Desktop 依赖 backend 作为主存储
- Mobile 依赖 local 作为主存储
- 两边共享产品语义，但运行时实现和 UI 外壳可以明确分开
