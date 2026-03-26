export type ManifestRecord = {
  format_version: number;
  latest_cursor: string;
  snapshot_cursor: string;
  latest_snapshot: string | null;
  batches: WebDavManifestBatchRecord[];
  updated_at: string;
};

export type WebDavManifestBatchRecord = {
  batch_id: string;
  file: string;
  started_after_cursor: string;
  latest_cursor: string;
  change_count: number;
  operation_ids?: string[];
};

export type BatchIndexRecord = {
  format_version: number;
  latest_cursor: string;
  snapshot_cursor: string;
  latest_snapshot: string | null;
  batches: WebDavIndexedBatchRecord[];
  accepted_operations: Record<string, string>;
  updated_at: string;
};

export type WebDavIndexedBatchRecord = {
  batch_id: string;
  file: string;
  started_after_cursor: string;
  latest_cursor: string;
  change_count: number;
  operation_ids: string[];
};

export type WebDavSnapshotNote = {
  note_id: string;
  scope: 'active' | 'trash';
  revision: number;
  filename?: string;
  content: string;
  tags: string[];
  pinned: boolean;
  created_at?: string;
  updated_at?: string;
  attachments: Array<{
    filename: string;
    blob_hash: string;
    mime_type: string;
  }>;
};

export type SnapshotRecord = {
  format_version: number;
  latest_cursor: string;
  generated_at: string;
  notes?: Record<string, WebDavSnapshotNote>;
  note_count?: number;
  shards?: Array<{
    file: string;
    note_count: number;
    estimated_bytes: number;
  }>;
};

export type WebDavBatchChange = Record<string, unknown> & {
  operation_id?: string;
  cursor: string;
};

export type WebDavBatchRecord = {
  format_version: number;
  batch_id: string;
  started_after_cursor: string;
  latest_cursor: string;
  generated_at: string;
  changes: WebDavBatchChange[];
};
