import { cleanupOrphanedAttachments } from '../appStore/attachmentsAdapter.js';
import { importExternalNotes, listActiveNotesSnapshot } from '../appStore/notesAdapter.js';
import type { NoteMeta } from '../notes/notesTypes.js';
import { downloadBlob } from './importExportShared.js';
import { parseFlomoCsv, parseFlomoZip } from './flomoArchiveParser.js';

function escapeCsvField(value: string) {
  const normalized = String(value ?? '');
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function isZipFile(file: File) {
  return /\.zip$/i.test(file.name)
    || file.type === 'application/zip'
    || file.type === 'application/x-zip-compressed';
}

export async function exportFlomoCsv() {
  const notes = await listActiveNotesSnapshot();
  const rows = [
    ['content', 'created_at'],
    ...notes.map((note) => [
      note.content || '',
      new Date(note.created_at * 1000).toISOString(),
    ]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCsvField).join(',')).join('\r\n')}`;
  await downloadBlob(csv, `bemo_flomo_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
}

export async function importFlomoArchive(file: File) {
  let notes: NoteMeta[] = [];
  let importedAttachments = 0;

  if (isZipFile(file)) {
    const parsed = await parseFlomoZip(file);
    notes = parsed.notes;
    importedAttachments = parsed.importedAttachments;
  } else {
    notes = await parseFlomoCsv(file);
  }

  if (notes.length === 0) {
    return { imported_count: 0, imported_attachment_count: importedAttachments, imported_note_records: [] };
  }

  const result = await importExternalNotes(notes);
  await cleanupOrphanedAttachments();

  return {
    imported_count: result.imported_count,
    imported_attachment_count: importedAttachments,
    imported_note_records: result.imported_note_records,
    sync_queued: result.sync_queued,
  };
}
