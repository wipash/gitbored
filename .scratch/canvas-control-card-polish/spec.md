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
