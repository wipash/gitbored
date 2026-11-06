# GitHub caching

Implemented in the existing SQLite database. Repository item pages, reference metadata, and project/related-item context are cached separately for 15 minutes. Reloads and application restarts reuse the cache; board Refresh and Retry unavailable details use `refresh=1` to request fresh GitHub data. URL resolution is always fresh. Issue rows from repository pages prime reference metadata; PR rows still fetch their richer state.

Assumption for morning review: a 15-minute cache freshness window is acceptable. Refresh remains available for immediate changes. No private metadata is put into browser storage or the native canvas document.

Cache reads require the current authorized application session, user-owned reference, and a matching credential fingerprint. Provider access denials evict the user's cache; a generation check prevents reads already in flight from restoring invalidated entries. Authentication invalidation also deletes cache entries. Responses from GitHub and stored cache entries are validated. Cache expiry or a failed refresh does not synthesize a successful stale response.

## Verification

- Server TypeScript and focused oxlint checks passed under Node 26.8.1 via `/tmp/gitbored-tools/pnpm`.
- `CONTROLLED_SESSION_SECONDS=900 pnpm test:e2e tests/e2e/github-cache.spec.ts`: 2 passed (2.7 seconds). The initial focused run used pnpm's Node 24 shim; the parent runs the final integrated gate with the corrected Node 26 wrapper.
- Production HTTP tests prove zero GitHub source requests for cached repository pages, card details and context after browser reload and application restart; explicit refresh reaches GitHub and returns changed results; another account cannot use cached private records; a detected denial prevents ordinary reads from reviving cached content.
- `git diff --check` passed for owned files.

No visual controls were added or restyled in this slice; parent/team interface review covers the existing Refresh control with the integrated menu and card changes. No standalone visual claims are made here.
