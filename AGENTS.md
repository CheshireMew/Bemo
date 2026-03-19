# Repository Guidance

## Project Identity

This repository is **not** a general-purpose frontend/backend split application.

Treat it as:

- a **frontend-first, local-first product**
- with an **optional Python sync-server**
- where the Python side is retained only for **self-hosted server sync APIs**

## Default Assumptions

When reading or modifying this repo, assume:

- the frontend is the primary product runtime
- core product features should live in the frontend whenever technically possible
- the backend is not required for normal single-device usage
- WebDAV sync is frontend-owned
- AI is frontend-owned
- import/export is frontend-owned
- note CRUD, search, trash, conflict handling, and attachment UX are frontend-owned

## Backend Boundary

The Python backend should be treated as an **optional sync-server**, not as a business backend.

Keep backend scope limited to:

- server sync change APIs
- server sync blob APIs
- sync authentication / token checks
- sync-specific storage and tests

Do **not** add or restore backend ownership for:

- note CRUD for normal app usage
- AI chat proxying by default
- import/export flows
- editor workflows
- local attachment management unless required as a temporary sync-server compatibility bridge

## Migration Direction

If a feature exists in both frontend and backend, prefer the frontend implementation unless the feature is explicitly required for the optional self-hosted sync-server mode.

If uncertain, choose this interpretation:

- `frontend` = product
- `backend` = optional sync target
