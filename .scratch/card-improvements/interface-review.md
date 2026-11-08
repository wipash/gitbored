# Card improvements: interface review

## Scope and coverage

Reviewed the card body preview and anchored Card details flow: opening, switching,
outside-click dismissal, resizing, pan/zoom, keyboard focus, Markdown, empty
bodies, long content, light/dark themes and narrow screens. The implementation
uses the existing React/tldraw components and semantic CSS tokens. Conventions:
`AGENTS.md`, `docs/CODING-CONVENTIONS.md`, `README.md` and
`.scratch/issue-canvas/spec.md` (Atlas + Contextual, non-modal panels).

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | `CardMarkdown.tsx`, `useCardDetailDismiss.ts`, existing Escape handling; browser opening/closing, direct switching, focus return and link tab navigation | Clear within inspected scope |
| Layout | `workspace.css`; desktop, 390px and 320px browser checks with 200% text; native card resize and fixed metadata/footer positions | Clear |
| Writing | Existing Card details, Close details and empty/error copy; removal of Card size; completed/incomplete task labels | Clear |
| Typography | Rendered headings, paragraphs, task lists, table, inline/fenced code, long title and identifier wrapping | Clear |
| Colors | Rendered light/dark prose, code, links and tinted card preview, measured below | Clear |
| UI polish | Conditional bottom fade, non-interactive preview, native focus rings, scroll containment and existing panel positioning | Clear |

All six owning better-interface domain skills were read. The boundary excludes
other workspace features and a general accessibility audit.

## Findings

No actionable interface findings remain in the inspected flow. The preview
renders link labels as plain text and image alt text, while the detail pane keeps
links interactive. The full body remains available through Card details, including
when the preview is clipped or hidden to preserve controls with enlarged text.

## Verification

- Validated implementation commit: `222bcaf` (the source/tests are unchanged from
  the passing final gate; this record and screenshots are documentation only).
- Added a Markdown browser assertion and observed it fail against the previous UI.
- Initial focused run: all 18 card/detail/desktop browser tests passed using
  `pnpm test:e2e tests/e2e/card-details.spec.ts tests/e2e/card-layout.spec.ts tests/e2e/desktop-redesign.spec.ts`.
- Expanded fixtures cover GitHub task lists, emphasis, inline/fenced code, tables,
  external links, unsafe URL protocols, escaped HTML and empty descriptions.
- Browser interactions cover outside canvas/card clicks, clicks within the pane,
  direct card switching, trigger toggling, Escape/focus return, resize threshold,
  fade removal when the entire body fits, zoom, pan and narrow viewport bounds.
- An isolated fixture browser checked link Tab/Shift+Tab navigation and a visible
  2px focus outline in both themes, plus long code at 320px and 200% text.
- Final built UI: dragging directly on preview text moves the card; native Undo
  restores its position. Final light/dark screenshots were inspected again after
  rendering preview links as plain text.
- Measured rendered WCAG contrast (light / dark): prose 14.94 / 13.77,
  code 13.09 / 11.91, links 8.03 / 8.80, tinted preview 11.67 / 12.71.
  Measurements exclude the deliberate overflow fade; full text in details is opaque.
- Production dependency audit: zero published advisories.
- Final `pnpm gate`: passed lint/import boundaries, all TypeScript configs,
  14 document tests, 4 server tests and 107 browser tests. One browser test was
  skipped because it targets an unconfigured deployment.
- `git diff --check`: passed.

Not verified: live assistive-technology announcements, other browser engines,
RTL/pseudo-localization, remote Markdown image loading, and direct visual inspection
of every unavailable/loading detail state. Existing fallback copy and metadata
state handling were inspected in source; the regression suite covers metadata
loading/failure separately.

## Dependency choice

`react-markdown` 10.1.0 and `remark-gfm` 4.0.1 provide Markdown parsing and GitHub
syntax without maintaining a bespoke parser or injecting HTML. The renderer
escapes raw HTML and filters unsafe protocols; browser regressions exercise both.
Versions are pinned with the lockfile; React/TypeScript compatibility is checked
by the repository gate. Package behavior was checked against the
[renderer documentation](https://github.com/remarkjs/react-markdown) and
[GFM plugin documentation](https://github.com/remarkjs/remark-gfm).

## Verdict

Approve for the inspected card/detail flow. No high-severity findings remain.
The unverified states listed above remain outside this verdict.
