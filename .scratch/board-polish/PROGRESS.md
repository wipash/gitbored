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
