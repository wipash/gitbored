# 17: Measure mixed-board performance

**What to build:** The selected engine is measured on representative mixed-content boards rather than inferred from another engine.

**Blocked by:** 02: Arrange a reference-only native canvas, 05: Discover work into Incoming and deliberately place it, 08: Refresh board metadata and discovery cost-consciously

**Status:** ready-for-agent

**Work state:** queued

## Acceptance criteria

- [ ] Measure pinned production tldraw on representative desktop hardware with hundreds of placements plus drawings/text, refresh and long sessions.
- [ ] Record device/browser/dataset, memory, input latency and frame behavior, repeated metadata updates and observed limits; no extrapolated capacity claim.
- [ ] Exercise the built application with the real workspace and persistence, retaining documented measurement configuration and limitations.

## Non-goals

No engine fallback, unmeasured capacity claims or license-related work.

## Affected shared contracts

Own reproducible performance measurement evidence, not provider behavior.

## Comments

- 2026-11-05 — Project manager: Published from the accepted specification under the user’s instruction to proceed without a confirmation round. Work starts only when blocking tickets are done.
