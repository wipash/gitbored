# 03: Create and reopen private boards

**What to build:** An authenticated owner creates, names, edits, reopens and deletes boards with server-backed native documents and truthful acknowledged save status.

**Blocked by:** 01: Sign in through the GitHub App, 02: Arrange a reference-only native canvas

**Status:** ready-for-agent

**Work state:** in-progress

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
- 2026-11-06 — Project manager: Claimed for **DurableBoards** after 01/02 completion. Branch `ticket/03-private-durable-boards`, worktree `../gitbored-wt/03-private-durable-boards`; assigned frontend/backend/provider ports **3001/3002/3007**. Own board schema/routes/save envelope and coordinator, authenticated native mounting, and final shared application/navigation composition. Run concurrently with 04; integrate 04 first, then rebase and retain both flows while resolving shared registrations/composition. Reuse canonical capture, user-scoped session and metadata contracts; coordinate controlled-provider seams with AuthorizedSources. Retain the concrete native keyboard regressions through the actual authenticated app where practical; do not expand upstream SDK limitations or licensing scope. First complete board workflow requires rendered Fable review.
