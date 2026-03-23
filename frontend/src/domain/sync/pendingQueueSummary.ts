import type { ChangeRecord } from './mutationLogStorage.js';

export function formatPendingChangeType(type: ChangeRecord['type']) {
  if (type === 'note.create') return '新建';
  if (type === 'note.update') return '更新正文';
  if (type === 'note.patch') return '更新属性';
  if (type === 'note.trash' || type === 'note.delete') return '移入回收站';
  if (type === 'note.restore') return '恢复笔记';
  if (type === 'note.purge') return '彻底删除';
  return type;
}

export function summarizePendingChange(change: ChangeRecord) {
  return {
    operationId: change.operation_id,
    entityId: change.entity_id,
    typeLabel: formatPendingChangeType(change.type),
    baseRevision: change.base_revision ?? '-',
    timestamp: change.timestamp,
  };
}
