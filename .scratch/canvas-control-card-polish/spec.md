# Canvas controls and card metadata

## Plan

1. Reuse tldraw's navigation and action components in a shared floating layout. Match the drawing toolbar's theme, surface, radius and baseline. Remove SDK corner backplates that assume a different canvas background. Account for the expanded minimap and narrow viewports.
2. Anchor labels and planning metadata above each card's footer. Reserve the label row even when empty, keeping fields aligned across cards of the same size.
3. Make Status, Weight, Priority and Sprint names visible. Replace empty dashes with “Not set”; distinguish unmapped, loading and unavailable data. Apply category colours only to actual values, preserving a weight of zero.
4. Keep card geometry stable. Reserve room for field headings by showing two whole title lines at the default compact size, one at minimum size, and more on expanded cards. Keep full titles and values available through the keyboard-accessible details panel.
5. Reproduce the failures with browser regressions, inspect light/dark and narrow/enlarged-text rendering, then run the repository gate.
6. Follow-up: remove selection-like outlines on initial page load. Keep programmatic heading focus for announcements and tldraw autofocus for native keyboard behavior. Omit outlines on noninteractive route headings, and show the canvas focus ring after keyboard interaction rather than startup or pointer focus. Preserve existing focus indicators on interactive controls.

## Scope

React + tldraw and existing semantic CSS tokens. No new dependencies. Applies to bottom-left canvas controls, card metadata and its existing details presentation.

## Follow-up: mobile action toolbar

The 320px PR screenshot exposed a missed responsive state: tldraw relocates the action shortcuts from the menu zone to `tlui-main-toolbar__extras__controls`. Match that container to the drawing toolbar too. Both placements use the panel token and native row/button sizing; the mobile rows share a leading edge and icon centre, have equal heights, and have 12px of canvas between them. Preserve native toolbar relocation, keyboard navigation and menu behavior. Replace the PR's mobile evidence with light and dark screenshots of the corrected state.

## Follow-up: selected-card colour panel

Keep the native colour/opacity panel clear of the top application controls. The existing `top: 60px` has no effect on tldraw's static flex container. Measure the visible header/tool controls and reserve a 12px gap below them; update clearance on control resizing and viewport changes without React state or editor remounts. Preserve the native phone style popover. Verify every colour swatch is hit-testable, both themes, enlarged text, keyboard colour selection and mobile opacity adjustment, and attach a selected-card screenshot to the PR.
