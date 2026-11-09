# Coding conventions

Apply these rules when implementing or reviewing GitBored. This is a small local-first tool, not a general application framework. Prefer platform capabilities, the selected libraries, and a complete vertical slice over speculative abstractions.

**Enforcement:** `pnpm lint` includes configured oxlint rules and the import-seam check; `pnpm type-check` applies the TypeScript configs. Those files are the exact automated rule set. Rules labelled **Review** below require evidence in code review, not a claim that a tool already enforces them. `pnpm check` runs lint, type checking and focused tests; `pnpm gate` adds a production build and browser tests.

## Local verification before handoff

Automatic CI runs `pnpm check`; browser coverage is the implementing agent's responsibility. Run focused checks during development. Before handing off application, dependency or test-runner changes, run these commands on the final integrated candidate and report their results:

```sh
pnpm exec playwright install chromium
CONTROLLED_SESSION_SECONDS=900 pnpm gate
CONTROLLED_SESSION_SECONDS=10 pnpm test:e2e tests/e2e/auth.spec.ts --grep 'an expired server session'
E2E_AUTH_MODE=unconfigured pnpm test:e2e tests/e2e/auth-unconfigured.spec.ts
```

The long-session suite skips the expiry scenario, so the short-session run is required separately. Keep the local build lock: `pnpm test:e2e` protects the production build across worktrees. Report blocked or failed checks explicitly; automatic CI passing does not establish browser correctness. Documentation-only changes do not require application checks. For workflow-only changes, validate the workflows and run any changed check commands; a browser rerun is needed if its invocation or environment changes. For Dockerfile or image smoke-test changes, also build the image locally and run `scripts/smoke-container.sh` against it.

The manual **Browser checks (manual)** workflow is available when a hosted browser run is useful. It uses one runner and one build for all three authentication modes. Keep its pinned Playwright image version aligned with `@playwright/test` when upgrading. Automatic image builds, smoke tests and publication run only on `main`; documentation-only pushes to `main` skip CI. A manual `CI` run can publish a commit-tagged image from any branch. Only `main` updates `latest`.

## TypeScript and modules

- **Compiler/lint:** strict typing, checked indexed access, exact optional properties, explicit type-only imports, handled promises, and the configured unsafe-value checks. Use `unknown` for external data and narrow it. Prefer guards or construction invariants to non-null assertions and casts; a narrowly justified exception belongs at a validated interface, with a local suppression explaining why it is safe.
- **Review:** model closed states with string-literal/discriminated unions, deriving a runtime list only when one is needed. Handle every state deliberately. Use interfaces for ordinary object contracts and type aliases for unions and transformations as a consistent default, not a reason for unrelated churn.
- **Lint:** imports must remain acyclic. Browser code is in `src/client`, server code in `src/server`, and genuinely shared browser-safe contracts may live in `src/shared`. The compiler-resolved import check follows first-party transitive imports; it rejects imports across the client/server seam and Node imports in browser-safe source. It is not an audit of every third-party package's internals.
- **Review:** browser code must never gain access to server credentials, database connections, filesystem APIs, or server-only dependencies through an external package or re-export. Shared runtime code must stay browser-safe and free of hidden I/O. Put shared contracts in the shared module rather than importing server implementations as types.
- **Review:** initialize I/O at application entry points, not as a surprise effect of importing an ordinary module. Add an interface or injectable dependency where behavior actually varies; do not wrap every library or pass a clock/database through every pure function just to make it mockable.
- **Review:** separate the canvas document from fetched GitHub metadata. Geometry and references belong in tldraw; private titles, labels, credentials, and refresh history do not. Use native canvas grouping/history rather than a parallel layout model.
- **Review:** use named exports unless a framework requires a default export; `PascalCase.tsx` for React components, `useThing.ts` for hooks, and descriptive `camelCase.ts` for other modules. Use `node:` for built-ins. Relative imports within a feature are fine; use aliases only when they improve navigation. Follow domain glossary/ADR terms when present.

## Errors, asynchronous work, and private data

- **Lint/review:** await promises, return them to a responsible caller, or deliberately detach work whose failure is handled. `void` alone does not handle a rejection. In a `try` whose handler must catch an asynchronous failure, use `return await` rather than returning an unsettled promise.
- **Review:** throw Error objects, preserve the original cause when adding context, and classify expected failures using stable types/codes rather than matching message text. A catch must recover, propagate, or explain why ignoring that particular failure is safe.
- **Review:** log failures once at the responsible request or background-operation entry point, not at every rethrow. Use error/warning/information levels deliberately. Keep tokens, private payloads, authorization headers, and sensitive user content out of logs and client error messages.
- **Review:** authenticate early, validate untrusted route/body data, and authorize the specific resource before protected reads or writes. Validate GitHub responses and imported documents rather than trusting a TypeScript assertion. Construct supported requests; do not proxy arbitrary URLs.
- **Review:** degraded, stale, unavailable, empty, and successful states are different. Optional data may fail without destroying the page, but an authorization failure must never become a successful-looking fallback or expose another account's cache. Ignore stale in-flight results after account changes.
- **Review:** scope private board operations, references, caches, and recovery state to the current user. Keep ordinary ownership checks and safe persistence; avoid speculative security platforms, HA machinery, or layers intended for an imagined large deployment.
- **Review:** explicit read-only sharing may publish the owner's displayed issue details, including private-repository details, as durable board content. Limit publication to placed references and authorize it through the board's sharing policy. This exception never opens ordinary user-scoped caches, credentials, reference endpoints or owner mutations. Keep publication metadata outside the native document and broadcast only committed saves.

## Interface work

Every agent or subagent implementing interface features must use **`better-interface`** and its owning domain skills before handoff. Apply it to the concrete screen/flow, not an unbounded review of the whole repository. Use the agreed design and a reachable preview; report any unreviewed domain or unverified state.

- **Review/browser:** preserve Atlas + Contextual, including the dark theme. Use semantic tokens for both themes, native controls where suitable, accessible names, visible focus, and appropriate status announcements.
- **Review/browser:** inspect actual desktop rendering and the affected interactions. Cover loading, empty, failure, and long-content states when they exist. At 320px and enlarged text, controls remain reachable and the document does not scroll sideways; the spatial canvas may scroll internally.
- **Review/browser:** when React state or callbacks around the canvas change, check editor lifetime, in-flight gestures and native history across panel rerenders. Use the existing real-key and pointer regressions to verify continuity.
- **Review/browser:** an anchored panel is non-modal: it must not block the canvas or trap focus. Verify placement, direct card switching, dismissal, and focus return. Dragging and keyboard alternatives must produce the same intended operation.
- **Review/browser:** respect reduced-motion preferences and communicate state with more than color or motion alone. Judge failures against evidence, not personal taste. Keep independent review focused on the requested behavior and concrete regressions.

## Tests and verification

The approved primary seam is the running application's browser UI and public HTTP endpoints, using real persistence. Replace external GitHub HTTP behavior for deterministic scenarios, not internal modules. Live GitHub permissions/authentication are verified separately when those features exist.

- **Review:** write a behavioral test first and observe the expected failure where practical. Implement one vertical slice at a time. Do not add an empty test suite, assertion about source/configuration text, or mocked forwarding test to make a gate look complete.
- **Review:** test user-visible results, state transitions, persistence, errors, and authorization. Prefer assertions that survive changing an internal query or helper. Add a lower-level test seam only when an important invariant cannot reasonably be exercised through the application.
- **Review:** use invented fixture data, isolated databases/accounts, and deterministic time/randomness where the scenario needs them. Automated tests must not depend on private repositories, personal credentials, production data, or live third-party availability.
- **Review:** name tests after behavior, referencing an ADR when it explains a protected rule. Assertions must execute for every intended case. Avoid `.only`, sleeps used as synchronization, arbitrary wording snapshots, and length/non-empty assertions that prove no useful behavior.
- **Review:** reproduce a reported bug before changing it and verify the changed path afterward. Preserve a focused failing-before/passing-after regression test when practical. Browser evidence is required for canvas hit testing, focus, responsive layout, and visual claims; tests alone do not establish those outcomes.
- **Review:** report failures honestly. Fix failures caused by the change; record unrelated failures for a bounded corrective assignment rather than concealing them or expanding every ticket. A known failing integration gate is not green.

## Dependencies, suppressions, and commits

- **Review:** add a package when it solves something meaningfully harder than the platform or existing dependencies provide. Assess maintenance, compatibility, advisories, and release risk; package age alone is not a safety guarantee. Explain the need and alternatives in the change record.
- **Install/config:** commit the lockfile and use frozen installs for reproducibility. Keep build/lint/test tools in development dependencies. Approve only the dependency build scripts actually required; do not broadly enable third-party install scripts. Follow the package manager/runtime versions declared in the package manifest.
- **Review:** fix code rather than weakening a rule globally. When a rule is inappropriate for a specific line, keep a narrow suppression with a concrete reason; remove obsolete suppressions. Do not transplant another repository's legacy exceptions or violation counts.
- **Review:** comments explain a non-obvious invariant or tradeoff to a future maintainer. Commit/ticket records explain what changed and why. There is no punctuation ban or requirement to comment obvious code.
- **Review:** keep commits logical, with an imperative summary, reason, and exercised verification for behavioral changes. Prefer `feat`, `fix`, `refactor`, `test`, `docs`, or `chore` prefixes with a relevant optional scope. Keep tracking updates distinct from feature changes. Record the actual reviewed/validated commit and do not carry evidence forward across unexamined changes.
