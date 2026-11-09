# Colour menu and assignment colours

## Scope and coverage

The board’s Colour by control, its colour-key editor, assignment colouring and the existing combined Status mode. React, native button/select/color inputs, tldraw and the existing Atlas + Contextual semantic tokens. Read `AGENTS.md`, `docs/CODING-CONVENTIONS.md` and the preceding `.scratch/card-colour-controls/interface-review.md`. This is an implementation self-review; unrelated application screens are outside scope.

The user chose to retain one combined Status mode. It still uses the mapped project status when available and falls back to the GitHub state. Cancelled represents an issue closed as `not_planned`, using the existing metadata field ([GitHub’s issue API](https://docs.github.com/en/rest/issues/issues)). No separate GitHub-state mode or repository mode was added.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | `CardColourControl`, native select and labelled colour inputs; keyboard open, Escape and desktop/mobile focus return; outside dismissal and direct card inspection; browser hit tests | Clear for inspected interactions; spoken screen-reader output not verified |
| Layout | Desktop light/dark; 320px with 200% root text; long category labels; reset scrolls into view and receives pointer input; 1000px RTL placement | Clear |
| Writing | Mode names, colour-key guidance, reset scope, empty-state and storage-failure recovery copy | Clear |
| Typography | Existing rem scale, unitless line-height, wrapping assignee names and enlarged text | Clear |
| Colors | Rendered light/dark panel, text, helper text, input borders and focus tokens; labelled white Unassigned swatch and cards | Clear |
| UI polish | Existing panel chrome and shared panel state, anchored placement, explicit chevron, immediate updates, contained scrolling | Clear |

## Findings

No actionable interface findings.

## Verification

Reviewed and validated implementation commit: `caaad2f`. The following documentation commit only records this evidence and the screenshots.

- The new keyboard/persistence test failed before implementation because the Colour by trigger did not exist.
- Focused production browser run: `PATH=/tmp/gitbored-tools:$PATH pnpm test:e2e tests/e2e/card-colours.spec.ts` — three passed. Covers manual-colour restoration, split labels, mode persistence, overrides, assignment and assignee modes, white unassigned cards, multiple assignees, scoped reset and direct card inspection. Two initial test mistakes were corrected: a chosen project-status colour matched the manually saved blue, and a reload needed to wait for the board save.
- The interface-continuity checks passed at 1440px and 320px/200% text in both themes, including rendered control text contrast and pointer reachability. The final gate reruns these against the integrated candidate.
- An isolated fixture preview on ports 3118/3119 verified light/dark assignment cards, white Unassigned, long names, narrow reset-button reachability, Escape returning to the mobile Menu and RTL panel bounds at 1000px. Preview process stopped after inspection.
- Measured rendered panel colours: primary text 14.94:1 light / 13.77:1 dark; helper text 6.35:1 / 8.20:1; input boundary 3.67:1 / 4.44:1; focus token against panel 8.03:1 / 8.80:1. Accent colours supplement text labels and are editable.
- Final gate passed using Node 26.8.1: `PATH=/tmp/gitbored-tools:$PATH pnpm gate`. Lint/import-boundary checks, TypeScript, 14 workspace tests, 8 server tests and 111 browser tests passed; one existing unconfigured-deployment test was skipped. The integrated run also covers browser-storage failure messaging and Open fallback when the project status mapping is unset. Log: `/tmp/gitboard-colours-gate.log`.

Screenshots: [light](screenshots/light.png), [dark](screenshots/dark.png), [enlarged mobile top](screenshots/narrow-top.png), [enlarged mobile reset](screenshots/narrow-reset.png), [RTL placement](screenshots/rtl.png).

Not verified: spoken screen-reader output, native browser zoom, forced-colours appearance and live GitHub access. Browser regressions use controlled external GitHub HTTP and real application persistence. No animation was added.

## Verdict

Approve for the inspected flow and domains. Full integration verification passed. This is not a whole-application accessibility audit.
