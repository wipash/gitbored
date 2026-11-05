# 16: Operate and restore a durable small deployment

**What to build:** An operator runs the single app with durable protected storage and can back up and restore boards plus protected key recovery.

**Blocked by:** 03: Create and reopen private boards

**Status:** ready-for-agent

**Work state:** in-progress

## Acceptance criteria

- [ ] Document and exercise fresh setup, pinned runtime/dependencies, durable data directory, shutdown/restart and SQLite-consistent backup/restore.
- [ ] Protect encrypted credential key material, permissions and recovery separately; backup/restore retains private ownership, revisions and Incoming without logging secrets.
- [ ] Default to loopback HTTP; provide explicit secure HTTPS configuration for non-loopback exposure with secure sessions and origin/CSRF validation.
- [ ] Restore an isolated real application copy and reopen owner boards; unauthenticated and other-user requests remain denied.
- [ ] Keep deployment one backend and SQLite without automated backup fleet/HA machinery.

## Non-goals

No public deployment or purchase without user provisioning, no service topology expansion.

## Affected shared contracts

Own operational configuration, backup/restore tooling and operator instructions; coordinate authentication configuration.

## Comments

- 2026-11-05 — Project manager: Published from the accepted specification under the user’s instruction to proceed without a confirmation round. Work starts only when blocking tickets are done.
- 2026-11-06 — **Project manager, claim:** owner **DurableOperations**, branch `ticket/16-durable-deployment-backup`, worktree `../gitbored-wt/16-durable-deployment-backup`; reserved application/TLS/provider **3009/3010/3011**.03 is integrated and done. Own operational configuration/tooling and README operator instructions, not application schema, board composition, native SDK or source-provider normalization. Reuse one backend/SQLite, loopback-by-default and protected current-user credentials; secure non-loopback exposure may use an explicit HTTPS reverse proxy without widening the application’s loopback listener. No push, cloud mutation, live GitHub credentials, public deployment, automated backup fleet or HA.
- 2026-11-06 — **Project manager, integration dependency:**05 concurrently owns Incoming/schema/save effects and necessary controlled-provider additions. Exercise reachable fresh setup, consistent SQLite backup/restore, protected separate key recovery, shutdown/restart, owner/other-user denial and HTTPS/origin/CSRF now. Final acceptance must rebase onto actual05 and restore real persisted Incoming, not a synthetic stand-in or an omitted table. Keep README changes to operator sections;16 resolves its integration against05 while retaining both. Full gate/merge remains manager-owned. Append actual candidate/scenarios and evidence to this ticket, keep tracking separate, clean only owned resources, never edit PROGRESS.
