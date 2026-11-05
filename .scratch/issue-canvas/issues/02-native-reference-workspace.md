# 02: Arrange a reference-only native canvas

**What to build:** The selected tldraw engine provides a usable local workspace for cards and native annotations, with reference-only snapshots and metadata outside canvas history.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Work state:** in-progress

## Acceptance criteria

- [ ] Pin the selected tldraw SDK and define validated versioned reference/kind/dimension properties, schema migration and native document contracts. Preserve lossless provider IDs; never store fetched metadata in shapes.
- [ ] Pan, zoom, select, move, multi-select, group/ungroup, frame, draw, type, stack, clip, duplicate, delete, undo and redo with native SDK behavior.
- [ ] Custom issue/PR cards have stable dimensions, anonymous unresolved states, meaningful descriptions and an explicit supported GitHub-link seam; card dragging never navigates.
- [ ] Disable unrelated embeds, external upload, image ingestion and URL unfurling, including paste/drop entry points.
- [ ] Inspect real desktop light/dark and 320px rendering and persist/reload a reference-only mixed-content snapshot in a throwaway harness. No production anonymous-board endpoint or fabricated metadata.
- [ ] Provide the reusable workspace composition contract for authenticated boards.

## Non-goals

No second layout/history model, engine switcher, permanent fixture workspace or provider requests per card.

## Affected shared contracts

Own native snapshot validation, shared item/reference/card contracts and workspace component; authentication and durable board mounting are separate.

## Comments

- 2026-11-05 — Project manager: Published from the accepted specification under the user’s instruction to proceed without a confirmation round. Work starts only when blocking tickets are done.
- 2026-11-05 — Project manager: Claimed for NativeWorkspace; branch `ticket/02-native-reference-workspace`, worktree `../gitbored-wt/02-native-reference-workspace`, development ports 3003/3004. User explicitly removed licensing from tracked work.
