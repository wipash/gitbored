# Menus, toolbars and save-feedback audit

Scope: board header/switcher, board tools menu, Settings (account, board, view, card colours and project fields), Find, Incoming, repository connector, native drawing/actions menus and save feedback. React with tldraw; existing Atlas + Contextual semantic light/dark tokens. Project guidance: AGENTS.md and docs/CODING-CONVENTIONS.md. No new dependencies or changes to canvas persistence.

Applied better-interface and all six owning skills. Root read the owning skills plus contrast, surface and grouping references. Implementation and browser audit were split between three agents; independent source review was bounded to actual CSS/interactions and found no additional blockers.

## Scope and coverage

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | Native controls, accessible names, expanded states, Escape/focus return; save live region and retry actions | Browser verification in menu-review.md; live screen reader not run |
| Layout | Desktop and 320px/enlarged-text panels, long Find result, mobile menu, board switcher | Compact previews and single-column mobile menu; final evidence in menu-review.md |
| Writing | Settings group names, search empty state/recovery, save states | Clear groups and Clear search; existing error recovery retained |
| Typography | App/native menu text, field labels, mobile input size, long result wrapping | Shared menu scale, unitless line heights, mobile inputs >=16px |
| Colors | SDK chrome mapped to semantic app theme; rendered input/selected-tool pairs | Measurements recorded by browser audit; drawing colours unaffected |
| UI | Shared panel/control radius, elevation, native tool states, close controls | One shared chrome stylesheet; no new animation |

## Findings

| Severity | Domain | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- |
| MEDIUM | UI | src/client/desktop.css:6; src/client/workspace/workspace.css:88 | App buttons/panels and SDK controls use unrelated radii, density, surfaces and accent colors | Shared control/panel tokens and SDK chrome theme mapping in chrome.css | Equivalent controls appear to belong to different interfaces |
| MEDIUM | Layout | src/client/workspace/WorkspacePanels.tsx:90 | Account, destructive board actions, view preferences and project mappings run together | Named fieldset groups with consistent spacing; category editing remains disclosed | Makes the long Settings panel scannable without changing preference behavior |
| MEDIUM | Layout | src/client/workspace/WorkspacePanels.tsx:109 | Full long Find title can fill a narrow enlarged-text panel | Three-line preview, full accessible title and card details | Prevents one result consuming the entire list; reproducing screenshot in menu-review.md |
| MEDIUM | Writing | src/client/workspace/WorkspacePanels.tsx:120 | Filtered Find can show an unexplained empty list | Query-specific empty message and Clear search | Provides a direct recovery action |
| LOW | UI | src/client/boards/Boards.tsx:319 | Board switcher uses a large text close control unlike other panels | Consistent named icon close button | Aligns repeated dismissal interactions |
| LOW | UI | src/client/boards/boards.css:18 | Persistent Saved label and boxed routine save states occupy canvas | Saved visually hidden; saving/unsaved compact; failures retain clear actions | Removes routine noise without concealing failed saves or focused retry feedback |

## Verification

See menu-review.md and save-review.md for executed browser checks, screenshots and known limits. Final gate and hosted CI recorded in the PR. No live screen-reader or physical-device testing; responsive touch emulation and keyboard checks use the production build with controlled GitHub.

## Verdict

Approve for the scoped menus, toolbars and save feedback. Focused browser checks pass at desktop and 320px/200% text in both themes; root inspected final desktop Settings and mobile native-actions screenshots. Live screen-reader and physical-device testing remain not verified. Full regression gate runs before release.
