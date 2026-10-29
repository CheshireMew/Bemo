# Bemo 界面优化记录（2026-10-30）

本轮使用用户指定的 `E:\Code\Example\impeccable-main\plugin\skills\impeccable`，按现有产品界面的 refinement / polish 要求实施。保留经典、Nord、Sepia 配色和 Web / Desktop、Mobile 两套外壳，不改变存储与同步边界。

## Git 基线

开始时本地 main 与 origin/main 同为 `ecda719`，工作区另有未提交的同步、手势、图片分享和主题更新。先完成类型检查、同步相关检查并修正旧同步通知断言，将这些已有更新提交为 `2343b39`，推送到 GitHub main 后再进行本轮界面优化。

## 已完成的调整

- 笔记流、编辑器、搜索框和设置表单统一字体、间距、圆角与交互状态，补全 Windows 中文无衬线字体回退。
- 侧栏和设置导航使用较轻的选中状态，标签列表保留清晰的选中反馈；笔记置顶保留图标和细边框标识。
- 设置弹窗使用主题一致的表面和遮罩；缩窄设置导航，为表单留出更多宽度。切换分组时内容回到顶部，窄屏选中项保持可见。
- 同步页移除重复的模式标记，以列表呈现同步状态；队列详情通过原生 details 展开。同步模式、配置、诊断和操作入口继续保留。
- 导入导出按备份、恢复和兼容格式顺序排列，清空与重置放在独立区域；保留现有数据影响说明和确认流程。
- 外观页精简重复说明，主题预览随内容区域宽度调整布局；图片分享弹窗跟随当前主题，导出图片使用独立配色。
- 补充搜索清空后的焦点恢复、排序状态、导航当前位置、编辑状态和键盘跳转入口；扩大搜索、开关、通知关闭等控件的操作范围。
- 增加页码选择，1000 条笔记仍按每页最多 40 张卡片渲染；翻页前继续保护正在编辑的笔记。
- 笔记图片延迟加载，音频不预加载、视频只预加载元数据；长链接和宽表格不挤破阅读区域。减少动态效果时保留状态变化，停止加载动画与抽屉、卡片的位移动画。

## 验证

在 Windows 上使用已有 Node.js、Python 与 Chrome / Playwright 环境验证，没有安装依赖或打安装包。

- Vue / TypeScript：`node node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.app.json` 通过。
- 前端：`npm run test:unit` 通过，执行 31 个 spec 文件。
- 原有同步更新：`test_hosted_sync.py` 15 项、`test_sync_integrity.py` 8 项通过。
- `scripts/ux-regression.mjs` 通过：搜索竞态与筛选、键盘导航、编辑保存及失败保留、删除恢复、设置布局、六种主题组合的关键文字对比度、1000 条笔记分页及未保存编辑保护、后端断线恢复。
- `scripts/theme-regression.mjs`、`scripts/mobile-touch-regression.mjs` 通过。移动壳在浏览器中模拟，涉及的原生桥接由测试替身提供。
- `scripts/note-image-sharing-regression.mjs` 通过：四种版式、Markdown 与附件、下载、主题独立性、分享取消与失败重试。
- 移动笔记手势用 Chrome CDP 合成触摸核对双击编辑、长按复制、左右滑动、纵向滚动、取消与恢复。一次双击步骤超时，随后记录命中目标与事件后重跑全部步骤通过；未据此修改产品手势语义。
- Impeccable detector 执行一次，发现分享模板两处 2px 侧线；已改为 1px。人工检查桌面、窄窗口、浅色与深色截图，未以检测器代替实际页面检查。
- `git diff --check` 通过。

截图和运行日志保留在本机 `D:\Tools\codex-evidence\bemo-impeccable-20261030`。浏览器检查使用独立上下文和测试数据；没有操作用户的实际笔记。没有执行原生安装包、Docker 或其它平台验收。
