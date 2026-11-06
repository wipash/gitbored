# Cached board browser verification

Scope: cached card bootstrap and explicit refresh, plus existing selection, resizing and authorization regressions affected by the change. Tests use public board/source endpoints and real persistence. A browser route holds a real batch response unchanged; controlled GitHub supplies the delayed and failed upstream reads. No application metadata is fabricated. Actual aged-cache cutoff is covered separately by the backend agent's HTTP tests.

Applied better-interface and its six domains to the small refresh indicator and retained card content, following AGENTS.md and docs/CODING-CONVENTIONS.md. The details-popup implementation and its responsive review belong to the menus agent.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | `Refreshing card` status name; reduced-motion test asserts the icon does not animate; native details-button name and explicit opening in resize regression | Clear in tested scope |
| Layout | Real desktop refresh screenshot with two complete cached cards and long titles; corner indicators sit beside details controls without covering content | Clear; narrow indicator geometry not separately reviewed here |
| Writing | Refreshing card, Stale metadata, Unavailable distinguish progress, temporary provider failure and denied access | Clear |
| Typography | Existing card type scale and truncation stay intact during refresh; full details remain explicitly available | Clear |
| Colors | Refresh icon uses existing workspace muted token; text and state are retained, not communicated solely by color | Clear; no palette changes |
| UI | Compact refresh indicator, retained metadata, no replacement loading cards; editor node remains connected | Clear |

No actionable interface findings in the reviewed refresh flow. The initial browser run found a functional authorization regression: requiring GitHub-ready cache bootstrap prevented opening an app-authorized board for local editing when GitHub needed reauthorization. Root corrected this by skipping optional cache bootstrap in that state.

New regression coverage: both cards become available from one board metadata response before the native canvas mounts; no individual reference reads are needed for a complete fresh snapshot. Cached content stays visible during a real held upstream refresh. A temporary503 retains stale metadata,403 removes it, and Bob receives404 for Alice's board cache with no private values in the UI. The same native editor remains mounted. Existing Find selection/color controls no longer expect an implicit popup; resizing explicitly opens Card details.

Evidence screenshot: `/tmp/gitbored-cached-board-results/board-metadata-cache-cache-6bc1d-fresh-and-transient-failure-chromium/cached-card-refresh.png`.

Focused initial run: cache browser, color and desktop files all passed (12 cases). Incoming-session resource isolation and other account-recovery cases passed; the initial reauthorization case and two old per-reference bootstrap assumptions required the corrections described above. Authorization rerun passed five cases; the final retained-response race then passed alone after accounting for the explicit refresh save before the account-loss boundary. Its document and Incoming state must still equal the original seed, and the complete durable board must remain unchanged after account loss and late responses.

Final command: `PATH=/tmp/gitbored-tools:$PATH CONTROLLED_SESSION_SECONDS=900 pnpm test:e2e tests/e2e/incoming-review-authorization.spec.ts --grep 'retained repository connector session loss' --output=/tmp/gitbored-cached-auth-results-4`: 1 passed (4.8s). The parent integrated gate passed lint, types, native/server tests and 89 browser cases (one intentionally skipped); its sole failure was the pre-correction version of this migrated test. No source change followed that gate for this final correction.

Approve for the bounded cached-card flow. This review does not claim live GitHub verification or a full screen-reader session.
