# 03: Run the existing gate automatically in CI

Status: ready-for-agent
Work state: queued
Blocked by: 01, 02

## Evidence

The repository has lint/type/test commands but no checked-in CI workflow or active Git hook enforcing them.

## Acceptance criteria

- [ ] Add CI using the declared runtime/package-manager versions and frozen dependency installation.
- [ ] Run the existing gate and both alternate authentication modes through the supported runner; fail CI when a required check fails.
- [ ] Use only invented controlled-provider data, without personal GitHub credentials; preserve failure diagnostics as artifacts.
- [ ] Validate workflow configuration locally and report actual remote execution separately. Adding the workflow does not itself authorize a push.

## Comments

- 2026-11-06 — Recorded from the desktop redesign retrospective. Implementation has not started.
