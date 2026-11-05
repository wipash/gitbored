# 01: Sign in through the GitHub App

**What to build:** A user can authorize the configured GitHub App, see their identity, and sign out; another authorized user can use the same deployment without an allowlist.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

**Work state:** in-progress

## Acceptance criteria

- [ ] Use validated OAuth state and PKCE, server-side exchange, HttpOnly sessions, CSRF protection, and Secure cookies for HTTPS with an explicit loopback HTTP mode. Reject invalid/replayed state.
- [ ] Upsert by immutable GitHub user ID; login changes retain identity. Encrypt access and refresh credentials at rest; expose neither credentials nor provider payloads in errors or logs.
- [ ] Use user-token refresh where supported and actionable reauthorization on expiry/revocation; never substitute installation credentials.
- [ ] Exercise two identities, renamed login, logout, session expiry and forbidden unsafe requests through public HTTP/browser behavior with a controlled external provider and real SQLite.
- [ ] Render usable light/dark sign-in, signed-in and unconfigured/error states. Document App setup and separately identify unexercised live authorization.

## Non-goals

No board sharing, allowlist, installation-token fallback, or GitHub writes.

## Affected shared contracts

Own authentication schema and session/CSRF contract; expose a server authentication guard and browser-safe current-session response.

## Comments

- 2026-11-05 — Project manager: Published from the accepted specification under the user’s instruction to proceed without a confirmation round. Work starts only when blocking tickets are done.
- 2026-11-05 — Project manager: Claimed for GitHubIdentity; branch `ticket/01-github-app-sign-in`, worktree `../gitbored-wt/01-github-app-sign-in`, development ports 3001/3002. Azure App configuration lookup is underway; controlled-provider implementation is independent of provisioning.
