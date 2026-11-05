# Project management guide

Build GitBored as a small, primarily local tool for Sean and perhaps a few other users. Prefer shipping a complete useful slice over infrastructure for hypothetical scale. The project manager coordinates implementation, independent review, integration, and records; it does not become a second feature implementer.

## Sources of truth

| Record | Location | Responsibility |
|---|---|---|
| Product scope and settled decisions | `.scratch/issue-canvas/spec.md` | Project manager records user decisions and clearly marked provisional defaults |
| Implementation tickets | `.scratch/issue-canvas/issues/NN-<slug>.md` | Project manager owns scope/dependencies; implementer appends evidence and progress |
| Execution board and handover | `.scratch/issue-canvas/PROGRESS.md` | Project manager records ownership, worktrees, ports, review commits, integration, and the frontier |
| Coding rules | `docs/CODING-CONVENTIONS.md` | Implementers and reviewers apply the documented enforcement level |
| Tracker and triage vocabulary | `.agents/issue-tracker.md`, `.agents/triage-labels.md` | Keep these authoritative rather than inventing another tracker |

Read the spec, progress record, this guide, and coding conventions before planning implementation. Read the relevant domain glossary and ADRs when present. Keep one specification; do not create a parallel PRD in `docs/`.

An implementation ticket contains a canonical `Status:` triage role and a separate `Work state:`: `queued`, `in-progress`, `in-review`, `blocked`, or `done`. It also names blockers, acceptance criteria, non-goals, affected shared contracts, and a progress log. A completed ticket retains its triage classification; completion is recorded in `Work state`, not by replacing the triage vocabulary. Wayfinding research tickets retain their separately documented lifecycle.

## Delivery bar

- Optimize for a single user running locally first. Keep one application and straightforward local storage; avoid speculative service layers, elaborate outage machinery, or enterprise operational requirements.
- Preserve the explicit privacy boundary if additional users sign in: private boards and credentials must not cross accounts. This calls for ordinary ownership checks and scoped state, not a new security platform. Rank findings by a concrete failure case and impact; hypothetical misuse is not an automatic release blocker.
- Desktop is the primary editing environment. Include both light and dark themes. At narrow widths, verify reachable controls, readable content, and no unintended document-level sideways scrolling; canvas scrolling is intentional. Do not turn this into a separate mobile product.
- Every subagent implementing interface features must use `better-interface`, including its owning domain skills, before handoff. Include this requirement in its brief. Inspect the rendered flow and report any domain or state that could not be checked; source inspection alone does not establish visual correctness.
- Test through the agreed application seam: real browser/public HTTP behavior and real SQLite, controlling external GitHub responses when needed. Live GitHub authorization and permissions have a separate acceptance smoke run. Do not demand an internal unit-test suite simply to fill a checklist.
- Finish the assigned behavior. Record unrelated failures and assign bounded corrective work rather than allowing every agent to expand its ticket. Never conceal a failing gate or call unverified behavior done.

## Assigning work

All project work integrates locally into `main`. Do not open pull requests or push unless Sean asks.

1. Pick `Status: ready-for-agent` tickets whose blockers have `Work state: done`, excluding already completed or claimed tickets. Parallelize genuinely independent slices.
2. Give each ticket its own branch `ticket/NN-<slug>` from current `main` and a worktree at `../gitbored-wt/NN-<slug>`. Record the owner, branch, worktree, and any assigned development ports in the progress record.
3. Define shared-contract ownership before concurrent work: schema/migration order, request/response contracts, exported interfaces, and files with a single integration owner. Worktree isolation does not prevent incompatible designs.
4. Brief each agent with the ticket, relevant spec sections, accepted design evidence, coding conventions, exact file ownership, non-goals, and checks. Interface implementers must use `better-interface`. Give reviewers the requirements and code, not the implementer's conclusions.
5. Set `Work state: in-progress` and record the claim before implementation. Reserve distinct development ports from 3001–3019, including both ports when a task runs a frontend and backend. Record and release only resources owned by that task.

## Implement, verify, integrate

1. **Implement a vertical slice.** Start with a failing behavioral test at the agreed seam where practical, then implement it. For interface changes, also exercise the actual surface. Keep the ticket's progress log current.
2. **Review proportionately.** Default to an independent reviewer and a browser validator for user-facing work. A non-UI change needs the relevant HTTP/runtime validation instead. Add a tester for material coverage gaps and a critic for architectural choices or recurring problems, not automatically for every UI change. A small documentation-only change needs a consistency check, not an agent panel.
3. **Record the candidate.** On handoff set `Work state: in-review`. Record the exact commit each review and validation examined, the scenarios exercised, results, and unresolved findings. Fix medium/high findings that violate scope or acceptance criteria; record low-impact follow-ups instead of manufacturing another round.
4. **Reassess recurring failures.** If the same area fails in two consecutive rounds, ask an agent on `gpt-6-astra` to reconsider the design with the goal and concrete failure history. Choose the smallest fix that removes the cause rather than another exception.
5. **Integrate the checked candidate.** Only the project manager integrates. Rebase onto current `main`; the implementer resolves conflicts. If tests or source change after review, including conflict resolution, rerun affected review and validation against the resulting commit. Previous evidence does not automatically cover new code.
6. **Gate and merge.** Run `pnpm gate` on the integration candidate, merge with `git merge --no-ff`, and run the gate on the integrated result. The merge message identifies the ticket and pre-merge evidence; record the post-merge command/result and merge commit in the ticket and progress record. If integration fails, pause further integration and fix it; unrelated isolated work may continue.
7. **Finish.** Mark acceptance criteria with evidence and set `Work state: done` only when the integrated result passes and records are current. Remove the owned worktree/branch after its changes are safely integrated, release its ports and agent terminals, and recompute the frontier.

The executable commands and their options live in `package.json` and the runner configuration. Build and production E2E runs share a per-user machine-wide lock across worktrees. Let queued runs wait; do not kill another task's run or nest a lock-taking command inside the same lock. Reserve 3100 for the production test application and 3101 for a controlled GitHub test service when a scenario needs one; development agents use their assigned ports instead.

## Periodic UI review with Claude Fable

Use Claude Fable for an independent review of the **rendered interface**, in addition to acceptance validation:

- At the first complete board workflow.
- After every three completed UI tickets since the last Fable review, or at the end of an interface milestone, whichever comes first.
- After a substantial navigation, theme/token, or interaction-model change, and before calling an interface milestone complete. One review can satisfy coincident triggers.

The project manager records the last review, reviewed commit, UI tickets since that review, and next trigger in `PROGRESS.md`. Review a coherent flow rather than asking for a full-product audit after every small change. Cover light/dark desktop views, keyboard/focus, and a narrow-width sanity check; include relevant loading, empty, and error states. Respect Atlas + Contextual and the `better-interface` evidence standard. Findings must identify the affected behavior and evidence, distinguish observed defects from taste, and propose the cheaper fix. Record inaccessible states as not verified.

### Launch and interact through herdr-core

Read `hc --skill` before first use in a session, then `hc templates`; prefer a fitting template only if it actually selects Claude Fable. Without one, launch Claude Code interactively with an explicit model and the initial task:

```sh
hc run --bg --name ui-review --cwd /absolute/worktree \
  claude --model fable --effort high \
  "Review the specified rendered UI read-only. Use better-interface. Do not edit files or start subagents. Read the review brief and report findings to the parent terminal named there."
```

Replace the task with a concrete brief naming the reviewed commit, preview URL, flow, intended design, available screenshots, and parent terminal address. Supply browser access where available; screenshots alone cannot verify interactions. The reviewer must distinguish source, screenshot, and live-interaction evidence. Never invent a screenshot or mark an unvisited flow verified.

- Check the launch's `first_message.sent`. If it is false, inspect `hc read ui-review`, resolve readiness, and only then send the task. Do not blindly resend a possibly delivered message.
- Use `hc send ui-review "..."` to narrow scope or request a follow-up. Use `hc wait ui-review` while waiting for completion, then `hc read ui-review` for the actual result. Keep doing other useful work while the reviewer works; do not sleep or poll.
- Keep the agent interactive and watchable; do not use Claude print mode. `hc` manages the terminal, while Claude's flags select its model and supported effort. Do not silently substitute a different model for a required Fable review.
- Treat `blocked` as a permission/input prerequisite, not permission to bypass a prompt. Do not use permission-bypass flags to force a review. If Fable or browser access is unavailable, record the limitation and continue independent implementation; obtain the missing review before closing the affected UI milestone, or ask Sean for an explicit waiver.
- Read the actual findings before summarizing them. A launch, idle screen, or successful process exit is not evidence of a completed UI review. After accepting the result, `hc kill ui-review` and `hc rm ui-review`; clean up only terminals this task started, never the user's core or other agents.

## Decisions without unnecessary blocking

Sean prefers progress and accepts rework for reversible decisions. The project manager chooses ordinary implementation details using the spec and existing conventions. Do not ask about names, file placement, or routine library wiring when the repo already answers them.

For a genuinely unresolved but reversible design question, consult a `gpt-6-astra` stand-in with the spec, this guide, and Sean's recorded choices. Its recommendation is provisional, not a new user instruction. Record the question, chosen default and reason, affected tickets, and what would change if Sean chooses differently. Keep proceeding on that basis.

Ask Sean only when the decision changes settled product scope, crosses an authorization/privacy boundary, incurs a purchase or licensing commitment, requires credentials/human provisioning, or authorizes destructive/irreversible action. Do not use the stand-in to manufacture consent. Continue independent work while a human prerequisite is outstanding.

## Records and handover

Append progress under each ticket's `## Comments` heading. Entries state date/agent, what changed, exact reviewed/validated commits, exercised checks and results, remaining blockers, and next action. The progress record holds the current execution board, frontier, ports, Fable review cadence, and provisional decisions; avoid copying the full ticket history into it.

Keep tracking changes in separate logical commits. Before handing over, ensure active tickets and the progress record describe the real work, including failed approaches worth not repeating. A successor reads those records, checks only the relevant worktree/branch/runtime facts, resolves discrepancies in favor of observed evidence, and continues. A completed ticket requires implemented behavior, evidence, integration, and current records—not merely a compiling branch.
