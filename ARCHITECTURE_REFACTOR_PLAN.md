# Bemo Architecture Refactor Plan

## Current Direction

The project already has the right high-level pieces:

- Vue frontend
- FastAPI backend
- Tauri desktop wrapper
- local-first sync model with transport abstraction

The main problem is not missing layers. It is that several layers still overlap in implementation.

## Changes Completed In This Slice

- Introduced a backend app factory in [backend/app_factory.py](/E:/Work/Code/Bemo/backend/app_factory.py)
- Split remote sync API and local-only sync API:
  - [backend/api/sync.py](/E:/Work/Code/Bemo/backend/api/sync.py)
  - [backend/api/sync_local.py](/E:/Work/Code/Bemo/backend/api/sync_local.py)
- Added runtime mode-based router assembly:
  - desktop mode exposes `/api/sync/local/*`
  - server mode does not expose local-only mutation routes
- Tightened default CORS behavior:
  - desktop defaults to `*`
  - server mode requires explicit `BEMO_CORS_ORIGINS`
- Cleaned repository ignores for local envs and build artifacts

## Highest-Value Next Steps

### 1. Split backend sync orchestration from storage implementations

Current issue:

- [backend/services/sync_service.py](/E:/Work/Code/Bemo/backend/services/sync_service.py) mixes:
  - sync state persistence
  - remote change application
  - local Markdown writes
  - conflict copy generation
  - blob storage

Target shape:

```text
services/
  sync/
    engine.py
    conflict_resolver.py
    types.py
  repositories/
    note_index_repository.py
    sync_state_repository.py
    blob_repository.py
    local_note_repository.py
```

Rule:

- `engine.py` should coordinate.
- repositories should persist.
- conflict resolver should decide merge/conflict behavior.

### 2. Add a persistent note index

Current issue:

- [backend/services/note_repository.py](/E:/Work/Code/Bemo/backend/services/note_repository.py) resolves `note_id` by scanning the whole notes tree.

Target:

- a SQLite table mapping `note_id -> filename`
- update the index whenever a note is created, moved, restored, or deleted

Reason:

- sync apply cost currently scales with both note count and change count
- this becomes the first real bottleneck once sync volume grows

### 3. Split frontend note state from data access

Current issue:

- [frontend/src/store/notes.ts](/E:/Work/Code/Bemo/frontend/src/store/notes.ts) combines:
  - reactive state
  - filtering
  - HTTP calls
  - cache fallback
  - sync queue writes

Target shape:

```text
frontend/src/
  domain/notes/
    notesStore.ts
    notesApi.ts
    notesCache.ts
    notesSync.ts
    notesTypes.ts
```

Rule:

- store manages state only
- api handles backend requests only
- sync module writes mutation log only

### 4. Turn frontend sync into an engine instead of a global utility

Current issue:

- [frontend/src/utils/sync.ts](/E:/Work/Code/Bemo/frontend/src/utils/sync.ts) acts as:
  - status bus
  - transport factory
  - attachment sync handler
  - queue flusher
  - online/offline listener

Target shape:

```text
frontend/src/
  domain/sync/
    syncCoordinator.ts
    syncStatusStore.ts
    mutationLogRepository.ts
    attachmentSyncService.ts
    transports/
      serverTransport.ts
      webdavTransport.ts
```

### 5. Separate desktop backend assumptions from deployable server assumptions

Current issue:

- the same backend codebase serves both sidecar and remote-server needs
- that is fine, but only if mode-specific capabilities are explicit

Target:

- `desktop` mode:
  - local apply routes enabled
  - permissive local CORS acceptable
- `server` mode:
  - local apply routes disabled
  - explicit CORS required
  - only remote sync API exposed

## Recommended Execution Order

1. Extract backend sync repositories and engine.
2. Introduce `note_id` index table and switch sync paths to indexed lookup.
3. Split frontend notes domain into store/api/cache/sync modules.
4. Split frontend sync utility into coordinator/repository/transport modules.
5. After boundaries stabilize, decide whether local Markdown remains the canonical store or becomes an export format.

## Practical Guardrails

- Keep current API paths stable while moving internals.
- Prefer moving logic behind new modules before changing behavior.
- Add tests around mode-specific route exposure and sync conflict behavior before larger refactors.
- Do not start with a full rewrite of Markdown storage; first isolate it behind repository interfaces.
