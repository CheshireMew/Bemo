export interface SyncRemoteNoteState {
  note_id: string;
  scope: 'active' | 'trash';
  revision: number;
}

export interface SyncChange {
  operation_id?: string;
  device_id?: string;
  entity_id?: string;
  type?: string;
  timestamp?: string;
  base_revision?: number | null;
  cursor?: string;
  payload?: Record<string, unknown>;
}

export interface SyncPushAcceptedChange {
  operation_id: string;
  cursor?: string;
  change?: SyncChange;
  deduplicated?: boolean;
}

export interface SyncPushConflict extends Record<string, unknown> {
  operation_id?: string;
  note_id?: string;
  reason?: string;
}

export interface SyncPullResult {
  changes: SyncChange[];
  latest_cursor: string;
}

export interface SyncPushResult {
  accepted: SyncPushAcceptedChange[];
  conflicts: SyncPushConflict[];
  latest_cursor: string;
}

export interface SyncBootstrapState {
  status: 'not_started' | 'in_progress' | 'completed';
  fingerprint: string | null;
  remoteNotes: SyncRemoteNoteState[];
}

export interface SyncTransport {
  pull(cursor: string | null): Promise<SyncPullResult>;
  push(changes: SyncChange[]): Promise<SyncPushResult>;
  hasBlob(blobHash: string): Promise<boolean>;
  putBlob(blobHash: string, data: Uint8Array, mimeType?: string): Promise<void>;
  getBlob(blobHash: string): Promise<Uint8Array>;
  inspectBootstrap?(): Promise<SyncBootstrapState>;
  cleanupUnusedBlobs?(): Promise<{ deleted: number; retained: number }>;
}
