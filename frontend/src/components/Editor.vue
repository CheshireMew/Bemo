<template>
  <div class="editor-card">
    <div v-if="showPreview" class="editor-preview markdown-body" v-html="previewContent" @click="showPreview = false"></div>
    <textarea 
      v-else
      ref="textareaRef"
      v-model="content" 
      class="editor-input" 
      placeholder="现在的想法是..."
      @paste="handlePaste"
      @keydown="handleKeydown"
    ></textarea>
    
    <div class="editor-toolbar">
      <div class="toolbar-icons">
        <button class="icon-btn" :class="{ active: showPreview }" title="切换预览 (Ctrl+P)" @click="togglePreview">
          <Eye v-if="!showPreview" :size="20" />
          <PenLine v-else :size="20" />
        </button>
        <div class="divider"></div>
        <button class="icon-btn" :class="{ active: showTagInput }" title="添加标签" @click="showTagInput = !showTagInput" :disabled="showPreview"><Hash :size="20" /></button>
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
        <button class="btn-send" :disabled="!content.trim() && !isUploading" @click="saveNote">
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
import { ref, computed } from 'vue';
import axios from 'axios';
import { addToPendingQueue } from '../utils/db';
import { isOnline } from '../utils/sync';
import { API_BASE } from '../config';
import { marked } from 'marked';
import { 
  Hash, Image as ImageIcon, Bold, Italic, Strikethrough,
  Link as LinkIcon, List, CheckSquare, Code, Send,
  Eye, PenLine
} from 'lucide-vue-next';

const emit = defineEmits(['saved']);

const content = ref('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);
const fileInput = ref<HTMLInputElement | null>(null);
const isUploading = ref(false);
const showTagInput = ref(false);
const tagInput = ref('');
const showPreview = ref(false);

const previewContent = computed(() => {
  return content.value ? marked.parse(content.value) : '<p class="text-gray-400">现在的想法是...</p>';
});

const togglePreview = () => {
  showPreview.value = !showPreview.value;
  if (!showPreview.value) {
    // Focus textarea when switching back to edit mode
    requestAnimationFrame(() => {
      textareaRef.value?.focus();
    });
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

const insertBold = () => wrapSelection('**', '**', '粗体文字');
const insertItalic = () => wrapSelection('*', '*', '斜体文字');
const insertStrikethrough = () => wrapSelection('~~', '~~', '删除线');
const insertLink = () => wrapSelection('[', '](url)', '链接文字');
const insertCode = () => wrapSelection('`', '`', 'code');
const insertList = () => insertAtLineStart('- ');
const insertChecklist = () => insertAtLineStart('- [ ] ');


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
  
  if (isCtrl && e.key.toLowerCase() === 'p') {
    e.preventDefault();
    togglePreview();
  }
};


// ──────────── Note Saving ────────────

const saveNote = async () => {
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
  tagInput.value = '';
  showTagInput.value = false;
  showPreview.value = false;
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
  background: white;
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
  background-color: #fafafa;
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
  background-color: #f4f4f5;
}
.icon-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.divider {
  width: 1px;
  height: 16px;
  background-color: #e4e4e7;
  margin: 0 4px;
}

.btn-send {
  background-color: #e4e4e7;
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

.icon-btn.active { color: var(--accent-color, #10b981); background-color: #e6f7ef; }

.tag-input-area { padding: 6px 16px 10px; border-top: 1px solid var(--border-color, #e4e4e7); background: #fafafa; }
.tag-input { 
  width: 100%; border: 1px solid #e4e4e7; border-radius: 6px; 
  padding: 6px 10px; font-size: 0.85rem; outline: none; background: white;
}
.tag-input:focus { border-color: var(--accent-color, #10b981); }
</style>
