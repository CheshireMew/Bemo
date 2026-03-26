import { computed, ref, watch } from 'vue';

import type { NoteMeta } from '../store/notes';
import { pushNotification } from '../store/notifications';
import { openAiChat } from '../store/ui';
import { settings } from '../store/settings';
import { resolveAttachmentUrl } from '../domain/attachments/attachmentUrlResolver';
import { renderMarkdownToHtml } from '../utils/markdownRenderer';
import { getEditorAttachmentDisplayKind, splitEditorMarkdownByKind } from '../utils/editorAttachments';

export function formatNoteDate(timestamp: number) {
  const d = new Date(timestamp * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function useNoteCard(note: NoteMeta) {
  const isEditing = ref(false);
  const renderedHtml = ref('');
  const resolvedImageUrls = ref<Record<string, string>>({});
  const resolvedAttachmentUrls = ref<Record<string, string>>({});
  const copyFeedback = ref(false);
  const editDraftStorageKey = computed(() => `bemo.editor.draft:note:${note.note_id}`);
  const copyButtonTitle = computed(() => {
    if (copyFeedback.value) {
      return '已复制';
    }
    return settings.editor.copyFormat === 'rich-text' ? '复制富文本内容' : '复制 Markdown 内容';
  });

  const splitContent = computed(() => splitEditorMarkdownByKind(note.content || ''));
  const imageAttachments = computed(() => splitContent.value.attachments.filter((attachment) => getEditorAttachmentDisplayKind(attachment) === 'image'));
  const audioAttachments = computed(() => splitContent.value.attachments.filter((attachment) => getEditorAttachmentDisplayKind(attachment) === 'audio'));
  const videoAttachments = computed(() => splitContent.value.attachments.filter((attachment) => getEditorAttachmentDisplayKind(attachment) === 'video'));
  const fileAttachments = computed(() => splitContent.value.attachments.filter((attachment) => getEditorAttachmentDisplayKind(attachment) === 'file'));

  const openNoteAiChat = () => {
    const firstLine = (note.content || '').trim().split('\n')[0]?.replace(/^#+\s*/, '').trim() || '';
    openAiChat({
      noteId: note.note_id,
      noteLabel: firstLine || note.title || '当前笔记',
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
    if (copyFeedbackTimer) {
      clearTimeout(copyFeedbackTimer);
    }
    copyFeedbackTimer = setTimeout(() => {
      copyFeedback.value = false;
    }, 1200);
  };

  const copyNoteContent = async () => {
    const markdown = note.content || '';

    try {
      if (settings.editor.copyFormat === 'markdown') {
        await navigator.clipboard.writeText(markdown);
        flashCopyFeedback();
        return;
      }

      const html = String(await renderMarkdownToHtml(markdown));
      const temp = document.createElement('div');
      temp.innerHTML = html;
      const plainText = temp.innerText || temp.textContent || markdown;

      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
        const item = new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([plainText], { type: 'text/plain' }),
        });
        await navigator.clipboard.write([item]);
      } else {
        await navigator.clipboard.writeText(plainText);
      }

      flashCopyFeedback();
    } catch (error) {
      console.error('Failed to copy note content:', error);
      pushNotification('复制失败', 'error');
    }
  };

  const openImagePreview = (url: string) => {
    const target = resolvedImageUrls.value[url] || url;
    window.open(target, '_blank', 'noopener,noreferrer');
  };

  watch(() => note.content, async (content) => {
    renderedHtml.value = String(await renderMarkdownToHtml(splitEditorMarkdownByKind(content || '').body));
  }, { immediate: true });

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
  };
}
