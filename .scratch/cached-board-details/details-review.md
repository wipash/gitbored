# Explicit card details review

Scope: card details opening, body content, anchored position and bounded zoom, and card refresh indicator. Applied better-interface plus accessibility, layout, writing, typography, colors and UI owning skills to this flow only. Conventions: docs/CODING-CONVENTIONS.md; existing Atlas + Contextual semantic tokens and native controls. No new dependencies.

## Choices to check with Sean

- Details opens from a native Card details button (or explicit related-item action). Selecting a shape never opens it. Find selects/centres and dismisses an old popup so it cannot cover the new card's control.
- Popup follows the explicitly inspected card, not incidental canvas selection. It scales from 1 to 1.25 with desktop canvas zoom; at widths <=600px it stays at 1 to keep text and controls usable. Zooming out never shrinks it below its normal text size.
- Description uses escaped plain text with preserved newlines. Markdown syntax remains visible; no raw HTML executes. Empty bodies say “No description provided.”
- Refreshing metadata shows a small labelled corner icon; reduced motion leaves the icon static. Stale text is suppressed while refreshing and returns after a failed refresh.

## Bounded review

| Domain | Evidence |
| --- | --- |
| Accessibility | Native button, accessible name and expanded state; explicit open focuses Close details, Escape closes and returns focus to the card; no focus trap. Keyboard activation and focus return checked in browser regression. Live screen reader not run. |
| Layout | Existing camera/shape geometry anchor retained, explicit id replaces selected id; scaled panel dimensions bounded to viewport with toolbar clearance. Browser checks cover pan, zoom, 320px width and enlarged text. |
| Writing | Card details, Close details, Refreshing card, empty description all name the action or current condition directly. Existing unavailable/loading recovery messages retained. |
| Typography | Body preserves paragraph/newline spacing with pre-wrap, wraps long content, and remains selectable. Existing semantic type sizes and scrollable panel body retained. |
| Colors | Existing light/dark semantic text, surface, border and focus tokens reused; no new palette. State has accessible label and icon rather than color alone. |
| UI | Existing icon system, border and spacing reused; spinner has reduced-motion override. No modal backdrop, canvas remains operable. |

## Verification

- Client TypeScript passes.
- `PATH=/tmp/gitbored-tools:$PATH pnpm lint` passes with the complete project configuration; passing client typecheck also repeated after integration.
- `PATH=/tmp/gitbored-tools:$PATH pnpm test:e2e tests/e2e/card-details.spec.ts --output=/tmp/gitbored-explicit-details-final` passes (1 test, 3.5s). Covers ordinary selection/Find not opening details, explicit keyboard opening, escaped malicious-looking body text, pan, bounded zoom scaling, switching, Escape focus return, 320px with 200% text, reachable card-size controls and reopening from the card button.
- Inspected `anchored-details-desktop.png`, `anchored-details-dark.png`, `anchored-details-narrow.png` under the test output's card-details directory. Long title/body scroll inside the panel; header close remains reachable. Small Save overlap found in narrow screenshot was fixed by including board notices in top clearance and rechecked in the final screenshot.
- Browser spinner/background-cache failure coverage belongs to the coordinated cache regression, not this details-only test. Live screen reader and live GitHub body contents not tested.

Verdict: no remaining actionable findings in the inspected details flow. Existing loading/unavailable copy is unchanged; cache refresh and authority coverage is reported separately by the root and cache-test agent.
- Earlier test failures were bounded: Space was correctly owned by the newly focused card button, an old fixture selector assumed #2 was an issue, and an existing popup covered a Find-centred card. Test now focuses canvas for pan; selector accepts its actual kind; Find dismisses the old popup.
