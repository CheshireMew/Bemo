<template>
  <div class="shared-note-card-body">
    <div v-if="note.tags && note.tags.length" class="note-tags">
      <span v-for="t in note.tags" :key="t" class="note-tag" @click="isTrash ? null : toggleTag(t)">#{{ t }}</span>
    </div>

    <div v-if="isEditing" class="edit-area">
      <Editor
        :draft-key="`note:${note.note_id}`"
        :initial-content="note.content"
        :initial-tags="note.tags"
        :show-cancel="true"
        :autosave-draft="false"
        :reset-on-success="false"
        placeholder="修改这条笔记..."
        submit-title="保存"
        :submit-action="saveEdit"
        @cancel="cancelEdit"
        @saved="handleEditSaved"
      />
    </div>

    <template v-else>
      <div class="note-body markdown-body" v-html="renderedHtml"></div>
      <div v-if="imageAttachments.length" class="note-image-grid">
        <button
          v-for="(image, index) in imageAttachments"
          :key="image.url"
          type="button"
          class="note-image-card"
          :class="{ 'note-image-card-primary': index === 0, 'note-image-card-secondary': index > 0 }"
          @click="openImagePreview(image.url)"
        >
          <img :src="resolvedImageUrls[image.url] || image.url" :alt="image.label" class="note-image" />
        </button>
      </div>
      <div v-if="audioAttachments.length" class="note-audio-list">
        <div
          v-for="audio in audioAttachments"
          :key="audio.url"
          class="note-audio-card"
        >
          <div class="note-audio-title">{{ audio.label }}</div>
          <audio class="note-audio-player" controls :src="resolvedAttachmentUrls[audio.url] || audio.url"></audio>
        </div>
      </div>
      <div v-if="videoAttachments.length" class="note-video-list">
        <div
          v-for="video in videoAttachments"
          :key="video.url"
          class="note-video-card"
        >
          <div class="note-video-title">{{ video.label }}</div>
          <video class="note-video-player" controls :src="resolvedAttachmentUrls[video.url] || video.url"></video>
        </div>
      </div>
      <div v-if="fileAttachments.length" class="note-file-list">
        <a
          v-for="file in fileAttachments"
          :key="file.url"
          class="note-file-card"
          :href="resolvedAttachmentUrls[file.url] || file.url"
          target="_blank"
          rel="noreferrer"
        >
          <span class="note-file-label">{{ file.label }}</span>
        </a>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import Editor, { type EditorSubmitPayload } from '../../Editor.vue';
import type { NoteMeta } from '../../../store/notes';
import { toggleTag, updateNoteContent } from '../../../store/notes';
import { pushNotification } from '../../../store/notifications';

const props = defineProps<{
  note: NoteMeta;
  isTrash?: boolean;
  isEditing: boolean;
  renderedHtml: string;
  imageAttachments: Array<{ url: string; label: string }>;
  audioAttachments: Array<{ url: string; label: string }>;
  videoAttachments: Array<{ url: string; label: string }>;
  fileAttachments: Array<{ url: string; label: string }>;
  resolvedImageUrls: Record<string, string>;
  resolvedAttachmentUrls: Record<string, string>;
  cancelEdit: () => void;
  handleEditSaved: () => void;
  openImagePreview: (url: string) => void;
}>();

const saveEdit = async (payload: EditorSubmitPayload) => {
  try {
    await updateNoteContent(props.note, payload);
  } catch (e) {
    console.error(e);
    pushNotification('保存失败', 'error');
    throw e;
  }
};
</script>

<style scoped>
.shared-note-card-body {
  display: contents;
}

.note-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 10px;
}

.note-tag {
  font-size: 0.75rem;
  color: var(--accent-color);
  cursor: pointer;
  transition: opacity 0.15s;
}

.note-tag:hover {
  opacity: 0.7;
}

.edit-area {
  margin-top: 4px;
}

.note-image-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.note-image-card {
  border: 1px solid var(--border-color, #e4e4e7);
  border-radius: 14px;
  overflow: hidden;
  background: var(--bg-main, #f4f5f7);
  padding: 0;
  cursor: pointer;
}

.note-image-card-primary {
  grid-column: 1 / -1;
}

.note-image-card-secondary {
  min-width: 0;
}

.note-image {
  display: block;
  width: 100%;
  height: auto;
  max-height: 70vh;
  object-fit: contain;
  background: var(--bg-card, #fff);
}

.note-image-card-primary .note-image {
  max-height: 72vh;
}

.note-image-card-secondary .note-image {
  aspect-ratio: 1 / 1;
  max-height: none;
  object-fit: cover;
}

.note-audio-list,
.note-video-list,
.note-file-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.note-audio-card,
.note-video-card,
.note-file-card {
  border: 1px solid var(--border-color, #e4e4e7);
  border-radius: 14px;
  background: var(--bg-main, #f4f5f7);
  padding: 12px;
}

.note-file-card {
  display: flex;
  align-items: center;
  text-decoration: none;
  color: var(--text-primary);
}

.note-audio-title,
.note-video-title,
.note-file-label {
  font-size: 0.84rem;
  font-weight: 600;
  margin-bottom: 8px;
  word-break: break-all;
}

.note-audio-player,
.note-video-player {
  width: 100%;
  display: block;
}

.note-video-player {
  max-height: 320px;
  background: #000;
  border-radius: 10px;
}

@media (max-width: 767px) {
  .note-tags {
    gap: 5px;
    margin-bottom: 8px;
  }

  .note-tag {
    font-size: 0.72rem;
  }

  .note-image-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .note-image {
    max-height: 50vh;
  }

  .note-image-card-primary .note-image {
    max-height: 52vh;
  }
}
</style>
