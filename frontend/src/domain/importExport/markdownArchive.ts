import JSZip from 'jszip';

import { getReferencedAttachmentFilenames } from '../attachments/attachmentRefStorage.js';
import { getAllAttachmentBlobRecords, putAttachmentBlob } from '../attachments/blobStorage.js';
import { getCachedNotes } from '../notes/notesStorage.js';
import type { NoteMeta } from '../notes/notesTypes.js';
import { getTrashNotes } from '../notes/trashStorage.js';
import { replaceNoteAttachmentRefsForScope } from '../attachments/attachmentRefStorage.js';
import { setCachedNotes } from '../notes/notesStorage.js';
import { setTrashNotes } from '../notes/trashStorage.js';
import { clearConflicts } from '../sync/conflictStorage.js';
import { clearMutationLog } from '../sync/mutationLogStorage.js';
import { clearRemoteSyncProgressState } from '../sync/syncStateStorage.js';
import {
  buildArchiveNotePath,
  buildMarkdownArchiveDocument,
  collectReferencedAttachmentFilenames,
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
  const [notes, trash, attachments] = await Promise.all([
    getCachedNotes(),
    getTrashNotes(),
    getAllAttachmentBlobRecords(),
  ]);

  const zip = new JSZip();
  const referencedFilenames = new Set<string>([
    ...await getReferencedAttachmentFilenames(['active', 'trash']),
    ...collectReferencedAttachmentFilenames([...notes, ...trash]),
  ]);

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
    const arrayBuffer = await attachment.blob.arrayBuffer();
    zip.file(`attachments/${attachment.filename}`, arrayBuffer);
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

  await setCachedNotes(notes);
  await setTrashNotes(trash);
  await Promise.all([
    replaceNoteAttachmentRefsForScope('active', notes),
    replaceNoteAttachmentRefsForScope('trash', trash),
  ]);

  for (const attachment of attachments) {
    await putAttachmentBlob({
      filename: attachment.filename,
      blob: new Blob([Uint8Array.from(attachment.data)], { type: attachment.mime_type || 'application/octet-stream' }),
      mimeType: attachment.mime_type || 'application/octet-stream',
    });
  }

  await clearMutationLog();
  await clearConflicts();
  await Promise.all([
    clearRemoteSyncProgressState('server'),
    clearRemoteSyncProgressState('webdav'),
  ]);

  return {
    imported_notes: notes.length + trash.length,
    imported_images: attachments.length,
    imported_note_records: [],
  };
}
