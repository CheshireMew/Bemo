import JSZip from 'jszip';

import { buildBackupPayload, type BackupAttachment, type BackupPayload } from './backupPayload.js';

type BackupArchiveManifest = Omit<BackupPayload, 'attachments'> & {
  version: 3;
  attachments: Array<{
    filename: string;
    mime_type: string;
    path: string;
  }>;
};

export async function buildBackupArchiveBlob() {
  const payload = await buildBackupPayload();
  const notes = Array.isArray(payload.notes) ? payload.notes : [];
  const trash = Array.isArray(payload.trash) ? payload.trash : [];
  const archiveAttachments = Array.isArray(payload.attachments) ? payload.attachments : [];

  const zip = new JSZip();
  const manifest: BackupArchiveManifest = {
    format: 'bemo-backup',
    version: 3,
    exported_at: new Date().toISOString(),
    notes,
    trash,
    attachments: archiveAttachments.map((attachment) => ({
      filename: attachment.filename,
      mime_type: attachment.mime_type,
      path: `attachments/${attachment.filename}`,
    })),
  };

  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  for (const attachment of archiveAttachments) {
    zip.file(`attachments/${attachment.filename}`, Uint8Array.from(attachment.data));
  }

  return zip.generateAsync({ type: 'blob' });
}

export async function parseBackupArchive(file: File): Promise<BackupPayload> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const manifestText = await zip.file('manifest.json')?.async('string');
  if (!manifestText) {
    throw new Error('备份 zip 缺少 manifest.json');
  }

  const manifest = JSON.parse(manifestText) as Partial<BackupArchiveManifest>;
  if (manifest.format !== 'bemo-backup' || manifest.version !== 3) {
    throw new Error('不支持的备份 zip 格式');
  }

  const attachments: BackupAttachment[] = [];
  for (const item of (manifest.attachments || [])) {
    if (!item || typeof item.path !== 'string' || typeof item.filename !== 'string' || typeof item.mime_type !== 'string') {
      continue;
    }

    const entry = zip.file(item.path);
    if (!entry) continue;
    attachments.push({
      filename: item.filename,
      mime_type: item.mime_type,
      data: Array.from(new Uint8Array(await entry.async('uint8array'))),
    });
  }

  return {
    format: 'bemo-backup',
    version: 3,
    exported_at: typeof manifest.exported_at === 'string' ? manifest.exported_at : new Date().toISOString(),
    notes: Array.isArray(manifest.notes) ? manifest.notes : [],
    trash: Array.isArray(manifest.trash) ? manifest.trash : [],
    attachments,
  };
}
