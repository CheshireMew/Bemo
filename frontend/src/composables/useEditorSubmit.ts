import { ref, type ComputedRef, type Ref } from 'vue';
import { createNoteContent } from '../store/notes.js';
import { finalizeDraftAttachments } from '../domain/appStore/attachmentsAdapter.js';
import {
  clearDraftAttachmentSession,
  createDraftAttachmentSessionKey,
} from '../domain/attachments/localAttachmentDrafts.js';
import { pushNotification } from '../store/notifications.js';
import { toUserErrorMessage } from '../utils/errorMessage.js';

export interface EditorSubmitPayload {
  content: string;
  tags: string[];
}

export function useEditorSubmit(options: {
  attachmentSessionKey: Ref<string>;
  content: Ref<string>;
  tagInput: Ref<string>;
  showTagInput: Ref<boolean>;
  showPreview: Ref<boolean>;
  previewRef: Ref<HTMLElement | null>;
  isUploading: Ref<boolean>;
  blockedReason: ComputedRef<string>;
  handlePreviewInput: () => void;
  clearDraft: () => void;
  resetHistory: (value: string) => void;
  resetOnSuccess: boolean;
  submitAction?: ((payload: EditorSubmitPayload) => Promise<void> | void) | null;
  emitSaved: () => void;
}) {
  const isSaving = ref(false);
  const saveError = ref('');

  const saveNote = async () => {
    if (options.isUploading.value || isSaving.value) return;
    if (options.blockedReason.value) {
      saveError.value = options.blockedReason.value;
      pushNotification(options.blockedReason.value, 'error', 4200);
      return;
    }
    if (options.showPreview.value) options.handlePreviewInput();
    if (!options.content.value.trim()) return;

    const tags = options.tagInput.value
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);
    const content = options.content.value;
    const sessionKey = options.attachmentSessionKey.value;

    isSaving.value = true;
    saveError.value = '';
    try {
      await finalizeDraftAttachments(sessionKey, content);
      if (options.submitAction) {
        await options.submitAction({
          content,
          tags,
        });
      } else {
        await createNoteContent({ content, tags });
      }
    } catch (error) {
      const message = `保存失败，内容仍保留在编辑器中。${toUserErrorMessage(error, '请稍后重试。')}`;
      saveError.value = message;
      pushNotification(message, 'error', 5200);
      isSaving.value = false;
      return;
    }

    try {
      try { options.clearDraft(); } catch (error) { console.warn('Failed to clear saved draft', error); }
      if (options.resetOnSuccess) {
        options.content.value = '';
        if (options.previewRef.value) options.previewRef.value.innerHTML = '';
        options.tagInput.value = '';
        options.showTagInput.value = false;
        options.resetHistory('');
      }
      await clearDraftAttachmentSession(sessionKey).catch(error => console.warn('Failed to clean saved attachment session', error));
      options.attachmentSessionKey.value = createDraftAttachmentSessionKey();
      options.emitSaved();
    } finally {
      isSaving.value = false;
    }
  };

  return {
    isSaving,
    saveError,
    saveNote,
  };
}
