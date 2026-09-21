<template>
  <div ref="editorCardRef" class="editor-card" :class="shellClass">
    <div class="editor-body">
      <div
        v-show="showPreview"
        class="editor-preview markdown-body"
        :data-placeholder="placeholderText"
        :contenteditable="!isSaving"
        role="textbox"
        aria-multiline="true"
        :aria-label="`${placeholderText}，富文本编辑模式`"
        :aria-invalid="Boolean(editorErrorMessage)"
        :aria-describedby="editorErrorMessage ? editorErrorId : undefined"
        @input="handlePreviewInput"
        @compositionstart="isComposing = true"
        @compositionend="handleCompositionEnd"
        @paste="isSaving ? $event.preventDefault() : handlePaste($event)"
        ref="previewRef"
        @keydown="!isSaving && handleKeydown($event)"
      ></div>
      <textarea
        v-show="!showPreview"
        ref="textareaRef"
        v-model="content"
        :readonly="isSaving"
        class="editor-input"
        :placeholder="placeholderText"
        :aria-label="`${placeholderText}，Markdown 源码模式`"
        :aria-invalid="Boolean(editorErrorMessage)"
        :aria-describedby="editorErrorMessage ? editorErrorId : undefined"
        @paste="isSaving ? $event.preventDefault() : handlePaste($event)"
        @compositionstart="isComposing = true"
        @compositionend="handleCompositionEnd"
        @keydown="!isSaving && handleKeydown($event)"
      ></textarea>

      <div v-if="imageAttachments.length" class="image-strip" :inert="isSaving">
        <button
          v-for="image in imageAttachments"
          :key="image.url"
          type="button"
          class="image-chip"
          :title="`移除 ${image.alt}`"
          @click="removeAttachedImage(image.url)"
        >
          <img :src="resolvedImageUrls[image.url] || image.url" :alt="image.alt" class="image-chip-thumb" />
          <span class="image-chip-remove">×</span>
        </button>

        <button type="button" class="image-add-tile" @click="triggerImageUpload">
          <span class="image-add-plus">+</span>
        </button>
      </div>
    </div>

    <div v-if="editorErrorMessage" :id="editorErrorId" class="editor-message editor-message-error" role="alert">
      {{ editorErrorMessage }}
    </div>
    <div v-else-if="submissionBlockedReason" class="editor-message" role="status">
      {{ submissionBlockedReason }}
    </div>

    <div class="editor-toolbar" :inert="isSaving">
      <div class="toolbar-icons" @pointerdown.prevent>
        <button
          class="icon-btn"
          :class="{ active: showPreview }"
          :title="actionTitle(showPreview ? '切换到 Markdown' : '切换到富文本', 'Ctrl+Shift+P')"
          :aria-label="showPreview ? '切换到 Markdown' : '切换到富文本'"
          @click="togglePreview"
        >
          <Eye v-if="!showPreview" :size="20" />
          <PenLine v-else :size="20" />
        </button>
        <div class="divider"></div>
        <button class="icon-btn" :class="{ active: showTagInput }" :title="actionTitle('添加标签')" @click="showTagInput = !showTagInput"><Hash :size="20" /></button>
        <button class="icon-btn" :title="actionTitle('上传图片')" @click="triggerImageUpload"><ImageIcon :size="20" /></button>
        <div class="divider"></div>
        <button class="icon-btn" :title="actionTitle('加粗', 'Ctrl+B')" @click="insertBold"><Bold :size="20" /></button>
        <button class="icon-btn" :title="actionTitle('斜体', 'Ctrl+I')" @click="insertItalic"><Italic :size="20" /></button>
        <button class="icon-btn" :title="actionTitle('删除线', 'Ctrl+Shift+X')" @click="insertStrikethrough"><Strikethrough :size="20" /></button>
        <button class="icon-btn" :title="actionTitle('插入链接', 'Ctrl+K')" @click="insertLink"><LinkIcon :size="20" /></button>
        <div class="divider"></div>
        <button class="icon-btn" :title="actionTitle('列表', 'Ctrl+Shift+L')" @click="insertList"><List :size="20" /></button>
        <button class="icon-btn" :title="actionTitle('序号列表', 'Ctrl+Shift+O')" @click="insertOrderedList"><ListOrdered :size="20" /></button>
        <button class="icon-btn" :title="actionTitle('任务清单', 'Ctrl+Shift+T')" @click="insertChecklist"><CheckSquare :size="20" /></button>
        <button class="icon-btn" :title="actionTitle('行内代码', 'Ctrl+`')" @click="insertCode"><Code :size="20" /></button>
        <button class="icon-btn" :title="actionTitle('清除格式', 'Ctrl+\\\\')" @click="clearFormatting"><Eraser :size="20" /></button>
      </div>

      <div class="toolbar-action">
        <button v-if="showCancelButton" class="btn-cancel-text" type="button" @click="emit('cancel')">取消</button>
        <button class="btn-send" type="button" :disabled="!hasContent || isUploading || isSaving || Boolean(submissionBlockedReason)" @click="saveNote" :title="submitButtonTitle" :aria-label="submitButtonTitle">
          <span v-if="isUploading || isSaving" class="send-loading">...</span>
          <SendHorizontal v-else :size="18" class="send-icon" />
        </button>
      </div>

      <input type="file" ref="fileInput" @change="handleImageUpload" accept="image/*" style="display: none" />
    </div>

    <div v-if="showTagInput" class="tag-input-area">
      <input
        v-model="tagInput"
        :disabled="isSaving"
        aria-label="笔记标签"
        class="tag-input"
        placeholder="输入标签，用逗号分隔..."
        @keydown.enter.prevent=""
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, nextTick, onBeforeUnmount, onMounted } from 'vue';
import { marked } from 'marked';
import { settings } from '../../store/settings';
import { useEditorDraft } from '../../composables/useEditorDraft';
import { useEditorFormatting } from '../../composables/useEditorFormatting';
import { useEditorHistory } from '../../composables/useEditorHistory';
import { useEditorImages } from '../../composables/useEditorImages';
import { useEditorLifecycle } from '../../composables/useEditorLifecycle';
import { useEditorRichText } from '../../composables/useEditorRichText';
import { useEditorSelection } from '../../composables/useEditorSelection';
import { useEditorSubmit, type EditorSubmitPayload } from '../../composables/useEditorSubmit';
import { resolveAttachmentUrl } from '../../domain/attachments/attachmentUrlResolver';
import { clearDraftAttachmentSession, createDraftAttachmentSessionKey } from '../../domain/attachments/localAttachmentDrafts.js';
import { getProductShell } from '../../domain/runtime/shellRuntime.js';
import { notesReadError } from '../../store/notes.js';
import {
  extractEditorAttachments,
  replaceEditorAttachmentsWithMarkers,
  restoreEditorAttachmentMarkers,
} from '../../utils/editorAttachments';

import {
  Hash, Image as ImageIcon, Bold, Italic, Strikethrough,
  Link as LinkIcon, List, ListOrdered, CheckSquare, Code, SendHorizontal,
  Eye, PenLine, Eraser
} from 'lucide-vue-next';

export type { EditorSubmitPayload } from '../../composables/useEditorSubmit';

const props = withDefaults(defineProps<{
  shell?: 'web-desktop' | 'mobile';
  initialContent?: string;
  initialTags?: string[];
  draftKey?: string;
  placeholder?: string;
  showCancel?: boolean;
  autosaveDraft?: boolean;
  resetOnSuccess?: boolean;
  autoFocus?: boolean;
  submitTitle?: string;
  submitAction?: ((payload: EditorSubmitPayload) => Promise<void> | void) | null;
}>(), {
  shell: 'web-desktop',
  initialContent: '',
  initialTags: () => [],
  draftKey: 'compose',
  placeholder: '现在的想法是...',
  showCancel: false,
  autosaveDraft: true,
  resetOnSuccess: true,
  autoFocus: false,
  submitTitle: '发送',
  submitAction: null,
});

const emit = defineEmits(['saved', 'cancel']);

const shellClass = computed(() => (
  props.shell === 'mobile'
    ? 'editor-shell-mobile'
    : 'editor-shell-web-desktop'
));

const content = ref('');
const attachmentSessionKey = ref(createDraftAttachmentSessionKey());
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const previewRef = ref<HTMLElement | null>(null);
const editorCardRef = ref<HTMLElement | null>(null);
const showTagInput = ref(false);
const tagInput = ref('');
const showPreview = ref(props.shell !== 'mobile');
const isComposing = ref(false);
const draftStorageKey = `bemo.editor.draft:${props.draftKey}`;
const placeholderText = computed(() => props.placeholder);
const editorErrorId = `editor-error-${Math.random().toString(36).slice(2, 9)}`;
const showCancelButton = computed(() => props.showCancel);
const attachments = computed(() => extractEditorAttachments(content.value));
const imageAttachments = computed(() => attachments.value
  .filter((attachment) => attachment.kind === 'image')
  .map((attachment) => ({
    alt: attachment.label,
    url: attachment.url,
  })));
const resolvedImageUrls = ref<Record<string, string>>({});
const submitButtonTitle = computed(() => {
  if (isUploading.value) return '图片上传中';
  if (isSaving.value) return '保存中';
  if (submissionBlockedReason.value) return submissionBlockedReason.value;
  return props.submitTitle;
});
const submissionBlockedReason = computed(() => (
  getProductShell() === 'web-desktop' && notesReadError.value
    ? '数据服务暂时不可用，可以继续编辑；请先点击下方“重试”恢复连接后保存。'
    : ''
));
const propsTagString = computed(() => (props.initialTags || []).join(', '));
const hasUnsavedLocalChanges = computed(() => (
  content.value !== String(props.initialContent || '')
  || tagInput.value !== propsTagString.value
  || showTagInput.value
));
const actionTitle = (label: string, shortcut?: string) => (
  props.shell === 'mobile' || !shortcut
    ? label
    : `${label} (${shortcut})`
);

const {
  handleCompositionEnd,
  handlePreviewInput,
  hasContent,
  syncEditorPreview,
  togglePreview,
} = useEditorRichText({
  content,
  previewRef,
  textareaRef,
  showPreview,
  isComposing,
});

const setEditorMode = (richText: boolean) => {
  if (showPreview.value !== richText && !isSaving.value) togglePreview();
};
watch(() => settings.editor.preferredMode, mode => setEditorMode(mode === 'rich-text'));

const {
  fileInput,
  handleImageUpload,
  handlePaste,
  isUploading,
  uploadError,
  removeAttachedImage,
  triggerImageUpload,
} = useEditorImages({
  attachmentSessionKey,
  content,
  previewRef,
  textareaRef,
  showPreview,
  handlePreviewInput,
  syncEditorPreview,
});

const {
  clearDraft,
  restoreDraft,
} = useEditorDraft({
  attachmentSessionKey,
  autosaveDraft: props.autosaveDraft,
  draftStorageKey,
  content,
  tagInput,
  showTagInput,
  showPreview,
});
void fileInput;

const resizeTextarea = () => {
  const textarea = textareaRef.value;
  if (!textarea || showPreview.value) return;

  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
};

const {
  getPreviewSelectionOffsets,
  restorePreviewSelectionOffsets,
} = useEditorSelection(previewRef);

const {
  resetHistory,
  undoContent,
  redoContent,
} = useEditorHistory({
  content,
  showPreview,
  textareaRef,
  previewRef,
  resizeTextarea,
  syncEditorPreview,
  getPreviewSelectionOffsets,
  restorePreviewSelectionOffsets,
});

const blockTags = new Set([
  'P', 'DIV', 'SECTION', 'ARTICLE', 'BLOCKQUOTE',
  'UL', 'OL', 'LI', 'PRE',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
]);

const normalizePlainText = (value: string) => value
  .replace(/\u00a0/g, ' ')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const isCitationLikeText = (value: string) => /^\[\d+\]$/.test(value.trim());

const extractPlainText = (node: Node): string => {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || '';
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return '';
  }

  const element = node as HTMLElement;
  const tagName = element.tagName.toUpperCase();

  if (tagName === 'BR') {
    return '\n';
  }

  const childrenText = Array.from(element.childNodes).map(extractPlainText).join('');

  if (tagName === 'A' && isCitationLikeText(childrenText)) {
    return '';
  }

  if (tagName === 'LI') {
    return `${childrenText.trim()}\n`;
  }

  if (blockTags.has(tagName)) {
    return `${childrenText.trim()}\n\n`;
  }

  return childrenText;
};

const stripMarkdownFormatting = async (value: string) => {
  const html = await marked.parse(value || '', {
    gfm: settings.editor.markdownGfm,
    breaks: settings.editor.markdownBreaks,
  });
  const container = document.createElement('div');
  container.innerHTML = String(html);
  return normalizePlainText(Array.from(container.childNodes).map(extractPlainText).join(''));
};

const clearFormatting = async () => {
  if (showPreview.value) {
    handlePreviewInput();
  }

  const { body, attachments } = replaceEditorAttachmentsWithMarkers(content.value);
  const plainText = await stripMarkdownFormatting(body);
  content.value = restoreEditorAttachmentMarkers(plainText, attachments);
  await nextTick();
  resizeTextarea();
  editorCardRef.value?.scrollIntoView({ block: 'start', behavior: 'smooth' });

  if (showPreview.value && previewRef.value) {
    await syncEditorPreview();
    requestAnimationFrame(() => previewRef.value?.focus());
  }
};

const focusActiveSurface = () => {
  if (showPreview.value) {
    const preview = previewRef.value;
    if (!preview) return;

    try {
      preview.focus({ preventScroll: true });
    } catch {
      preview.focus();
    }
    const selection = window.getSelection();
    if (!selection) return;

    const range = document.createRange();
    range.selectNodeContents(preview);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    return;
  }

  const textarea = textareaRef.value;
  if (!textarea) return;

  textarea.focus({ preventScroll: true });
  const cursor = textarea.value.length;
  textarea.setSelectionRange(cursor, cursor);
};

const focusEditor = async () => {
  await nextTick();
  requestAnimationFrame(() => {
    focusActiveSurface();
  });
};

const {
  isSaving,
  saveError,
  saveNote,
} = useEditorSubmit({
  attachmentSessionKey,
  content,
  tagInput,
  showTagInput,
  showPreview,
  previewRef,
  isUploading,
  blockedReason: submissionBlockedReason,
  handlePreviewInput,
  clearDraft,
  resetHistory,
  resetOnSuccess: props.resetOnSuccess,
  submitAction: props.submitAction,
  emitSaved: () => emit('saved'),
});

const editorErrorMessage = computed(() => saveError.value || uploadError.value);

const {
  handleKeydown,
  insertBold,
  insertChecklist,
  insertCode,
  insertItalic,
  insertLink,
  insertList,
  insertOrderedList,
  insertStrikethrough,
} = useEditorFormatting({
  content,
  textareaRef,
  previewRef,
  showPreview,
  isComposing,
  handlePreviewInput,
  togglePreview,
  clearFormatting,
  undo: undoContent,
  redo: redoContent,
  submit: saveNote,
});

useEditorLifecycle({
  attachmentSessionKey,
  initialContent: props.initialContent,
  initialTags: props.initialTags,
  autosaveDraft: props.autosaveDraft,
  content,
  tagInput,
  showTagInput,
  showPreview,
  previewRef,
  propsTagString,
  hasUnsavedLocalChanges,
  resizeTextarea,
  syncEditorPreview,
  restoreDraft,
  resetHistory,
});

watch(imageAttachments, async (nextImages) => {
  const entries = await Promise.all(nextImages.map(async (image) => ([image.url, await resolveAttachmentUrl(image.url)] as const)));
  resolvedImageUrls.value = Object.fromEntries(entries);
}, { immediate: true });

watch(content, () => {
  saveError.value = '';
  uploadError.value = '';
});

onMounted(() => {
  if (!props.autoFocus) return;
  void focusEditor();
});

defineExpose({
  focusEditor,
});

onBeforeUnmount(() => {
  if (props.autosaveDraft) return;
  void clearDraftAttachmentSession(attachmentSessionKey.value);
});
</script>

<style scoped>
.editor-card {
  background: var(--bg-card, white);
  border-radius: var(--radius-lg, 0.75rem);
  border: 1px solid var(--border-color, #e4e4e7);
  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.02), 0 2px 4px -1px rgba(0,0,0,0.02);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.editor-card,
.editor-body,
.editor-preview,
.editor-input {
  min-width: 0;
}

.editor-card:focus-within {
  border-color: var(--accent-color, #10b981);
  box-shadow: 0 4px 6px -1px color-mix(in srgb, var(--accent-color) 8%, transparent), 0 2px 4px -1px color-mix(in srgb, var(--accent-color) 8%, transparent);
}

.editor-body {
  display: flex;
  flex-direction: column;
  min-height: 120px;
}
.editor-preview {
  width: 100%;
  min-height: 120px;
  padding: 16px 20px;
  cursor: text;
  background-color: transparent;
  outline: none;
  font-size: var(--font-size-body);
  line-height: 1.6;
  color: var(--text-primary, #3f3f46);
}

.editor-preview:empty:before {
  content: attr(data-placeholder);
  color: var(--text-secondary);
}

.editor-input {
  width: 100%;
  min-height: 120px;
  border: none;
  resize: none;
  padding: 16px 20px;
  font-size: var(--font-size-body);
  line-height: 1.6;
  color: var(--text-primary, #3f3f46);
  outline: none;
  font-family: inherit;
  background-color: transparent;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.editor-input::-webkit-scrollbar {
  display: none;
}

.editor-input::placeholder {
  color: var(--text-secondary);
}

.image-strip {
  display: flex;
  align-items: flex-end;
  gap: 14px;
  padding: 0 20px 16px;
  flex-wrap: wrap;
}

.image-chip,
.image-add-tile {
  position: relative;
  width: 92px;
  height: 92px;
  border-radius: 16px;
  background: var(--bg-card, white);
  border: 1px solid var(--border-color, #d4d4d8);
  overflow: hidden;
  flex-shrink: 0;
}

.image-chip {
  padding: 0;
  cursor: pointer;
}

.image-chip-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.image-chip-remove {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  color: white;
  font-size: 1.2rem;
  line-height: 1;
}

.image-add-tile {
  border-style: dashed;
  background: transparent;
  color: var(--text-secondary, #a1a1aa);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.image-add-tile:hover {
  border-color: var(--accent-color, #31d279);
  color: var(--accent-text, #31d279);
}

.image-add-plus {
  font-size: 2.5rem;
  font-weight: 300;
  line-height: 1;
}

.editor-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  border-top: 1px solid var(--border-color, #e4e4e7);
  background-color: var(--bg-main, #fafafa);
  gap: 12px;
}

.editor-message {
  padding: 9px 16px;
  border-top: 1px solid var(--border-color);
  background: color-mix(in srgb, var(--info-color) 8%, var(--bg-card));
  color: var(--info-text);
  font-size: var(--font-size-small);
  font-weight: var(--font-weight-readable);
  line-height: 1.5;
}

.editor-message-error {
  background: color-mix(in srgb, var(--danger-color) 10%, var(--bg-card));
  color: var(--danger-text);
}

.toolbar-icons {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: nowrap;
  overflow-x: auto;
  padding-bottom: 2px;
  min-width: 0;
}

.icon-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  padding: 5px;
  border-radius: var(--radius-sm, 0.375rem);
}

.icon-btn:hover:not(:disabled) {
  color: var(--text-primary, #3f3f46);
  background-color: var(--bg-main, #f4f4f5);
}

.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.divider {
  width: 1px;
  height: 16px;
  background-color: var(--border-color, #e4e4e7);
  margin: 0 4px;
}

.toolbar-action {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}

.btn-cancel-text {
  border: none;
  background: transparent;
  color: var(--text-secondary, #a1a1aa);
  font-size: 0.96rem;
  cursor: pointer;
  transition: color 0.2s ease;
}

.btn-cancel-text:hover {
  color: var(--text-primary, #3f3f46);
}

.btn-send {
  background-color: var(--accent-sidebar-bg, #e6f7ef);
  color: var(--accent-text, #31d279);
  border: none;
  border-radius: 9px;
  width: 56px;
  height: 32px;
  cursor: not-allowed;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.btn-send:not(:disabled) {
  background-color: var(--accent-color, #31d279);
  color: var(--accent-foreground, white);
  cursor: pointer;
  box-shadow: none;
}

.btn-send:not(:disabled):hover {
  background-color: var(--accent-hover, #059669);
}

.send-icon {
  width: 16px;
  height: 16px;
  margin-left: 1px;
}

.send-loading {
  font-size: 1.4rem;
  line-height: 1;
}

.icon-btn.active {
  color: var(--accent-text, #10b981);
  background-color: var(--accent-sidebar-bg, #e6f7ef);
}

.tag-input-area {
  padding: 6px 16px 10px;
  border-top: 1px solid var(--border-color, #e4e4e7);
  background: var(--bg-main, #fafafa);
}

.tag-input {
  width: 100%;
  border: 1px solid var(--border-color, #e4e4e7);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: var(--font-size-supporting);
  outline: none;
  background: var(--bg-card, white);
  color: var(--text-primary);
}

.tag-input:focus {
  border-color: var(--accent-color, #10b981);
}

.editor-shell-mobile .editor-preview,
.editor-shell-mobile .editor-input {
  padding: 14px 16px;
  font-size: var(--font-size-body);
}

.editor-shell-mobile .image-strip {
  gap: 10px;
  padding: 0 16px 14px;
}

.editor-shell-mobile .image-chip,
.editor-shell-mobile .image-add-tile {
  width: 72px;
  height: 72px;
  border-radius: 14px;
}

.editor-shell-mobile .editor-toolbar {
  align-items: flex-end;
  position: sticky;
  bottom: 0;
  z-index: 4;
  padding: 6px 10px;
  box-shadow: 0 -8px 20px color-mix(in srgb, var(--bg-main) 78%, transparent);
}

.editor-shell-mobile .toolbar-icons {
  flex: 1;
  gap: 2px;
  margin-right: 2px;
  scroll-padding-inline: 4px;
}

.editor-shell-mobile .toolbar-icons .icon-btn {
  width: 44px;
  height: 44px;
  padding: 0;
  flex: 0 0 44px;
}

.editor-shell-mobile .toolbar-action {
  gap: 8px;
}

.editor-shell-mobile .btn-send {
  width: 48px;
  height: 44px;
  border-radius: 12px;
}

.editor-shell-mobile .tag-input-area {
  padding: 8px 12px 12px;
}
</style>
