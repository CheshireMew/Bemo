import { nextTick, onMounted, watch, type ComputedRef, type Ref } from 'vue';
import { settings } from '../store/settings.js';

export function useEditorLifecycle(options: {
  attachmentSessionKey: Ref<string>;
  initialContent?: string;
  initialTags?: string[];
  autosaveDraft: boolean;
  content: Ref<string>;
  tagInput: Ref<string>;
  showTagInput: Ref<boolean>;
  showPreview: Ref<boolean>;
  previewRef: Ref<HTMLElement | null>;
  propsTagString: ComputedRef<string>;
  hasUnsavedLocalChanges: ComputedRef<boolean>;
  resizeTextarea: () => void;
  syncEditorPreview: () => Promise<void>;
  restoreDraft: () => {
    content?: string;
    tagInput?: string;
    showTagInput?: boolean;
    showPreview?: boolean;
    attachmentSessionKey?: string;
  } | null;
  resetHistory: (value: string) => void;
}) {
  onMounted(async () => {
    options.content.value = options.initialContent || '';
    options.tagInput.value = (options.initialTags || []).join(', ');
    options.showPreview.value = settings.editor.preferredMode === 'rich-text';

    await nextTick();
    options.resizeTextarea();

    if (!options.autosaveDraft) {
      if (options.showPreview.value && options.previewRef.value && options.content.value) {
        await options.syncEditorPreview();
      }
      options.resetHistory(options.content.value);
      return;
    }

    try {
      const draft = options.restoreDraft();
      if (!draft) {
        if (options.showPreview.value && options.previewRef.value && options.content.value) {
          await options.syncEditorPreview();
        }
        options.resetHistory(options.content.value);
        return;
      }

      options.content.value = draft.content ?? '';
      options.tagInput.value = draft.tagInput ?? '';
      options.showTagInput.value = draft.showTagInput ?? false;
      options.showPreview.value = draft.showPreview ?? options.showPreview.value;
      options.attachmentSessionKey.value = draft.attachmentSessionKey || options.attachmentSessionKey.value;

      await nextTick();
      options.resizeTextarea();

      if (options.showPreview.value && options.previewRef.value && options.content.value) {
        await options.syncEditorPreview();
      }
      options.resetHistory(options.content.value);
    } catch (error) {
      console.warn('Failed to restore draft.', error);
      options.resetHistory(options.content.value);
    }
  });

  watch(
    [() => options.initialContent, () => options.propsTagString.value],
    async ([nextContent, nextTags]: [string | undefined, string]) => {
      if (options.autosaveDraft) return;
      if (options.hasUnsavedLocalChanges.value) return;
      options.content.value = String(nextContent || '');
      options.tagInput.value = String(nextTags || '');
      options.showTagInput.value = false;
      await nextTick();
      options.resizeTextarea();
      if (options.showPreview.value && options.previewRef.value) {
        await options.syncEditorPreview();
      }
      options.resetHistory(options.content.value);
    },
  );

  watch(options.content, async () => {
    await nextTick();
    options.resizeTextarea();
  });

  watch(options.showPreview, async () => {
    await nextTick();
    options.resizeTextarea();
  });
}
