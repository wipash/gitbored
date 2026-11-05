# 05: Discover work into Incoming and deliberately place it

**What to build:** Selected repository sources feed a durable Incoming tray; users drag or Add candidates onto their chosen board without moving existing work.

**Blocked by:** 03: Create and reopen private boards, 04: Browse authorized sources and resolve GitHub URLs

**Status:** ready-for-agent

**Work state:** queued

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
