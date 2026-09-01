import { normalizeAppNoteRecord } from '../notes/noteContract.js';
import type { BackupPayload, BackupAttachment } from './backupPayload.js';
import { extractAttachmentFilenames } from '../attachments/attachmentRefParser.js';

export function validateBackupPayload(payload: Partial<BackupPayload>) {
  if (payload.format !== 'bemo-backup' || ![1, 2, 3].includes(payload.version ?? 0)) throw new Error('不支持的 Bemo 备份格式。');
  if (!Array.isArray(payload.notes) || !Array.isArray(payload.trash)) throw new Error('备份缺少笔记或回收站列表，未修改现有数据。');
  const ids = new Set<string>();
  const normalize = (notes: unknown[]) => notes.map(value => {
    const note = value as Record<string, unknown> | null;
    if (!note || typeof note.content !== 'string' || !Array.isArray(note.tags) || !note.tags.every(tag => typeof tag === 'string')) throw new Error('备份包含无效笔记。');
    const normalized = normalizeAppNoteRecord(note);
    if (!normalized || ids.has(normalized.note_id)) throw new Error('备份包含无效或重复的笔记 ID。');
    ids.add(normalized.note_id);
    return normalized;
  });
  const notes = normalize(payload.notes), trash = normalize(payload.trash);
  const source = payload.attachments ?? (payload.version === 1 ? [] : null);
  if (!Array.isArray(source)) throw new Error('备份缺少附件列表。');
  const filenames = new Set<string>();
  const attachments: BackupAttachment[] = source.map(item => {
    if (!item || typeof item.filename !== 'string' || !item.filename || filenames.has(item.filename) || typeof item.mime_type !== 'string' || !Array.isArray(item.data) || !item.data.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) throw new Error('备份包含无效或重复的附件。');
    filenames.add(item.filename);
    return item;
  });
  for (const note of [...notes, ...trash]) {
    for (const filename of extractAttachmentFilenames(note.content)) {
      if (!filenames.has(filename)) throw new Error(`备份缺少笔记引用的附件：${filename}。未修改现有数据。`);
    }
  }
  return { notes, trash, attachments };
}
