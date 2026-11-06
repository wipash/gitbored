# Issue canvas progress

Updated: 2026-11-06

## Current state

Sean authorized redesigning repository selection after live source browsing was repaired. Current work is this Sources-to-board flow; the older feature queue and three parked branches remain paused.

The committed baseline contains sign-in, private durable boards, the native workspace, source browsing, Incoming, save/conflict recovery, and backup/restore tooling (tickets 01–05, 11, 16 and corrections 20–23). Its historical checked commit is `de017ac`. Commit `900e8e0` adds the live pagination repair, repository diagnostics and the repository connection redesign described below.

**Live source browsing works locally:** Sean confirmed sign-in, repository listing and issue retrieval after the canonical numeric-pagination fix. The earlier other-machine listing `403` remains unexplained. No complete live GitHub-to-board workflow has been confirmed yet.

**Repository connection redesign implemented:** direct owner/name or repository-URL lookup, account-scoped recent shortcuts, Sources → board selection/creation handoff, and a normal-flow connection section above the mounted canvas. Connecting starts the first bounded discovery page; placement stays deliberate. Successful retry clears only that repository's denial; denied lookups clear its fetched card metadata. Keep the source host outside `.board-canvas` as well as outside the native editor to avoid clipping.

Validation: Node 26 full gate passed (87 browser passes, one complementary skip, lint/types and native/server checks). The final connection-reopen and successful-retry changes passed two affected scenarios against a fresh production build. Final lint/types and independent Fable source/rendered correction review pass. Covered save/reload, restart-persistent shortcuts, account separation, errors/retry, keyboard paths and light/dark/narrow controls. Sean's live GitHub-to-board retry is the next product checkpoint.

Sean's app remains on ports 3001/3002 with isolated `.data/github-debug` storage and ignored `.env.github-debug` credentials. Leave that process alone. The temporary setup/launcher is `.scratch/github-debug-local.sh`.

## Delivery priorities when development resumes

1. Next product checkpoint: place real GitHub work from Incoming onto a board, arrange it, save and reopen it. Live source browsing is now confirmed locally.
2. Finish a coherent Atlas + Contextual board: choose work, place it, arrange and annotate it, inspect details, open GitHub links, save and reopen. Polish the actual light/dark interface as part of this slice.
3. Complete refresh and basic non-destructive filters, preserving placement geometry and native undo behavior.
4. Put that workflow in Sean's hands and use feedback to choose the next slice.

Planning-field mappings, JSON portability, expanded clipboard/schema work, and comprehensive lifecycle/performance acceptance remain in the specification but follow the first usable milestone. This sequencing does not remove promised scope or mark deferred tickets complete. Account isolation, safe persistence, and usable essential controls remain part of every slice.

## Preserved work

All three worktrees are under `../gitbored-wt/`, with the same suffix as their branch after `ticket/`. They are paused, unmerged, and not accepted as complete. Read the relevant ticket's latest Comments before touching one; historical review rituals there are superseded by the current [management guide](../../docs/PROJECT_MANAGEMENT.md).

| Ticket | Branch | Parked HEAD | Remaining product concern |
|---|---|---|---|
| [06 contextual details/controls](issues/06-contextual-details-controls.md) | `ticket/06-contextual-details-controls` | `a7f5274` (feature/tests `1d30de1`, based on `de017ac`) | Corrections exist, but narrow/enlarged reload left the canvas/card below the viewport with failed native hit testing. Cause remains unresolved. Finish the affected workflow and rendered correction review. |
| [08 coordinated refresh](issues/08-coordinated-refresh.md) | `ticket/08-coordinated-refresh` | `b5df686` (based on `15a13de`) | Substantial implementation and prior runtime evidence exist; the final fixture correction passed its focused test. Assess the final integration delta and complete under the current guide. |
| [12 JSON portability](issues/12-reference-json-portability.md) | `ticket/12-reference-json-portability` | `7aee65f` (based on `15a13de`) | Same-user authorization-error feedback was corrected with owner checks. Corrected-flow independent acceptance remains incomplete. Preserve and defer until the core workflow is useful. |

Parked ticket workers and their test runtimes remain shut down. Sean's local debug app uses ports 3001/3002. Check other port availability when resuming; leave his app, preview/tunnel and shared services alone.

## Design and implementation anchors

- Keep tldraw and the selected Atlas + Contextual appearance, including dark theme. Newly discovered work waits in Incoming; placement is deliberate.
- Canvas documents contain geometry and references; fetched GitHub metadata stays outside native history. Use the existing document capture/validation helpers and native grouping/history.
- Reuse existing session-context authorization, board request, save coordinator, and account-scoped recovery contracts. Preserve ownership checks and revisioned saves.
- Product requirements live in [spec.md](spec.md); remaining tickets and detailed failure history live in [issues/](issues/). Consult current code for interfaces rather than copying historical ownership contracts.

## Rendered review and follow-ups

Fable approved the repository connection flow after affected corrections, including light/dark desktop, keyboard/focus, 320px/enlarged controls, normal document scrolling and actual button hit testing. Report: `/tmp/gitbored-source-connection-findings.md`. Remaining low-impact follow-ups: reduce outer board-section padding further at enlarged narrow widths; combine connection/discovery feedback so the connection announcement lasts longer; improve the inherited error for a renamed repository's redirect. Screen-reader behavior was not directly exercised.

The next board-details milestone remains ticket 06. Its older obscured-control/clipping/interaction findings are not accepted by this Sources review; retain the parked correction work and review the affected coherent flow when resumed.

Detailed reports and artifact paths remain in ticket Comments. The previous full progress log is available in Git at `8749a8d:.scratch/issue-canvas/PROGRESS.md`; it is historical context, not an active work queue.
