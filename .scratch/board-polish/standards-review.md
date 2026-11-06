# Standards review: cache and anchored details

Base: `cf0e37f`. Inspected `git diff cf0e37f -- src/server/sources.ts src/server/auth.ts src/client/boards/IncomingWorkspace.tsx src/client/workspace/WorkspacePanels.tsx src/client/workspace/workspace.css` plus new `useCardDetailPosition.ts` and `github-cache.spec.ts` / `card-details.spec.ts`.

Standards: `docs/CODING-CONVENTIONS.md` and `AGENTS.md`; applied the supplied smell baseline as judgment, with no stylistic findings.

No concrete standards violations found in this bounded review.

- Cache reads authenticate first, use user ID plus credential fingerprint, validate persisted payloads, and preserve reference ownership checks. Explicit refresh bypasses the cache. Provider access denials clear it; cache generations stop older in-flight source requests refilling entries after denial. The 15-minute permission/freshness window is an explicit caching tradeoff, not an accidental permanent grant.
- Cached metadata and project context remain outside native canvas documents. Client requests continue to discard aborted/outdated authority results. Token invalidation also clears cached records.
- Detail placement subscribes to selected shape bounds, camera and viewport through the editor's reactive API. It moves the DOM panel without mutating shape geometry/history or replacing the editor. It remains non-modal; dismissal returns focus to the canvas, and the panel body scrolls within available height.
- No added framework layer or speculative API beyond the requested caching and panel-placement responsibilities.

Verification boundary: source review only for cache and popup, with existing/new test assertions inspected. Root owns the runtime popup checks; cache agent owns its HTTP/refresh regressions. This review does not claim live GitHub authorization verification.

Verdict: Approve this inspected scope. Zero standards findings; no baseline smell warrants follow-up.
