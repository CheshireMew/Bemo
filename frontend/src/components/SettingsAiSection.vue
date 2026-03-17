<template>
  <section class="settings-section">
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
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { saveAiSettings } from '../services/aiSettings';
import { settings } from '../store/settings';

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

watch(
  () => settings.ai.maskedApiKey,
  (maskedValue) => {
    apiKeyInput.value = maskedValue || '';
  },
  { immediate: true },
);

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

.field-hint,
.section-header p {
  margin: 6px 0 0;
  color: var(--text-secondary, #71717a);
  font-size: 0.92rem;
  line-height: 1.5;
}

.section-header h3 {
  margin: 0;
  color: var(--text-primary, #18181b);
}

.field-row input,
.field-row select {
  min-width: 220px;
  border: 1px solid var(--border-color, #d4d4d8);
  background: var(--bg-card, #fff);
  color: var(--text-primary, #18181b);
  border-radius: 10px;
  padding: 10px 12px;
  font: inherit;
}

.field-row input:focus,
.field-row select:focus,
.system-prompt-input:focus {
  outline: 2px solid color-mix(in srgb, var(--accent-color, #31d279) 20%, transparent);
  border-color: var(--accent-color, #31d279);
}

.field-input-stack {
  min-width: 220px;
  display: flex;
  flex-direction: column;
  gap: 10px;
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

.ai-hint {
  margin-top: -4px;
}

.ai-warning {
  margin-top: -10px;
  color: #b45309;
}

@media (max-width: 768px) {
  .toggle-row,
  .field-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .field-row input,
  .field-row select,
  .field-input-stack {
    width: 100%;
  }
}
</style>
