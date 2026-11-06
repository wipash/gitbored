# 04: Keep Incoming and recovery notices usable in constrained viewports

Status: ready-for-agent
Work state: queued
Blocked by: none

## Evidence

The follow-up correction review found that a paused canvas save plus an account error leaves too little room for Incoming at 640×400, or 320×800 with 200% text. The earlier layout already had a zero-height list and overlapping messages; the new clearance calculation can shrink the panel to 0px or 52px. See [correction review](../reviews/followup-corrections.md), findings 1–2 and screenshots 61/63 in its evidence directory.

The separate regression where the save notice covered Check account is fixed in `aa5476c`, with a failing-before/passing-after browser hit-target test. Account recovery remains reachable. This ticket covers the older simultaneous-panel layout limitation, including its changed failure mode, not a new permissions or persistence feature.

## Acceptance criteria

- [ ] Force a board save to return 401 while the session check reports signed-out, with Incoming open; verify the real paused-save notice and account-recovery controls together.
- [ ] Keep account recovery, panel dismissal, and any available Incoming controls reachable at desktop, 640×400, and 320×800 with enlarged text. If space is insufficient, use an explicit panel-priority/scrolling arrangement rather than shrinking an open panel to zero or simply covering its actions.
- [ ] Recover the same account and explicitly retry the save without losing cards, Incoming selection, filters, or history.
- [ ] Cover light/dark, keyboard focus, actual pointer hit targets, and window resizing while the panels are open.

## Comments

- 2026-11-06 — Recorded from the bounded desktop follow-up review. Normal-state Incoming/footer collisions and the account-recovery stacking regression are corrected; the constrained simultaneous-error layout needs a separate coherent change.
