# Mobile menu review

Scope: the supplied phone screenshot, phone menu placement, and account/theme migration into Settings. React/tldraw and the existing semantic CSS remain in use. Applied better-interface and its six owning skills to this flow, using the coding conventions and user request as the design boundary.

| Domain | Evidence | Result |
| --- | --- | --- |
| Accessibility | Touch targets, keyboard Escape, visible focus return to Menu, labelled account/theme controls | Passed focused interactions; screen-reader audio not verified |
| Layout | Actual 390px, 320px and landscape screenshots; 100%/200% text; panel hit tests | Compact header, bounded panels and unobstructed controls; corrected recovery-notice stacking |
| Writing | Menu, Settings, original auth/recovery actions | Existing terms retained; no separate account page or bottom bar |
| Typography | Enlarged text, long account/recovery content, scrollable settings | Menu uses a labelled icon to avoid enlarged-text overflow; native fields remain readable |
| Colors | Existing light/dark tokens, inspected dark Settings and light canvas | No new color roles; no new text contrast pairs introduced |
| UI | Non-modal panels, contained scrolling, drawing toolbar clearance, no animations | Passed; canvas lifetime preserved by existing session/keyboard tests |

The canvas dot grid coarsens when zoomed far out instead of forming a dense dotted block. Mobile Menu presents the existing actions and opens panels above the drawing toolbar. Account recovery opens Settings only for actual blocked/error states, preserving successful session reconciliation.

Focused evidence: new touch test passed for menu/panel placement, absence of account controls outside Settings, theme change, close/focus paths, portrait and landscape layouts, and enlarged text. Existing adapted tests: 20 passed; 10 targeted session/recovery/authority cases passed after the stacking correction. Screenshots were inspected under `/tmp/gitbored-mobile-layout-results` and `/tmp/gitbored-mobile-recovery-results`.

The previous main-branch publication was blocked by a flaky popup zoom test: its fixed wheel point could fall over the popup and modifier release preceded observable zoom. The test now verifies the point is native canvas, retains Control until zoom renders and requires a meaningful size change. It passed three consecutive focused runs. All original adjacency assertions remain.

No outstanding findings in the inspected scope. Full integrated gate and hosted CI follow. Screen-reader audio, real-device OS keyboards and live GitHub OAuth are not claimed by this controlled-browser review.
