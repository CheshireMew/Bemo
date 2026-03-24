export type WebDavBootstrapState = {
  status: 'not_started' | 'in_progress' | 'completed';
  fingerprint: string | null;
  operation_ids: string[];
  updated_at: string;
};

export type ManifestRecord = {
  format_version: number;
  latest_cursor: string;
  latest_snapshot: string | null;
  bootstrap: WebDavBootstrapState;
  updated_at: string;
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
  notes: Record<string, WebDavSnapshotNote>;
};
