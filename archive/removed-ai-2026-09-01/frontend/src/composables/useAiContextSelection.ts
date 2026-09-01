import { computed, watch, type ComputedRef, type Ref } from 'vue';
import type { NoteMeta } from '../domain/notes/notesTypes.js';
import type { TimeRange } from './useAiConversations.js';

export function useAiContextSelection(options: {
  selectedRange: Ref<TimeRange | null>;
  notes: Ref<NoteMeta[]>;
  displayedNotes: ComputedRef<NoteMeta[]>;
  aiChatNoteId: Ref<string | null>;
  aiChatNoteLabel: Ref<string>;
  isAiChatOpen: Ref<boolean>;
  createNoteConversation: () => Promise<void>;
  clearMessages: () => void;
  clearError: () => void;
}) {
  const rangeOptions: Array<{ value: TimeRange; label: string }> = [
    { value: 'filtered', label: '已筛选笔记' },
    { value: 'all-notes', label: '全部笔记' },
    { value: 'day', label: '过去一天' },
    { value: 'week', label: '过去一周' },
    { value: 'month', label: '过去一月' },
    { value: 'year', label: '过去一年' },
  ];

  const aiContextNote = computed(() => {
    if (!options.aiChatNoteId.value) return null;
    return options.notes.value.find((note) => note.note_id === options.aiChatNoteId.value) || null;
  });

  const aiContextLabel = computed(() => {
    const explicit = options.aiChatNoteLabel.value.trim();
    if (explicit) return explicit;
    const content = aiContextNote.value?.content?.trim() || '';
    const firstLine = content.split('\n')[0]?.replace(/^#+\s*/, '').trim() || '';
    if (firstLine) return firstLine.slice(0, 20);
    return '当前笔记';
  });

  const contextNotes = computed(() => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const rangeSecondsMap: Record<'day' | 'week' | 'month' | 'year', number> = {
      day: 24 * 60 * 60,
      week: 7 * 24 * 60 * 60,
      month: 30 * 24 * 60 * 60,
      year: 365 * 24 * 60 * 60,
    };

    if (aiContextNote.value) {
      return [aiContextNote.value];
    }

    if (options.selectedRange.value === null) {
      return [];
    }

    if (options.selectedRange.value === 'filtered') {
      return options.displayedNotes.value;
    }

    if (options.selectedRange.value === 'all-notes') {
      return options.notes.value;
    }

    const cutoff = nowSeconds - rangeSecondsMap[options.selectedRange.value];
    return options.notes.value.filter((note) => note.created_at >= cutoff);
  });

  watch(options.isAiChatOpen, async (open: boolean) => {
    if (!open || !aiContextNote.value) return;
    options.selectedRange.value = null;
    options.clearMessages();
    options.clearError();
    await options.createNoteConversation();
  });

  return {
    aiContextLabel,
    aiContextNote,
    contextNotes,
    rangeOptions,
  };
}
