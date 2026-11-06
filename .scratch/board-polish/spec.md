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
