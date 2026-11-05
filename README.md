# GitBored

A local-first issue-board application in development. Product scope lives in
[the issue-canvas specification](.scratch/issue-canvas/spec.md).

The runnable code currently provides developer diagnostics: a React interface,
a Fastify API, a real SQLite readiness query, and persistent light/dark/system
theme selection. GitHub authentication, Incoming, and board editing are not
implemented. The diagnostic screen does not request GitHub data.

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

The server creates `.data/gitbored.sqlite`. `DATA_DIR` changes that directory;
relative paths resolve from the repository root. Runtime data is ignored by
Git. No application tables or board data exist yet.

For separate worktrees, assign both ports:

```sh
VITE_PORT=3005 PORT=3006 DATA_DIR=.data-local pnpm dev
```

`HOST` defaults to `127.0.0.1`; the runtime accepts loopback addresses only.
The development launcher uses IPv4 loopback. Do not expose this diagnostic
runtime as an authenticated application.

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
