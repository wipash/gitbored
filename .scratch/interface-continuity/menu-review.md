# Menu and toolbar continuity review

Scope: Settings, Find, Incoming, Repositories, Boards, native More/Actions popovers, and routine/failed save feedback. React + tldraw, existing Atlas + Contextual semantic tokens. Read AGENTS.md, docs/CODING-CONVENTIONS.md, better-interface and all six owning skills. Reviewed source candidate `1094453` (including save change `c30bc29`) through real browser fixtures. This is a bounded product-flow audit, not a repository-wide design review.

## Coverage

| Domain | Evidence | Result |
| --- | --- | --- |
| Accessibility | Real hit targets and named controls; Escape closes panels; keyboard Tab/Enter clears Find and restores search focus; native toolbar controls; measured text/icon contrast | Clear in tested flow; full screen-reader walk not verified |
| Layout | 1440px/100% and320px/200%, light/dark; scrolled Settings and Boards; existing phone layout covers390px,320px and landscape844px at100%/200% | Clear after fixes |
| Writing | Find identifies the query and offers Clear search; settings use stable Board/View/Account terms; failed save keeps explicit Retry save and recovery copy | Clear |
| Typography | Long Find titles, board names and repository labels; wrapping at200%; compact Find preview retains full accessible text and existing Card details path | Clear |
| Colors | Computed Theme-field contrast at least4.5:1, hovered primary-action contrast at least4.5:1, selected native-tool icon contrast at least3:1 in both themes; native popover and app panel background values match | Clear |
| UI | Actual desktop/narrow screenshots show shared panel/control radii and surfaces, grouped Settings, one-column Board tools menu, quiet saved state and visible failure recovery | Clear |

## Confirmed findings and corrections

| Severity | Domain | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| HIGH | Accessibility/layout | `src/client/chrome.css:70` | Embedded Boards list inherited z-index500 while its new close button had z-index1; the button was covered and real click timed out | Embedded list uses z-index:auto; close control now receives input on desktop and320px | A focused close control must remain visible and operable (WCAG2.4.11); visible header had no close icon |
| MEDIUM | Layout/typography | `src/client/chrome.css:67` | A long Find result occupied more than a viewport at200%, pushing the search away when the result was scrolled into view | Three-line visual preview, full accessible text and explicit Card details remain available | Comparing results and returning to search was unnecessarily difficult |

Both findings are fixed and their actual browser regressions pass. No remaining actionable finding in this scope.

## Verification

`PATH=/tmp/gitbored-tools:$PATH CONTROLLED_SESSION_SECONDS=900 pnpm test:e2e tests/e2e/interface-continuity.spec.ts --output=/tmp/gitbored-interface-results-3`: **3 passed (16.2s)**. Covers both theme/size combinations, controls, keyboard empty-result recovery, computed contrast, native popovers, visually quiet Saved, and a real transport-failed save followed by successful retry. Tools TypeScript check passed.

The preceding focused run also passed `mobile-layout.spec.ts` and `card-details.spec.ts` with the unified CSS. Its two audit failures were the covered Boards close control; the final focused run validates that correction. Root owns the final full gate.

Evidence roots:
- Before: `/tmp/gitbored-interface-baseline/interface-continuity-appli-9eb5b-sable-at-320px-and-200-text-chromium/320-light-find.png`.
- Covered close control: `/tmp/gitbored-interface-results-2/interface-continuity-appli-180b1-able-at-1440px-and-100-text-chromium/1440-light-boards.png`.
- Final desktop: `/tmp/gitbored-interface-results-3/interface-continuity-appli-180b1-able-at-1440px-and-100-text-chromium/`.
- Final narrow: `/tmp/gitbored-interface-results-3/interface-continuity-appli-9eb5b-sable-at-320px-and-200-text-chromium/`.

Final screenshot sets include menu, Settings top/bottom, Find/empty Find, Incoming, Repositories, Boards, native More and native Actions for each theme. Inspected desktop Settings in both themes, narrow Find before/after, native Actions dark, and Boards. Root independently inspected additional menu screenshots.

**Approve** for the tested flow. RTL/pseudo-localization and a full assistive-technology session were not verified; no claim of those checks is made.
