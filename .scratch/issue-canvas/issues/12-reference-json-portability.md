# 12: Export and import reference-only boards

**What to build:** Owners export portable JSON and import validated mixed-content boards resolved under the importing user authority.

**Blocked by:** 04: Browse authorized sources and resolve GitHub URLs, 11: Recover unsaved and conflicting board edits

**Status:** ready-for-agent

**Work state:** queued

## Acceptance criteria

- [ ] Export is owner-scoped and contains native document plus provider reference manifest, never credentials/fetched metadata; explain user-authored notes may be sensitive.
- [ ] Validate file size, schema/version, allowed record types, shape properties, bindings and manifest references before creating a new private board.
- [ ] Remap immutable references via authorized provider/node resolution for Issue and PullRequest, preserving unavailable placements and geometry without another account cache.
- [ ] Reject malformed or unsupported future documents without damaging existing boards; explicitly migrate supported older versions.
- [ ] Exercise round trips with text, drawings, groups, frames, bindings, duplicate placements, invalid imports, cross-user import and unresolved references.

## Non-goals

No required visual export, arbitrary embeds/assets, or unauthorized metadata hydration.

## Affected shared contracts

Own portable envelope and import remapping transaction; use shared native validation and provider identity registry.

## Comments

- 2026-11-05 — Project manager: Published from the accepted specification under the user’s instruction to proceed without a confirmation round. Work starts only when blocking tickets are done.
