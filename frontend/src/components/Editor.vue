<template>
  <div class="editor-card">
    <div class="editor-body">
      <div 
        v-show="showPreview" 
        class="editor-preview markdown-body" 
        :data-placeholder="placeholderText"
        contenteditable="true"
        @input="handlePreviewInput"
        @compositionstart="isComposing = true"
        @compositionend="handleCompositionEnd"
        @paste="handlePaste"
        ref="previewRef"
        @keydown="handleKeydown"
      ></div>
      <textarea 
        v-show="!showPreview"
        ref="textareaRef"
        v-model="content" 
        class="editor-input" 
        :placeholder="placeholderText"
        @paste="handlePaste"
        @compositionstart="isComposing = true"
        @compositionend="handleCompositionEnd"
        @keydown="handleKeydown"
      ></textarea>

      <div v-if="attachedImages.length" class="image-strip">
        <button
          v-for="image in attachedImages"
          :key="image.url"
          type="button"
          class="image-chip"
          :title="`移除 ${image.alt}`"
          @click="removeAttachedImage(image.url)"
        >
          <img :src="resolveBackendUrl(image.url)" :alt="image.alt" class="image-chip-thumb" />
          <span class="image-chip-remove">×</span>
        </button>

        <button type="button" class="image-add-tile" @click="triggerImageUpload">
          <span class="image-add-plus">+</span>
        </button>
      </div>
    </div>
    
    <div class="editor-toolbar">
      <div class="toolbar-icons" @mousedown.prevent>
        <button class="icon-btn" :class="{ active: showPreview }" title="切换预览 (Ctrl+Shift+P)" @click="togglePreview">
          <Eye v-if="!showPreview" :size="20" />
          <PenLine v-else :size="20" />
        </button>
        <div class="divider"></div>
        <button class="icon-btn" :class="{ active: showTagInput }" title="添加标签" @click="showTagInput = !showTagInput"><Hash :size="20" /></button>
        <button class="icon-btn" title="上传图片" @click="triggerImageUpload"><ImageIcon :size="20" /></button>
        <div class="divider"></div>
        <button class="icon-btn" title="加粗 Ctrl+B" @click="insertBold"><Bold :size="20" /></button>
        <button class="icon-btn" title="斜体 Ctrl+I" @click="insertItalic"><Italic :size="20" /></button>
        <button class="icon-btn" title="删除线 Ctrl+Shift+X" @click="insertStrikethrough"><Strikethrough :size="20" /></button>
        <button class="icon-btn" title="链接 Ctrl+K" @click="insertLink"><LinkIcon :size="20" /></button>
        <div class="divider"></div>
        <button class="icon-btn" title="列表 Ctrl+Shift+L" @click="insertList"><List :size="20" /></button>
        <button class="icon-btn" title="序号列表 Ctrl+Shift+O" @click="insertOrderedList"><ListOrdered :size="20" /></button>
        <button class="icon-btn" title="清单 Ctrl+Shift+T" @click="insertChecklist"><CheckSquare :size="20" /></button>
        <button class="icon-btn" title="代码 Ctrl+`" @click="insertCode"><Code :size="20" /></button>
      </div>
      
      <div class="toolbar-action">
        <button v-if="showCancelButton" class="btn-cancel-text" type="button" @click="emit('cancel')">取消</button>
        <button class="btn-send" :disabled="!hasContent || isUploading" @click="saveNote" :title="submitButtonTitle">
          <span v-if="isUploading" class="send-loading">...</span>
          <SendHorizontal v-else :size="18" class="send-icon" />
        </button>
      </div>
      
      <input type="file" ref="fileInput" @change="handleImageUpload" accept="image/*" style="display: none" />
    </div>
    
    <!-- Tag Input -->
    <div v-if="showTagInput" class="tag-input-area">
      <input 
        v-model="tagInput" 
        class="tag-input" 
        placeholder="输入标签，用逗号分隔..."
        @keydown.enter.prevent=""
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue';
import axios from 'axios';
import { addToPendingQueue } from '../utils/db';
import { isOnline } from '../utils/sync';
import { API_BASE, resolveBackendUrl } from '../config';
import { marked } from 'marked';
import { saveSettings, settings } from '../store/settings';

import { 
  Hash, Image as ImageIcon, Bold, Italic, Strikethrough,
  Link as LinkIcon, List, ListOrdered, CheckSquare, Code, SendHorizontal,
  Eye, PenLine
} from 'lucide-vue-next';

import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
// 官方 GFM 插件：一次性支持 task list、strikethrough、tables 的 HTML→Markdown 反向转译
turndownService.use(gfm);

export interface EditorSubmitPayload {
  content: string;
  tags: string[];
}

const props = withDefaults(defineProps<{
  initialContent?: string;
  initialTags?: string[];
  placeholder?: string;
  showCancel?: boolean;
  autosaveDraft?: boolean;
  resetOnSuccess?: boolean;
  submitTitle?: string;
  submitAction?: ((payload: EditorSubmitPayload) => Promise<void> | void) | null;
}>(), {
  initialContent: '',
  initialTags: () => [],
  placeholder: '现在的想法是...',
  showCancel: false,
  autosaveDraft: true,
  resetOnSuccess: true,
  submitTitle: '发送',
  submitAction: null,
});

const emit = defineEmits(['saved', 'cancel']);

const content = ref('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const previewRef = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const isUploading = ref(false);
const showTagInput = ref(false);
const tagInput = ref('');
const showPreview = ref(true); // 默认“富文本预览/渲染”模式
const isComposing = ref(false);
const draftStorageKey = 'bemo.editor.draft';
let autoSaveTimer: number | null = null;
const placeholderText = computed(() => props.placeholder);
const showCancelButton = computed(() => props.showCancel);
const submitButtonTitle = computed(() => (isUploading.value ? '图片上传中' : props.submitTitle));

// 双模式下的 content 是否有内容判定（富文本模式下结合 DOM 文本）
const hasContent = computed(() => {
  if (showPreview.value) {
    return !!(previewRef.value?.textContent?.trim()) || !!content.value.trim();
  }
  return !!content.value.trim();
});

const attachedImages = computed(() => {
  const matches = Array.from(content.value.matchAll(/!\[([^\]]*)\]\((\/images\/[^)]+)\)/g));
  return matches.map((match) => ({
    alt: match[1] || 'image',
    url: match[2],
  }));
});

const stripAttachmentMarkdown = (value: string) => {
  return value
    .replace(/\n?!\[[^\]]*\]\((\/images\/[^)]+)\)\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

const renderMarkdown = async (value: string) => {
  const renderer = new marked.Renderer();
  renderer.image = ({ href, title, text }) => {
    const src = resolveBackendUrl(href || '');
    const titleAttr = title ? ` title="${title}"` : '';
    const altAttr = text || '';
    return `<img src="${src}" alt="${altAttr}"${titleAttr}>`;
  };
  renderer.link = ({ href, title, text }) => {
    const resolved = href?.startsWith('/images/') ? resolveBackendUrl(href) : (href || '');
    const titleAttr = title ? ` title="${title}"` : '';
    return `<a href="${resolved}"${titleAttr} target="_blank" rel="noreferrer">${text}</a>`;
  };

  return marked.parse(value, {
    gfm: settings.editor.markdownGfm,
    breaks: settings.editor.markdownBreaks,
    renderer,
  }) as Promise<string>;
};

const syncEditorPreview = async () => {
  if (!previewRef.value) return;
  const displayContent = stripAttachmentMarkdown(content.value);
  previewRef.value.innerHTML = displayContent ? await renderMarkdown(displayContent) : '';
};

const buildAttachmentMarkdown = () => {
  return attachedImages.value.map((image) => `![${image.alt}](${image.url})`).join('\n');
};

const mergeTextAndAttachments = (textMarkdown: string) => {
  const normalizedText = textMarkdown.trim();
  const attachmentMarkdown = buildAttachmentMarkdown();
  if (!normalizedText) return attachmentMarkdown;
  if (!attachmentMarkdown) return normalizedText;
  return `${normalizedText}\n\n${attachmentMarkdown}`;
};

const saveDraft = () => {
  const payload = {
    content: content.value,
    tagInput: tagInput.value,
    showTagInput: showTagInput.value,
    showPreview: showPreview.value,
  };

  if (!payload.content.trim() && !payload.tagInput.trim()) {
    localStorage.removeItem(draftStorageKey);
    return;
  }

  localStorage.setItem(draftStorageKey, JSON.stringify(payload));
};

const clearDraft = () => {
  localStorage.removeItem(draftStorageKey);
};

const removeAttachedImage = (url: string) => {
  const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`\\n?!\\[[^\\]]*\\]\\(${escapedUrl}\\)\\n?`, 'g');
  content.value = content.value.replace(pattern, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (showPreview.value && previewRef.value) {
    syncEditorPreview();
  }
};

const queueAutoSave = () => {
  if (!props.autosaveDraft || !settings.editor.autoSaveEnabled) {
    if (autoSaveTimer) {
      window.clearTimeout(autoSaveTimer);
      autoSaveTimer = null;
    }
    return;
  }

  if (autoSaveTimer) {
    window.clearTimeout(autoSaveTimer);
  }

  autoSaveTimer = window.setTimeout(() => {
    saveDraft();
    autoSaveTimer = null;
  }, settings.editor.autoSaveDelaySec * 1000);
};

// 当从 markdown 切换到富文本时，或者 markdown 更新时，需要重新渲染预览区
// 为了避免在富文本模式打字时光标乱跳，只有在处于 markdown 模式时才覆盖 html
watch(content, async (newVal) => {
  queueAutoSave();
  if (!showPreview.value && previewRef.value) {
    const displayContent = stripAttachmentMarkdown(newVal);
    previewRef.value.innerHTML = displayContent ? await renderMarkdown(displayContent) : '';
  }
});

watch(tagInput, () => {
  queueAutoSave();
});

watch(showTagInput, () => {
  queueAutoSave();
});

watch(() => settings.editor.autoSaveEnabled, (enabled) => {
  if (!props.autosaveDraft) return;
  if (enabled) {
    queueAutoSave();
  } else {
    clearDraft();
  }
});

watch(() => [settings.editor.markdownGfm, settings.editor.markdownBreaks], async () => {
  if (showPreview.value && previewRef.value) {
    await syncEditorPreview();
  }
});

const handlePreviewInput = () => {
  if (isComposing.value) {
    return;
  }

  if (previewRef.value) {
    const textMarkdown = turndownService.turndown(previewRef.value.innerHTML);
    content.value = mergeTextAndAttachments(textMarkdown);
  }
};

const handleCompositionEnd = () => {
  isComposing.value = false;
  if (showPreview.value) {
    handlePreviewInput();
  }
};

const persistEditorModePreference = () => {
  settings.editor.preferredMode = showPreview.value ? 'rich-text' : 'markdown';
  saveSettings();
};



const togglePreview = () => {
  showPreview.value = !showPreview.value;
  persistEditorModePreference();
  if (!showPreview.value) {
    // 切回 markdown 源码时聚焦
    requestAnimationFrame(() => textareaRef.value?.focus());
  } else {
    // 切回富文本态时基于此时的 markdown 强制重新渲染一次 html 以保证状态准确
    if (previewRef.value) {
      syncEditorPreview().then(() => {
        requestAnimationFrame(() => previewRef.value?.focus());
      });
    }
  }
};


// ──────────── Text Manipulation Helpers ────────────

/**
 * Wrap the current selection (or insert at cursor) with prefix/suffix.
 * If text is selected, wraps it: prefix + selectedText + suffix.
 * If no selection, inserts: prefix + placeholder + suffix, with placeholder selected.
 */
const wrapSelection = (prefix: string, suffix: string, placeholder: string = '') => {
  const el = textareaRef.value;
  if (!el) return;
  
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const text = content.value;
  const selected = text.substring(start, end);
  
  const insertText = selected || placeholder;
  const newText = text.substring(0, start) + prefix + insertText + suffix + text.substring(end);
  content.value = newText;
  
  // Restore cursor position / selection
  requestAnimationFrame(() => {
    el.focus();
    if (selected) {
      el.selectionStart = el.selectionEnd = start + prefix.length + selected.length + suffix.length;
    } else {
      // Select the placeholder so user can type over it
      el.selectionStart = start + prefix.length;
      el.selectionEnd = start + prefix.length + placeholder.length;
    }
  });
};

/**
 * Insert text at the beginning of the current line.
 */
const insertAtLineStart = (prefix: string) => {
  const el = textareaRef.value;
  if (!el) return;
  
  const start = el.selectionStart;
  const text = content.value;
  
  // Find the start of the current line
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  
  const newText = text.substring(0, lineStart) + prefix + text.substring(lineStart);
  content.value = newText;
  
  requestAnimationFrame(() => {
    el.focus();
    el.selectionStart = el.selectionEnd = start + prefix.length;
  });
};


// ──────────── Toolbar Actions ────────────

const insertBold = () => {
  if (showPreview.value) { document.execCommand('bold'); handlePreviewInput(); previewRef.value?.focus(); }
  else wrapSelection('**', '**', '粗体文字');
};
const insertItalic = () => {
  if (showPreview.value) { document.execCommand('italic'); handlePreviewInput(); previewRef.value?.focus(); }
  else wrapSelection('*', '*', '斜体文字');
};
const insertStrikethrough = () => {
  if (showPreview.value) { document.execCommand('strikeThrough'); handlePreviewInput(); previewRef.value?.focus(); }
  else wrapSelection('~~', '~~', '删除线');
};
const insertLink = () => {
  if (showPreview.value) { 
    const url = prompt('请输入链接地址:', 'https://');
    if (url) { document.execCommand('createLink', false, url); handlePreviewInput(); previewRef.value?.focus(); }
  }
  else wrapSelection('[', '](url)', '链接文字');
};
const insertCode = () => {
  if (showPreview.value) {
    const sel = window.getSelection();
    if (sel && sel.toString()) {
      document.execCommand('insertHTML', false, `<code>${sel.toString()}</code>`);
    } else {
      document.execCommand('insertHTML', false, `<code>code</code>`);
    }
    handlePreviewInput(); previewRef.value?.focus();
  }
  else wrapSelection('`', '`', 'code');
};
const insertList = () => {
  if (showPreview.value) { document.execCommand('insertUnorderedList'); handlePreviewInput(); previewRef.value?.focus(); }
  else insertAtLineStart('- ');
};
const insertOrderedList = () => {
  if (showPreview.value) {
    document.execCommand('insertOrderedList');
    handlePreviewInput();
    previewRef.value?.focus();
  }
  else insertAtLineStart('1. ');
};
const insertChecklist = () => {
  if (showPreview.value && previewRef.value) {
    // execCommand('insertHTML') 对 <input> 不可靠，直接操作 DOM
    const li = document.createElement('li');
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    li.appendChild(cb);
    li.appendChild(document.createTextNode(' 待办事项'));
    const ul = document.createElement('ul');
    ul.appendChild(li);

    // 在光标位置插入
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(ul);
      // 光标移到 checkbox 后方
      range.setStartAfter(ul);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    } else {
      previewRef.value.appendChild(ul);
    }
    handlePreviewInput();
    previewRef.value.focus();
  }
  else insertAtLineStart('- [ ] 待办事项');
};


// ──────────── Keyboard Shortcuts ────────────

const handleKeydown = (e: KeyboardEvent) => {
  if (e.isComposing || isComposing.value) {
    return;
  }

  const isCtrl = e.ctrlKey || e.metaKey;
  
  if (isCtrl && !e.shiftKey) {
    switch (e.key.toLowerCase()) {
      case 'b':
        e.preventDefault();
        insertBold();
        break;
      case 'i':
        e.preventDefault();
        insertItalic();
        break;
      case 'k':
        e.preventDefault();
        insertLink();
        break;
      case '`':
        e.preventDefault();
        insertCode();
        break;
      case 'enter':
        e.preventDefault();
        saveNote();
        break;
    }
  }
  
  if (isCtrl && e.shiftKey) {
    switch (e.key.toLowerCase()) {
      case 'x':
        e.preventDefault();
        insertStrikethrough();
        break;
      case 'l':
        e.preventDefault();
        insertList();
        break;
      case 'o':
        e.preventDefault();
        insertOrderedList();
        break;
      case 't':
        e.preventDefault();
        insertChecklist();
        break;
    }
  }
  
  if (isCtrl && e.shiftKey && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    togglePreview();
  }
};


// ──────────── Note Saving ────────────

const saveNote = async () => {
  // 富文本模式下先强制同步一次，避免 content 滚后于 DOM
  if (isUploading.value) return;
  if (showPreview.value) handlePreviewInput();
  if (!content.value.trim()) return;
  
  const tags = tagInput.value
    .split(/[,，]/)
    .map(t => t.trim())
    .filter(t => t.length > 0);
  
  if (props.submitAction) {
    await props.submitAction({
      content: content.value,
      tags,
    });
  } else {
    if (isOnline()) {
      try {
        await axios.post(`${API_BASE}/notes/`, {
          content: content.value,
          tags: tags.length > 0 ? tags : undefined
        });
      } catch (error) {
        console.warn("Server unreachable, saving offline");
        await addToPendingQueue({ content: content.value, tags });
      }
    } else {
      await addToPendingQueue({ content: content.value, tags });
    }
  }

  if (props.resetOnSuccess) {
    content.value = '';
    if (previewRef.value) previewRef.value.innerHTML = '';
    tagInput.value = '';
    showTagInput.value = false;
    clearDraft();
  }
  emit('saved');
};


// ──────────── Image Upload ────────────

const triggerImageUpload = () => {
  fileInput.value?.click();
};

const compressImage = (file: File) => {
  const mode = settings.editor.imageCompression;
  const compressibleTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (mode === 'original' || !compressibleTypes.includes(file.type)) {
    return Promise.resolve(file);
  }

  const maxWidth = mode === 'compact' ? 1280 : 1920;
  const outputType = file.type === 'image/png' ? 'image/png' : file.type;
  const quality = outputType === 'image/png' ? undefined : (mode === 'compact' ? 0.72 : 0.82);

  return new Promise<File>((resolve) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      const scale = Math.min(1, maxWidth / image.width);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(image.width * scale);
      canvas.height = Math.round(image.height * scale);

      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
        return;
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(objectUrl);
        if (!blob || blob.size >= file.size) {
          resolve(file);
          return;
        }

        resolve(new File([blob], file.name, { type: blob.type || file.type, lastModified: file.lastModified }));
      }, outputType, quality);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    image.src = objectUrl;
  });
};

const uploadFile = async (file: File) => {
  if (!file.type.startsWith('image/')) return;
  const uploadTarget = await compressImage(file);
  
  const formData = new FormData();
  formData.append('file', uploadTarget);
  
  try {
    isUploading.value = true;
    const res = await axios.post(`${API_BASE}/uploads/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    
    // Use relative URL — works regardless of host/port
    const imageMarkdown = `\n![${uploadTarget.name}](${res.data.url})\n`;
    content.value += imageMarkdown;
    if (showPreview.value && previewRef.value) {
      await syncEditorPreview();
      requestAnimationFrame(() => previewRef.value?.focus());
    }
  } catch (err) {
    console.error("Failed to upload image", err);
  } finally {
    isUploading.value = false;
  }
};

const handleImageUpload = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    uploadFile(target.files[0]);
    target.value = '';
  }
};

const handlePaste = (event: ClipboardEvent) => {
  const items = event.clipboardData?.items;
  if (!items) return;
  
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf('image') !== -1) {
      const file = items[i].getAsFile();
      if (file) {
        event.preventDefault();
        uploadFile(file);
        break;
      }
    }
  }
};

onMounted(async () => {
  content.value = props.initialContent;
  tagInput.value = (props.initialTags || []).join(', ');
  showPreview.value = settings.editor.preferredMode === 'rich-text';

  if (!props.autosaveDraft) {
    if (showPreview.value && previewRef.value && content.value) {
      await syncEditorPreview();
    }
    return;
  }

  try {
    const raw = localStorage.getItem(draftStorageKey);
    if (!raw) return;
    const draft = JSON.parse(raw) as Partial<{
      content: string;
      tagInput: string;
      showTagInput: boolean;
      showPreview: boolean;
    }>;

    content.value = draft.content ?? '';
    tagInput.value = draft.tagInput ?? '';
    showTagInput.value = draft.showTagInput ?? false;

    if (showPreview.value && previewRef.value && content.value) {
      await syncEditorPreview();
    }
  } catch (error) {
    console.warn('Failed to restore draft.', error);
  }
});

watch(
  () => [props.initialContent, (props.initialTags || []).join(',')],
  async ([nextContent, nextTags]) => {
    if (props.autosaveDraft) return;
    content.value = String(nextContent || '');
    tagInput.value = String(nextTags || '');
    showTagInput.value = false;
    if (showPreview.value && previewRef.value) {
      await syncEditorPreview();
    }
  },
);

onBeforeUnmount(() => {
  if (autoSaveTimer) {
    window.clearTimeout(autoSaveTimer);
  }
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
.editor-card:focus-within {
  border-color: var(--accent-color, #10b981);
  box-shadow: 0 4px 6px -1px rgba(16,185,129,0.05), 0 2px 4px -1px rgba(16,185,129,0.05);
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
  font-size: 0.95rem;
  line-height: 1.6;
  color: var(--text-primary, #3f3f46);
}
/* 给富文本模式加个 placeholder 提示效果 */
.editor-preview:empty:before {
  content: attr(data-placeholder);
  color: #a1a1aa;
}

.editor-input {
  width: 100%;
  min-height: 120px;
  border: none;
  resize: none;
  padding: 16px 20px;
  font-size: 0.95rem;
  line-height: 1.6;
  color: var(--text-primary, #3f3f46);
  outline: none;
  font-family: inherit;
  background-color: transparent;
  /* 隐藏编辑框滚动条 */
  scrollbar-width: none; -ms-overflow-style: none;
}
.editor-input::-webkit-scrollbar { display: none; }
.editor-input::placeholder {
  color: #a1a1aa;
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
  color: var(--accent-color, #31d279);
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
}

.toolbar-icons {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.icon-btn {
  background: transparent;
  border: none;
  color: #a1a1aa;
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
.icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }

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
  background-color: #dff5e8;
  color: var(--accent-color, #31d279);
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
  color: white;
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

.icon-btn.active { color: var(--accent-color, #10b981); background-color: var(--accent-sidebar-bg, #e6f7ef); }

.tag-input-area { padding: 6px 16px 10px; border-top: 1px solid var(--border-color, #e4e4e7); background: var(--bg-main, #fafafa); }
.tag-input { 
  width: 100%; border: 1px solid var(--border-color, #e4e4e7); border-radius: 6px; 
  padding: 6px 10px; font-size: 0.85rem; outline: none; background: var(--bg-card, white); color: var(--text-primary);
}
.tag-input:focus { border-color: var(--accent-color, #10b981); }
</style>
