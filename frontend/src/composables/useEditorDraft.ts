import { onBeforeUnmount, watch, type Ref } from 'vue';
import { settings } from '../store/settings';
import { deleteAttachmentRefsForOwner, replaceAttachmentRefsForOwner } from '../domain/attachments/attachmentRefStorage.js';
import { extractAttachmentFilenames } from '../domain/attachments/attachmentRefParser.js';
import { clearDraftAttachmentSession, pruneDraftAttachmentsForContent } from '../domain/attachments/localAttachmentDrafts.js';

type UseEditorDraftOptions = {
  attachmentSessionKey: Ref<string>;
  autosaveDraft: boolean;
  draftStorageKey: string;
  content: Ref<string>;
  tagInput: Ref<string>;
  showTagInput: Ref<boolean>;
  showPreview: Ref<boolean>;
};

export function useEditorDraft(options: UseEditorDraftOptions) {
  let autoSaveTimer: number | null = null;

  const saveDraft = () => {
    const payload = {
      content: options.content.value,
      tagInput: options.tagInput.value,
      showTagInput: options.showTagInput.value,
      showPreview: options.showPreview.value,
      attachmentSessionKey: options.attachmentSessionKey.value,
    };

    if (!payload.content.trim() && !payload.tagInput.trim()) {
      localStorage.removeItem(options.draftStorageKey);
      void deleteAttachmentRefsForOwner('draft', options.draftStorageKey);
      void clearDraftAttachmentSession(options.attachmentSessionKey.value);
      return;
    }

    localStorage.setItem(options.draftStorageKey, JSON.stringify(payload));
    void replaceAttachmentRefsForOwner({
      ownerType: 'draft',
      ownerId: options.draftStorageKey,
      scope: 'draft',
      filenames: extractAttachmentFilenames(options.content.value),
    });
    void pruneDraftAttachmentsForContent(options.attachmentSessionKey.value, options.content.value);
  };

  const clearDraft = () => {
    localStorage.removeItem(options.draftStorageKey);
    void deleteAttachmentRefsForOwner('draft', options.draftStorageKey);
    void clearDraftAttachmentSession(options.attachmentSessionKey.value);
  };

  const queueAutoSave = () => {
    if (!options.autosaveDraft || !settings.editor.autoSaveEnabled) {
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

  const restoreDraft = () => {
    if (!options.autosaveDraft) {
      return null;
    }

    try {
      const raw = localStorage.getItem(options.draftStorageKey);
      if (!raw) return null;
      return JSON.parse(raw) as Partial<{
        content: string;
        tagInput: string;
        showTagInput: boolean;
        showPreview: boolean;
        attachmentSessionKey: string;
      }>;
    } catch (error) {
      console.warn('Failed to restore draft.', error);
      return null;
    }
  };

  watch(options.content, () => {
    queueAutoSave();
  });

  watch(options.tagInput, () => {
    queueAutoSave();
  });

  watch(options.showTagInput, () => {
    queueAutoSave();
  });

  watch(options.showPreview, () => {
    queueAutoSave();
  });

  watch(() => settings.editor.autoSaveEnabled, (enabled) => {
    if (!options.autosaveDraft) return;
    if (enabled) {
      queueAutoSave();
    } else {
      clearDraft();
    }
  });

  onBeforeUnmount(() => {
    if (autoSaveTimer) {
      window.clearTimeout(autoSaveTimer);
      saveDraft();
    }
  });

  return {
    clearDraft,
    restoreDraft,
  };
}
