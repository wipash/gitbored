# Workspace menus and retired pages

Implemented: one Settings panel for board rename/delete, closed-card visibility, connections, project mappings and card colours. Removed standalone Sources/Account page components, navigation and obsolete styles. Sign-out, theme, reauthorization and session recovery remain in the workspace. Unknown former page URLs redirect to Boards.

Assumptions for morning review: Settings is the combined menu name; account actions stay beside theme controls; former bookmarks open Boards. Repository browsing uses the current Repositories/Incoming panels. The Sources HTTP API is retained because those panels need it.

Deleted tests that exercised removed Sources UI; preserved lossless identity, authorization isolation, malformed provider payload and URL validation checks in `tests/e2e/sources-http.spec.ts`. Migrated remaining session/dirty-draft tests to workspace navigation.

## Scope and coverage

React + tldraw, existing CSS tokens and compact Atlas/Contextual styling; conventions read from AGENTS.md and docs/CODING-CONVENTIONS.md. Review boundary is Settings, sign-in and the retained workspace account controls. All six owning better-interface skills read.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | Native controls, accessible names, keyboard open/rename/Escape/focus return, pointer hit tests, existing dirty-session regressions | Clear for tested paths; screen-reader speech not verified |
| Layout | Desktop and 320px at 200% text, both themes; screenshots of Settings | Fixed footer overlap using existing panel clearance hook; board heading no longer covers menu trigger |
| Writing | Settings labels, retained recovery messages, destructive confirmation | Clear |
| Typography | Native input, inherited type scale, wrapping and long board title field | Clear for desktop/Chromium; iOS not verified |
| Colors | Existing semantic tokens used unchanged in menus, both themes inspected | No new menu palette; new card colours owned by colour agent |
| UI | Non-modal panel, scroll containment, no introduced motion, focus outline rendering | Clear |

No actionable interface findings remain within this menu scope.

## Verification

- `pnpm type-check`: passed.
- `PATH=/tmp/gitbored-tools:$PATH pnpm lint`: passed.
- Focused auth, board-session, desktop-redesign, repository-connection and sources-http run: 28 passed, one intentionally skipped short-session expiry case.
- `PATH=/tmp/gitbored-tools:$PATH CONTROLLED_SESSION_SECONDS=900 pnpm test:e2e tests/e2e/desktop-redesign.spec.ts --grep 'one Settings panel' --output=/tmp/gitbored-menu-results`: passed after fixing the narrow footer overlap; asserts actual hit targets, keyboard navigation, rename persistence and editor lifetime.
- Inspected rendered screenshots at `/tmp/gitbored-menu-results/desktop-redesign-one-Setti-45598-rd-reachable-in-both-themes-chromium/`: light desktop and dark 320px/200%.

## Verdict

Approve for tested scope. Screen-reader speech, iOS and translation/RTL remain unverified; no broad redesign was attempted.
