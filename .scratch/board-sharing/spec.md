# Read-only board sharing and live viewing

Implement the two steps agreed with the user: authenticated read-only sharing,
then live viewing of owner saves. Only the owner edits. Sharing intentionally
includes the displayed GitHub issue details, including private-repository data.

## Step 1: authenticated sharing

- One stable unpredictable link per board. Private, Anyone with the link, and
  Specific people settings. Everyone signs in. Specific people are existing app
  accounts selected by GitHub login and stored by immutable application user ID.
- Link access does not create permanent membership. Changing the setting changes
  subsequent access. Owner-only board APIs remain owner-only.
- Share panel explains private issue disclosure; exposes current settings,
  people, and a copyable link. Preserve the exact share destination across login.
- Dedicated viewer: pan, zoom, select, Find, card details, personal preferences.
  No Incoming, shared mutations, owner controls, or local draft recovery.
- A durable publication contains the saved canvas, planning selection, and
  validated metadata for placed references only. No credentials or unrelated
  cache content. Previously published details survive ordinary cache eviction or
  provider loss until removed from the board or sharing is disabled. Show time.
- Prune removed references on every save. Publish owner-fetched metadata updates
  and title updates with a monotonic publication version independent of canvas
  revision. Never fetch GitHub using a viewer's authority for this view.

## Step 2: live saved changes

- Keep existing revision-checked owner canvas/Incoming save as the sole durable
  authority. A tldraw sync room is a read-only projection of committed saves.
  This intentionally broadcasts after save debounce, not unsaved gestures.
- Apply record diffs in a room transaction; do not replace snapshots by an API
  that disconnects clients. Recover rooms from SQLite after process restart.
- Send versioned publication notifications on the same socket for title/metadata.
  Refetch after reconnect; discard older HTTP responses. Keep editor/camera alive
  across ordinary publication updates. Allow pausing automatic updates.
- Every socket is read-only, including object records. No viewer presence.
  Authenticate short-lived single-use tickets bound to the original session and
  board. Check Origin and authority before outbound data and inbound messages;
  revoke on policy changes, deletion, logout and expiry. Clear denied views.
- Broadcast failures cannot turn committed saves into apparent failures. Drop
  failed rooms and reconstruct on reconnect. No second persistent writer.
- Enable development and production WebSocket proxy support. No asset storage
  or separate deployment service is introduced.

## Validation

The repository's approved seams are browser UI and public HTTP endpoints with
real SQLite and controlled GitHub fixtures. Extend these to the public WebSocket
endpoint for malformed/unauthorized writes. Exercise Alice/Bob sharing modes,
OAuth return, private metadata publication/pruning, viewer write rejection,
live owner save/title/metadata updates, access revocation, reconnect and restart.
Preserve existing owner save/conflict/recovery and canvas keyboard regressions.
Inspect Share and viewer in light/dark, at desktop/320px/enlarged text, keyboard
focus, loading/empty/error states. Run focused tests, then full pnpm gate.

## Plan critique agreement

Two independent coworkers reviewed the design: sharing_critic (authorization and
publication) and sync_critic (sync/persistence/client). Both agreed after discussion.
Their changes: retain CAS as authority for read-only scope; publish only placed
refs; version metadata independently; broadcast only after commit and isolate
failures; use room record transactions rather than loadSnapshot (disconnects);
guard actual socket sends, not observational hooks; explicitly deny object
writes; hide presence; refetch after reconnect. Specific-people matches logins
case-insensitively but stores immutable IDs. Shared access remains available when
the viewer's GitHub authorization needs renewal but application session is valid.

## Excluded

Anonymous access, editor invitations, multiple writers, unsaved live gestures,
shared Incoming browsing, and new export/copy functionality. This scope supersedes
the original issue-canvas spec's exclusion of sharing for these read-only paths.
