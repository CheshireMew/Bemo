import {
  emptyLocalTrashNotes,
  listLocalTrashNotes,
  permanentlyDeleteLocalTrashNote,
  restoreLocalTrashNote,
} from './localNotesRepository.js';
import type { NoteMeta } from './notesTypes.js';
import { setSyncStateValue } from '../sync/syncStateStorage.js';
import { enqueueRemoteNoteChange } from './notesSync.js';

export async function loadTrashForDisplay(): Promise<NoteMeta[]> {
  const trash = await listLocalTrashNotes();
  await setSyncStateValue('local_trash_initialized', '1');
  return trash;
}

export async function restoreTrashNoteCommand(filename: string): Promise<void> {
  const restored = await restoreLocalTrashNote(filename);
  await enqueueRemoteNoteChange({
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

export async function permanentlyDeleteTrashNoteCommand(filename: string): Promise<void> {
  const deleted = await permanentlyDeleteLocalTrashNote(filename);
  if (!deleted) return;
  await enqueueRemoteNoteChange({
    entityId: deleted.note_id,
    type: 'note.purge',
    baseRevision: deleted.revision,
    payload: {
      filename: deleted.filename,
      revision: deleted.revision + 1,
    },
  });
}

export async function emptyTrashCommand(): Promise<void> {
  const deleted = await emptyLocalTrashNotes();
  for (const note of deleted) {
    await enqueueRemoteNoteChange({
      entityId: note.note_id,
      type: 'note.purge',
      baseRevision: note.revision,
      payload: {
        filename: note.filename,
        revision: note.revision + 1,
      },
    });
  }
}
