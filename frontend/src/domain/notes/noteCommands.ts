import { loadCachedNotes, storeCachedNotes } from './notesCache.js';
import {
  createLocalNote,
  deleteLocalNote,
  listLocalNotes,
  patchLocalNote,
  searchLocalNotes,
  updateLocalNote,
} from './localNotesRepository.js';
import { enqueueRemoteNoteChange } from './notesSync.js';
import type { NoteMeta } from './notesTypes.js';
import { setSyncStateValue } from '../sync/syncStateStorage.js';

export async function loadNotesForDisplay(): Promise<NoteMeta[]> {
  try {
    const notes = await listLocalNotes();
    await setSyncStateValue('local_notes_initialized', '1');
    storeCachedNotes(notes).catch(() => {});
    return notes;
  } catch (error) {
    console.error('Failed to fetch notes, falling back to cache...', error);
    try {
      const cached = await loadCachedNotes();
      if (cached.length > 0) {
        return cached;
      }
    } catch (cacheError) {
      console.error('Failed to load notes from cache either.', cacheError);
    }
    return [];
  }
}

export async function deleteNoteCommand(note: NoteMeta): Promise<void> {
  await deleteLocalNote(note.filename);
  await enqueueRemoteNoteChange({
    entityId: note.note_id,
    type: 'note.trash',
    baseRevision: note.revision,
    payload: {
      filename: note.filename,
      content: note.content,
      tags: note.tags,
      pinned: note.pinned,
      created_at: new Date(note.created_at * 1000).toISOString(),
      revision: note.revision + 1,
    },
  });
}

export async function togglePinCommand(note: NoteMeta): Promise<void> {
  const nextPinned = !note.pinned;
  await patchLocalNote(note.filename, { pinned: nextPinned });
  await enqueueRemoteNoteChange({
    entityId: note.note_id,
    type: 'note.patch',
    baseRevision: note.revision,
    payload: {
      filename: note.filename,
      pinned: nextPinned,
    },
  });
}

export async function updateNoteContentCommand(
  note: NoteMeta,
  payload: { content: string; tags: string[] },
): Promise<void> {
  await updateLocalNote(note.filename, payload);
  await enqueueRemoteNoteChange({
    entityId: note.note_id,
    type: 'note.update',
    baseRevision: note.revision,
    payload: {
      filename: note.filename,
      content: payload.content,
      tags: payload.tags,
    },
  });
}

export async function createNoteContentCommand(payload: { content: string; tags: string[] }) {
  const created = await createLocalNote(payload);
  await enqueueRemoteNoteChange({
    entityId: created.note_id,
    type: 'note.create',
    baseRevision: 0,
    payload: {
      filename: created.filename,
      content: payload.content,
      tags: payload.tags,
      pinned: false,
      created_at: new Date().toISOString(),
      revision: 1,
    },
  });
  return created;
}

export async function searchNotesCommand(query: string): Promise<NoteMeta[]> {
  return searchLocalNotes(query);
}
