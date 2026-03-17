<template>
  <teleport to="body">
    <div v-if="open" class="settings-overlay" @click.self="emit('close')">
      <section class="settings-panel" role="dialog" aria-modal="true" aria-label="设置">
        <header class="settings-header">
          <div>
            <h2>设置</h2>
            <p>管理导入导出、编辑器与 AI 配置。</p>
          </div>
          <button class="close-btn" type="button" @click="emit('close')">关闭</button>
        </header>

        <div class="settings-body">
          <aside class="settings-nav" aria-label="设置分组">
            <button
              v-for="tab in tabs"
              :key="tab.id"
              type="button"
              class="tab-btn"
              :class="{ active: activeTab === tab.id }"
              @click="activeTab = tab.id"
            >
              <span class="tab-label">{{ tab.label }}</span>
            </button>
          </aside>

          <div class="settings-content">
            <section v-if="activeTab === 'import-export'" class="settings-section">
              <div class="section-header">
                <div>
                  <h3>导入导出</h3>
                  <p>把侧边栏里的备份与迁移操作集中到这里。</p>
                </div>
                <span v-if="isImporting" class="section-badge">处理中...</span>
              </div>

              <div class="card-grid two-up">
                <article class="settings-card">
                  <h4>导出</h4>
                  <p>导出完整备份或 Flomo 兼容格式。</p>
                  <div class="button-row">
                    <button type="button" class="primary-btn" @click="exportZip">导出 ZIP</button>
                    <button type="button" class="secondary-btn" @click="exportFlomo">导出 Flomo</button>
                  </div>
                </article>

                <article class="settings-card">
                  <h4>导入</h4>
                  <p>从 Bemo 备份包或 Flomo ZIP 恢复笔记。</p>
                  <div class="button-row">
                    <button type="button" class="primary-btn" @click="triggerZipImport">导入 ZIP</button>
                    <button type="button" class="secondary-btn" @click="triggerFlomoImport">导入 Flomo</button>
                  </div>
                </article>
              </div>

              <article class="settings-card">
                <h4>维护</h4>
                <p>扫描 `images` 目录，删除已经没有任何笔记或回收站条目引用的孤儿图片。</p>
                <div class="button-row">
                  <button type="button" class="secondary-btn" :disabled="isCleaningOrphans" @click="cleanupOrphanImages">
                    {{ isCleaningOrphans ? '扫描中...' : '扫描并清理孤儿图片' }}
                  </button>
                </div>
              </article>

              <input type="file" ref="zipFileInput" accept=".zip" hidden @change="handleZipImport" />
              <input type="file" ref="flomoFileInput" accept=".zip" hidden @change="handleFlomoImport" />
            </section>

            <section v-else-if="activeTab === 'editor'" class="settings-section">
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

            <section v-else-if="activeTab === 'shortcuts'" class="settings-section">
              <div class="section-header">
                <div>
                  <h3>快捷键说明</h3>
                  <p>整理当前编辑器里可用的常用快捷键。</p>
                </div>
              </div>

              <div class="settings-card">
                <div class="shortcut-list">
                  <div><kbd>Ctrl/⌘ + Enter</kbd><span>发送笔记</span></div>
                  <div><kbd>Ctrl/⌘ + B</kbd><span>加粗</span></div>
                  <div><kbd>Ctrl/⌘ + I</kbd><span>斜体</span></div>
                  <div><kbd>Ctrl/⌘ + K</kbd><span>插入链接</span></div>
                  <div><kbd>Ctrl/⌘ + `</kbd><span>行内代码</span></div>
                  <div><kbd>Ctrl/⌘ + Shift + X</kbd><span>删除线</span></div>
                  <div><kbd>Ctrl/⌘ + Shift + L</kbd><span>列表</span></div>
                  <div><kbd>Ctrl/⌘ + Shift + T</kbd><span>任务清单</span></div>
                  <div><kbd>Ctrl/⌘ + Shift + P</kbd><span>切换预览</span></div>
                </div>
              </div>
            </section>

            <section v-else class="settings-section">
              <div class="section-header">
                <div>
                  <h3>AI</h3>
                  <p>当前先保存 Provider、接口地址和模型配置，供后续 AI 功能接入使用。</p>
                </div>
              </div>

              <div class="settings-card form-card">
                <label class="toggle-row">
                  <div>
                    <span class="field-label">启用 AI 功能</span>
                    <span class="field-hint">关闭后保留配置，但前端不展示 AI 相关能力。</span>
                  </div>
                  <input v-model="settings.ai.enabled" type="checkbox" @change="persistAiSettings" />
                </label>

                <label class="field-row">
                  <span class="field-label">Provider</span>
                  <select v-model="settings.ai.provider" @change="handleProviderChange">
                    <option value="openai">OpenAI</option>
                    <option value="deepseek">DeepSeek</option>
                    <option value="openai-compatible">OpenAI Compatible</option>
                    <option value="custom">Custom</option>
                  </select>
                </label>

                <label class="field-row">
                  <span class="field-label">Base URL</span>
                  <input v-model.trim="settings.ai.baseUrl" type="url" :placeholder="baseUrlPlaceholder" @change="persistAiSettings" />
                </label>

                <div class="field-row field-row-top">
                  <span class="field-label">API Key</span>
                  <div class="field-input-stack">
                    <input
                      v-model="apiKeyInput"
                      type="text"
                      placeholder="输入新 API Key"
                      autocomplete="new-password"
                      autocapitalize="off"
                      autocorrect="off"
                      spellcheck="false"
                      @input="handleApiKeyInput"
                      @change="saveApiKey"
                    />
                  </div>
                </div>
                <p class="field-hint ai-warning">
                  输入新 Key 后失焦会自动保存到后端；前端不会回读明文。
                </p>

                <label class="field-row">
                  <span class="field-label">模型</span>
                  <input v-model.trim="settings.ai.model" type="text" :placeholder="modelPlaceholder" @change="persistAiSettings" />
                </label>

                <label class="field-row field-row-top">
                  <span class="field-label">系统提示词</span>
                  <textarea
                    v-model="settings.ai.systemPrompt"
                    class="system-prompt-input"
                    placeholder="默认留空；只有填写后才会作为 system 提示词发送给模型。"
                    @change="persistAiSettings"
                  />
                </label>

                <p class="field-hint ai-hint">{{ providerHint }}</p>
              </div>
            </section>
          </div>
        </div>
      </section>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useImportExport } from '../composables/useImportExport';
import { saveAiSettings, saveSettings, settings } from '../store/settings';

type TabId = 'import-export' | 'editor' | 'shortcuts' | 'ai';

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
  notesImported: [];
}>();

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'import-export', label: '导入导出' },
  { id: 'editor', label: '编辑器' },
  { id: 'shortcuts', label: '快捷键说明' },
  { id: 'ai', label: 'AI' },
];

const activeTab = ref<TabId>('import-export');
const apiKeyInput = ref('');
const isSavingAi = ref(false);

const providerDefaults = {
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-chat',
  },
  'openai-compatible': {
    baseUrl: '',
    model: '',
  },
  custom: {
    baseUrl: '',
    model: '',
  },
} as const;

const {
  isImporting,
  isCleaningOrphans,
  flomoFileInput,
  zipFileInput,
  exportZip,
  exportFlomo,
  triggerZipImport,
  handleZipImport,
  triggerFlomoImport,
  handleFlomoImport,
  cleanupOrphanImages,
} = useImportExport(() => {
  emit('notesImported');
});

void flomoFileInput;
void zipFileInput;

watch(activeTab, (tab) => {
  if (tab === 'import-export') {
    settings.importExport.lastSection = 'export';
    saveSettings();
  }
});

watch(
  () => settings.ai.maskedApiKey,
  (maskedValue) => {
    apiKeyInput.value = maskedValue || '';
  },
  { immediate: true },
);

const persistSettings = () => {
  saveSettings();
};

const persistAiSettings = async () => {
  try {
    isSavingAi.value = true;
    await saveAiSettings();
  } catch (error) {
    console.error('Failed to save AI settings.', error);
    alert('保存 AI 配置失败');
  } finally {
    isSavingAi.value = false;
  }
};

const baseUrlPlaceholder = computed(() => {
  return providerDefaults[settings.ai.provider].baseUrl || 'https://your-openai-compatible-host';
});

const modelPlaceholder = computed(() => {
  return providerDefaults[settings.ai.provider].model || '输入模型名';
});

const providerHint = computed(() => {
  if (settings.ai.provider === 'deepseek') {
    return 'DeepSeek 兼容 OpenAI API。推荐 Base URL 使用 https://api.deepseek.com，常用模型可填 deepseek-chat 或 deepseek-reasoner。';
  }
  if (settings.ai.provider === 'openai') {
    return 'OpenAI 默认地址为 https://api.openai.com/v1，可按需填写具体模型名。';
  }
  if (settings.ai.provider === 'openai-compatible') {
    return '填写兼容 OpenAI API 的服务地址、密钥和模型名。';
  }
  return '自定义 Provider 需要你手动填写完整的 Base URL、API Key 和模型名。';
});

const normalizeDelay = () => {
  const next = Number.isFinite(settings.editor.autoSaveDelaySec) ? settings.editor.autoSaveDelaySec : 3;
  settings.editor.autoSaveDelaySec = Math.min(30, Math.max(1, Math.round(next)));
  saveSettings();
};

const handleProviderChange = () => {
  const defaults = providerDefaults[settings.ai.provider];
  settings.ai.baseUrl = defaults.baseUrl;

  if (!settings.ai.model.trim() || Object.values(providerDefaults).some((value) => value.model === settings.ai.model.trim())) {
    settings.ai.model = defaults.model;
  }

  void persistAiSettings();
};

const saveApiKey = async () => {
  const nextKey = apiKeyInput.value.trim();
  if (!nextKey || nextKey === settings.ai.maskedApiKey) return;

  try {
    isSavingAi.value = true;
    await saveAiSettings({ apiKey: nextKey });
    apiKeyInput.value = settings.ai.maskedApiKey;
  } catch (error) {
    console.error('Failed to save AI API key.', error);
    alert('保存 API Key 失败');
  } finally {
    isSavingAi.value = false;
  }
};

const handleApiKeyInput = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (apiKeyInput.value === settings.ai.maskedApiKey) {
    apiKeyInput.value = '';
    target.value = '';
  }
};
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  background: var(--bg-main);
  z-index: 200;
  display: flex;
  justify-content: center;
}

.settings-panel {
  width: min(980px, calc(100vw - 120px));
  height: 100vh;
  background: var(--bg-main);
  display: flex;
  flex-direction: column;
}

.settings-header {
  padding: 32px 0 24px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
}

.settings-header h2,
.section-header h3,
.settings-card h4 {
  margin: 0;
  color: var(--text-primary, #18181b);
}

.settings-header p,
.section-header p,
.settings-card p,
.field-hint {
  margin: 6px 0 0;
  color: var(--text-secondary, #71717a);
  font-size: 0.92rem;
  line-height: 1.5;
}

.close-btn,
.primary-btn,
.secondary-btn {
  border: none;
  border-radius: var(--radius-md, 0.5rem);
  cursor: pointer;
  transition: all 0.2s ease;
}

.close-btn,
.tab-btn,
.secondary-btn {
  background: transparent;
  color: var(--text-primary, #18181b);
}

.close-btn {
  align-self: flex-start;
  padding: 6px;
}

.close-btn:hover {
  background: var(--bg-card);
}

.settings-body {
  min-height: 0;
  display: flex;
  flex: 1;
}

.tab-btn {
  width: 100%;
  text-align: left;
  padding: 8px 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-md, 0.5rem);
  background: transparent;
  color: var(--text-secondary, #888888);
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  font-size: 0.95rem;
  font-weight: 500;
  line-height: 1.45;
}

.tab-btn.active {
  background: var(--accent-color, #31d279);
  color: white;
  font-weight: 600;
}

.tab-btn:hover {
  background: var(--border-color, #eaeaea);
  color: var(--text-primary, #333333);
}

.tab-label {
  display: inline-block;
}

.settings-nav {
  width: 220px;
  flex-shrink: 0;
  padding: 0 20px 24px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.settings-content {
  padding: 0 0 32px 20px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
  border-left: 1px solid var(--border-color, #eaeaea);
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.section-header,
.toggle-row,
.field-row,
.shortcut-list div,
.button-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.section-badge {
  background: var(--accent-sidebar-bg, #e6f7ef);
  color: var(--accent-color, #31d279);
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
  align-self: flex-start;
}

.card-grid {
  display: grid;
  gap: 16px;
}

.card-grid.two-up {
  grid-template-columns: repeat(2, minmax(0, 1fr));
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

.field-row-top {
  align-items: flex-start;
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

.field-input-stack {
  min-width: 220px;
  display: flex;
  flex-direction: column;
  gap: 10px;
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

.system-prompt-input {
  width: min(460px, 100%);
  min-height: 110px;
  border: 1px solid var(--border-color, #d4d4d8);
  background: var(--bg-card, #fff);
  color: var(--text-primary, #18181b);
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
  line-height: 1.6;
  resize: vertical;
}

.system-prompt-input:focus {
  outline: 2px solid color-mix(in srgb, var(--accent-color, #31d279) 20%, transparent);
  border-color: var(--accent-color, #31d279);
}

.ai-hint {
  margin-top: -4px;
}

.ai-warning {
  margin-top: -10px;
  color: #b45309;
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

.button-row {
  margin-top: 16px;
  justify-content: flex-start;
  flex-wrap: wrap;
}

.primary-btn,
.secondary-btn {
  padding: 10px 14px;
  font-weight: 600;
}

.primary-btn {
  background: var(--accent-color, #31d279);
  color: #fff;
}

.secondary-btn {
  background: var(--bg-main, #f4f5f7);
}

.shortcut-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 14px;
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
  .settings-panel {
    width: 100vw;
  }

  .settings-header,
  .settings-content {
    padding-left: 18px;
    padding-right: 18px;
  }

  .settings-body {
    flex-direction: column;
  }

  .settings-nav {
    width: auto;
    border-right: none;
    border-bottom: 1px solid var(--border-color, #e4e4e7);
    padding: 0 0 12px;
  }

  .settings-content {
    border-left: none;
    padding: 18px 0 24px;
  }

  .card-grid.two-up {
    grid-template-columns: 1fr;
  }

  .toggle-row,
  .field-row,
  .shortcut-list div {
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
