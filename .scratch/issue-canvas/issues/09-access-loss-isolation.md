# 09: Remove private metadata on access loss and account changes

**What to build:** Revoked access, expired credentials and account switches remove affected private content while preserving anonymous canvas placements.

**Blocked by:** 04: Browse authorized sources and resolve GitHub URLs, 08: Refresh board metadata and discovery cost-consciously

**Status:** ready-for-agent

**Work state:** queued

## Acceptance criteria

- [ ] Authorize delivery of cached representations using current-user reads/node resolution; common issue permission does not authorize cached PR enrichment after PR permission loss.
- [ ] Distinguish transient stale, unauthorized/unavailable, unresolved and successful states; private-resource 404 never claims proven deletion.
- [ ] On detected access loss purge affected metadata/details, preserve geometry and show anonymous placements; undo cannot resurrect private titles or labels.
- [ ] Logout/account change clears private in-memory state and previews; ignore late responses from the old authorization context; no private browser query cache.
- [ ] Pause revoked/expired user work and offer refresh/reauthorization without broader installation authority.
- [ ] Exercise cross-user direct references, in-flight account switches, cached PR permission loss, transient errors and logout with open details.

## Non-goals

No instantaneous revocation promise or erasure of already downloaded/user-authored data.

## Affected shared contracts

Own authorization-context invalidation contract across provider cache, coordinator and client subscriptions.

## Comments

- 2026-11-05 — Project manager: Published from the accepted specification under the user’s instruction to proceed without a confirmation round. Work starts only when blocking tickets are done.
