# GitBored

A local-first issue-board application in development. Product scope lives in
[the issue-canvas specification](.scratch/issue-canvas/spec.md).

The runnable application provides GitHub App user sign-in, encrypted server-side
credentials, private sessions, authorized GitHub source browsing, owner-only durable
boards and persistent light/dark/system theme selection. Boards mount the native
canvas for notes, drawings, frames, groups and reference placements. The separate
`/runtime` diagnostic checks Fastify and real SQLite. Incoming placement is not
implemented yet.

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

Authenticated navigation has one primary view at a time: **Account** (`/` or
`/account`), **Boards** (`/boards`, `/boards/:id`) and **Sources** (`/sources`).
Each route has a named, keyboard-focused primary heading; browsing does not
automatically create a board or placement.

Sign in, open **Boards**, enter a name and select **Create board**. Each board is
private to its signed-in creator. **Board settings** renames the board or opens a
permanent-deletion confirmation requiring the exact board name. Deleting a board
does not change GitHub. The list and workspace support both themes and keyboard
controls; the spatial canvas scrolls independently of the surrounding document.
The narrow board canvas reaches the viewport edges so native mobile controls stay
available at enlarged text sizes. The named deletion dialog keeps its confirmation
field focused on open; asynchronous board actions preserve keyboard focus, with
an acknowledged retry returning focus to the save status.

`src/shared/boards.ts` owns the board/save contract. `GET /api/boards` lists only
the current owner's summaries; `POST` creates an empty native board with `{title}`.
`GET /api/boards/:id` returns its validated document and revision. `PUT` accepts
`{expectedRevision, document}` and atomically advances the document revision with
a conditional SQLite update. A stale save returns409 and cannot overwrite content.
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
automatically. **Reload server version** explicitly confirms discarding local edits.
Keep this tab open to retain them.

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
There is no browser-persisted private draft, automatic conflict merge or save-as-copy
yet (recovery is a later ticket).

SQLite remains authoritative across browser reloads and real server restarts.
For a straightforward local backup, stop the server cleanly, copy the entire data
directory to protected storage, and retain the token-encryption key separately.
Restore with the server stopped, replace the data directory with that backup,
restore the same key, then restart and reopen a board. Do not copy only the main
SQLite file while a WAL-mode server is writing.


## Native workspace keyboard boundary

The native workspace is mounted at authenticated `/boards/:id` routes.
Its SDK is pinned to 5.6.0. Two version-specific pnpm patches in `patches/`,
registered in `pnpm-workspace.yaml`, correct accepted-key releases in
`@tldraw/editor` and tldraw's body-owned comma shortcut. A native press must finish
even if focus moves to a button, link or other UI. The SDK retains its own
modifier/Meta cleanup and comma pointer lifecycle; the application does not copy
that bookkeeping or dispatch substitute keyboard events.
Repeats cannot transfer a press already accepted by another native handler when
modifiers change its reported character.

Cards uses one editor-lifetime document capture gate for UI-origin physical key
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
the real-browser matrix passes: both press directions across Cards, held arrows
and Space, comma with changed modifiers/focus, Meta reconciliation, repeats,
dismissal, blur and ordinary native editing/shortcuts. A successful install or
type-check alone does not establish correct keyboard behavior.

## Authorized source browsing

After sign-in, open **Sources**. **Browse GitHub sources** lists authorized personal/organization
installations and their repositories. Sign-in, installation selection and
organization approval are separate. **Manage GitHub installations** opens GitHub's
settings; organization owners may need to approve the app and select repositories.
An empty picker does not prove that public URLs are unavailable.

Repository browsing loads mixed issue/PR pages, including PR-only and empty pages.
**Load next page** advances explicitly; a transient failure retains loaded results
and **Retry page** retries the failed cursor. Provider access loss clears affected
repository values, aborts their pending reads and offers **Retry repository**.
Denials are remembered per repository for this source/session lifetime, regardless
of which repository was selected when the failed request began. Back/navigation,
**Reload installations**, unrelated denials and successful URL reads do not forget
them. **Retry repository** clears only the selected repository's block and starts
fresh page 1; it never restores old rows or recovers another repository.
An unrelated unavailable URL does not revoke other repositories. Account/session
context loss clears all source representations and offers explicit **Reload current
account** through application composition; SourceBrowser does not own another auth
flow. Title/number and kind filters apply only to the loaded subset, never to a
complete repository search. Two-line row titles and bounded previews expand
through native, keyboard-accessible **View full available details** disclosures.
Full titles, labels, assignees, state reason and available timestamps are retained;
no bodies or comments are requested for rows or details.

Pagination and URL controls stay focusable while busy and ignore repeat activation.
After the final page, the same pagination button displays **All pages loaded** as
unavailable, preserving keyboard focus. Completion never steals focus if you move
to another control while a request is pending.
If access loss removes the content you currently focused, focus moves to its
access notice after removal. Focus in the URL form, an unaffected repository or
another live control is left alone. A fresh URL submission may show a newly
authorized item without clearing that repository's separate browsing block.

**Resolve URL** accepts canonical HTTPS `github.com/owner/repository/issues/123`
and `/pull/123` URLs, optionally ending in `/`, without credentials, ports, encoded
paths, queries or fragments. Public URLs outside the picker and authorized private
URLs use the signed-in user's token, never an installation token. API paths are
constructed from validated parts. URL access does not imply installation/webhook
coverage. Neither browsing nor resolving creates a canvas placement.

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
page numbers are used, never provider-supplied Link URLs. Provider responses are
bounded to 4 MB; over-limit or malformed pages fail without advancing progress.
Titles are bounded to 65,536 characters, label/assignee lists to 1,000 values,
label names to 1,024 and assignee values to 256 characters. Values are rejected,
not silently truncated, at the provider boundary. The registry stores identity
and locators, not private titles or a browser-persisted metadata cache.

## GitHub App setup

Create a GitHub App with user authorization enabled. Register the callback as
`http://127.0.0.1:3001/api/auth/callback` for local use, or
`https://your-host/api/auth/callback` for a proxied deployment. The origin, browser
URL and callback must match exactly. Enable expiring user access tokens so refresh
is available. Sign-in is user authorization, not installation authorization:
anyone who successfully authorizes may sign in; there is no owner allowlist.

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
export TOKEN_ENCRYPTION_KEY=\"$(openssl rand -hex 32)\"
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
The same environment with `pnpm exec playwright test tests/e2e/sources.spec.ts`
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
- [Project management guide](docs/PROJECT_MANAGEMENT.md)
- [Current progress and handover](.scratch/issue-canvas/PROGRESS.md)

Interface implementers must use `better-interface`. The management guide
defines independent review, exact-commit evidence, and periodic Claude Fable
reviews of the rendered interface.
