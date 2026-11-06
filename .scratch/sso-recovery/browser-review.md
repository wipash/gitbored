# SSO recovery browser review

Scope: the board SSO recovery flow, including cold cards, catalogue and project context. React/tldraw with existing Atlas + Contextual semantic tokens and native details, links and buttons. Followed AGENTS.md, docs/CODING-CONVENTIONS.md and better-interface with its six domain skills. No unrelated interface review.

| Domain | Evidence inspected | Result |
| --- | --- | --- |
| Accessibility | Named complementary region, native disclosure/link/button semantics, focus-visible rule; real keyboard movement and undo while blocked; actual link and retry hit targets at 320px/200% | Clear within tested scope; full screen-reader session not verified |
| Layout | Desktop screenshot, light/dark 320px/200% collapsed and expanded notice, internal recovery-body scrolling, viewport-contained clickable fragments | Clear |
| Writing | Named SSO error, explicit ordered recovery steps, same-account and new-tab instructions, Check access; ordinary403 remains Unavailable | Clear |
| Typography | Long recovery text wraps at 200%; all instructions and controls reachable through visible scrolling content | Clear |
| Colors | Existing primary/secondary/accent tokens on surface in light/dark screenshots; error meaning given in text | Clear; no new palette |
| UI | Native disclosure, restrained surface and border, no added animation; single shared notice despite two blocked cards | Clear |

No actionable interface findings.

Verification: `PATH=/tmp/gitbored-tools:$PATH CONTROLLED_SESSION_SECONDS=900 pnpm test:e2e tests/e2e/sso-recovery.spec.ts --output=/tmp/gitbored-sso-results-3`: 3 passed (9.2s). Tools TypeScript check passed. Parent full gate owns integrated lint and remaining regressions.

The browser tests seed real resolved references through public board PUT, evict warm metadata with a genuine denied refresh, and verify two cold cards share one notice. Native note movement, undo and saved geometry persist during the failure. Retry restores metadata with the same editor node and zero document navigation. Tests also cover catalogue retry, removing a failed search, context-only retry restoring Delivery, and non-SSO403 staying unavailable. Safe org/settings/reauthorization destinations are asserted. Tests use controlled GitHub HTTP, not real organization credentials.

Screenshots: `/tmp/gitbored-sso-results-3/sso-recovery-one-SSO-notic-7f7bb-old-cards-without-reloading-chromium/` (`sso-expanded-desktop.png`, `sso-collapsed-{light,dark}-320-200.png`, `sso-expanded-top-{light,dark}-320-200.png`, `sso-expanded-{light,dark}-320-200.png`). Reviewed desktop, narrow collapsed light, narrow expanded light and dark.

Approve for this bounded flow. Live GitHub SSO administration and full assistive-technology verification remain outside this fixture-based check.
