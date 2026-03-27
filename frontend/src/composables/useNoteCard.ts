import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue';

import type { NoteMeta } from '../store/notes';
import { pushNotification } from '../store/notifications';
import { openAiChat, openImagePreview as openImagePreviewOverlay } from '../store/ui';
import { settings } from '../store/settings';
import { resolveAttachmentUrl } from '../domain/attachments/attachmentUrlResolver';
import {
  copyContentToClipboard,
  openExternalResource,
} from '../domain/runtime/nativePlatformBridge.js';
import { renderMarkdownToHtml } from '../utils/markdownRenderer';
import { getEditorAttachmentDisplayKind, splitEditorMarkdownByKind } from '../utils/editorAttachments';

export function formatNoteDate(timestamp: number) {
  const d = new Date(timestamp * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function useNoteCard(noteSource: MaybeRefOrGetter<NoteMeta>) {
  const note = computed(() => toValue(noteSource));
  const isEditing = ref(false);
  const renderedHtml = ref('');
  const resolvedImageUrls = ref<Record<string, string>>({});
  const resolvedAttachmentUrls = ref<Record<string, string>>({});
  const copyFeedback = ref(false);
  const editDraftStorageKey = computed(() => `bemo.editor.draft:note:${note.value.note_id}`);
  const copyActionLabel = computed(() => (copyFeedback.value ? '已复制' : '复制'));
  const copyButtonTitle = computed(() => {
    if (copyFeedback.value) {
      return '已复制';
    }
    return settings.editor.copyFormat === 'rich-text' ? '复制富文本内容' : '复制 Markdown 内容';
  });

  const splitContent = computed(() => splitEditorMarkdownByKind(note.value.content || ''));
  const imageAttachments = computed(() => splitContent.value.attachments.filter((attachment) => getEditorAttachmentDisplayKind(attachment) === 'image'));
  const audioAttachments = computed(() => splitContent.value.attachments.filter((attachment) => getEditorAttachmentDisplayKind(attachment) === 'audio'));
  const videoAttachments = computed(() => splitContent.value.attachments.filter((attachment) => getEditorAttachmentDisplayKind(attachment) === 'video'));
  const fileAttachments = computed(() => splitContent.value.attachments.filter((attachment) => getEditorAttachmentDisplayKind(attachment) === 'file'));

  const openNoteAiChat = () => {
    const firstLine = (note.value.content || '').trim().split('\n')[0]?.replace(/^#+\s*/, '').trim() || '';
    openAiChat({
      noteId: note.value.note_id,
      noteLabel: firstLine || note.value.title || '当前笔记',
    });
  };

  const startEdit = () => {
    localStorage.removeItem(editDraftStorageKey.value);
    isEditing.value = true;
  };

  const cancelEdit = () => {
    localStorage.removeItem(editDraftStorageKey.value);
    isEditing.value = false;
  };

  const handleEditSaved = () => {
    localStorage.removeItem(editDraftStorageKey.value);
    isEditing.value = false;
  };

  let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null;
  const flashCopyFeedback = () => {
    copyFeedback.value = true;
    pushNotification('已复制笔记内容', 'success', 1800);
    if (copyFeedbackTimer) {
      clearTimeout(copyFeedbackTimer);
    }
    copyFeedbackTimer = setTimeout(() => {
      copyFeedback.value = false;
    }, 1200);
  };

  const copyNoteContent = async () => {
    const markdown = note.value.content || '';

    try {
      if (settings.editor.copyFormat === 'markdown') {
        await copyContentToClipboard({
          text: markdown,
        });
        flashCopyFeedback();
        return;
      }

      const html = String(await renderMarkdownToHtml(markdown));
      const temp = document.createElement('div');
      temp.innerHTML = html;
      const plainText = temp.innerText || temp.textContent || markdown;

      await copyContentToClipboard({
        text: plainText,
        html,
      });

      flashCopyFeedback();
    } catch (error) {
      console.error('Failed to copy note content:', error);
      pushNotification('复制失败', 'error');
    }
  };

  const openImagePreview = (url: string) => {
    const previewItems = imageAttachments.value.map((image) => ({
      url: resolvedImageUrls.value[image.url] || image.url,
      label: image.label,
    }));
    openImagePreviewOverlay(previewItems, resolvedImageUrls.value[url] || url);
  };

  const openFileAttachment = async (url: string, label: string) => {
    const target = resolvedAttachmentUrls.value[url] || url;
    try {
      await openExternalResource({
        url: target,
        fileName: label || `${note.value.note_id}-attachment`,
      });
    } catch (error) {
      console.error('Failed to open attachment:', error);
      pushNotification('文件打开失败', 'error');
    }
  };

  watch(() => note.value.content, async (content) => {
    renderedHtml.value = String(await renderMarkdownToHtml(splitEditorMarkdownByKind(content || '').body));
  }, { immediate: true });

  watch(() => note.value.note_id, () => {
    isEditing.value = false;
    copyFeedback.value = false;
  });

  watch(imageAttachments, async (nextImages) => {
    const entries = await Promise.all(nextImages.map(async (image) => (
      [image.url, await resolveAttachmentUrl(image.url)] as const
    )));
    resolvedImageUrls.value = Object.fromEntries(entries);
  }, { immediate: true });

  watch(() => splitContent.value.attachments, async (nextAttachments) => {
    const entries = await Promise.all(nextAttachments.map(async (attachment) => (
      [attachment.url, await resolveAttachmentUrl(attachment.url)] as const
    )));
    resolvedAttachmentUrls.value = Object.fromEntries(entries);
  }, { immediate: true });

  return {
    isEditing,
    renderedHtml,
    resolvedImageUrls,
    resolvedAttachmentUrls,
    copyFeedback,
    copyActionLabel,
    copyButtonTitle,
    imageAttachments,
    audioAttachments,
    videoAttachments,
    fileAttachments,
    openNoteAiChat,
    startEdit,
    cancelEdit,
    handleEditSaved,
    copyNoteContent,
    openImagePreview,
    openFileAttachment,
  };
}
