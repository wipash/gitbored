# 07: Filter placements without changing their layout

**What to build:** A board view can hide closed issues, merged PRs and selected labels, then Reveal all in exactly the original arrangement.

**Blocked by:** 05: Discover work into Incoming and deliberately place it, 06: Inspect cards through non-modal contextual panels

**Status:** ready-for-agent

**Work state:** queued

## Acceptance criteria

- [ ] Independent closed-issue and merged-PR controls; label include matches any selected label, exclude rejects any, empty selection imposes no restriction; active dimensions combine with AND.
- [ ] Hide display and interaction without deleting/resizing/moving/reparenting/regrouping; hidden counts count placements including repeated references.
- [ ] Persist account/board view preferences outside document/history. Reveal all clears restrictions and restores original geometry and grouping.
- [ ] Incoming remains independent. A filtered-out placement succeeds, announces why hidden and offers Reveal all without resetting filters or losing the candidate.
- [ ] Exercise repeated placements, empty results, metadata-driven visibility transitions, pointer hit testing and native undo/history.

## Non-goals

Planning-field mapping is delivered separately; no inferred unset values or layout mutations.

## Affected shared contracts

Own browser-safe filter/view preference contract and native hidden-shape integration; reserve explicit planning-field availability semantics.

## Comments

- 2026-11-05 — Project manager: Published from the accepted specification under the user’s instruction to proceed without a confirmation round. Work starts only when blocking tickets are done.
