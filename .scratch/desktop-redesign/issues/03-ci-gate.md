# 03: Run the existing gate automatically in CI

Status: ready-for-agent
Work state: in-review
Blocked by: none

## Evidence

The repository has lint/type/test commands but no checked-in CI workflow or active Git hook enforcing them.

## Acceptance criteria

- [x] Add CI using the declared runtime/package-manager versions and frozen dependency installation.
- [x] Run the existing gate and both alternate authentication modes through the supported runner; fail CI when a required check fails.
- [x] Use only invented controlled-provider data, without personal GitHub credentials; preserve failure diagnostics as artifacts.
- [x] Validate workflow configuration locally and report actual remote execution separately. Adding the workflow does not itself authorize a push.

## Comments

- 2026-11-06 — Recorded from the desktop redesign retrospective. Implementation has not started.
- 2026-11-06 — Implemented in [PR #2](https://github.com/wipash/gitbored/pull/2) at Sean's request, including tested-image publication to GHCR after successful main checks. CI asserts both direct and pnpm Node versions and isolates authentication modes in separate runners; local-runner improvements in 01/02 remain follow-ups rather than blockers. Local gate, image smoke, actionlint and independent review passed. Remote execution caught an Account heading overflow and an invalid unchanged-state expectation while automatic Incoming discovery was running; both are corrected. The unfinished-import durability test retains exact cursor/queue/history/document assertions through real HTTP and SQLite restart, with browser reopening covered by the separate discovery scenario. All seven focused Incoming tests pass. Final remote checks and image smoke are tracked on the PR; publication awaits merge.
