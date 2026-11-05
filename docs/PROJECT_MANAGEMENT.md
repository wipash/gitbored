# Project management guide

GitBored is built by a project manager agent that runs teams of other agents. This guide is for that project manager, and for any agent that takes over from it partway through. The tracking files in this folder must always describe the real state of the work, so a new agent can carry on from them without the previous agent's conversation.

## Files

| File | Purpose | Who updates it |
|---|---|---|
| `prd.md` | What we are building and the decisions already made | Project manager, only when a decision changes |
| `tickets/NN-<slug>.md` | One ticket per vertical slice, with status, acceptance criteria and a progress log | Project manager, plus the agent working the ticket for its progress log |
| `PROGRESS.md` | The board: every ticket's status, owner, branch and merge commit, the current frontier, and the project log | Project manager only |
| `PROJECT_MANAGEMENT.md` | This guide | Project manager, when the process itself changes |


## Branches

All work for this project happens on, or is merged into, the local branch `main`. Do not open pull requests, and do not push unless Sean asks.

- Each ticket gets its own branch, `ticket/NN-<slug>`, created from `main` in its own worktree at `../gitbored-wt/NN-<slug>`.
- Only the project manager merges a ticket branch into `main`, after rebasing it onto the current tip. Merge with `git merge --no-ff` so each ticket is one merge commit, then delete the worktree and the ticket branch.
- When two tickets run in parallel, the second to finish rebases onto `main` after the first has merged. Its implementer resolves any conflicts.

Read `prd.md`, this guide and `PROGRESS.md` before doing anything else. Then read the repo's `AGENTS.md`, `GLOSSARY.md` and the ADRs that touch the area of the ticket.

## Roles

The project manager does not write feature code. It assigns tickets, briefs agents, checks their output, keeps the tracking files current, and escalates to Sean.

| Role | Job | Output |
|---|---|---|
| Implementer | Builds one ticket test-first in its own worktree and branch | A branch with passing lint, type-check and tests, and a progress log entry |
| Reviewer | Reviews the implementer's diff for correctness bugs, security and conventions, without seeing the implementer's reasoning | Findings ranked by severity, each with a concrete failure case |
| Tester | Adds or strengthens tests for the acceptance criteria and edge cases the implementer may have missed | New or changed tests, and a list of criteria it could not test |
| Validator | Runs the app end to end the way a user would and checks every acceptance criterion, including UI detail in light and dark themes and at phone width | A pass or fail per acceptance criterion, with evidence such as screenshots or command output |
| Critic | Challenges the design: whether the slice fits the PRD, the ADRs and the domain language, and whether something simpler would do | A short list of objections, each with a proposed change |

Tell every implementer, reviewer and critic the engineering bar from the PRD's decisions table: this is an internal tool, not a critical service, so the smallest plain design wins and reviewers rank unlikely misuse and outage handling as low severity. The app will be used from desktop PCs about 99% of the time (Sean, 2026-11-05): judge UI polish at desktop widths, and at phone widths only check that nothing breaks, overlaps or scrolls sideways.

Give each agent only what it needs: the ticket, the relevant PRD sections, and pointers to files. Give reviewers and critics the code, not the implementer's conclusions, so their read is independent.


## Working a ticket

1. **Pick from the frontier.** The frontier is every ticket with status `ready-for-agent` whose blockers are all `done`, within the current phase. Independent frontier tickets can run in parallel.
2. **Claim it.** Set the ticket's status to `in-progress`, and record the owner, branch name and start date in `PROGRESS.md`. Commit the tracking change before work starts.
3. **Implement.** The implementer works test-first in the ticket's worktree (see Branches), and appends to the ticket's progress log as it goes.
4. **Review, test, validate and critique.** Run the reviewer, tester, validator and critic on the branch. Scale this to the ticket: a small refactor needs a reviewer, while a UI or permissions change needs all four. Send findings back to the implementer and repeat until the reviewer finds nothing of medium severity or worse and the validator passes every criterion. Log low-severity findings in the ticket as follow-ups rather than running another round for them, because each extra round tends to add new edge cases of its own.
   If the same area produces findings in two consecutive rounds, or a problem keeps recurring across tickets, stop fixing and ask an agent on the `gpt-6-astra` model to rethink the premise: give it the goal, the constraints and the history of findings, and ask for the simplest design that removes that whole class of problem. Decide from its proposal before sending another fix round.
   Set the status to `in-review` when the implementer first hands the branch over for review.
5. **Merge.** Rebase the ticket branch onto `main`, merge it with `--no-ff`, and run `pnpm gate` (lint, type-check, unit tests and E2E) on the merged result. E2E always runs against a production test build on ports 3100 and 3101, and `pnpm build` and `pnpm test:e2e` take a machine-wide lock, so runs from different worktrees queue rather than collide; tell agents to run them in the background or with a long timeout and never to kill a run that is waiting. Give every agent that may run a dev server its own port from 3001-3019 in its brief, record it under "Ports" in `PROGRESS.md`, and free it when the agent finishes. The merge commit message names the ticket and lists how each acceptance criterion was verified. If anything fails, fix it before starting another ticket.
6. **Finish.** Tick the acceptance criteria, set the status to `done`, add a final progress log entry, record the merge commit in `PROGRESS.md`, and recompute the frontier.

A ticket is done only when every acceptance criterion is ticked with evidence, lint, type-check, unit and E2E tests pass on `main` after the merge, and the tracking files say so.

## Statuses

| Status | Meaning |
|---|---|
| `ready-for-agent` | Fully specified; an agent can start once its blockers are done |
| `ready-for-human` | Needs Sean or another person before an agent can continue |
| `needs-info` | A question must be answered first; the question is in the progress log |
| `in-progress` | An agent is working on it; owner and branch are in `PROGRESS.md` |
| `in-review` | Implementation is finished and the branch is going through review, testing and validation before merge |
| `blocked` | Work started but something outside the ticket stopped it; the reason is in the progress log |
| `done` | Merged into `main`, and every acceptance criterion verified |

## Keeping records current

Update the tracking files at every status change, and at least once per working session on an in-progress ticket. Commit tracking changes on their own, so they can be read without wading through code diffs.

Each progress log entry in a ticket uses this shape:

```
### 2026-11-05: <role or agent name>
- Done: what changed, with branch and commits
- Verified: what was checked and how
- Next: the next concrete step
- Open: questions, risks or anything a successor must know
```

Write entries for a reader who has not seen any of the conversation that produced them: name files, commands and decisions explicitly. Record dead ends too, so a successor does not repeat them.

## Handover

If you are taking over:

1. Read this guide, `prd.md` and `PROGRESS.md`.
2. For each ticket in `in-progress`, `in-review` or `blocked`, read its progress log, check that its branch or worktree exists, and compare the branch with what the log says. Where they disagree, trust the code and correct the log.
3. Run `git worktree list` and `git branch --list 'ticket/*'`, and check that every ticket branch that has not been merged matches a ticket in `in-progress`, `in-review` or `blocked`.
4. Add a project log entry in `PROGRESS.md` saying that you took over and what state you found.

Before you stop, or whenever your context is getting full, make sure every in-flight ticket has a current progress log entry and `PROGRESS.md` is committed.

## Changing the plan

- If a ticket turns out too large for one context window, split it. Give the new tickets the next free numbers, update the blocking edges of every affected ticket, and record the split in the project log.
- If a decision in the PRD needs to change, stop and ask Sean. Once he answers, update the PRD's decisions table and note the change in the project log and in the affected tickets.
- If a ticket uncovers work the PRD does not cover, add a new ticket with status `needs-info` and ask Sean, rather than widening the current ticket.
- Fix lint errors, failing tests and flaky tests you come across, even when they are unrelated to the ticket, as the repo's instructions require. Put an unrelated fix that is more than a few lines on its own branch, merged into `main` separately from the ticket.

## Provisional answers from the Sean stand-in

Sean prefers the work to keep moving over waiting for him, and accepts rework if his later answers change something. When a question below would otherwise stop the project, ask the Sean stand-in instead: an agent on the `gpt-6-astra` model, briefed with the PRD, this guide and Sean's recorded decisions, and kept alive so its answers stay consistent with each other. Its answers are provisional.

- Record every provisional answer in the "Provisional answers" section of `PROGRESS.md`, as its own subsection that Sean can decide from without reading anything else: the question in plain language with enough background to understand it, the options that were considered, the stand-in's decision and reason, the tickets that rely on it, and what would need redoing if Sean answers differently.
- The stand-in may answer questions about requirements and design.

