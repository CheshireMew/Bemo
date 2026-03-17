<template>
  <section class="settings-section">
    <div class="section-header">
      <div>
        <h3>快捷键说明</h3>
        <p>整理当前编辑器里可用的常用快捷键。</p>
      </div>
    </div>

    <div class="settings-card">
      <div class="shortcut-list">
        <div><kbd>Ctrl/⌘ + Enter</kbd><span>发送笔记</span></div>
        <div><kbd>Ctrl/⌘ + Z</kbd><span>撤销</span></div>
        <div><kbd>Ctrl/⌘ + Y</kbd><span>重做（Windows）</span></div>
        <div><kbd>Ctrl/⌘ + Shift + Z</kbd><span>重做（macOS / 通用）</span></div>
        <div><kbd>Ctrl/⌘ + B</kbd><span>加粗</span></div>
        <div><kbd>Ctrl/⌘ + I</kbd><span>斜体</span></div>
        <div><kbd>Ctrl/⌘ + K</kbd><span>插入链接</span></div>
        <div><kbd>Ctrl/⌘ + `</kbd><span>行内代码</span></div>
        <div><kbd>Ctrl/⌘ + \</kbd><span>清除格式</span></div>
        <div><kbd>Ctrl/⌘ + Shift + X</kbd><span>删除线</span></div>
        <div><kbd>Ctrl/⌘ + Shift + L</kbd><span>列表</span></div>
        <div><kbd>Ctrl/⌘ + Shift + O</kbd><span>序号列表</span></div>
        <div><kbd>Ctrl/⌘ + Shift + T</kbd><span>任务清单</span></div>
        <div><kbd>Ctrl/⌘ + Shift + P</kbd><span>切换预览</span></div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-header,
.shortcut-list div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.section-header h3 {
  margin: 0;
  color: var(--text-primary, #18181b);
}

.section-header p {
  margin: 6px 0 0;
  color: var(--text-secondary, #71717a);
  font-size: 0.92rem;
  line-height: 1.5;
}

.settings-card {
  background: var(--bg-card, #ffffff);
  border: 1px solid var(--border-color, #e4e4e7);
  border-radius: var(--radius-lg, 0.75rem);
  padding: 18px;
}

.shortcut-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.shortcut-list div {
  align-items: center;
}

kbd {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-color, #d4d4d8);
  border-bottom-width: 2px;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 0.85rem;
}

@media (max-width: 768px) {
  .shortcut-list div {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
