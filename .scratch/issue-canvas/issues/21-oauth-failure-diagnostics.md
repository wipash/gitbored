# 21: Diagnose silent GitHub sign-in failures

**What to build:** Make the reported live GitHub callback failure diagnosable without exposing secrets or changing authentication outcomes. Resolve the underlying deployment/protocol cause when evidence identifies it; do not claim a successful live sign-in without observed proof.

**Blocked by:** 01: GitHub application sign-in (done)

**Status:** ready-for-agent

**Work state:** in-progress

## Acceptance criteria

- [ ] A failed GitHub token exchange or identity lookup produces one actionable server-side diagnostic identifying the operation and safe failure category, including HTTP status or a bounded network/TLS error code when available.
- [ ] Diagnostics never contain client credentials, encryption keys, OAuth codes/state/verifiers, cookies, tokens, authorization headers, callback query strings, provider bodies or arbitrary upstream exception messages. Do not enable request logging that exposes callback parameters.
- [ ] Existing redirect classifications, state/PKCE/session/CSRF checks and credential encryption remain unchanged. No automatic OAuth retries, authority bypass, fake successful fallback or broad logging framework.
- [ ] Exercise actual callback failures through controlled external HTTP and real application persistence, observe operator output and unchanged browser/HTTP failure outcomes; include secret-redaction evidence. Do not replay the user's failed live sign-in to confirm it.
- [ ] Identify the other-machine failure from safe evidence when available; otherwise explicitly retain the exact missing prerequisite and finish all reachable diagnostic work. No credentials are requested or printed.

## Non-goals

No global request logging, telemetry platform, OAuth redesign, SDK/UI redesign, new GitHub App/cloud configuration, credential/key rotation or claim of live sign-in success from controlled fixtures.

## Affected shared contracts

Own the bounded callback/provider error diagnostic in `src/server/auth.ts` and necessary existing controlled-provider tests/README troubleshooting. Coordinate with08's frozen auth/session/backoff changes at integration; do not import its unfrozen source. Preserve16 runtime/key-file/callback behavior and main b27dfbe's corrected README key command.

## Comments

- 2026-11-06 — **Project manager, user report/claim:** After correcting the README key-shell quoting, the user's other machine returns from GitHub to http://127.0.0.1:3001/ with "GitHub could not complete sign-in. Try again shortly with Sign in with GitHub." No server console logs. This is ground truth, not a baseline to rerun. Parent traced `AuthLanding.tsx:15` to callback AuthenticationError handling at `auth.ts:364–366`; token-exchange/identity failures are collapsed to provider redirect and not logged; Fastify logger is disabled. Cause of the remote provider failure is not yet known. A credential-free Node HTTPS connectivity check was supplied; its output is pending. Parent read actual GitHub user-token documentation; current protocol shape alone does not establish a live failure cause.
- 2026-11-06 — **Project manager, assignment:** GitHubIdentity resumes as owner on `ticket/21-oauth-failure-diagnostics`, worktree `../gitbored-wt/21-oauth-failure-diagnostics`, from main b27dfbe. Development application3009/provider3019 reserved, retaining accepted existing3009 callback; do not disturb16's HTTPS3010 contract or other services. Source owner may use actual TypeScript entry with real persistence for bounded smoke. Normal shared build/production lock only; do not preempt/nest it. Owner appends own Comments only; manager owns PROGRESS/status/acceptance. Independent affected review/runtime and manager integration remain required.
- 2026-11-06 — **Project manager, independent reviews:** Exact331712f2294fabded833af4bfcb137e6e13c0a7a/source28d68f0e7a980b00e8d4c66d9f9e4e8d231c4fa3 received independent runtime PASS (`/tmp/gitbored21-runtime-review-331712f.txt`, sanitized evidence `/tmp/gitbored21-runtime-evidence-331712f.json`): one actual TypeScript-entry HTTP/SQLite smoke exercised15 distinct failures, including UNKNOWN network fallback at both operations, exact safe diagnostics, redaction, no retries, consumed state and original complete user/session rows unchanged. Application exit0/provider closure/database and harness removal/3009+3019 rebound were awaited; no production/live claim. Independent source report `/tmp/gitbored21-source-review-331712f.txt` requested only one P2: the permanent13-scenario regression is omitted by the existing gate. Production auth/diagnostic change has no additional established defect. Owner released for package-script/README-only correction invoking this existing regression from `test:server` and the gate; no new suite or application changes. Full actual reports read; safe evidence from the affected machine remains the missing live prerequisite.
