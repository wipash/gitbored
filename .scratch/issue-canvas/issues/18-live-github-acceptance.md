# 18: Prove live GitHub authorization and source integrations

**What to build:** The implemented workflow works against the actual configured GitHub App and permitted repositories for two independent users.

**Blocked by:** 09: Remove private metadata on access loss and account changes, 10: Configure and filter real planning fields, 12: Export and import reference-only boards, 14: Verify the full refresh and authorization lifecycle, 16: Operate and restore a durable small deployment

**Status:** ready-for-agent

**Work state:** queued

## Acceptance criteria

- [ ] Use provisioned real App/credentials and two authorized users to prove private sources, installations/organization approval, immutable identity and private-board isolation.
- [ ] Prove required Issues/Pull requests permission coverage, public URLs outside picker, PR enrichment, source access loss and user refresh/reauthorization with no installation fallback.
- [ ] Verify real node resolution/import, rename/transfer behavior, conditional requests, and each promised configured planning-field source and any necessary Projects read permission.
- [ ] Record exact scenarios/results without retaining private payloads/secrets. Distinguish controlled-provider evidence and any unverified real permission case.
- [ ] Human credentials/provisioning or destructive access changes require appropriate authorization; never invent success or replace them with fixtures.

## Non-goals

No writes to GitHub work records, unapproved organization changes or parent spec closure.

## Affected shared contracts

Own live acceptance record and bounded integration fixes; no new implementation architecture.

## Comments

- 2026-11-05 — Project manager: Published from the accepted specification under the user’s instruction to proceed without a confirmation round. Work starts only when blocking tickets are done.
