import { shouldUseBackendAppStore } from '../runtime/appStoreRuntime.js';
import { listBackendNotes, listBackendTrashNotes } from '../notes/backendNotesApi.js';
import { listLocalNotes, listLocalTrashNotes } from '../notes/localNoteQueries.js';

export function listCurrentNotes() {
  return shouldUseBackendAppStore() ? listBackendNotes() : listLocalNotes();
}

export function listCurrentTrash() {
  return shouldUseBackendAppStore() ? listBackendTrashNotes() : listLocalTrashNotes();
}
