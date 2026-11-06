# Desktop redesign implementation

Owner: current session. Work state: done (implementation and controlled validation). Authorized by Sean, 2026-11-06.

Accepted design: `proposal.html`; audit: `audit.html`. These supersede the older specification’s normal-flow Sources section, close-on-add, zoom-to-selection placement, fixed card sizing, and separate account landing page.

## Delivered behavior

- Sign in directly to the last canvas; switch/create boards from a floating menu using client navigation. Save guards retain unsaved work.
- Search preloaded repositories as you type, resolve repository/item URLs, and choose import filters. Incoming loads further pages automatically, supports filtering/selection/bulk add, stays open, and does not zoom the canvas on placement.
- Dense, sharp light/dark workspace with a faint dot grid, icons, compact floating panels, and accessible dismissal/focus behavior.
- Resize cards with native handles or keyboard controls; inspect full titles/details. Hide closed items without changing document/history.
- Map actual project fields to Status, Weight, Priority and Sprint; preserve numeric zero. Show generic relationships with Off/Selected/All, default Selected, and links to related off-board items.
- Preserve account-scoped metadata, native undo/redo, atomic Incoming/document saves, conflict copies and recovery. Reconnecting a renamed repository retains its immutable identity and failed discovery cursor.

## Commits and verification

Sean’s requested checkpoint is `e16bccd` (implementation) and `94af19e` (design/validation records). The integrated application candidate is `f636ca7`, which fixes the native held-Comma release lost when opening a panel rebuilds the SDK shortcut registry. Nothing has been pushed.

Full `pnpm gate` on `f636ca7` passed under the declared Node 26.8.1 runtime: lint, types, 13 native-document tests, server diagnostics, and 89 production browser tests. Its two environment-specific skips passed separately against the same production build: short-session expiry (10-second session) and missing GitHub configuration. An earlier complete run also passed under Node 24. Frozen dependency installation passed. The final gate used `CONTROLLED_SESSION_SECONDS=3600`; the alternate cases used their explicit configurations and separate output directories. The Node 26 runtime and installed pnpm binary were placed ahead of the machine’s Volta shim in PATH. The keyboard regression failed before the fix and passed afterward, including a real subsequent card drag.

Independent Fable reviews: [initial](reviews/initial.md), [corrections](reviews/corrections.md), [SDK keyboard correction](reviews/keyboard.md). All initial HIGH findings were corrected. The later shared-panel/focus/footer corrections passed `check-final.mjs`, covering light/dark 1440×900, 1280×800 with enlarged text, and narrow controls down to 320px without document horizontal scrolling. Evidence: `evidence/final-light.png` and `evidence/final-dark.png`. The keyboard source review found no material regression; its two low-priority SDK lifecycle/stale-closure observations are retained in the report.

## Live use and remaining limits

The user’s existing development app remains on ports 3001/3002, with its storage and credentials preserved. The static accepted prototype remains on wired LAN port 3018. Temporary controlled-provider previews are test fixtures, not live GitHub data.

Live GitHub Projects access and the complete redesigned real-repository flow are not yet verified with the user’s account. GitHub project permissions may require configuration; missing/unavailable values are never fabricated. Context reads are bounded and explicitly indicate partial results.

The inherited native comma/window-blur limitation and UI-origin Shift behavior remain documented in README. Screen-reader runtime, RTL and forced-colors were not exercised. Older JSON portability and broader clipboard/performance work remain separate scope.
