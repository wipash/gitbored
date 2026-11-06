# Cached board content and explicit card details

Requested: show existing GitHub content immediately after reload, indicate background work only with a corner spinner, open details explicitly, include issue/PR descriptions, and scale details with cards if practical. Existing permission to merge app and homelab deployment PRs remains in force.

Implementation: account/credential-scoped SQLite cache, one authenticated board batch before canvas mounting, 15-minute freshness with stale content retained during background refresh. Native canvas documents contain references only. Transient failures keep cached content; detected permission loss clears it. A small bounded request pool refreshes stale references and contexts without metadata changes restarting the pool.

Assumptions for Sean: use a dedicated Card details button; display descriptions as escaped plain text; clamp desktop detail zoom to 1–1.25 and keep mobile details readable at normal size. No extra browser persistence is needed because one server cache batch restores the board. Detailed interface choices and evidence are in details-review.md.

Bounded independent review: cache agent inspected bootstrap authority, retries and refresh. One concrete context-completion race found: metadata captured before an awaited body could restore content after scope denial. Fixed by re-reading current metadata and checking denied scope after parsing. Auth browser regression also caught optional batch reads triggering reconciliation when GitHub already required reauthorization; skip that optional read while preserving native editing/saving. No architecture expansion requested.

Verification: server public HTTP + SQLite tests cover aged cache, legacy body-less cache, scope/account/credential isolation, transient failure and SSO eviction. Browser checks cover complete cache bootstrap, spinner with visible cached content, transient retention, denied-content clearing, explicit details and safe body rendering, and native/editor authorization lifetime. Full gate and release evidence recorded in PR.
