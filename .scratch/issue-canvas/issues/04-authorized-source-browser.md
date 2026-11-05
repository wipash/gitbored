# 04: Browse authorized sources and resolve GitHub URLs

**What to build:** A signed-in user browses authorized repositories across installations and pages of mixed issues/PRs, or resolves a supported public issue/PR URL.

**Blocked by:** 01: Sign in through the GitHub App, 02: Arrange a reference-only native canvas

**Status:** ready-for-agent

**Work state:** in-progress

## Acceptance criteria

- [ ] Explain missing installation access and organization approval separately from sign-in; do not imply all accessible public URLs are installed sources.
- [ ] Follow pagination including PR-only pages; preserve cursors, partial/loading/error states and explicitly local subset filtering.
- [ ] Normalize issues and PRs without losing provider IDs, repository identity, record kind or same-number distinctions. Missing PR enrichment stays unknown, not confirmed unmerged.
- [ ] Use only the relevant user token; validate external payloads and supported github.com URLs and construct requests rather than proxy arbitrary URLs.
- [ ] Render bounded cards/list rows and full available detail without fetching bodies/comments merely for cards; keep authorized metadata outside documents.
- [ ] Exercise controlled public HTTP provider behavior, partial pagination, malformed URLs, cross-user isolation, and private/public retrieval.

## Non-goals

No deployment-wide crawl, write permissions, fixture fallback, arbitrary hosts, or Projects permission until proven needed.

## Affected shared contracts

Own authorized item registry, metadata resolution and repository-source contracts; reuse authentication guard and current-user token lifecycle.

## Comments

- 2026-11-05 — Project manager: Published from the accepted specification under the user’s instruction to proceed without a confirmation round. Work starts only when blocking tickets are done.
- 2026-11-06 — Project manager: Added 02 as a genuine shared-contract blocker: the native workspace owns the validated lossless item-reference and metadata types that source normalization must reuse. Avoid a second identity/metadata convention. Source browsing remains independent of durable-board ticket 03.
- 2026-11-06 — Project manager: Claimed for **AuthorizedSources** after 01/02 completion. Branch `ticket/04-authorized-source-browser`, worktree `../gitbored-wt/04-authorized-source-browser`; assigned frontend/backend/provider ports **3005/3006/3008**. Own user-scoped reference/source schema, provider validation/normalization, source routes and SourceBrowser, plus controlled-provider/runner extensions. Receive authenticated session from shared composition; discovery never inserts canvas shapes. Integrate this independent slice before 03, whose owner resolves final shared application composition. Preserve lossless IDs at raw JSON decoding, all-page mixed results and unknown enrichment semantics. Use only controlled external-provider evidence until live credentials/human authorization are supplied; third-UI/navigation milestone requires Fable review.
