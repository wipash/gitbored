# 03: Create and reopen private boards

**What to build:** An authenticated owner creates, names, edits, reopens and deletes boards with server-backed native documents and truthful acknowledged save status.

**Blocked by:** 01: Sign in through the GitHub App, 02: Arrange a reference-only native canvas

**Status:** ready-for-agent

**Work state:** queued

## Acceptance criteria

- [ ] Board list/create/load/rename/save/delete are owner-scoped, including direct cross-user requests; ownership derives from the session, never a request-supplied user ID.
- [ ] Store native versioned documents in real SQLite with atomic expected-revision GET/PUT semantics; reject stale saves without overwriting.
- [ ] Coalesce document-only saves and show Saving, Saved, Unsaved and Conflict according to server acknowledgements; failed saves preserve current local work.
- [ ] Reload and restart reopen mixed native content with geometry, frames, groups and bindings intact; metadata changes do not trigger layout saves.
- [ ] Mount the actual workspace through authenticated navigation with light/dark themes, board controls and usable keyboard/320px layouts.

## Non-goals

No live collaboration, public boards or browser-only durable authority.

## Affected shared contracts

Own board schema and routes, board workspace mounting and revisioned save envelope; reserve atomic Incoming effects in the same board revision.

## Comments

- 2026-11-05 — Project manager: Published from the accepted specification under the user’s instruction to proceed without a confirmation round. Work starts only when blocking tickets are done.
