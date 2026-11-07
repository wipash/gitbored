# Deepen board coordination modules

The user requested a scan of all high- and medium-value architecture improvement
opportunities and coordinated implementation, replacing the initial HTML report.
Starting point: `0596bbf4f6cde0915f7da4cc87a143d05427b0f1`.

## Scope

1. High value: concentrate board metadata bootstrap, hydration, freshness,
   authority rejection, scoped denial and SSO recovery in one module. Callers
   must not interpret SSO key strings or maintain refresh/denial sets.
2. Medium value: concentrate Incoming discovery request lifetime, source identity,
   filtering, deduplication, queue acceptance and cursor progress. The tray invokes
   operations; the native board owner still commits document and Incoming together.
3. Medium value: deepen workspace panel lifecycle to own exclusive opening,
   mobile menu arbitration, initial focus and focus return. Keep specialized card
   details positioning and the document-lifetime native keyboard owner.
4. Medium value: use the same authorized GitHub read implementation for REST and
   GraphQL, retaining context-specific SSO owner attribution and existing resource
   validation, freshness rules and SQLite transactions.
5. Medium value: unify guarded link/history navigation, reject superseded
   completions and settle pending save-drain decisions when their board ends.

## Preserve

- One native editor/history lifetime through metadata, panels and same-user changes.
- Private fetched metadata remains outside persisted canvas and Incoming data.
- Account changes reject stale reads; denial and transient failure stay distinct.
- Initial cached cards load together; refresh retains stale content where allowed.
- Incoming placement/history and recovery remain durable and revision-aware.
- Existing desktop/mobile layouts, labels, themes and keyboard alternatives.
- Tests cross the running browser/public HTTP seam with real persistence and the
  controlled GitHub HTTP adapter. No fake editor or internal orchestration tests.

## Verification

Run focused production browser checks, the full `pnpm gate`, and independent
standards/spec review. Inspect rendered panel and recovery states using the
better-interface skills. Add behavioral regression coverage where the scan
reproduces failures; use existing coverage for behavior-preserving deepening.

No generic provider/editor framework, replacement history model, cosmetic file
splits, deployment or push is in scope. SaveCoordinator, RecoveryStore, authentication,
shared validators and stored/live copy flows retain their existing responsibilities.
