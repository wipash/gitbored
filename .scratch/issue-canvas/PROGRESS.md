# Issue canvas progress

Updated: 2026-11-05

## Current state

The management guide, coding conventions, agent instructions, and specification are aligned with local-first delivery for one or a few users, light/dark themes, and mandatory `better-interface` use by interface implementers.

The executable bootstrap is verified in the working tree. It contains a React/Vite diagnostic interface, Fastify, real SQLite readiness, strict tooling, a serialized production build/E2E runner, and three browser tests. GitHub sign-in, Incoming, and board editing are not implemented. The full product scope remains in `spec.md`.

This bootstrap was not assigned or integrated as an implementation ticket. Its verification was performed before committing; no exact-commit independent review or merge evidence is claimed.

## Execution board and frontier

| Work | State | Ownership / next action |
|---|---|---|
| Delivery guidance and coding conventions | Updated | Parent assistant; linked from `AGENTS.md` |
| Tooling and runtime bootstrap | Verified in working tree | BootstrapTooling and BootstrapRuntime implemented separate file sets; parent integrated and exercised them |
| Implementation tickets | Not decomposed | Project manager creates separate tickets from the accepted spec before assigning product implementation |
| Product workflow | Not implemented | Start with the agreed document/reference contract and a useful local board slice; retain the remaining specification scope |

No implementation agent remains assigned to active work. No new ticket branch or worktree was created for this bootstrap request.

## Exercised evidence

- `pnpm gate`: passed lint with zero warnings/errors, first-party import-boundary checking, all three strict TypeScript configurations, the production build, and all three Chromium tests.
- Browser tests: persisted light/dark selection and system-theme changes through direct navigation; unknown/malformed API requests return JSON 4xx responses rather than HTML; missing assets return 404 rather than the application shell.
- Negative boundary smoke: a temporary client import of `node:fs` and `../server/config` failed with the expected Node-module and cross-boundary errors, including the transitive server import. Removed the probe; the clean boundary check passed.
- Live `pnpm dev`: browser `/api/health` returned HTTP 200 after the real SQLite query. Keyboard navigation reached both controls with visible focus; keyboard theme selection and rechecking worked.
- Failure recovery: aborting the browser's health request showed the failed state; restoring the request and selecting Check again returned to ready against the actual server.
- Rendered light/dark screenshots inspected at desktop width and 320 CSS pixels. No document-level horizontal overflow at either width; narrow controls remained reachable. A separate 200% text-size check at desktop width also had no horizontal overflow. This is not a screen-reader certification.
- Direct production execution with Node 26.8.1: `/runtime` served the compiled `/assets/` JavaScript, rendered the interface, and completed the health check. The host's pnpm subprocesses selected Node 24.22.2 despite the shell selecting Node 26.8.1; the full gate evidence above is from that pnpm environment. The declared project engine remains Node 26.x. Check both executables when changing version-manager configuration.
- Normal Ctrl+C stopped the development processes and the production server. Ports 3001, 3002, and 3003 were checked and released. A supervisor force-stop initially left detached development children; those owned processes were explicitly cleaned up. Use normal interruption when exercising the launcher.

Bootstrap smoke services, temporary probe files, browser tabs, and owned installer/check terminals have been cleaned up. The earlier prototype preview and its tunnel were left unchanged.

## Tooling decisions

- TypeScript 6.0.3 supplies the compiler API used by the resolved-import boundary check. The initially selected TypeScript 7 package did not provide that API; do not restore it without migrating the checker.
- Build and E2E commands share a per-user `/tmp` lock across worktrees. Production browser checks reserve port 3100 and use a temporary database directory. Development work must reserve its own frontend/backend ports.
- Boundaries cover first-party client/server/shared imports, not third-party package internals. Coding conventions distinguish automated gates from review-only requirements.
- Local runtime data is under `.data/` by default; no application tables or private GitHub data exist yet. See the root README for setup and commands.

## Claude Fable review cadence

- Last rendered-interface Fable review: none; no completed review is claimed.
- Reviewed commit: none.
- Completed product UI tickets since review: zero; tickets have not been created.
- Next trigger: first complete board workflow, then the cadence and substantial-change triggers in `docs/PROJECT_MANAGEMENT.md`.
- The guide documents explicit Claude Fable launch and interaction through herdr-core. This bootstrap session inspected the CLI instructions; it did not run a Fable review.

## Decisions and prerequisites

No unresolved product decision blocks ticket decomposition. Use reversible implementation defaults within the accepted scope; record a stand-in's advice as provisional rather than user authorization. Real GitHub credentials/installation, any production licensing commitment, and external deployment provisioning still require their appropriate human steps when reached. They do not block the local tooling or specification work completed here.
