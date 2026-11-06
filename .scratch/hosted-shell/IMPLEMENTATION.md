# Hosted shell and tldraw licence

Work state: in-review

Application candidate: `e3f8d06`, [PR #3](https://github.com/wipash/gitbored/pull/3).
Deployment: [homelab PR #7366](https://github.com/wipash/homelab/pull/7366).

## Outcome

Sign-in uses the compact dotted workspace without the four requested marketing strings. A flow-root contains the panel margin so the dots start at the viewport top. Account and Theme share a wrapping row, with recovery notices above it.

The server supplies only the public tldraw SDK key through a no-store JavaScript endpoint, loaded before the application module. `TLDRAW_KEY` can change without rebuilding. Homelab External Secrets reads the named field from the existing `gitbored` item. No credential value is committed.

## Validation

The added real-browser regression failed before the layout changes and passes afterward. Five focused browser scenarios cover the shared shell, loading restoration, narrow/enlarged sign-in and account/recovery hit targets. Light/dark screenshots are attached to the PR.

The real HTTP/SQLite runtime-config regression failed with 404 before implementation and passes for absent, replaced and escaped key values. It evaluates the returned JavaScript and verifies the configuration excludes server credentials.

Full Node 26.8.1 gate passed on `e3f8d06`: 94 browser tests, two expected environment-specific skips, lint/types/native/server/build checks. Remote CI also passed both alternate authentication modes and the Docker build/persistence/backup smoke test: https://github.com/wipash/gitbored/actions/runs/42196388678.

Homelab offline Flux validation passed: 345 passed, one skipped; remote checks passed.

## Review and limits

Independent Fable source/rendered review approves `e3f8d06`; see [the full review](REVIEW.md). All six interface domains and the runtime public-key boundary were inspected. No material blocker was found. Two introduced follow-ups remain: the compact signed-out shell hides the Runtime diagnostics link (the route still works), and small/enlarged screens scroll inside the sign-in card. Existing Boards metadata/recovery-notice crowding is reduced or unchanged; essential controls remain reachable. Real hosted licence validation requires the new image, populated secret and browser reload. The generated branch-pillow logo is a separate design preview and is not installed by this PR.
