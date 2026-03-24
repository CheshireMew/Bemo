import { normalizeNoteTags } from '../notes/noteContract.js';

type ConflictComparableNote = {
  revision: number;
  content: string;
  tags: string[];
};

export function hasConcurrentUpdateConflict(
  local: ConflictComparableNote,
  baseRevision: number | null,
  payload: Record<string, unknown>,
) {
  if (baseRevision === null || local.revision <= baseRevision) {
    return false;
  }

  const remoteContent = String(payload.content || '');
  const remoteTags = normalizeNoteTags(payload.tags);
  const contentChanged = local.content !== remoteContent;
  const tagsChanged = local.tags.length !== remoteTags.length
    || local.tags.some((tag, index) => tag !== remoteTags[index]);

  return contentChanged || tagsChanged;
}

export function shouldKeepDeleteAsConflict(localRevision: number, baseRevision: number | null) {
  return baseRevision !== null && localRevision > baseRevision;
}

export function hasConcurrentPatchConflict(
  local: Pick<ConflictComparableNote, 'revision' | 'tags'> & { pinned?: boolean },
  baseRevision: number | null,
  payload: Record<string, unknown>,
) {
  if (baseRevision === null || local.revision <= baseRevision) {
    return false;
  }

  if (payload.pinned !== undefined && Boolean(payload.pinned) !== Boolean(local.pinned)) {
    return true;
  }

  if (Array.isArray(payload.tags)) {
    const remoteTags = normalizeNoteTags(payload.tags);
    const tagsChanged = local.tags.length !== remoteTags.length
      || local.tags.some((tag, index) => tag !== remoteTags[index]);
    if (tagsChanged) {
      return true;
    }
  }

  return false;
}
