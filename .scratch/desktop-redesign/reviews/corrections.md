# GitBored desktop redesign - corrections review

Read-only re-check of the corrected working tree in `/var/home/sean/dev/gitboard` (baseline `9266008`) against the restarted fixture preview on `http://127.0.0.1:3009` as Alice. Scope is the corrections listed in the request, judged against the findings in `/tmp/gitbored-desktop-review.md`. No source was edited and no subagents were started. Tree snapshot: combined diff plus untracked sources sha256 `af7d50320def…`, taken 16:50:28; rendered passes ran 16:52-17:05 on a fresh board ("Fable corrections", 5 cards from alice/project, All states).

## Scope and coverage

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | Skip-link focus coverage (108 sampled points) and clip screenshot; Escape and focus return for Repositories, Board settings, Boards switcher, View, Incoming, Find, Details, from inside the panel and from the trigger; `document.title` and h1 count with the switcher open; Card size select by keyboard, its Undo via toolbar and via Ctrl+Z; `getAriaDescriptor` text | 1 residual |
| Layout | Bounding boxes and `elementFromPoint` probes at 1440x900, 640x450, 320x568, and 1280x800 + 1440x900 with root font 200%, with each panel open: Find/View triggers with Incoming open, Incoming search/select-all/footer, Find input, Card size select, Close details, Rename/Delete, Create board, Repository search, tldraw toolbar, Account/Sign out/Theme, watermark | 3 residuals |
| Writing | Incoming row state, card state slot, Find row, details State value after discovery and after reload | Clear |
| Typography | Computed sizes at 100% and 200% root font for shell, triggers, title, cards, Incoming meta | Clear |
| Colors | Placeholder pairs in light and dark for Incoming, Find and Repository inputs | Clear |
| UI polish | Watermark visibility and hit test; `.board-notices` stacking over left panels | 1 residual (LOW) |

## Corrections verified

| Claimed correction | Observed | Status |
| --- | --- | --- |
| View/Find/Incoming share one flex toolbar | `.workspace-tools` 1028-1428 x 12-50 holds View, Find, Repositories, Refresh, Incoming with 2px gaps; with Incoming open, Find and View resolve to themselves at centre and both edges; a click on Find's right edge opens Find. | Fixed |
| Incoming scrollable body with fixed footer, narrow clearance | 1440: body 105-681 scrolls, footer 681-732 inside the panel. 640x450: panel 139-289, footer 237-288 inside and hittable. 320x568: panel 139-407, footer 355-406, Add all matching / Connect repository / search / select-all all hit themselves. | Fixed (see residual 3 for 200% text at 1280x800) |
| Skip link z-index | `.skip-link:focus { z-index: 900 }`; focused link covered at 0 of 108 points; visible over the title pill (`r-skip.png`). | Fixed |
| Dark placeholder contrast | `.desktop-app input::placeholder` tokenised; Incoming and Repository inputs measure 8.20:1 dark, 6.35:1 light. | Fixed |
| Account controls clear watermark | Account box moved to bottom 48px (796-852); watermark at 860-896 resolves to itself at all probes. | Fixed |
| Panel Escape and focus return | Escape closes Repositories, Board settings and the switcher when focus is inside them; focus returns to Repositories, `···` and Boards ▾ respectively; Close View returns focus to View. | Fixed from inside the panel; see residual 1 for Escape from the trigger |
| Switcher no longer changes page title | Title stays "Fable corrections · GitBored" while open and after close; one h1 (embedded list renders h2). | Fixed |
| Card size keyboard select | Card details shows "Card size" select (Compact/Expanded/Custom-disabled); selecting Expanded by keyboard resizes to 420x300, title fully visible (scrollHeight = clientHeight), focus stays on the select, size persists after reload; toolbar Undo reverts to 280x200 and the select reads "compact". Ctrl+Z while focus is in the select is swallowed by the UI key guard, which is the intended ownership rule. | Fixed |
| Text in rem, 11px minimum | Root 200% doubles shell (13→26px), trigger (12→24px) and title (14→28px); smallest declared size is `0.6875rem`. | Fixed |
| Stable `getShapeVisibility` | Hide closed: 5→2 cards, Find 5→2, `.tl-shapes` transform unchanged, no console errors, unhide restores 5. | Fixed |
| Recovery errors in a scrollable notice stack | `.board-notices` present (fixed, z 650, max-height, overflow auto). Only the "Saved" state was exercised; retry/conflict notices not reachable from the fixture. | Not verified beyond the saved state |
| PR discovery hydrates merged state | Incoming rows read "Merged" for #2, #3, #4 and "Open" for #1, #5 within 1.5s of discovery; cards, Find rows ("project #1 · Open") and details use the same labels; persists after reload. The fixture's #3 (listed as PR, served as issue) no longer 502s. | Fixed |

## Residual findings

| Severity | Domain | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| MEDIUM | Layout | `src/client/workspace/workspace.css:124,131`; `src/client/workspace/WorkspacePanels.tsx:43-74` | Find, View and Incoming panels all anchor at `top:40px; right:0` of the shared toolbar (and `top:100%; left:0` below 700px). Opening Find while Incoming is open renders the Find panel underneath the Incoming panel: Find shows `aria-expanded=true` but the Find panel's input resolves to the Incoming search input and the panel body to `.incoming-empty` (`t-find-over-incoming.png`). View happens to win because `.workspace-view` has z-index 410. | Close the sibling panels when one opens (the proposal's `closePanels()` behaviour), or give each panel its own anchor. | A control that reports expanded while its content is invisible; the user has to close Incoming to find out. |
| MEDIUM | Accessibility | `src/client/boards/Boards.tsx:305-306,312`; `src/client/workspace/useNativeUiKeys.ts:20` | Opening Board settings or the switcher leaves focus on the trigger (`···` / Boards ▾). The trigger sits in `.board-heading[data-native-ui]`, which has no `[data-native-dismiss]`, so Escape pressed immediately after opening does nothing; the panel stays open and later overlaps Card details (observed at 1280x800 with 200% text: the Card size select resolved to `.board-settings`). Incoming, Repositories and Find move focus into the panel on open, so Escape works there. | Move focus to the panel's first control or heading on open (as Incoming does with its h2), or let the heading's dismiss handler close whichever left panel is open. | APG disclosure consistency: Escape works for five panels and not for these two until the user Tabs in. |
| MEDIUM | Layout | `src/client/desktop.css:69-70` (account box `bottom:48px/88px`), `incoming.css:30` | 1280x800 with root font 200%: the Account/Sign out box (1048-1268 x 657-712) overlaps the right 64px of "Add all matching" (904-1112 x 656-702); the right-edge probe resolves to the Account link. At 1440x900 the same state is clear. At 320x568 the tldraw toolbar's last button ("More", 213-253 x 502-550) is overlapped on its top edge by the Theme select (account box 464-520). | Reserve the bottom-right corner: give `.incoming-panel` `max-height: calc(100dvh - <account cluster height + 24px>)` at every width, and push the tldraw toolbar/account box apart below 400px (e.g. account cluster above the toolbar, or in the title pill menu). | Partial overlap of the panel's primary action at a common desktop size with enlarged text, and of a toolbar control at 320px. |
| LOW | UI polish | `src/client/desktop.css:65-66` | `.board-notices` (z 650) draws "Saved" over the top-left corner of the switcher (z 600) and the Board settings panel (z 500) when either is open (`r-settings-notices.png`, `s-1280-text200-incoming.png`). | Hide the saved state while a left panel is open, or anchor notices below the open panel. | Visual collision on the left stack. |
| LOW | Layout | `src/client/boards/incoming.css:66` | At 640x450 the panel is 150px tall (`calc(100dvh - 300px)`), leaving a 46px body: only the search field shows and the state/kind selects, label filter and select-all row sit below the fold of the scroll body. Functional, but the footer takes a third of the panel. | Reduce the reserved space (the account cluster is on the right, not below the panel at ≤700px): `calc(100dvh - 190px)`. | Cramped body at 200% zoom; not a blocker since the body scrolls. |

## Verification

Observed in the preview: all rows in "Corrections verified"; no `pageerror` and no console errors across four runs; no failed HTTP responses; no horizontal document scroll at 320 or 640.

Not verified: retry/conflict notices in the new notice stack, item-URL lookup in Repository search, RTL, forced-colors, screen-reader runtime, Sources route, live GitHub.

## Verdict

**Approve** for the corrections reviewed: every HIGH finding from the first report is fixed in the rendered preview. Three MEDIUM residuals remain as work to do: Find panel hidden under an open Incoming panel, Escape ineffective from the Board settings and switcher triggers because focus is not moved into those panels, and the account/theme cluster overlapping the Incoming footer at 1280x800 with 200% text and the tldraw toolbar at 320px. Not reviewed: notice stack beyond the saved state, item-URL lookup, RTL, forced-colors, screen-reader runtime.
