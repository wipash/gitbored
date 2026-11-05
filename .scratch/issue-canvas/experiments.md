# Canvas feasibility experiments

Date: 2026-11-05. **Historical experiment scope:** personal self-hosted GitHub issue **and PR** board, primarily private repositories, read-only cards plus drawing/text and spatial organization. All displayed records were labeled fixtures; no private credentials or repositories were accessed. The later multi-user sign-in, view-filter, and scheduled-refresh requirements below supersede scope assumptions, not these observations.

## Current decision

**The user selected tldraw after trying both public previews.** Use custom React/HTML card shapes; the earlier Excalidraw recommendation below is superseded, not the observed experiment results. Licensing is accepted as a tradeoff; a valid production key remains to be obtained. Both preview servers and quick tunnels were stopped at the user's request. The [current plan](spec.md) is authoritative; the prototype branch retains the original experiment-time snapshot.

**Current scope supersedes the former single-owner restriction:** anyone who authenticates through the GitHub App may use the self-hosted deployment, including teammates sharing the app. Upsert each immutable GitHub user ID; keep that user's credentials, repository authorization, caches, and boards isolated. Boards are private per creator by default. Board-sharing permissions are undefined separately; no shared boards, invitations, or live collaboration are inferred.

**Additional current requirements, not validated by these engine experiments:** per-user view filters hide closed issues, merged PRs, include/exclude labels, weight, sprint, and type without deleting/moving/reflowing placements. Filters combine with AND; label Include matches any selected label and Exclude rejects any selected label. Unset is not zero; disclose unavailable/unfetched values separately. Show hidden-placement counts and clear/reveal to restore the same geometry. These are view changes, not GitHub writes.

Weight/sprint/type in appearance prototypes are labeled mock planning fields. Their real mapping to available Projects/custom fields/labels or supported native fields is an integration gate; Projects read-only permission may be needed but has not been proven or requested. Refresh on load, by button, and on an adjustable schedule is required; cadence depends on measured request count, rate budget, board volume, and latency. Production must deduplicate repeated references, coalesce in-flight work, use conditional requests where supported, pause hidden boards, back off on rate limits, and show last/next status. Scheduled reads remain user-authorized, never an installation-access bypass. Fixture refresh controls do not prove any of this backend behavior. Field mapping, measured cadence, and board-sharing policy do not block throwaway UI exploration.

## Initial experiment recommendation (superseded)

**Recommend Excalidraw with native generated SVG-image cards and a details sidebar. Do not use React embeddables for the cards.** This satisfies the requested read-only metadata-card workflow without a fork or tldraw license. It is a deliberately different representation from an interactive HTML custom shape, not a claim that Excalidraw offers tldraw's extension model.

Use tldraw instead if the product needs inline interactive controls, semantic HTML card content on the canvas, custom resize/reflow/shape behavior, or richer custom-shape accessibility. tldraw's actual custom-card experiment worked well. The current requirements do not demand those capabilities; licensing is acceptable but does not appear necessary.

The tradeoffs remaining for Excalidraw are generated-image cache management, image rather than HTML semantics, and a frame-clipping mismatch in the tested SVG export path. PNG export worked. Export was not part of the user's original essential workflow.

## What ran

- **Excalidraw 0.18.1**, React 19.2.0, Vite 7.2.2: two variants of the same real SDK app, `?variant=embed` and `?variant=image`.
- **tldraw 5.6.0**, React 19.3.1, Vite 8.3.5: a real `BaseBoxShapeUtil`/`HTMLContainer` card, plus an explicit `toSvg` export renderer. Normal development licensing, no license key or enforcement bypass.
- Real Chromium mouse/keyboard interaction and SDK state inspection, not mocked canvas behavior. Some scenario setup used public SDK methods: selecting a known group, placing a card partly outside a frame, and generating large fixtures. Screenshots verify actual rendered surfaces.
- Excalidraw Vite production build passed. tldraw TypeScript check and Vite production build passed after adding Vite's client declarations for CSS imports. Vendor directive and bundle-size warnings remain. No permanent tests/lint/formatter run, and no Excalidraw TypeScript-check claim.
- Excalidraw performance measurements used its production bundle. Functional tldraw checks used the development server; no comparative production performance claim is made.

## Functional results

| Scenario | Excalidraw React embed | Excalidraw native SVG image | tldraw HTML custom shape |
| --- | --- | --- | --- |
| Body drag | Passed | Passed | Passed |
| Native drawing/text above a card | Failed: embed covers later canvas elements | Passed | Passed |
| Frame clipping | Failed: embed content extends outside frame | Passed on canvas | Passed |
| Group and move multiple cards | Passed | Passed, including keyboard movement | Not separately exercised |
| Duplicate / clipboard | Not separately exercised | Ctrl+D and actual Ctrl+C/V retained references with independent IDs | Not separately exercised |
| Native drawing and typed text | Existing native annotations rendered, but covered by cards | Created freehand stroke and typed text through tools | Existing native annotations rendered above cards |
| Resize | Not separately exercised | Passed; scales image, does not reflow text | Not separately exercised |
| Metadata refresh followed by undo | Passed: prior drag reversed, metadata current | Passed after new-file-ID integration fix | Passed: prior drag reversed, metadata current |
| Save, full page reload, restore | Passed explicit scene round-trip | Passed reference-only scene round-trip with generated assets restored | Passed document snapshot round-trip |
| Inspect metadata | Inner control needed embed activation | Selected-card side panel worked | HTML link/control seam exists; external navigation not exercised |
| SVG export | Failed: blank rectangles plus URLs | Cards included; overflowing-frame image not clipped in tested path | Passed with implemented explicit SVG renderer, including clipping |
| PNG export | Not exercised | Passed, including overflowing-frame clipping | Not exercised |

These are the observed paths, not exhaustive SDK certification. Actual link navigation to GitHub, touch gestures, Firefox/Safari, screen-reader behavior, and custom-schema migration were not tested.

### React embeddables: why rejected

The native red line/text were intentionally created **after** card 0 in scene order. They appeared behind its DOM content. The frame test retained `frameId` while moving part of the card outside the frame; its DOM still overflowed. A single click on an inner Inspect button selected the embed but did not invoke the button; activating the embed first made the button work. SVG export produced URLs instead of rendered card metadata.

Evidence:
- [Embed covers foreground annotation](evidence/embed-overlap.png)
- [Embed overflows its frame](evidence/embed-frame-clipping.png)
- [Embed SVG export omits card contents](evidence/embed-svg-export.png)

No CSS stacking overrides, private editor methods, or library fork were used to conceal these limitations.

### Native SVG-image cards: why viable

The card is a normal Excalidraw image element. Its generated SVG contains repository, number, kind, title, labels, state, and assignee. `customData` carries the item reference; native geometry, grouping, frame membership, and stacking remain SDK-owned. The sidebar displays readable metadata and actions. Native drawing and text can appear above or below the card.

Observed interactions include a 120-by-150-pixel card drag, resizing a 320-by-170 card to approximately 380-by-202, grouping two cards and moving them together, duplicating the group, copying/pasting a card, and moving a frame with its child. Typed text and a freehand stroke were created through the real keyboard/pointer tools. Copies retained the same item reference but received different element IDs.

Evidence:
- [Native image cards with foreground annotation](evidence/image-overlap.png)
- [Refreshed content after undoing a drag](evidence/image-refresh-after-undo.webp)
- [Live frame clipping](evidence/image-frame-clipping.webp)
- [PNG export with clipping](evidence/image-png-export.webp)
- [SVG export showing the clipping discrepancy](evidence/image-svg-export.webp)

### Image refresh and cache caveats

The first same-ID refresh did **not** update the visible card. The inspected installed implementation of `addFiles` skips a file ID already present in its file map. This was an integration discovery, not papered over by resetting the scene.

The working sequence is:

1. Generate a new image/file ID for changed metadata.
2. Update affected element `fileId` values with `CaptureUpdateAction.NEVER`.
3. Call `addFiles` after those scene references exist.
4. Keep position, size, frame/group membership, and source reference unchanged.

With that sequence, Undo reversed the preceding drag while retaining the refreshed issue closed state and PR merged state. The final implementation uses the exported `newElementWith` utility rather than handcrafted version counters; the final drag/refresh/undo screenshot shows both updated cards rendered. Earlier mutation attempts exhibited image placeholders during refresh/undo, so production should still exercise rapid repeated refresh/undo and asset decoding rather than assume every transition is atomic.

The experiment deliberately regenerated every card on Refresh. The SDK retained both image generations: the 1,000-card scene had 2,000 files after one global refresh. This is not a production cache policy. Production should regenerate only changed source identities, share assets among repeated placements, and budget the cache/session lifetime. No public asset-pruning path was validated. Do not mutate undocumented caches; choose a safe editor reconstruction point if needed.

Generated SVGs contain private metadata. Reference-only application saves omit generated files and regenerate them after authorized metadata hydration. Native image downloads/clipboard can embed that metadata; access loss/logout must clear generated-image and history paths as well as the ordinary metadata cache. Security-driven reconstruction may clear undo history while preserving the sanitized layout. This behavior still needs production implementation and verification.

### tldraw comparison

tldraw correctly layered native annotations over HTML cards and clipped them inside frames. Its explicit `toSvg` renderer included metadata and clipping. Actual dragging, metadata-only refresh, undo, and snapshot restore worked. The custom-shape approach avoids the image-generation/cache layer and provides better hooks for richer cards.

- [HTML cards with native foreground annotation](evidence/tldraw-overlap.webp)
- [HTML card clipped by frame](evidence/tldraw-frame-clipping.webp)
- [Custom card SVG export](evidence/tldraw-svg-export.webp)

The SVG success is evidence for the implemented `toSvg` path, not proof that arbitrary HTML/foreignObject export always works. No licensed production deployment was exercised.

## Exploratory scale measurements

Actual browser: headless **Chrome 151.0.7922.34**, viewport 1440×1000, device scale factor 1.25, browser-reported 8 logical processors. The user-agent string reports Windows; no claim is made that this synthetic browser environment represents the owner's physical laptop/GPU.

The measurements below preceded the final switch from handcrafted element version counters to the SDK's `newElementWith` utility. The viewport workload is unchanged; refresh timings are exploratory measurements of that earlier mutation implementation, not precise benchmarks of the final captured code.

Method: production Excalidraw image variant; deterministic square-grid cards; predecode generated images and wait for animation frames; use 90 `requestAnimationFrame` intervals while updating viewport scroll via the public API. Two views: normal zoom with about 16 cards visible, and overview with all cards visible. One run at each size, not a statistically stable benchmark. Large scenes contain cards only; the separate three-card functional scene exercised drawings/text.

| Total cards | Detail-view p95 frame interval | Overview p95 frame interval | Reset + image decode + initial settling | Whole-scene refresh, synchronous work |
| ---: | ---: | ---: | ---: | ---: |
| 100 | 16.8 ms | 16.7 ms | 256 ms | 16 ms |
| 500 | 16.8 ms | 16.8 ms | 1,276 ms | 71 ms |
| 1,000 | 99.9 ms | 16.7 ms | 1,579 ms | 89 ms |

The 100/500-card runs stayed near the browser's 60 Hz cadence. The 1,000-card detail run had substantial frame spikes; the cause was not isolated. Do not infer that overview rendering is intrinsically cheaper or that every 1,000-card board behaves this way from one run. Refresh-to-decode-plus-two-frames measured approximately 46/248/337 ms respectively; those are not network refresh latencies.

Conclusion: boards in the hundreds look feasible for a personal tool. Validate mixed content, long sessions, memory, repeated refresh, and actual mouse/trackpad input on the owner's browser before promising a capacity. No memory profiling, network scaling, or tldraw performance ranking was performed.

- [1,000-card overview](evidence/image-1000-overview.webp)
- [Raw observations and timing results](evidence/results.json)
- Reproducible measurement source: `excalidraw/public/measure.js` on the prototype branch.

## Runnable primary-source capture

The throwaway source is retained on local branch **`prototype/canvas-feasibility`**, with a separate working tree at **`../gitboard-canvas-prototype`**. It is intentionally not production app code on the planning branch. No remote push is involved.

From the original repository, start either experiment:

```sh
npm --prefix ../gitboard-canvas-prototype/excalidraw run dev -- --host 127.0.0.1 --port 5173
npm --prefix ../gitboard-canvas-prototype/tldraw run dev -- --host 127.0.0.1 --port 5174
```

Run the commands in separate terminals if comparing side by side. Open `http://127.0.0.1:5173/?variant=image`, `http://127.0.0.1:5173/?variant=embed`, and `http://127.0.0.1:5174/`.

On a fresh machine/worktree, install first with `npm --prefix <prototype-directory> ci`. The branch contains `excalidraw/README.md` and `tldraw/README.md` with controls, exact fixture semantics, and reproduction instructions. `git worktree add ../gitboard-canvas-prototype prototype/canvas-feasibility` can recreate the sibling checkout if it is absent. Dependencies and build output are ignored, not committed.

## Implementation consequences

Following the user's choice, the [implementation plan](spec.md) now specifies:

- tldraw custom React/HTML issue/PR shapes, with an accessible list and detail sidebar. No Excalidraw fallback.
- Self-hosting usable by anyone who signs in through the GitHub App: upsert immutable GitHub user IDs, isolate each user's private boards and GitHub access, one Node app, SQLite on durable disk, HTTPS, and backup/restore. The former single-owner allowlist is superseded.
- GitHub App with baseline Issues/read, Pull requests/read, and Metadata/read. Keep mixed issue endpoint results; distinguish PR draft/open/closed-unmerged/merged with targeted enrichment. Validate weight/sprint/type source mapping before any extra Projects read-only permission.
- Read-only metadata; placement-preserving view filters; on-load, manual, and adjustable cost-aware scheduled refresh. Separate board-sharing permissions remain undefined; no collaboration, CI/review aggregation, or write-back is inferred.
- Reference-only tldraw document persistence with validated/versioned custom props; metadata stays in an authorization-aware cache outside the document and history. Explicit SVG rendering if visual export is included. Production licensing and tldraw performance/accessibility verification remain deployment gates.

The experiments answer the canvas feasibility question. They do not claim GitHub authentication, private-data revocation, durable storage, offline recovery, or a production app has been implemented.
