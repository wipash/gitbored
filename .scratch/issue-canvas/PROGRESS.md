# Issue canvas progress

Updated: 2026-11-06

## Current state

The desktop workspace, individual accounts, safe server logging and CI/GHCR publication are merged. GitBored is deployed publicly at `https://bored.mcgrath.nz` through the homelab; Sean confirmed GitHub sign-in. NAS iSCSI storage and VolSync backups are configured.

Hosted shell fixes are in [app PR #3](https://github.com/wipash/gitbored/pull/3): compact sign-in without marketing copy, a full-viewport dot grid, adjacent Account/Theme controls, and runtime `TLDRAW_KEY` loading. [Homelab PR #7366](https://github.com/wipash/homelab/pull/7366) maps the key from the existing 1Password item. The app image needs updating after merge before the key takes effect. See [validation and review](../hosted-shell/IMPLEMENTATION.md).

Application commit `e3f8d06` passes the full Node 26.8.1 gate: 94 production browser tests, two expected mode-specific skips, lint/types/native/server tests and build. Remote CI also passes both alternate modes and the container smoke test. Real hosted licence validation remains pending deployment.

## Next product checkpoint

Use Sean’s existing app to connect a real repository, bulk-place work, arrange/resize it, and reopen the saved board. Prior live sign-in/repository browsing was confirmed; the redesigned flow and GitHub Projects permissions still need live-account verification. Controlled-provider coverage is not evidence of live Projects access.

Sean’s app remains on ports 3001/3002 with `.data/github-debug` and ignored `.env.github-debug`; its process and credentials are preserved. The user-owned launcher `.scratch/github-debug-local.sh` remains untracked. The accepted static prototype is still served at `http://10.0.16.32:3018/proposal.html`; it is not the live GitHub application.

## Retrospective follow-ups

CI enforcement and verified GHCR images are merged in [PR #2](https://github.com/wipash/gitbored/pull/2); see [CI evidence](../desktop-redesign/issues/03-ci-gate.md). CI pins the runtime and isolates authentication modes. Local-runner follow-ups remain queued: [runtime preflight](../desktop-redesign/issues/01-runtime-preflight.md) and [isolated test runs and auth modes](../desktop-redesign/issues/02-isolated-test-runs.md). Safe server failure logging was merged in [PR #1](https://github.com/wipash/gitbored/pull/1). Early live-path and stable visual milestones are recorded in the project guide; editor-lifetime review is in coding conventions.

Remaining UI edge case: [constrained account-error layout](../desktop-redesign/issues/04-constrained-account-error-layout.md). Recovery controls remain reachable, but simultaneous notices can still crowd Incoming at very small/enlarged viewports.

## Preserved work

These older worktrees remain paused and unmerged under `../gitbored-wt/`. The desktop redesign now overlaps details/filters/refresh, so compare the current implementation before reviving older work. Do not merge stale UI wholesale. Preserve concrete unfinished requirements in each ticket.

| Ticket | Branch | Preserved commit |
| --- | --- | --- |
| [07 filters](issues/07-local-filters.md) | `ticket/07-local-filters` | `aa9b8a3` |
| [08 refresh](issues/08-coordinated-refresh.md) | `ticket/08-coordinated-refresh` | `b5df686` |
| [12 JSON portability](issues/12-reference-json-portability.md) | `ticket/12-reference-json-portability` | `7aee65f` |

JSON portability and broader clipboard/schema/performance work remain outside this redesign. Existing upstream comma/window-blur behavior and UI-origin Shift eligibility are documented in README; the panel-rerender release regression is fixed. Screen-reader runtime, RTL, and forced-colors were not exercised. Historical progress is retained in Git; the specification and ticket comments remain the source for unfinished scope.
