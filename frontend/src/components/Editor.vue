<template>
  <div class="editor-card">
    <textarea 
      v-model="content" 
      class="editor-input" 
      placeholder="现在的想法是..."
      @paste="handlePaste"
    ></textarea>
    
    <div class="editor-toolbar">
      <div class="toolbar-icons">
        <button class="icon-btn" :class="{ active: showTagInput }" title="添加标签" @click="showTagInput = !showTagInput"><Hash :size="20" /></button>
        <button class="icon-btn" title="上传图片" @click="triggerImageUpload"><ImageIcon :size="20" /></button>
        <div class="divider"></div>
        <button class="icon-btn" title="格式"><Type :size="20" /></button>
        <button class="icon-btn" title="列表"><List :size="20" /></button>
        <button class="icon-btn" title="清单"><CheckSquare :size="20" /></button>
        <div class="divider"></div>
        <button class="icon-btn" title="提及"><AtSign :size="20" /></button>
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
import { ref } from 'vue';
import axios from 'axios';
import { addToPendingQueue } from '../utils/db';
import { isOnline } from '../utils/sync';
import { API_BASE } from '../config';
import { 
  Hash, Image as ImageIcon, Type, 
  List, CheckSquare, AtSign, Send 
} from 'lucide-vue-next';

const emit = defineEmits(['saved']);

const content = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const isUploading = ref(false);
const showTagInput = ref(false);
const tagInput = ref('');

const saveNote = async () => {
  if (!content.value.trim()) return;
  
  const tags = tagInput.value
    .split(/[,，]/)
    .map(t => t.trim())
    .filter(t => t.length > 0);
  
  if (isOnline()) {
    // Online: post directly to server
    try {
      await axios.post(`${API_BASE}/notes/`, {
        content: content.value,
        tags: tags.length > 0 ? tags : undefined
      });
    } catch (error) {
      // Network error — save offline instead
      console.warn("Server unreachable, saving offline");
      await addToPendingQueue({ content: content.value, tags });
    }
  } else {
    // Offline: save to IndexedDB queue
    await addToPendingQueue({ content: content.value, tags });
  }
  
  content.value = '';
  tagInput.value = '';
  showTagInput.value = false;
  emit('saved');
};

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
    
    const imageUrl = `http://localhost:8000${res.data.url}`;
    const imageMarkdown = `\n![${file.name}](${imageUrl})\n`;
    
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
    target.value = ''; // reset
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
  /* subtle focus-within wrapper effect like Memos */
}
.editor-card:focus-within {
  border-color: var(--accent-color, #10b981);
  box-shadow: 0 4px 6px -1px rgba(16,185,129,0.05), 0 2px 4px -1px rgba(16,185,129,0.05);
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
}
.editor-input::placeholder {
  color: #a1a1aa; /* zinc-400 */
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
  gap: 8px;
}

.icon-btn {
  background: transparent;
  border: none;
  color: #a1a1aa; /* zinc-400 */
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  padding: 6px;
  border-radius: var(--radius-sm, 0.375rem);
}
.icon-btn:hover {
  color: var(--text-primary, #3f3f46);
  background-color: #f4f4f5;
}

.divider {
  width: 1px;
  height: 16px;
  background-color: #e4e4e7;
  margin: 0 4px;
}

.btn-send {
  background-color: #e4e4e7; /* disabled */
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

/* active state when there's text */
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
