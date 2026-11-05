# 22: Accept documented managed GitHub usernames

**What to build:** Fix the confirmed sign-in rejection of a GitHub username containing an underscore, without changing identity authority or weakening unrelated response checks.

**Blocked by:** 01: GitHub application sign-in (done), 21: Safe OAuth failure diagnostics (done)

**Status:** ready-for-agent

**Work state:** in-progress

## Acceptance criteria

- [ ] Accept documented GitHub Enterprise Managed User logins containing underscores, including the enterprise suffix/setup-admin forms, while retaining the existing 39-character bound and rejecting unsupported characters and malformed identity fields.
- [ ] Actual ordinary OAuth callback with a managed-login fixture creates or reconnects the correct application user; subsequent authenticated session checks retain that identity. Renamed logins do not create a second owner for the same immutable GitHub ID.
- [ ] Preserve existing positive/safe numeric ID and name validation, state/PKCE/session/CSRF/encryption, callback outcomes, one-attempt behavior and bounded secret-safe diagnostics. No auth bypass or fabricated fallback.
- [ ] Exercise the actual callback/session HTTP path and SQLite with invented managed-user data; retain meaningful regression coverage and existing malformed-response/redaction protection. Do not replay the user's failed sign-in merely to confirm it.
- [ ] Complete independent affected source/runtime acceptance and exact manager pre/no-ff/post gates. Report controlled proof separately from the user's eventual live sign-in result; no additional debug environment flag, credential/key rotation or GitHub configuration change is required by this fix.

## Non-goals

No API-version change, int64/identity transport redesign, optional-field coercion, retry/cache framework, global request logging, credential inspection, client UI redesign or unmerged08/06 feature import.

## Affected shared contracts

GitHubIdentity owns `src/server/auth.ts` and the smallest existing controlled-provider/regression/README changes required. Main's single identity normalizer serves callback and stored-session validation. Ticket08's frozen composition has separate callback/session normalizers; its eventual rebase must retain this corrected login contract in both, without importing unfrozen08 code here. Preserve checked11 recovery and16/21 operations/diagnostics/gate wiring.

## Comments

- 2026-11-06 — **Project manager, confirmed user evidence/claim:** User supplied `{"event":"github_oauth_callback_failed","operation":"identity_lookup","category":"invalid_response","httpStatus":200}` and then confirmed their GitHub username contains an underscore. Actual main `providerIdentity` (`auth.ts:106–112`) rejects `_` via `^[a-zA-Z0-9-]{1,39}$`. GitHub's official managed-user documentation explicitly requires underscore/shortcode usernames and retains the39-character total bound: https://docs.github.com/en/enterprise-cloud@latest/admin/managing-iam/iam-configuration-reference/username-considerations-for-external-authentication . This is a deterministic application rejection of the user's format, not a network/client-secret/certificate diagnosis. No username value, token or provider body was requested.
- 2026-11-06 — **Project manager, assignment:** Owner GitHubIdentity; branch `ticket/22-managed-github-identity`, worktree `../gitbored-wt/22-managed-github-identity`, application3009/provider3019. Start from checked11 merge0c5e796 plus the manager's tracking claim. Old21/11 worktrees are removed; do not reuse them. Required docs/conventions and existing fixture patterns apply. Owner appends own evidence only; manager owns status/PG/acceptance/integration. All other implementation remains isolated; this user-priority correction integrates before08's final auth composition.
