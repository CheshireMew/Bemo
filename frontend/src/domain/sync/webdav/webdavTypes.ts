export type ManifestRecord = {
  format_version: number;
  latest_cursor: string;
  latest_snapshot: string | null;
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

export type WebDavContext = {
  baseUrl: string;
  headers: HeadersInit;
};
