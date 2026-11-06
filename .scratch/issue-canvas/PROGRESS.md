# Issue canvas progress

Updated: 2026-11-06

## Current state

Sean’s approved desktop redesign is implemented on local `main`: full-screen canvas, compact floating menus, dot grid/icons, client navigation, repository typeahead/import filters, automatic Incoming paging and bulk placement, resizable cards, project-field mappings, and generic related-item connections. Incoming stays open and placement preserves the camera. Account isolation, revisioned saves, conflict recovery, and native history remain intact.

Local commits: `e16bccd` implementation, `94af19e` design/checkpoint records, `f636ca7` native shortcut release fix. Nothing has been pushed. See [implementation and validation](../desktop-redesign/IMPLEMENTATION.md), [accepted prototype](../desktop-redesign/proposal.html), and [audit](../desktop-redesign/audit.html).

Validation complete on application commit `f636ca7`: full Node 26.8.1 gate passed (89 browser tests; lint/types, 13 native-document tests, server diagnostics). Both environment-specific skips passed separately against the same production build: session expiry and missing GitHub configuration. Final tracking commits change documentation only. Independent Fable rendered review and corrections are recorded in [reviews](../desktop-redesign/reviews/); the subsequent SDK review found no material regression. Final panel/focus/footer checks passed in light/dark desktop and narrow/enlarged text.

Follow-up fixes for startup flash, Account/Theme overlap, Incoming’s pinned selection action and drag performance are committed and validated through `c57d38f`. Full Node 26 gate passed: lint/types, 13 native-document tests, diagnostics and 93 production browser tests; session-expiry and missing-configuration cases passed separately. Independent review and the gate exposed additional layout/selector defects, now corrected. One intermittent test-runner restart timeout passed unchanged in isolation and in the full confirmation run; its cause remains recorded under tooling. See [follow-up evidence](../desktop-redesign/FOLLOWUP.md).

## Next product checkpoint

Use Sean’s existing app to connect a real repository, bulk-place work, arrange/resize it, and reopen the saved board. Prior live sign-in/repository browsing was confirmed; the redesigned flow and GitHub Projects permissions still need live-account verification. Controlled-provider coverage is not evidence of live Projects access.

Sean’s app remains on ports 3001/3002 with `.data/github-debug` and ignored `.env.github-debug`; its process and credentials are preserved. The user-owned launcher `.scratch/github-debug-local.sh` remains untracked. The accepted static prototype is still served at `http://10.0.16.32:3018/proposal.html`; it is not the live GitHub application.

## Retrospective follow-ups

CI enforcement and verified GHCR images are in review in [PR #2](https://github.com/wipash/gitbored/pull/2); see [CI evidence](../desktop-redesign/issues/03-ci-gate.md). CI pins the runtime and isolates authentication modes. Local-runner follow-ups remain queued: [runtime preflight](../desktop-redesign/issues/01-runtime-preflight.md) and [isolated test runs and auth modes](../desktop-redesign/issues/02-isolated-test-runs.md). Safe server failure logging was merged in [PR #1](https://github.com/wipash/gitbored/pull/1). Early live-path and stable visual milestones are recorded in the project guide; editor-lifetime review is in coding conventions.

Remaining UI edge case: [constrained account-error layout](../desktop-redesign/issues/04-constrained-account-error-layout.md). Recovery controls remain reachable, but simultaneous notices can still crowd Incoming at very small/enlarged viewports.

## Preserved work

These older worktrees remain paused and unmerged under `../gitbored-wt/`. The desktop redesign now overlaps details/filters/refresh, so compare the current implementation before reviving older work. Do not merge stale UI wholesale. Preserve concrete unfinished requirements in each ticket.

| Ticket | Branch | Preserved commit |
| --- | --- | --- |
| [07 filters](issues/07-local-filters.md) | `ticket/07-local-filters` | `aa9b8a3` |
| [08 refresh](issues/08-coordinated-refresh.md) | `ticket/08-coordinated-refresh` | `b5df686` |
| [12 JSON portability](issues/12-reference-json-portability.md) | `ticket/12-reference-json-portability` | `7aee65f` |

JSON portability and broader clipboard/schema/performance work remain outside this redesign. Existing upstream comma/window-blur behavior and UI-origin Shift eligibility are documented in README; the panel-rerender release regression is fixed. Screen-reader runtime, RTL, and forced-colors were not exercised. Historical progress is retained in Git; the specification and ticket comments remain the source for unfinished scope.
