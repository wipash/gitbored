# 16: Operate and restore a durable small deployment

**What to build:** An operator runs the single app with durable protected storage and can back up and restore boards plus protected key recovery.

**Blocked by:** 03: Create and reopen private boards

**Status:** ready-for-agent

**Work state:** queued

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
