# GitBored

A local-first issue-board application in development. Product scope lives in
[the issue-canvas specification](.scratch/issue-canvas/spec.md).

The runnable application provides GitHub App user sign-in, encrypted server-side
credentials, private sessions and persistent light/dark/system theme selection.
The separate `/runtime` diagnostic checks Fastify and real SQLite. Incoming and
board editing are not implemented yet.

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

The server creates `.data/gitbored.sqlite` with authentication tables. `DATA_DIR`
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


## GitHub App setup

Create a GitHub App with user authorization enabled. Register the callback as
`http://127.0.0.1:3001/api/auth/callback` for local use, or
`https://your-host/api/auth/callback` for a proxied deployment. The origin, browser
URL and callback must match exactly. Enable expiring user access tokens so refresh
is available. Sign-in is user authorization, not installation authorization:
anyone who successfully authorizes may sign in; there is no owner allowlist.

For the upcoming read-only source flow, select Issues: read, Pull requests: read
and required Metadata: read. Do not grant write, Contents, Checks, Actions, Commit
statuses or organization Members permissions. Installation access and organization
approval are separate from signing in. No App private key or installation token
is required or used by this sign-in flow.

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
makes saved credentials unreadable and requires signing in again. For HTTPS use
`APP_ORIGIN=https://your-host` and omit `ALLOW_LOOPBACK_HTTP`. HTTPS sessions use
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
- `getAuthorizedUserToken(userId): Promise<string>` returns only that user's
  decrypted access token, refreshing expired access once per user in flight.
  It throws `AuthenticationError` (401 `reauthorize` or 502 `provider_unavailable`);
  there is no installation-credential fallback.
- `invalidateAuthorization(userId): void` removes saved credentials. Call it on
  a downstream GitHub authorization rejection and stop private reads; do not
  invalidate on transient/rate-limit errors. `/api/session` detects rejected
  identity authorization itself.

Every unsafe `/api/*` request is checked globally for an authenticated session,
an exact `Origin: APP_ORIGIN` and `X-CSRF-Token` from that session. Future owner
routes must still call `requireUser` on safe reads and authorize each resource.
Sessions expire absolutely after seven days. Sign-in rotates the current session;
logout (`POST /api/auth/logout`) deletes it server-side. The UI does a full
navigation after logout to clear account-scoped client state. Tokens are
AES-256-GCM encrypted with user/purpose-bound authenticated context; only hashes
of bearer session cookies and OAuth state are stored.

### Controlled provider and live authorization

Production E2E starts the real application on 3100, real temporary SQLite, and the
external controlled HTTP provider on 3101. `scripts/controlled-github.ts` exports
`startControlledGitHub(port)`, returning its Fastify instance so later source tests
can add controlled GitHub endpoints. `tests/e2e/auth-support.ts` exports `signIn`,
`currentSession`, `controlProvider`, `applicationOrigin` and `providerOrigin`.
The provider's `/__control` accepts `reset`, `login`, `expiresIn`,
`refreshExpiresIn`, `fail`, `deny`, `rateLimit`, `revoke` and `revokeRefresh`;
`/__stats` reports exchange and refresh counts. These are provider routes, never
application test backdoors. The runner uses ten-second sessions to exercise
server-side expiry. Longer source suites may set `CONTROLLED_SESSION_SECONDS`;
the short-session expiry test explicitly skips in that mode and must also be
run in the default mode. Run `E2E_AUTH_MODE=unconfigured pnpm test:e2e` separately
to cover the missing-credential UI and HTTP contract (configured-auth tests skip).

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
