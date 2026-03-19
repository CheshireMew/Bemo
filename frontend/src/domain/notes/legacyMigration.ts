import { clearConflicts } from '../sync/conflictStorage.js';
import { clearMutationLog } from '../sync/mutationLogStorage.js';
import { removeSyncStateValue } from '../sync/syncStateStorage.js';
import { replaceNoteAttachmentRefsForScope } from '../attachments/attachmentRefStorage.js';
import { getCachedNotes, setCachedNotes } from './notesStorage.js';
import type { NoteMeta } from './notesTypes.js';
import { getTrashNotes, setTrashNotes } from './trashStorage.js';
import { ensureLocalAttachment } from '../../utils/syncAttachments.js';
import { extractAttachmentFilename } from '../../utils/attachmentUrls.js';
import { extractAttachmentUrlsFromContent } from '../../utils/syncAttachments.js';
import { hasBackendOrigin, resolveBackendUrl } from '../../config.js';

export type LegacyMigrationPreview = {
  available: boolean;
  notes: NoteMeta[];
  trash: NoteMeta[];
  noteCount: number;
  trashCount: number;
  attachmentCount: number;
};

export type LegacyMigrationResult = {
  importedNotes: number;
  importedTrash: number;
  importedAttachments: number;
};

function normalizeLegacyNote(input: unknown): NoteMeta | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const note = input as Record<string, unknown>;
  const filename = typeof note.filename === 'string' ? note.filename : '';
  const noteId = typeof note.note_id === 'string' && note.note_id ? note.note_id : '';
  if (!filename || !noteId) {
    return null;
  }

  const createdAt = Number(note.created_at);
  const updatedAt = Number(note.updated_at);

  return {
    note_id: noteId,
    revision: Math.max(1, Number(note.revision) || 1),
    filename,
    title: typeof note.title === 'string' && note.title ? note.title : filename.replace(/\.md$/i, ''),
    created_at: Number.isFinite(createdAt) ? Math.floor(createdAt) : Math.floor(Date.now() / 1000),
    updated_at: Number.isFinite(updatedAt) ? Math.floor(updatedAt) : Math.floor(Date.now() / 1000),
    content: typeof note.content === 'string' ? note.content : '',
    tags: Array.isArray(note.tags) ? note.tags.map((tag) => String(tag)) : [],
    pinned: Boolean(note.pinned),
  };
}

async function fetchLegacyNotes(path: string): Promise<NoteMeta[] | null> {
  const fetchUrl = resolveBackendUrl(path);
  if (!fetchUrl) {
    return null;
  }

  const response = await fetch(fetchUrl, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Legacy markdown migration failed: ${response.status}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.flatMap((item) => {
    const normalized = normalizeLegacyNote(item);
    return normalized ? [normalized] : [];
  });
}

function countReferencedAttachments(notes: NoteMeta[]) {
  const filenames = new Set<string>();
  for (const note of notes) {
    for (const url of extractAttachmentUrlsFromContent(note.content || '')) {
      const filename = extractAttachmentFilename(url);
      if (filename) {
        filenames.add(filename);
      }
    }
  }
  return filenames.size;
}

async function importLegacyAttachments(notes: NoteMeta[]) {
  const imported = new Set<string>();

  for (const note of notes) {
    for (const url of extractAttachmentUrlsFromContent(note.content || '')) {
      const filename = extractAttachmentFilename(url);
      if (!filename || imported.has(filename)) continue;

      const fetchUrl = resolveBackendUrl(url) || url;
      const response = await fetch(fetchUrl);
      if (!response.ok) continue;
      const data = new Uint8Array(await response.arrayBuffer());
      const digest = await crypto.subtle.digest('SHA-256', Uint8Array.from(data));
      const hash = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
      const mimeType = response.headers.get('content-type') || 'application/octet-stream';
      await ensureLocalAttachment(filename, data, `sha256:${hash}`, mimeType);
      imported.add(filename);
    }
  }

  return imported.size;
}

export async function probeLegacyMarkdownLibrary(): Promise<LegacyMigrationPreview> {
  if (!hasBackendOrigin()) {
    return {
      available: false,
      notes: [],
      trash: [],
      noteCount: 0,
      trashCount: 0,
      attachmentCount: 0,
    };
  }

  const [existingNotes, existingTrash] = await Promise.all([
    getCachedNotes(),
    getTrashNotes(),
  ]);

  if (existingNotes.length || existingTrash.length) {
    return {
      available: false,
      notes: [],
      trash: [],
      noteCount: 0,
      trashCount: 0,
      attachmentCount: 0,
    };
  }

  try {
    const [notes, trash] = await Promise.all([
      fetchLegacyNotes('/api/notes/'),
      fetchLegacyNotes('/api/notes/trash/list'),
    ]);

    if (!notes && !trash) {
      return {
        available: false,
        notes: [],
        trash: [],
        noteCount: 0,
        trashCount: 0,
        attachmentCount: 0,
      };
    }

    const normalizedNotes = notes || [];
    const normalizedTrash = trash || [];
    return {
      available: normalizedNotes.length > 0 || normalizedTrash.length > 0,
      notes: normalizedNotes,
      trash: normalizedTrash,
      noteCount: normalizedNotes.length,
      trashCount: normalizedTrash.length,
      attachmentCount: countReferencedAttachments([...normalizedNotes, ...normalizedTrash]),
    };
  } catch {
    return {
      available: false,
      notes: [],
      trash: [],
      noteCount: 0,
      trashCount: 0,
      attachmentCount: 0,
    };
  }
}

export async function importLegacyMarkdownLibrary(preview: LegacyMigrationPreview): Promise<LegacyMigrationResult> {
  await Promise.all([
    setCachedNotes(preview.notes),
    setTrashNotes(preview.trash),
    replaceNoteAttachmentRefsForScope('active', preview.notes),
    replaceNoteAttachmentRefsForScope('trash', preview.trash),
  ]);
  const importedAttachments = await importLegacyAttachments([...preview.notes, ...preview.trash]);
  await clearMutationLog();
  await clearConflicts();
  await Promise.all([
    removeSyncStateValue('server_cursor'),
    removeSyncStateValue('webdav_cursor'),
    removeSyncStateValue('server_last_sync_at'),
    removeSyncStateValue('webdav_last_sync_at'),
  ]);

  return {
    importedNotes: preview.notes.length,
    importedTrash: preview.trash.length,
    importedAttachments,
  };
}
