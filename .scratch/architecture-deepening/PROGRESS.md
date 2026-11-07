# Architecture deepening verification

Starting commit: `0596bbf4f6cde0915f7da4cc87a143d05427b0f1`.
Scope: [spec.md](spec.md). No HTML report or deployment was requested.

## Implemented

- Board metadata and SSO recovery now have one owner; read authority, freshness,
  denial and retry bookkeeping no longer live in the tray.
- Incoming discovery owns source reads and candidate/cursor acceptance, while
  native placement, history and atomic saving remain in IncomingWorkspace.
- Workspace panels own mutual exclusion, initial focus and mobile focus return.
- REST and GraphQL share authorized GitHub read handling.
- Guarded navigation rejects superseded transitions; disposal settles save waits.

## Behavioral evidence

Eight baseline production browser cases passed before edits. New regression
assertions failed on the original behavior for pending-save deletion, Back
superseding an older board link, and opening Boards while the mobile tools menu
remained open. All passed on the first integrated candidate.

The focused production run passed 21 of 22 cases. Its failure exposed missing
Incoming heading focus after reauthorization; the existing scenario passed after
the readiness transition was restored. Independent review then caught initial
focus being suppressed while account checking was blocked. An added assertion
reproduced that issue before correcting the focus gate.

## Independent review

Standards: zero documented violations and zero actionable smell findings across
the initial three commits. The navigation author's standards review of that
portion was self-review; a different agent performed the spec axis.

Spec: two medium findings, blocked-account initial focus and cancellation of a
pending browser traversal during account replacement. Both were reproduced and
fixed; the independent source re-review reports zero remaining findings.
The final focused production run passed all 11 cases, including four navigation
scenarios, all three Incoming authorization scenarios, the board switcher and
desktop/mobile panel continuity. Implementation commit: `906adc3`.

Interface: all six better-interface domains reviewed on the bounded board panels,
Incoming and SSO flow. Eleven rendered screenshots covered desktop and 320px
with 200% root text sizing, light/dark themes, empty Find and expanded SSO.
Browser assertions cover keyboard focus, hit targets and selected text/control
contrast pairs. No screen-reader session, RTL/pseudolocalization, exhaustive
contrast audit, full browser zoom matrix or live GitHub authorization was claimed.

## Final validation

`pnpm gate` passed at implementation commit `906adc3`: warning-free lint and
import checks, all TypeScript configurations, 14 document tests, four server tests,
the production build and 101 browser tests in 4.5 minutes. Its one expected
unconfigured-mode skip was exercised separately with
`E2E_AUTH_MODE=unconfigured pnpm exec playwright test tests/e2e/auth-unconfigured.spec.ts`
against the same production build: one passed in 2.1 seconds. All 120 tests across
the two configurations passed. Existing dependency/build-size warnings remain.

The first full gate was stopped after 27 passing browser cases to incorporate
the review findings; it is not recorded as a passing gate. The final gate above
ran to completion. The final bounded interface review approves `906adc3`, including
both readiness-related focus assertions; the coverage limits above still apply.

Local logs: `/tmp/gitboard-architecture-final-gate.log`,
`/tmp/gitboard-review-fixes.log`, `/tmp/gitboard-architecture-unconfigured.log`.
Screenshot evidence: `/tmp/gitboard-architecture-focused-results/` and the final
gate's `test-results/`. These temporary artifacts are not repository files.
