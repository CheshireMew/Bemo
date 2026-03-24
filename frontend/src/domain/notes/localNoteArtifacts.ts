import {
  deleteAttachmentRefsForOwner,
  replaceAttachmentRefsForOwner,
  replaceNoteAttachmentRefsForScope,
} from '../attachments/attachmentRefStorage.js';
import { extractAttachmentFilenames } from '../attachments/attachmentRefParser.js';
import { cleanupOrphanAttachments } from '../attachments/orphanAttachmentCleanup.js';
import type { NoteMeta } from './notesTypes.js';

export async function syncActiveNoteArtifacts(note: NoteMeta): Promise<void> {
  await replaceAttachmentRefsForOwner({
    ownerType: 'note',
    ownerId: note.note_id,
    noteId: note.note_id,
    scope: 'active',
    filenames: extractAttachmentFilenames(note.content),
  });
}

export async function syncTrashNoteArtifacts(note: NoteMeta): Promise<void> {
  await replaceAttachmentRefsForOwner({
    ownerType: 'note',
    ownerId: note.note_id,
    noteId: note.note_id,
    scope: 'trash',
    filenames: extractAttachmentFilenames(note.content),
  });
}

export async function replaceActiveNoteArtifacts(notes: NoteMeta[]): Promise<void> {
  await replaceNoteAttachmentRefsForScope('active', notes);
}

export async function replaceTrashNoteArtifacts(notes: NoteMeta[]): Promise<void> {
  await replaceNoteAttachmentRefsForScope('trash', notes);
}

export async function clearDeletedNoteArtifacts(noteId: string): Promise<void> {
  await deleteAttachmentRefsForOwner('note', noteId);
  await cleanupOrphanAttachments();
}

export async function cleanupDeletedNoteArtifacts(): Promise<void> {
  await cleanupOrphanAttachments();
}
