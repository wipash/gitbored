# Issue canvas progress

Updated: 2026-11-05

## Current state

Published 19 separate dependency-ordered implementation tickets from the accepted specification. The user waived the ticket-confirmation round and requested autonomous team implementation. Bootstrap is on main at `b8f77f5`; prior gate/smoke evidence is historical, not evidence for new candidates.

## Execution board and frontier

| Ticket | Work state | Owner | Branch / worktree | Ports |
|---|---|---|---|---|
| 01 GitHub App sign-in | in-progress | GitHubIdentity | `ticket/01-github-app-sign-in` / `../gitbored-wt/01-github-app-sign-in` | 3001 / 3002 |
| 02 Native reference workspace | in-review | NativeWorkspace; CanvasCodeReview + CanvasBrowserValidation checking | `ticket/02-native-reference-workspace` / `../gitbored-wt/02-native-reference-workspace` | 3003 / 3004 reserved for validation |
| 03–19 | queued | Unclaimed | See individual blocking edges | None |

Current frontier: 01 and 02, both claimed. After 01, source browsing (04) can proceed independently of workspace completion. After 01+02, durable boards (03) can run alongside 04. Only the manager merges locally into main; no push or PR.

## Shared contracts and ownership

- GitHubIdentity owns server authentication/session/schema setup, current-user browser-safe contract, OAuth routes, App sign-in composition and authentication UI styling. It may modify server runtime/configuration and controlled-provider test runner. No canvas files or tldraw dependency edits.
- NativeWorkspace owns pinned tldraw dependency/lockfile, `src/shared` native document/item/card contracts (except session), reusable `src/client/workspace` implementation and its own styles. No authentication/server runtime/App/main mounting edits. Use a throwaway harness for the real canvas smoke; remove it before handoff. No new production anonymous-board route.
- Workspace contract now implemented: `NativeWorkspace({initialDocument?,metadata,theme,onDocumentChange,onMount?,children?})`; `captureNativeDocument(editor)` strips SDK-local user/session records. Persist this helper's result, never raw SDK snapshots. `validateNativeDocument` is server-safe; metadata is an immutable externally supplied map and normalized kind is `issue | pull-request`. Mount keyed by account/board.
- Authentication contract now implemented in the active worktree: `app.authentication.requireUser(request)`, `getAuthorizedUserToken(userId)` and `invalidateAuthorization(userId)`; `/api/session` returns signed-in/out/unconfigured state and CSRF token. Unsafe `/api/*` requires session, exact `APP_ORIGIN` Origin and `X-CSRF-Token`. Candidate not yet integrated.
- Later board ownership: owner-authenticated GET/PUT with expected revision; atomic document and Incoming effects. Native snapshot validators must be safe on the server; no importing browser editor modules into server.
- Separate test files per ticket. Tracking updates remain separate logical commits. Shared runner changes are authentication-owned for first wave; workspace agent coordinates rather than overwriting them.
- Implementers skip build/lint/tests/formatters mid-flight; run applicable checks once after changes, then smoke the real surface and resolve reported failures. Each interface implementer must use better-interface and all available owning domain skills. Independent review/validation examines exact candidate commit.

## Review and integration evidence

Ticket 02 candidate `31f71bb24c21fbefd4cff06dc88a6ea15a5d26e0` is rebased onto current main and under independent source review plus actual-browser validation. `pnpm gate` is running on this candidate, including its native-document regression suite. Implementer reports standalone real SDK smoke; authenticated durable mounting remains ticket 03. Ticket 01 is finishing verification. Production E2E uses shared serialized lock, port 3100 and controlled provider 3101; development agents use assigned ports only.

## Claude Fable review cadence

- Last completed rendered Fable review: none.
- Reviewed commit: none.
- Completed UI tickets since review: zero.
- Next trigger: first complete board workflow, substantial theme/navigation/interaction change, or milestone; then every three completed UI tickets.
- `hc --skill` read; `hc templates` returned none. Launch interactive explicit `claude --model fable --effort high` with concrete rendered flow and parent terminal address; do not use print mode or permission bypass.

## User updates and prerequisites

- Read-only configuration discovery finished: Azure Resource Graph across accessible subscriptions found no gitboard/gitbored resources; the shared InternalApps vault listed no secrets; registered-app prefix searches returned none. The holmesgroup GitHub installation list has no clearly identified GitBored app. No credentials were discovered or resources modified. User can provide App details later; controlled-provider implementation proceeds independently.
- The user removed licensing from the requested work; it is not tracked or a completion gate in these tickets.
- Real GitHub permissions, two independent users, configured planning mappings, and human interaction for authorization remain acceptance evidence distinct from controlled-provider tests. Continue independent work if configuration is unavailable.

## Next action

Collect exact-candidate reviews/gates, correct any acceptance failures, merge checked candidates locally, then assign 03 durable private boards and 04 authorized source browsing independently. Ticket dependency integrity check passed for all 19 files (canonical triage roles; blockers exist and precede dependants). Recompute frontier after every integrated ticket.
