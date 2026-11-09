# Board sharing execution

- Plan: agreed with two independent critics after discussion; see spec.md.
- Backend sharing/publication/OAuth: complete (sharing_critic).
- Read-only sync service: complete (sync_critic).
- Share and viewer UI: complete (root).
- Public boundary regression tests: 8 passed in production, 8 passed in source mode.
- Spec/standards reviews: findings addressed and rechecked; no remaining blockers.
- Interface review: complete for exercised states, limits recorded in review.md.
- Integrated gate: passed (120 browser tests, 14 native-document tests, 8 server
  tests, lint, types and import boundaries).
- Separate authentication modes: session-expiry and unconfigured-deployment tests
  both passed, covering the two intentional full-gate skips.
- Production dependency audit: no known vulnerabilities found.
- Implementation commit: `3bb5cba` (`feat: share boards read-only with live saved updates`).

## Decisions carried into implementation

1. SQLite owner saves remain authoritative. Live viewing projects committed saves,
   including atomic Incoming effects, rather than migrating the owner to a second
   save mechanism. Unsaved gestures and multiple writers remain out of scope.
2. Published issue details are intentional shared board content. Only placed
   references are included. Provider loss/cache eviction does not recall an
   existing publication; removing the card or disabling sharing ends its delivery.
3. Existing-account usernames resolve to stable account IDs. Link access creates
   no lasting membership. Everyone signs in; provider access is not required to
   view an authorized publication.
4. Read-only SDK sessions discard document/object writes. The transport rejects
   presence pushes, including fragmented messages, while allowing SDK document
   repair pushes to receive their normal discard acknowledgement.

## Handoff

Open an owned board, choose Share, save an access setting and copy its link.
Viewers receive saved canvas/title/metadata updates and can pause/resume. The
deployment HTTPS proxy must forward WebSocket upgrades; README documents it.
No production deployment, push or external publication was requested/performed.
