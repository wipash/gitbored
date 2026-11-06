# SSO recovery

After the deployed cards became unavailable, production logs showed GitHub HTTP 403 with `sso_required`. Completing organisation SSO and reauthorizing restored access. Sean approved making that failure explicit and recoverable in the board.

Deliver one board-level recovery notice with safe organisation links, keep native board editing/saving available, distinguish SSO-blocked cards from generic inaccessible or missing references, and retry failed reads after reconnect without reloading the board. Preserve account isolation and discard cached private metadata after provider denial. No polling, new permissions or installation-token fallback.

Assumptions: use GitHub's documented active SSO → revoke app authorization → reauthorize sequence. The external SSO identity-provider interaction remains manual. An explicit Check access and one check on window focus cover return from GitHub. The existing automatic refresh-token flow remains unchanged; eight-hour access-token rotation is separate from organisation SSO policy.

Ship app PR, wait for checks, merge and publish. Pin the merged image in homelab, confirm image-pull CI and merge. Keep team review limited to this recovery flow.
