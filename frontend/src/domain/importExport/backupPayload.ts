import {
  applyBackupPayloadToCurrentStore,
  buildBackupPayloadForCurrentStore,
} from '../appStore/dataAdapter.js';
import type { NoteMeta } from '../notes/notesTypes.js';

export type BackupAttachment = {
  filename: string;
  mime_type: string;
  data: number[];
};

export type BackupPayload = {
  format: 'bemo-backup';
  version: 1 | 2 | 3;
  exported_at: string;
  notes: NoteMeta[];
  trash: NoteMeta[];
  attachments?: BackupAttachment[];
};

export async function buildBackupPayload(): Promise<BackupPayload> {
  return buildBackupPayloadForCurrentStore();
}

export async function applyBackupPayload(payload: Partial<BackupPayload>) {
  return applyBackupPayloadToCurrentStore(payload);
}
