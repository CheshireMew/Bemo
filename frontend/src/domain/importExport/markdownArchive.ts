import JSZip from 'jszip';

import type { NoteMeta } from '../notes/notesTypes.js';
import { applyBackupPayload, buildBackupPayload } from './backupPayload.js';
import {
  buildArchiveNotePath,
  buildMarkdownArchiveDocument,
  guessArchiveMimeType,
  parseMarkdownArchiveDocument,
  sortArchiveNotes,
} from './markdownArchiveFormat.js';

type ArchiveManifest = {
  format: 'bemo-markdown-archive';
  version: 1;
  exported_at: string;
  notes: number;
  trash: number;
  attachments: number;
};

export async function buildMarkdownArchiveBlob() {
  const payload = await buildBackupPayload();
  const notes = Array.isArray(payload.notes) ? payload.notes : [];
  const trash = Array.isArray(payload.trash) ? payload.trash : [];
  const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];

  const zip = new JSZip();
  const referencedFilenames = new Set<string>(attachments.map((attachment) => attachment.filename));

  sortArchiveNotes(notes).forEach((note) => {
    const archivePath = buildArchiveNotePath('notes', note);
    zip.file(archivePath, buildMarkdownArchiveDocument(note, archivePath));
  });

  sortArchiveNotes(trash).forEach((note) => {
    const archivePath = buildArchiveNotePath('trash', note);
    zip.file(archivePath, buildMarkdownArchiveDocument(note, archivePath));
  });

  let archivedAttachmentCount = 0;
  for (const attachment of attachments) {
    if (!referencedFilenames.has(attachment.filename)) continue;
    zip.file(`attachments/${attachment.filename}`, Uint8Array.from(attachment.data));
    archivedAttachmentCount += 1;
  }

  const manifest: ArchiveManifest = {
    format: 'bemo-markdown-archive',
    version: 1,
    exported_at: new Date().toISOString(),
    notes: notes.length,
    trash: trash.length,
    attachments: archivedAttachmentCount,
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));

  return zip.generateAsync({ type: 'blob' });
}

export async function parseMarkdownArchive(file: File) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const manifestText = await zip.file('manifest.json')?.async('string');
  if (!manifestText) {
    throw new Error('Markdown 归档 zip 缺少 manifest.json');
  }

  const manifest = JSON.parse(manifestText) as Partial<ArchiveManifest>;
  if (manifest.format !== 'bemo-markdown-archive' || manifest.version !== 1) {
    throw new Error('不支持的 Markdown 归档格式');
  }

  const notes: NoteMeta[] = [];
  const trash: NoteMeta[] = [];
  const attachments: Array<{ filename: string; mime_type: string; data: Uint8Array }> = [];

  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    if (entry.name === 'manifest.json') continue;

    if (entry.name.startsWith('notes/') && entry.name.endsWith('.md')) {
      notes.push(parseMarkdownArchiveDocument(await entry.async('string'), entry.name));
      continue;
    }
    if (entry.name.startsWith('trash/') && entry.name.endsWith('.md')) {
      trash.push(parseMarkdownArchiveDocument(await entry.async('string'), entry.name));
      continue;
    }
    if (entry.name.startsWith('attachments/')) {
      const filename = entry.name.slice('attachments/'.length);
      attachments.push({
        filename: decodeURIComponent(filename),
        mime_type: guessArchiveMimeType(filename),
        data: await entry.async('uint8array'),
      });
    }
  }

  return { notes, trash, attachments };
}

export async function importMarkdownArchive(file: File) {
  const { notes, trash, attachments } = await parseMarkdownArchive(file);
  return applyBackupPayload({
    format: 'bemo-backup',
    version: 3,
    exported_at: new Date().toISOString(),
    notes,
    trash,
    attachments: attachments.map((attachment) => ({
      filename: attachment.filename,
      mime_type: attachment.mime_type || 'application/octet-stream',
      data: Array.from(attachment.data),
    })),
  });
}
