# Desktop follow-up corrections

Work state: done. Validated application commit: `c57d38f` (layout `f3c30b7`, performance `e44e16c`, initial UI correction `2ec554f`). Retrospective records: `586facc`.

## Reported problems and corrections

- Loading the app flashed the old landing screen. Session loading now renders a neutral full-page loading surface; account/sign-in content waits for the authoritative session response. The regression holds the real session request on root and direct-board loads.
- Account overlapped Theme. The two controls now share a content-sized vertical stack with a real gap, rather than independent fixed offsets. The regression checks desktop and 320px widths at 100%/200% text.
- Incoming’s Add selected scrolled away. It now lives in the fixed footer, with repository connection available through the toolbar and the empty-source footer. The regression scrolls the body to the bottom, verifies the button’s actual hit target, places one card, and checks the panel stays open.
- Card dragging lagged. The save coordinator retains the React snapshot when its visible status fields are unchanged; all subscribers are still notified and recovery writes/generation tracking are unchanged. Card panels observe membership/properties, leaving geometry changes to the canvas; Find resolves current bounds by ID.

## Evidence

The three initial UI regressions failed before the corrections and passed after. The 24 focused recovery, keyboard and desktop tests passed on `e44e16c`. Independent source/rendered review approved the performance changes but found account/status/Incoming collisions; see [initial review](reviews/followup-initial.md).

`f3c30b7` groups account feedback with the account controls and measures Incoming clearance against horizontally overlapping bottom controls. Only chrome resizing and window resizing trigger measurement; canvas movement does not. The strengthened layout test reproduced the collisions before correction. Three focused layout/footer tests and type checking now pass, including account-recovery failure, 320px with enlarged text, and 640×400 as the CSS viewport equivalent of 200% browser zoom. The latter does not additionally double text. The disabled footer busy cursor was also corrected.

The [bounded correction review](reviews/followup-corrections.md) approved the normal layout and source hook, and identified a further stacking regression with a paused save at narrow/enlarged sizes. `aa5476c` puts account recovery above save warnings; the stronger regression now forces a failed canvas PUT rather than a rename and checks actual hit targets. It failed before and passed after the z-index correction. The reviewer’s proposed fixed height floor was not applied: that would replace clipping with overlapping controls. The pre-existing simultaneous-error layout limitation is recorded in [ticket 04](issues/04-constrained-account-error-layout.md), including its changed failure mode.

The first integrated gate on `aa5476c` found a real regression: the clearance selector included the selected shape’s top-right style toolbar. Opening Incoming with a native shape selected could collapse the panel. `c57d38f` restricts that selector to `.tlui-layout__bottom .tlui-toolbar`. The existing two-context recovery/copy browser flow failed before and passed after this correction. The first failed run is retained in `/tmp/gitboard-followup-gate.log` and its failure trace in `/tmp/gitboard-followup-gate-initial-failure`.

The next gate on `c57d38f` passed 89 browser tests but timed out on the controlled runner’s `/__runner/restart` call in the mixed-geometry persistence test; its three later serial board tests did not run. No UI assertion failed there. The unchanged production build passed all five board tests on an isolated replay (including restart in 3.2 seconds), and both alternate authentication cases passed: ten-second session expiry and missing GitHub configuration. The restart timeout’s cause is not established; it is recorded with the runner follow-up rather than described as fixed. The complete confirmation gate on unchanged `c57d38f` passed: lint, type checking, 13 native-document tests, server diagnostics, and 93 production browser tests. Its two environment-specific skips passed separately on the same application commit. The restart scenario passed in the full confirmation run in 3.1 seconds. No application code or test timeout was changed to obtain that result.

Final gate: `PATH="/home/sean/.hermes/node/bin:/home/sean/.volta/tools/image/packages/pnpm/bin:$PATH" CONTROLLED_SESSION_SECONDS=3600 pnpm gate` (Node 26.8.1). Log: `/tmp/gitboard-followup-gate-confirmation.log`. Alternate cases used the production build under the existing machine-wide lock, with `CONTROLLED_SESSION_SECONDS=10` for the expiry case and `E2E_AUTH_MODE=unconfigured` for missing configuration, separate output directories, log `/tmp/gitboard-followup-auth-modes.log`.

The independent review covered `e44e16c` and the rendered corrections in `f3c30b7`; the later stacking and selector corrections are verified by their failing-before/passing-after browser paths and the final integrated gate. No blanket claim that Fable reviewed the final commit. The controlled preview and reviewer terminal were released. Sean’s live app on 3001/3002 and user-owned launcher/data/credentials are preserved. Nothing has been pushed.

`profile-drag.mjs` drives 180 real pointer moves on controlled-provider boards with 30 shapes and records Chromium CPU profiles to `/tmp`. It verifies target displacement and waits for saving. Measurements below are local headless development measurements, not a user-device frame-rate promise.

| Shape / connections | Before script time | After script time | Before / after pointer-run duration |
| --- | --- | --- | --- |
| Cards / Selected | 3.31s | 1.11s | 5.64s / 3.14s |
| Cards / Off | 2.87s | 0.83s | 4.75s / 3.08s |
| Native filled rectangles / Off | Not measured | 0.78s | Not measured / 3.05s |

An earlier hollow-rectangle comparison did not move its target and was discarded. Narrowing panel subscriptions alone did not improve performance; retaining the save-status snapshot removed the parent-driven redraws. Both changes are included in the final card measurements.

Review brief: `followup-review-brief.md`. Live GitHub project access remains unverified; README now records Organization Projects read permission and installation approval.
