# Embedded issue canvas: tldraw vs Excalidraw

Source retrieval date: **2026-11-05**. Research only; no application, benchmarks, or browser interaction tests were implemented or run. Evidence below is from official documentation and official repositories. `main`/`master` source links are moving targets, not promises about a particular published package. The tldraw API reference linked its `BaseBoxShapeUtil` source to tag `v5.6.0`; that source was inspected, but this is **not** an independently verified claim about the latest npm release. Pin package versions and repeat the interaction spike against those versions before committing to a library.

**Current decision:** the user tried both [browser prototypes](experiments.md) and selected **tldraw**. This supersedes the intervening recommendation to use Excalidraw native-image cards. Use custom React/HTML shapes; no Excalidraw fallback is planned. The experiment evidence remains unchanged, and the [implementation plan](spec.md) records the current scope.

## Decision summary

**Original documentation-only recommendation, now aligned with the user's choice:** choose **tldraw**, because application-defined React/HTML shapes, geometric hit testing, shape-specific interaction hooks, migrations, and accessibility descriptions are explicit SDK extension points. These directly match a metadata card that must behave like a drawing object without treating its contents as editable diagram text. [T1][T2][T3][T5][T6]

**Important correction to a common comparison:** Excalidraw **can render custom React issue cards without a fork**, using its documented `renderEmbeddable(element, appState)` callback for built-in `embeddable` elements and `customData` for issue references. It does **not** expose the same arbitrary new-shape-type/ShapeUtil extension model. The source's closed element union and embeddable rendering code substantiate that distinction. Calling Excalidraw “unable to show live custom HTML cards” would be incorrect. Its embed interaction semantics and export limitations require a spike, not immediate rejection. [E1][E2][E3][E4]

**Historical alternative, not the selected implementation:** the original research proposed testing Excalidraw embeddables if tldraw licensing was unacceptable. Subsequent experiments rejected those embeds for this workflow and found native-image cards viable with tradeoffs. The user nevertheless prefers tldraw; do not carry either Excalidraw approach into the implementation.

## Concise comparison

| Concern | tldraw | Excalidraw |
|---|---|---|
| React app embedding and native drawing/text | React `<Tldraw>`; built-in draw/text/arrow/frame/group shapes. [T1][T2] | React `<Excalidraw>`; native drawing/text tools; client-only rendering for SSR frameworks. [E8][E9] |
| Live React issue card | Register a true application shape through `shapeUtils`; render `HTMLContainer` from `ShapeUtil.component`. [T1] | Use built-in `embeddable` with `renderEmbeddable`; no documented arbitrary shape registration API in the inspected props/type model. [E1][E2][E3] |
| Movement, geometry, resize | Native shape selection/drag; `BaseBoxShapeUtil` supplies rectangular geometry and `resizeBox`; hooks and capabilities customize behavior. [T2][T3][T4] | Native element geometry surrounds embed content; source supplies viewport transforms, rotation, width/height, and activation-gated pointer events. Full card UX remains to prove. [E4] |
| Links and inner controls | Keep card body canvas-owned; give only actual controls pointer ownership and stop propagation. [T4] | Element `link`/`onLinkOpen`; JSX controls receive pointer input when embed is active. [E1][E4] |
| Persistence/migrations | JSON document/session snapshots, record validation, automatic built-in migrations, custom shape-props migrations. [T5] | `initialData`, `onChange`, `updateScene`, `customData`, restore utilities; application owns its custom-data schema migration. [E1][E5][E6] |
| Groups/frames | Native hierarchical groups and clipping frames. [T2] | `groupIds` and `frameId` are native element fields; frame/group actions exist. DOM-embed clipping/layering must be exercised. [E3][E4] |
| Accessibility | Documented shape keyboard navigation, live announcements, `getText`/`getAriaDescriptor`, reduced motion. Not a whole-app conformance guarantee. [T6] | Documented keyboard event scoping and focus props; custom JSX can be semantic HTML. Equivalent custom-shape announcement support was not established. [E1][E2] |
| Large canvases | Spatial-index culling, fine-grained signals, batching, LOD APIs; culling hides DOM, not full unmount virtualization. [T7][T8] | Embeds first mount when visible and remain initialized thereafter; offscreen nodes use `display:none`. No defensible equal-workload performance comparison established. [E4] |
| Collaboration | `useSync`/`TLSocketRoom`; production self-hosting required; demo service not a production backend. [T12] | Hosted app has collaboration, but npm embedding does not automatically include that service or its storage/encryption behavior. [E9] |
| Production license | Active key required. Commercial negotiated; hobby discretionary and watermark required. [T9][T10][T11] | MIT repository license; preserve copyright/permission notices. [E7] |

## tldraw implementation sketch

This is a recommended design, not implemented code.

### Issue shape and live metadata

1. Define one `issue-card` shape. Use the current documented `TLGlobalShapePropsMap` augmentation and `TLShape<'issue-card'>` pattern. Extend `BaseBoxShapeUtil` for box geometry/resizing, or `ShapeUtil` if a fixed-size card is chosen. Register a stable `shapeUtils` array on `<Tldraw>`. Define `static type`, `static props` validators, `getDefaultProps`, `component`, and `getIndicatorPath`; supply custom migrations when persisted properties evolve. The box base already implements geometry and resize behavior. [T1][T2][T3]
2. Persist **only stable issue identity and presentation state** in shape props: an opaque issue key (including host if multiple GitHub hosts are supported), `w`, `h`, and a view mode only if the product needs it. Use the library's own shape record for `id`, `x`, `y`, parent, rotation, stacking and lock state. Do not mirror those fields in a second board-layout model. Shape records already provide those fields. [T2]
3. Keep GitHub title, state, labels, assignees, repository display name and timestamps in a separate, authorization-aware application cache keyed by issue identity. The renderer subscribes to that cache. **Recommendation:** share one metadata subscription/query per issue identity, not a network request per mounted card. A board may have multiple card instances for one issue; each gets a distinct shape ID. Cache refresh must not move cards, resize them unexpectedly, replace the drawing document, or become an undoable board edit.
4. Render semantic React/HTML in `HTMLContainer`, including the repository identifier to disambiguate multiple repositories. Treat metadata as untrusted text. Render an explicit loading/unavailable/stale state without deleting or moving the shape. Never place authentication credentials in props, `meta`, exported files or persistence records. These are application security/design recommendations, not automatic SDK guarantees.

### Interactions

- **Recommendation:** pointer-down/drag on noninteractive card chrome selects/moves the shape. The title link or an explicit “Open issue” control handles navigation separately. Set pointer ownership only where needed and stop propagation for controls, following the official interactive-shape example. Do not make the entire card an anchor that competes with drag. [T4]
- Prefer fixed height plus bounded width, or fixed compact/expanded dimensions, over measuring live metadata and reflowing the board on each refresh. If resizing is enabled, use the box resize path and a minimum size; constrain rotation only if the product explicitly chooses that policy. `canResize`, `onResize`, `onDoubleClick`, and other capabilities/hooks exist; details must be checked against the pinned release. [T2][T3]
- Use native grouping and frames, not a separate grouping model. Moving a frame moves its children; frames clip; deleting a frame/group deletes descendants. Decide whether that destructive action needs app-level confirmation before exposing it in the product. [T2]
- Implement `getText`/`getAriaDescriptor` from accessible issue metadata plus repository/number; resolve these outside a React-only hook if called by the ShapeUtil. Use semantic links/buttons, usable focus indicators and an accessible nonspatial issue list/details surface as the keyboard/screen-reader fallback. SDK Tab/Shift+Tab shape traversal, adjacent selection and live-region announcements are documented, but do not prove that this app meets a particular WCAG level. [T6]

### Persistence and migration contract

- Save the SDK's **document snapshot**, including schema information, rather than inventing partial serialization of shapes. `getSnapshot(editor.store)` separates `{document, session}`; document contains shapes/pages/bindings/assets, while session includes camera/current page/selection/UI state. `loadSnapshot` restores them. [T5]
- Recommended initial deployment: durable authenticated server document storage; board ownership checks; revision-based optimistic saves to prevent two tabs overwriting each other; separate per-user/per-tab session storage. This is **single-user persistence**, not multiplayer synchronization. Library snapshots do not supply your authorization or concurrent-save policy. Listen to document-scope changes with `editor.store.listen` and coalesce saves. [T5]
- `persistenceKey` is useful for a local spike or explicitly local-only product: it uses IndexedDB, stores assets and synchronizes tabs sharing a key. It is not a durable account-backed server database. Do not run independent local and remote persistence authorities against the same document without an explicit ownership/load strategy. [T5]
- Use `createShapePropsMigrationIds` / `createShapePropsMigrationSequence` and `static migrations`. Validators reject bad custom props; built-in migrations run when old snapshots load. General migrations exist for `meta` and cross-record changes. If collaboration is later chosen, custom schemas/migrations must also be installed server-side and rollout compatibility must be designed. [T1][T5][T12]
- Recommended tests: save/reload; one prior custom schema; corrupt/unsupported snapshot handling; duplicate instances; deleted/unavailable issues; concurrent-save conflict; refresh during drag and undo/redo. Preserve an unavailable issue's placement and annotation context.

### Export is distinct from persistence

With metadata outside shape props, a saved drawing contains the **reference**, not a self-contained issue snapshot. Decide explicitly whether a download is (a) editable app-specific document requiring authorized rehydration, or (b) a visual snapshot carrying the displayed metadata. Do not advertise the former as an offline, self-contained board.

`tldraw` supports `ShapeUtil.toSvg`/`toBackgroundSvg` for visual export. **They are not strictly required:** absent those methods, current documentation describes an HTML `<foreignObject>` fallback. Explicit SVG is recommended for portable, predictable issue-card export. Resolve/freeze the authorized displayed metadata at export time and define the unavailable-data rendering; do not fetch private data merely because an imported file mentions an issue. SDK export transforms/opacity are handled around the shape's returned local-coordinate SVG. [T13]

A custom-card export spike must include font wrapping, badges, links, missing avatars, offscreen cards and unauthorized issue references. External metadata also affects clipboard/document portability: a pasted card needs this application's renderer and a permitted metadata lookup. Exported private information is no longer protected by subsequent GitHub permission changes; make that disclosure intentional.

## Can Excalidraw really do this without a fork?

### Evidence-backed answer: yes, as an embeddable

The documented callback is:

```ts
renderEmbeddable(
  element: NonDeleted<ExcalidrawEmbeddableElement>,
  appState: AppState
): JSX.Element | null
```

It replaces the built-in iframe renderer. Elements accept `customData`, and the source defines `type: 'embeddable'` plus the shared geometry/link/group/frame/custom-data fields. The render source actually calls `this.props.renderEmbeddable?.(el, this.state)` before falling back to an iframe. This is a real public rendering seam, not an imagined DOM-overlay workaround. [E1][E2][E3][E4]

Recommended integration:

1. Create a normal `embeddable` element with an app-controlled safe URL in `link` and namespaced `customData: { issueCard: { version: 1, issueKey: ... } }`. Supply normalized element data through `initialData`/`restoreElements`, or insert through `updateScene` while preserving existing scene elements. The update API is scene-oriented; do not assume `elements: [newCard]` means append. [E1][E5][E6]
2. Use a strict `validateEmbeddable` URL allowlist/predicate for your card URL namespace, rather than `true` for all URLs. The source filters embeddables by validation status before rendering. Return a controlled React issue-card component for recognized, validated data. The renderer must deliberately handle malformed data: returning `null` invokes the default iframe fallback in the inspected source. [E1][E4]
3. Keep metadata in the same separate authorized cache recommended above. Store identity/schema version only in `customData`. Use `onChange(elements, appState, files)` for persistence; restore with documented utilities. Application-specific custom-data migration/validation is your responsibility: the generic restore API normalizes library element state and does not document an application migration registry. [E1][E5][E6]
4. `updateScene({captureUpdate: CaptureUpdateAction.NEVER})` is documented for non-undoable remote/initialization updates. Prefer not updating scene elements at all for live metadata refresh; this avoids history churn in either library. [E5]

### Limitations to account for

- **Not a new native element class.** The inspected `ExcalidrawElement` type is a closed union of built-in kinds. `customData` does not add new geometry, resize lifecycle hooks or a renderer for arbitrary `type:'issue'`. The no-fork option deliberately inherits `embeddable` semantics. [E3]
- **Activation mode.** The inner DOM wrapper enables pointer events only when the embed is active; source includes center-click/tap activation logic and double-click activation. This protects selection/drag, but can require an extra action before an issue link/button is interactive. Exact mouse/touch/keyboard UX must be tried against the pinned package; do not “fix” it by reaching into private `App` methods or globally overriding CSS. [E4]
- **Layering and clipping.** JSX is rendered in DOM embeddable containers alongside the drawing canvases, not registered as the normal canvas painter. The source gives these containers coordinate transforms and viewport visibility. Whether arbitrary drawing-over-card z-order and frame clipping meet this app's expectations is an explicit spike question, not verified equivalence with tldraw. [E4]
- **Export.** Documented `exportToCanvas`/`exportToSvg` take elements, app state and files, not `renderEmbeddable`. [INFERENCE] Custom React markup should not be assumed to appear in their output. A dedicated materialization path may be necessary (e.g. render card content into export-only native elements or an image). Verify actual output before promising visual card export; do not confuse JSON preservation of `customData` with rendering the card outside this app. [E10]
- **Primitive-card alternative.** Rectangles plus bound/grouped text and `customData` can be updated from metadata without a fork, but they are diagram primitives rather than arbitrary HTML controls. [INFERENCE] They require layout/reconciliation logic and protection against the user editing live metadata as text. This is not the preferred fallback for rich metadata cards. [E3][E5]

## Performance, accessibility and hosting risks

### Performance

`tldraw` documents spatial indexing, batched store changes, fine-grained signals, `getEfficientZoomLevel()` and viewport culling. **Culling is not full DOM virtualization:** offscreen shapes stay mounted with `display:none`; selected/edited shapes are exceptions. Its current documented default `maxShapesPerPage` is 4,000; that is a configurable safety limit, not a proven issue-card capacity. [T7][T8]

Excalidraw's inspected embeddable renderer checks visibility, first mounts visible embeds, remembers initialized embeds, then keeps those nodes with `display:none` offscreen. It maps over embeddables and calls the custom renderer for retained instances. [E4] **Recommendation for both:** memoize card bodies; deduplicate metadata queries; do not give every card its own timer; avoid continuous animations and full issue bodies on the board; use compact representations at low zoom. Hidden DOM can still retain subscriptions/memory, so library culling alone does not eliminate application work.

No measured performance ranking or maximum usable card count was established. “Infinite canvas” describes coordinate navigation, not unlimited records, DOM nodes or metadata requests.

### Accessibility

The tldraw documentation provides a materially stronger explicit integration contract for shape announcements/navigation. Excalidraw documents `handleKeyboardGlobally` (default false) and `autoFocus` (default false), which help prevent shortcuts from hijacking the surrounding application. Neither source is a certification that custom issue-card controls, drag alternatives, zoom, or board reading order meet the user's accessibility needs. [T6][E1]

Recommendation: provide a synchronized accessible issue list with “Locate on canvas” and “Open issue”, plus keyboard-operable move/selection paths. Test focus entry/exit, Escape behavior, screen-reader naming, reduced motion, zoom and links without a pointer. In Excalidraw particularly, demonstrate entering and leaving active embed controls without a focus trap.

### Collaboration and deployment

Do not add multiplayer solely because the library advertises collaboration. For the proposed owner-only app, normal document persistence is sufficient until simultaneous users are a requirement.

If required later, tldraw offers `useSync` and server-side `TLSocketRoom`; production requires self-hosting. The recommended Cloudflare template uses Durable Objects/SQLite for room state and R2 for assets; a JavaScript WebSocket server is another documented path. Exactly one authoritative room instance per document is required. Authentication, authorization, upload limits, history and room listing are application concerns not supplied by the template. [T12]

Excalidraw's README explicitly distinguishes package features from excalidraw.com features (real-time collaboration, end-to-end encryption, local-first autosave and share links). Importing the package or setting `isCollaborating` does not provision that backend. Hosting choices, synchronization protocol, persistence and authorization would need a separate design; do not claim the embedded app inherits the hosted site's encryption. [E1][E9]

## Historical licensing findings (outside implementation scope)

### tldraw

- The repository license defines a **Production Environment** to include deployments providing functionality to end users, customers or the public. Development excludes those audiences. The default grants development use/modification/bundling, forbids production use, forbids interfering with key enforcement, requires notices and a verbatim license copy, and limits standalone redistribution. A private/internal tool used by actual end users should not be presumed “development” merely because it is private. [T10]
- Official docs explicitly list trial, commercial and hobby licenses for production; an active key is required. Keys are public/client-validated and can work offline. [T9]
- Trial: documented free **100-day** evaluation, one per commercial unit/business unit; key stops working after expiry. Do not build a production launch around recurring trials. [T9][T10]
- Commercial: separate agreement; published pricing says value-based pricing and annual licensing, not a public fixed amount. Budget/term/domain/downstream conditions require the actual offered agreement. Do not invent a price. [T9][T11]
- Hobby: discretionary non-commercial grant; application page describes personal projects, student/research work, side projects, prototypes and ideas not yet a business. A “made with tldraw” canvas watermark is required. The pricing page describes hobby licenses as free, but issuance is not automatic. [T9][T11][T14]
- Open-source project inclusion does not relicense the SDK; downstream production users need their own qualifying license. Docs say commercial/hobby use sends no information to tldraw; trial use pings a hash of the key, without canvas data or PII. The repository license more generally permits compliance-related transmission. Review the actual granted terms if privacy requirements are strict. [T9][T10]
- Retrieval caveat: the license docs' `/legal/tldraw-license` link returned HTTP 404 during research. The official repository `LICENSE.md` was therefore read directly alongside the licensing/pricing/application pages. The full future commercial/hobby agreement was not available to inspect and has not been represented as approved.

### Excalidraw

The official repository `LICENSE` is MIT and explicitly permits use, modification, distribution, sublicensing and sale, subject to retaining the notice and disclaimer. No runtime production key requirement appears in that license. This is evidence about the inspected repository, not a license audit of every bundled font/dependency or a subscription to Excalidraw+. Retain package/dependency notices in the shipped app. [E7]

## Spike acceptance criteria

These are **proposed future acceptance tests**, not completed verification. Use one selected, pinned published version of each candidate only as needed to resolve the choice.

1. **Real card behavior:** add at least three issues from two repositories, with title/state/labels/assignees and a repository identifier; refresh one issue without changing any layout or user annotation. Two card instances of one issue show the same metadata without duplicate fetches.
2. **Pointer and keyboard:** body drag, selection, multi-select, resize policy, pan/zoom, touch drag and open-issue link work without accidental navigation; native drawing/text tools still work over and around cards. Keyboard users can reach, identify, open and leave a card. For Excalidraw, explicitly record how activation works and whether its extra step is acceptable.
3. **Native object semantics:** group a card with text/drawing; move/duplicate/undo/delete the group; put cards in a frame, move/reparent them, cross frame edges and undo. Test drawings both above and below cards. A failed embed layering/clipping requirement is a library-choice failure, not permission to omit the feature silently.
4. **Persistence:** reload server-backed document with placement, sizes, native text/drawing, groups/frames and metadata references intact. Restore one prior custom schema. Metadata refresh does not populate undo history; undo after refresh affects board edits only. Two tabs cannot silently overwrite newer saved state.
5. **Privacy and stale data:** authorization loss or missing issue yields a controlled unavailable card while preserving position. Export/import/copy/paste never includes credentials or bypasses authorization. No accidental arbitrary iframe fallback for malformed Excalidraw card data.
6. **Export:** if visual export is part of scope, PNG/SVG contains readable actual issue cards, native drawing and text, including offscreen items; metadata is frozen consistently for the export; links/fonts/images have defined behavior. If only editable document export is selected, clearly establish that external metadata requires rehydration.
7. **Performance:** use production builds on a named baseline device/browser with 100, 500 and 1,000 realistic cards plus drawings. Measure mount, pan/zoom, drag, metadata refresh, memory and DOM count before/after visiting the whole board. Proposed starting target: p95 frame time at or below 33 ms during interaction at the chosen initial capacity, no input task exceeding 100 ms due to metadata refresh; revise only through an explicit product decision. These are suggested targets, not vendor guarantees or measured results.
8. **Hosting:** no demo sync service or implicit public issue-cache exposure. No collaboration infrastructure is required.

## Remaining unknowns

- Pinned published versions and whether all current documentation/source APIs are present in those releases.
- Excalidraw custom-embed keyboard activation, frame clipping, arbitrary card/drawing z-order, resize ergonomics and actual SVG/PNG appearance.
- Measured card capacity and memory for this card design; minimum supported browsers/devices.
- Whether portable visual export, offline viewing and simultaneous multi-user editing are required. They materially change metadata/persistence work, so do not silently add them.
- Full application accessibility conformance; only documented library mechanisms were established.

## Primary source index

All retrieved 2026-11-05.

- [T1 — tldraw custom shapes](https://tldraw.dev/docs/shapes)
- [T2 — tldraw shape system, hooks, groups and frames](https://tldraw.dev/sdk-features/shapes)
- [T3 — BaseBoxShapeUtil official source, referenced tag](https://github.com/tldraw/tldraw/blob/v5.6.0/packages/editor/src/lib/editor/shapes/BaseBoxShapeUtil.tsx)
- [T4 — tldraw interactive shape example](https://tldraw.dev/examples/interactive-shape)
- [T5 — tldraw persistence, snapshot separation and migrations](https://tldraw.dev/sdk-features/persistence)
- [T6 — tldraw accessibility](https://tldraw.dev/sdk-features/accessibility)
- [T7 — tldraw performance](https://tldraw.dev/sdk-features/performance)
- [T8 — tldraw culling lifecycle](https://tldraw.dev/sdk-features/culling)
- [T9 — tldraw licensing guide](https://tldraw.dev/community/license)
- [T10 — tldraw repository license](https://github.com/tldraw/tldraw/blob/main/LICENSE.md)
- [T11 — tldraw pricing](https://tldraw.dev/pricing)
- [T12 — tldraw sync and deployment](https://tldraw.dev/docs/sync)
- [T13 — tldraw custom SVG export and foreignObject fallback](https://tldraw.dev/examples/toSvg-method-example)
- [T14 — tldraw hobby application eligibility](https://tldraw.dev/get-a-license/hobby)
- [E1 — Excalidraw props, customData, links, validation and keyboard scope](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/)
- [E2 — Excalidraw renderEmbeddable public API](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/render-props#renderembeddable)
- [E3 — Excalidraw element type source](https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/types.ts)
- [E4 — Excalidraw App source; renderEmbeddables and activation paths](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/components/App.tsx)
- [E5 — Excalidraw imperative API and captureUpdate](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/excalidraw-api)
- [E6 — Excalidraw restore utilities](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/restore)
- [E7 — Excalidraw MIT license](https://github.com/excalidraw/excalidraw/blob/master/LICENSE)
- [E8 — Excalidraw React integration and SSR restrictions](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/integration)
- [E9 — Excalidraw README: package versus hosted-app features](https://github.com/excalidraw/excalidraw/blob/master/README.md)
- [E10 — Excalidraw export utilities](https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/export)

[T1]: https://tldraw.dev/docs/shapes
[T2]: https://tldraw.dev/sdk-features/shapes
[T3]: https://github.com/tldraw/tldraw/blob/v5.6.0/packages/editor/src/lib/editor/shapes/BaseBoxShapeUtil.tsx
[T4]: https://tldraw.dev/examples/interactive-shape
[T5]: https://tldraw.dev/sdk-features/persistence
[T6]: https://tldraw.dev/sdk-features/accessibility
[T7]: https://tldraw.dev/sdk-features/performance
[T8]: https://tldraw.dev/sdk-features/culling
[T9]: https://tldraw.dev/community/license
[T10]: https://github.com/tldraw/tldraw/blob/main/LICENSE.md
[T11]: https://tldraw.dev/pricing
[T12]: https://tldraw.dev/docs/sync
[T13]: https://tldraw.dev/examples/toSvg-method-example
[T14]: https://tldraw.dev/get-a-license/hobby
[E1]: https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/
[E2]: https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/render-props#renderembeddable
[E3]: https://github.com/excalidraw/excalidraw/blob/master/packages/element/src/types.ts
[E4]: https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/components/App.tsx
[E5]: https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/props/excalidraw-api
[E6]: https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/restore
[E7]: https://github.com/excalidraw/excalidraw/blob/master/LICENSE
[E8]: https://docs.excalidraw.com/docs/@excalidraw/excalidraw/integration
[E9]: https://github.com/excalidraw/excalidraw/blob/master/README.md
[E10]: https://docs.excalidraw.com/docs/@excalidraw/excalidraw/api/utils/export
