# Design critique: board colour controls (Colour by switcher and Colours palette)

Reviewed on 2026-11-09 against the eight supplied screenshots, `src/client/workspace/cardColours.tsx`, `cardColours.css`, the shared rules in `chrome.css`, and extra captures from the isolated fixture preview on port 3118 (Off/Status/Priority/Labels/Type palettes, hover, keyboard focus via real Tab presses, 1100px, 960px, 320px and 390px at 100% text). Behaviour claims below are limited to what the seven browser tests cover or what I saw directly.

## Verdict

Ship it. There are no blockers. The one-click requirement is met well: six always-visible native radios styled as a segmented control, arrow keys move between them, a real focus ring shows on Tab, and the palette updates in place when the mode changes. The problems I found are small and all have small fixes. I would make items 1 to 3 below before merging because they take minutes, and treat the rest as follow-ups.

## What works

- Mode switching is one click and one keypress, with the selected segment distinguished by background, border and weight rather than colour alone.
- The palette is a true legend for the current mode: its heading names the mode, the values listed are the ones on the board plus the standard ones, and the swatches are the editors. "Reset these colours" scoped to the current mode is the right scope.
- Status help text explains the project-status fallback and the Cancelled mapping in one sentence. That is the right amount of text.
- Off mode with the palette open explains itself instead of showing an empty key.
- Accessibility basics are in place: fieldset and legend, native radios, `aria-expanded` and `aria-controls` on the trigger, a labelled region, a labelled close button, per-swatch accessible names, 44px targets at narrow widths, and a `role="status"` region for the storage warning. Measured text contrast of the unselected segments is 5.6:1 in light and 7.1:1 in dark, and the legend uses the same colour, so all pass AA at 13px.
- The mobile menu keeps the switcher visible without a nested dropdown, and the palette becomes a bottom-anchored sheet at 320px with the Reset button reachable by scrolling.
- RTL at 1000px keeps the panel inside the toolbar bounds and mirrors the switcher order.

## Concrete usability problems

Ordered by how much they matter to a user. Each has the smallest fix I would accept.

### 1. Priority mode with no project selected gives a uniform board and a key with one entry, with no explanation

With no project chosen in Settings every card gets the "No priority" value, so selecting Priority turns every card the same colour, and the key shows a single row, "No priority". There is no help sentence in Priority mode (the `help` string is `null` for that category), so the user has nothing that tells them to pick a project. Status mode has the equivalent sentence and reads fine.

A second, related problem: the default colour for "No priority" comes from the hash fallback and lands on the same purple used for Merged (Status mode) and Pull request (Type mode). A board of cards with no priority looks identical to a board of merged pull requests. "Cancelled" and "Draft" already default to the neutral grey `#87929e`, which is the right treatment for "no value".

Fix: add a help sentence for Priority, in the same register as the Status one, for example "Uses the project priority field chosen in Settings. Cards without one show as No priority." Add `'priority:no priority': '#87929e'` to `defaults` so absence reads as neutral.

### 2. The switcher reflows the toolbar on every click

The selected segment is set to weight 650, so its label gets wider. I measured the segment group at 373.7px to 376.6px depending on which mode is selected, and the Colours, Settings and Find buttons slide by 1 to 3px with each click. On the most common operation in the toolbar, the thing the user just clicked near moves under the pointer.

Fix: reserve the bold width. Either drop the weight change (background plus border plus underline already mark the selection) or render a hidden bold copy of the label to size the segment, for example a `::after` with `content: attr(data-label)`, `font-weight: 650`, `height: 0`, `visibility: hidden`, `display: block`. Equal-width segments would also work but make "Off" oddly wide next to "Assignee".

### 3. Between roughly 900px and 1000px the Colours trigger wraps onto a row of its own

The toolbar's max width is `calc(100vw - min(40vw, 420px) - 36px)`, which is 540px at 960px wide. The legend, switcher and trigger together need about 555px, so the trigger alone drops to row two and the remaining buttons go to row three. The 960px capture and the supplied RTL screenshot at 1000px both show this three-row bar with an orphaned "Colours" line. At 1100px and above the bar is two tidy rows.

Fix: below about 1000px, visually hide the "Colour by" legend (keep it in the accessibility tree; it is the fieldset's name) which frees about 80px, or let the trigger wrap together with the switcher as one unit. I would not reduce the segment padding to buy the space; the targets are the right size.

### 4. "Colours" next to "Colour by" does not say what it opens

Two adjacent controls begin with "Colour". The trigger is a plain text button with a chevron, equidistant from the switcher (9px) and from Settings (12px), so proximity does not tell the user it belongs to the switcher. Nothing on the closed bar says "this is where you see and edit what each colour means". The panel itself then has three labels for one idea: the h2 "Status colours", the legend "Colour key", and the help line "Select a swatch to change its colour."

Fix: rename the trigger to "Colour key" (it fits in the same width at 1440px and still wraps cleanly in the mobile menu), and drop the inner "Colour key" legend, leaving the h2 as the panel's only title. Close the gap between switcher and trigger to 4px and leave 12px to Settings so the grouping reads from spacing. If the trigger name must stay "Colours", at least do the spacing change.

### 5. Unassigned white is invisible in light theme and the loudest thing on the board in dark theme

In the light screenshots the Issue 5 card (unassigned) has no visible strip at all; it looks like a card in Off mode, so the user cannot tell "nobody assigned" from "colouring is off" or "metadata unavailable". In the dark screenshots the same card has a bright white strip and the strongest contrast on the board, which draws the eye to the cards that have nobody on them. The two themes therefore say opposite things about the same state.

This is the stated design ("Assignee already makes unassigned cards white"), so I am flagging it rather than calling it a defect. If the intent is "unassigned should stand out so it gets picked up", the dark theme delivers that and the light theme does not. If the intent is "unassigned is a non-value", the light theme delivers that and the dark theme does not.

Fix, if you want consistency: default "Unassigned" to the same neutral grey as Cancelled and Draft (`#87929e`), which reads as "no value" in both themes and is still editable to white by anyone who wants it. If you want it to stand out, keep white but give the strip a 1px hairline in `var(--color-border-subtle)` so it is visible on light surfaces.

### 6. The palette has six colours, so label and assignee keys repeat colours quickly

The hash fallback maps unknown values into six hues. On the fixture's eight labels, four are green and three are pink, and the key lists them side by side with identical swatches. A user looking at a striped card cannot read back which label a green stripe is. The same will happen on teams of more than six people in Assignee mode.

This is not a layout issue and the key still lets the user fix it by hand, so it is not blocking. Fix when convenient: widen the palette to ten or twelve distinguishable hues that pass the same light and dark checks as the current six. Keep the hash so colours stay stable across boards and sessions. Assigning sequentially by first appearance would avoid collisions but would shuffle colours whenever cards are added, which is worse.

## Optional taste and polish

- The selected segment carries four signals: white surface, border, bold, and an underline with offset. The underline makes it look like a link and is unusual in a segmented control. Background plus border is enough and is already colour-independent. Dropping the underline and the weight change would also solve item 2.
- In dark theme the selected segment is darker than its track (surface `rgb(31,35,44)` on track `rgb(41,46,57)`), so it reads as pressed in, while in light theme it reads as raised. Both are recognisable conventions; just be aware the two themes invert the metaphor. Matching the toolbar surface is a reasonable reason to leave it.
- "Labels colours" (plural noun used attributively) reads awkwardly against "Status colours" and "Type colours". Use a singular form for the heading, "Label colours", or phrase all headings as "Colours: Labels".
- "Select a swatch to change its colour." sits below the list. At 320px with 200% text it is below the fold until the user scrolls past the swatches it describes. Merge it into the help paragraph above the list, or drop it; the swatches already look like inputs and have the native colour-picker cursor.
- In the mobile menu the segments wrap with `flex: 1`, which produces an orphan row: at 320px and 390px at 100% text, five segments share row one and "Assignee" alone fills row two; at 200% text the rows are "Off Status Priority", "Labels Type", "Assignee". It works and the targets are 44px, but it looks unfinished. A grid with `repeat(auto-fit, minmax(<em value>, 1fr))` under the 900px breakpoint gives even rows at both text sizes.
- The card-header chips (Open, Merged, Cancelled) always use Status colours regardless of mode. In Assignee mode a card shows an assignee strip and a status chip in different greens. The key only explains the strip. This is defensible (the chip is a persistent encoding, the strip is the chosen one), but if it confuses testers, one sentence in the Off-mode help could say so.
- Colour preferences are stored per browser, keyed by board, while the toolbar they sit in otherwise edits shared board state and shows an "Unsaved changes" chip. Users may expect a teammate opening the same board to see the same colouring. A single line in the panel, "Saved in this browser for this board", would set that expectation. The storage-blocked notice already implies persistence without saying where.

## Accessibility notes

Verified: Tab reaches the checked radio and shows the 2px focus ring; ArrowRight moves selection and the ring follows (captured at 1440px, both in the preview). Contrast of unselected segment text and legend passes AA in both themes (numbers above). The panel is a labelled region, the close button has an accessible name that includes the panel name, swatches have "<value> colour" names, and the storage notice is a live region. At 320px targets are 44px and the page does not scroll horizontally per the existing test.

Not verified here and worth a glance if not already covered elsewhere: screen-reader announcement of the panel heading changing when the mode changes while the panel is open (the h2 text updates in place; focus stays on the radio, which is correct, but a user of a screen reader has no cue that the key changed). An `aria-live="polite"` on the h2, or moving the mode name into the existing status region, would cover it cheaply.

## Mobile notes

- The bottom-anchored sheet is a good fit; short content (Off mode) sits low near the thumb, long content grows upward to the max height.
- The "×" close icon is small inside its 44px target at 200% text; it is tappable but looks lighter than everything around it. Not a defect.
- Opening the palette closes the menu and Escape returns focus to the Menu button (covered by tests). From the user's side this means "switch mode, then edit colours" is: Menu, tap mode, tap Colours, edit, close, Menu again if they want another mode. That is acceptable for an occasional task and keeps the common one-tap switch intact.

## What I did not check

- Any state with hundreds of labels or assignees; the fixture has eight labels and two people.
- Pointer behaviour on the tldraw canvas while the panel is open, beyond what the outside-click close handler implies.
- Windows high-contrast or forced-colours mode.

## Follow-up verdict (same day)

Rechecked only the three pre-merge items, against the updated screenshots (`priority-empty.png`, `compact-switcher.png`, `light-switcher.png`, `dark-switcher.png`) and the diff to `cardColours.tsx`, `cardColours.css` and `chrome.css`. The preview was stopped, so I did not re-measure live.

1. **Priority with no project: fixed.** The help sentence reads "Uses the project priority field chosen in Settings. Cards without one show as No priority." and sits where the Status one does. `priority:no priority` now defaults to `#87929e`, and the dark screenshot shows a grey strip on every card and a grey swatch in the key, so an unprioritised board no longer looks like a merged one.

2. **Toolbar reflow on mode click: fixed.** The checked state no longer sets `font-weight: 650`; it keeps the surface background, control border and underline, so the selection still does not rely on colour alone. The light and dark switcher screenshots show the Colours, Settings and Find buttons at the same x with Assignee selected as they were with Off selected, and the test asserts the trigger's x is unchanged across all six modes.

3. **Orphaned Colours trigger between 900px and 1000px: fixed.** Between 901px and 1050px the "Colour by" legend is visually hidden with the standard clip pattern, so the fieldset keeps its accessible name (the test queries the group by that name) while the trigger stays on the switcher's row. The 960px screenshot shows two tidy rows: switcher plus Colours, then Settings, Find, Repositories, Refresh, Incoming. Above 1050px the legend returns, which matches the 1440px screenshots.

Nothing new introduced that I can see in these captures. Unassigned white stays as designed; items 4 to 6 and the polish list remain optional. Ship.
