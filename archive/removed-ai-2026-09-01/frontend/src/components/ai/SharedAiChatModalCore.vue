<template>
  <teleport to="body">
    <div v-if="isAiChatOpen" class="ai-overlay" :class="overlayClass" @click.self="closeAiChat">
      <section v-modal-focus="closeAiChat" class="ai-modal" :class="modalClass" role="dialog" aria-modal="true" aria-label="AI 对话">
        <header class="ai-modal-header">
          <div>
            <h2>AI 对话</h2>
            <p>
              {{ activeConversation?.title || '未选择对话' }}
              <span v-if="aiContextNote"> · 当前笔记 {{ aiContextLabel }}</span>
              <span v-if="selectedTag"> · 标签 #{{ selectedTag }}</span>
              <span v-if="selectedDate"> · 日期 {{ selectedDate.toLocaleDateString() }}</span>
              · 共 {{ contextNotes.length }} 条
            </p>
          </div>
          <div class="ai-header-actions">
            <button v-if="useCompactLayout" class="close-btn" type="button" :aria-expanded="historyOpen" aria-controls="ai-conversation-history" @click="historyOpen = !historyOpen">历史</button>
            <button class="close-btn" type="button" @click="closeAiChat">关闭</button>
          </div>
        </header>

        <div class="ai-shell">
          <aside v-show="!useCompactLayout || historyOpen" id="ai-conversation-history" class="conversation-sidebar" aria-label="对话历史">
            <button class="new-chat-btn" type="button" @click="createBlankConversation" :disabled="isLoadingList">
              新对话
            </button>
            <p class="local-history-note">对话历史仅保存在当前设备。</p>
            <div ref="conversationListRef" class="conversation-list">
              <div
                v-for="conversation in conversations"
                :key="conversation.id"
                :ref="(element) => setConversationItemRef(conversation.id, element)"
                class="conversation-card"
                :class="{ active: activeConversationId === conversation.id }"
              >
                <div v-if="editingConversationId === conversation.id" class="conversation-item">
                    <input
                      ref="editingTitleInput"
                      v-model.trim="editingTitleDraft"
                      class="conversation-title-input"
                      type="text"
                      aria-label="对话标题"
                      @click.stop
                      @keydown.enter.prevent="submitConversationRename(conversation)"
                      @keydown.esc.prevent="cancelConversationRename"
                      @blur="submitConversationRename(conversation)"
                    />
                </div>
                <button v-else class="conversation-item" type="button" :aria-current="activeConversationId === conversation.id ? 'true' : undefined" @click="selectHistoryConversation(conversation.id)">
                  <span class="conversation-title">{{ conversation.title }}</span>
                  <span class="conversation-meta">{{ formatContextMode(conversation.context_mode) }}</span>
                </button>
                <div class="conversation-actions">
                  <button
                    class="icon-btn"
                    type="button"
                    title="重命名"
                    aria-label="重命名"
                    @click.stop="startConversationRename(conversation)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M4 20h4l10-10-4-4L4 16v4Zm3-1.5H5.5V17l8.4-8.4 1.5 1.5L7 18.5ZM18.7 9.3l-4-4 1.2-1.2a1 1 0 0 1 1.4 0l2.6 2.6a1 1 0 0 1 0 1.4l-1.2 1.2Z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                  <button
                    class="icon-btn danger"
                    type="button"
                    title="删除"
                    aria-label="删除"
                    @click.stop="deleteConversation(conversation)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9ZM7 9h2v8H7V9Zm1 11a2 2 0 0 1-2-2V8h12v10a2 2 0 0 1-2 2H8Z"
                        fill="currentColor"
                      />
                    </svg>
                  </button>
                </div>
              </div>
              <p v-if="!isLoadingList && conversations.length === 0" class="conversation-empty">还没有历史对话</p>
            </div>
          </aside>

          <div class="ai-main">
            <div v-if="aiConfigurationIssue" class="configuration-notice" role="alert">
              <div>
                <strong>需要完成 AI 配置</strong>
                <span>{{ aiConfigurationIssue }}</span>
              </div>
              <button type="button" @click="openAiSettings">打开 AI 设置</button>
            </div>
            <div ref="chatBodyRef" class="ai-modal-body">
              <div class="range-bar">
                <button
                  v-for="option in rangeOptions"
                  :key="option.value"
                  class="range-chip"
                  :class="{ active: selectedRange === option.value }"
                  type="button"
                  :aria-pressed="selectedRange === option.value"
                  @click="toggleRange(option.value)"
                >
                  {{ option.label }}
                </button>
              </div>

              <div v-if="messages.length === 0" class="empty-state">
                可以直接问：
                “这些笔记的共同主题是什么？”
                “帮我提炼可执行事项”
                “我最近反复在想什么？”
              </div>

              <div v-for="(message, index) in messages" :key="index" class="chat-row" :class="message.role">
                <div v-if="message.role === 'user'" class="chat-bubble">{{ message.content }}</div>
                <div v-else class="chat-bubble assistant-markdown markdown-body" v-html="renderedMessages[index] || ''"></div>
              </div>

              <div v-if="isLoading" class="chat-row assistant">
                <div class="chat-bubble loading">AI 正在思考...</div>
              </div>
            </div>

            <footer class="ai-modal-footer">
              <textarea
                v-model="draft"
                class="chat-input"
                aria-label="AI 对话消息"
                placeholder="输入你想问的问题..."
                :disabled="Boolean(aiConfigurationIssue)"
                @keydown="handleKeydown"
              />
              <div class="footer-actions">
                <div class="prompt-presets">
                  <button class="secondary-btn presets-btn" type="button" :aria-expanded="isPresetPanelOpen" aria-controls="ai-preset-panel" @click="togglePresetPanel">
                    常用提示词
                  </button>
                  <div v-if="isPresetPanelOpen" id="ai-preset-panel" class="preset-panel">
                    <div class="preset-panel-header">
                      <span>常用提示词</span>
                      <button v-if="editingPresetId" class="link-btn" type="button" @click="resetPresetEditor">取消编辑</button>
                    </div>
                    <div class="preset-editor">
                      <textarea
                        v-model="presetDraft"
                        class="preset-input"
                        aria-label="常用提示词内容"
                        rows="3"
                        placeholder="输入常用提示词"
                      />
                      <button class="secondary-btn preset-save-btn" type="button" :disabled="!presetDraft.trim()" @click="savePreset">
                        {{ editingPresetId ? '保存修改' : '保存提示词' }}
                      </button>
                    </div>
                    <p v-if="promptPresets.length === 0" class="preset-empty">还没有保存的提示词</p>
                    <div v-else class="preset-list">
                      <div v-for="preset in promptPresets" :key="preset.id" class="preset-item">
                        <button class="preset-use-btn" type="button" @click="usePromptPreset(preset.content)">
                          {{ preset.content }}
                        </button>
                        <div class="preset-item-actions">
                          <button class="preset-edit-btn" type="button" aria-label="编辑提示词" @click="startEditPreset(preset)">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                d="M4 20h4l10-10-4-4L4 16v4Zm3-1.5H5.5V17l8.4-8.4 1.5 1.5L7 18.5ZM18.7 9.3l-4-4 1.2-1.2a1 1 0 0 1 1.4 0l2.6 2.6a1 1 0 0 1 0 1.4l-1.2 1.2Z"
                                fill="currentColor"
                              />
                            </svg>
                          </button>
                          <button class="preset-delete-btn" type="button" aria-label="删除提示词" @click="removePrompt(preset.id)">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path
                                d="M9 3h6l1 2h4v2H4V5h4l1-2Zm1 6h2v8h-2V9Zm4 0h2v8h-2V9ZM7 9h2v8H7V9Zm1 11a2 2 0 0 1-2-2V8h12v10a2 2 0 0 1-2 2H8Z"
                                fill="currentColor"
                              />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="footer-action-buttons">
                  <button class="secondary-btn footer-new-chat" type="button" @click="createBlankConversation" :disabled="isLoading">
                    新对话
                  </button>
                  <button class="primary-btn" type="button" @click="sendMessage" :disabled="isLoading || !draft.trim() || Boolean(aiConfigurationIssue)">
                    发送
                  </button>
                </div>
              </div>
              <p v-if="errorMessage" class="error-text" role="alert">{{ errorMessage }}</p>
            </footer>
          </div>
        </div>
      </section>
    </div>
  </teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { vModalFocus } from '../../directives/modalFocus';
import { displayedNotes, notes, selectedDate, selectedTag } from '../../store/notes';
import { aiChatNoteId, aiChatNoteLabel, closeAiChat, isAiChatOpen } from '../../store/ui';
import {
  type LocalMessage,
  type TimeRange,
  useAiConversations,
} from '../../composables/useAiConversations';
import { useAiChat } from '../../composables/useAiChat';
import { useAiContextSelection } from '../../composables/useAiContextSelection';
import { useConversationRename } from '../../composables/useConversationRename';
import { useMobileBackHandler } from '../../composables/useMobileBackHandler';
import { useAiPromptPresets } from '../../composables/useAiPromptPresets';
import { useScrollLock } from '../../composables/useScrollLock';
import { useViewport } from '../../composables/useViewport';
import { getAiConfigurationIssue } from '../../domain/ai/aiClient';
import { requestSettingsTab } from '../../store/ui';
import { renderMarkdownToHtml } from '../../utils/markdownRenderer';

const props = withDefaults(defineProps<{
  shell?: 'web-desktop' | 'mobile';
}>(), {
  shell: 'web-desktop',
});

const { isMobile: isNarrowViewport } = useViewport();
const useCompactLayout = computed(() => props.shell === 'mobile' || isNarrowViewport.value);
const historyOpen = ref(false);
const chatBodyRef = ref<HTMLElement | null>(null);

const overlayClass = computed(() => (
  useCompactLayout.value
    ? 'ai-overlay-mobile'
    : 'ai-overlay-web-desktop'
));

const modalClass = computed(() => (
  useCompactLayout.value
    ? 'ai-modal-mobile'
    : 'ai-modal-web-desktop'
));

const messages = ref<LocalMessage[]>([]);
const renderedMessages = ref<string[]>([]);
const draft = ref('');
const errorMessage = ref('');
const selectedRange = ref<TimeRange | null>(null);
const aiConfigurationIssue = computed(() => getAiConfigurationIssue());
let messageRenderGeneration = 0;

watch(messages, async (nextMessages) => {
  const generation = ++messageRenderGeneration;
  const rendered = await Promise.all(nextMessages.map((message) => (
    message.role === 'assistant' ? renderMarkdownToHtml(message.content) : Promise.resolve('')
  )));
  if (generation === messageRenderGeneration) renderedMessages.value = rendered;
  await nextTick();
  if (generation === messageRenderGeneration && chatBodyRef.value) chatBodyRef.value.scrollTop = chatBodyRef.value.scrollHeight;
}, { deep: true, immediate: true });

const openAiSettings = () => {
  closeAiChat();
  requestSettingsTab('ai');
};
const {
  editingPresetId,
  handleClosed,
  isPresetPanelOpen,
  presetDraft,
  promptPresets,
  removePrompt,
  resetPresetEditor,
  savePreset,
  startEditPreset,
  togglePresetPanel,
  usePromptPreset,
} = useAiPromptPresets({
  draft,
});
const {
  activeConversation,
  activeConversationId,
  appendConversationMessages,
  conversationListRef,
  conversations,
  createConversation,
  deleteConversation,
  isLoadingList,
  renameConversation,
  selectConversation,
  setConversationItemRef,
  syncConversationSummary,
  updateConversationContext,
} = useAiConversations({
  messages,
  selectedRange,
  errorMessage,
  onClosed: handleClosed,
});
void conversationListRef;

const createNoteConversation = async () => {
  if (aiConfigurationIssue.value) return;
  await createConversation({
    title: `笔记对话 · ${aiContextLabel.value}`,
    contextMode: null,
  });
};

const createBlankConversation = async () => {
  await createConversation();
  historyOpen.value = false;
};
const selectHistoryConversation = async (id: string) => {
  await selectConversation(id);
  historyOpen.value = false;
};
watch(isAiChatOpen, open => { if (!open) historyOpen.value = false; });

const {
  aiContextLabel,
  aiContextNote,
  contextNotes,
  rangeOptions,
} = useAiContextSelection({
  selectedRange,
  notes,
  displayedNotes,
  aiChatNoteId,
  aiChatNoteLabel,
  isAiChatOpen,
  createNoteConversation,
  clearMessages: () => {
    messages.value = [];
  },
  clearError: () => {
    errorMessage.value = '';
  },
});

const {
  cancelConversationRename,
  editingConversationId,
  editingTitleDraft,
  editingTitleInput,
  startConversationRename,
  submitConversationRename,
} = useConversationRename({
  activeConversationId,
  renameConversation,
});
void editingTitleInput;

useMobileBackHandler({
  id: 'ai-prompt-presets',
  priority: 720,
  enabled: computed(() => props.shell === 'mobile' && isPresetPanelOpen.value),
  dismiss: () => {
    togglePresetPanel();
  },
});

useMobileBackHandler({
  id: 'ai-conversation-rename',
  priority: 700,
  enabled: computed(() => props.shell === 'mobile' && Boolean(editingConversationId.value)),
  dismiss: () => {
    cancelConversationRename();
  },
});

const formatContextMode = (value: TimeRange | null | undefined) => {
  const labelMap: Record<TimeRange, string> = {
    filtered: '已筛选笔记',
    'all-notes': '全部笔记',
    day: '过去一天',
    week: '过去一周',
    month: '过去一月',
    year: '过去一年',
  };
  if (!value) return '纯对话';
  return labelMap[value];
};

const toggleRange = async (value: TimeRange) => {
  selectedRange.value = selectedRange.value === value ? null : value;
  await updateConversationContext(selectedRange.value);
  if (activeConversationId.value) {
    await selectConversation(activeConversationId.value);
  }
};

const {
  handleKeydown,
  isLoading,
  sendMessage,
} = useAiChat({
  draft,
  messages,
  errorMessage,
  selectedRange,
  activeConversationId,
  activeConversation,
  contextNotes,
  ensureConversation: createConversation,
  syncConversationSummary,
  appendConversationMessages,
});

useScrollLock(isAiChatOpen);
</script>

<style scoped>
.ai-overlay {
  position: fixed;
  inset: 0;
  background: rgba(24, 24, 27, 0.36);
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px max(24px, var(--safe-right)) max(24px, var(--safe-bottom)) max(24px, var(--safe-left));
}

.ai-modal {
  width: min(980px, 100%);
  height: min(90dvh, 980px);
  background: var(--bg-card, #fff);
  border: 1px solid var(--border-color, #e4e4e7);
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.ai-shell {
  display: flex;
  min-height: 0;
  flex: 1;
}

.conversation-sidebar {
  width: 260px;
  flex-shrink: 0;
  min-height: 0;
  border-right: 1px solid var(--border-color, #e4e4e7);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: linear-gradient(180deg, var(--bg-card, #fff) 0%, var(--bg-main, #f8fafc) 100%);
}

.new-chat-btn {
  border: none;
  border-radius: 10px;
  background: var(--accent-color);
  color: var(--accent-foreground, white);
  font-weight: 600;
  padding: 10px 12px;
  cursor: pointer;
}

.local-history-note {
  margin: -2px 2px 0;
  color: var(--text-secondary);
  font-size: 0.72rem;
  line-height: 1.4;
}

.conversation-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  min-height: 0;
  padding-right: 2px;
}

.conversation-card {
  position: relative;
  border: 1px solid var(--border-color, #e4e4e7);
  background: var(--bg-card, #fff);
  border-radius: 14px;
  min-height: 68px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease, transform 0.2s ease;
}

.conversation-card.active {
  border-color: color-mix(in srgb, var(--accent-color) 70%, white);
  background: color-mix(in srgb, var(--accent-color) 12%, var(--bg-card));
  box-shadow: 0 10px 24px rgba(16, 185, 129, 0.14);
  transform: translateY(-1px);
}

.conversation-card.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 4px;
  border-radius: 999px;
  background: var(--accent-color);
}

.conversation-item {
  width: 100%;
  border: none;
  background: transparent;
  border-radius: 14px;
  padding: 10px 82px 10px 14px;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.conversation-title {
  color: var(--text-primary);
  font-size: 0.88rem;
  font-weight: 600;
  line-height: 1.35;
  padding-right: 4px;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.conversation-title-input {
  width: 100%;
  border: 1px solid color-mix(in srgb, var(--accent-color) 28%, var(--border-color, #d4d4d8));
  background: var(--bg-card, #fff);
  color: var(--text-primary);
  border-radius: 10px;
  padding: 8px 10px;
  font: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  line-height: 1.35;
  outline: none;
}

.conversation-meta,
.conversation-empty {
  color: var(--text-secondary);
  font-size: 0.72rem;
}

.conversation-actions {
  position: absolute;
  top: 10px;
  right: 10px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.icon-btn {
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: var(--bg-card);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: background 0.2s ease, color 0.2s ease, border-color 0.2s ease;
}

.icon-btn svg {
  width: 15px;
  height: 15px;
}

.icon-btn:hover {
  color: var(--text-primary);
  background: var(--bg-main, #f4f5f7);
  border-color: var(--border-color, #e4e4e7);
}

.icon-btn.danger:hover {
  color: #b91c1c;
  background: rgba(185, 28, 28, 0.08);
  border-color: rgba(185, 28, 28, 0.12);
}

.ai-main {
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  flex: 1;
}

.configuration-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 18px;
  border-bottom: 1px solid color-mix(in srgb, var(--info-color) 34%, var(--border-color));
  background: color-mix(in srgb, var(--info-color) 10%, var(--bg-card));
  color: var(--info-text);
}

.configuration-notice div {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.configuration-notice span {
  font-size: 0.8rem;
  line-height: 1.45;
}

.configuration-notice button {
  flex-shrink: 0;
  border: 1px solid currentColor;
  border-radius: 9px;
  background: transparent;
  color: inherit;
  padding: 7px 10px;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.ai-modal-header {
  padding: 20px 22px 16px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid var(--border-color, #e4e4e7);
  flex-shrink: 0;
}
.ai-modal-header > div:first-child { min-width: 0; }
.ai-header-actions { display: flex; gap: 6px; align-items: flex-start; flex-shrink: 0; }

.ai-modal-header h2,
.ai-modal-header p {
  margin: 0;
}

.ai-modal-header h2 {
  font-size: 1.05rem;
  color: var(--text-primary);
}

.ai-modal-header p {
  margin-top: 6px;
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.close-btn,
.primary-btn,
.secondary-btn {
  border: none;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.close-btn,
.secondary-btn {
  background: var(--bg-main, #f4f5f7);
  color: var(--text-primary);
}

.close-btn {
  padding: 8px 12px;
}

.ai-modal-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 20px 22px;
  background: linear-gradient(180deg, var(--bg-card, #fff) 0%, var(--bg-main, #f8fafc) 100%);
}

.range-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
}

.range-chip {
  border: 1px solid var(--border-color, #d4d4d8);
  background: var(--bg-card, #fff);
  color: var(--text-secondary);
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 0.78rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.range-chip:hover {
  border-color: var(--accent-color);
  color: var(--text-primary);
}

.range-chip.active {
  background: var(--accent-color);
  border-color: var(--accent-color);
  color: var(--accent-foreground, white);
  font-weight: 600;
}

.empty-state {
  font-size: 0.88rem;
  color: var(--text-secondary);
  line-height: 1.7;
}

.chat-row {
  display: flex;
  margin-bottom: 12px;
}

.chat-row.user {
  justify-content: flex-end;
}

.chat-bubble {
  max-width: min(85%, 560px);
  padding: 12px 14px;
  border-radius: 16px;
  white-space: pre-wrap;
  line-height: 1.7;
  font-size: 0.9rem;
}

.chat-row.user .chat-bubble {
  background: var(--accent-color);
  color: var(--accent-foreground, white);
  border-bottom-right-radius: 6px;
}

.assistant-markdown {
  white-space: normal;
  overflow-wrap: anywhere;
}

.assistant-markdown :deep(> :first-child) {
  margin-top: 0;
}

.assistant-markdown :deep(> :last-child) {
  margin-bottom: 0;
}

.chat-row.assistant .chat-bubble {
  background: var(--bg-card, #fff);
  color: var(--text-primary);
  border: 1px solid var(--border-color, #e4e4e7);
  border-bottom-left-radius: 6px;
}

.chat-bubble.loading {
  color: var(--text-secondary);
}

.ai-modal-footer {
  border-top: 1px solid var(--border-color, #e4e4e7);
  padding: 16px 22px 18px;
  background: var(--bg-card, #fff);
  flex-shrink: 0;
}

.chat-input {
  width: 100%;
  min-height: 92px;
  max-height: 180px;
  resize: vertical;
  border: 1px solid var(--border-color, #d4d4d8);
  border-radius: 14px;
  padding: 12px 14px;
  font: inherit;
  color: var(--text-primary);
  background: var(--bg-main, #fafafa);
  outline: none;
}

.chat-input:focus {
  border-color: var(--accent-color);
}

.footer-actions {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 12px;
  margin-top: 12px;
}

.prompt-presets {
  position: relative;
}

.presets-btn {
  min-width: 110px;
}

.preset-panel {
  position: absolute;
  left: 0;
  bottom: calc(100% + 12px);
  width: 320px;
  max-height: 280px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color, #e4e4e7);
  border-radius: 16px;
  background: var(--bg-card, #fff);
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.14);
  z-index: 2;
}

.preset-panel-header {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-color, #e4e4e7);
  font-size: 0.84rem;
  font-weight: 600;
  color: var(--text-primary);
}

.link-btn {
  border: none;
  background: transparent;
  color: var(--accent-color);
  font: inherit;
  cursor: pointer;
  padding: 0;
}

.link-btn:disabled {
  color: var(--text-secondary);
  cursor: default;
}

.preset-empty {
  margin: 0;
  padding: 16px 14px;
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.preset-editor {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-color, #e4e4e7);
}

.preset-input {
  width: 100%;
  resize: vertical;
  min-height: 82px;
  border: 1px solid var(--border-color, #d4d4d8);
  border-radius: 12px;
  background: var(--bg-main, #fafafa);
  color: var(--text-primary);
  font: inherit;
  padding: 10px 12px;
  outline: none;
}

.preset-input:focus {
  border-color: var(--accent-color);
}

.preset-save-btn {
  margin-top: 10px;
  width: 100%;
}

.preset-list {
  overflow-y: auto;
  padding: 8px;
}

.preset-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.preset-item + .preset-item {
  margin-top: 8px;
}

.preset-use-btn {
  flex: 1;
  border: 1px solid transparent;
  border-radius: 12px;
  background: var(--bg-main, #f8fafc);
  color: var(--text-primary);
  text-align: left;
  padding: 10px 12px;
  line-height: 1.5;
  cursor: pointer;
}

.preset-use-btn:hover {
  border-color: var(--accent-color);
}

.preset-delete-btn {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.preset-item-actions {
  display: flex;
  gap: 4px;
}

.preset-edit-btn {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 10px;
  background: transparent;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.preset-edit-btn svg,
.preset-delete-btn svg {
  width: 15px;
  height: 15px;
}

.preset-edit-btn:hover {
  background: var(--bg-main, #f4f5f7);
  color: var(--text-primary);
}

.preset-delete-btn:hover {
  background: rgba(185, 28, 28, 0.08);
  color: #b91c1c;
}

.footer-action-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.primary-btn,
.secondary-btn {
  padding: 9px 14px;
  font-weight: 600;
  white-space: nowrap;
}

.primary-btn {
  background: var(--accent-color);
  color: var(--accent-foreground, #fff);
}

.footer-new-chat {
  display: none;
}

.error-text {
  margin: 10px 0 0;
  font-size: 0.82rem;
  color: var(--danger-text);
}

.ai-modal-mobile {
  width: 100%;
  height: 100dvh;
  border-radius: 0;
  border: none;
}

.ai-overlay-mobile {
  padding: 0;
  align-items: flex-end;
}

.ai-modal-mobile .ai-shell {
  flex-direction: column;
}

.ai-modal-mobile .conversation-sidebar {
  width: 100%;
  border-right: none;
  border-bottom: 1px solid var(--border-color, #e4e4e7);
  padding: 12px 16px;
  max-height: 180px;
  background: color-mix(in srgb, var(--bg-card, #fff) 94%, transparent);
}

.ai-modal-mobile .new-chat-btn {
  align-self: flex-start;
  padding: 8px 12px;
  font-size: 0.84rem;
}

.ai-modal-mobile .conversation-list {
  flex-direction: row;
  overflow-x: auto;
  overflow-y: hidden;
  gap: 10px;
  padding-right: 0;
}

.ai-modal-mobile .conversation-card {
  min-width: 220px;
  flex-shrink: 0;
}

.ai-modal-mobile .ai-modal-header,
.ai-modal-mobile .ai-modal-body,
.ai-modal-mobile .ai-modal-footer {
  padding-left: 16px;
  padding-right: 16px;
}

.ai-modal-mobile .footer-actions {
  position: relative;
  align-items: center;
  flex-wrap: wrap;
}

.ai-modal-mobile .ai-modal-header {
  padding-top: calc(14px + var(--safe-top));
}

.ai-modal-mobile .ai-modal-footer {
  padding-bottom: calc(16px + var(--safe-bottom));
}

.ai-modal-mobile .ai-modal-body {
  padding-top: 16px;
}

.ai-modal-mobile .preset-panel,
.ai-modal-mobile .presets-btn {
  width: 100%;
}
.ai-modal-mobile .prompt-presets { min-width: 0; position: static; }
.ai-modal-mobile .footer-action-buttons { margin-left: auto; }
.ai-modal-mobile .chat-input { min-height: 68px; max-height: 100px; }
.ai-modal-mobile .ai-modal-footer { padding-top: 10px; }
.ai-modal-mobile .ai-modal-header p { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

.ai-modal-mobile .preset-panel {
  left: 0;
  right: 0;
  bottom: calc(100% + 10px);
  width: auto;
  max-height: min(46dvh, 360px);
}

.ai-modal-mobile .chat-bubble {
  max-width: 92%;
}

.ai-modal-mobile .footer-action-buttons {
  justify-content: stretch;
}

.ai-modal-mobile .footer-action-buttons button {
  flex: 1;
}

.ai-modal-mobile .footer-new-chat {
  display: inline-flex;
  justify-content: center;
}

.ai-modal-mobile .configuration-notice {
  align-items: flex-start;
  padding-left: 16px;
  padding-right: 16px;
}

.ai-modal-mobile .configuration-notice strong { font-size: 0.85rem; }
.primary-btn:disabled, .secondary-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.chat-input:disabled { cursor: not-allowed; }

@media (max-width: 420px) {
  .ai-modal-mobile .configuration-notice {
    gap: 8px;
  }

  .ai-modal-mobile .configuration-notice button {
    white-space: normal;
    max-width: 90px;
  }
}
</style>
