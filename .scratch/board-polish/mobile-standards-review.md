# Bounded review: mobile Settings and recovery stacking

Reviewed the mobile canvas stacking rule in `src/client/mobile.css`, panel focus return in `focusPanelTrigger.ts`, Menu/Settings behavior in `WorkspacePanels.tsx`, and Escape handling in `useNativeUiKeys.ts` against the existing coding conventions. Scope is the reported mobile menu/account migration and the demonstrated recovery-notice overlap; no unrelated cleanup requested.

No concrete remaining findings in this scope. The canvas layer rises only while a mobile menu or workspace panel is open, leaving the header accessible and restoring save notices when the panel closes. This changes presentation without replacing the editor, moving canvas geometry, or introducing a focus trap. Closing a collapsed action's panel returns focus to the visible Menu button. The existing non-modal interaction and session authority boundaries remain intact.

Verification: 10 targeted browser tests passed, covering same-user rotation, temporary sign-out, dirty Sign out/Stay, pending account changes, editor lifetime, explicit save retry, Incoming privacy, and account-recovery control hit targets. The previously failing recovery hit-target check passes. Inspected the corrected 320px/200%-text recovery screenshot under `/tmp/gitbored-mobile-recovery-results`.

Command: `CONTROLLED_SESSION_SECONDS=900 pnpm test:e2e tests/e2e/board-session.spec.ts tests/e2e/incoming-session.spec.ts tests/e2e/desktop-redesign.spec.ts --grep 'session rotation|reconciliation|different account|account switch|queued during|dirty Sign out|Incoming placements|confirmed Bob|account recovery messages' --output=/tmp/gitbored-mobile-recovery-results`.

Verdict: Approve this bounded scope. Root owns the new mobile-menu checks and final integration gate.
