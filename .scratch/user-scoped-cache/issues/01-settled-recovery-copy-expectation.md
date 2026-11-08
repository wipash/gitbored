# Investigate the recovery-copy test's unsettled geometry expectation

Status: needs-triage
Work state: queued
Blocked by: none

During the per-user GitHub cache implementation, the integrated browser suite failed
`tests/e2e/board-recovery.spec.ts:666` in "copied recovery receipts follow only the
exact retained writer pair and live changes invalidate its badge".

The copied document had the completed rectangle dimensions `w: 110, h: 85`; the
expected local envelope contained `w: 91.66668701171875, h: 70.83332824707031`.
The test waits for two shapes before capturing `newer`, which does not establish
that the second native gesture has delivered its final geometry. This test and the
recovery implementation were unchanged by the cache work.

Three isolated runs of this test on pre-change commit `74b37fc` passed. The failure
has therefore not been reproduced on the baseline; its relationship to suite
timing remains unconfirmed. Initial integrated output is retained at
`/tmp/gitbored-user-cache-final-gate.log`.

Bounded follow-up: reproduce under the integrated suite's timing, then make the
expected envelope wait for completion of the real gesture if that is the cause.
Keep the full copied-document, Incoming state and receipt assertions. Do not mask
the failure with retries, sleeps or weaker comparisons, or change application
recovery behavior without evidence of an application defect.

## Comments

The same test passed in the final integrated browser run on `14d664d`, without a
change to the test or recovery implementation. Retain this as an intermittent
test-timing investigation, not a confirmed recovery defect.
