# Card colour controls

## Scope and coverage

Move colour-mode selection into the workspace’s top controls, keeping category colour editing directly visible in Settings. React 19, native radio inputs, tldraw, existing CSS semantic tokens and Atlas + Contextual chrome. Read `AGENTS.md`, `docs/CODING-CONVENTIONS.md` and the desktop redesign records. Review excludes unrelated screens and the content of individual cards.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | `CardColourControl`, native fieldset/radios, arrow keys, single Tab stop, keyboard focus capture, category labels, pointer hit tests at desktop and 320px/200% text | Clear for inspected interactions; screen-reader speech not verified |
| Layout | Top toolbar, Settings, light/dark screenshots; 320, 640, 901, 1000 and 1440px; enlarged text; empty board and long category labels | Clear |
| Writing | Colour by, Off/Status/Priority/Labels/Type, Category, existing reset/empty/storage messages | Clear |
| Typography | Existing rem-based control scale and weights, long category values, actual 200% root text | Clear |
| Colors | Existing semantic tokens; browser contrast assertions in both themes for each segment; selected and focus token calculations | Clear |
| UI polish | Existing nested radii, neutral selected pill, underline as a non-colour cue, hover-only styling and instant selection feedback | Clear |

## Findings

No actionable interface findings.

## Verification

Rebased implementation: `f05e6b22615daa27c86d4a9b47072fa0d46010a5`, based on main `495818b88d750c25667a4bd55ac6b0517a5626f6`.

- Updated the existing colour browser regression before implementation: it failed because the top-level Colour by group did not exist.
- `pnpm test:e2e tests/e2e/card-colours.spec.ts tests/e2e/interface-continuity.spec.ts`: 5 passed. Covers all modes, original-colour restoration, category mapping (including Labels → label), editing other categories, saved preferences, keyboard selection and Settings reopening. Interface tests check hit targets and text contrast in both themes at 1440px and 320px with 200% text.
- Inspected the resulting desktop light/dark, narrow menu, enlarged menu, Settings and keyboard-focus screenshots in `test-results/`.
- Isolated fixture preview on port 3118: all segments reachable at 1000×800, 901×800, 1440×900 with 200% text, and 640×450 (a reduced CSS viewport, not native browser zoom). Inspected screenshots in `/tmp/colour-preview-*.png`.
- RTL document preview: selection remains usable within tldraw’s LTR controls. This does not claim a fully mirrored application.
- Simulated browser storage quota failure: selected mode still applies and the top controls display the recovery message. No real account or GitHub data used.
- Calculated semantic-token contrast: unselected text 5.57:1 light / 7.09:1 dark; selected text 14.94:1 / 13.77:1; selection border against surface 3.67:1 / 4.44:1; focus against track 7.04:1 / 7.60:1. Browser tests separately measure rendered text pairs.
- Before rebase, `pnpm gate` through the default Volta launcher (Node 24): passed lint, type checks, 14 workspace tests, 4 server tests and 109 browser tests (1 existing unconfigured-deployment skip). Includes real keyboard/gesture/editor-lifetime/history regressions. Log: `/tmp/gitbored-colouring-gate.log`.

Not verified: spoken screen-reader output, actual browser zoom, forced-colours rendering and live GitHub metadata failures. No animation was added. Existing canvas continuity and gesture tests are included in the full gate.

The post-rebase gate passed on implementation `f05e6b2` using the required Node 26.8.1: `PATH=/tmp/gitbored-tools:$PATH pnpm gate`. Lint, type checks, 14 workspace tests, 4 server tests and 110 browser tests passed; the unconfigured-deployment case retained its existing skip. Log: `/tmp/gitbored-colouring-rebased-node26-gate.log`.

Fresh post-rebase screenshots were inspected and saved: [light](screenshots/light.png), [dark](screenshots/dark.png), [narrow](screenshots/narrow.png). The remaining commit adds only this evidence.

## Verdict

Approve for the inspected colour-control flow and domains. The full gate passed. This is an implementation self-review, not an independent review or a whole-application accessibility audit.
