import { loadCachedNotes, storeCachedNotes } from '../notes/notesCache.js';
import {
  createBackendNote,
  emptyBackendTrash,
  listBackendNotes,
  listBackendTrashNotes,
  patchBackendNote,
  purgeBackendTrashNote,
  restoreBackendTrashNote,
  searchBackendNotes,
  trashBackendNote,
  updateBackendNote,
} from '../notes/backendNotesApi.js';
import { prepareBackendAttachments } from '../attachments/backendAttachmentRuntime.js';
import { replaceNoteAttachmentRefsForScope } from '../attachments/attachmentRefStorage.js';
import { enqueueImportedNotes, toImportedNoteRecord } from '../importExport/importExportShared.js';
import { createLocalNote } from '../notes/localNoteCreation.js';
import { patchLocalNote, updateLocalNote } from '../notes/localNoteMutations.js';
import {
  listLocalNotes,
  listLocalTrashNotes,
  searchLocalNotes,
} from '../notes/localNoteQueries.js';
import { getCachedNotes, setCachedNotes } from '../notes/notesStorage.js';
import {
  deleteLocalNote,
  emptyLocalTrashNotes,
  permanentlyDeleteLocalTrashNote,
  restoreLocalTrashNote,
} from '../notes/localTrashMutations.js';
import type { NoteMeta } from '../notes/notesTypes.js';
import { shouldUseBackendAppStore } from '../runtime/appStoreRuntime.js';
import { enqueueRemoteNoteChange } from '../sync/noteSyncOutbox.js';
import { readSyncConfigSnapshot } from '../sync/syncConfig.js';

function finishNoteMutation(input: Parameters<typeof enqueueRemoteNoteChange>[0]) {
  // Backend mutations commit their outbox record in the same SQLite transaction.
  return shouldUseBackendAppStore()
    ? Promise.resolve(readSyncConfigSnapshot().mode !== 'local')
    : enqueueRemoteNoteChange(input);
}

export type NotesReadResult = { notes: NoteMeta[]; source: 'primary' | 'cache'; error: string };

export async function listDisplayNotes(): Promise<NotesReadResult> {
  try {
    const notes = shouldUseBackendAppStore()
      ? await listBackendNotes()
      : await listLocalNotes();
    if (shouldUseBackendAppStore()) await storeCachedNotes(notes).catch(() => {});
    return { notes, source: 'primary', error: '' };
  } catch (error) {
    const cached = await loadCachedNotes().catch(() => []);
    return { notes: cached, source: 'cache', error: error instanceof Error ? error.message : '无法读取笔记。' };
  }
}

export async function listActiveNotesSnapshot(): Promise<NoteMeta[]> {
  return shouldUseBackendAppStore()
    ? listBackendNotes()
    : listLocalNotes();
}

export async function searchDisplayNotes(query: string): Promise<NoteMeta[]> {
  return shouldUseBackendAppStore()
    ? searchBackendNotes(query)
    : searchLocalNotes(query);
}

export async function createNote(input: { content: string; tags: string[] }) {
  if (shouldUseBackendAppStore()) {
    const created = await createBackendNote({
      ...input,
      attachments: await prepareBackendAttachments(input.content),
    });
    const syncQueued = await finishNoteMutation({
      entityId: created.note_id,
      type: 'note.create',
      baseRevision: 0,
      payload: {
        filename: created.filename,
        content: input.content,
        tags: input.tags,
        pinned: false,
        created_at: new Date(created.created_at * 1000).toISOString(),
        revision: 1,
      },
    });
    return { ...created, syncQueued };
  }

  const created = await createLocalNote(input);
  const syncQueued = await finishNoteMutation({
    entityId: created.note_id,
    type: 'note.create',
    baseRevision: 0,
    payload: {
      filename: created.filename,
      content: input.content,
      tags: input.tags,
      pinned: false,
      created_at: new Date().toISOString(),
      revision: 1,
    },
  });
  return { ...created, syncQueued };
}

export async function updateNote(note: NoteMeta, input: { content: string; tags: string[] }) {
  if (shouldUseBackendAppStore()) {
    await updateBackendNote(note.note_id, {
      ...input,
      attachments: await prepareBackendAttachments(input.content, note.note_id),
    });
    return finishNoteMutation({
      entityId: note.note_id,
      type: 'note.update',
      baseRevision: note.revision,
      payload: {
        filename: note.filename,
        content: input.content,
        tags: input.tags,
      },
    });
  }

  await updateLocalNote(note.note_id, input);
  return finishNoteMutation({
    entityId: note.note_id,
    type: 'note.update',
    baseRevision: note.revision,
    payload: {
      filename: note.filename,
      content: input.content,
      tags: input.tags,
    },
  });
}

export async function togglePinned(note: NoteMeta) {
  if (shouldUseBackendAppStore()) {
    await patchBackendNote(note.note_id, { pinned: !note.pinned });
    const nextPinned = !note.pinned;
    return finishNoteMutation({
      entityId: note.note_id,
      type: 'note.patch',
      baseRevision: note.revision,
      payload: {
        filename: note.filename,
        pinned: nextPinned,
      },
    });
  }

  const nextPinned = !note.pinned;
  await patchLocalNote(note.note_id, { pinned: nextPinned });
  return finishNoteMutation({
    entityId: note.note_id,
    type: 'note.patch',
    baseRevision: note.revision,
    payload: {
      filename: note.filename,
      pinned: nextPinned,
    },
  });
}

export async function moveNoteToTrash(note: NoteMeta) {
  if (shouldUseBackendAppStore()) {
    await trashBackendNote(note.note_id);
    return finishNoteMutation({
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

  await deleteLocalNote(note.note_id);
  return finishNoteMutation({
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

export async function listDisplayTrash(): Promise<NoteMeta[]> {
  return shouldUseBackendAppStore()
    ? listBackendTrashNotes()
    : listLocalTrashNotes();
}

export async function restoreTrashNote(noteId: string) {
  if (shouldUseBackendAppStore()) {
    const restored = await restoreBackendTrashNote(noteId);
    return finishNoteMutation({
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

  const restored = await restoreLocalTrashNote(noteId);
  return finishNoteMutation({
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

export async function purgeTrashNote(noteId: string) {
  if (shouldUseBackendAppStore()) {
    await purgeBackendTrashNote(noteId);
    return finishNoteMutation({
      entityId: noteId,
      type: 'note.purge',
      baseRevision: 0,
      payload: {
        revision: 0,
      },
    });
  }

  const deleted = await permanentlyDeleteLocalTrashNote(noteId);
  if (!deleted) return false;
  return finishNoteMutation({
    entityId: deleted.note_id,
    type: 'note.purge',
    baseRevision: deleted.revision,
    payload: {
      filename: deleted.filename,
      revision: deleted.revision + 1,
    },
  });
}

export async function clearTrash() {
  if (shouldUseBackendAppStore()) {
    const deleted = await emptyBackendTrash();
    return deleted.length > 0 && readSyncConfigSnapshot().mode !== 'local';
  }

  const deleted = await emptyLocalTrashNotes();
  let queuedAny = false;
  for (const note of deleted) {
    queuedAny = await finishNoteMutation({
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

export async function importExternalNotes(notes: NoteMeta[]) {
  if (notes.length === 0) {
    return {
      imported_count: 0,
      imported_note_records: [],
      sync_queued: false,
    };
  }

  if (shouldUseBackendAppStore()) {
    const importedNoteRecords: ReturnType<typeof toImportedNoteRecord>[] = [];
    for (const note of notes) {
      const saved = await createBackendNote({
        content: note.content,
        tags: note.tags,
        attachments: await prepareBackendAttachments(note.content, undefined, 'import'),
        created_at: new Date(note.created_at * 1000).toISOString(),
        pinned: note.pinned,
        revision: note.revision,
      });
      importedNoteRecords.push(toImportedNoteRecord(saved));
    }

    const sync_queued = readSyncConfigSnapshot().mode !== 'local';
    return {
      imported_count: notes.length,
      imported_note_records: importedNoteRecords,
      sync_queued,
    };
  }

  const existing = await getCachedNotes();
  const mergedNotes = [...notes, ...existing];
  await setCachedNotes(mergedNotes);
  await replaceNoteAttachmentRefsForScope('active', mergedNotes);

  const importedNoteRecords = notes.map(toImportedNoteRecord);
  const syncQueued = await enqueueImportedNotes(importedNoteRecords);
  return {
    imported_count: notes.length,
    imported_note_records: importedNoteRecords,
    sync_queued: syncQueued,
  };
}
