# Frontend Migration Backlog

## Goal

Repository target state:

- `frontend` owns the product runtime
- `backend` is retained only for optional self-hosted `sync-server` APIs

This file tracks the remaining areas where frontend code still assumes a general-purpose backend exists.

## Keep In Backend

These should remain in Python because they are the optional `sync-server` product surface:

- `POST /api/sync/push`
- `GET /api/sync/pull`
- `HEAD/PUT/GET /api/sync/blobs/{blob_hash}`
- sync auth / token checks
- sync-specific persistence and tests

Primary references:

- [backend/api/sync.py](E:/Work/Code/Bemo/backend/api/sync.py)
- [backend/services/sync_service.py](E:/Work/Code/Bemo/backend/services/sync_service.py)
- [frontend/src/utils/serverTransport.ts](E:/Work/Code/Bemo/frontend/src/utils/serverTransport.ts)

## Must Move To Frontend

### 1. Attachment local storage and lookup

Current problem:

- frontend still resolves `/images/...` through backend origin assumptions
- synced blobs are still written back through `PUT /api/sync/local/blobs/...`
- markdown image rendering still assumes HTTP-hosted images

Primary references:

- [frontend/src/utils/syncAttachments.ts](E:/Work/Code/Bemo/frontend/src/utils/syncAttachments.ts)
- [frontend/src/utils/markdownRenderer.ts](E:/Work/Code/Bemo/frontend/src/utils/markdownRenderer.ts)
- [frontend/src/components/Editor.vue](E:/Work/Code/Bemo/frontend/src/components/Editor.vue)
- [backend/_archive_legacy/api/sync_local_legacy.py](E:/Work/Code/Bemo/backend/_archive_legacy/api/sync_local_legacy.py)
- [backend/app_factory.py](E:/Work/Code/Bemo/backend/app_factory.py)

Target direction:

- store attachments locally in frontend-owned storage
- generate frontend-owned local URLs for rendering
- remove dependency on `/images/...` for normal app usage
- remove dependency on `/api/sync/local/...`

Recommended target implementations:

- Web: IndexedDB or OPFS-backed blob storage
- Capacitor mobile: Capacitor Filesystem or equivalent local file bridge
- Desktop shell: Tauri file APIs if needed

### 2. API base fallback as default app assumption

Current problem:

- frontend still carries optional backend URL compatibility paths
- this can still make the app appear backend-oriented if the docs are not explicit

Primary references:

- [frontend/src/config.ts](E:/Work/Code/Bemo/frontend/src/config.ts)
- [frontend/README.md](E:/Work/Code/Bemo/frontend/README.md)

Target direction:

- no backend URL should be required for normal app startup
- optional sync-server URLs should be used only when `server` sync mode is configured

Current status:

- default frontend startup no longer assumes `localhost:8000/api`
- backend URL resolution is now explicit compatibility behavior, not a startup baseline

## Can Be Removed After Frontend Migration

These backend surfaces look redundant once frontend attachment/storage migration is complete.

### 1. Local sync blob bridge

- [backend/_archive_legacy/api/sync_local_legacy.py](E:/Work/Code/Bemo/backend/_archive_legacy/api/sync_local_legacy.py)

Reason:

- this exists to let frontend write synced blobs into local backend-managed storage
- once attachments are fully frontend-owned, this bridge should disappear

Current status:

- frontend main path no longer depends on this route
- backend default runtime no longer exposes this route
- legacy bridge code is archived under [backend/_archive_legacy](E:/Work/Code/Bemo/backend/_archive_legacy)

### 2. Static `/images` hosting for local app usage

- [backend/app_factory.py](E:/Work/Code/Bemo/backend/app_factory.py)
- [backend/_archive_legacy/services/image_service_legacy.py](E:/Work/Code/Bemo/backend/_archive_legacy/services/image_service_legacy.py)

Reason:

- for local-first frontend runtime, image delivery should not require Python static hosting
- only sync-server blobs should remain backend-owned

### 3. General note CRUD APIs

- [backend/_archive_legacy/api/notes_legacy.py](E:/Work/Code/Bemo/backend/_archive_legacy/api/notes_legacy.py)

Reason:

- note CRUD is already frontend-owned
- these endpoints are legacy compatibility surface, not target architecture

Current status:

- backend default runtime no longer exposes these endpoints
- legacy implementation is archived under [backend/_archive_legacy](E:/Work/Code/Bemo/backend/_archive_legacy)

### 4. Backend import/export APIs

- [backend/_archive_legacy/api/uploads_legacy.py](E:/Work/Code/Bemo/backend/_archive_legacy/api/uploads_legacy.py)
- [backend/_archive_legacy/services/import_service_legacy.py](E:/Work/Code/Bemo/backend/_archive_legacy/services/import_service_legacy.py)
- [backend/_archive_legacy/services/export_service_legacy.py](E:/Work/Code/Bemo/backend/_archive_legacy/services/export_service_legacy.py)

Reason:

- import/export is already implemented in frontend
- backend versions are no longer part of the desired default product path

Current status:

- backend default runtime no longer exposes these endpoints
- legacy implementation is archived under [backend/_archive_legacy](E:/Work/Code/Bemo/backend/_archive_legacy)

### 5. Backend AI endpoints and stores

- [backend/_archive_legacy/api/ai_legacy.py](E:/Work/Code/Bemo/backend/_archive_legacy/api/ai_legacy.py)
- [backend/_archive_legacy/api/settings_legacy.py](E:/Work/Code/Bemo/backend/_archive_legacy/api/settings_legacy.py)
- [backend/_archive_legacy/services](E:/Work/Code/Bemo/backend/_archive_legacy/services)

Reason:

- AI chat and settings are already frontend-owned
- backend AI only makes sense if you intentionally want a proxy deployment model
- that is no longer the target default

Current status:

- backend default runtime no longer exposes these endpoints
- legacy implementation is archived under [backend/_archive_legacy](E:/Work/Code/Bemo/backend/_archive_legacy)

## Migration Priority

### P1

- frontend-owned attachment storage
- remove frontend dependency on `/api/sync/local/...`
- stop treating `localhost:8000/api` as normal startup baseline

### P2

- deprecate backend note CRUD endpoints
- deprecate backend upload/import/export endpoints
- deprecate backend AI endpoints

### P3

- simplify backend app factory so it only mounts sync-server routes in server mode
- trim backend tests and dependencies to sync-server scope

## Decision Rule

When deciding where new code should live:

- if it is required only for optional self-hosted server sync, backend is acceptable
- otherwise, it should default to frontend
