# 15: Complete accessible desktop and narrow board workflows

**What to build:** Core board work is keyboard-operable, understandable and reachable in light/dark desktop and narrow windows, with genuine accessibility evidence.

**Blocked by:** 06: Inspect cards through non-modal contextual panels, 07: Filter placements without changing their layout, 11: Recover unsaved and conflicting board edits, 12: Export and import reference-only boards, 14: Verify the full refresh and authorization lifecycle

**Status:** ready-for-agent

**Work state:** queued

## Acceptance criteria

- [ ] Complete list inspection, insertion, selection, movement, grouping, deletion, duplicate, undo/redo and link activation using available native/control keyboard paths.
- [ ] Verify meaningful descriptions, labels, announcements, visible focus, contextual focus return and no traps, including hidden/removed triggers.
- [ ] Inspect light/dark, 320px and 200% text, long/loading/empty/error/conflict states with no unintended document horizontal overflow; canvas internal scrolling is allowed.
- [ ] Preserve regression proof for unobscured focus after contextual Add; drag and keyboard alternatives yield the same intended placement.
- [ ] Perform real screen-reader smoke and distinguish it from browser automation; record unavailable assistive hardware instead of certification claims.
- [ ] Obtain required independent rendered Claude Fable review at milestone and fix acceptance-blocking findings.

## Non-goals

No promise of full mobile editing parity, touch certification from pointer tests, or redesign of Atlas + Contextual.

## Affected shared contracts

Own cross-flow acceptance and bounded accessibility fixes, reusing native editor rather than a parallel control model.

## Comments

- 2026-11-05 — Project manager: Published from the accepted specification under the user’s instruction to proceed without a confirmation round. Work starts only when blocking tickets are done.
