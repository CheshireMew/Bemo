import { shallowRef, watch } from 'vue';
import type { NoteMeta } from '../domain/notes/notesTypes.js';

export function useNoteEditSession(open: () => boolean, note: () => NoteMeta | null) {
  const base = shallowRef<NoteMeta | null>(null);
  watch([open, () => note()?.note_id], ([active]) => {
    const current = note();
    base.value = active && current ? { ...current, tags: [...current.tags] } : null;
  }, { immediate: true, flush: 'sync' });
  return base;
}
