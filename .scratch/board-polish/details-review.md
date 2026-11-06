# Card details interface review

Scope: selected-card details in the React/tldraw workspace; desktop and 320px with 200% root text. Existing semantic light/dark CSS and coding conventions apply. All six better-interface domain skills loaded; this is a bounded flow review.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | card-details.spec.ts: Find selection, direct switching, Escape, focus return, clickable narrow close | Clear for tested keyboard/pointer paths; screen-reader audio not verified |
| Layout | useCardDetailPosition.ts; desktop and narrow screenshots; real pan/zoom, viewport resizing | Fixed left-edge placement and narrow chrome overlap; no remaining finding |
| Writing | Existing Card details, Close details, unavailable recovery copy | Clear |
| Typography | Long fixture title and labels wrap/scroll in actual desktop/narrow rendering | Clear |
| Colors | Existing workspace surface/text tokens preserved; screenshot inspected | No new colour pair introduced; exhaustive contrast audit excluded |
| UI polish | Non-modal panel, contained scroll, no animation, fixed readable size | Clear |

Before: focused browser test failed its card-adjacency assertion by 206px. After: `PATH=/tmp/gitbored-tools:$PATH pnpm test:e2e tests/e2e/card-details.spec.ts --output=/tmp/gitbored-detail-results` passed on Node 26.8.1. Actual pointer pan and wheel zoom retain the selected card; panel follows its screen geometry. Close restores canvas focus. Edge placement clears existing workspace chrome.

Approve for inspected scope. Live GitHub and screen-reader audio were not part of this check. Narrow header overlap is separately handled by the menu implementation.
