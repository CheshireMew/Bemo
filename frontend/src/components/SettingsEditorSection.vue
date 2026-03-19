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
        <div class="toggle-switch-wrapper">
          <input v-model="settings.editor.autoSaveEnabled" type="checkbox" @change="persistSettings" />
          <span class="toggle-switch-slider"></span>
        </div>
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
        <div class="toggle-switch-wrapper">
          <input v-model="settings.editor.markdownGfm" type="checkbox" @change="persistSettings" />
          <span class="toggle-switch-slider"></span>
        </div>
      </label>

      <label class="toggle-row">
        <div>
          <span class="field-label">换行转 &lt;br&gt;</span>
          <span class="field-hint">开启后单个换行会在预览里保留显示。</span>
        </div>
        <div class="toggle-switch-wrapper">
          <input v-model="settings.editor.markdownBreaks" type="checkbox" @change="persistSettings" />
          <span class="toggle-switch-slider"></span>
        </div>
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
/* Scoped styles are handled by global settings.css */
</style>
