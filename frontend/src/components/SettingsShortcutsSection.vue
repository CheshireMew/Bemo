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
kbd {
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-color, #d4d4d8);
  border-bottom-width: 2px;
  border-radius: 8px;
  padding: 6px 10px;
  font-size: 0.85rem;
}

.shortcut-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.shortcut-list div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
}

@media (max-width: 768px) {
  .shortcut-list div {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
