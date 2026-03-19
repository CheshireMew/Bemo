import JSZip from 'jszip';

import { getReferencedAttachmentFilenames } from '../../domain/attachments/attachmentRefStorage.js';
import { getAllAttachmentBlobRecords } from '../../domain/attachments/blobStorage.js';
import { getCachedNotes } from '../notes/notesStorage.js';
import { getTrashNotes } from '../notes/trashStorage.js';
import type { BackupAttachment, BackupPayload } from './backupPayload.js';
import { extractAttachmentFilename } from '../../utils/attachmentUrls.js';
import { extractAttachmentUrlsFromContent } from '../../utils/syncAttachments.js';

type BackupArchiveManifest = Omit<BackupPayload, 'attachments'> & {
  version: 3;
  attachments: Array<{
    filename: string;
    mime_type: string;
    path: string;
  }>;
};

export async function buildBackupArchiveBlob() {
  const [notes, trash, attachments] = await Promise.all([
    getCachedNotes(),
    getTrashNotes(),
    getAllAttachmentBlobRecords(),
  ]);
  const fallbackFilenames = new Set<string>();
  for (const note of [...notes, ...trash]) {
    for (const url of extractAttachmentUrlsFromContent(note.content || '')) {
      const filename = extractAttachmentFilename(url);
      if (filename) {
        fallbackFilenames.add(filename);
      }
    }
  }
  const referenced = await getReferencedAttachmentFilenames(['active', 'trash']);
  const allowed = new Set<string>([...referenced, ...fallbackFilenames]);
  const archiveAttachments = attachments.filter((attachment) => allowed.has(attachment.filename));

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
    zip.file(`attachments/${attachment.filename}`, await attachment.blob.arrayBuffer());
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
