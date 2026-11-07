# GitBored

A local-first issue-board application in development. Product scope lives in
[the issue-canvas specification](.scratch/issue-canvas/spec.md).

The runnable application provides GitHub App user sign-in, encrypted server-side
credentials, private sessions, authorized GitHub source browsing, owner-only durable
boards and persistent light/dark/system theme selection. Boards mount the native
canvas for notes, drawings, frames, groups and deliberately placed references.
Each board has a durable **Incoming** tray for selected sources and unplaced work.
The separate `/runtime` diagnostic checks Fastify and real SQLite.

## Requirements

- Node.js 26.8.1 or later in the 26.x line, as declared in `package.json`.
- pnpm 12.16.1.
- Linux with `flock` for serialized build and production-browser runs.
- Chromium installed through Playwright for browser checks.

Check `node --version` and `pnpm exec node --version`: a version manager can
select a different Node executable inside pnpm.

## Run locally

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open <http://127.0.0.1:3001>. Vite serves the client and proxies `/api` to
Fastify on port 3002. Ctrl+C stops both development processes.

The server creates `.data/gitbored.sqlite` with authentication, private board and
user-scoped repository-source/reference-registry tables. `DATA_DIR`
changes that directory; relative paths resolve from the repository root. The
directory is restricted to the server account and runtime data is ignored by Git.

For separate worktrees, assign both ports:

```sh
VITE_PORT=3005 PORT=3006 DATA_DIR=.data-local pnpm dev
```

`HOST` defaults to `127.0.0.1`; the Node listener accepts loopback addresses only.
For remote access, put it behind an HTTPS reverse proxy on the same host. Forward
the original application path without rewriting it; do not expose a separate API
origin or cache `/api` responses. Set `APP_ORIGIN` to the public HTTPS origin.

## Build and serve

```sh
pnpm build
pnpm start
```

The production-mode server serves `dist/client` and `/api` on port 3001 by
default. Stop the development server before starting it, or set a different
`PORT`. Run these commands from the repository root.

`GET /api/health` executes a SQLite query before returning readiness.
Unknown API routes and missing assets return errors, not the application HTML.


## Private durable boards

After sign-in, `/` restores the last board for the current account (or opens the
board picker for a new account). The canvas fills the viewport. **Boards ▾**
switches or creates boards; **Settings** combines rename/delete, view filters,
connections and project fields. Board navigation
runs in the client and drains pending saves before switching. A failed save keeps
the current editor open with retry/copy controls. Sign-out, theme and account recovery are in **Settings**. On phones, **Menu**
opens workspace actions and panels sit above the drawing toolbar. Retired page
URLs return to Boards.

Each board is private to its creator. Deletion requires the exact board name and
does not change GitHub. The desktop workspace has light/dark themes, a faint dot
grid, compact floating controls, and independently scrollable non-modal panels.

`src/shared/boards.ts` owns the board/save contract. `GET /api/boards` lists only
the current owner's summaries; `POST` creates an empty native board with `{title}`.
`GET /api/boards/:id` returns its validated document, Incoming state and revision.
`PUT` requires `{expectedRevision, document, incoming}` and atomically advances the
document/Incoming revision with one conditional SQLite update. A stale save returns
409 and cannot overwrite either half of the operation.
`POST /api/boards/:id/copy` accepts `{title, document, incoming}` under the same
owner/session/Origin/CSRF checks and validation as save, creating a private board
at revision zero without modifying the source board. It deliberately does not
require the stale source revision to match: copying preserves both versions.
`PATCH {title}` updates the display name independently of the document revision;
`DELETE` permanently removes the owner's board. Cross-owner IDs are404 for every
operation. Every board request, including GET, requires the current session's
`X-CSRF-Token` expected-context header; unsafe operations also retain exact-Origin
checks. Board routes are synchronous SQLite operations, with no awaited provider
boundary between context validation and delivery/persistence.

Document changes are coalesced and saved one flight at a time. **Saved** means the
server acknowledged all current edits; **Saving**, **Unsaved** and **Conflict**
do not claim durability. Later edits cannot be acknowledged by an older response.
Selection, camera movement, theme and metadata maps are not document saves. Failed
saves and conflicts leave the current editor mounted and usable. Check the
connection and select **Retry save** after a failure. Failures and conflicts stop
automatic writes even as local editing continues; failed writes never replay
automatically. **Save as copy** keeps the latest complete native/Incoming pair as a
new private board with a UTC-timestamped copy name. Edits made during a copy remain
in the original tab and are not acknowledged by that copy; **Open saved copy (new
tab)** opens the captured version separately. **Reload server version** confirms
discarding this tab’s edits; it does not clear another editor’s recovery key.

On session-context failure, protected requests pause while the existing
`/api/session` authority is checked. A renewed session for the **same application
user ID** updates request context without remounting the native editor or resetting
its save coordinator/revision; select **Retry save** explicitly. If signed out,
renew sign-in using the new-tab link, then **Check account** in the retained board
tab. A transient account-check failure also retains local work and offers
**Check account**. Fetched private lists/GitHub values are withheld while blocked.
A **confirmed different user** clears/unmounts the previous account state before
the new account's private reads; it does not migrate the old draft to that account.
Navigation with unacknowledged edits invokes the browser's leave warning where
supported. If **Sign out** ends the server session but you choose **Stay** in that
warning, the same local editor remains available as a blocked draft. The account
is labeled **Last checked**, not connected, and protected requests are paused.
Renew sign-in in another tab, then **Check account** and explicitly **Retry save**.
Recovery uses version-1 `gitbored:recovery:1:` localStorage envelopes scoped by
application account, board and a fresh editor writer ID. Each edit records only
the native reference document and consistent Incoming sources/cursors/queue/seen
state with the expected revision. Fetched titles, bodies, labels, metadata maps,
board names, sessions and credentials are excluded. User-authored notes/drawings
and source/reference identity can still be sensitive; recovery is local work,
not a private metadata cache or an encrypted backup. Logout/account change never
loads the previous owner’s recovery into another account.

Reopening first loads the authorized server board, then offers explicit recovery
choices. A draft based on a different revision can only become a new copy, never
silently overwrite the server. At the same revision, **Review local draft** opens
it without saving; **Retry save** is still explicit and retains compare-and-swap.
The recovery screen’s **Reload server version** opens the server without clearing
other tabs’ work. A successful current save clears only its writer key (and an
explicitly reviewed predecessor if that exact captured predecessor is unchanged).
An acknowledgement for older work keeps the newer pair at the acknowledged base
revision. Browser storage is best effort and may fail, be cleared or be evicted;
when a write fails, keep the tab open until save/copy succeeds. SQLite and operator
backups remain the durable authority. No automatic conflict merge is attempted.

Copying a recovered draft or opening the server does not clear the predecessor’s
key: it may still belong to another live editor. After a successful copy, a
separate version-1 `gitbored:recovery-copy:1:` receipt remembers only the copied
board ID, server creation time and SHA-256 digest of the exact native/Incoming
pair, scoped to the account, source board and writer. Reopening an unchanged
draft shows its historical private-copy link; changed work does not inherit that
receipt. Receipts do not acknowledge the original board or authorize access to
the copy, which still requires the normal owned-board request. If remembering
the receipt fails, the private copy still opens with a notice that the original
draft may appear unmarked. No source draft is removed to attach a receipt.
Before copy, retry, acknowledgement and leaving, a native checkpoint captures any
edit whose SDK store notification is still waiting for an animation frame, using
the same capture boundary and placed-reference queue filtering as ordinary saves.
Checkpoint capture and normal native notifications share content deduplication:
the same deferred document is not a newer edit, while real Incoming operations
still advance the atomic pair. A quota/storage failure announces that the newest
work may exist only in this tab even when saving is paused after failure/conflict;
showing that warning never retries or posts a save.
The warning clears only after an actual successful recovery write or acknowledged
cleanup, not merely a status change or freeing browser storage. Copy, review and
reload controls keep keyboard focus while busy; their guarded actions do not
repeat a request during a held key.

SQLite remains authoritative across browser reloads and real server restarts.
Use the consistent database backup and separate key recovery procedure below;
never copy just the live main SQLite file or replace an active data directory.


## Incoming discovery and placement

Open **Repositories**, search by name or paste a repository URL, choose the
repository, set State/Kind/Label import filters and select **Connect repository**.
Accessible repository pages preload while the board is open. Search filters the
catalogue as you type; a full owner/name also performs a direct lookup. An issue
or PR URL produces an **Add to Incoming** action. Connecting never places shapes.
Sources use immutable repository IDs with mutable request locators; reconnecting
at a new name updates the locator without resetting discovery progress.

Incoming loads successive issue/PR pages automatically. A failed page retains
loaded work and offers Retry; **Add all matching** stays disabled until discovery
and metadata loading complete. **Refresh** starts a fresh pass while retaining
seen IDs. **Disconnect** stops discovery without deleting queued or placed work.
Deleting a canvas card does not rediscover it; paste its URL to explicitly requeue.

Filter Incoming by text, state, kind or label, then add one, selected, or all
matching cards. The panel stays open and placement never changes the camera.
New cards occupy rows below existing work in the current viewport's horizontal
region. Dragging a preview onto the canvas places it at the drop point, including
inside rotated frames. Invalid or cancelled drops change nothing. Batch placement
is one native undo operation. Already placed URLs do not create duplicates;
explicit native duplication remains available.

First placement consumes its queue entry in the same revisioned save as the native
document. On failure the local placement and consumed local queue remain a single
recoverable unsaved operation; the server retains its previous complete pair.
Further edits do not replay failed writes. Keep the tab open and explicitly
**Retry save**, or resolve a **Conflict** using the existing board controls.
Native undo of the first placement restores Incoming only when no other placement
remains; redo consumes it again. Ordinary deletion and explicit duplication do not
manufacture queue entries. Native stopping marks separate placement operations;
the supported SDK undo/redo UI events reconcile first-placement provenance against
the resulting native document. There is no second undo stack or private history
introspection; as with the native editor, history does not survive reload. If you
delete a placement, explicitly requeue its reference, then undo that deletion,
the restored placement consumes the queue entry in the same save. This also works
when the deleted placement was loaded from a previously saved board.

Selected sources, bounded cursors, queue and seen IDs live in SQLite alongside the
native document. Existing databases receive an additive Incoming-column migration.
Incoming and native content are validated independently with bounded collections,
owner-scoped reference/source checks and no queued/placed overlap. GitHub titles,
labels and assignees are hydrated under the current authorization into an immutable
in-memory map shared by all placements, never saved in Incoming, SDK history or
browser storage. Account checks withhold fetched values while retaining same-owner
unsaved work; global source-context loss rejects pending metadata and discovery
results through the same account/abort lifetime. A confirmed other user clears the
previous workspace before private reads. GitHub reauthorization pauses source and
reference reads without blocking native editing or saving under a valid application
session. Use **Reconnect GitHub** in a new tab, then **Check GitHub access** in the
retained tray to resume authorized reads; no failed write replays automatically.
Incoming is a non-modal region: Escape/Close returns to its trigger and canvas
interaction leaves it open. **Find** selects a card without changing zoom; selected
cards keep their details closed until you use their **Card details** button. Details
follow the card as you pan, scale modestly with desktop zoom, and show the issue or
PR description as plain text. Cards resize with native handles or the **Card size**
control in details. **Settings → Hide closed** hides closed/merged cards without changing
the saved document.

**Settings → Project** selects one project and maps Status, Weight, Priority and Sprint
to its actual field IDs. Values—including zero—stay separate from native history;
missing values are not inferred. **Connections** offers Off, Selected (default),
and All. Curves indicate generic relationships from GitHub cross-references and
linked issues; they make no claim about whether a PR closes an issue. Off-board
references are links in details and never create cards automatically.

`GET /api/references/:id/context` reads optional project fields and relationships
through GitHub GraphQL under the current user's authorization. Responses are
bounded (20 memberships, 100 fields/values/events) and report partial/unavailable
data explicitly. The app needs access to the chosen project as well as the
repository. For organization-owned projects, grant **Organization permissions → Projects → Read-only**, approve the permission update on the installation, and ensure the signed-in user can read the project. See GitHub's [App permissions](https://docs.github.com/en/apps/creating-github-apps/registering-a-github-app/choosing-permissions-for-a-github-app)
and [Projects API](https://docs.github.com/en/issues/planning-and-tracking-with-projects/automating-your-project/using-the-api-to-manage-projects)
when enabling private Projects. Controlled-provider tests exercise this integration;
live Project access must be verified against the deployment's App permissions.

## Native workspace keyboard boundary

The native workspace is mounted at authenticated `/boards/:id` routes.
Its SDK is pinned to 5.6.0. Two version-specific pnpm patches in `patches/`,
registered in `pnpm-workspace.yaml`, correct accepted-key releases in
`@tldraw/editor` and tldraw's body-owned comma shortcut. A native press must finish
even if focus moves to a button, link or other UI. The SDK retains its own
modifier/Meta cleanup and comma pointer lifecycle; the application does not copy
that bookkeeping or dispatch substitute keyboard events. Accepted shortcut registrations
survive action/tool registry rebuilds while a key is held, so opening a panel
cannot lose the matching release.
Repeats cannot transfer a press already accepted by another native handler when
modifiers change its reported character.

Floating panels use one editor-lifetime document capture gate for UI-origin physical key
sequences. Browser defaults remain native. UI-owned repeats/releases stay out of
the canvas after focus changes or dismissal; native-owned releases reach the
patched SDK. UI ownership remains quarantined across window blur until a real
release or a fresh press, while the SDK handles its own native blur cleanup.
Authenticated application identity remains separate from native attribution.

The unchanged upstream SDK has a comma/blur limitation: blurring during a held
comma pointer gesture clears key membership without ending that pointer gesture.
The first subsequent card drag finishes the stale gesture instead of moving the
card; a fresh comma down/up and the next card drag recover normal interaction.
These patches preserve the existing SDK blur handler and do not inject releases.
Report this limitation separately from the Cards release matrix.

The original SDK also skips a Shift press begun on a focused button. Moving focus
to the canvas while still holding that press leaves arrow nudges at one unit,
instead of the ten units produced by a canvas-origin Shift press. This also
occurs with the SDK's own focus button, not only Cards. Release Shift and press
it again on the canvas to establish native membership. These ownership patches
do not broaden the SDK's original keydown eligibility.

`pnpm install --frozen-lockfile` applies the committed patches. Any SDK upgrade
must update or remove the exact-version patch registrations and regenerate
coherent source, ESM/CJS runtime artifacts and source maps. Remove these patches
only after the upstream release provides equivalent accepted-key ownership and
the real-browser matrix passes: both press directions across Find and details, held arrows
and Space, comma with changed modifiers/focus, Meta reconciliation, repeats,
dismissal, blur and ordinary native editing/shortcuts. A successful install or
type-check alone does not establish correct keyboard behavior.

## Authorized repository browsing

Open a board's **Repositories** panel to search installed repositories or paste an
`owner/repository` name or GitHub URL. Select a repository, choose its state, kind
and label filters, then **Connect repository**. Recently used repositories are
account-specific shortcuts retained on the server. The **Incoming** panel handles
discovery, refreshing, filtering and placement without leaving the canvas.

Paste a canonical HTTPS `github.com/owner/repository/issues/123` or `/pull/123`
URL to add an individual item to Incoming. Public and private URL reads use the
signed-in user's token. URL access does not imply installation coverage, and
neither browsing nor resolving changes GitHub. Organization owners may need to
approve the app and select repositories. An empty installation list does not prove
that public URLs are unavailable.

Repository or account access loss clears affected private representations. Session
recovery stays in the workspace through **Check account** and **Renew sign-in**;
failed board saves still require explicit retry.

`src/shared/sources.ts` owns source responses; `ItemReference` / `ItemMetadata`
remain the shared native contracts. IDs are decoded from original JSON numeric
tokens before rounding, and REST IDs stay decimal strings. Registry identities
are scoped to the current user and immutable item node/kind; repository identity
and mutable locators remain separate. Issue and PR REST IDs have distinct fields.
Only selected URL/reference reads request PR enrichment. Without it, PR workflow
state stays **unknown**; old enrichment is not reused to imply authority.

Public HTTP contracts (all authenticated, no-store, requiring the current session's
`X-CSRF-Token` on **GET as well as POST** to bind reads to the supplied account context):

- `GET /api/sources/installations?page=1`
- `GET /api/sources/installations/:installationId/repositories?page=1`
- `GET /api/sources/repositories/:owner/:repository/items?page=1`
- `POST /api/sources/resolve` with `{ "url": "https://github.com/…" }`, exact Origin
  and current-session `X-CSRF-Token`
- `GET /api/references/:id` checks reference ownership and reads its current
  representation using the current user's provider token. A saved locator that
  resolves to a different node is unresolved, not silently reassigned.

A valid cookie paired with another session's context returns `409 session_changed`
before provider access. Unsafe requests with a stale CSRF value retain the existing
`403 csrf` guard; clients treat that as session-context loss, not repository denial.
The original session is revalidated after asynchronous reads, before delivery and
registry/progress writes. A late result cannot survive its superseded session.
`isSessionContextFailure(status, code)` in `src/shared/session.ts` centralizes the
client distinction; an ordinary revision-conflict 409 is not session-context loss.

Pages contain at most 30 rows; page inputs are 1–10,000 and only validated next
page numbers are used, never provider-supplied Link URLs. Issue pagination accepts
GitHub's canonical numeric repository path only for the repository just authorized.
Provider responses are
bounded to 4 MB; over-limit or malformed pages fail without advancing progress.
Titles are bounded to 65,536 characters, label/assignee lists to 1,000 values,
label names to 1,024 and assignee values to 256 characters. Values are rejected,
not silently truncated, at the provider boundary. The registry stores identity
and locators. A separate account-scoped SQLite cache stores private card metadata,
repository item pages and project context. Board opening loads cached card content
in one batch before mounting the canvas. Entries stay fresh for 15 minutes; older
card content remains visible while background requests update it, with only a small
corner spinner. Temporary failures retain the cached content marked stale. Browser
reloads and server restarts reuse the cache; **Refresh** bypasses freshness without
blanking cards. Entries are tied to the current credential, and detected access loss
evicts them and clears affected content. Permission changes may take up to 15 minutes
to appear without Refresh. Proxy/browser HTTP
responses remain `no-store`; private metadata never enters the canvas document.

Select a card to set its saved colour with the drawing palette. **Settings → Card
colours** can temporarily colour cards by status, priority, labels or type, and
provides editable category defaults. Multiple labels split the card's top edge.
Choosing **Off — original colours** restores each card's saved colour. Category
colours and colour-by preferences stay per account and board in this browser;
manual colours use the board's normal persistence and undo history.

## GitHub App setup

Create a GitHub App with user authorization enabled. Register the callback as
`http://127.0.0.1:3001/api/auth/callback` for local use, or
`https://your-host/api/auth/callback` for a proxied deployment. The origin, browser
URL and callback must match exactly. Enable expiring user access tokens so refresh
is available. Sign-in is user authorization, not installation authorization:
anyone who successfully authorizes may sign in; there is no owner allowlist.

Ordinary and [Enterprise Managed User logins](https://docs.github.com/en/enterprise-cloud@latest/admin/managing-iam/iam-configuration-reference/username-considerations-for-external-authentication)
are accepted, including underscore/enterprise-shortcode names such as
`mona-cat_acme` and setup users such as `acme_admin`, within the same39-character
total bound. No extra debug flag or App/credential/key configuration change is
needed for this username format. Renaming a login or reconnecting retains the
same owner through GitHub's immutable user ID, not the display login.

For read-only source browsing, select Issues: read, Pull requests: read
and required Metadata: read. Do not grant write, Contents, Checks, Actions, Commit
statuses or organization Members permissions. Installation access and organization
approval are separate from signing in. No App private key or installation token
is required or used by sign-in or source browsing.

Supply these **server-only** variables through your shell/service environment
(the launcher does not load a `.env` file):

```sh
export GITHUB_CLIENT_ID='your-app-client-id'
export GITHUB_CLIENT_SECRET='your-app-client-secret'
export TOKEN_ENCRYPTION_KEY="$(openssl rand -hex 32)"
export APP_ORIGIN='http://127.0.0.1:3001'
export ALLOW_LOOPBACK_HTTP=true
pnpm dev
```

Generate the encryption key once, store it securely and keep it stable across
restarts. Never put secrets in `VITE_*`, commits, browser storage or logs. Back up
the encryption key separately from the SQLite database; losing or changing it
makes saved credentials unreadable. Existing sessions then offer **Reconnect
GitHub**; reauthorizing replaces the unusable credentials without changing your
application identity. For HTTPS use `APP_ORIGIN=https://your-host` and omit
`ALLOW_LOOPBACK_HTTP`. HTTPS sessions use
Secure, HttpOnly, SameSite=Lax, host-only cookies; plain HTTP is permitted only for
explicit loopback operation. Partial or invalid credential configuration fails
startup; missing configuration renders an actionable unconfigured screen.

### Troubleshooting GitHub sign-in

When GitHub requires organisation SSO, affected cards say **SSO required** and one
**GitHub SSO required** notice appears below the board save status. Expand it for
the organisation's SSO link and GitHub app reauthorization steps. Keep the board
tab open: drawing and saving remain available. After reconnecting with the same
account, return to the board or select **Check access** to retry the affected
reads without reloading. The notice clears when those reads recover; ordinary
missing-access and missing-item errors remain separate.

GitBored refreshes expiring GitHub user tokens automatically. This does not
replace an organisation's interactive SSO challenge. Recovery follows
[GitHub's SAML and GitHub Apps instructions](https://docs.github.com/en/enterprise-cloud@latest/apps/using-github-apps/saml-and-github-apps).

If sign-in succeeds but selecting an installation fails to list repositories,
the server emits `github_repository_access_failed` with a bounded category,
upstream status and available GitHub request ID, rate-limit count and recognized
permission hints. Categories distinguish SSO, IP restrictions, managed-user
restrictions, suspended installations, integration/user denials and rate limits;
`unknown` means the response did not match a known reason. These are diagnostic
signals, not proof of a particular configuration fix. Raw GitHub messages, SSO
URLs, tokens and repository payloads are not logged. Retry the affected selection
once and share that event when troubleshooting; callback diagnostics below cover
the separate sign-in flow.

When a callback cannot exchange its authorization code or confirm the GitHub
identity, the browser keeps its existing sign-in failure message. The server
writes exactly one warning line to stderr for that callback, for example:

```json
{"event":"github_oauth_callback_failed","operation":"token_exchange","category":"http","httpStatus":503}
{"event":"github_oauth_callback_failed","operation":"identity_lookup","category":"network","networkCode":"ENOTFOUND"}
```

`operation` distinguishes the code/token POST from the authenticated identity
lookup. `httpStatus` is the actual upstream status, not the browser redirect or
application error status. Categories give the next bounded investigation:

| Category | What it establishes / next action |
|---|---|
| `http` | GitHub returned an unsuccessful HTTP status. For 401/403, privately check the App's user authorization/client configuration; for 429/5xx, check provider availability or throttling before manually trying later. The status alone does not prove the underlying cause. |
| `rate_limited` | The identity lookup returned the existing recognized rate-limit response. Wait before manually trying again; do not substitute installation authority. |
| `invalid_json` | The response could not be parsed as JSON. Check for an upstream proxy/error response and the configured provider endpoint without sharing its body. |
| `invalid_response` | JSON was received but did not meet the existing token/identity contract. Check the actual App/protocol response privately; this does not establish that credentials are wrong. |
| `network` | Fetch or response reading failed. The bounded `networkCode` identifies recognized DNS, connection, timeout or certificate failures; `UNKNOWN` means no recognized code was available. Check the corresponding host/network/trust configuration; do not disable certificate verification. |

Only fixed operation/category values, HTTP status and allowlisted network codes
are logged. Request logging remains disabled. No callback URL/query, OAuth
code/state/verifier, cookie, token, credentials, provider body or raw upstream
exception is included. Invalid/replayed state and declined consent do not produce
provider-operation warnings. Session/refresh requests do not generate this
callback-specific event. There are no automatic OAuth retries.

A successful unauthenticated fetch of `github.com` or `api.github.com` does not
prove that the token POST or authenticated identity lookup works. These
diagnostics make a subsequent failure identifiable; they do not by themselves
fix or prove a successful live sign-in. Share only the bounded event and runtime
version when requesting help, never an environment dump or provider payload.

The focused real-HTTP/SQLite regression runs the actual TypeScript application,
captures operator output and checks redaction without live GitHub access:
`pnpm test:server` (also selected by `pnpm gate` before production E2E). It
temporarily owns application port3009 and controlled-provider port3019 and awaits
their cleanup; keep those ports available when running the focused script or gate.


### Authentication contracts for owner routes

`src/shared/session.ts` owns browser-safe `SessionUser` and `SessionResponse`.
`GET /api/session` is no-store and returns `unconfigured`, `signed-out` (optional
`reason: expired`), or `signed-in` with `{ user, csrfToken, authorization }`.
`user.id` is the stable application UUID; `githubId` is GitHub's immutable ID,
while `login` and `name` are display attributes. `authorization` is `ready` or
`reauthorize`; never deliver private GitHub metadata in the latter state.
Provider outages return a safe HTTP 502, not a successful-looking signed-out state.

`registerAuthentication` decorates Fastify with `app.authentication`:

- `requireUser(request): AuthenticatedUser` throws HTTP 401 without a valid
  session. Use its **id**, never client-supplied identity, for owner queries.
- `requireUserContext(request): AuthenticatedUser` also binds the request's
  `X-CSRF-Token` to that session, including protected GETs. A valid-cookie/context
  mismatch throws HTTP 409 `session_changed`.
- `assertUserContext(request, expected): void` revalidates the captured original
  session/context after awaits, before protected delivery or persistence.
- `getAuthorizedUserToken(userId): Promise<string>` returns only that user's
  decrypted access token, refreshing expired access once per user in flight.
  It throws `AuthenticationError` (401 `reauthorize` or 502 `provider_unavailable`);
  there is no installation-credential fallback.
- `invalidateAuthorizationIfCurrent(userId, rejectedAccessToken): void` removes
  saved credentials only if the rejected token is still current. Both source
  reads and `/api/session` use this conditional boundary, so a late old-token
  rejection cannot erase refreshed/re-authorized credentials. Do not invalidate
  on transient/rate-limit errors; a 403 carrying `Retry-After` is throttling even
  if primary quota remains.

Every unsafe `/api/*` request is checked globally for an authenticated session,
an exact `Origin: APP_ORIGIN` and `X-CSRF-Token` from that session. Protected owner
routes must use `requireUserContext` on safe reads as well as writes, authorize
each resource, and use `assertUserContext` after asynchronous authority reads
before delivering or persisting their result.
Sessions expire absolutely after seven days. Sign-in rotates the current session;
logout (`POST /api/auth/logout`) deletes it server-side. The UI does a full
navigation after logout to clear account-scoped client state. Tokens are
AES-256-GCM encrypted with user/purpose-bound authenticated context; only hashes
of bearer session cookies and OAuth state are stored.

### Controlled provider and live authorization

Production E2E starts the real application on 3100, real temporary SQLite, and the
external controlled HTTP provider on 3101. `scripts/controlled-github.ts` exports
`startControlledGitHub(port, configure?)`; add future controlled GitHub endpoints
in the optional Fastify configuration callback before it starts listening.
`tests/e2e/auth-support.ts` exports `signIn`, `currentSession`, `controlProvider`,
`restartApplication`, `applicationOrigin` and `providerOrigin`.
The provider's `/__control` accepts `reset`, `login`, `expiresIn`,
`refreshExpiresIn`, `fail`, `deny`, `rateLimit`, `revoke` and `revokeRefresh`;
`/__stats` reports exchange/refresh counts and expired controlled access tokens.
Source controls also accept `sourceMode` (`normal`, `empty`, `malformed`,
`untrusted-link`), `sourceFailurePage`, `pullUnavailable`, `sourceDenied`,
`sourceDenialStatus` (403/404), `sourceThrottlePage` (secondary 403 with Retry-After
and nonzero primary quota), and `sourceDelayMs` (0–5000).
`/__source-stats` reports token-free user/path request
evidence; `POST /__source-stats/reset` clears it. Fixtures contain raw JSON numeric
IDs beyond `Number.MAX_SAFE_INTEGER`, mixed/PR-only pages, multiple repository
owners and public-outside-installation/private access scenarios.
`POST /__source-gate` with `{ "action": "arm", "target": "…" }` holds a supported
external response (`repositories-page-2`, `items-page-2`, `issue-detail`,
`issue-detail-next`, `repository-denial` or `old-token-401`). Different targets can
be held independently to exercise overlapping real requests. `repository-denial`
captures the configured real denial before waiting, so later fixture restoration
does not change that held response's status.
`GET /__source-gate?target=…` reports entered/released/completed state; without a
target it reports the latest armed gate. POST with `action: release` or `reset`
settles that target, or all targets when omitted. These gates prove races without
sleeps, application mutation or exposing tokens; normal shutdown releases them.
The test runner separately registers `/__runner/restart` on the controlled service;
it restarts the actual application against the same temporary SQLite database
using an original or replacement test encryption key. This is test-process
orchestration only: production application routes, authentication and stored
records are not bypassed or mutated. The runner uses ten-second sessions to exercise
server-side expiry. Longer source suites may set `CONTROLLED_SESSION_SECONDS`;
the short-session expiry test explicitly skips in that mode and must also be
run in the default mode. Run `E2E_AUTH_MODE=unconfigured pnpm test:e2e` separately
to cover the missing-credential UI and HTTP contract (configured-auth tests skip).

For an isolated, reproducible source-mode review preview (no production build):

```sh
E2E_SOURCE_MODE=true E2E_APP_PORT=3006 E2E_FRONTEND_PORT=3005 \
  E2E_PROVIDER_PORT=3008 CONTROLLED_SESSION_SECONDS=900 \
  pnpm exec tsx scripts/test-server.ts
```

Open <http://127.0.0.1:3005>, select **Sign in with GitHub**, then **Authorize Alice**
or **Authorize Bob** on the explicitly controlled provider. Alice has private
`alice/project` and `alice/other`; page 2 of installations exposes `example-org`.
Use `https://github.com/public/outside/issues/1` for public URL resolution and
`https://github.com/alice/project/pull/2` for distinct PR identity/enrichment.
The same environment with `pnpm exec playwright test tests/e2e/sources-http.spec.ts`
starts/stops the preview automatically. Omit `CONTROLLED_SESSION_SECONDS` to
retain the default ten-second expiry proof. The runner supports the same port
variables for other isolated worktrees (test callbacks allow only 3001/3005/3100).
Ctrl+C stops owned processes and removes its temporary SQLite directory.
For bounded before/after regressions, `E2E_SOURCE_ENTRY` can select a separately
extracted baseline application's source entry in source mode only. The controlled
provider and public application seam remain real; production entry selection is
unchanged.

Provider replacement requires **both** `ENABLE_CONTROLLED_GITHUB=true` and
`CONTROLLED_GITHUB_ORIGIN=http://127.0.0.1:3101`, plus a loopback `APP_ORIGIN`.
Non-loopback provider overrides are rejected. This replaces external HTTP only:
state, PKCE, code exchange, encrypted SQLite credentials, session and CSRF checks
are unchanged. Never enable it for a real deployment.

Controlled-provider acceptance does **not** establish live GitHub authorization.
The live gate still needs the actual App client ID/secret, registered callback
and human authorization by two independent GitHub users, including refresh and
revocation under the actual App's permissions.

## Operate one durable backend

HTTP failures with status 500 or higher emit one JSON `server_request_failed`
event to standard error. It includes the level, server-generated request ID,
method, registered route template, status, native error type and an allowlisted
error code when available. The response's `X-Request-Id` matches the event so an
operator can correlate a reported failure. Client-supplied request IDs are ignored.
Raw URLs, query strings, headers, bodies, error messages, stacks and causes are
excluded because they can contain credentials or private board/GitHub content.
Expected 4xx responses do not produce these events; existing OAuth and repository
diagnostics retain their separate, bounded events. Capture stderr in the service
manager or container logs when hosting the application.

Use one application process and one SQLite database on a local filesystem. No
container, secondary database, backup daemon or HA service is required. Do not put
SQLite on a shared/network filesystem. Backups contain private board notes,
ownership, sessions, reference contexts and Incoming bookkeeping; protect them as
private application data even though GitHub credentials are encrypted.

### Fresh setup and restart

Install Node **26.8.1** (supported range: 26.x from 26.8.1) and pnpm **12.16.1**.
From a fresh checkout, verify both `node --version` and `pnpm exec node --version`,
then `pnpm install --frozen-lockfile` and `pnpm build`. The frozen lockfile also
applies the two committed exact-version native SDK patches. Run as a dedicated
unprivileged account, not root. Keep source/build files separate from durable data:

```sh
umask 077
mkdir -m 700 "$HOME/gitbored-data" "$HOME/gitbored-secrets"
pnpm data keygen "$HOME/gitbored-secrets/token.key"
export DATA_DIR="$HOME/gitbored-data"
export TOKEN_ENCRYPTION_KEY_FILE="$HOME/gitbored-secrets/token.key"
export APP_ORIGIN=http://127.0.0.1:3001
export ALLOW_LOOPBACK_HTTP=true
# Supply GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET through a protected service
# environment/secret store, never command-line arguments or shell history.
pnpm start
```

Configure the GitHub App callback for that exact origin and `/api/auth/callback`.
The key file must be owned by the application account, a regular non-symlink file,
mode 600 (or 400), with one 64-hex key. Startup rejects shared files and rejects
setting both `TOKEN_ENCRYPTION_KEY_FILE` and `TOKEN_ENCRYPTION_KEY`. The latter
remains available for a service secret environment; do not echo either value.
Relative `DATA_DIR` and key-file paths resolve from the application working
directory. The application creates/restricts the data directory to 700 and database
to 600; its WAL/SHM remain inside that protected directory. Do not use an existing
directory holding unrelated operator data: startup deliberately restricts its
permissions.

Wait for **Saved** in all board tabs before planned shutdown. Send SIGTERM to the
application process (or Ctrl+C in the foreground) and await process exit; Fastify
finishes in-flight requests and closes SQLite. Do not use SIGKILL as the ordinary
shutdown path. Restart from the same working directory, with the same `DATA_DIR`,
origin, credentials and encryption key. Check `/api/health`, sign in and reopen
the board; confirm the expected revision/content. A running editor's unsaved draft
is not included in a database backup. Keep the previous application release when
upgrading; use a backup with its matching release because downgrade migrations
are not provided.

### Consistent backup and isolated restore

The `data` command uses Node's SQLite online-backup API, not a raw file copy. It
includes committed WAL content and copies **all** database tables in one consistent
snapshot, including ownership, document revisions and per-board Incoming state.
It works with the application running; pause operator writes or stop cleanly if
you need a specific final revision. Writes acknowledged after the snapshot are
not promised to be included. Heavy concurrent writing can delay backup completion.

Keep the backup destination and encryption-key recovery in separately protected
storage (ideally different failure domains). Provision their parent directories
first with mode 700. For example, with protected backup/recovery mounts:

```sh
pnpm data backup "$DATA_DIR" /protected-backups/gitbored-2026-11-06
pnpm data key-copy "$TOKEN_ENCRYPTION_KEY_FILE" /separate-recovery/gitbored-token.key
```

These commands never print key material. Backup/restore exclusively create a
**new, nonexistent** destination directory (700), with a standalone
`gitbored.sqlite` (600), and check SQLite integrity/foreign keys before publishing
the completed filename. Missing, empty, uninitialized or unrelated SQLite sources
fail; an existing destination is never overwritten or merged. Key generation and
recovery copying also refuse existing destination files. Parent directories must
already exist. An interrupted operation may leave `.incomplete.sqlite`; do not
start an app on that directory or treat it as a successful backup. Remove only
that known incomplete destination and choose a fresh destination for another
operation. Successful database backups intentionally contain **no key file**.

Practice restoration without touching the original application:

```sh
pnpm data restore /protected-backups/gitbored-2026-11-06 "$HOME/gitbored-restored"
pnpm data key-copy /separate-recovery/gitbored-token.key "$HOME/gitbored-secrets/restored.key"
DATA_DIR="$HOME/gitbored-restored" \
  TOKEN_ENCRYPTION_KEY_FILE="$HOME/gitbored-secrets/restored.key" \
  PORT=3003 pnpm start
```

Use the matching original application version and protected GitHub App configuration.
For this isolated port, also set `APP_ORIGIN=http://127.0.0.1:3003`,
`ALLOW_LOOPBACK_HTTP=true` and register its callback if signing in there. Never
run two backends against the same live database. Check readiness, reopen an
owner's mixed native board and Incoming, compare the acknowledged revision and
selected sources/queue/seen/cursor progress, then check signed-out and a second
user cannot read or modify that board. Sessions are restored too; keep the copy
private and retire it after the drill. To cut over, stop the old process first and
point the replacement at the restored directory; never overwrite unrelated data.

Recover the **same** encryption key; generating a new key is not recovery.
The key alone does not replace the GitHub App client secret; recover that
separately from its protected secret store. With a wrong/lost key, existing users
and boards remain, but credentials require **Reconnect GitHub**. If no valid key
copy survives, generate/protect a new key and have each user explicitly reauthorize.
This is credential replacement, not decryption of the old credentials. Do not
print decrypted credentials, cookies, CSRF values or private database rows when
recording a recovery drill.

### Explicit HTTPS exposure

Loopback HTTP is the default. Terminate HTTPS in an explicitly configured reverse proxy on the same
host, using a certificate trusted by clients. Set `APP_ORIGIN=https://board.example.com`,
omit `ALLOW_LOOPBACK_HTTP`, retain `HOST=127.0.0.1`, and register
`https://board.example.com/api/auth/callback` with the GitHub App. Only expose the
proxy's TLS port, never the backend port. For example, this Caddy site forwards
unchanged paths to one backend started with `PORT=3001`:

```caddyfile
board.example.com {
    reverse_proxy 127.0.0.1:3001
}
```

Provision DNS/certificates and firewall policy explicitly; the application does
not do so. Never cache `/api`, strip its cookies, rewrite paths, or split the API
onto another origin. Serve client and API through the same proxy. TLS offload
does not require widening `HOST` or trusting arbitrary forwarded headers:
`APP_ORIGIN` determines OAuth redirects, exact Origin checks and Secure cookies.
HTTPS sessions are Secure/HttpOnly/SameSite=Lax/host-only. All unsafe API requests
still require the exact configured Origin **and** the current session's CSRF
token; protected contextual GETs also require that token. Verify HTTPS sign-in,
cookie flags, successful same-origin writes, and rejection of missing/wrong
Origin or stale/missing CSRF through real requests before exposing the service.
An HTTP origin on a non-loopback host is rejected, not silently upgraded.

## Continuous integration and container images

The `CI` workflow runs on pull requests and pushes to `main`. Each authentication
mode gets an isolated runner using a pinned Playwright Ubuntu image with its
browser, fonts and system dependencies preinstalled. Keep that image's version
and digest aligned with `@playwright/test` when upgrading. The full `pnpm gate` uses a 900-second controlled
session, while separate browser runs exercise short-session expiry and missing
GitHub configuration. All builds use Node from `.node-version`, pnpm from
`package.json`, the frozen lockfile and the committed tldraw patches. Failed
browser runs retain traces/screenshots for seven days. No real GitHub App secrets
are needed for tests. The locked test runner accepts Playwright filters:

```sh
CONTROLLED_SESSION_SECONDS=900 pnpm gate
CONTROLLED_SESSION_SECONDS=10 pnpm test:e2e tests/e2e/auth.spec.ts --grep 'an expired server session'
E2E_AUTH_MODE=unconfigured pnpm test:e2e tests/e2e/auth-unconfigured.spec.ts
```

After all checks pass, CI builds a Linux amd64 image and smoke-tests HTTP access,
built assets, signed-out access denial, its non-root user, persisted SQLite data
across restart and a consistent backup. On `main` only, a separate job publishes
that exact tested image to `ghcr.io/wipash/gitbored:sha-<full-commit-sha>` and
`:latest`. Pull requests never publish. The publisher uses the workflow's
`GITHUB_TOKEN` with `packages: write`; no personal registry token is required.
Actions/package policies must permit that job. Package visibility is managed in
GitHub; publishing does not make a package public automatically. A manual run on
`main` also tests and publishes. Pin a commit tag or digest for deployment.

Build and exercise the same image locally:

```sh
docker build -t gitbored:local .
bash scripts/smoke-container.sh gitbored:local
```

For Podman, set `CONTAINER_ENGINE=podman` for the smoke test. The Dockerfile pins
the Node base image by version and digest; update it together with `.node-version`
and the package's supported runtime when upgrading. The build context allowlist
excludes local data, credentials, Git metadata and test artifacts. The final image
contains production dependencies, compiled application files and the data CLI.

Run one container with persistent storage, behind the HTTPS proxy described above:

```sh
docker run -d --name gitbored --restart unless-stopped \
  -p 127.0.0.1:3001:3001 \
  --mount type=volume,source=gitbored-data,target=/data \
  --env-file /protected/gitbored.env \
  ghcr.io/wipash/gitbored:sha-<full-commit-sha>
```

Set `TLDRAW_KEY` to a valid tldraw license key covering the public hostname.
The server serves this public SDK key through `/api/client-config.js`, which the
browser loads before the app. It is runtime configuration, so replacing the key
requires a server restart and page reload, not an image rebuild. Without a valid
key, tldraw stops rendering after five seconds on production HTTPS domains.
The endpoint exposes only this public key; GitHub credentials and the token
encryption key remain on the server.

The protected environment file supplies `APP_ORIGIN=https://board.example.com`,
`GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` and the stable `TOKEN_ENCRYPTION_KEY`
(or a mounted `TOKEN_ENCRYPTION_KEY_FILE` owned by UID 1000 with mode 600/400).
Do not set `ALLOW_LOOPBACK_HTTP` for this HTTPS deployment. The image explicitly
sets `HOST=0.0.0.0` inside its container so port publishing works; ordinary local
starts still default to loopback. Only publish the container port on host
loopback, or connect it to a private proxy network. The application runs as UID
1000; bind-mounted data directories must be writable by that user. Never share
the live SQLite directory between application instances.

The image includes the same backup/key tooling as the checkout, compiled for Node:
`docker exec gitbored node dist/tools/scripts/data.js backup /data /backups/<new-name>`.
Mount a separately protected backup directory at `/backups` when creating the
container; its parent must exist and be writable by UID 1000. Follow the consistent
backup and separate key recovery procedure above. The smoke test's temporary
backup lives in its disposable test volume; production backups belong off-host.
TLS, App registration, secrets, backup scheduling and a tldraw production license
remain deployment configuration, not part of image publication.

## Verify

```sh
pnpm exec playwright install chromium
pnpm gate
```

The gate runs warning-free type-aware lint, first-party import-boundary checks,
strict client/server/tool type checking, a production build, and browser tests.
The browser runner uses a temporary SQLite directory and port 3100; it refuses
to reuse an existing server. `pnpm build` and `pnpm test:e2e` share a per-user
machine-wide lock across worktrees.

Individual commands: `pnpm lint`, `pnpm type-check`, and `pnpm test:e2e`.
Boundary checking rejects client/server crossings and Node imports in
browser-safe first-party code; it does not audit third-party package internals.

## Working on the project

- [Coding conventions](docs/CODING-CONVENTIONS.md)
- [Current progress and handover](.scratch/issue-canvas/PROGRESS.md)

Interface implementers must use `better-interface`. Keep independent review
focused on requested behavior and concrete regressions.

Board coordination has explicit owners. `useBoardMetadata` owns fetched metadata,
authorization visibility and SSO recovery; `useIncomingDiscovery` owns repository
discovery and accepts queue/cursor changes through the native board owner.
`IncomingWorkspace` keeps placement, native history and atomic document/Incoming
checkpoints together. `workspace/panels.tsx` owns panel exclusivity and focus;
opening a panel also closes the mobile tools menu. `navigation.ts` owns guarded
link and browser-history transitions, while `SaveCoordinator` settles save-drain
waits when its board lifetime ends. Server REST and GraphQL reads share the
authorization checks in `sources.ts`.
