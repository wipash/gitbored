# 14: Verify the full refresh and authorization lifecycle

**What to build:** A mixed-source board stays truthful through planning updates, source failures, permission changes and credential renewal without corrupting layout or Incoming.

**Blocked by:** 08: Refresh board metadata and discovery cost-consciously, 09: Remove private metadata on access loss and account changes, 10: Configure and filter real planning fields

**Status:** ready-for-agent

**Work state:** queued

## Acceptance criteria

- [ ] Integrate source discovery, planning retrieval, PR enrichment and placed-reference refresh with consistent user-scoped coalescing and invalidation.
- [ ] Measure realistic mixed request counts/latency/rate budget and finalize documented default cadence and bounds; retain user pause/settings.
- [ ] Exercise partial source success, PR-only pages, hidden/repeated references, planning unavailability, expiry/reauthorization and resumed tabs without redundant fetches or false success.
- [ ] Verify no layout saves/history entries or candidate loss from refresh, backoff or access loss; current metadata remains after undo.

## Non-goals

No speculative scheduler service or new operational platform.

## Affected shared contracts

Own cross-feature lifecycle acceptance and bounded fixes within existing coordinator/source contracts.

## Comments

- 2026-11-05 — Project manager: Published from the accepted specification under the user’s instruction to proceed without a confirmation round. Work starts only when blocking tickets are done.
