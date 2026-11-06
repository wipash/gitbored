# Board switcher and route-focus review

Scope: the board heading's route focus and the Boards switcher. Read project coding conventions and applied better-interface plus accessibility, layout, writing, typography, colors and UI skills to this flow only.

## Chosen behavior

Keep programmatic focus on the static board heading when the route opens, preserving the existing accessible route announcement and next-Tab location. Suppress the outline only on `#board-heading`, which has tabindex=-1 and is not an interactive control. Buttons, links, fields and the switcher's close control keep visible keyboard focus. Removing route focus entirely would lose the current accessibility behavior; moving it automatically to the canvas would skip the page heading and change the existing keyboard starting point.

Place the switcher inside the existing fixed board header and position it at 100% + 8px. This anchors to the real header height without a duplicate JavaScript measurement or a second fixed mobile coordinate. Lift the header's stacking level only while the switcher is open. Mobile no longer inherits the unrelated bottom-sheet placement.

Use the existing panel-heading style for Boards and its Close boards button, followed by one scrolling body with a single 16px padding boundary. The header remains outside the scroller. Opening focuses Close boards, then Tab reaches Board name, Create board and the board links. This avoids immediately opening the phone keyboard when the intent is to switch boards. Escape and closing return focus to the Boards trigger. The switcher remains nonmodal.

## Coverage and findings

| Domain | Evidence and scope |
| --- | --- |
| Accessibility | Static route heading focus preserved; native controls retain labels/focus. Close receives focus on open; Escape continues through existing native UI key handling. Live screen reader not run. |
| Layout | Switcher anchored to actual header, mobile bottom inset removed. Single body scroller, header in normal flex flow, no nested page-shell padding. Focused browser checks passed at desktop, mobile and 320px/200% text. |
| Writing | Existing Boards, Close boards, Board name and Create board labels unchanged. No new instructions or terminology. |
| Typography | Existing type scale retained; board names wrap within entries. No fixed text heights. |
| Colors | Existing semantic text/surface/border/focus tokens retained in both themes; declared token contrast calculated below; screenshot color sampling not available. |
| UI | Existing panel header/close control reused. No animation, new icon system or focus trap. |

## Verification

Client TypeScript passes. Focused `board-switcher.spec.ts` exercises route focus without an outline; anchored panel placement at 1440px light, 390px dark and 320px/200% text; keyboard access and hit targets through 13 board links; fixed close control during body scrolling; and Escape focus return. Focused browser run passed: `PATH=/tmp/gitbored-tools:$PATH pnpm test:e2e tests/e2e/board-switcher.spec.ts --output=/tmp/gitbored-switcher-results` (1 test, 2.9s).

No broad gate or unrelated audit run by this agent. Inspected `switcher-1440-top.png`, `switcher-390-top.png`, `switcher-320-top.png` and `switcher-320-scrolled.png` under `/tmp/gitbored-switcher-results/board-switcher-board-switc-86653-rd-reachable-scrolling-list-chromium/`. The header sits beneath the trigger in all three layouts, spacing is consistent, long names wrap, and the last link plus Close remain usable at 320px/200%. Keyboard test confirms every link's hit target stays exposed while tabbing scrolls the body.

Calculated unchanged declared text/surface token ratios: primary 14.94 light / 13.77 dark; secondary 6.35 / 8.20; link/focus 8.03 / 8.80. These are token calculations, not sampled screenshot pixels. Runtime screenshots show the expected opaque surface in both themes. Live screen reader and RTL not tested.

Full-project lint reports only the other agent's currently unfinished `card-layout.spec.ts`; no errors reported for this change. Parent owns the final integrated lint/gate.

Verdict: no remaining actionable findings in this bounded switcher flow.
