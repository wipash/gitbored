# Board polish

Implement the requested settings consolidation, removal of old Sources/Account screens, persistent GitHub caching, card-anchored details, and editable card/category colours with reversible status/priority/label overlays. Preserve the native canvas editor, history, and account isolation.

Assumptions to check with Sean in the morning:
- One Settings menu holds board and view controls. Account actions remain compact workspace controls.
- Old page URLs redirect into Boards; obsolete screens/components/styles are removed, while source APIs remain because boards use them.
- GitHub cache is account-scoped SQLite with a 15-minute freshness window; explicit Refresh bypasses it.
- Manual card colours are saved with the board; category colours and colour overlays are board/account browser preferences.
- Multiple labels use equal split colour accents. Turning overlays off restores manual card colours.
- Details follow the selected card at a readable fixed size, flip sides near an edge, and clamp within a narrow viewport.

Delivery: focused team implementation/review, one integration gate, Gitboard PR(s) merged, published immutable image tag pinned in homelab PR with CI green and merged. Avoid unrelated cleanup and speculative review findings.

## Follow-up: mobile menus

After PR #4, Sean supplied a phone screenshot and asked for improved mobile menu placement/layout, with account and theme controls only in Settings. Implement a compact phone header/Menu trigger and reachable panels above the drawing toolbar; remove the floating bottom account/theme stack. Preserve desktop behavior, auth recovery and canvas lifetime. Ship a follow-up Gitboard PR and use its merged image in the pending homelab update.
