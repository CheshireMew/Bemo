import type { NoteMeta } from './notesTypes.js';
import { editLocalNoteRecord } from './localNoteTransactions.js';
import {
  deriveNoteTitle,
} from './noteContract.js';
import {
  syncActiveNoteArtifacts,
  syncTrashNoteArtifacts,
} from './localNoteArtifacts.js';
import {
  findLocalNoteById,
  findLocalTrashNoteById,
} from './localNoteQueries.js';
import {
  saveActiveNoteRecord,
  saveTrashNoteRecord,
} from './localNotePersistence.js';

export async function updateLocalNoteById(
  noteId: string,
  apply: (current: NoteMeta) => NoteMeta,
): Promise<NoteMeta | null> {
  const current = await findLocalNoteById(noteId);
  if (!current) return null;
  const next = { ...apply(current), edit_version: crypto.randomUUID() };
  await saveActiveNoteRecord(next);
  await syncActiveNoteArtifacts(next);
  return next;
}

export async function updateLocalTrashNoteById(
  noteId: string,
  apply: (current: NoteMeta) => NoteMeta,
): Promise<NoteMeta | null> {
  const current = await findLocalTrashNoteById(noteId);
  if (!current) return null;
  const next = { ...apply(current), edit_version: crypto.randomUUID() };
  await saveTrashNoteRecord(next);
  await syncTrashNoteArtifacts(next);
  return next;
}

export async function updateLocalNote(noteId: string, payload: { content: string; tags: string[] }, baseRevision: number, baseEditVersion?: string) {
  const result = await editLocalNoteRecord('cachedNotes', 'cachedNotes', noteId, current => {
    if (current.revision !== baseRevision || current.edit_version !== baseEditVersion) throw new Error('这条笔记已更新。本次内容仍保留，请对照最新笔记后重新编辑。');
    return {
      ...current,
      title: deriveNoteTitle(payload.content),
      content: payload.content,
      tags: payload.tags,
      revision: current.revision + 1,
      updated_at: Math.floor(Date.now() / 1000),
    };
  });
  if (!result) throw new Error(`Note not found: ${noteId}`);
  return result.next;
}

export async function patchLocalNote(noteId: string, payload: { pinned?: boolean; tags?: string[] }, baseRevision: number, baseEditVersion?: string) {
  const result = await editLocalNoteRecord('cachedNotes', 'cachedNotes', noteId, current => {
    if (current.revision !== baseRevision || current.edit_version !== baseEditVersion) throw new Error('这条笔记已更新，请刷新后重试。');
    return { ...current, pinned: payload.pinned ?? current.pinned, tags: payload.tags ?? current.tags,
      revision: current.revision + 1, updated_at: Math.floor(Date.now() / 1000) };
  });
  if (!result) throw new Error(`Note not found: ${noteId}`);
  return result.next;
}
