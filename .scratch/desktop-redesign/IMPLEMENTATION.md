# Desktop redesign implementation

Owner: current session. Work state: in-progress. Authorized by Sean, 2026-11-06.

Accepted design: `proposal.html`; audit: `audit.html`. These supersede the older specification's normal-flow Sources section, close-on-add, zoom-to-selection placement, fixed card sizing, and separate account landing page. Preserve safe saves, authorization, and native canvas history.

Deliverable: sign in directly to a canvas, choose a board from a floating switcher, search/connect a repository with import filters, automatically discover work, filter/select/bulk place it without camera changes, resize/inspect cards, and display mapped project fields and related-card connections.

Sean requested a local checkpoint commit while validation continues. This checkpoint is not a completed or passing-gate milestone. Browser preview uses isolated controlled GitHub on 3009/3015/3016; user debug app 3001/3002 remains untouched as a process. Existing HTML proposal remains on wired LAN port 3018.

Checks in progress: desktop browser end-to-end, save/reopen and native undo, project/connection fixture authorization, light/dark and keyboard, existing integration gate. Independent Fable review and its correction review are recorded in reviews/. All initial HIGH findings were corrected; the later panel/focus/footer corrections passed a targeted rendered check.

Known work remaining: fix a held-Comma keyboard regression (the SDK shortcut registry is recreated when its actions change while a key remains held); rerun the final production gate. The first full production run reached 82 passes, 7 failures and 2 skips. Most failures were superseded test drivers or a resize observation race, now corrected in focused runs; the concurrent focused run also collided with the gate’s artifact directory, so future runs use separate output directories. Repository rename reconnection now retains the failed cursor and immutable identity. Navigation, account isolation, save/copy recovery and late-response rejection have passed focused checks. Live Project access must be checked with the user's existing app after controlled tests; never fabricate project values.
