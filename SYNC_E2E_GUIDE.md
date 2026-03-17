# Bemo Sync E2E Guide

## Purpose

This guide verifies the current sync baseline across two simulated devices:

- Device A: `http://127.0.0.1:4173`
- Device B: `http://127.0.0.1:4174`

Each device uses a different frontend origin, so IndexedDB and local sync state stay isolated.

## Start The Local E2E Environment

From the repo root:

```powershell
.\sync-e2e.ps1
```

That script opens:

- backend on `http://127.0.0.1:8000`
- frontend device A on `http://127.0.0.1:4173`
- frontend device B on `http://127.0.0.1:4174`

## Sync Modes

### Server Mode

Configure both devices in Settings -> Sync:

- Mode: `自部署服务器`
- Server URL: `http://127.0.0.1:8000`
- Access Token: `dev-sync-token`
- Device Name: `Device A` / `Device B`

Before starting the backend, set:

```powershell
$env:BEMO_SYNC_TOKEN="dev-sync-token"
```

### WebDAV Mode

Configure both devices in Settings -> Sync:

- Mode: `WebDAV`
- WebDAV URL: your WebDAV endpoint
- Username: your WebDAV username
- Password: your WebDAV app password
- Base Path: optional sandbox path such as `bemo-dev`
- Device Name: `Device A` / `Device B`

Use an empty or isolated WebDAV folder when testing.

## Acceptance Cases

### 1. Create Sync

1. On Device A, create a note with plain text.
2. Confirm the top bar pending count returns to `0`.
3. On Device B, trigger sync or wait for pull.
4. Confirm the same note appears once on Device B.

Expected:

- no duplicate note
- same `title` and content
- no conflict record

### 2. Edit Sync

1. On Device A, edit the existing note body.
2. Wait for pending count to clear.
3. On Device B, trigger sync.
4. Confirm Device B shows the updated body.

Expected:

- latest body arrives
- note remains a single record

### 3. Delete Sync

1. On Device A, delete the note.
2. Wait for pending count to clear.
3. On Device B, trigger sync.
4. Confirm the note disappears on Device B.

Expected:

- delete propagates once
- no orphan duplicate remains in the main feed

### 4. Pin Sync

1. On Device A, create a new note.
2. Toggle pin on Device A.
3. Sync Device B.
4. Confirm the note is pinned on Device B.

Expected:

- `pinned` metadata propagates
- note order updates correctly

### 5. Attachment Sync

1. On Device A, create a note and insert an image.
2. Confirm the image renders on Device A.
3. Wait for sync.
4. On Device B, trigger sync.
5. Confirm the image renders on Device B.

Expected:

- note body syncs
- image file is downloaded locally on Device B
- image URL stays valid after refresh

### 6. Conflict Copy

1. Create a note and wait until both devices have it.
2. Turn off network or temporarily switch one device to `本地模式`.
3. Edit the same note body on Device A.
4. Edit the same note body differently on Device B.
5. Re-enable sync on both devices.

Expected:

- one side keeps the canonical synced note
- a new note titled `冲突副本 - <原标题>` appears
- `冲突记录` view shows the conflict entry
- no note body is silently lost

### 7. Offline Queue Recovery

1. On Device A, disconnect network.
2. Create one note and edit another note.
3. Confirm top bar shows pending operations.
4. Reconnect network.
5. Confirm pending count returns to `0`.
6. Sync Device B.

Expected:

- queued mutations flush automatically
- Device B receives both changes

## Quick Failure Checks

If a case fails, inspect these first:

- top bar pending count is stuck above `0`
- top bar error text is non-empty
- `冲突记录` contains unexpected conflicts
- backend terminal logs rejected `/api/sync/*` auth requests
- WebDAV target already contains unrelated old `bemo-sync` data

## Current Scope

This guide validates the minimum sync baseline only.

Not covered yet:

- blob garbage collection
- snapshot compaction
- automated multi-process browser assertions
