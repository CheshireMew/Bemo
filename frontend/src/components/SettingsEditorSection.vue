<template>
  <section class="settings-section">
    <div class="section-header">
      <div>
        <h3>编辑器</h3>
        <p>控制自动保存、图片上传压缩和 Markdown 渲染方式。</p>
      </div>
    </div>

    <div class="settings-card form-card">
      <label class="toggle-row">
        <div>
          <span class="field-label">自动保存草稿</span>
          <span class="field-hint">保存未发送的输入内容，下次打开编辑器自动恢复。</span>
        </div>
        <input v-model="settings.editor.autoSaveEnabled" type="checkbox" @change="persistSettings" />
      </label>

      <label class="field-row">
        <span class="field-label">自动保存间隔</span>
        <div class="field-input with-suffix">
          <input
            v-model.number="settings.editor.autoSaveDelaySec"
            type="number"
            min="1"
            max="30"
            @change="normalizeDelay"
          />
          <span>秒</span>
        </div>
      </label>

      <label class="field-row">
        <span class="field-label">图片上传压缩策略</span>
        <select v-model="settings.editor.imageCompression" @change="persistSettings">
          <option value="original">原图</option>
          <option value="balanced">平衡</option>
          <option value="compact">高压缩</option>
        </select>
      </label>

      <label class="toggle-row">
        <div>
          <span class="field-label">启用 GFM 扩展</span>
          <span class="field-hint">支持任务列表、表格、删除线等扩展语法。</span>
        </div>
        <input v-model="settings.editor.markdownGfm" type="checkbox" @change="persistSettings" />
      </label>

      <label class="toggle-row">
        <div>
          <span class="field-label">换行转 &lt;br&gt;</span>
          <span class="field-hint">开启后单个换行会在预览里保留显示。</span>
        </div>
        <input v-model="settings.editor.markdownBreaks" type="checkbox" @change="persistSettings" />
      </label>

      <label class="field-row">
        <span class="field-label">笔记复制格式</span>
        <select v-model="settings.editor.copyFormat" @change="persistSettings">
          <option value="rich-text">富文本</option>
          <option value="markdown">Markdown</option>
        </select>
      </label>
    </div>
  </section>
</template>

<script setup lang="ts">
import { settings } from '../store/settings';
import { saveSettings } from '../services/localSettings';

const persistSettings = () => {
  saveSettings();
};

const normalizeDelay = () => {
  const next = Number.isFinite(settings.editor.autoSaveDelaySec) ? settings.editor.autoSaveDelaySec : 3;
  settings.editor.autoSaveDelaySec = Math.min(30, Math.max(1, Math.round(next)));
  saveSettings();
};
</script>

<style scoped>
.settings-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-header,
.toggle-row,
.field-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.section-header h3 {
  margin: 0;
  color: var(--text-primary, #18181b);
}

.section-header p,
.field-hint {
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

.form-card {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.toggle-row,
.field-row {
  align-items: center;
}

.field-row {
  flex-wrap: wrap;
}

.field-label {
  display: block;
  font-weight: 600;
  color: var(--text-primary, #18181b);
}

.field-input,
.field-row input,
.field-row select {
  min-width: 220px;
}

.field-row input,
.field-row select {
  border: 1px solid var(--border-color, #d4d4d8);
  background: var(--bg-card, #fff);
  color: var(--text-primary, #18181b);
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
}

.field-row input:focus,
.field-row select:focus {
  outline: 2px solid color-mix(in srgb, var(--accent-color, #31d279) 20%, transparent);
  border-color: var(--accent-color, #31d279);
}

.with-suffix {
  display: flex;
  align-items: center;
  gap: 10px;
}

.with-suffix input {
  width: 88px;
  min-width: 88px;
}

@media (max-width: 768px) {
  .toggle-row,
  .field-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .field-row input,
  .field-row select,
  .field-input {
    width: 100%;
  }
}
</style>
