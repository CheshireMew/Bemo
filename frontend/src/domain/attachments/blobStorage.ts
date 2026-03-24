import { openIndexedDb } from '../storage/indexedDb.js';

export interface BlobIndexRecord {
  blob_hash: string;
  filename: string;
  mime_type: string;
  size: number;
  updatedAt: number;
}

export interface AttachmentBlobRecord {
  filename: string;
  blob: Blob;
  mime_type: string;
  updatedAt: number;
}

export interface DraftAttachmentBlobRecord extends AttachmentBlobRecord {
  session_key: string;
}

export async function getBlobIndexRecord(blobHash: string): Promise<BlobIndexRecord | null> {
  const db = await openIndexedDb();
  const tx = db.transaction('blobIndex', 'readonly');
  return new Promise((resolve) => {
    const req = tx.objectStore('blobIndex').get(blobHash);
    req.onsuccess = () => resolve((req.result as BlobIndexRecord | undefined) ?? null);
  });
}

export async function getAllBlobIndexRecords(): Promise<BlobIndexRecord[]> {
  const db = await openIndexedDb();
  const tx = db.transaction('blobIndex', 'readonly');
  return new Promise((resolve) => {
    const req = tx.objectStore('blobIndex').getAll();
    req.onsuccess = () => resolve((req.result || []) as BlobIndexRecord[]);
  });
}

export async function hasBlobIndexRecord(blobHash: string): Promise<boolean> {
  return Boolean(await getBlobIndexRecord(blobHash));
}

export async function putBlobIndexRecord(input: {
  blobHash: string;
  filename: string;
  mimeType?: string;
  size: number;
}): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('blobIndex', 'readwrite');
  tx.objectStore('blobIndex').put({
    blob_hash: input.blobHash,
    filename: input.filename,
    mime_type: input.mimeType || 'application/octet-stream',
    size: input.size,
    updatedAt: Date.now(),
  } as BlobIndexRecord);
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}

export async function deleteBlobIndexRecord(blobHash: string): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('blobIndex', 'readwrite');
  tx.objectStore('blobIndex').delete(blobHash);
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}

export async function putAttachmentBlob(input: {
  filename: string;
  blob: Blob;
  mimeType?: string;
}): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('attachmentBlobs', 'readwrite');
  tx.objectStore('attachmentBlobs').put({
    filename: input.filename,
    blob: input.blob,
    mime_type: input.mimeType || input.blob.type || 'application/octet-stream',
    updatedAt: Date.now(),
  } as AttachmentBlobRecord);
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}

export async function getAttachmentBlobRecord(filename: string): Promise<AttachmentBlobRecord | null> {
  const db = await openIndexedDb();
  const tx = db.transaction('attachmentBlobs', 'readonly');
  return new Promise((resolve) => {
    const req = tx.objectStore('attachmentBlobs').get(filename);
    req.onsuccess = () => resolve((req.result as AttachmentBlobRecord | undefined) ?? null);
  });
}

export async function getAttachmentBlob(filename: string): Promise<Blob | null> {
  return (await getAttachmentBlobRecord(filename))?.blob ?? null;
}

export async function putDraftAttachmentBlob(input: {
  sessionKey: string;
  filename: string;
  blob: Blob;
  mimeType?: string;
}): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('draftAttachmentBlobs', 'readwrite');
  tx.objectStore('draftAttachmentBlobs').put({
    session_key: input.sessionKey,
    filename: input.filename,
    blob: input.blob,
    mime_type: input.mimeType || input.blob.type || 'application/octet-stream',
    updatedAt: Date.now(),
  } as DraftAttachmentBlobRecord);
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}

export async function getDraftAttachmentBlobRecord(filename: string): Promise<DraftAttachmentBlobRecord | null> {
  const db = await openIndexedDb();
  const tx = db.transaction('draftAttachmentBlobs', 'readonly');
  return new Promise((resolve) => {
    const req = tx.objectStore('draftAttachmentBlobs').get(filename);
    req.onsuccess = () => resolve((req.result as DraftAttachmentBlobRecord | undefined) ?? null);
  });
}

export async function getDraftAttachmentBlob(filename: string): Promise<Blob | null> {
  return (await getDraftAttachmentBlobRecord(filename))?.blob ?? null;
}

export async function getAllAttachmentBlobRecords(): Promise<AttachmentBlobRecord[]> {
  const db = await openIndexedDb();
  const tx = db.transaction('attachmentBlobs', 'readonly');
  return new Promise((resolve) => {
    const req = tx.objectStore('attachmentBlobs').getAll();
    req.onsuccess = () => resolve((req.result || []) as AttachmentBlobRecord[]);
  });
}

export async function deleteAttachmentBlob(filename: string): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('attachmentBlobs', 'readwrite');
  tx.objectStore('attachmentBlobs').delete(filename);
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}

export async function getAllDraftAttachmentBlobRecords(): Promise<DraftAttachmentBlobRecord[]> {
  const db = await openIndexedDb();
  const tx = db.transaction('draftAttachmentBlobs', 'readonly');
  return new Promise((resolve) => {
    const req = tx.objectStore('draftAttachmentBlobs').getAll();
    req.onsuccess = () => resolve((req.result || []) as DraftAttachmentBlobRecord[]);
  });
}

export async function getDraftAttachmentBlobRecordsForSession(sessionKey: string): Promise<DraftAttachmentBlobRecord[]> {
  const rows = await getAllDraftAttachmentBlobRecords();
  return rows.filter((row) => row.session_key === sessionKey);
}

export async function deleteDraftAttachmentBlob(filename: string): Promise<void> {
  const db = await openIndexedDb();
  const tx = db.transaction('draftAttachmentBlobs', 'readwrite');
  tx.objectStore('draftAttachmentBlobs').delete(filename);
  return new Promise((resolve) => { tx.oncomplete = () => resolve(); });
}
