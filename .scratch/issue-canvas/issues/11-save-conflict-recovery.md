# 11: Recover unsaved and conflicting board edits

**What to build:** Interrupted saves and two-tab conflicts retain local work and offer explicit reload or save-as-copy without silently overwriting a newer board.

**Blocked by:** 03: Create and reopen private boards, 05: Discover work into Incoming and deliberately place it

**Status:** ready-for-agent

**Work state:** in-progress

## Acceptance criteria

- [ ] Preserve latest local draft during failed, out-of-order or conflicting saves; serialize/coalesce acknowledgements so old responses cannot claim current work saved.
- [ ] Account/board-scoped local recovery stores reference-only native work and consistent Incoming operation state, never private metadata or credentials.
- [ ] Never apply a recovery draft over a newer revision automatically; show a clear recovery choice with reload and save-as-copy.
- [ ] Save-as-copy produces a new private board preserving mixed content and queue consistency; current server board remains unchanged.
- [ ] Exercise two real browser contexts/tabs, failed saves, restart/reopen, logout/account changes and conflict recovery against real SQLite.

## Non-goals

No offline-first replication or live merge/collaboration.

## Affected shared contracts

Own recovery envelope/version and client save state transitions; reuse atomic board revision and Incoming contracts.

## Comments

- 2026-11-05 — Project manager: Published from the accepted specification under the user’s instruction to proceed without a confirmation round. Work starts only when blocking tickets are done.
- 2026-11-06 — **Project manager, claim:** **ConflictRecovery**, `ticket/11-save-conflict-recovery`, `../gitbored-wt/11-save-conflict-recovery`, application/frontend/provider **3001/3002/3007**, from checked05 main. Own saveCoordinator, account/board-scoped reference-only recovery, Boards reload/save-as-copy choices and needed authenticated copy API; preserve latest atomic native/Incoming pair and source board.08 owns refresh/provider scenarios,06 contextual controls,16 operations. Read `local://post05-parallel-contracts.md`, spec201–208/235 and required docs. Use better-interface/owning domains and real two-context/HTTP/SQLite/restart/account evidence; one tab must not clear another's unsaved work. No silent newer-revision overwrite, private cache/credentials in recovery, or second durability authority. All criteria required; no full gate, self-integration or PROGRESS edits.
