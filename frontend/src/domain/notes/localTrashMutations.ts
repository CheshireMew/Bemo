import type { NoteMeta } from './notesTypes.js';
import {
  cleanupDeletedNoteArtifacts,
  clearDeletedNoteArtifacts,
  replaceTrashNoteArtifacts,
  syncActiveNoteArtifacts,
  syncTrashNoteArtifacts,
} from './localNoteArtifacts.js';
import {
  findLocalNoteById,
  findLocalTrashNoteById,
  listLocalTrashNotes,
} from './localNoteQueries.js';
import {
  deleteActiveNoteRecord,
  deleteTrashNoteRecord,
  replaceTrashNoteRecords,
  saveActiveNoteRecord,
  saveTrashNoteRecord,
} from './localNotePersistence.js';
import { ensureUniqueNoteFilename } from './localNoteCreation.js';

export async function moveLocalNoteToTrashById(noteId: string): Promise<NoteMeta | null> {
  const current = await findLocalNoteById(noteId);
  if (!current) return null;

  const trashed: NoteMeta = {
    ...current,
    revision: current.revision + 1,
    updated_at: Math.floor(Date.now() / 1000),
  };
  await saveTrashNoteRecord(trashed);
  await syncTrashNoteArtifacts(trashed);
  await deleteActiveNoteRecord(current.note_id);
  return current;
}

export async function deleteLocalNote(noteId: string) {
  const current = await findLocalNoteById(noteId);
  if (!current) {
    throw new Error(`Note not found: ${noteId}`);
  }

  const trashed: NoteMeta = {
    ...current,
    revision: current.revision + 1,
    updated_at: Math.floor(Date.now() / 1000),
  };
  await saveTrashNoteRecord(trashed);
  await syncTrashNoteArtifacts(trashed);
  await deleteActiveNoteRecord(current.note_id);
  return trashed;
}

export async function restoreLocalTrashNote(noteId: string) {
  const current = await findLocalTrashNoteById(noteId);
  if (!current) {
    throw new Error(`Trash note not found: ${noteId}`);
  }

  const restoredFilename = await ensureUniqueNoteFilename(
    current.filename.replace(/\.md$/i, ''),
    current.filename,
  );
  const restored: NoteMeta = {
    ...current,
    filename: restoredFilename,
    revision: current.revision + 1,
    updated_at: Math.floor(Date.now() / 1000),
  };
  await saveActiveNoteRecord(restored);
  await syncActiveNoteArtifacts(restored);
  await deleteTrashNoteRecord(current.note_id);
  return restored;
}

export async function permanentlyDeleteLocalTrashNote(noteId: string) {
  const current = await findLocalTrashNoteById(noteId);
  await deleteTrashNoteRecord(noteId);
  if (current) {
    await clearDeletedNoteArtifacts(current.note_id);
  }
  return current;
}

export async function purgeLocalNoteById(noteId: string) {
  const [active, trash] = await Promise.all([
    findLocalNoteById(noteId),
    findLocalTrashNoteById(noteId),
  ]);

  if (active) {
    await deleteActiveNoteRecord(active.note_id);
  }
  if (trash) {
    await deleteTrashNoteRecord(trash.note_id);
  }
  if (active || trash) {
    await clearDeletedNoteArtifacts(noteId);
  }

  return trash || active;
}

export async function emptyLocalTrashNotes() {
  const trash = await listLocalTrashNotes();
  await replaceTrashNoteRecords([]);
  await replaceTrashNoteArtifacts([]);
  await cleanupDeletedNoteArtifacts();
  return trash;
}
