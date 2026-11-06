# Mobile card-details zoom and anchoring

Scope: the existing expanded details popup's mobile camera behavior. Applied better-interface and its accessibility, layout, writing, typography, colors and UI owning skills, using the existing project conventions and semantic surfaces. No compact-card implementation, save logic, metadata or menu changes in this slice.

## Reproduction and change

The new focused browser regression first failed against the old implementation: real camera zoom reduced the expanded 420×300 card's screen width while the popup transform remained exactly 1. The old mobile-only fixed-scale choice is superseded.

All viewport widths now use a bounded 0.85–1.25 scale based on canvas zoom. Compute the viewport-fitting base width before scaling, then clamp the physical width to the viewport. Zooming out therefore visibly narrows the phone popup as well as scaling its content. Zooming in is capped when necessary to keep controls inside the screen. This is deliberately bounded scaling, not unlimited one-to-one canvas scale.

On widths <=600px, the popup uses at most 70% of the available vertical space after header and drawing-toolbar clearance. The previous full-height long-body popup had no room to move, so its top was always clamped. Leaving canvas exposed gives the anchor room to follow pan and gives the user space to operate the canvas. The same explicit card id and real shape bounds remain the anchor; normal viewport clamping still applies near edges. Panel content scrolls, its close control remains outside the scroller, and it stays nonmodal.

## Verification and review

- Baseline: `pnpm test:e2e tests/e2e/card-details.spec.ts --grep 'mobile details' --output=/tmp/gitbored-mobile-details-before` failed at the expected mobile scale assertion (actual scale 1).
- After fix: `pnpm test:e2e tests/e2e/card-details.spec.ts --output=/tmp/gitbored-mobile-details-after` passed both tests (6.7s total).
- Regression exercises actual Control-wheel zoom in both directions, Space-drag pan, an expanded card, popup physical width and transform changes, vertical anchor movement with the card, 320px/200% text, reachable Card size control, dismissal and focus return.
- Client TypeScript passes. Separate bounded source review by the cache agent found no concrete blocker in physical/layout dimensions, scale or clamping.
- Inspected mobile-details-zoomed-out.png, mobile-details-zoomed-in.png and mobile-details-enlarged-text.png under the after-run's mobile test directory. Popup shrinks/grows, exposes canvas below, wraps content, and keeps Close within the viewport. The enlarged-text artifact captured the transient Unsaved changes caption immediately after the test resized the card; save behavior is unchanged.

Accessibility: native controls, names, focus return and nonmodal behavior unchanged and covered by existing plus new focused assertions. No animated transition added; scaling is direct response to user camera input. Layout: both zoom directions and pan checked with real screen bounds; 320px and 200% text remain usable. Writing: no copy changes. Typography: bounded scale replaces the fixed mobile scale, preserving existing wrapping and scroll behavior. Colors: no token changes; prior light/dark semantic color measurements remain applicable to the unchanged surfaces. UI: no new chrome or control introduced.

Limits: headless browser at phone dimensions uses genuine mouse/keyboard camera input; physical-device pinch and live screen reader were not tested. No broad review or full gate run by this agent. The parent owns final integrated checks.

Verdict: no remaining actionable findings in the inspected mobile details flow.
