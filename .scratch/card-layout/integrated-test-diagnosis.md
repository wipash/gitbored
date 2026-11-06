# Integrated test failures: bounded diagnosis

The full integrated gate reported 94 passed, 2 skipped and 2 failed. Both failures were in new tests, with concrete trace evidence:

1. `board-switcher.spec.ts` assumed the database contained exactly its 13 boards. The suite deliberately shares an application database, and provider reset does not delete boards. The trace had 52 links: 39 pre-existing plus the 13 created by this test. The test now reads the initial count through the public boards endpoint, adds its 13, and still traverses every resulting board link using Tab and hit-target checks.
2. The mobile details test asserted exact card/popup vertical alignment after releasing a fast Space-drag. The trace shows genuine scale and position changes, then native inertial pan moves the card above the viewport while the readable popup correctly clamps below the header. Its final 195.6px gap is expected viewport clamping, not a broken anchor. The test now asserts exact anchoring while the pointer is held, then verifies viewport containment after release.

No production source changes were needed.

## Verification without changing the demo build

Copied the existing `dist`, source, scripts, test files and workspace metadata into `/tmp/gitbored-menu-test-isolation`. The isolated Playwright config launches the test server directly with `node --import tsx`; this bypasses all build commands. Used the fixture-approved callback port 3118 and provider port 3119. Ran both test files three times, retaining the isolated database across tests to exercise existing-board accumulation:

`PATH=/tmp/gitbored-tools:$PATH E2E_APP_PORT=3118 E2E_PROVIDER_PORT=3119 node node_modules/@playwright/test/cli.js test tests/e2e/board-switcher.spec.ts tests/e2e/card-details.spec.ts --repeat-each=3 --output=/tmp/gitbored-menu-isolated-results-3`

Result: **9 passed (30.2s)**. Log: `/tmp/gitbored-menu-isolated-3.log`.

The first isolation attempt exposed harness setup mistakes: an unregistered callback port and pnpm's automatic dependency verification following a symlink. That run was stopped. Dependencies were restored successfully using the repository's frozen lockfile, and the final run used direct Node startup to avoid package-manager mutations. `diff -qr dist /tmp/gitbored-menu-test-isolation/dist` confirmed the served build remained byte-identical to its pre-run copy. The preview server was not restarted.

The full integrated gate was not repeated here. Merge/deploy remains on hold while the user reviews the demo, as requested by the parent.
