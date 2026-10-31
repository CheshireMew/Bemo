import { withIndexedDb } from '../storage/transactions.js';
import { createNoteAttachmentRefs, type AttachmentRefRecord } from '../attachments/attachmentRefStorage.js';
import type { NoteMeta } from './notesTypes.js';

type NoteStore = 'cachedNotes' | 'trashNotes';

/** Read, validate and move a note together with its reference projection. */
export async function editLocalNoteRecord(
  source: NoteStore,
  destination: NoteStore,
  noteId: string,
  edit: (note: NoteMeta, destinationNotes: NoteMeta[]) => NoteMeta,
): Promise<{ previous: NoteMeta; next: NoteMeta } | null> {
  let failure: unknown;
  try {
    return await withIndexedDb(['cachedNotes', 'trashNotes', 'attachmentRefs'], 'readwrite', tx => {
      const current = tx.objectStore(source).get(noteId);
      const destinationNotes = tx.objectStore(destination).getAll();
      const refs = tx.objectStore('attachmentRefs').getAll();
      let result: { previous: NoteMeta; next: NoteMeta } | null = null;
      refs.onsuccess = () => {
        if (!current.result) return;
        try {
          const previous = current.result as NoteMeta;
          const next = { ...edit(previous, destinationNotes.result as NoteMeta[]), edit_version: crypto.randomUUID() };
          tx.objectStore(destination).put(next);
          if (source !== destination) tx.objectStore(source).delete(noteId);
          const store = tx.objectStore('attachmentRefs');
          for (const ref of refs.result as AttachmentRefRecord[]) {
            if (ref.owner_type === 'note' && ref.owner_id === noteId) store.delete(ref.id);
          }
          for (const ref of createNoteAttachmentRefs(destination === 'cachedNotes' ? 'active' : 'trash', [next])) store.put(ref);
          result = { previous, next };
        } catch (error) { failure = error; tx.abort(); }
      };
      return () => result;
    });
  } catch (error) { throw failure || error; }
}
