# 05: Discover work into Incoming and deliberately place it

**What to build:** Selected repository sources feed a durable Incoming tray; users drag or Add candidates onto their chosen board without moving existing work.

**Blocked by:** 03: Create and reopen private boards, 04: Browse authorized sources and resolve GitHub URLs

**Status:** ready-for-agent

**Work state:** in-progress

## Acceptance criteria

- [ ] Persist selected sources, queue, seen bookkeeping and bounded discovery cursors per owner/board. Deduplicate rediscovery; discovery never creates shapes.
- [ ] Retain mixed-page completeness/progress across reconciliation. Placed or intentionally deleted references do not silently requeue; explicit browsing/URL may re-add.
- [ ] Drag uses real native coordinate/parent transforms at pan/zoom and frames; cancelled, invalid and outside drops leave queue and document unchanged.
- [ ] Add uses a labelled predictable receiving area, reveals and focuses visible placement and closes an obstructing tray. Keyboard insertion works at 320px.
- [ ] Consume the queue and document placement atomically against the board revision; failure retains recoverable work and truthful save state.
- [ ] Native undo of first placement restores Incoming only when no other placement remains; redo consumes it. Explicit duplication does not alter queue; ordinary repeated add focuses an existing placement.
- [ ] Announce loading, empty, errors and queue counts distinctly; persist queue and placements across reopen and backend restart.

## Non-goals

No auto-placement, reflow, separate undo stack or discovery-driven deletion.

## Affected shared contracts

Own Incoming/source bookkeeping and atomic save effects, coordinating native editor history with board revisions.

## Comments

- 2026-11-05 — Project manager: Published from the accepted specification under the user’s instruction to proceed without a confirmation round. Work starts only when blocking tickets are done.
- 2026-11-06 — **Project manager, claim:** owner **IncomingPlacement**, branch `ticket/05-persistent-incoming-placement`, worktree `../gitbored-wt/05-persistent-incoming-placement`; reserved frontend/backend/provider **3001/3002/3007**.03/04 are integrated and done. Own Incoming tables/contracts/routes, selected-source/cursor/seen bookkeeping, revision-atomic native placement/queue effects, save-coordinator integration, board composition and authorization-scoped immutable metadata hydration. Preserve every accepted03 account/native/save lifetime and04 authorization/denial contract. Build one actual non-modal Incoming surface;06 will extend that convention after the real flow is available, not add a competing panel model. No auto-placement, independent undo stack, native SDK patches, future filter/refresh placeholders or production fixture path.
- 2026-11-06 — **Project manager, boundaries:**16 concurrently owns operational tooling/configuration and README operator sections;05 owns workspace/Incoming documentation and application schema/composition.16 will rebase and preserve05 schema/docs before final real-Incoming restore proof. Use the existing controlled provider;05 owns necessary provider-scenario additions and keeps them additive. Use better-interface and all owning domain skills, exact-candidate public-browser/HTTP/SQLite evidence, separate feature/tracking commits, and complete owned resource teardown. Do not edit manager-owned PROGRESS or run full integration gates mid-flight.
