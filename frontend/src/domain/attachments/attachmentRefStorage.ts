import { openIndexedDb } from '../../utils/indexedDb.js';
import type { NoteMeta } from '../notes/notesTypes.js';
import { extractAttachmentFilename } from '../../utils/attachmentUrls.js';
import { extractAttachmentUrlsFromContent } from '../../utils/syncAttachments.js';

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

export function extractAttachmentFilenames(content: string): string[] {
  const filenames = new Set<string>();
  for (const url of extractAttachmentUrlsFromContent(content || '')) {
    const filename = extractAttachmentFilename(url);
    if (filename) {
      filenames.add(filename);
    }
  }
  return [...filenames];
}

export async function getAllAttachmentRefs(): Promise<AttachmentRefRecord[]> {
  const db = await openIndexedDb();
  const tx = db.transaction('attachmentRefs', 'readonly');
  return new Promise((resolve) => {
    const req = tx.objectStore('attachmentRefs').getAll();
    req.onsuccess = () => resolve((req.result || []) as AttachmentRefRecord[]);
  });
}

export async function replaceAttachmentRefsForOwner(input: {
  ownerType: AttachmentRefOwnerType;
  ownerId: string;
  noteId?: string;
  scope: AttachmentRefScope;
  filenames: string[];
}): Promise<void> {
  const existing = await getAllAttachmentRefs();
  const nextFilenames = new Set(input.filenames.filter(Boolean));
  const db = await openIndexedDb();
  const tx = db.transaction('attachmentRefs', 'readwrite');
  const store = tx.objectStore('attachmentRefs');
  let hasWrites = false;

  existing
    .filter((record) => record.owner_type === input.ownerType && record.owner_id === input.ownerId)
    .forEach((record) => {
      if (!nextFilenames.has(record.filename)) {
        hasWrites = true;
        store.delete(record.id);
      }
    });

  nextFilenames.forEach((filename) => {
    hasWrites = true;
    store.put({
      id: buildAttachmentRefId(input.ownerType, input.ownerId, filename),
      owner_type: input.ownerType,
      owner_id: input.ownerId,
      note_id: input.noteId || '',
      filename,
      scope: input.scope,
      updatedAt: Date.now(),
    } as AttachmentRefRecord);
  });

  if (!hasWrites) {
    return;
  }

  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}

export async function deleteAttachmentRefsForOwner(ownerType: AttachmentRefOwnerType, ownerId: string): Promise<void> {
  await replaceAttachmentRefsForOwner({
    ownerType,
    ownerId,
    scope: ownerType === 'note' ? 'active' : 'draft',
    filenames: [],
  });
}

export async function replaceNoteAttachmentRefsForScope(scope: 'active' | 'trash', notes: NoteMeta[]): Promise<void> {
  const existing = await getAllAttachmentRefs();
  const db = await openIndexedDb();
  const tx = db.transaction('attachmentRefs', 'readwrite');
  const store = tx.objectStore('attachmentRefs');
  let hasWrites = false;

  existing
    .filter((record) => record.owner_type === 'note' && record.scope === scope)
    .forEach((record) => {
      hasWrites = true;
      store.delete(record.id);
    });

  notes.forEach((note) => {
    extractAttachmentFilenames(note.content || '').forEach((filename) => {
      hasWrites = true;
      store.put({
        id: buildAttachmentRefId('note', note.note_id, filename),
        owner_type: 'note',
        owner_id: note.note_id,
        note_id: note.note_id,
        filename,
        scope,
        updatedAt: Date.now(),
      } as AttachmentRefRecord);
    });
  });

  if (!hasWrites) {
    return;
  }

  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
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

export async function clearAttachmentRefs(): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('attachmentRefs', 'readwrite');
  tx.objectStore('attachmentRefs').clear();
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}
