# 02: Isolate test resources and expose authentication modes

Status: ready-for-agent
Work state: queued
Blocked by: none

## Evidence

A preview occupied the diagnostics port; simultaneous browser runs shared artifacts and failed with ENOENT. Long flows also required a session-duration override.

## Acceptance criteria

- [ ] Extend the existing runner with explicit ordinary, session-expiry and unconfigured modes; include all three in the supported validation flow.
- [ ] Assign per-run artifact directories and coordinate test/preview ports, including diagnostics and controlled OAuth callbacks. Preserve the existing production build lock.
- [ ] Demonstrate that overlapping runs queue or use isolated resources without deleting another run’s artifacts, and never stop a user-owned process.
- [ ] Print a concise outcome and artifact path; ensure each authentication mode executes its intended assertions.

## Comments

- 2026-11-06 — Recorded from the desktop redesign retrospective. Implementation has not started.
