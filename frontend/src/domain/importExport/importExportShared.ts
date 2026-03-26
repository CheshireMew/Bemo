import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { enqueueRemoteNoteChange } from '../sync/noteSyncOutbox.js';
import type { NoteMeta } from '../notes/notesTypes.js';

export type ImportedNoteRecord = {
  filename: string;
  note_id: string;
  revision: number;
  content: string;
  tags: string[];
  pinned: boolean;
  created_at: string;
};

function shouldUseAndroidNativeExport() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

async function blobToBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function shareAndroidExportFile(blob: Blob, fileName: string) {
  const path = `exports/${fileName}`;
  await Filesystem.writeFile({
    path,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
    recursive: true,
  });

  const shareState = await Share.canShare();
  if (!shareState.value) {
    throw new Error('当前 Android 环境不支持系统分享，无法导出文件。');
  }

  const fileUri = await Filesystem.getUri({
    path,
    directory: Directory.Cache,
  });

  await Share.share({
    title: fileName,
    text: `导出文件：${fileName}`,
    url: fileUri.uri,
    dialogTitle: '导出 Bemo 文件',
  });
}

export async function downloadBlob(data: BlobPart, fileName: string, type = 'application/octet-stream') {
  const blob = new Blob([data], { type });
  if (shouldUseAndroidNativeExport()) {
    await shareAndroidExportFile(blob, fileName);
    return;
  }

  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

export async function enqueueImportedNotes(importedNoteRecords: ImportedNoteRecord[]) {
  let queuedAny = false;
  for (const note of importedNoteRecords) {
    queuedAny = await enqueueRemoteNoteChange({
      entityId: note.note_id,
      type: 'note.create',
      baseRevision: 0,
      payload: {
        filename: note.filename,
        content: note.content,
        tags: note.tags,
        pinned: note.pinned,
        created_at: note.created_at,
        revision: note.revision,
      },
    }) || queuedAny;
  }
  return queuedAny;
}

export function toImportedNoteRecord(note: NoteMeta): ImportedNoteRecord {
  return {
    filename: note.filename,
    note_id: note.note_id,
    revision: note.revision,
    content: note.content,
    tags: note.tags,
    pinned: note.pinned,
    created_at: new Date(note.created_at * 1000).toISOString(),
  };
}
