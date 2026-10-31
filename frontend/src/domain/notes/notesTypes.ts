export interface NoteMeta {
  note_id: string;
  revision: number;
  edit_version?: string;
  filename: string;
  title: string;
  created_at: number;
  updated_at: number;
  content: string;
  tags: string[];
  pinned: boolean;
}
