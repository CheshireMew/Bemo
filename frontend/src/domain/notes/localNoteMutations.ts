import type { NoteMeta } from './notesTypes.js';
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
  const next = apply(current);
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
  const next = apply(current);
  await saveTrashNoteRecord(next);
  await syncTrashNoteArtifacts(next);
  return next;
}

export async function updateLocalNote(noteId: string, payload: { content: string; tags: string[] }) {
  const current = await findLocalNoteById(noteId);
  if (!current) {
    throw new Error(`Note not found: ${noteId}`);
  }
  const updated: NoteMeta = {
    ...current,
    title: deriveNoteTitle(payload.content),
    content: payload.content,
    tags: payload.tags,
    revision: current.revision + 1,
    updated_at: Math.floor(Date.now() / 1000),
  };
  await saveActiveNoteRecord(updated);
  await syncActiveNoteArtifacts(updated);
  return updated;
}

export async function patchLocalNote(noteId: string, payload: { pinned?: boolean; tags?: string[] }) {
  const current = await findLocalNoteById(noteId);
  if (!current) {
    throw new Error(`Note not found: ${noteId}`);
  }
  const updated: NoteMeta = {
    ...current,
    pinned: payload.pinned ?? current.pinned,
    tags: payload.tags ?? current.tags,
    revision: current.revision + 1,
    updated_at: Math.floor(Date.now() / 1000),
  };
  await saveActiveNoteRecord(updated);
  await syncActiveNoteArtifacts(updated);
  return updated;
}
