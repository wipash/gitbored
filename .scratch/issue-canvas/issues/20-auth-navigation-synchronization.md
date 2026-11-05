# 20: Wait for completed logout before signing in again

**What to build:** The application acceptance scenario follows the visible signed-out state before beginning a new authorization, so its own navigation cannot race logout's account-clearing navigation.

**Blocked by:** None (can start immediately; corrective work for ticket 01 integration).

**Status:** ready-for-agent

**Work state:** in-progress

## Acceptance criteria

- [ ] Preserve actual full-page logout and privacy clearing; do not add sleeps, retries, or suppress navigation errors.
- [ ] Synchronize on the observable signed-out sign-in control before the scenario starts a second sign-in, following the existing neighboring acceptance convention.
- [ ] Run the affected public browser scenario, then the full gate before and after integration; preserve the reported failing post-merge evidence.

## Non-goals

No application behavior change, authentication redesign, test-only production hook, or silent rerun of the known failing gate.

## Affected shared contracts

Existing full-page logout lifecycle and browser acceptance synchronization; no exported contract changes.

## Comments

- 2026-11-06 — Project manager: Claimed as a one-line integration correction on `ticket/20-auth-navigation-synchronization`, worktree `../gitbored-wt/20-auth-navigation-synchronization`. Ticket 01 merged as `b7fb944809df7fd35e5939db8dfa34998ede36fe`; post-merge Node-26 gate failed with 13 passed / 1 failed / 1 complementary skip. The refresh-expiry scenario clicked Sign out and immediately called the helper that navigates to the same URL; all other logout/re-sign-in paths await the signed-out link. No reproduction rerun is needed; the captured failure is ground truth. Further integration is paused until corrected.
