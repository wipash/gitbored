# Domain Docs

## Layout

Single-context: `GLOSSARY.md` at the repo root and ADRs in `architecture/decisions/`.

## Before exploring, read these

- Root `GLOSSARY.md`.
- ADRs in `architecture/decisions/` that touch the area being explored.

If these files don't exist, proceed silently. Don't flag their absence or suggest creating them upfront. The `/domain-modeling` skill, reached via `/bbq` and `/improve-codebase-architecture`, creates them lazily when terms or decisions get resolved.

## Use the glossary's vocabulary

When naming a domain concept in an issue title, refactor proposal, hypothesis, or test name, use the term defined in `GLOSSARY.md`. Avoid synonyms the glossary explicitly rejects.

If a needed concept is absent, reconsider whether it belongs to the project's language or note the gap for `/domain-modeling`.

## Flag ADR conflicts

If a proposal contradicts an existing ADR, surface the conflict explicitly rather than silently overriding it. Identify the ADR and explain why reopening the decision is warranted.
