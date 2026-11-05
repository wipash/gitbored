# GitHub integration research for issue and pull request canvas

Retrieved: **2026-11-05**. Original scope: GitHub.com, read-only issue metadata, multiple repositories, public and private access. **Current scope revision, same date:** self-hosted app usable by anyone who authenticates through the GitHub App, including teammates using the same deployment; primarily private repositories; **both issues and PRs**; private per-creator boards; view filters and on-load/manual/scheduled refresh. Primary sources and original research provenance are retained below. No authenticated API experiment, implementation, or verification run was performed by this researcher. This revision adds product requirements, not new API research.

**Superseded assumptions:** the original issue-only recommendation excluded PRs and avoided Pull requests permission; a later personal-use recommendation allowlisted one immutable GitHub user ID and excluded additional users. Neither is current. Keep PRs and upsert each signed-in GitHub identity by immutable user ID. Isolate credentials, repository authorization, caches, and boards per user. Board-sharing permissions remain a separate undefined decision; sharing the deployment does not imply team boards, invitations, or live collaboration. Keep metadata separate from canvas geometry, and preserve anonymous placements on access loss. SQLite on durable self-hosted disk with consistent backups remains a recommendation. Public/local-only demos remain throwaway experiments, not proof of private support.

**Evidence notation:** “Documented” statements describe the linked primary source. “Recommendation” is a proposed app design, not an API guarantee. Explicit unknowns appear in §10.

## 1. Decision summary

**Recommendation: use a GitHub App, a small backend-for-frontend, and user access tokens for interactive GitHub reads.** For the settled issue-plus-PR scope, request repository **Issues: read**, **Pull requests: read**, and required **Metadata: read**. Issues/read covers the shared issue-list/detail endpoints; Pull requests/read permits PR-specific list/detail enrichment. No Contents, Checks, Actions, Commit statuses, Administration, organization Members, or write permission is needed for the proposed metadata cards. The current permissions table marks PR detail as supporting alternative permission sets; choose the narrow Pull requests read path rather than broad Contents access. No CI/review-summary functionality is promised merely because PR read access exists. GitHub recommends user tokens for actions on behalf of users because installation access alone can expose resources the user cannot access. [Permissions][permissions] [PR permissions][pr-permissions] [PR API][pulls] [App security][security]

The weight/sprint/type mapping requested later is **not covered by a verified field/permission contract here**. Choose actual Projects/custom-field/label or supported native-field sources first. Projects read-only access may be needed, but its exact permission and query coverage are unproven; do not request extra permissions until that mapping gate is resolved.

Use REST for the initial import/detail/refresh implementation: a **shared issue/PR list**, optional per-record detail/enrichment requests, and no duplicate repository mirror. Add a small GraphQL node-resolution path for canonical identity lookup; adopt broader GraphQL fetching only when measured volume or selective-field needs justify it. REST issue responses supply common metadata and identify PRs by `pull_request`; complete PR status may require additional fields from PR detail. GraphQL adds typed Issue/PullRequest handling, independent connection cursors, and query-cost handling. [REST issues][issues] [PR API][pulls] [GraphQL calls][graphql-calls] [GraphQL pagination][graphql-pagination]

**Refresh is not “real-time.”** Current scope includes refresh on load, an explicit Refresh button, and adjustable cost-aware scheduled refresh with visible last/next status. Exact cadence is a measurement gate, not an API guarantee; see §7. Webhooks remain optional and do not replace request-time user authorization or scheduled/manual reconciliation. GitHub does not automatically redeliver failed webhooks. [Webhook failures][webhook-failures] [App security][security]

## 2. Authentication options and their actual boundaries

| Option | Documented access and permissions | Practical implication / recommendation |
|---|---|---|
| Tokenless browser REST | Public data only; 60 requests/hour per originating IP. REST supports CORS from any origin and exposes pagination, ETag, and rate headers. [REST limits][rest-limits] [CORS][cors] | Good zero-onboarding public demo. A shared NAT shares the budget; a tokenless server proxy concentrates callers on the server IP. Cannot meet private-repository acceptance. No installation means no app webhooks for arbitrary third-party repositories. |
| OAuth App, user OAuth token | User-authorized, scope-limited access; private repository issues require broad `repo`, which includes read/write code and other resources. No equivalent narrow read-only-private-issues scope. OAuth no-scope grants public read-only information; do not request `public_repo` merely to read public REST data. Organization policies can require owner approval. [Comparison][comparison] [OAuth scopes][oauth-scopes] | Easier user-centric discovery when installation is unacceptable, but overprivileged for this app. Not recommended for the default. OAuth is not a way around a user's missing repository access or org approval. |
| GitHub App, user access token (UAT) | Private access is the intersection of user access, app permissions, and installed repository selection. Each user authorizes separately. Apps have implicit public-read access when acting as a user, including REST and GraphQL. [User authority][user-authority] [Permission selection][permission-selection] | Preferred interactive access. Public read may work without an installation on a third-party public repo; private reads and installation webhooks require the relevant installation. Do not generalize the private intersection restriction into “every public read requires installation.” |
| GitHub App, installation access token (IAT) | Acts as app installation independently of a person. Repository/permission scope comes from installation, not current viewer. Can narrow token repository IDs/permissions at issuance; token expires after one hour. [Installation tokens][installation-tokens] | Not the authority for current scheduled user-board refresh. A later separately scoped reconciliation process may update an installation cache, but **never use successful IAT reads as proof that a user may see data** or as fallback for lost user access. |

A GitHub App uses OAuth authorization to issue UATs; “GitHub App versus OAuth App” is an application/permission-model choice, not “OAuth protocol versus no OAuth.” GitHub recommends Apps for fine-grained permissions, selected repositories, short-lived tokens, and centralized webhooks. [Comparison][comparison]

### Credential boundaries

Documented: the current UAT web flow uses `https://github.com/login/oauth/authorize`, then a POST exchange at `https://github.com/login/oauth/access_token`; docs strongly recommend random `state`, PKCE with `S256`, and an explicit registered redirect URI. The exchange documents `client_secret` as required. Expiring UATs normally last 8 hours and refresh tokens 6 months; use returned expiry fields and handle revoked/expired tokens. [User-token flow][user-token-flow]

Recommendation:

- Backend owns OAuth exchange/refresh, GitHub credentials, encrypted token storage, and optional app private key. Browser receives only app session cookies and authorized data, never a GitHub access token in canvas JSON, local storage, URL, or logs.
- Use secure, HttpOnly, appropriately SameSite session cookies; bind `state` and PKCE verifier to the initiating session, reject mismatches, pin callback URLs, and protect app mutation endpoints from CSRF. These are app implementation requirements, not GitHub API features.
- After `GET /user`, upsert the application user by immutable GitHub user ID and establish their own session; anyone who successfully authorizes through the GitHub App may sign in. Do not use a configured owner allowlist or mutable login/email as an identity key. Every route checks the current user; private board operations enforce creator ownership, independently of GitHub repository authorization. Credentials, repository discovery, cached responses/validators, and in-flight work must not cross user authorization contexts.
- An app private key must never be shipped to a browser/native client. IAT creation uses an app JWT to POST `/app/installations/{installation_id}/access_tokens`; keep that capability entirely server-side. Treat token values as opaque, not fixed-length strings. [App security][security] [Installation tokens][installation-tokens]
- GitHub's security guidance discusses PKCE for public clients, but that is not evidence that the code exchange is secret-free or that all auth endpoints support browser CORS. Do not turn REST CORS support into a browser-only private-auth claim. The recommended backend avoids this unresolved browser-auth dependency. [App security][security] [User-token flow][user-token-flow] [CORS][cors]
- Do not ask users to paste PATs for the default product. GitHub's app guidance says to use app tokens rather than PATs/passwords. [App security][security]

## 3. Onboarding and multiple repository owners

Documented: an installation targets a user or organization account and grants chosen repositories. A user can authorize an app without installing it; authorization and installation are separate. Organization installation may require a repository admin/organization owner, and organization permissions need owner approval. Installing on one owner does not install on another. [Comparison][comparison] [User authority][user-authority]

Recommended sequence:

1. **Sign in / authorize app.** Obtain UAT through server flow; `GET /user` supplies the durable GitHub `id`. Upsert that user's application identity and grant a user-scoped session, not a shared owner session. Login/email are display attributes, not keys. [App security][security]
2. **Discover accessible installations** with UAT `GET /user/installations`, following pagination. For each installation, use UAT `GET /user/installations/{installation_id}/repositories` for the user's accessible repository intersection. Do not expose `GET /installation/repositories` results as the user's picker: that is the app-wide view. [Installation endpoints][installations] [User-token flow][user-token-flow]
3. **Offer install/request access for missing owners or repositories.** Show separate states for “app not installed,” “repository not selected,” “approval pending,” “user has no access,” and “reauthorize/SAML session needed,” where the API evidence supports distinguishing them. Do not infer a private repo exists merely from user-entered text or a 404. [User authority][user-authority] [REST practices][rest-practices]
4. **Revalidate after callback.** An `installation_id` supplied in a browser URL is a candidate identifier, not proof of ownership or authorization. Rediscover it using the signed-in UAT before connecting repositories. This is a security design recommendation based on GitHub's user/installation distinction. [App security][security]
5. **Persist identity plus context:** board owner user ID, account/organization ID, installation ID, repository ID and node ID, current slug, visibility, and grant status. Names are display/lookup caches, not authorization keys. [App security][security]

**Multiple repository-owner consequence:** a board spanning a personal repo plus two organizations can involve three installations, separate approvals, and separate repository selections. One UAT can represent the same user across permitted installed accounts; it does not collapse those installations into one grant or authorize another app user. Losing one source owner's grant must disable only that source, not erase the board or disconnect unaffected repositories. Installation-token rate budgets are not a bypass for current user-authorized scheduled refresh. [User authority][user-authority] [Installation tokens][installation-tokens] [REST limits][rest-limits]

SAML is a real onboarding failure mode: GitHub tells users with missing organization resources to establish an active organization SAML session before reauthorizing. Regular `GET /user/installations` checks are explicitly recommended, but membership/installations alone should not substitute for issue-level user-token reads. [User authority][user-authority] [App security][security]

## 4. REST and GraphQL fetching

### REST baseline

Concrete endpoints, all against `https://api.github.com`:

| Purpose | Request | Notes |
|---|---|---|
| Repository source metadata | `GET /repos/{owner}/{repo}` | Resolve repository IDs, canonical name/URL, visibility and availability; metadata permission for private repo access. [Permissions][permissions] |
| Import issue and PR candidates | `GET /repos/{owner}/{repo}/issues?state=open&per_page=100` | Shared list; retain both kinds. Explicit `open`, `closed`, or `all`; `labels`, `assignee`, `milestone`, `sort`, `direction`, `since`, `page` are documented filters. [REST issues][issues] |
| Refresh shared card metadata | `GET /repos/{owner}/{repo}/issues/{issue_number}` | Supports issue/PR common metadata; deduplicate by source, not placement. Closed/merged records remain valid placements. [REST issues][issues] |
| Enrich selected PR status/detail | `GET /repos/{owner}/{repo}/pulls/{pull_number}` | Optional when the shared response already supplies sufficient fields; required when complete draft/merge status is missing. Pull requests/read; retain PR-specific fields separately from shared issue representation. [PR API][pulls] [PR permissions][pr-permissions] |
| Optional PR-specific picker | `GET /repos/{owner}/{repo}/pulls?state=all&per_page=100` | Only if PR-specific filtering is useful; not required alongside the shared list. State still uses open/closed/all, not a separate merged filter. [PR API][pulls] |
| Changed-record reconciliation | `GET /repos/{owner}/{repo}/issues?state=all&since=...&sort=updated&direction=asc&per_page=100` | Covers issue-like records including PRs; `since` means updated after timestamp. **Not a deletion/permission-loss log.** Refresh selected PR enrichment separately as needed. [REST issues][issues] |
| Authorized installation discovery | `GET /user/installations`; `GET /user/installations/{installation_id}/repositories` | Use UAT and paginate both. [Installation endpoints][installations] |

Use documented media/version headers (`Accept: application/vnd.github+json`, an explicitly pinned supported `X-GitHub-Api-Version`, and `Authorization: Bearer ...` for private/authenticated reads). Retrieved REST docs currently show `2026-03-10`; this is evidence of their current examples, not a reason to hardcode a version without checking support when implementation starts. [REST issues][issues]

**Keep and discriminate PRs; do not exclude them.** REST issue endpoints include PRs, identifiable by `pull_request`. Normalize `kind: "issue" | "pull_request"` on every list/detail/URL-import path. Accept both `/issues/{number}` and `/pull/{number}` URLs and confirm kind from API data; a URL alone is not proof of kind. A PR-only page is useful data, not a reason to stop pagination. If the user chooses an issue-only/PR-only filter, continue following `Link` even when a page has no matching items. `GET /issues` defaults to assigned-to-user behavior; do not use it as an implicit inventory of selected repositories. The earlier mandatory-PR-exclusion advice was a scope recommendation, **superseded by the user's explicit inclusion of PRs**. [REST issues][issues] [REST practices][rest-practices]

**PR status is not just issue open/closed state.** The shared issue schema documents optional `draft` and `pull_request.merged_at`. Do not mistake absent fields for `false` or `null`. PR detail supplies `draft`, `state`, `merged`, and `merged_at`; enrich selected PRs when needed rather than fetch details for every candidate. Normalize merged first, closed-unmerged only when merge status is known, otherwise draft/open for open PRs with known draft status. Keep incomplete status explicit until enrichment succeeds. Closed alone does not prove unmerged; an issue's `state_reason` is not a PR merge-status contract. The complete PR path therefore requests Pull requests/read in addition to Issues/read. Reviews, review decisions, checks/CI, branch details, and mergeability are separate optional scope, not inferred promises. [REST issues][issues] [PR API][pulls] [PR permissions][pr-permissions]

Pagination: repository issue lists default to 30 and allow at most 100 per page. Follow `Link` URLs rather than constructing next-page URLs. Fetch all pages needed for the selected import/filter, or explicitly present a partial/load-more result—never silently pretend the first page is complete. [REST issues][issues] [REST practices][rest-practices]

Recommendation: use stable creation ordering for repeated full candidate-list caching, because `sort=updated` shuffles records between pages. For incremental updated-since reconciliation, overlap the prior successful watermark slightly, deduplicate by source identity, and advance the watermark only after the complete successful pass; this reduces but does not prove away pagination races. Periodic full reconciliation remains necessary. GitHub explicitly warns that updated sorting changes page contents. [REST practices][rest-practices]

### GraphQL alternative / targeted companion

Documented endpoint: authenticated `POST https://api.github.com/graphql`. A repository's `issues` is an issue-only `IssueConnection`, so it is **not** a combined issue/PR inventory. If broader GraphQL fetching is adopted, fetch both `issues` and `pullRequests` with their own cursors, or resolve known numbers through typed `issueOrPullRequest` results. The original issue-only query outline is superseded for the combined picker; REST remains the simpler initial list. [GraphQL calls][graphql-calls] [Repository schema][repository-schema]

Useful Issue fields: `id`, `fullDatabaseId`, `number`, `url`, `title`, `state`, `stateReason`, `updatedAt`, `createdAt`, `closedAt`, `repository { id nameWithOwner url isPrivate }`, `labels { nodes { id name color } }`, `assignees { nodes { id login avatarUrl } }`, `milestone { id title dueOn }`, and `comments { totalCount }`. Optional `bodyText` is preferable to HTML for a compact preview. Each fetched connection needs `first`/`last` between 1 and 100; labels/assignees have their own pagination, so `first:10` is not “all labels.” [Issue schema][issue-schema] [Repository schema][repository-schema] [GraphQL pagination][graphql-pagination]

Recommendation: targeted GraphQL lookup can consolidate selected records with aliases and direct `node(id:...)` lookups, inspecting `__typename` and using both Issue and PullRequest fragments rather than dropping PR nodes. Keep a cursor per repository and nested connection; bound batches and handle partial data/errors. The official global-node guidance demonstrates direct lookup and recommends persisting IDs across APIs. GraphQL rate-limit errors may return HTTP 200, so HTTP status alone is insufficient. These are design outlines, not executed queries. [Global IDs][global-ids] [ID migration][id-migration] [GraphQL limits][graphql-limits]

Do not build a full repository inventory on a search endpoint when deterministic repository issue pagination suffices. Search semantics/indexing and limits are unnecessary dependencies for this scope. This is a design recommendation; this research did not assess GitHub search consistency.

## 5. Identity, rename, and transfer

**Do not identify a card solely by `owner/repo#number` or URL.** GitHub recommends durable IDs for repositories/users/organizations, and persisting global node IDs for cross-API lookup. REST `node_id` corresponds to GraphQL `id`; REST numeric `id` is a different field. Node IDs must be opaque: GitHub documents an ID-format migration and explicitly warns against decoding them. [App security][security] [Global IDs][global-ids] [ID migration][id-migration]

Recommended records:

- App-owned `itemReferenceId`: immutable internal key referenced by canvas shapes, with `kind: "issue" | "pull_request"` in the reference registry.
- Provider identity: `githubHost`, separately named REST `issueId` and optional `pullRequestId` (losslessly stored), opaque node IDs with their source representation, repository ID/node ID, and current number/API/HTML URLs. GitHub explicitly warns that a PR returned from an Issues endpoint has an **issue ID**, not its pull request ID. Never overwrite one with the other or assume node representations match without resolution evidence. [REST issues][issues]
- Latest repository and issue/PR metadata: replaceable authorized snapshot, not serialized into shape props/history.
- Placement: independent shape ID, `itemReferenceId`, geometry and style. Several placements may refer to one source; metadata refresh must not recreate/move shapes.
- Resolution aliases: prior canonical locator or prior node ID only when linked by trusted API evidence, never guessed by matching titles.

**Rename/repository ownership change:** preserve internal shape/reference IDs, use repository ID as identity, refresh current names/URLs from GitHub, follow API permanent redirects and persist the new canonical locator. GitHub recommends following redirects and updating future requests for 301s. Repository ownership transfer can also change installation/visibility, so re-authorize destination access rather than just updating a URL. [REST practices][rest-practices] [App security][security] [Webhook events][events]

**Issue transfer:** documented user-facing behavior is that the original issue URL redirects to the new URL; readers without access to the destination cannot read it. Current transfer docs limit transfers to repositories owned by the same user/organization and disallow private-to-public issue transfer. Webhooks document `issues.transferred` with `issue` and `changes`. [Issue transfer][transfer] [Webhook events][events]

**Not established by these sources:** a universal guarantee that numeric issue IDs or node ID strings remain identical across every issue transfer. Do not promise that. Use an internal reference, store both provider identifiers and current locator, attempt authorized direct-node lookup and canonical redirect resolution, and remap only when trusted API evidence ties the records together. If resolution is ambiguous or inaccessible, preserve geometry with an unavailable-source state. Node-ID format migration is independently documented, so “node IDs never change” would also be an overclaim. [Global IDs][global-ids] [ID migration][id-migration]

## 6. Minimum metadata and privacy boundary

Shared fields below come from the REST issue schema, including optional PR indicators; PR detail provides enrichment when needed. [REST issues][issues] [PR API][pulls]

| Category | Keep for initial cards | Notes |
|---|---|---|
| Source identity and kind | Internal reference, `kind`, separate issue/PR IDs, opaque `node_id`, `number`, API/HTML URLs, repository IDs/current slug | Infer PR kind from `pull_request`, not a title or URL guess. Repository association comes from the known source; don't assume every item has a full `repository`. |
| Primary display | `title`, issue `state`/`state_reason`; PR `state`, `draft`, `merged`, `merged_at` where available | Issues: open/closed. PRs: draft/open/closed-unmerged/merged, with unknown enrichment explicit. Shared optional fields may avoid a detail request but cannot be assumed present. |
| Common metadata | `labels[].id/name/color`, `assignees[].id/login/avatar_url`, nullable `milestone.id/title/due_on` | Prefer plural `assignees`; account for empty/null/optional data. |
| Freshness | `updated_at`, `created_at`, `closed_at` plus app `lastFetchedAt` | GitHub updated time is not the app's last successful access check. |
| Optional | `comments` count, author identity, plain body excerpt, issue type | Do not fetch/persist full comment threads, body HTML, or attachments by default. |

Recommendation for the settled self-hosted design (multiple GitHub-authenticated users, private per-creator boards, SQLite on durable disk, protected backups):

- Canvas document contains only internal reference IDs and app-authored drawing/text/geometry, not GitHub titles, owner/repo names, labels, URLs, avatars, bodies, or authorization state. Metadata lives in a separately authorized response/store. This makes revocation possible without rewriting every canvas undo/autosave record.
- Enforce app board ownership **and current GitHub user authority** before returning private metadata, including cached snapshots, thumbnails, exports, live-update messages, and detail panels. A successfully cached IAT snapshot is not a permission grant.
- The simplest strict initial path is a UAT issue GET (conditional when possible) for each distinct placed source, plus a UAT PR GET where enrichment is delivered. Batch GraphQL resolution is an alternative. Apply the authorization boundary to every representation; an authorized issue read is not permission to serve previously cached PR enrichment after that permission has been removed. Any short authorization-cache window is an explicit stale-access tradeoff.
- If a user-token request cannot establish access, do not fall back to an installation token, old private snapshot, or “previously public” cache. A 404 can conceal denied private access, not just deletion. If GitHub is unavailable or throttled, preserve the geometry and show unavailable/stale state without delivering private metadata that has not passed the required authority check. [REST practices][rest-practices] [App security][security]
- Partition private caches by host, user/authorization context, installation/account context, repository and resource representation. Never key a shared cache solely by `owner/repo#number`. Store ETags with the exact resource/query/media/API-version/auth context; invalidate grants on revocation. Disable shared CDN/service-worker persistence for private metadata responses; encrypted server storage and redacted logs are recommended.
- On known revocation: stop sync, invalidate affected grant/token/cache, hide and purge affected cached metadata, clear affected client metadata and previews, retain anonymous geometry/internal reference. Avoid including a private repo slug/title in the error UI. Re-enable only after fresh authorization and hydration. Recheck access when a tab returns or reconnects; remote revocation cannot erase already viewed/copied data or an offline device instantly.
- Retention policy must include backups, exports, analytics, logs, and historical snapshots, not only the live cache. Provide a disconnect/data-deletion flow; GitHub explicitly recommends deletion controls and retaining organization context to avoid former employees keeping access through your app. [App security][security]
- User-authored free text may itself contain copied private information. Keeping GitHub metadata outside shapes cannot automatically classify or erase such text. Decide whether revocation affects notes/exports; do not claim the separation solves this broader governance problem.

**Local-only comparison:** a tokenless public board can persist references/layout locally with no server credentials. Private snapshots in IndexedDB/local files are persistent copies; an app cannot guarantee removal from offline devices, user exports, or backups after access revocation. Keeping layout local does not require keeping authentication browser-only: a small auth/API backend is compatible with local layout. These are architectural/security implications, not extra GitHub API promises.

### View filters and planning values — product contract, mapping unverified

- Hide closed issues, hide merged PRs, include/exclude labels, and filter by weight, sprint, and type. Filters are per-user/per-board view state, never GitHub writes. Hide placements without deleting, moving, resizing, regrouping, or reflowing them; clear/reveal restores the same geometry. Show the number of hidden placements, including repeated references.
- Combine active filters with AND. Explicit label Include mode matches any selected label; Exclude mode rejects any selected label; no labels selected adds no restriction. Concrete weight/sprint/type selections do not match unset values. Offer Unset explicitly: unset is not zero or an invented default. Keep unfetched/unavailable data distinct from confirmed unset and disclose incomplete filtering. Missing PR enrichment does not prove a merged/unmerged state.
- Map weight, sprint, and planning type to actual available GitHub Projects/custom fields, labels, or supported native fields; do not advertise them all as standard issue fields or conflate planning type with issue/PR kind. Choose source IDs, normalization, precedence across projects/repos, and unset/unavailable handling before implementing retrieval.
- **Unresolved integration gate:** exact field endpoints/queries and permission coverage were not researched or exercised here. Projects read-only permission may be needed once mapping is chosen; no additional scope is justified yet. UI prototypes can use explicitly labeled mock planning fields without blocking on that decision.

## 7. Refresh, conditional requests, and rates

### Initial refresh contract — recommendation

- Import displays current fetched candidates. Each user chooses which issues and PRs become persistent placements on their private board; refresh does not automatically add every new record.
- Refresh on load, explicit **Refresh**, and an adjustable schedule update source snapshots, not geometry. Track per-source `lastFetchedAt`, enrichment completeness, and errors so one failed repository or PR detail request does not discard successful results. Show last successful/next scheduled refresh, in-progress state, and paused/backoff/reauthorization reasons; do not imply complete success from a partial pass.
- Refresh all distinct placed issues and PRs, including closed, merged, and view-filter-hidden placements. Open-only lists cannot update newly closed/merged cards. Do not delete a placement because it is absent from a filtered list.
- Keep source lifecycle and fetch/access status distinct. Issue closed, PR draft/open/closed-unmerged/merged, inaccessible, rate-limited, and not refreshed are not interchangeable.
- **Cadence TBD by measurement:** request count including enrichment/planning-field queries, remaining rate budget shared with the user's other usage, distinct source volume, and observed latency determine defaults and adjustment bounds. Use a controlled queue, deduplicate repeated references within one authorization context, coalesce in-flight load/manual/scheduled work, and use conditional requests where supported. Do not assume a fixed interval or zero-cost refresh.
- Pause scheduled requests for hidden/inactive boards, revalidate on return, avoid duplicate tab polling, and stop inaccessible-resource loops. Honor `x-poll-interval` when supplied and rate-limit retry/reset guidance with centralized backoff. GitHub recommends webhooks over polling and efficient authenticated conditional polling when polling is necessary. [REST practices][rest-practices]
- Scheduled work uses the relevant user's UAT and current repository authority, never installation access as fallback or bypass. Expired/revoked user access pauses work pending token refresh or reauthorization. Deduplication, validators, and cached results remain partitioned by user/authorization context.

### Documented conditional semantics

Most REST endpoints return ETag and many Last-Modified. Send saved `If-None-Match` or `If-Modified-Since` for the same representation. A **correctly authorized** request returning 304 does not count against the primary rate limit. Do not assume tokenless 304s are free, every endpoint returns a validator, a first-page 304 covers later pages, or conditional REST semantics apply to GraphQL POST. Stable parameters/sorting improve cache hits. [REST practices][rest-practices]

### Documented limits at retrieval

| Authentication | REST primary limit | GraphQL primary limit |
|---|---|---|
| Unauthenticated public REST | 60 requests/hour/IP | No tokenless GraphQL design recommended; documented GraphQL usage is authenticated. |
| Ordinary authenticated user/UAT/OAuth user token | 5,000 requests/hour shared with other requests on behalf of that user | 5,000 points/hour/user |
| Ordinary app installation | Minimum 5,000 requests/hour; scales with qualifying repository/user counts, capped at 12,500 | 5,000 points/hour baseline; similar scaling, capped at 12,500 |
| Enterprise Cloud installation | 15,000 requests/hour | 10,000 points/hour |

Sources: [REST limits][rest-limits], [GraphQL limits][graphql-limits]. Enterprise user-token exceptions also exist; never hardcode these rows as entitlement. Trust response headers/current docs. REST requests and GraphQL points are different budgets.

Both APIs have secondary concurrency/compute limits; docs currently state a combined maximum of 100 concurrent requests, but GitHub recommends serial requests to avoid secondary limiting. That number is a ceiling, not a concurrency target. For REST 403/429, examine `retry-after`, `x-ratelimit-remaining`, and `x-ratelimit-reset`; stop until allowed. For secondary limits without guidance, GitHub specifies at least a minute then bounded exponential backoff. GraphQL may report rate exhaustion in a 200 response; inspect errors. [REST limits][rest-limits] [GraphQL limits][graphql-limits] [REST practices][rest-practices]

GraphQL has 1–100 per connection and a 500,000-total-node query cap; deeply nested repository/issues/labels requests multiply work. Recommendation: bounded queues/batches, partial-progress UI, cancellation of abandoned imports, and no requests on pointer movement. [GraphQL limits][graphql-limits]

## 8. Webhook stage and revocation

Documented: GitHub Apps have centralized webhook delivery for their installed access; OAuth Apps require repository/organization webhook configuration. `issues` requires Issues/read; PR lifecycle uses `pull_request` with Pull requests/read, not an assumption that `issues` covers all PR transitions. Relevant issue actions include opened, edited, closed, reopened, assigned/unassigned, labeled/unlabeled, milestoned/demilestoned, transferred and deleted. PR draft/ready-for-review and closed/merged changes need PR-aware hydration. `issue_comment` is separate; subscribe only if refreshing a displayed comment count requires it. Label/milestone entity edits have separate events from attaching them to records. All webhook work remains optional beyond the required on-load/manual/scheduled refresh. [Comparison][comparison] [Webhook events][events]

Recommended eventual-update flow:

1. Receive HTTPS webhook; preserve original request-body bytes and verify `X-Hub-Signature-256` HMAC-SHA256 with configured high-entropy secret and constant-time comparison **before processing**. Do not trust a GitHub-looking header or JSON payload alone. [Signature verification][signature]
2. Check known event/action and installation/repository context; persist delivery ID and enqueue work durably, then return 2xx within 10 seconds. Use `X-GitHub-Delivery` for idempotency; redelivery has the same ID, so track processing status rather than treating every previously seen-but-failed ID as complete. [Webhook practices][webhook-practices]
3. Invalidate/coalesce affected snapshots; read canonical latest issue/PR state rather than replaying webhook payloads as an assumed ordered change log. This avoids relying on unestablished ordering/exactly-once guarantees. Any IAT background read is a cache update only, not authorization to send its contents to a user.
4. Notify an active authorized client of **invalidation**, then hydrate through the normal user-authorized route. An authenticated socket is not permanently authorized to every repo; reauthorize before sending private content.
5. Reconcile on load, manual refresh, and the user-authorized schedule; add missed-delivery recovery if webhooks are adopted. GitHub does **not** retry failures automatically. Delivery-list/redelivery APIs can support recovery; keep reconciliation because delivery can also be omitted for payloads above the documented 25 MB cap. [Webhook failures][webhook-failures] [Webhook events][events]

Always handle lifecycle events:

- `github_app_authorization.revoked`: stop acting for that user and invalidate user credentials/session-linked GitHub access. Apps receive it automatically; use of revoked tokens results in 401. [User-token flow][user-token-flow]
- `installation.deleted` / `installation.suspend`: invalidate the installation's access and affected private snapshots. Creation/unsuspend/new-permissions-accepted require rediscovery, not trust in old grants. [Webhook events][events]
- `installation_repositories.removed` / added: resync accessible repository selection. **Important:** documentation says `repositories_removed` can be empty when selection changes from all to selected, so treating the removal array as exhaustive is unsafe. [Webhook events][events]
- `repository.renamed`, `.transferred`, `.privatized`, `.publicized`: update locators/access classification and reauthorize. **Important:** repository deletion events are not delivered to GitHub Apps/repository webhooks, and repository transfer events go only to the new owner with the app installed/subscribed. Do not rely on receiving a complete source-side lifecycle log. [Webhook events][events]

Installation webhooks do not establish continuing individual user access after organization departure/SAML changes. GitHub expressly requires routinely checking memberships/access/current SSO and protecting stored organization data. User-authorized request-time reads remain the decisive boundary. [App security][security]

## 9. Recommended implementation stages

These are implementation-plan recommendations, not implemented deliverables.

1. **Identity and authorization model first.** Upsert anyone who signs in through the GitHub App by immutable GitHub user ID; isolate sessions, credentials, repository authorization, metadata caches, and private per-creator boards. Baseline Issues/read, Pull requests/read, Metadata/read; server OAuth+PKCE; durable typed references; metadata separate from canvas state; fail-closed hydration. Complete private repository selection across source owners and distinguish public read sources from installed webhook sources. SQLite with consistent backups remains sufficient; no team-board sharing or hosted database requirement is inferred.
2. **End-to-end read-only product.** Shared REST issue/PR picker with pagination; selected live cards; common metadata and targeted PR enrichment; mapped planning fields after proving source/permission coverage; placement-preserving view filters; on-load/manual/scheduled refresh with cost-aware adjustable cadence, coalescing, conditional requests, visible freshness/next status, and backoff. Do not substitute fixture/public-only prototypes for private-repository acceptance.
3. **Webhook-driven eventual refresh, only if needed.** Signed intake, durable processing/idempotency, lifecycle invalidation, recovery/reconciliation, and client invalidation notifications. Any separately justified IAT cache work is not a replacement for user authority in scheduled board reads or metadata delivery.
4. **Scale based on observations.** Consolidate card metadata with bounded GraphQL queries, improve conditional candidate caches, and tune scheduling using measured costs. Do not start with a full org-wide mirror or complex search index.

Future acceptance scenarios the implementer should exercise (not run here): successful sign-in/upsert for two independent GitHub users; denial of cross-user board list/load/save/delete/export and credential/cache/in-flight response access; multiple repository owners and partially installed sources; user access narrower than app access; permission loss while a board stays open; all-to-selected installation change; issue open-to-closed; PR draft-to-open, closed-unmerged and merged; missing enrichment; PR-only REST page; both URL kinds; >100 results; separate issue/PR IDs; nullable metadata; label rename; repo rename/transfer; issue transfer to allowed/disallowed destination; token expiry/revocation and SAML reauth; 304/403/404/429; backup restore; no unauthorized metadata in autosave/history/export. Also exercise AND filter composition, include/exclude labels, unset versus zero, clear/reveal with unchanged positions/hidden counts, chosen planning-field mapping, scheduled cost measurement, deduplication/coalescing, hidden-board pause, rate backoff, and visible last/next state without installation bypass. If webhooks are added, exercise dropped/duplicate deliveries.

## 10. Unknowns and decisions not to disguise as facts

- **Settled product decisions:** self-hosting usable by anyone who authenticates through the GitHub App, primarily private repositories, issues plus PRs, private per-creator boards, placement-preserving view filters, and on-load/manual/scheduled refresh. The user selected tldraw after the experiments; licensing is accepted as a tradeoff. The former single-owner/no-additional-users recommendation is superseded, not a current security requirement.
- No authenticated private-repository or GitHub App flow was exercised. Permission conclusions are from official docs; implementation must prove the exact registration and shared/detail queries against controlled private issue/PR fixtures. A canvas prototype using mock metadata cannot establish this.
- No contractual across-transfer issue-ID stability was found. The durable-reference proposal deliberately avoids needing that guarantee. Redirect behavior and current `issues.transferred` payload details should be exercised before claiming seamless remapping.
- GraphQL snippets above are schema outlines, not executed queries. Connection pagination and exact field permissions must be checked in implementation; docs themselves recommend testing GraphQL permission coverage. [Permission selection][permission-selection]
- Strict live access verification versus a short permission-cache TTL is a product/security decision. The recommended initial private path checks UAT access at metadata delivery; any TTL introduces a documented revocation window.
- Public-only sources outside an installation can be read, but do not automatically acquire app webhook delivery. UI must distinguish refresh-only sources (on-load/manual/scheduled) from webhook-connected sources. [Permission selection][permission-selection] [Comparison][comparison]
- GitHub Enterprise Server/custom hosts are out of the investigated scope. Store host in identity now if inexpensive, but do not claim enterprise compatibility without separately researching version/auth/network constraints.
- Weight, sprint, and type source mapping remains unverified: choose actual Projects/custom fields/labels or supported native fields, precedence and value normalization before adding queries. Projects read-only access may be needed, but is not yet proven or requested. Fixture UI is not blocked by this gate. CI/checks, reviews, mergeability, and write-back remain separately agreed scope.
- Private offline persistence, backup retention, user-authored notes containing private data, and export policy require explicit product/security decisions. Revocation cannot undo an already downloaded copy.
- Board sharing and its permission/role model are undefined; boards remain private per creator. Team use of the app does not imply shared boards, invitations, or live collaboration. This decision does not block fixture UI.
- Refresh interval defaults and user-adjustment bounds remain TBD after measured request count, rate budget, board volume, and latency; prototypes simulate the controls, not a verified schedule.
- Current source pages are living documents and contain some older/deprecated examples. Pin supported API versions and avoid inferred token lengths, ID encodings, or numeric-limit entitlements.

## Primary sources

All retrieved 2026-11-05.

[comparison]: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/differences-between-github-apps-and-oauth-apps
[oauth-scopes]: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps
[user-authority]: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-with-a-github-app-on-behalf-of-a-user
[user-token-flow]: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app
[installation-tokens]: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app
[security]: https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app
[permission-selection]: https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app
[permissions]: https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps#repository-permissions-for-issues
[installations]: https://docs.github.com/en/rest/apps/installations
[issues]: https://docs.github.com/en/rest/issues/issues
[pulls]: https://docs.github.com/en/rest/pulls/pulls
[pr-permissions]: https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps#repository-permissions-for-pull-requests
[rest-practices]: https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api
[rest-limits]: https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
[cors]: https://docs.github.com/en/rest/using-the-rest-api/using-cors-and-jsonp-to-make-cross-origin-requests
[graphql-calls]: https://docs.github.com/en/graphql/guides/forming-calls-with-graphql
[graphql-pagination]: https://docs.github.com/en/graphql/guides/using-pagination-in-the-graphql-api
[graphql-limits]: https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api
[issue-schema]: https://docs.github.com/en/graphql/reference/issues#object-issue
[repository-schema]: https://docs.github.com/en/graphql/reference/repos#object-repository
[global-ids]: https://docs.github.com/en/graphql/guides/using-global-node-ids
[id-migration]: https://docs.github.com/en/graphql/guides/migrating-graphql-global-node-ids
[transfer]: https://docs.github.com/en/issues/tracking-your-work-with-issues/administering-issues/transferring-an-issue-to-another-repository
[events]: https://docs.github.com/en/webhooks/webhook-events-and-payloads
[signature]: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
[webhook-practices]: https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks
[webhook-failures]: https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries
