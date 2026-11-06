# Board polish progress

Base: cf0e37f (main). Branch: feat/board-polish.

- Cache agent: persistent GitHub metadata/context and page cache, refresh wiring, focused HTTP checks.
- Menus agent: combined settings, remove legacy screens, update affected navigation checks.
- Colours agent: native manual card colours, category preferences, reversible overlays.
- Root: anchored details, stale PM references, integration and bounded independent review, PR/CI/merge and homelab release.

Review scope is requested behavior and concrete regressions only. User explicitly authorized merge and homelab update; no extra approval step.

Implementation evidence:
- Persistent cache tests: 2 passed, including server restart and access loss.
- Card details regression: reproduced hard-coded left position; after fix, pan/zoom/switch/dismiss + narrow text check passed.
- UI colour check caught CSS cascade override; fixed and focused test passed.
- Menu suite: 28 passed, 1 environment-specific skip; final narrow interaction check in progress.
- PM-guide references removed at user's request, including stale historical pointers. No replacement management process added.

Integrated validation (application code e6b6c98, diagnostic test correction 4b63870):
- Node 26.8.1 and pnpm 12.16.1, using `/tmp/gitbored-tools` to bypass the host Volta Node 24 shim.
- `pnpm gate` passed lint, types and 14 native tests, then exposed a diagnostic fixture expecting uncached data. The fixture now explicitly refreshes; its rejection assertions are unchanged.
- `pnpm test:server`: 3 passed after that correction.
- Remaining gate stage `pnpm test:e2e`: 81 passed, 1 unconfigured-mode test skipped in the configured run (3.4 minutes). Hosted CI separately exercises unconfigured mode and short-session expiry.
- Independent spec and standards reviews: no outstanding findings. UI coverage and exclusions are in the slice reports.
- Gitboard PR: https://github.com/wipash/gitbored/pull/4. Hosted CI and image publishing precede the homelab update.


Mobile follow-up:
- PR #4 merged as 62072a2; user then requested compact mobile menus and account/theme inside Settings using their phone screenshot.
- Follow-up branch `fix/mobile-workspace-menus` adds the compact Menu, non-modal phone panels and shared account settings, retaining auth recovery and editor lifetime.
- The first main publication was stopped by a flaky popup zoom interaction. Corrected test targets verified canvas and holds Control until zoom renders; three consecutive runs passed. No assertion was removed.
- Bounded mobile/account reviews found and corrected recovery notice overlap. New touch flow and 10 targeted recovery/session tests pass; final full gate and hosted CI will determine release readiness.
- Homelab branch `chore/gitbored-board-polish` is prepared locally but not pushed. Its image tag will be replaced with the follow-up merge SHA before opening the release PR.
