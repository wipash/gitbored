# 01: Fail fast on an unsupported check runtime

Status: ready-for-agent
Work state: queued
Blocked by: none

## Evidence

The final gate passed under Node 24 through the Volta pnpm launcher before being repeated under the declared Node 26 runtime.

## Acceptance criteria

- [ ] Add a preflight to the existing check entry point that validates the actual executing Node version against package.json before expensive work starts.
- [ ] Report the executing runtime path/version and an actionable mismatch error; keep machine-specific paths out of committed configuration.
- [ ] Demonstrate rejection under an unsupported runtime and success under the declared runtime, including pnpm child commands.

## Comments

- 2026-11-06 — Recorded from the desktop redesign retrospective. Implementation has not started.
