import type { BackupAttachment, BackupPayload } from './backupPayload.js';
import { deriveNoteTitle, normalizeNoteRevision, normalizeNoteTags, normalizeNoteTimestampSeconds } from '../notes/noteContract.js';
import type { NoteMeta } from '../notes/notesTypes.js';

type SyncManifest = {
  latest_snapshot?: unknown;
  latest_cursor?: unknown;
};

type SyncSnapshot = {
  notes?: unknown;
};

type SnapshotNoteRecord = Record<string, unknown>;

type PickedDirectoryFile = {
  relativePath: string;
  file: File;
};

function normalizeRelativePath(path: string) {
  return path.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function joinRelativePath(root: string, path: string) {
  const normalizedRoot = normalizeRelativePath(root);
  const normalizedPath = normalizeRelativePath(path);
  return normalizedRoot ? `${normalizedRoot}/${normalizedPath}` : normalizedPath;
}

function getPickedDirectoryFiles(files: Iterable<File>) {
  const entries: PickedDirectoryFile[] = [];
  for (const file of files) {
    const relativePath = normalizeRelativePath(file.webkitRelativePath || file.name);
    if (!relativePath) continue;
    entries.push({ relativePath, file });
  }
  return entries;
}

function getFileMap(files: PickedDirectoryFile[]) {
  const map = new Map<string, File>();
  for (const item of files) {
    map.set(item.relativePath, item.file);
  }
  return map;
}

function getCandidateRoots(files: PickedDirectoryFile[]) {
  const roots = new Set<string>();
  for (const item of files) {
    if (!item.relativePath.endsWith('/manifest.json') && item.relativePath !== 'manifest.json') {
      continue;
    }
    roots.add(item.relativePath === 'manifest.json' ? '' : item.relativePath.slice(0, -'/manifest.json'.length));
  }
  return Array.from(roots).sort((left, right) => {
    const leftName = left.split('/').filter(Boolean).at(-1) || '';
    const rightName = right.split('/').filter(Boolean).at(-1) || '';
    const leftIsBemoSync = leftName.toLowerCase() === 'bemo-sync';
    const rightIsBemoSync = rightName.toLowerCase() === 'bemo-sync';
    if (leftIsBemoSync !== rightIsBemoSync) {
      return leftIsBemoSync ? -1 : 1;
    }
    return left.length - right.length;
  });
}

async function readJsonFile<T>(file: File): Promise<T> {
  return JSON.parse(await file.text()) as T;
}

function toSnapshotNoteRecord(input: unknown): SnapshotNoteRecord | null {
  return input && typeof input === 'object' ? input as SnapshotNoteRecord : null;
}

function toNoteRecord(note: SnapshotNoteRecord): NoteMeta | null {
  const noteId = String(note.note_id || '').trim();
  const filename = String(note.filename || '').trim();
  const content = String(note.content || '');
  if (!noteId || !filename) {
    return null;
  }

  return {
    note_id: noteId,
    revision: normalizeNoteRevision(note.revision, 1),
    filename,
    title: deriveNoteTitle(content, filename.replace(/\.md$/i, '')),
    created_at: normalizeNoteTimestampSeconds(note.created_at),
    updated_at: normalizeNoteTimestampSeconds(note.updated_at ?? note.created_at),
    content,
    tags: normalizeNoteTags(note.tags).filter((tag) => tag.trim()),
    pinned: Boolean(note.pinned),
  };
}

function getBlobRelativePath(blobHash: string) {
  const [algorithm, digestRaw] = String(blobHash || '').split(':', 2);
  const digest = (digestRaw || '').trim();
  if (!algorithm || digest.length < 2) {
    return '';
  }
  return `blobs/${algorithm}/${digest.slice(0, 2)}/${digest}`;
}

async function buildBackupPayloadFromCandidateRoot(
  fileMap: Map<string, File>,
  root: string,
): Promise<BackupPayload> {
  const manifestFile = fileMap.get(joinRelativePath(root, 'manifest.json'));
  if (!manifestFile) {
    throw new Error('同步目录里缺少 manifest.json');
  }

  const manifest = await readJsonFile<SyncManifest>(manifestFile);
  const latestSnapshotName = typeof manifest.latest_snapshot === 'string'
    ? manifest.latest_snapshot.trim()
    : '';
  if (!latestSnapshotName) {
    throw new Error('同步目录里的 manifest.json 没有 latest_snapshot');
  }

  const snapshotFile = fileMap.get(joinRelativePath(root, `snapshots/${latestSnapshotName}`));
  if (!snapshotFile) {
    throw new Error(`同步目录里缺少快照文件 snapshots/${latestSnapshotName}`);
  }

  const snapshot = await readJsonFile<SyncSnapshot>(snapshotFile);
  if (!snapshot.notes || typeof snapshot.notes !== 'object') {
    throw new Error(`快照 ${latestSnapshotName} 的格式不正确`);
  }

  const notes: NoteMeta[] = [];
  const trash: NoteMeta[] = [];
  const attachmentMeta = new Map<string, { filename: string; mime_type: string }>();

  for (const value of Object.values(snapshot.notes as Record<string, unknown>)) {
    const note = toSnapshotNoteRecord(value);
    if (!note) continue;

    const normalizedNote = toNoteRecord(note);
    if (!normalizedNote) continue;

    const attachments = Array.isArray(note.attachments) ? note.attachments : [];
    for (const item of attachments) {
      const attachment = toSnapshotNoteRecord(item);
      if (!attachment) continue;
      const blobHash = String(attachment.blob_hash || '').trim();
      const filename = String(attachment.filename || '').trim();
      if (!blobHash || !filename) continue;
      attachmentMeta.set(blobHash, {
        filename,
        mime_type: String(attachment.mime_type || 'application/octet-stream').trim() || 'application/octet-stream',
      });
    }

    if (note.scope === 'trash') {
      trash.push(normalizedNote);
    } else {
      notes.push(normalizedNote);
    }
  }

  const attachments: BackupAttachment[] = [];
  for (const [blobHash, meta] of attachmentMeta) {
    const blobFile = fileMap.get(joinRelativePath(root, getBlobRelativePath(blobHash)));
    if (!blobFile) continue;
    attachments.push({
      filename: meta.filename,
      mime_type: meta.mime_type,
      data: Array.from(new Uint8Array(await blobFile.arrayBuffer())),
    });
  }

  return {
    format: 'bemo-backup',
    version: 3,
    exported_at: new Date().toISOString(),
    notes,
    trash,
    attachments,
  };
}

export async function buildBackupPayloadFromSyncDirectoryFiles(files: Iterable<File>): Promise<BackupPayload> {
  const pickedFiles = getPickedDirectoryFiles(files);
  if (!pickedFiles.length) {
    throw new Error('没有选中任何同步目录文件。');
  }

  const fileMap = getFileMap(pickedFiles);
  const roots = getCandidateRoots(pickedFiles);
  if (!roots.length) {
    throw new Error('所选目录里没有找到 manifest.json，请选择 bemo-sync 同步目录。');
  }

  let lastError: Error | null = null;
  for (const root of roots) {
    try {
      return await buildBackupPayloadFromCandidateRoot(fileMap, root);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError || new Error('无法从所选目录识别同步快照，请确认选择的是完整的 bemo-sync 同步目录。');
}
