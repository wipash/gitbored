# 06: Inspect cards through non-modal contextual panels

**What to build:** Card details and workspace controls open beside their triggers while the canvas remains interactive, with a keyboard-accessible list/detail path.

**Blocked by:** 03: Create and reopen private boards, 04: Browse authorized sources and resolve GitHub URLs

**Status:** ready-for-agent

**Work state:** in-review

## Acceptance criteria

- [ ] Anchor details to selected cards and controls to toolbar triggers; direct card switching updates details without close/reopen.
- [ ] Flip/clamp and reposition on resize, scroll and canvas camera movement; keep long content and close controls reachable at 320px and enlarged text.
- [ ] No backdrop, focus trap or inert canvas. Outside dismissal preserves the intended underlying action and panel switching; Incoming drag does not dismiss its source panel.
- [ ] Heading focus on opening, Escape and explicit close dismissal, appropriate focus return, and surviving fallback targets after trigger removal/hiding.
- [ ] Show repository/number, kind, full available metadata, accurate PR states and explicit Open in GitHub; use text rendering rather than provider HTML.
- [ ] Exercise real browser selection, pointer and keyboard behavior, light/dark, loading/error/long-content and viewport-edge states using better-interface.

## Non-goals

No permanent inspector/sidebar or comparison-mode switcher.

## Affected shared contracts

Own contextual panel primitives, details/list composition and workspace-control anchoring; other tickets reuse this panel convention.

## Comments

- 2026-11-05 — Project manager: Published from the accepted specification under the user’s instruction to proceed without a confirmation round. Work starts only when blocking tickets are done.
- 2026-11-06 — **Project manager, claim:** owner **ContextualControls**, branch `ticket/06-contextual-details-controls`, worktree `../gitbored-wt/06-contextual-details-controls`; reserved frontend/backend/provider **3005/3006/3008**.03/04 are done. Parent read the actual05 `IncomingWorkspace` composition and non-modal region convention; start independent contextual/details modules now, without editing05’s unfrozen worktree. Actual05 source checkpoint may be an interim development base; final composition/review rebases onto its checked main integration. Do not fake Incoming, duplicate its controller, copy unfrozen snapshots, or claim runtime acceptance before the real composed flow is exercised.
- 2026-11-06 — **Project manager, shared ownership:**06 extends/reuses05 `.incoming-shell[data-native-ui="incoming"]` and non-modal section/heading/explicit-dismiss/outside-pointer semantics. Preserve05 metadata owner, source callbacks, held-key ownership gate, native history and coordinator lifetime. After05’s stable checkpoint,06 owns contextual extraction/composition in its own branch while retaining the real Incoming behavior. Use better-interface and all owning domain skills, actual light/dark desktop and320px/enlarged-text selection/drag/focus/edge evidence, exact-candidate reviews and separate tracking commits. No future filter/refresh placeholder controls, private-metadata cache copy, per-card network, SDK changes or PROGRESS edits.
- 2026-11-06 — **Project manager, frozen-source review complete; final composition held:** independent ContextualFinalSource examined tracking997c142/feature19aada0 against accepted baseb27dfbe, traced all six acceptance rows and both producer/consumer boundaries, and established no actionable patch-introduced defect. Independently verified60b→19a equality across src/tests/scripts/package/lock and19a→997 tracking-only change. Full actual report read and preserved `/tmp/gitbored06-final-source-review.txt` and `local://06-frozen-source-review.md`. This is source-only preliminary evidence: final integration approval is explicitly WITHHELD until checked21 is released and the actual combined target is examined. Production validator remains held; coherent05+06 Fable is active on immutable997. No build/test/browser result or combined30/30 claim is inferred from this review.
