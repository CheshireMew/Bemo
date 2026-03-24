export interface SyncBootstrapState {
  status: 'not_started' | 'in_progress' | 'completed';
  fingerprint: string | null;
  remoteNoteIds: string[];
}

export interface SyncTransport {
  pull(cursor: string | null): Promise<{ changes: any[]; latest_cursor: string }>;
  push(changes: any[]): Promise<{ accepted: any[]; conflicts: any[]; latest_cursor: string }>;
  hasBlob(blobHash: string): Promise<boolean>;
  putBlob(blobHash: string, data: Uint8Array, mimeType?: string): Promise<void>;
  getBlob(blobHash: string): Promise<Uint8Array>;
  inspectBootstrap?(): Promise<SyncBootstrapState>;
  cleanupUnusedBlobs?(): Promise<{ deleted: number; retained: number }>;
}
