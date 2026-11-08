# Per-user GitHub cache verification

The approved conversation plan was to reuse GitHub metadata by user and resource,
remove token matching, preserve existing cache rows through migration, retain
authorization checks and eviction, and verify cached board loading with the
existing spinner and 15-minute freshness policy.

Implementation: `3946ab7`. Browser fixture isolation and the bounded provider-read
assertion correction: `14d664d`.

## Behavioral evidence

- Same-user sign-in originally returned an empty board cache. The changed public
  HTTP regression failed before the fix and passes after it.
- Automatic OAuth renewal reuses cards, repository pages and project context with
  no item/context provider reads.
- Migration from the previous SQLite schema retains payloads and stale freshness,
  accepts new writes, and survives another startup.
- A held success originally repopulated cache cleared by authorization loss. A
  shared invalidation generation prevents that; the regression failed before the
  guard change and passes afterward.
- A held rejection of an older token originally evicted a valid current cache.
  Only rejection of current authorization now performs authorization eviction.
- The browser reopens a populated board after another sign-in to the same account,
  receives one metadata batch, and needs no per-reference or upstream item/context
  reads. Independent repository discovery is allowed.
- Cached content remains readable during refresh and temporary provider failure;
  detected denial clears it. The native editor remains mounted.

`pnpm exec tsx --test tests/cachedBoardMetadata.test.ts`: five cases passed.
The focused affected browser run passed all 26 cases after fixture isolation was
made explicit in `scripts/test-server.ts`. Ordinary sign-in, renewal and restart
do not reset fixture caches; only a controlled-provider scenario reset does.

Both spec-review axes found no actionable findings, including their subsequent
reviews of the test assertion and fixture reset changes.

## Interface scope and coverage

Bounded better-interface review of cached desktop cards and their existing refresh
indicator, using all six owning skills. Stack: React, tldraw and the existing
workspace CSS/theme tokens. Conventions: `AGENTS.md` and
`docs/CODING-CONVENTIONS.md`.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | Named `Refreshing card` status and reduced-motion assertion in the browser regression; native card details button in `ItemCardShapeUtil.tsx` | Clear in inspected scope; manual screen-reader announcements not verified |
| Layout | Captured 1440px desktop refresh state with two complete cards | No overlap or replacement loading cards; narrow refresh state not separately inspected |
| Writing | Refreshing card, stale metadata, and unavailable/retry copy in existing card rendering | Clear in inspected states |
| Typography | Long-title desktop screenshot and existing line clamp/details affordance | Clear in inspected state; enlarged-text refresh state not separately inspected |
| Colors | Existing workspace semantic tokens retained in both themes | No palette changes; rendered dark-mode contrast not separately measured |
| UI | Retained card content, corner indicators, reduced-motion static icon and editor continuity | Clear in inspected states |

No actionable interface findings in this bounded review. Screenshot:
`/tmp/gitbored-user-cache-browser/board-metadata-cache-cache-bdd7f-fresh-and-transient-failure-chromium/cached-card-refresh.png`.
Approve for the inspected scope; unverified states above are not claimed as covered.

## Integrated validation

The first completed full gate exposed twelve scenario-isolation failures after
tokens stopped implicitly excluding earlier fake-user caches. The runner-only
reset fixed those cases; all 26 affected browser cases then passed together.

That run also hit an unchanged recovery-copy geometry expectation. Its captured
expected rectangle was mid-gesture while the copied document held final geometry.
Three isolated runs on baseline `74b37fc` passed. The failure was not reproduced
on baseline and is recorded separately in
`issues/01-settled-recovery-copy-expectation.md`.

The final full gate on `14d664d` passed: lint, type checks, 14 native-document
tests, eight server cases, and 101 production browser tests. The one skipped
browser case requires the separate unconfigured-auth environment. The unchanged
recovery-copy test passed in this integrated run as well. Command:
`PATH=/tmp/gitbored-tools:$PATH pnpm gate` (Node 26.8.1).
Output: `/tmp/gitbored-user-cache-verified-gate.log`.

The implementation is committed locally; no push or deployment was performed.
