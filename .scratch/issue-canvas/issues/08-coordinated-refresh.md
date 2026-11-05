# 08: Refresh board metadata and discovery cost-consciously

**What to build:** Opening, manual refresh and an adjustable schedule refresh placed records and source discovery without disrupting the canvas.

**Blocked by:** 05: Discover work into Incoming and deliberately place it

**Status:** ready-for-agent

**Work state:** queued

## Acceptance criteria

- [ ] Refresh placed references including hidden/closed/merged items independently of discovery; deduplicate repeated references and coalesce overlapping triggers per authorization context and across tabs.
- [ ] Use conditional requests where supported and central rate-limit backoff honoring retry/reset; bound discovery and retain cursors.
- [ ] Refresh metadata outside native history/documents: no geometry/size/frame changes, no layout saves, and undo still reverses the previous canvas action.
- [ ] Pause schedule for hidden/inactive boards and revalidate on resume. Offer pause and adjustable cadence; select/document conservative defaults from measured controlled request costs and limitations.
- [ ] Expose last success, next action, in-progress, paused/backoff reason and source-specific partial failures; do not label partial success fully fresh.
- [ ] Exercise real HTTP request counts, overlap, conditional responses, rate limits and inactive/resume transitions with controlled provider timing.

## Non-goals

No worker fleet, webhooks or unmeasured freshness guarantees.

## Affected shared contracts

Own user-scoped refresh coordinator and status contract; coordinate source reconciliation and credential lifecycle rather than duplicating provider clients.

## Comments

- 2026-11-05 — Project manager: Published from the accepted specification under the user’s instruction to proceed without a confirmation round. Work starts only when blocking tickets are done.
