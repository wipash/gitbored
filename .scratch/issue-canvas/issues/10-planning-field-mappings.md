# 10: Configure and filter real planning fields

**What to build:** Users see provenance-aware weight, sprint and planning type from configured authorized sources and filter them without confusing unavailable with unset.

**Blocked by:** 04: Browse authorized sources and resolve GitHub URLs, 07: Filter placements without changing their layout

**Status:** ready-for-agent

**Work state:** queued

## Acceptance criteria

- [ ] Define explicit supported source mappings, configurable provider field IDs, normalization, cross-source precedence and provenance; leave unsupported/unconfigured fields visibly unconfigured.
- [ ] Keep planning type distinct from issue/PR kind; weight zero differs from unset; conflicting mappings never fabricate a value.
- [ ] Provide include/exclude and explicit Unset/Is set semantics; unavailable/unfetched data marks filtering incomplete rather than asserted unset or a complete matching set.
- [ ] Integrate mappings into details, view preferences and AND-combined filters without storing private values in shapes/history.
- [ ] Prove deterministic configured behavior through the application boundary and identify each live-source permission/query gate. Do not claim fixtures establish Projects integration.
- [ ] If Projects read permission is necessary, document concrete query evidence before requesting it; live mapping proof remains separately gated.

## Non-goals

No universal fabricated GitHub weight/sprint/type or write permissions.

## Affected shared contracts

Own planning-value discriminated availability/provenance contract and configured provider retrieval; reuse authorized resolver and filter semantics.

## Comments

- 2026-11-05 — Project manager: Published from the accepted specification under the user’s instruction to proceed without a confirmation round. Work starts only when blocking tickets are done.
