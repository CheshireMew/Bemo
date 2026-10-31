const writers = new Set<() => void>();

export function registerDraftWriter(write: () => void) {
  writers.add(write);
  return () => writers.delete(write);
}

export function flushEditorDrafts() {
  let failure: unknown;
  for (const write of writers) {
    try { write(); } catch (error) { failure = error; }
  }
  if (failure) throw failure;
}
