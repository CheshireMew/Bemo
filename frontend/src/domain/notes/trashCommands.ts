import {
  emptyLocalTrashNotes,
  listLocalTrashNotes,
  permanentlyDeleteLocalTrashNote,
  restoreLocalTrashNote,
} from './localNotesRepository.js';
import type { NoteMeta } from './notesTypes.js';
import { setSyncStateValue } from '../sync/syncStateStorage.js';

export async function loadTrashForDisplay(): Promise<NoteMeta[]> {
  const trash = await listLocalTrashNotes();
  await setSyncStateValue('local_trash_initialized', '1');
  return trash;
}

export async function restoreTrashNoteCommand(filename: string): Promise<void> {
  await restoreLocalTrashNote(filename);
}

export async function permanentlyDeleteTrashNoteCommand(filename: string): Promise<void> {
  await permanentlyDeleteLocalTrashNote(filename);
}

export async function emptyTrashCommand(): Promise<void> {
  await emptyLocalTrashNotes();
}
