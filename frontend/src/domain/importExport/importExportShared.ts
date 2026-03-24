import { enqueueRemoteNoteChange } from '../sync/noteSyncOutbox.js';
import type { NoteMeta } from '../notes/notesTypes.js';

export type ImportedNoteRecord = {
  filename: string;
  note_id: string;
  revision: number;
  content: string;
  tags: string[];
  pinned: boolean;
  created_at: string;
};

export function downloadBlob(data: BlobPart, fileName: string, type = 'application/octet-stream') {
  const url = window.URL.createObjectURL(new Blob([data], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

export async function enqueueImportedNotes(importedNoteRecords: ImportedNoteRecord[]) {
  let queuedAny = false;
  for (const note of importedNoteRecords) {
    queuedAny = await enqueueRemoteNoteChange({
      entityId: note.note_id,
      type: 'note.create',
      baseRevision: 0,
      payload: {
        filename: note.filename,
        content: note.content,
        tags: note.tags,
        pinned: note.pinned,
        created_at: note.created_at,
        revision: note.revision,
      },
    }) || queuedAny;
  }
  return queuedAny;
}

export function toImportedNoteRecord(note: NoteMeta): ImportedNoteRecord {
  return {
    filename: note.filename,
    note_id: note.note_id,
    revision: note.revision,
    content: note.content,
    tags: note.tags,
    pinned: note.pinned,
    created_at: new Date(note.created_at * 1000).toISOString(),
  };
}
