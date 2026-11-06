# Card colours

Work state: in-review

## Decisions for morning review

- Original colours use the native drawing palette and are part of the saved canvas document/history. Existing cards migrate to neutral (`black`).
- Colour-by is a reversible presentation preference, stored per account and board in this browser. It never overwrites the saved original colour.
- Status uses the mapped project status when available, otherwise GitHub state. Priority uses the mapped project priority, or a clearly named “No priority” category.
- Labels divide the top edge equally between all labels; the first label also supplies the subtle card tint. No arbitrary label-count cap.
- Type distinguishes Pull request and Issue, with Bug and Feature inferred from issue labels (`bug`, `feature`, `enhancement`, including common prefixes). No new provider schema or GitHub write behavior.
- Defaults are deterministic and editable through Settings → Card colours → Edit category colours. Colour alone never replaces the written status/type/label.

## Scope and coverage

Reviewed the colour controls, native palette integration, card accents and project category values using React/tldraw, existing CSS tokens and the repo's coding conventions. Loaded better-interface plus all six owning skills. Broader workspace chrome remains the menu/popup agents' scope.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | Native labelled select/color inputs, keyboard focus, written category values, existing focus ring, native colour picker | Clear within scope; actual screen-reader speech not verified |
| Layout | Light/dark screenshots at 1440×900; Settings at 320×740 and enlarged text | Colour controls reachable, no document horizontal overflow; overlapping narrow footer reported to menu owner |
| Writing | Off restores originals; project-field and label-split help; storage failure recovery message | Clear |
| Typography | Wrapping category names and existing card detail access, named controls, inherited theme type | Corrected inherited title capitalization and squeezed label grid |
| Colors | Light/dark rendered tint and badges; worst possible 8% tint with existing muted text computes 5.31:1 light, 6.44:1 dark | Clear; category accent never carries text contrast responsibility |
| UI | Native controls, no new motion, contained colour-list scrolling, existing theme surfaces | Clear |

## Findings addressed

- Browser regression test caught stylesheet ordering hiding the card tint. Scoped card selector now wins and computed background changes with overlay mode.
- Narrow rendering exposed label grid/capitalization collisions with the settings rule; scoped selectors corrected.
- Menu owner notified of the existing bottom account/theme bar overlapping the expanded Settings panel at 320px.

## Verification

- `pnpm test:workspace`: 14 passed, including old-schema neutral migration, colour persistence and clipboard round trips.
- `pnpm type-check`: passed.
- `pnpm lint`: passed.
- `pnpm test:e2e tests/e2e/card-colours.spec.ts`: passed. Exercises native blue picker, computed tint, status/priority/split-label overlays, editable state colours, default Feature/Bug controls, off restoring exact original rendering, database document preservation, reload persistence, both themes, 320px controls and 200% text.
- Screenshots inspected: `/tmp/gitbored-card-colours-light.png`, `/tmp/gitbored-card-colours-dark.png`, `/tmp/gitbored-card-colours-narrow.png`.
- Not verified: live GitHub, screen-reader speech, RTL and browser zoom (enlarged text was checked).

## Verdict

Approve colour behavior and reviewed domains after scoped CSS correction; narrow shell overlap handed to menu owner for integration.
