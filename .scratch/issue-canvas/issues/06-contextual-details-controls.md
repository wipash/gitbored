# 06: Inspect cards through non-modal contextual panels

**What to build:** Card details and workspace controls open beside their triggers while the canvas remains interactive, with a keyboard-accessible list/detail path.

**Blocked by:** 03: Create and reopen private boards, 04: Browse authorized sources and resolve GitHub URLs

**Status:** ready-for-agent

**Work state:** queued

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
