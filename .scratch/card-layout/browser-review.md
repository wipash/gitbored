# Card title layout review

Scope: compact 280×200, minimum 220×180, and expanded 420×300 cards with short PR, medium Feature, and long Bug titles; labels, four project fields, assignees and footer actions. React/tldraw, existing workspace styles and theme tokens. Followed CODING-CONVENTIONS and better-interface with its six owning domains. No audit of unrelated application surfaces.

## Comparison

Real controlled-provider fixtures and public board APIs produced three browser screenshots in `/tmp/gitbored-card-prototypes-2/card-layout-compare-compac-651ff--changing-document-geometry-chromium/`:

- `cards-baseline.png`: compact Bug/Feature cards have less than a whole title line because subtype and two-row project fields consume the fixed height. Expanded long title also ends on a partial line.
- `cards-A-inline-project.png`: three whole title lines, inline project values, separate assignee/action footer. Recommended because it preserves useful scanning information and the existing default geometry.
- `cards-B-footer-labels.png`: labels and actions share the bottom row; assignees are removed. Fits, but loses information and separates labels from the title with unused vertical space. Rejected in favour of A.

Prototype CSS was injected temporarily in the browser, then removed. Production regression tests use only the real implementation.

## Findings and validation

| Severity | Finding | Evidence | Result |
| --- | --- | --- | --- |
| High | Metadata crowded the title into a partial line. | `src/client/workspace/workspace.css:71` and baseline screenshot; title previously flexed down while subtype/project rows consumed fixed card height. | Root reserved whole title lines, moved subtype into heading and compact project values into one row. Desktop regression passed with short/medium/long content and unchanged saved geometry. |
| High | At 320px and 200% root text, footer controls were clipped outside the fixed card. | `/tmp/gitbored-card-layout-final-2/card-layout-compact-card-c-0a17e-vailable-on-narrow-canvases-chromium/cards-320-dark-before-hit.png`; related-action hit test failed after polling. | `src/client/workspace/ItemCardShapeUtil.tsx:14` assumed a 21px line while `workspace.css:81` used rem sizing. Root added height-container adaptations that retain enlarged text, two full title lines, and footer controls; secondary metadata remains in explicit details. A follow-up found 2.59px of related-button overflow (33px line box), corrected with line-height 1 for that enlarged footer. Final hit checks pass. |

Desktop assertions exercise keyboard details opening, full title access, focus return, native related-action click, external GitHub popup, readable short bug label, whole line boundaries, no internal title scrolling, and saved shape records unchanged after hydration. Mobile uses Find to centre a compact card and checks actual pointer hit targets. 390px normal text passed before the 200% failure.

## Domain coverage

| Domain | Evidence / limits |
| --- | --- |
| Accessibility | Named native controls; keyboard details + focus return; real footer clicks; hit testing at narrow sizes. Screen reader speech and touch hardware not verified. |
| Layout | Comparison screenshots, fixed geometry, compact/minimum/expanded cards, desktop and 390px. 320px/200% final screenshots and hit tests pass without horizontal document overflow; 28px title text remains enlarged. RTL not verified. |
| Writing | Existing Issue/Pull request, Bug/Feature, Open/Merged wording preserved; full long titles accessible in details, field labels retained semantically. |
| Typography | Rendered line rectangles cannot intersect the clipping edge; title height is whole line-height multiples; overflow hidden rather than inner scrolling. |
| Colors | Both existing light/dark surfaces inspected; type/status labels preserve meaning beyond colour. No colour token changed; contrast ratios not remeasured for this layout-only slice. |
| UI | Shared card controls remain aligned within compact/minimum bounds; no new animation; browser suite runs reduced motion. |

## Final verification

`PATH=/tmp/gitbored-tools:$PATH CONTROLLED_SESSION_SECONDS=900 pnpm test:e2e tests/e2e/card-layout.spec.ts --output=/tmp/gitbored-card-layout-final-4` — **2 passed (6.6s)**. Type-check passed during implementation; root owns the integrated full gate.

Final screenshots inspected:
- `/tmp/gitbored-card-layout-final-4/card-layout-compact-titles-b0737-hout-growing-hydrated-cards-chromium/cards-desktop-light.png` and `cards-desktop-dark.png`
- `/tmp/gitbored-card-layout-final-4/card-layout-compact-card-c-0a17e-vailable-on-narrow-canvases-chromium/cards-390-light.png` and `cards-320-dark.png`

The current test records control rectangles/hit elements in trace attachments for reproducible failures. No fixed geometry was enlarged by metadata hydration or by text-size adaptation.

Verdict: **Approve for the scoped card layout**. The two observed clipping failures are corrected; screen-reader speech, RTL, and live GitHub remain unverified. Mobile details placement at non-default canvas zoom is a separate assignment owned by the menus agent.
