# Correction review: f3c30b7 (after e44e16c)

Read-only rendered and source review of the corrections to the five findings in `/tmp/gitboard-followup-review.md`, against the vite dev preview at http://127.0.0.1:3009 (served from the working tree at f3c30b7, confirmed by the `/src/client/main.tsx` module in the page). Screenshots 50 to 63 and `log4.md` are in `/tmp/gitboard-followup-review/`. No source was edited and no subagents were started.

## Verdict

Approve for the requested matrix. All five earlier findings are corrected at 1280x800, 1280x700, 640x400, 320x800 at 100% and 200% text, light and dark, with and without the account recovery error. "Check account" is keyboard reachable and hittable at every one of those.

One combination outside the requested matrix regresses and is cheap to fix before the gate: 320x800 at 200% text with a paused save plus the account error. There the save notice covers "Check account" and Incoming collapses to its heading. Details in finding 1. If you hold that combination to the same bar as the matrix, treat this as Block on finding 1 alone.

## What was verified

Normal account state, Incoming open with one row selected (`log4.md`, screenshots 50 to 56):

| Viewport | Text | Panel height set by hook | Incoming body | Footer buttons hittable | Stack vs panel or toolbar overlap |
| --- | --- | --- | --- | --- | --- |
| 1280x800 light and dark | 100% | 587px | 483px | yes | none |
| 1280x700 | 100% | 487px | 383px | yes | none |
| 1280x800 | 200% | 517px | 329px | yes | none |
| 640x400 | 100% | 145px | 39px | yes | none, 8px above the toolbar |
| 320x800 | 100% | 431px | 327px | yes | none, theme box ends 12px above the quick actions |
| 320x800 | 200% | 298px | 110px | yes | none |

Resizing the window while the panel was open re-measured every time (587, 431, 298, 587 in sequence), and closing and reopening at 320px re-measured on open. Document scroll width equalled the viewport at every width.

Account recovery error, forced by a 401 on the board PUT with the session reporting signed-out, Incoming open (screenshots 57 to 63):

| Viewport | Text | Feedback region | Check account | Incoming |
| --- | --- | --- | --- | --- |
| 1280x800 light and dark | 100% | 166px, no scroll | hittable, Shift+Tab from Account reaches it in 2 stops | 414px, body 310px, footer hittable |
| 1280x700 | 100% | 166px, no scroll | hittable, 2 stops | 314px, body 210px, footer hittable |
| 1280x800 | 200% | 240px, scrolls (499px content) | reachable by keyboard; focusing scrolls it into view and it is then hittable | 271px, body 83px, footer hittable |
| 640x400 | 100% | 120px, scrolls | hittable, 2 stops | collapsed to 0px, see finding 2 |
| 320x800 | 100% | 239px, no scroll | hittable, 2 stops | 186px, body 82px, footer hittable |
| 320x800 | 200% | 240px, scrolls (725px content) | focus reaches it but it sits under the save notice, see finding 1 | collapsed to 52px, see finding 1 |

Other checks:

- Stack DOM order is feedback, nav, theme; status and check sit above Account and Theme with the 6px gap, so Shift+Tab from Account reaches "Renew sign-in in a new tab" then "Check account" with a 2px focus ring.
- Disabled "Add selected" and "Add all matching" render `cursor: default`.
- "Sign out" is disabled while the account is blocked.
- The theme box no longer touches the quick-actions row at 320px (680 versus 692).

## Findings

| # | Severity | Domain | Status | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | HIGH, narrow scope | Layout | Regression for one combination | `src/client/desktop.css:71` (`.workspace-account` z-index 500) and `src/client/workspace/usePanelClearance.ts:21` | At 320x800 with 200% text, a paused save and the account error, the save notice (`.board-notices`, z-index 650, y 58 to 465) sits above the stack (z-index 500). The feedback region's 240px window lands at y 278 to 518, so "Check account" is under the notice even after focus scrolls it into view (`hit=false` after Shift+Tab, screenshot 63). The stack's top at y 278 is above the Incoming panel top at 218, so the hook sets 52px and the panel shows only its heading; its close button is also under the notice (my script's click on "Close Incoming" was intercepted by the notice). | Restore the stacking the old fixed status and check panel had: `.desktop-app .workspace-account { z-index: 700; }`. Give the hook a floor so the panel never collapses below its chrome: `Math.max(160, Math.floor(bottom - bounds.top))`, accepting an overlap when there is no room. | Before f3c30b7 the check panel sat at `bottom: 180px` with z-index 700, below the notice and above everything else, so "Check account" was reachable at this size (not measured on e44e16c at exactly this combination; inferred from the 320px normal-text geometry at e44e16c where the check panel ended at y 596). The new test "account recovery messages leave account actions and theme reachable" triggers the error through a rename, which leaves the save notice at its one-line "Saved" size, so it cannot see this. |
| 2 | HIGH | Layout | Pre-existing, failure mode changed | `src/client/workspace/usePanelClearance.ts:21` | At 640x400 with the account error the stack is 228px tall and starts at y 124, above the panel top at 139, so the hook sets `--workspace-panel-height: 0px` and Incoming disappears while its trigger reads expanded (screenshot 61). The feedback box also covers the tools row by 10px. | Same floor as finding 1. | At e44e16c this viewport was already unusable in the error state (panel 96px with a 0px body, status and check panel fixed over it), so this is not new breakage, but a 0px panel is a worse failure than an overlap. Out of the requested matrix, which specified 640x400 at the normal account state. |
| 3 | LOW | Layout | New | `src/client/desktop.css:73` (`.account-feedback` 30dvh scroll region) | At 1280x800 with 200% text the region clips the status at 240px and "Check account" is below the fold; the only cue is the cut-off text line at the bottom edge and a platform-dependent scrollbar (screenshot 60). | Leave as is, or raise the cap to `40dvh` at widths above 700px where the stack has room. | Keyboard users reach it (focus scrolls), pointer users need to notice the clipped line. Not a trigger because the clipped text is a visible cue. |

## Source review of the hook

`usePanelClearance` (`src/client/workspace/usePanelClearance.ts`) is sound for its stated job:

- It runs in a layout effect keyed on `open`, so the first paint of an open panel already has its height.
- `measure` re-queries the obstacles on every call, so observed targets going stale cannot produce a wrong number; the ResizeObserver targets are only triggers.
- Only `.workspace-tools` and the obstacle elements are observed, so canvas geometry never triggers a measurement, matching the commit message. I confirmed drags do not change the variable.
- The horizontal-overlap test means the toolbar at the bottom left limits the panel only at widths where they share columns (640px and below), which is why 1280 widths keep 587px.
- Setting the variable on the panel's inline style cannot feed back into the observer, because the panel is absolutely positioned inside the tools and is not itself observed.

The one gap is the missing floor (findings 1 and 2): `Math.max(0, …)` lets the panel vanish when an obstacle's top is above the panel's top.

`AuthLanding.tsx` renders the same `accountFeedback` fragment inside `<main>` when not on a board and inside the stack when on a board, so the account page is unchanged. The `:has()` rule that hides an empty feedback box means the `role="status"` paragraph becomes visible at the same moment it gains text, the same pattern the old `:empty { display: none }` rule had; announcement reliability is unchanged, not regressed.

## Harness notes

- The console "401 (Unauthorized)" errors came from my route that fails the board PUT to force the account check.
- My script stopped at "Close Incoming" at 320px with 200% text in the error state because the save notice intercepted the click. That is the application behavior described in finding 1, not a script error, so screenshot 64 and the closed-state measurement at that size were not taken.
- 200% text was emulated with a 200% root font size and 200% zoom with a 640x400 viewport, as the project's own tests do.

## Not verified

- Forced-colors mode, RTL, and screen-reader announcement of the status region.
- Performance, SaveCoordinator, WorkspacePanels and startup behavior: approved in the previous review and not repeated.
- The full gate.
