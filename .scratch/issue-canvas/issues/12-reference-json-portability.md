# 12: Export and import reference-only boards

**What to build:** Owners export portable JSON and import validated mixed-content boards resolved under the importing user authority.

**Blocked by:** 04: Browse authorized sources and resolve GitHub URLs, 11: Recover unsaved and conflicting board edits

**Status:** ready-for-agent

**Work state:** in-progress

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
- 2026-11-06 — **Project manager, claim after checked11:** owner JsonPortability, branch `ticket/12-reference-json-portability`, worktree `../gitbored-wt/12-reference-json-portability`, frontend/backend/provider3001/3002/3007 (observed empty before reservation).04 and11 are done; checked11 merge0c5e796 passed both canonical gates. Own portable envelope, owner-scoped export, staged import validation/authorized reference remapping and the corresponding Boards-list/Board-settings controls. First return a concise envelope/API/authority/Incoming-semantics plan for manager approval; no public-contract implementation before that plan. Reuse existing native validators/migrations, provider registry and11 checkpoint/current-pair semantics; no arbitrary provider URL proxy, private metadata cache, auth/session ownership change, SDK import bypass or visual-export scope. Follow coding/management rules and better-interface/all six domains.22 owns the priority identity fix on3009/3019,06 contextual layout on3005/3006/3008,08 refresh/provider lifecycle; do not import their unfrozen source. Later final composition preserves their checked changes.
