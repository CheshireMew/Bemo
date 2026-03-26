# Repository Guidance

## Project Identity

This repository should be treated as one product with shared domain semantics, but with:

- a backend-backed Web / Desktop runtime
- a local-backed Mobile runtime
- separate interaction shells for Web / Desktop and Mobile

It is not a pure local-first app, and it is not a generic frontend/backend split app.

## Default Assumptions

When reading or modifying this repo, assume:

- Web / Desktop use backend app storage as the primary source of truth
- Mobile uses local app storage as the primary source of truth
- frontend owns product semantics, UI shells, sync flow, AI, and import/export semantics
- backend owns Web / Desktop app storage plus sync and browser-proxy capabilities
- Mobile is not just a reduced Web shell; it may need distinct UI and runtime handling

## Architectural Boundary

Keep these concerns shared when possible:

- note, attachment, sync, import/export, and AI contracts
- normalization rules
- sync protocol and conflict semantics

Keep these concerns runtime-specific when needed:

- primary storage implementation
- attachment persistence and URL resolution
- file picking, sharing, and native capability bridges
- page structure, navigation, editor interaction, and settings layout

## Change Direction

Do not try to force all platforms back into one storage path or one UI shell.

When a feature diverges, the goal is:

- one product semantics
- isolated runtime adapters
- separate shells where UX genuinely differs

If uncertain, choose this interpretation:

- `frontend` = shared product layer + platform shells
- `backend` = Web / Desktop app data service + sync service
- `mobile` = local runtime with its own shell and runtime adapters
