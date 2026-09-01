import { readStore, writeStore, withIndexedDb } from '../storage/transactions.js';
import type { NoteMeta } from '../notes/notesTypes.js';
import { extractAttachmentFilenames } from './attachmentRefParser.js';

export type AttachmentRefScope = 'active' | 'trash' | 'draft';
export type AttachmentRefOwnerType = 'note' | 'draft';

export interface AttachmentRefRecord {
  id: string;
  owner_type: AttachmentRefOwnerType;
  owner_id: string;
  note_id: string;
  filename: string;
  scope: AttachmentRefScope;
  updatedAt: number;
}

function buildAttachmentRefId(ownerType: AttachmentRefOwnerType, ownerId: string, filename: string) {
  return `${ownerType}:${ownerId}:${filename}`;
}

export function getAllAttachmentRefs(): Promise<AttachmentRefRecord[]> {
  return readStore('attachmentRefs', store => store.getAll());
}

function replaceRefs(matches: (record: AttachmentRefRecord) => boolean, records: AttachmentRefRecord[]) {
  return withIndexedDb('attachmentRefs', 'readwrite', tx => {
    const store = tx.objectStore('attachmentRefs');
    const request = store.getAll();
    request.onsuccess = () => {
      try {
        (request.result as AttachmentRefRecord[]).filter(matches).forEach(record => store.delete(record.id));
        records.forEach(record => store.put(record));
      } catch { tx.abort(); }
    };
  });
}

export function replaceAttachmentRefsForOwner(input: {
  ownerType: AttachmentRefOwnerType; ownerId: string; noteId?: string; scope: AttachmentRefScope; filenames: string[];
}): Promise<void> {
  return replaceRefs(record => record.owner_type === input.ownerType && record.owner_id === input.ownerId,
    [...new Set(input.filenames.filter(Boolean))].map(filename => ({
      id: buildAttachmentRefId(input.ownerType, input.ownerId, filename), owner_type: input.ownerType,
      owner_id: input.ownerId, note_id: input.noteId || '', filename, scope: input.scope, updatedAt: Date.now(),
    })));
}

export function deleteAttachmentRefsForOwner(ownerType: AttachmentRefOwnerType, ownerId: string): Promise<void> {
  return replaceRefs(record => record.owner_type === ownerType && record.owner_id === ownerId, []);
}

export function createNoteAttachmentRefs(scope: 'active' | 'trash', notes: NoteMeta[]): AttachmentRefRecord[] {
  return notes.flatMap(note => extractAttachmentFilenames(note.content || '').map(filename => ({
    id: buildAttachmentRefId('note', note.note_id, filename), owner_type: 'note' as const, owner_id: note.note_id,
    note_id: note.note_id, filename, scope, updatedAt: Date.now(),
  })));
}

export function replaceNoteAttachmentRefsForScope(scope: 'active' | 'trash', notes: NoteMeta[]): Promise<void> {
  return replaceRefs(record => record.owner_type === 'note' && record.scope === scope, createNoteAttachmentRefs(scope, notes));
}

export async function getReferencedAttachmentFilenames(scopes?: AttachmentRefScope[]): Promise<Set<string>> {
  const allRefs = await getAllAttachmentRefs();
  const allowed = scopes ? new Set(scopes) : null;
  return new Set(
    allRefs
      .filter((record) => !allowed || allowed.has(record.scope))
      .map((record) => record.filename),
  );
}

export async function getAttachmentRefFilenamesForNote(noteId: string, scopes?: Array<'active' | 'trash'>): Promise<string[]> {
  const allRefs = await getAllAttachmentRefs();
  const allowed = scopes ? new Set(scopes) : null;
  return Array.from(new Set(
    allRefs
      .filter((record) => (
        record.owner_type === 'note'
        && record.note_id === noteId
        && (!allowed || allowed.has(record.scope as 'active' | 'trash'))
      ))
      .map((record) => record.filename),
  ));
}

export async function getAttachmentRefCountForNote(noteId: string, scopes?: Array<'active' | 'trash'>): Promise<number> {
  return (await getAttachmentRefFilenamesForNote(noteId, scopes)).length;
}

export async function getAttachmentReferenceSummary() {
  const refs = await getAllAttachmentRefs();
  const active = new Set<string>();
  const trash = new Set<string>();
  const draft = new Set<string>();

  refs.forEach((record) => {
    if (record.scope === 'active') active.add(record.filename);
    if (record.scope === 'trash') trash.add(record.filename);
    if (record.scope === 'draft') draft.add(record.filename);
  });

  return {
    activeAttachments: active.size,
    trashAttachments: trash.size,
    draftAttachments: draft.size,
    totalReferencedAttachments: new Set([...active, ...trash, ...draft]).size,
    totalAttachmentRefs: refs.length,
  };
}

export function clearAttachmentRefs(): Promise<void> {
  return writeStore('attachmentRefs', store => { store.clear(); });
}
