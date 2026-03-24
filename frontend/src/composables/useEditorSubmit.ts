import { ref, type Ref } from 'vue';
import { createNoteContent } from '../store/notes.js';
import {
  clearDraftAttachmentSession,
  createDraftAttachmentSessionKey,
  promoteDraftAttachmentsForContent,
} from '../domain/attachments/localAttachmentDrafts.js';

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
  handlePreviewInput: () => void;
  clearDraft: () => void;
  resetHistory: (value: string) => void;
  resetOnSuccess: boolean;
  submitAction?: ((payload: EditorSubmitPayload) => Promise<void> | void) | null;
  emitSaved: () => void;
}) {
  const isSaving = ref(false);

  const saveNote = async () => {
    if (options.isUploading.value || isSaving.value) return;
    if (options.showPreview.value) options.handlePreviewInput();
    if (!options.content.value.trim()) return;

    const tags = options.tagInput.value
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0);

    isSaving.value = true;
    try {
      await promoteDraftAttachmentsForContent(options.attachmentSessionKey.value, options.content.value);
      if (options.submitAction) {
        await options.submitAction({
          content: options.content.value,
          tags,
        });
      } else {
        await createNoteContent({ content: options.content.value, tags });
      }

      options.clearDraft();
      if (options.resetOnSuccess) {
        options.content.value = '';
        if (options.previewRef.value) options.previewRef.value.innerHTML = '';
        options.tagInput.value = '';
        options.showTagInput.value = false;
        options.resetHistory('');
      }
      await clearDraftAttachmentSession(options.attachmentSessionKey.value);
      options.attachmentSessionKey.value = createDraftAttachmentSessionKey();
      options.emitSaved();
    } finally {
      isSaving.value = false;
    }
  };

  return {
    isSaving,
    saveNote,
  };
}
