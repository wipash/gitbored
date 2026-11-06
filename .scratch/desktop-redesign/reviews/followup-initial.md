# Follow-up review: desktop corrections on e44e16c

Read-only review of 2ec554f and e44e16c (the two commits after 586facc) against the controlled preview at http://127.0.0.1:3009. Source was not edited, no subagents were started, and the full gate was not run. Screenshots and the raw measurement logs are in `/tmp/gitboard-followup-review/` (`log.md`, `log2.md`, `log3.md`).

## Summary

- The four reported corrections work as described: the landing hero no longer renders while the session is unresolved, "Add selected" sits in the fixed Incoming footer and is reachable by pointer and keyboard, the Account and Theme boxes no longer overlap each other, and card drags, selection, Find and resize all use current data.
- The SaveCoordinator and WorkspacePanels changes are correct. Details are under "Source review".
- The bottom-right stack has two layout regressions that the new e2e test does not detect: it overlaps the Incoming panel (hides "Add all matching" at 320px) and it is overlapped by the account status message. Two further overlaps at 320px and 200% text are pre-existing but sit in the same flow.
- Verdict: Block on the two regressions (findings 1 and 2). Findings 3 and 4 are pre-existing and can be fixed in the same pass since they share the fixed-bottom root cause.

## Scope and coverage

Scope: the desktop board flow in the brief. Sign in as Alice, create a board, connect alice/project with all states, select one row, scroll Incoming, Add selected, Undo, filtered and unconnected empty states, the Account/Theme stack, startup with `/api/session` held, session error, sign-out, and card drag, Find, Card size and handle resize. Viewports: 1440x900, 1280x800, 1280x700, 320x800, 640x400 as the CSS-pixel equivalent of 200% zoom at 1280x800, plus a 200% root font size for text resize. Light and dark.

Stack: React 19, tldraw 5.6, plain CSS with semantic tokens in `src/client/styles.css`. Conventions read: `docs/CODING-CONVENTIONS.md`, `AGENTS.md`, `.agents/*`. The `better-interface` skill routes a commit range to `interface-review`, which is not installed here, so I applied the six domain skills directly to the flow above and used the brief as the change scope.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | Names and roles of the stack, footer and loading main; tab order from the skip link to Theme; focus rings on Add selected (3px) and the stack (2px); keyboard activation of Add selected; focus return to the Incoming heading; startup focus on the board heading | 1 LOW (finding 5) |
| Layout | Bounding boxes and overlaps of the stack, toolbar, Incoming panel, footer, status, account-check at every viewport above; document scroll width at 320px | 4 findings (1 to 4) |
| Writing | Footer labels, empty-state strings, announcement "1 card added.", loading text, session-error text | Clear |
| Typography | Loading text 13px at 0.8125rem; footer buttons wrap instead of truncating; status text wraps | Clear |
| Colors | Loading text measured: `#566071` on `#f7f8fa` 5.98:1 light, `#b2bccb` on `#171a21` 9.08:1 dark; disabled footer text `#566071` on `#eef0f4` 5.57:1; both themes rendered (screenshots 07, 12, 13, 33) | Clear |
| UI polish | No new motion or transition was added; the loading main has no animation; surfaces reuse the existing 3px/4px radius tokens | Clear |

## Findings

| # | Severity | Domain | Status | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | HIGH | Layout | Regression | `src/client/desktop.css:77` with `src/client/desktop.css:72-73` and `src/client/boards/incoming.css:30,56,66` | The stack is fixed at `bottom: 48px` (100px under 400px) while the Incoming panel's height is sized only from the viewport top (`calc(100dvh - 12rem)`, `calc(100dvh - 19rem)` under 700px). At 320x800 the Account/Sign out box covers 122x36px of the footer and hides "Add all matching" (screenshot 15). At 1280x800 and 1280x700 the box covers the panel's bottom 11px, flush against "Add all matching" (03, 07, 12). | Reserve the stack's footprint in the panel height so the two never meet: at 1280 use `max-height: calc(100dvh - 12rem - 2rem)` and under 700px `max-height: calc(100dvh - 19rem - 3.5rem)` on `.desktop-app .workspace-tools .incoming-panel`, then add a bounding-box assertion in `tests/e2e/desktop-redesign.spec.ts:137` that `#incoming-panel` and `.tlui-toolbar` do not intersect `.workspace-account`. | Before this change the Account box started at `bottom: 88px` (top edge 672px at 800 tall) and cleared the panel bottom at 661px. Moving the whole stack to `bottom: 48px` raised its top edge to 650px. A primary action hidden at 320px is an escalation trigger. |
| 2 | HIGH | Layout | Regression at desktop widths, pre-existing under 400px | `src/client/desktop.css:68-69`, rendered from `src/client/AuthLanding.tsx:166-167` | `.account-context-status` keeps `bottom: 140px` and `.account-check` keeps `bottom: 180px`, both independent of the stack. At 1280x800 the status covers the top 10px of the Account link (19). At 200% text it covers the whole Account/Sign out box, 220x55px (20). At 320px it covers 122x40px of it (21). The status and the check panel also overlap each other at 200% text (420x116px) and at 320px (296x27px); that pair is pre-existing. | Render the status paragraph and the account-check section inside `.workspace-account` when `inBoard` (`AuthLanding.tsx:210`), above the nav, and delete the two fixed `bottom` rules at `desktop.css:68-69`. The flex column with its 6px gap then lays all four boxes out without overlap at any text size. | Before this change the nav's top edge at 800 tall was 672px, 12px below the status. One flex column is the fix the commit message already promised ("one bottom-right flex stack"); the status and check panel were left outside it. Covering a control at 200% text is an escalation trigger. |
| 3 | HIGH | Layout | Pre-existing | `src/client/desktop.css:79` | Under 400px the stack sits at `bottom: 100px`; its Theme box ends at y=700 while tldraw's quick-actions row starts at y=692, so 8px of the row's top edge is under the Theme box, 30px wide at normal text and 110px wide at 200% text (14, 15, 16). No button is covered; the row's top padding and corner are. | `bottom: 120px` under 400px, and include `.tlui-toolbar` in the non-overlap assertion from finding 1. | The previous rule put `.account-controls` at the same `bottom: 100px`, so the 8px overlap existed before. It is still an overlap at 320px, which the layout rules rate HIGH, so it belongs in the same correction. |
| 4 | HIGH | Layout | Pre-existing, made slightly worse | `src/client/desktop.css:73`, `src/client/boards/incoming.css:62-66` | At 320x800 with 200% text the panel is 192px tall; the heading (72px) and the now two-row footer (119px) consume it and `.incoming-body` collapses to 0px, so none of the five rows can be reached or scrolled (16). At 640x400, the 200%-zoom equivalent of 1280x800, the panel is 96px tall and the body is again 0px (11). | Subtract chrome in px rather than rem under 700px (`max-height: calc(100dvh - 300px)` already exists at `incoming.css:66` and is overridden by `desktop.css:73`), and give `.incoming-body` `min-height: 6rem` so the list always keeps a scrollable strip. | A rem-based subtraction grows with the text size while the fixed chrome above the panel does not. Content unreachable at 320px or 200% is an escalation trigger. The footer change added one wrapped row, which is why it shows up more now. |
| 5 | LOW | Accessibility | Pre-existing | `src/client/styles.css:70-74` | `button:disabled { cursor: wait }` applies to the disabled "Add selected" and "Add all matching" in the footer, so hovering an unavailable action shows the busy cursor. | `cursor: default` (or `not-allowed`) on `button:disabled`, keeping `wait` only on `aria-busy="true"` controls. | A busy cursor signals progress. The disabled state means "nothing selected", so the cue is misleading. |

No actionable writing, typography, color or UI-polish findings.

## Source review

### SaveCoordinator.publish (`src/client/boards/saveCoordinator.ts:59-67`)

Correct. The snapshot object is replaced only when `status`, `message`, `retryable` or `recoveryUnavailable` differ, and those are the only four fields of `SaveState` and the only values `Boards.tsx:216` renders. Listeners are still called on every publication, so:

- `flush()` (`:112-124`) resolves from its own listener reading `this.dirty`, `this.state.retryable` and `this.state.status`. A successful save publishes `saved` (status changes, snapshot replaced) and a failed one publishes `retryable: true`, so the listener sees the new values. Verified by the brief's recovery tests; I also observed `unsaved` during a drag and `saved` after each drag in `log3.md`.
- `recoveryAvailability()` (`:38-48`) assigns `this.state` before calling `publish`, so the comparison is a no-op and the listener still fires. Recovery writes (`persist()`) happen before `publish` in `change()` and are unaffected.
- Retry and copy paths (`retry`, `completeCopy`, `discard`) do not touch `publish` semantics.
- `getSnapshot()` returns the stable object, so repeated `Unsaved changes` publications during a drag no longer rerender the board shell.

Maintainability note, not a finding: the four-field comparison will silently drop a fifth field if `SaveState` grows. A `sameSaveState(a, b)` helper next to the interface would keep the two in one place.

### WorkspacePanels (`src/client/workspace/WorkspacePanels.tsx:29-36`)

Correct. The custom `isEqual` compares card ids in order and `props` by identity.

- `props` identity survives geometry-only updates: `applyPartialToRecordWithProps` in `@tldraw/editor` 5.6.0 (`Editor.js:8648-8671`) spreads the record and copies `props` only when the partial carries `props`. A translate sends `x`/`y` only, a resize or the Card size select sends `props`, so the panel recomputes exactly when card content changes. Verified: after a drag the details panel stayed open with the same title; after "Expanded" the select read `expanded` and the shape became 420x300; after a corner drag it read `custom` at 500x350; two Ctrl+Z steps restored `expanded` then `compact`.
- Hidden cards are read through `editor.isShapeHidden`, a computed cache over the `hiddenReferences` atom (`NativeWorkspace.tsx:96-99`), so "Hide closed" recomputes: Find went from 5 to 2 and back.
- Stale `x`/`y` on the retained shape objects are never read. The one geometry consumer, Find's centring, now calls `getShapePageBounds(shape.id)` (`:73`). Verified: after moving two cards, clicking each in Find put its centre at exactly (0, 0) from the viewport centre, same as an unmoved card.
- `meta` is excluded from the comparison, which is safe because the document validator rejects non-empty `meta` (`src/shared/nativeDocument.ts:66,105`).
- `useValue(signal)` subscribes on `lastChangedEpoch`, so an equal recompute triggers no React render; `useMemo` keyed on `editor` keeps one computed per editor instance.

### Other changes

- `AuthLanding.tsx:133` returns the loading main before any hook-dependent JSX and after every hook, so hook order is stable. The error, unconfigured, signed-out and signed-in branches are unchanged.
- `IncomingWorkspace.tsx:445`: "Connect repository" now appears in the footer only when no repository is connected. The "Repositories" trigger at `:404` remains the way to connect more, so this is a reasonable de-duplication.
- Test coverage: the new test at `tests/e2e/desktop-redesign.spec.ts:137` asserts only the vertical gap between the nav and the Theme box, which is why findings 1 to 3 pass it. It also never checks the controls against `#incoming-panel`, `.tlui-toolbar` or `.account-context-status`.

## Verification

Passed, with the exact steps in `/tmp/claude-1000/-var-home-sean-dev-gitboard/d8ec9fba-e25b-4740-b212-fe408302de92/scratchpad/review.mjs`, `review2.mjs` and `review3.mjs` (Playwright against the preview, run with `E2E_FRONTEND_PORT=3009 E2E_PROVIDER_PORT=3016 node --import tsx <script>`):

- Startup: with `/api/session` held on `/boards/<id>` and on `/`, the page shows only `<main class="app-loading" aria-busy="true">` with "Loading…" (13px, text-secondary), zero focusable elements, and neither "A little space for the big picture." nor "Connect with GitHub" exists; released, the board restores with 5 cards and focus lands on the board heading. A MutationObserver across a natural reload recorded only "Open board" and the board title as h1 text. Light and dark (33, 34).
- Session error: aborting `/api/session` shows the landing with the alert text and "Try again"; focus is on the h1; "Try again" restores the board (35).
- Sign out from the board returns to the signed-out landing (38). While the account is blocked, "Sign out" is disabled.
- Add selected: with one row checked and the body scrolled 256px to the bottom, `elementFromPoint` at the button's centre hits the button; Tab from the last checkbox reaches it in three stops with a 3px focus ring; Enter places one card, leaves 4 rows, keeps the panel open, announces "1 card added." and moves focus to the Incoming heading; Undo restores 5 rows and announces "Addition undone." (03, 04, 05).
- Empty states: no repository shows "Connect a repository to get started." with a "Connect repository" footer button; a non-matching search shows "No cards match." with "Clear filters" and both footer actions disabled (01, 06).
- Account/Theme boxes: 6px apart at every viewport and text size tested (the new e2e assertion); DOM order after `<main>`; tab order reaches Account, Sign out, then Theme last.
- Horizontal scroll: document scrollWidth equals the viewport at 320px in every state.
- Canvas: dragging a selected card from its header and from its centre moved it by the exact deltas; dragging an unselected card while another was selected switched the details panel; save state went `unsaved` then `saved`.

Not verified:

- Real browser zoom. I used a 640x400 viewport as the CSS-pixel equivalent of 200% zoom at 1280x800, and a 200% root font size for text resize, the same approximation the new e2e test uses.
- Screen-reader announcement of the mounted "Loading…" status. It is rendered with its text rather than updated into an existing region, so announcement is browser-dependent; the focus move to the board heading on restore covers the outcome.
- Forced-colors mode and RTL.
- The three new e2e tests, the focused desktop, keyboard and recovery suites, and the drag profile numbers. Taken from the brief and the follow-up message as reported (24 focused tests passing on e44e16c), not rerun here.
- The full gate, per the brief.

## Harness errors versus application behavior

These came from my scripts, not the app, and are excluded from the findings:

- "MutationObserver: parameter 1 is not of type Node" page errors in pass 1: my init script observed `document.documentElement` before it existed. Fixed in pass 2.
- "drag moved card by 0 0" in passes 1 and 2: I issued the next pointer-down within tldraw's double-click window after the previous gesture. With 700ms pauses in pass 3 every drag moved by the exact delta.
- The 1.00 width ratio and "resize handles present: 0" in pass 2: I measured the first card in DOM order instead of the selected one, and tldraw 5.6 renders no `data-testid` handles. Pass 3 tracked the card by id and dragged the selection corner directly.
- The pass 1 failure screenshot (99-failure.png) is the app's "Recover local work" screen. My faked 401 on the board PUT left a recovery draft, and the following reload was stopped by the dirty-leave prompt. That is the designed recovery path, not a defect.
- Console errors "401 (Unauthorized)" and "net::ERR_FAILED" were produced by my route handlers for the account-check and session-error scenarios.
- While checking ports I sent an empty `{}` to the provider's `/__control` endpoint. It returned 200 and carried no `reset`, so the provider state should be unchanged.

## Verdict

Block. Findings 1 and 2 are regressions introduced by moving the stack to `bottom: 48px` without resizing the Incoming panel or moving the status and account-check overlays into the same column. Findings 3 and 4 are pre-existing overlaps at 320px and 200% text in the same flow and share the fix. Coverage excludes forced-colors and RTL, which were not reviewed.
