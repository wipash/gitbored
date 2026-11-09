# One-click colour switching and nearby palette editing

## Scope and coverage

The board’s visible Colour by switcher, neighbouring Colours disclosure, current-mode palette and Assignee colouring. React, native radios/buttons/color inputs, tldraw and the existing Atlas + Contextual tokens. Read `AGENTS.md`, `docs/CODING-CONVENTIONS.md` and the preceding colour-control records. This is a scoped implementation self-review, with a separate Claude Fable UI/UX critique requested by the user.

Modes are Off, Status, Priority, Labels, Type and Assignee. The combined Status fallback is retained. Assignee makes unassigned cards white and splits the strip for multiple people. The redundant assignment mode is removed; a saved preference for that mode moves to Assignee. Palette editing follows the active switcher selection without adding steps to mode changes.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | Native radio group and named inputs; one click per mode; arrow-key navigation, Tab to Colours, Escape and desktop/mobile focus return; direct card inspection; browser hit testing | Clear for inspected interactions; spoken screen-reader output not verified |
| Layout | Desktop light/dark; 320px with 200% root text; long names; reset scrolls into view and receives pointer input; 960px switcher alignment and 1000px RTL placement | Clear for tested states; designer confirmed compact desktop fix |
| Writing | Mode names, mode-specific palette heading, guidance, reset scope, empty-state and storage-failure recovery copy | Clear |
| Typography | Existing rem scale, unitless line-height, wrapping names and enlarged text | Clear |
| Colors | Rendered light/dark segments and palette; selected underline; labelled white Unassigned swatch and cards; browser contrast assertions | Clear |
| UI polish | Existing shared chrome and panel state, explicit chevron, immediate switching, contained scrolling, hover-capable styling | Clear |

## Findings

No outstanding accessibility or interaction failures in the inspected states. [Claude Fable’s independent critique](claude-ui-feedback.md), performed as an experienced UI/UX designer with supplied screenshots and additional preview captures, found no blockers and recommended shipping.

Implemented its first three recommendations: neutral grey and explanatory copy for missing priority; no font-weight change on selection, avoiding toolbar movement; and a visually hidden, still-accessible legend at compact desktop widths so Colours stays beside the switcher. Fable rechecked the final screenshots and source and confirmed all three fixes. Other suggestions remain optional follow-ups; unassigned remains white as requested.

## Verification

- Added the one-click regression before restoring the switcher: it failed because the radios were absent.
- `PATH=/tmp/gitbored-tools:$PATH pnpm test:e2e tests/e2e/card-colours.spec.ts tests/e2e/interface-continuity.spec.ts` — seven passed on Node 26.8.1 after the designer fixes (`/tmp/gitboard-switcher-designer-fixes.log`). Covers all six one-click modes with the palette closed, stable trigger position across selections, 960px same-row alignment, neutral missing priority, open palette following mode changes, arrow keys and Tab order, persistence, manual-colour restoration, split labels/assignees, scoped reset, white unassigned cards, storage failure and the project-status fallback.
- The same run checks segment contrast and pointer reachability in both themes at 1440px and 320px/200% root text.
- Isolated preview on 3118/3119: refreshed light/dark switcher and palette screenshots; narrow Menu and palette scrolling; reset-button reachability; Escape to the mobile Menu; 1000px RTL bounds. Preview data is invented.
- Palette rendered colours remain unchanged: primary text 14.94:1 light / 13.77:1 dark; helper text 6.35:1 / 8.20:1; input boundary 3.67:1 / 4.44:1; focus token against panel 8.03:1 / 8.80:1. Category accents supplement text labels.
- `PATH=/tmp/gitbored-tools:$PATH pnpm gate` — passed on Node 26.8.1 for implementation `92bba3b2951d0724855b0a9aa19b2b94efb59758`: lint, TypeScript, 14 workspace tests, 8 server tests and 112 browser tests. One existing unconfigured-deployment browser test skipped. Log: `/tmp/gitboard-switcher-final-gate.log`. The following evidence commit changes only this record, screenshots and the designer report.

Screenshots: [light switcher](screenshots/light-switcher.png), [dark switcher](screenshots/dark-switcher.png), [light palette](screenshots/light.png), [dark palette](screenshots/dark.png), [enlarged mobile menu](screenshots/narrow-switcher.png), [mobile palette](screenshots/narrow-top.png), [mobile reset](screenshots/narrow-reset.png), [RTL placement](screenshots/rtl.png).

Designer fixes: [compact desktop switcher](screenshots/compact-switcher.png), [missing priority](screenshots/priority-empty.png). All screenshots were refreshed after the final implementation changes.

Not verified: spoken screen-reader output, native browser zoom, forced-colours appearance and live GitHub access. Browser regressions use controlled GitHub HTTP and real application persistence. No animation was added.

## Verdict

Approve for the inspected interactions and domains, with independent designer approval and the final integration gate passing. This is not a whole-application accessibility audit.
