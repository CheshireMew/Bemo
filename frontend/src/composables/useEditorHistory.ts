import { nextTick, ref, watch, type Ref } from 'vue';

export type EditorHistoryEntry = {
  content: string;
  selectionStart: number;
  selectionEnd: number;
  mode: 'markdown' | 'rich-text';
};

export function useEditorHistory(options: {
  content: Ref<string>;
  showPreview: Ref<boolean>;
  textareaRef: Ref<HTMLTextAreaElement | null>;
  previewRef: Ref<HTMLElement | null>;
  resizeTextarea: () => void;
  syncEditorPreview: () => Promise<void>;
  getPreviewSelectionOffsets: () => { start: number; end: number };
  restorePreviewSelectionOffsets: (start: number, end: number) => void;
}) {
  const undoStack = ref<EditorHistoryEntry[]>([]);
  const redoStack = ref<EditorHistoryEntry[]>([]);
  const isApplyingHistory = ref(false);
  const historyReady = ref(false);

  const resetHistory = (value: string) => {
    undoStack.value = [];
    redoStack.value = [];
    historyReady.value = true;
    if (value !== options.content.value) {
      options.content.value = value;
    }
  };

  const captureHistoryEntry = (entryContent: string): EditorHistoryEntry => {
    if (!options.showPreview.value) {
      return {
        content: entryContent,
        selectionStart: options.textareaRef.value?.selectionStart ?? entryContent.length,
        selectionEnd: options.textareaRef.value?.selectionEnd ?? entryContent.length,
        mode: 'markdown',
      };
    }

    const offsets = options.getPreviewSelectionOffsets();
    return {
      content: entryContent,
      selectionStart: offsets.start,
      selectionEnd: offsets.end,
      mode: 'rich-text',
    };
  };

  const applyHistoryContent = async (entry: EditorHistoryEntry) => {
    isApplyingHistory.value = true;
    try {
      options.content.value = entry.content;
      await nextTick();
      options.resizeTextarea();

      if (options.showPreview.value && options.previewRef.value) {
        await options.syncEditorPreview();
        requestAnimationFrame(() => options.restorePreviewSelectionOffsets(entry.selectionStart, entry.selectionEnd));
        return;
      }

      requestAnimationFrame(() => {
        const textarea = options.textareaRef.value;
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(
          Math.min(entry.selectionStart, textarea.value.length),
          Math.min(entry.selectionEnd, textarea.value.length),
        );
      });
    } finally {
      isApplyingHistory.value = false;
    }
  };

  const undoContent = async () => {
    const previous = undoStack.value.pop();
    if (previous === undefined) return;

    redoStack.value.push(captureHistoryEntry(options.content.value));
    await applyHistoryContent(previous);
  };

  const redoContent = async () => {
    const next = redoStack.value.pop();
    if (next === undefined) return;

    undoStack.value.push(captureHistoryEntry(options.content.value));
    await applyHistoryContent(next);
  };

  watch(options.content, (newVal, oldVal) => {
    if (!historyReady.value || isApplyingHistory.value || newVal === oldVal) {
      return;
    }

    undoStack.value.push(captureHistoryEntry(oldVal));
    if (undoStack.value.length > 200) {
      undoStack.value.shift();
    }
    redoStack.value = [];
  });

  return {
    resetHistory,
    undoContent,
    redoContent,
  };
}
