#!/usr/bin/env bash
set -euo pipefail

engine=${CONTAINER_ENGINE:-docker}
image=${1:?Pass the image to test}
container="gitbored-smoke-$$"
volume="$container-data"

cleanup() {
  result=$?
  if [ "$result" -ne 0 ]; then "$engine" logs "$container" >&2 || true; fi
  "$engine" rm -f "$container" >/dev/null 2>&1 || true
  "$engine" volume rm "$volume" >/dev/null 2>&1 || true
  exit "$result"
}
trap cleanup EXIT
"$engine" volume create "$volume" >/dev/null
"$engine" run -d --name "$container" -p 127.0.0.1::3001 -v "$volume:/data" "$image" >/dev/null

wait_for_health() {
  # Docker can assign a new ephemeral host port when the container restarts.
  origin="http://$("$engine" port "$container" 3001/tcp)"
  echo "Checking container health at $origin"
  curl --fail --silent --show-error --retry 20 --retry-delay 1 --retry-connrefused \
    --retry-all-errors --max-time 3 "$origin/api/health" >/dev/null
}
wait_for_health
node --input-type=module - "$origin" <<'JS'
import assert from 'node:assert/strict';
const origin = process.argv[2];
assert.deepEqual(await (await fetch(`${origin}/api/health`)).json(), { status: 'ok', storage: 'sqlite' });
assert.deepEqual(await (await fetch(`${origin}/api/session`)).json(), { status: 'unconfigured' });
assert.equal((await fetch(`${origin}/api/boards`)).status, 401);
const page = await fetch(`${origin}/boards/smoke`, { headers: { accept: 'text/html' } });
assert.equal(page.status, 200);
const html = await page.text();
const asset = html.match(/src="(\/assets\/[^" ]+\.js)"/);
assert.ok(asset, 'The production page must reference a built JavaScript asset.');
assert.equal((await fetch(`${origin}${asset[1]}`)).status, 200);
JS

"$engine" exec -i "$container" node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
assert.notEqual(process.getuid(), 0, 'The runtime must not run as root.');
for (const path of ['/app/.env', '/app/.git', '/app/src', '/app/tests']) assert.equal(existsSync(path), false);
const db = new DatabaseSync('/data/gitbored.sqlite');
db.prepare('INSERT INTO users (id, github_id, login) VALUES (?, ?, ?)').run('smoke', '123', 'smoke');
db.prepare('INSERT INTO boards (id, owner_id, title, document, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)')
  .run('smoke-board', 'smoke', 'Smoke board', '{"smoke":true}', 1, 1);
db.close();
JS
"$engine" exec "$container" node dist/tools/scripts/data.js backup /data /data/smoke-backup
"$engine" restart "$container" >/dev/null
wait_for_health
"$engine" exec -i "$container" node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
for (const path of ['/data/gitbored.sqlite', '/data/smoke-backup/gitbored.sqlite']) {
  const db = new DatabaseSync(path, { readOnly: true });
  assert.equal(db.prepare('SELECT document FROM boards WHERE id = ?').get('smoke-board').document, '{"smoke":true}');
  assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  db.close();
}
JS
echo 'Container smoke passed: HTTP, assets, authorization, non-root user, restart persistence and consistent backup.'
