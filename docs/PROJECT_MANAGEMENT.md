# Project management guide

Deliver a working, polished GitBored workflow for Sean, running locally first. Progress means usable behavior with real GitHub data. Build on the existing implementation and selected Atlas + Contextual design.

## Sources of truth

- `.scratch/issue-canvas/spec.md`: product scope and settled design decisions.
- `.scratch/issue-canvas/PROGRESS.md`: current usable behavior, blocker, next deliverable, and preserved work.
- `.scratch/issue-canvas/issues/`: ticket acceptance criteria and detailed implementation history.
- `docs/CODING-CONVENTIONS.md`: engineering and interface standards.
- `.agents/issue-tracker.md`, `.agents/triage-labels.md`, `.agents/domain.md`: tracker, status vocabulary, and domain documentation conventions.

Read the progress record, relevant specification/ticket, and coding conventions before implementation. This guide replaces the previous review cadence and procedural holds recorded in historical ticket Comments. Preserve concrete defects and unfinished requirements; reassess the work needed under this guide. An explicit user pause remains binding.

## Choose the next deliverable

Keep one active product slice with one owner responsible through integration. Name the user action that will work at the end and the observable completion criterion. Prefer short flows Sean can try over infrastructure or exhaustive acceptance matrices.

Exercise real GitHub sign-in and repository access as soon as their implementation exists. Use controlled-provider tests for repeatable regression coverage, and live smoke checks to establish actual integration. A later comprehensive acceptance ticket does not prevent earlier live checks.

Show a working flow after each slice and use feedback to choose the next one. Defer secondary features explicitly without calling the whole specification complete. Choose routine reversible implementation details directly from existing conventions; ask Sean when changing settled product scope, crossing an authorization boundary, requiring human provisioning or spending, or taking destructive action.

Reuse parked work before starting a replacement. Use an isolated branch/worktree when needed and record its location. Additional agents require an explicit task or applicable instruction authorizing delegation, plus a concrete independent purpose; a panel is not the default. Define shared-file ownership only when concurrent work actually needs it.

## Implement and inspect

1. Implement the complete user action, including its actual application composition. Preserve account isolation, safe credentials, revisioned persistence, and separation of GitHub metadata from canvas history.
2. For interface work, use `better-interface` and its owning domain skills. Inspect the affected rendered flow early, in light/dark desktop views, with keyboard controls and a narrow/enlarged-text sanity check. Polish readability, hierarchy, spacing, and feedback while implementing. Keep essential controls reachable and the canvas usable.
3. Add or update focused behavioral tests for meaningful regressions. Use the running browser/public HTTP application and real persistence, replacing external GitHub behavior for deterministic tests. Start with a failing test where practical; avoid elaborate test machinery for low-impact reversible changes.
4. Run applicable checks after a coherent change. Fix failures caused by the slice. Record unrelated failures separately with their impact; never report a failed check as passing.

Build and production E2E commands share a machine-wide lock. Use the existing runner, let queued work wait, and avoid nested locks. Production tests use ports 3100/3101; choose available development ports in 3001–3019. Release only resources owned by the task and leave user/shared services alone.

## Review and resolve findings

Use one consolidated independent review for a meaningful behavioral slice, covering source and the affected rendered/runtime flow as appropriate. The implementer supplies requirements, the candidate, a reachable preview, checks already performed, and known limitations. Documentation-only work needs a consistency check.

Block completion for concrete lost work, private-data exposure, broken essential actions, inaccessible essential controls, or materially broken rendering. Describe the actual failure and impact. Record smaller defects and visual preferences as follow-ups rather than opening another review round for every finding. A failing integration gate still needs resolution before claiming completion.

Fix findings together, then check the affected paths. Add another review only for an unresolved material concern or a consequential new change. When a review remains needed, state the specific question it will answer.

Treat a broken test driver as tooling work: correct its observation and rerun the affected scenario. Preserve meaningful assertions. Repeated harness failures call for simplifying the test approach; they do not automatically require a critic, a new model, another build, or replay of unrelated passing scenarios. Distinguish product failures from test setup failures in the record.

## Rendered UI milestones

Keep Sean's requested independent Claude Fable reviews through herdr-core at coherent UI milestones and substantial navigation, theme, or interaction changes. A Fable review can supply the rendered portion of the consolidated review; avoid overlapping browser audits of the same flow. Obtain feedback while fixes can still shape the interface.

Give Fable the intended design, commit, reachable preview, and concrete flow. Cover light/dark desktop, essential keyboard/focus behavior, narrow/enlarged controls, and relevant loading/error states. Consolidate findings into one correction list. Review affected corrections before closing the milestone; distinguish observed defects from taste and unvisited states from verified behavior.

Read `hc --skill` and inspect `hc templates` before launching. Use an interactive Claude session explicitly selecting Fable, for example:

```sh
hc run --bg --name ui-review --cwd /absolute/worktree \
  claude --model fable --effort high \
  "Review the rendered flow described in the brief read-only. Use better-interface. Do not edit files or start subagents."
```

Confirm task delivery before sending again, read the actual findings, and clean up only the terminal/resources this task created. If Fable or browser access is unavailable, record the limitation and continue implementation; obtain the review before milestone closure or ask Sean to waive it. Screenshots establish appearance, not unexercised interactions.

## Integrate and finish

Integrate locally into `main`; do not push, publish, or open a PR unless Sean asks. The slice owner may implement and integrate; a separate manager handoff is optional.

Compose the final candidate with current main and inspect conflict resolutions. Run one full `pnpm gate` on that integrated candidate before marking the slice done. A candidate containing the final combined application tree counts: merging it without application/configuration changes does not require a duplicate post-merge gate. Rerun affected checks when code, configuration, or conflict resolution changes; rerun the full gate if its tested composition is no longer applicable. Record the tested commit and integrated commit when they differ.

Retain useful prior evidence for unchanged behavior. Documentation-only changes need a consistency/diff check, not application builds, browser runs, or a fresh approval chain.

A slice is done when the integrated user action works, applicable checks pass, material findings are resolved, and known limits are recorded. Give Sean a usable preview or clear local instructions. Update the ticket's `Work state` and the progress record, then remove safely integrated owned branches/worktrees and release owned resources.

## Keep records small

Keep `PROGRESS.md` readable in about a minute: current behavior, immediate blocker, next deliverable, parked work, and next rendered milestone. Replace stale state instead of appending a chronology. Link to ticket history for details; Git retains removed text.

Use canonical ticket `Status` values with separate `Work state` values (`queued`, `in-progress`, `in-review`, `blocked`, `done`). In ticket Comments, record a short outcome, relevant commit/check result, remaining concrete issue, and next action. Historical procedural holds do not create new approval requirements. Preserve user instructions and concrete unresolved defects.
