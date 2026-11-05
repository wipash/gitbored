# 23: Correct the copy-in-flight recovery gate observation

**What to build:** Resolve the observed post-merge recovery assertion without weakening the copy-in-flight retention contract or changing unrelated authentication behavior.

**Blocked by:** 11: Save/conflict recovery (done)

**Status:** ready-for-agent

**Work state:** in-progress

## Acceptance criteria

- [ ] Accept the actual failed gate and retained trace as failing-before evidence; establish whether the second rectangle changed through deferred native delivery or whether the application violated retention. Do not rerun the unchanged failure to confirm it.
- [ ] Correct the cause using existing real-browser/native-observation patterns. Preserve exact complete current-pair retention, unchanged source board, exact captured private-copy contents, and explicit Retry saving the latest completed edit. No sleeps, retries, ignored geometry, timestamp-only normalization or weaker shape-count-only proof.
- [ ] Independently review the affected source and exercise the corrected real browser/public HTTP/SQLite path on an exact frozen candidate. Keep the auth22 application source unchanged unless an independently established auth defect requires explicit reassignment.
- [ ] Pass exact manager pre/no-ff/post canonical gates; preserve the failed006d730 gate as failed evidence. Release owned resources and remove the safely merged worktree/branch before completion.

## Non-goals

No new feature, recovery-storage redesign, SDK patch, auth/environment/configuration change, unrelated UI refresh or replay of user sign-in. Prefer a narrowly scoped observation correction if source and trace establish that application retention is correct.

## Affected shared contracts

RecoveryGateCorrection owns only the smallest recovery test/helper correction established by evidence. Main is already local auth merge006d730e21cce24c73a70203431cb981797a3fed; its postgate is failed, not accepted. Manager owns records/integration. RecoveryGateSource independently reviews the trace, native scheduling and corrected candidate without editing or running checks. Existing06/12 isolated development continues; unrelated merges and new shared production jobs remain held until the auth integration gate clears.

## Comments

- 2026-11-06 — **Project manager, actual failure/priority:** Auth22 candidate715e0bd passed PREbg240 (222.72s, artifact2341) and merged no-ff as006d730e21cce24c73a70203431cb981797a3fed. POSTbg242 failed (184.80s, artifact2349): lint/types/13 native/actual OAuth managed callback-session regression passed; browser72 passed,1 failed,12 did not run,1 complementary skip. Failure at tests/e2e/board-recovery.spec.ts:311: retained second rectangle changed from w91.66668701171875/h70.05206298828125 to w110/h84.21875 and updatedAt advanced24ms after the test captured `latest`. Source polls only two-shape count before capturing. Deferred completion is a hypothesis, not yet a proven diagnosis. Page reports newer work retained and the saved-copy link. Exact failure context/trace remain under test-results/board-recovery-a-real-copy-9dc9b-e-private-copy-is-in-flight-chromium/. The user was told auth fix is available on local main with the whole-app gate caveat; no push/deployment/live-sign-in claim.
- 2026-11-06 — **Project manager, assignment:** RecoveryGateCorrection owns ticket/23-recovery-copy-observation at ../gitbored-wt/23-recovery-copy-observation; use the normal serialized3100/3101 production lock for one final focused afterproof, no mid-flight checks or unchanged-baseline replay. RecoveryGateSource provides independent source/trace review and exact final-candidate acceptance; no runtime resources of its own. Parent remains integrator, not feature coder.
