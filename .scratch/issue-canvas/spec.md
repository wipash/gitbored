# GitHub issue and pull request canvas

Status: ready-for-agent
Date: 2026-11-05
Testing boundary: application-level browser and public HTTP behavior, with a separate live GitHub smoke run; confirmed by the user.

## Problem Statement

GitHub issues and pull requests describe the work, but repository lists do not let the user arrange that work spatially alongside notes, drawings, and relationships. Work spans multiple repositories, primarily private repositories. The user wants a persistent canvas for understanding and organizing that work without turning spatial organization into changes to GitHub itself.

A useful canvas must preserve the user's arrangement as titles, labels, issue states, and PR states change. Newly discovered work must not appear at arbitrary positions or disrupt an existing layout. The user needs to decide which incoming items belong on the board and where they go. Visibility filters must hide irrelevant work without deleting placements or collapsing the layout.

The app will be self-hosted and usable by teammates who authenticate through the GitHub App. Sharing a deployment must not expose another person's boards, private repository data, or credentials. The interface should keep the canvas available rather than repeatedly interrupting work with modal dialogs.

## Solution

Build a desktop-first, self-hosted React and TypeScript application using tldraw custom issue and PR cards. Adopt Atlas's canvas-first appearance with both light and dark themes and the selected Contextual interaction model: details and controls open in non-modal panels anchored to cards or toolbar controls. The canvas stays interactive, with no modal backdrop or focus trap.

Users sign in through a GitHub App, create private boards, select authorized repository sources, and inspect work in an Incoming tray. Newly discovered issues and PRs remain unplaced until the user drags one onto the canvas or invokes Add to board. Users can move and duplicate placements, group work, use labelled frames, and add native text, drawings, and arrows.

Cards show read-only GitHub metadata. Loading a board, requesting a refresh, and scheduled refresh update metadata without changing placement geometry or undo history. Per-board view filters hide closed issues, merged PRs, and work that does not match label or planning-field rules; revealing it restores the same placements in the same positions.

Boards persist on the local/self-hosted application server and reopen across the owner's sessions and devices. The first iteration is expected to run locally for one user, perhaps a few; optimize for getting that useful workflow built rather than enterprise operation. Ordinary authorization checks, reference-only documents, revisioned saves, and explicit save errors protect private data and work. Keep one backend and SQLite, not a collaboration platform or fleet of services.

## User Stories

### Sign-in, ownership, and sources

1. As a user, I want to sign in through the GitHub App, so that I can use my existing GitHub identity without managing a separate application password.
2. As a teammate, I want to use the same self-hosted deployment after authorizing the app, so that access does not depend on a single-owner allowlist.
3. As a returning user, I want my account to remain the same when my GitHub login or email changes, so that I do not lose ownership of my boards.
4. As a board owner, I want my boards to be private to me, so that sharing the application does not implicitly share my planning work.
5. As a board owner, I want to create, name, reopen, and delete my boards, so that I can maintain separate planning contexts.
6. As a user, I want to select multiple authorized repositories for a board, so that related work is visible together even when it lives in different repositories.
7. As a user of private repositories, I want the app to explain missing installation access or organization approval, so that I can authorize the required sources without confusing app installation with sign-in.
8. As a user, I want to use repositories across authorized personal and organization installations, so that a board is not restricted to one repository owner.
9. As a user, I want to add a supported public GitHub issue or PR URL even when its repository is not in the installed-repository picker, so that public work can participate without implying private access.
10. As a user, I want repository browsing to retain both issues and PRs across pages, so that PR-shaped issue-list results are not silently discarded.
11. As a user, I want partially loaded results and local filtering to be identified clearly, so that I do not mistake a loaded subset for a complete repository search.
12. As a user, I want validated GitHub issue and PR URLs to resolve to the correct record kind, so that I can add known work directly without navigating a long repository list.

### Incoming and deliberate placement

13. As a board owner, I want newly discovered work to wait in Incoming, so that it does not appear at random canvas positions.
14. As a board owner, I want incoming items to show their repository, number, kind, title, and available status, so that I can decide what belongs on the board.
15. As a board owner, I want to drag an incoming item onto a chosen canvas location, so that I control its placement.
16. As a keyboard or single-pointer user, I want an Add to board action alongside dragging, so that placement does not require a drag gesture.
17. As a board owner, I want button-added work to appear in a predictable receiving area and be brought into view, so that I can find the placement immediately.
18. As a board owner, I want an incoming candidate to leave the tray only after placement succeeds, so that a failed or cancelled action cannot lose it.
19. As a board owner, I want repeated discovery of the same record to update its candidate rather than create another tray entry, so that Incoming does not fill with duplicates.
20. As a board owner, I want existing placements to remain untouched when new work arrives or is placed, so that my spatial arrangement remains meaningful.
21. As a board owner, I want Incoming to survive reopening the board, so that unplaced work does not depend on keeping one browser tab open.
22. As a board owner, I want incoming counts to be distinct from counts of placed cards hidden by filters, so that I can tell unplaced work from temporarily invisible work.
23. As a board owner, I want placement of a filtered-out item to be explained explicitly, so that I do not think the item disappeared or the action failed.
24. As a board owner, I want undo and redo of placement to keep the board and Incoming consistent, so that a candidate cannot be lost or simultaneously presented as unplaced and placed.
25. As a board owner, I want an empty Incoming state to say that there are no pending candidates, so that an empty tray is distinguishable from loading or failure.

### Canvas and card interaction

26. As a board owner, I want to pan, zoom, select, and move cards on an interactive canvas, so that I can organize work spatially rather than only as a list.
27. As a board owner, I want to select and move several objects together, so that I can rearrange a related area without moving every object individually.
28. As a board owner, I want to group and ungroup objects, so that relationships can be expressed through shared movement without changing GitHub metadata.
29. As a board owner, I want labelled frames, so that I can create named spatial areas and retain the canvas engine's native frame behavior.
30. As a board owner, I want freehand drawing, text, and arrows alongside cards, so that I can annotate and connect the work using the same canvas.
31. As a board owner, I want drawings and text to layer and clip correctly with cards and frames, so that cards do not unexpectedly cover native canvas content.
32. As a board owner, I want an explicit way to duplicate a placement, so that one GitHub record can appear in several planning contexts without duplicating its underlying identity.
33. As a board owner, I want adding an already-placed record normally to focus an existing placement, so that repeated picker actions do not create accidental duplicates.
34. As a board owner, I want deleting a placement to affect only the board, so that removing a card never closes, deletes, or edits the GitHub record.
35. As a board owner, I want undo and redo for canvas edits, so that mistakes in arrangement, grouping, insertion, and deletion are reversible.
36. As a user, I want cards to distinguish repository and number as well as issue/PR kind, so that identically numbered records in different repositories are not confused.
37. As a user, I want accurate issue and PR states, so that draft, open, closed-unmerged, and merged work are not conflated.
38. As a user, I want missing or still-loading PR detail to appear as unknown, so that incomplete data is not presented as a confirmed state.
39. As a user, I want bounded labels and assignees on cards and complete available metadata in details, so that cards remain readable without losing access to longer content.
40. As a board owner, I want card dimensions and positions to stay stable when metadata changes, so that a new title or label does not reflow the canvas or enlarge a frame.
41. As a user, I want an explicit Open in GitHub link, so that I can navigate intentionally while dragging and selecting cards never opens another page.

### Contextual panels and accessibility

42. As a user, I want details to open beside the selected card, so that I can inspect work without leaving the canvas or dedicating a permanent sidebar to it.
43. As a user, I want Incoming, filters, sources, and refresh controls to open from their toolbar controls, so that supporting controls remain available without dominating the workspace.
44. As a user, I want to select another card while a panel is open, so that inspecting several items does not require a close-and-reopen cycle.
45. As a keyboard user, I want meaningful focus when opening a panel and focus return when dismissing it, so that I can continue working without losing my place.
46. As a user, I want Escape and an explicit close control to dismiss contextual panels, so that dismissal does not depend on clicking outside them.
47. As a pointer user, I want clicking outside a contextual panel to dismiss it without swallowing the intended canvas or control interaction, so that the panel does not behave like a modal.
48. As a user, I want contextual panels to stay within the viewport and flip sides near edges, so that their content and close controls remain reachable.
49. As a keyboard user, I want list and control alternatives for inspection and insertion plus supported canvas keyboard operations, so that core work is not pointer-only.
50. As a screen-reader user, I want meaningful control names, card descriptions, and status announcements, so that canvas content and operation results can be understood.
51. As a user on a narrow window, I want usable controls and internal canvas scrolling without document-level horizontal overflow or obscured focus, so that the app remains usable even though desktop is the primary editing environment.

### Filtering and refresh

52. As a user, I want to hide closed issues independently from merged PRs, so that I can choose which completed work remains visible.
53. As a user, I want explicit include and exclude modes for selected labels, so that I can focus on relevant work or remove distracting categories from the view.
54. As a user, I want include and exclude rules for weight, sprint, and planning type, so that I can inspect work using the planning fields configured for my sources.
55. As a user, I want planning type to remain distinct from issue/PR kind, so that field filtering does not confuse a task category with a GitHub record kind.
56. As a user, I want active filter dimensions to combine predictably, so that the visible set reflects all my selected constraints.
57. As a user, I want confirmed unset values to be selectable and distinct from zero or unavailable data, so that incomplete or absent planning values are not misrepresented.
58. As a board owner, I want filters to hide placements without deleting, moving, resizing, regrouping, or reflowing them, so that the arrangement survives changes of focus.
59. As a user, I want a hidden-placement count and a clear Reveal all action, so that I can recover the full board and understand what the current lens excludes.
60. As a user, I want filter and refresh preferences to be scoped to my board view, so that changing them does not edit GitHub or another person's view.
61. As a user, I want current metadata when opening a board and an explicit Refresh action, so that I can request an up-to-date view when I need it.
62. As a user, I want an adjustable refresh schedule and a pause option, so that freshness can be balanced against GitHub request costs.
63. As a user, I want last-successful, next-scheduled, in-progress, paused, and backoff information, so that I know whether the view is current and when it will be checked again.
64. As a user, I want source-specific failures and stale data to remain identifiable when other sources refresh successfully, so that partial success is not presented as complete freshness.
65. As a board owner, I want refresh to update all placements of the same reference consistently without adding canvas history entries, so that undo still reverses my own canvas action rather than a background update.
66. As a deployment user, I want repeated references and overlapping refresh triggers to share work within my authorization context, so that refresh does not make redundant requests for every placement or tab.
67. As a user, I want hidden or inactive boards to pause scheduled work and revalidate when resumed, so that unused boards do not consume rate budget unnecessarily.
68. As a user, I want closed or merged work to remain placed even when it disappears from an open-only discovery list, so that discovery results cannot erase my board.

### Persistence, access loss, and operation

69. As a board owner, I want the same arrangement to reopen after a reload, backend restart, or new authenticated browser session, so that the canvas is durable rather than a temporary local sketch.
70. As a board owner, I want saving, saved, unsaved, and conflict states to reflect acknowledged persistence, so that I know when work is safely stored.
71. As a board owner using two tabs or devices, I want conflicting saves to preserve my local work and offer recovery, so that an older revision cannot silently overwrite a newer one.
72. As a board owner, I want an account-scoped recovery draft, so that an interrupted save can be recovered without replacing a newer server document silently or exposing another user's draft.
73. As a board owner, I want a reference-only JSON export and validated import, so that I can recover or move a board without packaging credentials or a private metadata cache.
74. As an importing user, I want references to be resolved under my own GitHub authority, so that an imported board cannot grant access I do not have.
75. As a user, I want unavailable references to retain anonymous placements and geometry, so that losing access does not destroy the layout or leave private metadata visible.
76. As a user, I want logout and account switching to clear private metadata and details, so that the next session cannot see the previous user's cached information.
77. As a user, I want expired or revoked credentials to pause affected work and guide reauthorization, so that scheduled refresh never falls back to broader installation authority.
78. As a user, I want temporary failures, unavailable access, and unresolved records to be distinguished, so that a private-resource 404 is not falsely described as a deletion.
79. As a deployment operator, I want one straightforward application deployment with durable storage, protected credentials, and HTTPS when exposed beyond loopback, so that a small local-first tool remains maintainable.
80. As a deployment operator, I want a documented and exercised backup/restore procedure, so that server failure does not make browser storage the only remaining copy of boards.
82. As a user, I want representative mixed-content boards to be measured on the selected engine and target hardware, so that responsiveness claims reflect the actual product rather than another engine's benchmark.
83. As a user, I want both light and dark themes, so that the canvas and contextual controls remain comfortable and readable in my preferred environment.

## Implementation Decisions

### Settled direction and engineering boundary

- Use tldraw with custom React/HTML issue and PR card shapes. The user tried both engine prototypes and selected tldraw. Do not implement an Excalidraw fallback, runtime engine switch, or generic multi-engine abstraction.
- Use Atlas's visual language with light and dark themes and Contextual anchored, non-modal panels. Inspector and Shelf are retained prototype comparisons, not production interaction modes. Do not ship the development comparison switcher.
- This is a desktop-first tool for one user, perhaps a few, most likely run locally in its first iteration. Favor a complete useful workflow and plain implementation over speculative misuse, rare-outage handling, or infrastructure for hypothetical scale. Keep ordinary ownership checks and protection against accidental data loss. Narrow widths must not break controls, obscure focus, or cause document-level horizontal overflow; full mobile canvas-editing parity is not promised.
- Use React, TypeScript, and Vite on the client, one TypeScript/Node backend using Fastify, and SQLite on local durable disk. Use a single application origin, defaulting to loopback HTTP for local operation and HTTPS when exposed beyond loopback. No independent worker fleet, shared-board synchronization service, or separate database service is needed.
- Planned module responsibilities are the board workspace/editor, revisioned board persistence, and GitHub access. The workspace composes Incoming, contextual controls, and view preferences. GitHub access owns authorized retrieval, normalization, and refresh coordination. These are internal responsibilities, not separately deployed services.
- The important boundary is canvas document versus authorized GitHub metadata. Prefer the selected SDK's native APIs rather than a second layout, grouping, selection, or undo model.

### Repository connection UX (Sean's redesign request, 2026-11-06)

- Finding a known repository must accept owner/name or a GitHub repository URL directly, without paging through installations. Recent account-owned shortcuts carry across Sources and boards; opening them rechecks access.
- Sources distinguishes browsing issues from connecting a repository to a chosen board. Preserve the chosen repository through board selection/creation. Board connection uses a normal page section above the mounted canvas rather than nesting a source browser inside the Incoming tray. Connecting a new source loads the first bounded issue/PR page into Incoming; canvas placement stays deliberate. Installation browsing and individual issue URLs remain secondary paths.

### Authentication and private ownership

- Anyone who successfully authorizes through the GitHub App may sign in. Upsert the application identity using GitHub's immutable user ID; mutable login and email are display attributes. Do not retain the superseded single-owner allowlist.
- Boards belong to their creator and are private. Enforce ownership on board list, load, save, deletion, export, Incoming operations, and reference-resolution requests. A teammate's login, a shared installation, or possession of a board/reference ID grants no access to another user's board.
- Use the GitHub App user web authorization flow with state validation and PKCE, server-side code exchange, HttpOnly session cookies, and CSRF protection for state-changing application operations. Use Secure cookies for HTTPS deployments and a clearly scoped loopback HTTP configuration for local operation. Prefer expiring user access tokens with supported refresh and reauthorization handling.
- Keep tokens and refresh tokens encrypted on the server. They must not enter shape properties, snapshots, exports, logs, browser storage, or client responses.
- Initial repository permissions are Issues: read, Pull requests: read, and required Metadata: read. Do not request Contents, Checks, Actions, Commit statuses, organization Members, or write permissions for this feature. Add Projects read permission only after proving its necessity for the selected planning-field mapping.
- Use the relevant user's GitHub App user token for interactive, scheduled, and import-related reads. Access must remain the intersection of that user's authority and the app's authority. Installation tokens are not a fallback when a user loses access.
- Support authorized installations across repository owners, including organization approval requirements. Public URL reads outside the installed-repository picker remain possible under GitHub's public-read rules; that does not imply installation or webhook coverage.
- Scope repository discovery, credentials, normalized metadata, conditional validators, refresh coordination, recovery drafts, and in-flight results by user/authorization context. Clear account-scoped client state on logout or account change, including ignoring late responses from the previous context.

### Identity, documents, and card rendering

- Each issue or PR has an immutable internal item reference. Its registry records GitHub host, repository identity, record kind, opaque node identifiers, separately named REST issue/PR identifiers, and mutable URL/number locators. Repository name plus number is not the immutable identity. Preserve provider identifiers losslessly and remap only on trusted provider evidence.
- Each canvas placement is an independent native tldraw shape referencing an item reference. Persist validated, versioned reference/kind/dimension properties; native shape records own position, parent/frame membership, rotation, and stacking. Multiple placements share metadata but retain independent geometry and shape IDs.
- Register a custom box shape utility with an HTML container. Keep title, state, labels, assignees, timestamps, planning values, and authorization/freshness status in an authorization-aware metadata cache outside the document and history. Card rendering subscribes to cached data; it does not issue a network request per placement.
- Cards distinguish repository/number and issue/PR kind, show a bounded title/label/assignee presentation, and expose full available values through details. Do not fetch bodies or comments merely to render a card. Render provider text as text, not arbitrary HTML.
- Issues show open/closed and state reason when available. PR normalization distinguishes merged, closed-unmerged, draft, and open. Missing enrichment is unknown or detail-loading, never assumed unmerged. Freshness and access status are separate from workflow state.
- Metadata refresh must not replace the document, move or resize cards, expand frames, create layout saves, or enter undo history. A refreshed value may change filter visibility, but not saved geometry.
- Let the canvas own noninteractive card-body input for selection and dragging. Only explicit links or controls take pointer ownership. Construct supported GitHub links deliberately; dragging must never navigate.
- Use native text, drawings, arrows, grouping, frames, stacking, selection, and history. Preserve layering and frame clipping. Custom-shape schema evolution requires migrations. Reference-aware copy/paste and import must validate and authorize referenced items rather than copy private caches into documents.
- Adding an already-placed source through the ordinary picker focuses an existing placement. Creating another placement requires an explicit duplicate/copy action. Deleting a placement is a canvas-only operation, and closing or merging upstream work never deletes a placement.

### Incoming discovery and placement

- Incoming is the unplaced queue for a board's selected repository sources. It is not a set of cards hidden by filters, and discovery never automatically inserts a canvas shape.
- **Synthesis defaults for previously unspecified queue behavior:** persist queued item references and discovery bookkeeping per board on the server; hydrate their metadata under the current user's authority. Discover through authorized, paginated reads of explicitly selected sources rather than a deployment-wide crawl or an automatic mirror of every repository.
- Treat an incoming item as newly discovered to that board, not necessarily newly created on GitHub. Initial source browsing can yield existing records. Follow pagination, retain completeness/cursor information, and expose partial/loading/error states; do not claim that an initial page is the full source. The source's discovery selection and the board's view filters are separate concepts.
- Source reconciliation runs with the same cost-aware refresh coordination used by the board. Preserve progress between bounded discovery passes so pagination does not silently omit candidates or restart unbounded work on each refresh. Reconcile authorized source results; do not infer deletion or access loss from absence in a filtered page.
- Deduplicate candidates by item reference within a board. Rediscovery updates an existing candidate. References already placed on the board do not enter Incoming merely because metadata changes. Keep enough seen/placement bookkeeping that intentionally deleting a placed card does not silently requeue it on the next discovery pass. Explicit browsing or a URL can add that record again.
- Dragging a candidate uses the real tldraw screen/page/parent coordinate conversion, including pan, zoom, and frame transforms. Insert only on a successful drop onto the canvas; cancelling, dropping elsewhere, or receiving an invalid drag leaves both queue and document unchanged.
- Add to board is the non-drag alternative. Use a predictable labelled receiving area, without moving or reflowing existing objects, and bring the new placement into view. The receiving-row behavior is carried forward from the interaction prototype; precise spacing is a UI detail rather than a separate layout engine.
- Placement consumes the queue entry as one logical board operation. Persist the document change and queue consumption consistently against the board revision. If saving fails, retain a recoverable unsaved operation and truthful save state; do not permanently discard the candidate without its placement.
- Undoing the first placement from Incoming restores the candidate when no other placement references it; redo consumes it again. Explicit duplicate operations do not manufacture or consume an Incoming entry. Coordinate these transitions with native editor history rather than implementing an independent canvas undo stack.
- Incoming candidates remain independent of board view filters. If a newly placed item is hidden by the active lens, announce the placement and why it is hidden; do not silently reset filters, lose the candidate, or claim the drop failed. Give the user the existing Reveal all path.
- After visible button placement, close the contextual tray and focus the revealed card so the panel cannot obscure it. If filters hide the result, keep useful focus in the tray and announce the outcome. Native drop may leave the tray open for further placements. Announce queue counts, loading, errors, and the empty state without treating a fetch failure as an empty queue.

### Contextual controls and view filters

- Card selection opens details anchored to that card. Incoming, filters, sources, and refresh settings open from their toolbar controls. Panels flip and clamp to the viewport and reposition with scrolling/resizing. At narrow widths, keep controls bounded, scrollable, and dismissible.
- These are non-modal regions, not modal dialogs: no backdrop, inert canvas, or focus trap. Selecting another card updates details directly. Outside-pointer dismissal must not consume the underlying action or race the opening of another panel. Starting a drag inside Incoming must not dismiss it.
- Provide an explicit close control and Escape dismissal. Opening moves focus appropriately to the panel heading; explicit dismissal returns focus to a connected trigger when appropriate. Outside dismissal must not steal focus from a newly activated control. A removed or hidden trigger needs a sensible surviving workspace control rather than focus on a detached node.
- Supply meaningful shape descriptions, labelled native controls, a keyboard-accessible list/detail path, and status announcements. Verify actual selection, insertion, movement, grouping, deletion, link activation, and focus behavior on the chosen canvas. HTML rendering is not itself proof of accessibility.
- View state is scoped by user and board, outside the document. Preserve appropriate filter, camera, and refresh preferences without making them GitHub writes. Selection and active tool are session concerns, not shared board content.
- Support independent Hide closed issues and Hide merged PRs controls plus include/exclude rules for labels, weight, sprint, and planning type. Combine active dimensions with AND. Within label Include, match at least one selected label; within Exclude, reject any selected label. An empty selected-label set adds no label restriction.
- Concrete planning-field rules do not match confirmed unset values; provide explicit Unset and Is set semantics. Unset weight is not zero, and unset sprint/type is not a fabricated value. Do not silently coerce unavailable or unfetched fields into unset. Mark filtering incomplete when necessary rather than asserting a complete matching set.
- Hide nonmatching placements from display and interaction without deleting, moving, resizing, reparenting, regrouping, or reflowing them. Hidden counts count placements, including repeated references, not merely distinct GitHub records. Reveal all clears active restrictions and restores original placements in place.
- Planning type is distinct from issue/PR kind. Weight, sprint, and type are not assumed to be universal GitHub issue fields. Define authorized mappings with source/field provenance, normalization, explicit cross-source precedence, and unset/unavailable behavior. Conflicting or unconfigured mappings must not invent a value.
- The exact project/field identifiers and provider permission/query coverage require real source configuration and integration proof. Keep unsupported fields visibly unconfigured until mapped. Do not promote fixture planning values or a successful fixture filter into a claim of working GitHub Projects integration.

### GitHub retrieval, freshness, and access loss

- Use the mixed repository issues listing and shared issue detail for common fields, retaining PR records identified by the provider's PR marker. Follow pagination even when a page contains only PRs or kind filtering removes its visible items. Validate supported GitHub issue/PR URLs and construct API requests rather than proxying arbitrary supplied URLs.
- Enrich selected PRs with the PR detail endpoint when required fields are absent. Shared responses may include draft/merged information but are not guaranteed to provide every status field. A separate PR-only listing can support explicit PR browsing without becoming a second mandatory repository mirror.
- Use authorized GraphQL node resolution where needed for imported references, with both Issue and PullRequest handling. Verify rename/transfer and node-resolution behavior with real integration evidence; do not assume every provider identifier is stable across every migration.
- Refresh placed references independently from the discovery query, including placements currently hidden by filters. Deduplicate repeated references within an authorization context and coalesce overlapping load/manual/scheduled work. Avoid multiplying refresh work across tabs. Use conditional requests where supported.
- Offer on-load, manual, and adjustable scheduled refresh, including pause. Select defaults and adjustment bounds from measured request costs, PR enrichment, planning-field queries, source volume, latency, and remaining rate budget. The prototype's approximate cadence is illustrative, not a production default or measurement.
- Pause scheduled work for hidden/inactive boards and revalidate when they become active. Honor retry/reset information and central backoff on rate limits. Expired or revoked user credentials pause affected work and require supported refresh or reauthorization, never an installation-authority bypass.
- Track last successful refresh, next scheduled action or pause/backoff reason, in-progress state, and per-source freshness/errors. Partial success is not whole-board success. Previously seen session data may be shown as stale after transient failure, but that failure does not renew authorization.
- Authorize delivery of private metadata, including cached responses and export hydration, through user-authorized reads of the delivered representation or authorized node lookup. A common issue read does not authorize cached PR enrichment after Pull requests permission is lost. Scope private caches to authorization context and do not use a shared CDN cache for private data.
- Distinguish unauthorized/unavailable, unresolved/missing, transient failure, and successful refresh. A private-resource 404 does not prove deletion. On detected access loss, remove affected fetched metadata and show anonymous unavailable placements while retaining geometry. Undo must not resurrect revoked titles or labels because metadata is absent from document history.
- Clear in-memory metadata, details, and in-app visual export previews on logout/account change. Do not persist private query caches in the browser. Already seen information, user-authored notes, and downloaded exports cannot be retracted. Polling and revalidation do not provide instantaneous detection of every upstream permission change.

### Persistence, recovery, and deployment

- Store application users, encrypted credentials and sessions, authorized reference contexts, board ownership/title, versioned SDK document snapshots, revision numbers, per-board Incoming bookkeeping, and user view preferences in the application database. Keep native geometry in the SDK document rather than duplicate layout tables.
- The board load contract returns an authorized document and revision. Save supplies an expected revision and a validated new document, including consistent queue effects where applicable. The planned HTTP contract uses GET and PUT on the board resource. Successful saves advance the revision atomically; stale revisions return a conflict instead of silently overwriting another save.
- Coalesce document-scope saves. Distinguish Saving, Saved, Unsaved, and Conflict using server acknowledgements. Preserve the local draft on conflicts and offer reload or save-as-copy. This addresses ordinary two-tab/device collisions without pretending to support live collaboration.
- A local recovery draft is scoped by account and board and is not a second persistence authority. Never silently apply it over a newer server revision. Browser storage may be cleared or evicted; server storage and backups remain the durable source.
- JSON export contains the document and a reference manifest mapping internal references to provider identity, not credentials or a fetched private metadata cache. User-authored notes can still be sensitive; exports are intentional, not public by default.
- Import validates file size, schema, allowed record types, and references before creating a new board. Resolve and remap references under the importing user's authority. Preserve unavailable placements for unresolved sources without exposing another user's cached content. Reject unsupported future schemas safely and support explicit migrations for older supported schemas.
- Disable unrelated native entry points for arbitrary embeds, external uploads, image ingestion, or URL unfurling. These are not needed to express issue/PR cards, text, drawings, arrows, groups, and frames.
- Default to a local loopback deployment with protected server credentials, a durable database directory, and a straightforward documented backup/restore procedure; use HTTPS if exposing the application beyond loopback. Keep encryption-key recovery protected. Avoid adding automated backup infrastructure or high-availability services merely to satisfy this local-tool scope.
- Target normal boards in the hundreds of placements as a measurement goal, not a promised capacity. Measure the pinned production tldraw build on representative desktop hardware with mixed drawings/text, realistic metadata, repeated refresh, and long sessions. Include memory and input latency, not only average frame timing.

## Testing Decisions

### Approved primary seam

- The user selected **application boundary plus live GitHub smoke**. Prefer one primary test boundary: the running application's browser UI and public HTTP endpoints, backed by the real application services and an isolated real SQLite database.
- For deterministic automated scenarios, replace only the external GitHub HTTP service with a controlled test service. Exercise the real client, canvas engine, server routes, authorization checks, persistence, reference handling, and refresh coordination. The test service supplies controlled provider responses and timing; it is not a production fallback or evidence of real GitHub permissions.
- Use HTTP requests against the running application for unauthorized operations and conflict cases that the UI correctly prevents users from issuing. This is the same application boundary, not a second internal testing interface. Use browser interactions for hit testing, focus, drag/drop, filtering, history, and rendering.
- Use isolated users, boards, databases, provider fixtures, and deterministic scheduling controls. Assert observable outcomes, persisted reopening, privacy boundaries, and meaningful network effects. Do not assert component trees, copied configuration values, private helper calls, CSS/source text, mock forwarding, or incidental wording.
- Do not require a separate component-by-component unit-test suite. Add a lower-level seam only if a genuine consumer-visible invariant cannot reasonably be exercised at the application boundary; explain that need rather than scattering testing hooks through the codebase.

### Modules and externally observable scenarios

1. **Identity and ownership:** two independently authorized users can sign in on one deployment, retain identity after a login rename, and create private boards. Attempt cross-user list/load/save/delete/export, Incoming, and reference requests directly; no board, metadata, credential, recovery draft, or in-flight result crosses accounts.
2. **Source retrieval:** mixed issue/PR pages, PR-only pages, multiple repositories with the same record number, pagination, kind filtering, partial results, URL resolution, and absent PR enrichment produce accurate identities, completeness, and states. A missing field must not be silently normalized to a confirmed workflow state.
3. **Incoming and placement:** discovery adds candidates without adding canvas shapes; rediscovery deduplicates; queued and placed references remain consistent across reopen. Native dragging at different pan/zoom positions and inside frames produces the intended placement. Cancelled, invalid, or out-of-canvas drops leave the candidate intact. Existing coordinates remain unchanged.
4. **Non-drag insertion and history:** keyboard Add places and reveals an item predictably, closes an obstructing contextual panel, and focuses a usable target. Hidden-by-filter placement announces the outcome without resetting the lens. Placement/save failure retains recoverable work; undo/redo reconciles queue membership; normal repeated add focuses an existing placement and explicit duplication creates an independent shape.
5. **Real canvas behavior:** select, drag, multi-select, group/ungroup, frame, draw, type, stack, clip, duplicate, delete, undo, and redo using the actual SDK. An explicit link navigates while a drag never does. Persist and reopen mixed content with references and relationships intact.
6. **Contextual UI:** switching directly between cards updates details while the canvas remains interactive. Check heading focus, Escape/close return, outside-pointer behavior, anchor replacement, viewport edge flipping, scroll/resize positioning, Incoming drag initiation, and missing/hidden triggers. No panel introduces a backdrop or focus trap.
7. **Filters:** independent closed/merged controls, multi-label include/exclude, planning-field include/exclude, AND combinations, unset versus zero, and unavailable/unfetched values. Verify hidden-placement counts with repeated references, empty-result recovery, and reveal-all restoring positions, parentage, dimensions, and grouping. Incoming remains separate.
8. **Metadata and refresh:** upstream issue/PR transitions update content and filter membership without geometry changes, document saves, or undo entries. After refresh, undo still reverses the user's preceding canvas action while metadata remains current. Repeated references use shared authorized retrieval.
9. **Refresh coordination:** load/manual/scheduled overlap coalesces, inactive boards pause, reactivation revalidates, multiple tabs avoid redundant work, conditional responses preserve authorized results, and rate limits back off centrally. Check last/next and per-source partial failure states, including credential expiry and reauthorization. Assert meaningful request behavior rather than timer implementation details.
10. **Access loss:** revoke private access or PR enrichment permission, switch accounts while a request is in flight, and log out with details open. Affected metadata disappears from cards/details/client state while placements survive; undo and cached responses cannot restore it. Distinguish transient stale display from renewed authorization and distinguish a private 404 from proven deletion.
11. **Persistence and portability:** restart the server and reopen as the owner; exercise expected-revision conflicts, failed/out-of-order saves, explicit recovery, and save-as-copy. Round-trip validated JSON with text, drawings, groups, frames, bindings, and reference remapping; reject invalid or unsupported future documents without damaging the original. Imported references hydrate only under the importing user's authority.
12. **Accessibility and layout:** complete core list/control workflows with the keyboard, inspect meaningful card descriptions and status announcements, and perform a real screen-reader smoke run. Check desktop usability and narrow-width control reachability, internal canvas scrolling, and unobscured focus. Pointer automation alone does not certify touch or screen-reader behavior.
13. **Operational acceptance:** verify the production build, durable storage, and backup restoration. Verify loopback HTTP for local operation and HTTPS before exposing it beyond loopback. Measure representative mixed-content boards and report device/browser and dataset assumptions. Do not extrapolate another engine's results into a tldraw performance claim.

### Live GitHub gate and prior art

- Before claiming the feature complete, run a live GitHub smoke scenario with the actual App configuration and two independently authorized users. Prove private repository access, organization/installation approval, user-token refresh or reauthorization, required Issues/Pull requests permissions, and lack of cross-user board/metadata exposure. Verify at least one real configuration for each promised planning-field mapping and any additional read permission it requires.
- Exercise the actual provider behavior relevant to public URL access, PR enrichment, node resolution/import, source access changes, and conditional requests. Use permitted test repositories and controlled access changes; do not infer these guarantees from the controlled HTTP service.
- Existing prior art is browser-observed prototype behavior, not a production automated suite. The tldraw feasibility study exercised HTML-card/native-content stacking, frame clipping, drag, metadata refresh outside document history, undo, explicit snapshot reload, and custom SVG rendering. The Atlas study exercised native Incoming drag in all three layouts, fixed existing coordinates, keyboard Add, filters, focus return, contextual edge placement/dismissal, and narrow layouts.
- The prototype uncovered an obscured-focus bug after contextual Add at narrow width; the fix closed the panel and the focused card was observed unobscured. Preserve this as a consumer-visible regression scenario in the application-level suite.
- The prototypes did not establish real authentication, durable server persistence, schema migration, live planning-field mapping, touch support, or screen-reader conformance. Build the new suite around the approved seam rather than treating prototype inspection helpers as permanent application interfaces.

## Out of Scope

- Writing GitHub data: creating/editing/closing issues, merging or reviewing PRs, changing labels, or writing Projects fields.
- CI/check aggregation, review summaries, mergeability analysis, and permissions required only for those features.
- Shared boards, membership roles, invitations, public share links, simultaneous collaborative editing, multiplayer cursors, or a WebSocket synchronization service. Multiple app users do not imply any of these.
- Excalidraw support, engine fallback, a canvas-engine abstraction, or retaining Inspector/Shelf as production UI modes.
- Automatic canvas placement of newly discovered work, automatic reflow of existing placements, a custom workflow/kanban engine, or mirroring every GitHub repository into the document.
- GitHub Enterprise Server or arbitrary GitHub-compatible hosts without a separately agreed host/configuration extension.
- Arbitrary web embeds, file uploads, image ingestion, general URL proxying, and URL unfurling.
- GitHub search as an unlimited repository crawler or a claim of complete repository coverage from a partial page.
- Webhook-based synchronization for the initial implementation. On-load, manual, and scheduled refresh are required; webhooks can be evaluated later without replacing request-time authorization and reconciliation.
- Visual image/SVG export as a required initial deliverable. If later exposed, it must render custom cards and clipping correctly from a consistent authorized metadata snapshot and disclose private-data implications. JSON recovery/portability export remains in scope.
- Full mobile editing parity, an offline-first architecture, a high-availability service topology, or unmeasured capacity and freshness guarantees.
- Instantaneous revocation of information a user already viewed, copied into their own notes, or downloaded.

## Further Notes

### Decision provenance and remaining acceptance gates

- The user selected tldraw after comparing real engine prototypes, selected Atlas's visual style, then selected Contextual after comparing the non-modal interaction variants. The user specifically requested Incoming so new work could be dragged onto the board rather than dumped into random positions.
- The user subsequently required dark theme, confirmed that the first iteration will most likely run locally for one or a few users, and requested periodic rendered-UI reviews by Claude Fable through herdr-core. Interface implementers must use the `better-interface` skill. Delivery should stay lightweight and favor reversible implementation defaults over unnecessary blocking.
- Multi-user GitHub App sign-in supersedes the former single-owner restriction. Boards remain private per creator; collaboration was not requested. Read-only filters and cost-aware on-load/manual/scheduled refresh remain required.
- The Incoming persistence, deduplication, seen-record handling, and undo consistency rules above are explicit synthesis defaults for details not exercised as durable behavior in the fixture prototype. They preserve the requested distinction between discovery and deliberate placement without introducing automatic arrangement.
- Status `ready-for-agent` means the specification is published for implementation and decomposition; it does not claim the application exists or is ready to deploy. Real App installation/organization authorization, configured planning-field mappings and permission coverage, durable restore, accessibility, and representative performance remain acceptance gates. Do not silently omit a promised field or replace private integration with fixtures to pass them.
- No fixed refresh cadence or capacity is selected by this spec. Measure request costs and the pinned production engine, then choose documented conservative defaults. Keep configurable provider field identifiers and operator credentials out of source-controlled examples containing real private data.
- Implement vertical slices against the application boundary. Establish the document/reference contract and local workspace, add authorized GitHub access and Incoming reconciliation, complete durable ownership/recovery, and verify the full live workflow. These are implementation steps, not permission to deliver a narrowed subset as the finished feature.

### Sources and captured primary evidence

- [Canvas research](canvas-research.md), [GitHub integration research](github-research.md), and [real canvas experiment report](experiments.md) retain the underlying API sources, observations, and historical recommendations. Current decisions in this spec supersede the earlier Excalidraw recommendation and single-owner assumptions.
- Engine prototype: local branch `prototype/canvas-feasibility`, capture `fe09b8f`.
- Initial appearance comparison: local branch `prototype/ui-directions`, capture `b953068`; Atlas selected.
- Non-modal interactions and Incoming: local branch `prototype/atlas-interactions`, capture `6dccd20`; Contextual selected. The sibling prototype worktree is `../gitboard-canvas-prototype`. Its `tldraw/README.md` documents reproduction and limitations; `atlas-evidence/observations.json` and the accompanying screenshots preserve observed checks.
- Prototype refresh cadence, planning values, repositories, and Incoming items are fixtures. The comparison source is a primary design reference, not production code to promote unchanged.
- The repository's local Markdown tracker and canonical `ready-for-agent` status apply to this published spec. Project-management guidance describes subsequent implementation tracking; this task does not create or claim implementation tickets, start a development team, or push changes.

## Accepted desktop redesign — 2026-11-06

Sean authorized implementation after reviewing the [interactive design](../desktop-redesign/proposal.html) and [desktop audit](../desktop-redesign/audit.html). These decisions supersede earlier layout and placement requirements where they conflict:

- The canvas fills the desktop viewport. Small, sharp floating controls replace the page header, large whitespace, and normal-flow source section. Root restores the last board; board selection/creation happens over the workspace.
- Internal navigation keeps the document alive and drains saves before leaving. Theme applies before first paint.
- Repository search filters preloaded results as the user types. Connection offers state/type/label import filters. Incoming automatically continues pagination, supports transient filters, checkboxes, selected/all-matching add, and retains its panel after placement. All matching means every source page, never just loaded results. Errors stop automatic retries and expose explicit retry.
- Adding a card or a batch never changes the camera or existing placements. A batch is one native undo operation, including restoring Incoming membership.
- Cards use compact iconography, readable full details, native resizing, and optional mapped GitHub Project Status, Weight, Priority, and Sprint values. Project membership and field IDs are explicit; zero, unset, and unavailable differ. Private metadata stays outside the canvas document/history.
- Related references use generic, undirected connections. View mode is Off / Selected / All, default Selected. Exact closes/blocks semantics are unnecessary. Connections are an overlay and do not create native arrows or change geometry.
- Keep the faint dot grid and dark theme. Ordinary menus contain labels, counts, and actions without implementation explanations or promotional subheaders.

Implementation state and evidence: [desktop redesign](../desktop-redesign/IMPLEMENTATION.md).
