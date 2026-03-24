import { extractAttachmentFilename, extractAttachmentUrlsFromContent } from '../attachments/attachmentLinks.js';
import { deriveNoteTitle, normalizeNoteRevision } from '../notes/noteContract.js';
import type { NoteMeta } from '../notes/notesTypes.js';

type ParsedFrontmatter = {
  note_id: string;
  filename: string;
  revision: number;
  created_at: string;
  updated_at: string;
  pinned: boolean;
  tags: string[];
};

function escapeYamlString(value: string) {
  return JSON.stringify(String(value ?? ''));
}

export function normalizeArchivePath(value: string) {
  return value.replace(/\\/g, '/').replace(/^\/+/, '');
}

function getDirectoryDepth(path: string) {
  const normalized = normalizeArchivePath(path);
  const segments = normalized.split('/').filter(Boolean);
  return Math.max(0, segments.length - 1);
}

function buildRelativeAttachmentPath(notePath: string, filename: string) {
  const prefix = Array.from({ length: getDirectoryDepth(notePath) }, () => '..').join('/');
  return `${prefix ? `${prefix}/` : ''}attachments/${encodeURIComponent(filename)}`;
}

function buildArchiveAttachmentPrefix(notePath: string) {
  const prefix = Array.from({ length: getDirectoryDepth(notePath) }, () => '..').join('/');
  return `${prefix ? `${prefix}/` : ''}attachments/`;
}

function rewriteAttachmentUrls(content: string, notePath: string) {
  let next = content;
  for (const url of extractAttachmentUrlsFromContent(content)) {
    const filename = extractAttachmentFilename(url);
    if (!filename) continue;
    const relative = buildRelativeAttachmentPath(notePath, filename);
    next = next.split(url).join(relative);
  }
  return next;
}

function restoreAttachmentUrls(content: string, notePath: string) {
  const prefix = buildArchiveAttachmentPrefix(notePath)
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${prefix}([^\\s)"'\`>]+)`, 'g');
  return content.replace(pattern, (_match, encodedFilename: string) => {
    try {
      return `/images/${decodeURIComponent(encodedFilename)}`;
    } catch {
      return `/images/${encodedFilename}`;
    }
  });
}

function buildFrontmatter(note: NoteMeta) {
  const tags = (note.tags || []).map((tag) => `  - ${String(tag)}`).join('\n');
  return [
    '---',
    `note_id: ${escapeYamlString(note.note_id)}`,
    `filename: ${escapeYamlString(note.filename)}`,
    `revision: ${normalizeNoteRevision(note.revision, 1)}`,
    `created_at: ${escapeYamlString(new Date(note.created_at * 1000).toISOString())}`,
    `updated_at: ${escapeYamlString(new Date(note.updated_at * 1000).toISOString())}`,
    `pinned: ${note.pinned ? 'true' : 'false'}`,
    'tags:',
    tags || '  []',
    '---',
  ].join('\n');
}

function parseYamlScalar(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') || trimmed.startsWith('\'')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function parseFrontmatterBlock(block: string): ParsedFrontmatter {
  const lines = block.split(/\r?\n/);
  const result: ParsedFrontmatter = {
    note_id: '',
    filename: '',
    revision: 1,
    created_at: new Date(0).toISOString(),
    updated_at: new Date(0).toISOString(),
    pinned: false,
    tags: [],
  };

  let currentKey = '';
  for (const line of lines) {
    if (!line.trim()) continue;
    if (/^\s+-\s+/.test(line) && currentKey === 'tags') {
      result.tags.push(parseYamlScalar(line.replace(/^\s+-\s+/, '')));
      continue;
    }

    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    currentKey = key;

    if (key === 'note_id') result.note_id = String(parseYamlScalar(rawValue) || '');
    if (key === 'filename') result.filename = String(parseYamlScalar(rawValue) || '');
    if (key === 'revision') result.revision = Math.max(1, Number(parseYamlScalar(rawValue)) || 1);
    if (key === 'created_at') result.created_at = String(parseYamlScalar(rawValue) || result.created_at);
    if (key === 'updated_at') result.updated_at = String(parseYamlScalar(rawValue) || result.updated_at);
    if (key === 'pinned') result.pinned = String(parseYamlScalar(rawValue)).toLowerCase() === 'true';
    if (key === 'tags' && rawValue === '[]') result.tags = [];
  }

  return result;
}

export function sortArchiveNotes(notes: NoteMeta[]) {
  return [...notes].sort((a, b) => {
    if (a.created_at !== b.created_at) {
      return a.created_at - b.created_at;
    }
    return a.filename.localeCompare(b.filename);
  });
}

export function buildArchiveNotePath(scope: 'notes' | 'trash', note: NoteMeta) {
  return `${scope}/${normalizeArchivePath(note.filename)}`;
}

export function buildMarkdownArchiveDocument(note: NoteMeta, archivePath: string) {
  const title = note.title || note.filename.replace(/\.md$/i, '') || 'Untitled';
  const content = rewriteAttachmentUrls(note.content || '', archivePath);

  return [
    `# ${title}`,
    '',
    buildFrontmatter(note),
    '',
    content,
    '',
  ].join('\n');
}

export function parseMarkdownArchiveDocument(raw: string, archivePath: string): NoteMeta {
  const normalized = raw.replace(/\r\n/g, '\n');
  const frontmatterMatch = normalized.match(/^# .*?\n\n---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/);
  if (!frontmatterMatch) {
    throw new Error(`归档笔记格式不正确: ${archivePath}`);
  }

  const frontmatter = parseFrontmatterBlock(frontmatterMatch[1] || '');
  const content = restoreAttachmentUrls((frontmatterMatch[2] || '').trim(), archivePath);
  const createdAtMs = Date.parse(frontmatter.created_at);
  const updatedAtMs = Date.parse(frontmatter.updated_at);

  return {
    note_id: frontmatter.note_id || archivePath,
    revision: normalizeNoteRevision(frontmatter.revision, 1),
    filename: frontmatter.filename || archivePath.replace(/^(notes|trash)\//, ''),
    title: deriveNoteTitle(content, '未命名笔记', 80),
    created_at: Math.floor((Number.isNaN(createdAtMs) ? Date.now() : createdAtMs) / 1000),
    updated_at: Math.floor((Number.isNaN(updatedAtMs) ? Date.now() : updatedAtMs) / 1000),
    content,
    tags: frontmatter.tags,
    pinned: frontmatter.pinned,
  };
}

export function collectReferencedAttachmentFilenames(notes: NoteMeta[]) {
  const filenames = new Set<string>();
  for (const note of notes) {
    for (const url of extractAttachmentUrlsFromContent(note.content || '')) {
      const filename = extractAttachmentFilename(url);
      if (filename) {
        filenames.add(filename);
      }
    }
  }
  return filenames;
}

export function guessArchiveMimeType(path: string) {
  const normalized = path.toLowerCase();
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) return 'image/jpeg';
  if (normalized.endsWith('.gif')) return 'image/gif';
  if (normalized.endsWith('.webp')) return 'image/webp';
  if (normalized.endsWith('.svg')) return 'image/svg+xml';
  if (normalized.endsWith('.mp3')) return 'audio/mpeg';
  if (normalized.endsWith('.m4a')) return 'audio/mp4';
  if (normalized.endsWith('.wav')) return 'audio/wav';
  if (normalized.endsWith('.ogg')) return 'audio/ogg';
  if (normalized.endsWith('.mp4')) return 'video/mp4';
  if (normalized.endsWith('.pdf')) return 'application/pdf';
  return 'application/octet-stream';
}
