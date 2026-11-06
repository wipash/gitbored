# SSO notice and repository connector review

Scope: the new SSO recovery disclosure and SSO reporting from the repository catalogue, direct repository lookup and individual-item lookup. React, native HTML details/summary and the existing light/dark semantic tokens. Read AGENTS.md and docs/CODING-CONVENTIONS.md; applied better-interface and its six owning domain skills to this bounded flow.

The notice follows [GitHub's SAML and GitHub Apps recovery guidance](https://docs.github.com/en/enterprise-cloud@latest/apps/using-github-apps/saml-and-github-apps): establish SSO, revoke the app authorization, then reauthorize. [GitHub's authorization settings instructions](https://docs.github.com/en/apps/using-github-apps/reviewing-and-revoking-authorization-of-github-apps) support the Applications / Authorized GitHub Apps wording. GitHub destinations are constants or constructed from validated owner names; arbitrary provider URLs never enter the notice.

## Coverage

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | Native disclosure, labelled landmark/button/links, non-modal pointer boundary, browser screenshots | No actionable findings; screen-reader speech unverified |
| Layout | Desktop expanded; 320px with 200% text, collapsed and expanded, both themes | Notice remains within viewport; its own body scrolls; canvas remains available |
| Writing | Three recovery steps, SSO-specific connector error, checking status | No actionable findings |
| Typography | Existing type scale, unitless line height, wrapping organization names and links | No clipping in inspected views |
| Colors | Semantic tokens and computed declared color pairs | All required declared pairs pass; no rendered pixel measurement |
| UI | Native reversible disclosure; no new motion; scroll containment and visible focus styling | No actionable findings |

## Verification

- Lint passed after inactive-query key cleanup.
- Type-check passed before parallel integration edits; root subsequently confirmed integrated lint/type-check passed.
- Inspected `sso-expanded-desktop.png`, `sso-collapsed-dark-320-200.png`, `sso-expanded-top-light-320-200.png` and `sso-expanded-dark-320-200.png` under `/tmp/gitbored-sso-results-3/sso-recovery-one-SSO-notic-7f7bb-old-cards-without-reloading-chromium/`.
- Declared token contrast against notice surface: light body 14.94:1, secondary 6.35:1, links/focus 8.03:1, border 3.67:1; dark body 13.77:1, secondary 8.20:1, links/focus 8.80:1, border 4.44:1. Calculated using sRGB relative luminance, not estimated from screenshots.
- Connector aborts do not report stale responses. Direct repository/item SSO invalidates the affected repository scope and cached connector values, without reporting unscoped session loss. Separate catalogue/lookup/item keys prevent one successful path clearing another failed path. Changing to a nonmatching query clears inactive keys; successful direct reads clear stale local errors.
- Behavioral SSO browser tests are owned by the integration test agent. No duplicate full gate run here.

## Verdict

Approve for inspected scope. Screen-reader speech, real enterprise SSO and iOS-specific behavior are not verified by this review.
