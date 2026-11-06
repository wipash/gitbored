# Review of e3f8d06 `fix(workspace): unify sign-in shell and load runtime tldraw licence`

Reviewed against `origin/main` (one commit ahead). Read-only; no files changed, no subagents.

## Scope and coverage

**Scope.** The signed-out entry flow and the shell it shares with Boards: `src/client/AuthLanding.tsx`, `src/client/desktop.css`, `src/client/workspace/NativeWorkspace.tsx`, `src/client/env.d.ts`, `index.html`, `src/server/app.ts`, `src/server/config.ts`, the README paragraph, `tests/runtimeConfig.test.ts` and the three touched e2e tests in `tests/e2e/desktop-redesign.spec.ts`. States inspected: signed-out, `authError=denied`, `authError=unconfigured`, Boards list, active board, Incoming panel open, account recovery (session check failing, save rejected with 401), light and dark, 1440×900, 900×800, 640×400, 320×568 and 320×800 at 100% and 200% root font size.

**Boundary.** The `/account` and `/sources` routes were loaded only to confirm they are unchanged by the `inWorkspace` split. RTL, forced-colors, screen-reader announcement timing and touch pointers were not exercised. Nothing outside the named flow was reviewed.

**Stack.** React 19 function components, plain CSS with semantic tokens in `src/client/styles.css` (`--color-*`, light and dark under `html[data-theme]`), Fastify server, Playwright e2e against a production build plus a synthetic GitHub provider. Project interface conventions found: `docs/CODING-CONVENTIONS.md` (Interface work section), `docs/PROJECT_MANAGEMENT.md`, `AGENTS.md`. No Storybook or design-system doc.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | Tab walk and computed `:focus-visible` outline on sign-in and Boards; Enter on the sign-in link; landmarks and heading outline; `role=alert` / `role=status` text in both error states; hit tests on every floating control at 320px and 200% text; preview screenshots | Clear |
| Layout | Shell bounds, `scrollWidth`/`scrollHeight`, panel and floating-stack rectangles, overlap tests against tldraw toolbar, navigation panel, top-left actions, Incoming panel and save notice at six viewport/text combinations | 1 MEDIUM, 1 LOW introduced; 2 pre-existing |
| Writing | Remaining sign-in copy, the two sign-in error strings, unconfigured copy, README paragraph, commit message | Clear |
| Typography | Computed size/weight of h1 (18px/650), h2 (14px/650), body (13px/400), theme label (12px), button wrap at 200% | Clear |
| Colors | Measured rendered pairs in both themes: h1/h2/body, primary button, theme label and select, Account link, Sign out, error text | Clear (minimum 6.35:1) |
| UI polish | New CSS adds no motion, transitions or shadows; radius 4px outer / 3px controls matches existing desktop rules; dotted background reused from `.app-loading` | Clear |

## Findings

Status: `Introduced` by this commit, or `Pre-existing` on `origin/main`. Only `Introduced` rows count toward the verdict.

| Severity | Status | Domain | Location | Before | After | Why |
| --- | --- | --- | --- | --- | --- | --- |
| MEDIUM | Introduced | Layout | `src/client/AuthLanding.tsx:127`, `src/client/AuthLanding.tsx:166`, `src/client/desktop.css:9` | `inWorkspace` is true for `signed-out`, `error` and `unconfigured`, which adds `desktop-app`; `.desktop-app > footer { display: none; }` then hides the footer and its `Runtime diagnostics` link on every signed-out screen. On `origin/main` the sign-in page showed that footer. Measured on the preview: `a[href="/runtime"]` `checkVisibility()` is `false` on sign-in, denied and unconfigured; `true` on `/account`. | Scope the hide to the canvas: `.desktop-app:has(.board-editor, .boards-list) > footer { display: none; }` (keeps the Boards list as it is today), or render a `Runtime diagnostics` link inside the `unconfigured` and `error` branches of the auth panel next to the "ask the deployment operator" copy. | Content reachable only by typing the URL. The unconfigured and session-error states are the ones that tell the operator to fix the deployment, and the README names `/runtime` as the diagnostic for exactly that. Not HIGH: the page is still reachable by URL and the sign-in task itself is not blocked. |
| LOW | Introduced | Layout | `src/client/desktop.css:26` | `.entry-panel` shares `max-height: calc(100dvh - 150px); overflow: auto`. At 320×568 with 200% text the sign-in panel is 416px tall with 466px of content (denied error: 686px), so the heading or the alert scrolls out of the panel while the document itself does not scroll. 13px remain between the panel and the theme control, so the cap is close to the floor. | Below 400px wide, let the document scroll instead of the panel: `@media (max-width: 400px) { .desktop-app .entry-panel { max-height: none; } .desktop-app:not(:has(.board-editor)) main { padding-block-end: 80px; } }` so the fixed theme control never sits over the last line. | Internal scroll on a bordered card with no visible cue on overlay-scrollbar platforms. The sign-in link and theme select were hit-tested uncovered at that size, so nothing is unreachable; this is polish on an extreme combination. |
| LOW | Pre-existing (reduced by this commit) | Layout | `src/client/desktop.css:26`, `src/client/desktop.css:77-79` | Boards list at 320×568, 200% text: the fixed Account / Sign out / Theme stack is 116px tall and sits at `bottom: 12px`, covering the lower 48px of the `.boards-list` card. Scrolled to the end, the last entry's link (bottom 392px) is above the stack (top 440px) and hit-tests uncovered, but its "Updated …" metadata line is partly behind the stack (screenshot `boards-320-200-scrolled.png`). On `origin/main` the stack was at `bottom: 48px` with the same height, so 84px were covered. | `@media (max-width: 400px) { .desktop-app:not(:has(.board-editor)) .boards-list { max-height: calc(100dvh - 70px - 140px); } }` or move the stack into normal flow under the card below 400px. | Metadata only; the primary action and the board link stay reachable. Recorded so the next slice on this card does not treat it as new. |
| LOW | Pre-existing | Layout | `src/client/desktop.css:19`, `src/client/desktop.css:68`, `src/client/desktop.css:83` | Account recovery at 320×800, 200% text: the account feedback stack (status + "Check account" card, 240px tall, scrolls internally over 762px of content) overlaps the paused-save notice (`.board-save`, y 58 to 465) between y 278 and 465. Check account, Renew sign-in, Account, Theme and Sign out all hit-test uncovered at 1440/100%, 1280/200%, 320/100% and 320/200%. | Out of this slice. The notice and feedback geometry are unchanged by the commit; the commit only rearranged the lower row of the stack. | This is the constrained recovery overlap already known on `origin/main`; nothing in it is unreachable. Also seen, unrelated to the commit: at 320px/200% the "Saved" status sits over the 113px-tall board heading card. |

Observation, not a finding: on load the `h1` receives programmatic focus and Chromium draws the 2px ring across the full panel width, so "GitBored" looks like a text field until the user tabs. That focus move predates this commit and is the project's route-change convention.

## Runtime public key handling

No findings. What was checked:

- `GET /api/client-config.js` on the preview returns `200`, `application/javascript; charset=utf-8`, `Cache-Control: no-store`, body `window.gitboredConfig = {"tldrawKey":null};`. The route is registered before authentication and needs no session, which is correct for a public SDK key that is normally embedded in client bundles anyway.
- The response is built with `JSON.stringify` of an object holding only `tldrawKey`; `tests/runtimeConfig.test.ts` executes the script in a fresh `vm` context for an absent key, a plain key and a key containing `"; window.injected = true; // </script>` and asserts that the client id, client secret and token encryption key never appear. `</script>` cannot matter for an external script, so that case is extra rather than required.
- `tldrawKey` is referenced only in `config.ts`, `app.ts`, `env.d.ts` and `NativeWorkspace.tsx`. `main.ts` logs only the listen address, so the key is not logged, and `/runtime` does not print config.
- Startup order: the built `dist/client/index.html` keeps the classic `<script src="/api/client-config.js">` in `<body>` and Vite hoists the module script to `<head>`. Module scripts are deferred, so `window.gitboredConfig` is assigned before `NativeWorkspace` renders. If the request fails, the optional chain yields `undefined`, no `licenseKey` prop is passed and tldraw behaves as unlicensed; the app itself still starts. The only cost is one same-origin round trip on the parser before first paint.
- Vite dev mode proxies `/api/` to the backend, so the same path works under `pnpm dev` and the dev-mode e2e harness.
- `readConfig` trims and nulls an empty `TLDRAW_KEY`, and the README states the restart-plus-reload requirement and that only the public key is served. Hosted verification that tldraw accepts a real key on the production hostname remains an integration limit (preview shows tldraw's "Get a license for production" badge).

## Verification

Run by me against the isolated preview (`http://127.0.0.1:3005`, provider `3006`), Chromium via the repository's Playwright, scripts in the session scratchpad (`review.mts`, `review2.mts`; raw output `review-out.txt`, `review2-out.txt`; screenshots under `shots/`):

| Check | Result |
| --- | --- |
| Sign-in 1440×900, light and dark: `.auth-shell` top 0, height 900, `scrollHeight` 900, radial-gradient background, `.entry-panel` 440px wide at y 70, theme control at bottom-right (y 848) | Passed |
| Keyboard: initial focus on `h1`; Tab → Sign in with GitHub → Theme → wraps to Skip to content; every stop shows `outline: 2px solid` focus token with 3px offset; Enter on the link navigates to the provider authorize URL | Passed |
| Sign-in 320×568, 320×800 (100% and 200% text) and 640×400: `scrollWidth` equals viewport, panel and theme stack do not overlap, Sign in and Theme hit-test uncovered | Passed (internal panel scroll noted in the LOW finding) |
| `?authError=denied` and `?authError=unconfigured` at 1440 and 320/200%: `role=alert` text present and names the next action, Sign in reachable | Passed |
| Contrast, both themes: h1/h2/body 14.94 and 13.77, primary button 8.03 and 8.19, theme label 6.35 and 8.20, Account link 8.03, error text 6.95 and 8.91 | Passed |
| Boards list 1440: Account and Theme share the row (both y 848) with a 6px gap; Tab order h1 → Board name → Create board → Account → Sign out → Theme; 320 at 100%/200%: Create board, Account, Sign out, Theme uncovered; no horizontal scroll | Passed |
| Active board 1440×900, 900×800, 640×400, 320×800 at 100%/200%: `.workspace-preferences` does not overlap `.tlui-toolbar`, `.tlui-navigation-panel`, `.tlui-layout__top__left`, `.board-heading` or `.board-save`; Account, Sign out, Theme and zoom control uncovered | Passed |
| Incoming panel open (alice/project connected) at 1440×800, 640×400, 320×800 at 100%/200%: panel and stack do not overlap, `.incoming-body` height > 0, Add selected uncovered | Passed |
| Account recovery (session fetch aborted, board PUT 401) at 1440/100%, 1280/200%, 320/100%, 320/200%: status above Check account card, all five recovery and account controls uncovered, Sign out disabled | Passed |
| `/account` after sign-in: not `desktop-app`, intro paragraph still present, footer visible | Passed |
| `curl` of `/api/client-config.js` and of the built `index.html` | Passed |

Reported by the author, not rerun here: lint, type-check, `tests/runtimeConfig.test.ts`, the five focused browser checks, CI and the full local gate (all green per the author's last update).

Not verified: tldraw licence acceptance on a hosted HTTPS hostname; RTL mirroring of the bottom-right stack; screen-reader announcement of the inserted `role=alert`; forced-colors rendering of the dotted background and panel border; touch pointers; reduced-motion (the change adds no motion, so nothing to gate).

## Verdict

**Approve.** No HIGH finding was introduced. One MEDIUM introduced finding (the hidden Runtime diagnostics link on the signed-out, unconfigured and session-error screens) and one LOW stay in the table as work to do; the two pre-existing overlaps are recorded for the next slice on those surfaces. All six domains were inspected for the named flow.
