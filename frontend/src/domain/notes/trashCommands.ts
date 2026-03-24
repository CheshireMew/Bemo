import {
  emptyLocalTrashNotes,
  permanentlyDeleteLocalTrashNote,
  restoreLocalTrashNote,
} from './localTrashMutations.js';
import { listLocalTrashNotes } from './localNoteQueries.js';
import type { NoteMeta } from './notesTypes.js';
import { enqueueRemoteNoteChange } from '../sync/noteSyncOutbox.js';

export async function loadTrashForDisplay(): Promise<NoteMeta[]> {
  return listLocalTrashNotes();
}

export async function restoreTrashNoteCommand(noteId: string): Promise<boolean> {
  const restored = await restoreLocalTrashNote(noteId);
  return enqueueRemoteNoteChange({
    entityId: restored.note_id,
    type: 'note.restore',
    baseRevision: restored.revision - 1,
    payload: {
      filename: restored.filename,
      content: restored.content,
      tags: restored.tags,
      pinned: restored.pinned,
      created_at: new Date(restored.created_at * 1000).toISOString(),
      revision: restored.revision,
    },
  });
}

export async function permanentlyDeleteTrashNoteCommand(noteId: string): Promise<boolean> {
  const deleted = await permanentlyDeleteLocalTrashNote(noteId);
  if (!deleted) return false;
  return enqueueRemoteNoteChange({
    entityId: deleted.note_id,
    type: 'note.purge',
    baseRevision: deleted.revision,
    payload: {
      filename: deleted.filename,
      revision: deleted.revision + 1,
    },
  });
}

export async function emptyTrashCommand(): Promise<boolean> {
  const deleted = await emptyLocalTrashNotes();
  let queuedAny = false;
  for (const note of deleted) {
    queuedAny = await enqueueRemoteNoteChange({
      entityId: note.note_id,
      type: 'note.purge',
      baseRevision: note.revision,
      payload: {
        filename: note.filename,
        revision: note.revision + 1,
      },
    }) || queuedAny;
  }
  return queuedAny;
}
