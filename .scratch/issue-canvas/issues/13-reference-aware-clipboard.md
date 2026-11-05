# 13: Keep references safe through native copy and schema evolution

**What to build:** Native copy/paste and older supported snapshots preserve reference identity and geometry without importing private caches or unsupported content.

**Blocked by:** 02: Arrange a reference-only native canvas, 12: Export and import reference-only boards

**Status:** ready-for-agent

**Work state:** queued

## Acceptance criteria

- [ ] Copy/duplicate produces independent native shape IDs sharing authorized item references; ordinary picker addition still focuses existing placement.
- [ ] Validate native clipboard/drop reference content and resolve/remap under current authority; reject arbitrary embeds/uploads/images and malformed records through every supported entry point.
- [ ] Exercise native clipboard between boards/accounts, repeated placements, unsupported schema and supported shape migration without metadata entering document/history.
- [ ] Preserve frames, groups, bindings and clipping through allowed clipboard content; unavailable references remain anonymous.

## Non-goals

No generic multi-engine importer, schema bypass or permanent compatibility aliases.

## Affected shared contracts

Own native paste/drop validation and migrations with portable manifest contract; remove obsolete accepted forms once migrated.

## Comments

- 2026-11-05 — Project manager: Published from the accepted specification under the user’s instruction to proceed without a confirmation round. Work starts only when blocking tickets are done.
