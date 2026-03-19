# Sync Server

## Run Tests

This Python directory is now positioned as the optional Bemo `sync-server`.

## Install Dependencies

Default install now targets the sync-server only:

```powershell
pip install -r requirements.txt
```

If you explicitly need to work on legacy compatibility APIs as well, install the extra set too:

```powershell
pip install -r requirements.txt -r requirements-legacy.txt
```

Use the unified test entrypoint from the `backend` directory:

```powershell
python run_tests.py
```

By default this now runs the `sync-server` coverage only.

If you explicitly need the full legacy backend test set:

```powershell
python run_legacy_tests.py
```

The sync tests isolate data by setting `BEMO_DATA_DIR` to a per-test directory under `backend/tests/.tmp`, so they do not touch the real note data.

## Role

This service is no longer the default business backend required for normal note usage.

Its intended role is:

- optional self-hosted sync target
- remote change/blob store for multi-device sync

Its intended non-goals are:

- normal note CRUD for the app
- AI proxying by default
- import/export ownership
- editor feature ownership
- WebDAV ownership
- general product business logic

If the user does not run this service, the frontend should still be able to work in local-first mode.

## Scope Guard

When changing code in `backend`, treat it as `sync-server` code unless there is a very explicit reason otherwise.

New product capabilities should default to `frontend`, not `backend`.

Legacy note CRUD, upload/import/export, AI proxying, and local sync bridge code now live under [backend/_archive_legacy](E:/Work/Code/Bemo/backend/_archive_legacy).

Only shared sync primitives remain in [backend/services](E:/Work/Code/Bemo/backend/services).

## Dev Startup

The repository startup scripts now treat the sync-server as opt-in:

- [start-dev.ps1](E:/Work/Code/Bemo/start-dev.ps1) starts only the frontend by default
- use `.\start-dev.ps1 -WithSyncServer` if you want the optional Python sync-server too
- [start-dev.bat](E:/Work/Code/Bemo/start-dev.bat) behaves the same way
- use `start-dev.bat --with-sync-server` if you want the optional Python sync-server too

## CI Scope

Repository CI should treat the Python side as `sync-server` first:

- default CI runs [run_tests.py](E:/Work/Code/Bemo/backend/run_tests.py) only
- legacy compatibility coverage runs [run_legacy_tests.py](E:/Work/Code/Bemo/backend/run_legacy_tests.py) separately
- legacy backend coverage should not block normal frontend or sync-server changes unless you explicitly choose to run it

## Required Environment

`sync-server` should now be treated as a small deployable service, not as a zero-config local helper.

Required:

- `BEMO_SYNC_TOKEN`
  - must be set to an explicit non-default value
  - server mode now refuses to start if it is missing

Optional but important:

- `BEMO_CORS_ORIGINS`
  - comma-separated allowlist such as `https://notes.example.com,https://app.example.com`
  - if unset in `server` mode, CORS stays disabled
  - that is secure by default, but a remote web frontend will fail cross-origin requests until you configure it
- `BEMO_MAX_SYNC_BLOB_BYTES`
  - maximum accepted blob upload size in bytes
  - defaults to `26214400` (25 MiB)

Example:

```powershell
$env:BEMO_SYNC_TOKEN="replace-with-a-long-random-secret"
$env:BEMO_CORS_ORIGINS="https://notes.example.com"
$env:BEMO_MAX_SYNC_BLOB_BYTES="26214400"
uvicorn main:app --host 0.0.0.0 --port 8000
```

## Web Client Note

If your frontend is served from a different origin than the sync-server, the browser will send CORS preflights.

If `BEMO_CORS_ORIGINS` is not configured, those requests will fail even when the token is correct. In practice this can look like a broken server, so set the CORS allowlist before testing remote web sync.

## Direct Command

If you want the raw discovery command instead, this is equivalent:

```powershell
python -m unittest discover -s tests
```
