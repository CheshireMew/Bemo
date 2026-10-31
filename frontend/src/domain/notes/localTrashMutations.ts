import type { NoteMeta } from './notesTypes.js';
import {
  cleanupDeletedNoteArtifacts,
  clearDeletedNoteArtifacts,
  replaceTrashNoteArtifacts,
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
} from './localNotePersistence.js';
import { editLocalNoteRecord } from './localNoteTransactions.js';
import { withIndexedDb } from '../storage/transactions.js';
import type { AttachmentRefRecord } from '../attachments/attachmentRefStorage.js';

export async function moveLocalNoteToTrashById(noteId: string): Promise<NoteMeta | null> {
  const result = await moveToTrash(noteId);
  return result?.previous ?? null;
}

export async function deleteLocalNote(noteId: string) {
  const result = await moveToTrash(noteId);
  if (!result) throw new Error(`Note not found: ${noteId}`);
  return result.next;
}

function moveToTrash(noteId: string) {
  return editLocalNoteRecord('cachedNotes', 'trashNotes', noteId, current => ({
    ...current,
    revision: current.revision + 1,
    updated_at: Math.floor(Date.now() / 1000),
  }));
}

export async function restoreLocalTrashNote(noteId: string) {
  const result = await editLocalNoteRecord('trashNotes', 'cachedNotes', noteId, (current, active) => {
    const occupied = new Set(active.filter(note => note.note_id !== noteId).map(note => note.filename));
    let filename = current.filename;
    for (let suffix = 1; occupied.has(filename); suffix++) filename = `${current.filename.replace(/\.md$/i, '')}-${suffix}.md`;
    return {
      ...current,
      filename,
      revision: current.revision + 1,
      updated_at: Math.floor(Date.now() / 1000),
    };
  });
  if (!result) throw new Error(`Trash note not found: ${noteId}`);
  return result.next;
}

export async function permanentlyDeleteLocalTrashNote(noteId: string, expected?: NoteMeta) {
  let failure: unknown;
  const current = await withIndexedDb(['trashNotes', 'attachmentRefs'], 'readwrite', tx => {
    const note = tx.objectStore('trashNotes').get(noteId), refs = tx.objectStore('attachmentRefs').getAll();
    refs.onsuccess = () => {
      const existing = note.result as NoteMeta | undefined;
      if (!existing) return;
      if (expected && (existing.revision !== expected.revision || existing.edit_version !== expected.edit_version)) {
        failure = new Error('回收站笔记已变化，未执行永久删除。请刷新后重试。'); tx.abort(); return;
      }
      tx.objectStore('trashNotes').delete(noteId);
      for (const ref of refs.result as AttachmentRefRecord[]) if (ref.owner_type === 'note' && ref.owner_id === noteId) tx.objectStore('attachmentRefs').delete(ref.id);
    };
    return () => (note.result as NoteMeta | undefined) || null;
  }).catch(error => { throw failure || error; });
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
