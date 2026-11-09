# Sharing review

## Spec and standards review

The fixed implementation baseline is `a6b3736` (the checkout before this work).
Scope is the working changes and new files implementing `spec.md`. Two independent
review axes inspected the integrated work after the two-agent plan critique.

### Standards

The standards reviewer found one medium issue: all fatal sync errors claimed
access had ended. The client now classifies access failures using stable SDK error
reasons and offers reload/reconnect for incompatible or otherwise failed sync.
The reviewer rechecked the correction and reported no remaining blockers.

### Spec

The spec reviewer found two issues: Share's Close button did not participate in
the native Escape key boundary, and an untrusted viewer could submit presence
despite the official client disabling it. Close now uses `data-native-dismiss`;
the server assembles fragmented messages and rejects presence. SDK document-only
repair pushes are acknowledged/discarded using server-enforced read-only access.
Tests verify Escape/focus return, forged document writes, fragmented presence and
ticket replay. The reviewer rechecked both and reported no remaining blockers.

Runtime tests also found provider reauthorization incorrectly forcing Settings
open in a shared viewer. Shared viewing now only requires the application session;
provider authorization warnings remain on owner flows. The private-metadata test
verifies card details after provider loss and a server restart.

## Interface scope and coverage

Reviewed the complete owner Share flow and shared viewer, using React, native form
controls, the existing Atlas/Contextual semantic tokens and tldraw. Conventions:
`AGENTS.md` and `docs/CODING-CONVENTIONS.md`. Loaded better-interface and all six
owning domain skills. Existing unrelated screens are outside this review.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | Share/viewer controls, public browser tests for labels, keyboard entry, Escape, focus return, readonly keys and 320px with enlarged text | Clear in exercised browser paths; live screen-reader walk not verified |
| Layout | Desktop light, dark Share at 320px/200% text, viewer at 320px/200% text; screenshots in evidence/ | Clear; panel scrolls internally, sticky Close stays reachable, viewer title wraps |
| Writing | Share disclosure, mode explanations, registered-account instructions, loading/failure/denial states and sync status | Clear; only saved changes are described as live |
| Typography | Existing font scale, wrapping and long-content screenshots; mobile sharing inputs at 1rem | Clear in inspected states |
| Colors | Existing light/dark tokens, screenshot appearance, calculated token contrast in evidence/token-contrast.json | Text ratios 6.35–14.94; control borders 3.67/4.44. Live computed-style sampling not verified |
| UI | Existing surfaces, focus ring, non-modal Share panel, internal scroll, pause/resume and no added animation | Clear in inspected states |

## Findings resolved

- Escape dismissal now uses the established capture boundary.
- Share header remains sticky while its enlarged content scrolls; scroll padding
  prevents focused form controls disappearing underneath it.
- Shared board titles wrap rather than losing long names to truncation.
- Provider reauthorization no longer obstructs shared card details.

No actionable interface findings remain in the exercised scope.

## Verification

- Production sharing suite: 8 passed, Node 26.8.1 and pnpm 12.16.1.
- Source-mode sharing suite: 8 passed using separate controlled-provider ports.
- Client/server/tools TypeScript, lint and import boundaries passed before full gate.
- Production dependency audit: no known vulnerabilities found.
- Full integrated gate: 120 browser tests, 14 native-document tests, 8 server
  tests, lint, types and import boundaries passed. The two intentional browser
  skips passed separately with short-session and unconfigured-auth settings.
- Not verified: actual screen-reader output, live GitHub consent/permissions,
  production HTTPS reverse proxy upgrade configuration, non-Chromium browsers.

Approve for the inspected domains and exercised browser states. The verification
limits above are not claims of coverage.
