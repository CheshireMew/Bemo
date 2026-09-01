import { readStore, writeStore } from '../storage/transactions.js';

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
  return (await readStore<BlobIndexRecord | undefined>('blobIndex', store => store.get(blobHash))) ?? null;
}
export function getAllBlobIndexRecords(): Promise<BlobIndexRecord[]> {
  return readStore('blobIndex', store => store.getAll());
}
export async function hasBlobIndexRecord(blobHash: string) { return Boolean(await getBlobIndexRecord(blobHash)); }
export function putBlobIndexRecord(input: { blobHash: string; filename: string; mimeType?: string; size: number }): Promise<void> {
  return writeStore('blobIndex', store => { store.put({ blob_hash: input.blobHash, filename: input.filename, mime_type: input.mimeType || 'application/octet-stream', size: input.size, updatedAt: Date.now() }); });
}
export function deleteBlobIndexRecord(blobHash: string): Promise<void> {
  return writeStore('blobIndex', store => { store.delete(blobHash); });
}
export function putAttachmentBlob(input: { filename: string; blob: Blob; mimeType?: string }): Promise<void> {
  return writeStore('attachmentBlobs', store => { store.put({ filename: input.filename, blob: input.blob, mime_type: input.mimeType || input.blob.type || 'application/octet-stream', updatedAt: Date.now() }); });
}
export async function getAttachmentBlobRecord(filename: string): Promise<AttachmentBlobRecord | null> {
  return (await readStore<AttachmentBlobRecord | undefined>('attachmentBlobs', store => store.get(filename))) ?? null;
}
export async function getAttachmentBlob(filename: string): Promise<Blob | null> { return (await getAttachmentBlobRecord(filename))?.blob ?? null; }
export function putDraftAttachmentBlob(input: { sessionKey: string; filename: string; blob: Blob; mimeType?: string }): Promise<void> {
  return writeStore('draftAttachmentBlobs', store => { store.put({ session_key: input.sessionKey, filename: input.filename, blob: input.blob, mime_type: input.mimeType || input.blob.type || 'application/octet-stream', updatedAt: Date.now() }); });
}
export async function getDraftAttachmentBlobRecord(filename: string): Promise<DraftAttachmentBlobRecord | null> {
  return (await readStore<DraftAttachmentBlobRecord | undefined>('draftAttachmentBlobs', store => store.get(filename))) ?? null;
}
export async function getDraftAttachmentBlob(filename: string): Promise<Blob | null> { return (await getDraftAttachmentBlobRecord(filename))?.blob ?? null; }
export function getAllAttachmentBlobRecords(): Promise<AttachmentBlobRecord[]> {
  return readStore('attachmentBlobs', store => store.getAll());
}
export function deleteAttachmentBlob(filename: string): Promise<void> {
  return writeStore('attachmentBlobs', store => { store.delete(filename); });
}
export function getAllDraftAttachmentBlobRecords(): Promise<DraftAttachmentBlobRecord[]> {
  return readStore('draftAttachmentBlobs', store => store.getAll());
}
export async function getDraftAttachmentBlobRecordsForSession(sessionKey: string): Promise<DraftAttachmentBlobRecord[]> {
  return (await getAllDraftAttachmentBlobRecords()).filter(row => row.session_key === sessionKey);
}
export function deleteDraftAttachmentBlob(filename: string): Promise<void> {
  return writeStore('draftAttachmentBlobs', store => { store.delete(filename); });
}
