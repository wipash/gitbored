# Issue canvas progress

Updated: 2026-11-06

## Current state

Published 19 specification tickets plus bounded integration correction 20. The user waived ticket confirmation and requested autonomous team implementation. Ticket 01 is integrated at `b7fb944809df7fd35e5939db8dfa34998ede36fe` but its post-merge gate failed; completion and further integration are paused pending ticket 20. Native workspace corrections continue independently.

## Execution board and frontier

| Ticket | Work state | Owner | Branch / worktree | Ports |
|---|---|---|---|---|
| 01 GitHub App sign-in | in-review; integrated result gate blocked by 20 | GitHubIdentity; independent source/browser rechecks approved | Merge `b7fb944` | Validation resources stopped |
| 02 Native reference workspace | in-review; corrections assigned | NativeWorkspace; CanvasCodeReview + CanvasBrowserValidation | `ticket/02-native-reference-workspace` / `../gitbored-wt/02-native-reference-workspace` | 3003 / 3004 reserved for validation |
| 03–19 | queued | Unclaimed | See individual blocking edges | None |
| 20 Logout-navigation synchronization | in-progress | Project manager; one-line integration correction | `ticket/20-auth-navigation-synchronization` / `../gitbored-wt/20-auth-navigation-synchronization` | Production gate ports only |

Current frontier: 02 corrections and 20 integration repair, both claimed. After 01+02 are done, durable boards (03) and source browsing (04) can run independently; 04 reuses 02's shared reference/metadata types. Only the manager merges locally into main; no push or PR.

## Shared contracts and ownership

- GitHubIdentity owns server authentication/session/schema setup, current-user browser-safe contract, OAuth routes, App sign-in composition and authentication UI styling. It may modify server runtime/configuration and controlled-provider test runner. No canvas files or tldraw dependency edits.
- NativeWorkspace owns pinned tldraw dependency/lockfile, `src/shared` native document/item/card contracts (except session), reusable `src/client/workspace` implementation and its own styles. No authentication/server runtime/App/main mounting edits. Use a throwaway harness for the real canvas smoke; remove it before handoff. No new production anonymous-board route.
- Workspace contract now implemented: `NativeWorkspace({initialDocument?,metadata,theme,onDocumentChange,onMount?,children?})`; `captureNativeDocument(editor)` strips SDK-local user/session records. Persist this helper's result, never raw SDK snapshots. `validateNativeDocument` is server-safe; metadata is an immutable externally supplied map and normalized kind is `issue | pull-request`. Mount keyed by account/board.
- Authentication contract is integrated but not yet gate-complete: `app.authentication.requireUser(request)`, `getAuthorizedUserToken(userId)` and `invalidateAuthorization(userId)`; `/api/session` returns signed-in/out/unconfigured state and CSRF token. Unsafe matched API routes require session, exact `APP_ORIGIN` Origin and `X-CSRF-Token`.
- Later board ownership: owner-authenticated GET/PUT with expected revision; atomic document and Incoming effects. Native snapshot validators must be safe on the server; no importing browser editor modules into server.
- Separate test files per ticket. Tracking updates remain separate logical commits. Shared runner changes are authentication-owned for first wave; workspace agent coordinates rather than overwriting them.
- Implementers skip build/lint/tests/formatters mid-flight; run applicable checks once after changes, then smoke the real surface and resolve reported failures. Each interface implementer must use better-interface and all available owning domain skills. Independent review/validation examines exact candidate commit.

## Review and integration evidence

- Ticket 01 corrected candidate `9db2c78a25fd3d2ed98c3370ed68355328748ca6` (source `a619b6fb8061b5ef50246a68d8b51633a0ff9ed9`) passed manager Node-26 `pnpm gate` (14 passed / 1 complementary skip) and independent IdentityCodeReview + IdentityBrowserValidation. Tracking-only rebase `b0e66596b853a045beae6cd899ab4f3bf2741229` also passed the pre-merge gate. Merged locally as `b7fb944809df7fd35e5939db8dfa34998ede36fe`; required post-merge gate FAILED (13 passed / 1 failed / 1 skip): the refresh-expiry test's new sign-in navigation raced the preceding logout navigation. Ticket 20 tracks the bounded synchronization correction; no automatic retry or green claim. Initial auth review findings remain corrected; live GitHub/TLS/AT still unverified.
- Ticket 02 candidate `31f71bb24c21fbefd4cff06dc88a6ea15a5d26e0` passed the initial manager gate on the host pnpm runtime. A separate declared-Node-26 gate was contaminated by the browser validator's throwaway harness in lint scope and failed; it must run after harness cleanup. No clean Node-26 success is claimed yet.
- CanvasCodeReview found three medium blockers: unchecked clipboard collections bypass shape restrictions; rich-text schema accepts unrenderable/unsupported content; native mailto edits cannot round-trip. Independent browser validation additionally confirmed unnamed native Text textbox and hidden-button focus preventing advertised arrow movement. NativeWorkspace is assigned one bounded correction pass after validation cleanup. No affected acceptance is considered complete; new source requires new candidate review/validation.
- Production E2E uses the shared serialized lock, port 3100 and controlled provider 3101; development agents use assigned ports only. Authenticated durable canvas mounting remains ticket 03.


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

Finish ticket 20 against the captured failing navigation evidence, gate and integrate it before any further integration. Collect corrected ticket 02 candidate and independently re-review/revalidate it. Then mark 01/02 done only with passing integrated gates and assign 03/04. Recompute frontier after every integrated ticket.
