# Canvas controls and card metadata review

## Scope and coverage

Reviewed the bottom-left native controls, compact/minimum-size/expanded issue and PR cards, and the follow-up initial heading/canvas focus behavior. Stack: React, tldraw 5.6, semantic CSS tokens for the existing Atlas + Contextual light/dark themes. Conventions inspected: `AGENTS.md`, `docs/CODING-CONVENTIONS.md`, `.agents/issue-tracker.md`, and the existing chrome/card styles. All six better-interface domain skills were read and applied.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | Native toolbar components; semantic field definition lists; `card-layout.spec.ts` keyboard details opening/focus return, minimap keyboard activation and pointer hit testing | Clear within inspected scope; no screen-reader session |
| Layout | `chrome.css:106`, `workspace.css:160`; compact/expanded cards with and without labels; desktop and 390/320px screenshots, 200% text | Aligned field/footer baselines and reachable card actions |
| Writing | `planning.tsx:16`; visible Status/Weight/Priority/Sprint headings; zero, empty and unmapped values | Explicit values replace ambiguous dashes; loading and unavailable remain distinct |
| Typography | `ItemCardShapeUtil.tsx:14`, `workspace.css:156`; whole-line title assertions and full-title access through details | No partial title lines; tabular planning numbers; existing rem type scale retained |
| Colors | `chrome.css:79`, `planning.tsx:18`, `workspace.css:165`; light/dark rendered screenshots | Theme tokens reused; empty values have no category stripe; secondary text contrast passes |
| UI polish | `NativeWorkspace.tsx:56`, `chrome.css:105`; control surfaces and expanded minimap screenshots | Backplates and duplicate navigation border/shadow removed; native controls retained |

## Findings addressed

| Severity | Domain | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| HIGH | Layout | `src/client/workspace/useCardDetailPosition.ts:14` | After moving the actions, the obsolete top-left rectangle was still treated as a bottom obstacle | Measure the current bottom controls and classify helper buttons with top controls; update `usePanelClearance.ts` too | Preserve mobile details tracking while panning and available panel space |
| MEDIUM | Writing | `src/client/workspace/planning.tsx:16` | Empty dash and hidden compact field names | Visible headings and explicit Not set / Not mapped / Loading… / Unavailable | Field meaning and absence can be understood without hover |
| MEDIUM | UI polish | `src/client/chrome.css:105` | Corner backplates against a differently colored canvas; duplicated navigation surfaces | Transparent surrounding space and one themed surface per control group | Match native drawing toolbar chrome |
| LOW | Layout | `src/client/workspace/workspace.css:160` | Removing an empty label row shifts planning values upward | Reserve label space and anchor metadata above the footer | Cards share metadata baselines |
| LOW | Layout | `src/client/workspace/NativeWorkspace.tsx:56` | Independently positioned navigation and action controls, with helper margins affecting alignment | Shared layout using existing tldraw components | Common baseline, room for an expanded minimap, stacked controls at narrow widths |
| LOW | UI polish | `src/client/desktop.css:19`, `src/client/AuthLanding.tsx:24`, `src/client/workspace/workspace.css:57` | Programmatic heading focus draws a selection-like outline; tldraw autofocus can draw a viewport-sized border | Suppress only the noninteractive route-heading outline and gate canvas outlines on keyboard input, captured before native event handlers | Preserve native autofocus, heading announcements and actual keyboard focus indicators without startup borders |

No actionable interface findings remain in the inspected scope.

## Verification

Validated implementation commit: `c729f03` (`fix(canvas): align controls and clarify card metadata and focus`). The committed application/test content is the candidate that passed the final gate; this record is committed separately.

- The two new regressions failed before implementation: empty values were dashes, and navigation was flush to the viewport edge. After implementation, the original focused four-test card suite passed.
- The responsive check initially retained button indices across a resize while tldraw moved tools into overflow. The trace showed reachable controls. The corrected check reads the live set on every poll.
- The first full gate also caught the obsolete obstacle calculation in mobile details. That regression was fixed before the final browser build.
- Isolated source preview on ports 3120/3121/3118: initial heading focus, native keyboard/held-key handling, board navigation after keyboard edits, responsive controls, and mobile details zoom/pan passed. The final canvas-focus test also passed after the visual-only correction; initial and keyboard-focused screenshots were inspected.
- Keep tldraw autofocus enabled: disabling it caused native arrow-key/history regressions in the full suite. The final implementation changes only focus presentation, observes keyboard/pointer events at window capture, and does not rerender the editor or intercept input.
- `pnpm test:e2e tests/e2e/card-layout.spec.ts`: whole title lines, stable persisted geometry, full details via keyboard, focus return, working GitHub links, labelled/unlabelled alignment, both themes, narrow canvases, 200% text and no document overflow.
- The extended control regression covers keyboard minimap opening and pointer hit testing at 1440, 1200, 1000, 640 and 320px. It compares the actual toolbar surfaces and baseline coordinates.
- Inspected generated desktop light/dark, narrow/enlarged-text, and minimap screenshots. Screenshot background samples for secondary field text were RGB(252,252,253) in light and RGB(33,37,46) in dark. Against the theme foregrounds RGB(86,96,113) and RGB(178,188,203), WCAG contrast is **6.19:1** and **8.00:1**, above 4.5:1.
- `git diff --check`: passed.
- Final `pnpm gate`: **passed** on Node 26.8.1 and pnpm 12.16.1. Lint, type checks, 14 native-document tests, 4 server tests, production build and **105 browser tests** passed. One unconfigured-authentication test was skipped by the configured fixture. Final run log: `/tmp/gitbored-ui-verified-gate.log`.

Not verified: a screen-reader session, RTL/pseudo-localization, browser page zoom (200% root text was tested), and dedicated screenshots of partial/unavailable planning data. Those planning branches were reviewed in source; existing metadata regressions cover refresh and provider failure. Initial checks used Node 24.22.2. The final run uses the now-available required Node 26.8.1 and cached pnpm 12.16.1, after the global pnpm launcher failed during a concurrent tool update.

## Verdict

Approve for the inspected interface scope. The final integration gate passed. The compact title tradeoff is recorded in `spec.md`: two whole lines at the default size, one at the minimum size, with full titles available through details.
