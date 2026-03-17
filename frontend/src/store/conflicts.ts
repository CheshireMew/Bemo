import { ref } from 'vue';
import { clearConflict, getConflicts } from '../utils/db';

export interface ConflictItem {
  id: number;
  source: 'server' | 'webdav';
  note_id: string;
  operation_id: string;
  reason: string;
  createdAt: number;
  detail: Record<string, unknown>;
}

export const conflicts = ref<ConflictItem[]>([]);

export async function fetchConflicts() {
  const rows = await getConflicts();
  conflicts.value = rows.map((row) => ({
    id: row.id!,
    source: row.source,
    note_id: row.note_id,
    operation_id: row.operation_id,
    reason: row.reason,
    createdAt: row.createdAt,
    detail: row.detail,
  }));
}

export async function dismissConflict(id: number) {
  await clearConflict(id);
  conflicts.value = conflicts.value.filter((item) => item.id !== id);
}
