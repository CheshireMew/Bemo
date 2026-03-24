import {
  createLocalNoteFromSync,
  createLocalTrashNoteFromSync,
} from '../notes/localNoteCreation.js';
import {
  updateLocalNoteById,
  updateLocalTrashNoteById,
} from '../notes/localNoteMutations.js';
import { deriveNoteTitle, normalizeNoteContentPayload } from '../notes/noteContract.js';
import type { NoteMeta } from '../notes/notesTypes.js';

function requireAppliedNote(note: NoteMeta | null, scope: 'active' | 'trash', noteId: string) {
  if (!note) {
    throw new Error(`Failed to apply remote ${scope} state for note ${noteId}`);
  }
  return note;
}

export async function applyRemoteActiveState(noteId: string, payload: Record<string, unknown>, current?: NoteMeta | null) {
  const remote = normalizeNoteContentPayload(payload, current?.revision ?? 1);

  if (current) {
    const updated = await updateLocalNoteById(noteId, (local) => ({
      ...local,
      filename: remote.filename || local.filename,
      content: remote.content,
      title: deriveNoteTitle(remote.content, local.title, 40),
      tags: remote.tags,
      pinned: remote.pinned ?? local.pinned,
      revision: Math.max(local.revision + 1, remote.revision),
      updated_at: Math.floor(Date.now() / 1000),
    }));
    return requireAppliedNote(updated, 'active', noteId);
  }

  return createLocalNoteFromSync({
    note_id: noteId,
    revision: remote.revision,
    filename: remote.filename,
    content: remote.content,
    tags: remote.tags,
    pinned: remote.pinned ?? false,
    created_at: remote.created_at,
  });
}

export async function applyRemoteTrashState(noteId: string, payload: Record<string, unknown>, current?: NoteMeta | null) {
  const remote = normalizeNoteContentPayload(payload, current?.revision ?? 1);

  if (current) {
    const updated = await updateLocalTrashNoteById(noteId, (local) => ({
      ...local,
      filename: remote.filename || local.filename,
      content: remote.content,
      title: deriveNoteTitle(remote.content, local.title, 40),
      tags: remote.tags,
      pinned: remote.pinned ?? local.pinned,
      revision: Math.max(local.revision + 1, remote.revision),
      updated_at: Math.floor(Date.now() / 1000),
    }));
    return requireAppliedNote(updated, 'trash', noteId);
  }

  return createLocalTrashNoteFromSync({
    note_id: noteId,
    revision: remote.revision,
    filename: remote.filename,
    content: remote.content,
    tags: remote.tags,
    pinned: remote.pinned ?? false,
    created_at: remote.created_at,
  });
}
