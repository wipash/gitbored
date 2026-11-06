# Save-status continuity audit

Scope: routine and attention-requiring save status, its existing recovery actions, and the board-title text. Read `docs/CODING-CONVENTIONS.md` and `better-interface` plus the six owning skills: accessibility, layout, writing, typography, colors and UI. This is a bounded implementation review of this flow; the parent owns the broader menus and toolbars audit.

## Findings and changes

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| Low | `src/client/boards/boards.css:18` | Successful autosave leaves a permanent success label; saving/unsaved share attention styling with failures. | Routine Saved is visually hidden while the stable accessible status remains. Saving/unsaved have a compact neutral caption. Failures/conflicts retain the clear notice and action buttons. | Implements the requested quieter save indicator without obscuring unresolved work. |

The status remains visible when it receives focus after a successful keyboard Retry save; hiding focused content would lose the visible focus location. The tiny solid surface beneath transient saving text prevents arbitrary canvas/card colors from reducing contrast. No save, retry, copy, conflict, recovery, session or navigation logic changed. Existing `.board-save`, `data-save-state`, status text, status focus target, and recovery controls remain available.

The title receives a native tooltip for pointer access to truncated text. Keyboard users can read the complete title in the existing Settings board-name input; the heading's accessible text also remains complete. No new title popover was introduced.

## Domain coverage

| Domain | Evidence and limits |
| --- | --- |
| Accessibility | Stable `role=status` preserved; visually clipped rather than hidden from accessibility tree. `:focus-within` restores visible status after Retry. Existing native recovery buttons and destructive confirmation retained. Live screen reader not run. |
| Layout | Routine saved removes its flow footprint. Existing notice placement near title remains; controls wrap and carry no fixed text height. Desktop, 320px and enlarged text runtime verification pending coordinated browser run. |
| Writing | Existing explicit save and recovery messages unchanged. No state is described as successful before acknowledgement. |
| Typography | Existing caption density retained at 0.6875rem; attention messages use 0.8125rem with unitless 1.5 line height. Text wraps, source order unchanged. |
| Colors | Existing semantic secondary text/surface reused; error semantics unchanged. Runtime contrast measurement pending preview. |
| UI | No animation, new icon, transient timer, or additional control. Borderless routine caption uses the established surface; failures keep bounded bordered notice. |

## Verification

Client TypeScript passes: `PATH=/tmp/gitbored-tools:$PATH pnpm exec tsc -p tsconfig.client.json`.

Runtime audit not yet complete. Parent coordinates preview and focused browser queue; no independent browser server started. Existing save failure/delay/conflict test asserts retry focus on status and is the intended regression coverage.
