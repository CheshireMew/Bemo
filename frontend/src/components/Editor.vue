<template>
  <div class="editor-card">
    <div 
      v-show="showPreview" 
      class="editor-preview markdown-body" 
      contenteditable="true"
      @input="handlePreviewInput"
      @paste="handlePaste"
      ref="previewRef"
      @keydown="handleKeydown"
    ></div>
    <textarea 
      v-show="!showPreview"
      ref="textareaRef"
      v-model="content" 
      class="editor-input" 
      placeholder="现在的想法是..."
      @paste="handlePaste"
      @keydown="handleKeydown"
    ></textarea>
    
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
        <button class="icon-btn" title="清单 Ctrl+Shift+T" @click="insertChecklist"><CheckSquare :size="20" /></button>
        <button class="icon-btn" title="代码 Ctrl+`" @click="insertCode"><Code :size="20" /></button>
      </div>
      
      <div class="toolbar-action">
        <button class="btn-send" :disabled="!hasContent && !isUploading" @click="saveNote">
          <span v-if="isUploading">...</span>
          <Send v-else :size="18" class="send-icon" />
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
import { ref, watch, computed } from 'vue';
import axios from 'axios';
import { addToPendingQueue } from '../utils/db';
import { isOnline } from '../utils/sync';
import { API_BASE } from '../config';
import { marked } from 'marked';

marked.use({ gfm: true, breaks: true });

import { 
  Hash, Image as ImageIcon, Bold, Italic, Strikethrough,
  Link as LinkIcon, List, CheckSquare, Code, Send,
  Eye, PenLine
} from 'lucide-vue-next';

import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const turndownService = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
// 官方 GFM 插件：一次性支持 task list、strikethrough、tables 的 HTML→Markdown 反向转译
turndownService.use(gfm);

const emit = defineEmits(['saved']);

const content = ref('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const previewRef = ref<HTMLElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const isUploading = ref(false);
const showTagInput = ref(false);
const tagInput = ref('');
const showPreview = ref(true); // 默认“富文本预览/渲染”模式

// 双模式下的 content 是否有内容判定（富文本模式下结合 DOM 文本）
const hasContent = computed(() => {
  if (showPreview.value) {
    return !!(previewRef.value?.textContent?.trim()) || !!content.value.trim();
  }
  return !!content.value.trim();
});

// 当从 markdown 切换到富文本时，或者 markdown 更新时，需要重新渲染预览区
// 为了避免在富文本模式打字时光标乱跳，只有在处于 markdown 模式时才覆盖 html
watch(content, async (newVal) => {
  if (!showPreview.value && previewRef.value) {
    previewRef.value.innerHTML = newVal ? (await marked.parse(newVal)) as string : '';
  }
});

const handlePreviewInput = () => {
  if (previewRef.value) {
    content.value = turndownService.turndown(previewRef.value.innerHTML);
  }
};



const togglePreview = () => {
  showPreview.value = !showPreview.value;
  if (!showPreview.value) {
    // 切回 markdown 源码时聚焦
    requestAnimationFrame(() => textareaRef.value?.focus());
  } else {
    // 切回富文本态时基于此时的 markdown 强制重新渲染一次 html 以保证状态准确
    if (previewRef.value) {
      const runParse = async () => {
        const html = await marked.parse(content.value);
        if (previewRef.value) {
          previewRef.value.innerHTML = content.value ? (html as string) : '';
          requestAnimationFrame(() => previewRef.value?.focus());
        }
      };
      runParse();
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
  if (showPreview.value) handlePreviewInput();
  if (!content.value.trim()) return;
  
  const tags = tagInput.value
    .split(/[,，]/)
    .map(t => t.trim())
    .filter(t => t.length > 0);
  
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
  
  content.value = '';
  if (previewRef.value) previewRef.value.innerHTML = '';
  tagInput.value = '';
  showTagInput.value = false;
  emit('saved');
};


// ──────────── Image Upload ────────────

const triggerImageUpload = () => {
  fileInput.value?.click();
};

const uploadFile = async (file: File) => {
  if (!file.type.startsWith('image/')) return;
  
  const formData = new FormData();
  formData.append('file', file);
  
  try {
    isUploading.value = true;
    const res = await axios.post(`${API_BASE}/uploads/`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    
    // Use relative URL — works regardless of host/port
    const imageMarkdown = `\n![${file.name}](${res.data.url})\n`;
    content.value += imageMarkdown;
    // 如果在富文本模式下上传，在光标位置插入 img 而非全量重渲染
    if (showPreview.value && previewRef.value) {
      const img = document.createElement('img');
      img.src = res.data.url;
      img.alt = file.name;
      img.style.maxWidth = '100%';
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.insertNode(img);
        range.setStartAfter(img);
        range.collapse(true);
      } else {
        previewRef.value.appendChild(img);
      }
      handlePreviewInput(); // 同步回 markdown
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
  content: "现在的想法是...";
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

.btn-send {
  background-color: var(--border-color, #e4e4e7);
  color: #a1a1aa;
  border: none;
  border-radius: var(--radius-md, 0.5rem);
  padding: 6px 12px;
  cursor: not-allowed;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 500;
  font-size: 0.9rem;
  gap: 6px;
}

.btn-send:not(:disabled) {
  background-color: var(--accent-color, #10b981);
  color: white;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(16,185,129,0.2);
}
.btn-send:not(:disabled):hover {
  background-color: var(--accent-hover, #059669);
}

.send-icon {
  margin-left: 2px;
}

.icon-btn.active { color: var(--accent-color, #10b981); background-color: var(--accent-sidebar-bg, #e6f7ef); }

.tag-input-area { padding: 6px 16px 10px; border-top: 1px solid var(--border-color, #e4e4e7); background: var(--bg-main, #fafafa); }
.tag-input { 
  width: 100%; border: 1px solid var(--border-color, #e4e4e7); border-radius: 6px; 
  padding: 6px 10px; font-size: 0.85rem; outline: none; background: var(--bg-card, white); color: var(--text-primary);
}
.tag-input:focus { border-color: var(--accent-color, #10b981); }
</style>
