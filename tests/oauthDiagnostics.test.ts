import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { EventEmitter, once } from 'node:events';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { startControlledGitHub } from '../scripts/controlled-github.js';

interface FailureScenario {
  operation: 'token_exchange' | 'identity_lookup';
  fault: 'http_401' | 'http_503' | 'http_429' | 'bad_json' | 'bad_schema' | 'bad_expiry' | 'rate_limit' | 'socket';
  category: 'http' | 'invalid_json' | 'invalid_response' | 'rate_limited' | 'network';
  redirect: '/?authError=provider' | '/?authError=denied';
  httpStatus?: number;
}

const scenarios: FailureScenario[] = [
  { operation: 'token_exchange', fault: 'http_503', category: 'http', httpStatus: 503, redirect: '/?authError=provider' },
  { operation: 'token_exchange', fault: 'http_401', category: 'http', httpStatus: 401, redirect: '/?authError=denied' },
  { operation: 'token_exchange', fault: 'http_429', category: 'http', httpStatus: 429, redirect: '/?authError=provider' },
  { operation: 'token_exchange', fault: 'bad_json', category: 'invalid_json', httpStatus: 200, redirect: '/?authError=provider' },
  { operation: 'token_exchange', fault: 'bad_schema', category: 'invalid_response', httpStatus: 200, redirect: '/?authError=denied' },
  { operation: 'token_exchange', fault: 'bad_expiry', category: 'invalid_response', httpStatus: 200, redirect: '/?authError=provider' },
  { operation: 'token_exchange', fault: 'socket', category: 'network', redirect: '/?authError=provider' },
  { operation: 'identity_lookup', fault: 'http_503', category: 'http', httpStatus: 503, redirect: '/?authError=provider' },
  { operation: 'identity_lookup', fault: 'http_401', category: 'http', httpStatus: 401, redirect: '/?authError=denied' },
  { operation: 'identity_lookup', fault: 'rate_limit', category: 'rate_limited', httpStatus: 403, redirect: '/?authError=provider' },
  { operation: 'identity_lookup', fault: 'bad_json', category: 'invalid_json', httpStatus: 200, redirect: '/?authError=provider' },
  { operation: 'identity_lookup', fault: 'bad_schema', category: 'invalid_response', httpStatus: 200, redirect: '/?authError=provider' },
  { operation: 'identity_lookup', fault: 'socket', category: 'network', redirect: '/?authError=provider' },
];

await test('actual OAuth callbacks emit one bounded diagnostic without leaking request or provider secrets', { timeout: 45_000 }, async () => {
  const applicationOrigin = 'http://127.0.0.1:3009';
  const providerOrigin = 'http://127.0.0.1:3019';
  const directory = await mkdtemp(join(tmpdir(), 'gitbored-oauth-diagnostics-'));
  const encryptionKey = randomBytes(32).toString('hex');
  const privatePayload = 'PRIVATE_PROVIDER_BODY_AND_UPSTREAM_EXCEPTION_MESSAGE';
  const sensitive = new Set(['controlled-client', 'controlled-secret', encryptionKey, privatePayload,
    'private-response-access-token', 'private-response-refresh-token']);
  const output = new EventEmitter();
  let stdout = '';
  let stderr = '';
  let startupError: unknown;
  let application: ChildProcess | undefined;
  let provider: FastifyInstance | undefined;
  let active: FailureScenario | undefined;
  let tokenCalls = 0;
  let identityCalls = 0;
  const observed: unknown[] = [];

  function diagnostics(): unknown[] {
    return stderr.split('\n').slice(0, -1).filter((line) => line.startsWith('{"event":"github_oauth_callback_failed",')).map((line): unknown => JSON.parse(line));
  }

  function assertRedacted(): void {
    for (const secret of sensitive) {
      assert.equal(`${stdout}\n${stderr}`.includes(secret), false, 'Operator output must not contain a sensitive fixture value.');
    }
    assert.equal(/api\/auth\/callback\?|code_verifier|client_secret|authorization:|cookie:|SyntaxError:|TypeError:/i.test(`${stdout}\n${stderr}`), false,
      'Operator output must not contain callback/request details or raw exceptions.');
  }

  async function waitForOutput(condition: () => boolean): Promise<void> {
    while (!condition()) await once(output, 'data', { signal: AbortSignal.timeout(5_000) });
  }

  async function beginAuthorization(): Promise<{ callback: string; binding: string }> {
    const start = await fetch(`${applicationOrigin}/api/auth/github`, { redirect: 'manual' });
    assert.equal(start.status, 302);
    const authorization = new URL(start.headers.get('location') ?? '');
    const binding = start.headers.getSetCookie()[0]?.split(';')[0];
    assert.ok(binding);
    sensitive.add(binding);
    sensitive.add(binding.slice(binding.indexOf('=') + 1));
    const state = authorization.searchParams.get('state');
    assert.ok(state);
    sensitive.add(state);
    assert.equal(authorization.searchParams.get('redirect_uri'), `${applicationOrigin}/api/auth/callback`);
    assert.equal(authorization.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(authorization.searchParams.has('code_verifier'), false);
    authorization.searchParams.set('identity', '101');
    const consent = await fetch(authorization, { redirect: 'manual' });
    assert.equal(consent.status, 302);
    const callback = consent.headers.get('location');
    assert.ok(callback);
    sensitive.add(callback);
    const code = new URL(callback).searchParams.get('code');
    if (code) sensitive.add(code);
    return { callback, binding };
  }

  try {
    provider = await startControlledGitHub(3019, (app) => {
      app.addHook('preHandler', async (request, reply) => {
        const route = request.routeOptions.url;
        if (route !== '/login/oauth/access_token' && route !== '/user') return;
        const operation = route === '/user' ? 'identity_lookup' : 'token_exchange';
        if (operation === 'token_exchange') tokenCalls += 1;
        else identityCalls += 1;
        if (request.body instanceof URLSearchParams) {
          for (const value of request.body.values()) if (value.length > 8) sensitive.add(value);
        }
        if (request.headers.authorization) {
          sensitive.add(request.headers.authorization);
          sensitive.add(request.headers.authorization.replace('Bearer ', ''));
        }
        if (!active || active.operation !== operation) return;
        const payload = { error: privatePayload, detail: [...sensitive] };
        switch (active.fault) {
          case 'http_401': return reply.code(401).send(payload);
          case 'http_503': return reply.code(503).send(payload);
          case 'http_429': return reply.code(429).send(payload);
          case 'rate_limit': return reply.header('Retry-After', '1').code(403).send(payload);
          case 'bad_json': return reply.type('application/json').send(`not JSON: ${JSON.stringify(payload)}`);
          case 'bad_schema': return reply.send(payload);
          case 'bad_expiry': return reply.send({ access_token: 'private-response-access-token', refresh_token: 'private-response-refresh-token', expires_in: privatePayload });
          case 'socket':
            reply.hijack();
            request.raw.socket.destroy();
            return reply;
        }
      });
      app.addHook('onSend', async (request, _reply, payload) => {
        if (request.routeOptions.url === '/login/oauth/access_token' && typeof payload === 'string' && payload.startsWith('{')) {
          const value: unknown = JSON.parse(payload);
          if (typeof value === 'object' && value !== null) {
            if ('access_token' in value && typeof value.access_token === 'string') sensitive.add(value.access_token);
            if ('refresh_token' in value && typeof value.refresh_token === 'string') sensitive.add(value.refresh_token);
          }
        }
        return payload;
      });
    });
    const environment = { ...process.env };
    delete environment['TOKEN_ENCRYPTION_KEY_FILE'];
    application = spawn(process.execPath, ['--import', 'tsx', 'src/server/main.ts'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...environment, NODE_ENV: 'development', HOST: '127.0.0.1', PORT: '3009', DATA_DIR: directory,
        APP_ORIGIN: applicationOrigin, ALLOW_LOOPBACK_HTTP: 'true', GITHUB_CLIENT_ID: 'controlled-client',
        GITHUB_CLIENT_SECRET: 'controlled-secret', TOKEN_ENCRYPTION_KEY: encryptionKey,
        ENABLE_CONTROLLED_GITHUB: 'true', CONTROLLED_GITHUB_ORIGIN: providerOrigin, CONTROLLED_SESSION_SECONDS: '604800' },
    });
    application.stdout?.on('data', (chunk: Buffer) => { stdout += chunk.toString(); output.emit('data'); });
    application.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); output.emit('data'); });
    application.once('error', (error: unknown) => { startupError = error; output.emit('data'); });
    application.once('exit', () => { output.emit('data'); });
    await waitForOutput(() => stdout.includes('GitBored local runtime listening at') || startupError !== undefined || application?.exitCode !== null);
    assert.equal(startupError, undefined, 'The actual application must start.');
    assert.ok(stdout.includes('GitBored local runtime listening at'));
    assert.equal((await fetch(`${applicationOrigin}/api/health`)).status, 200);

    const authorized = await beginAuthorization();
    const success = await fetch(authorized.callback, { redirect: 'manual', headers: { cookie: authorized.binding } });
    assert.equal(success.status, 302);
    assert.equal(success.headers.get('location'), '/');
    const session = success.headers.getSetCookie().find((value) => value.startsWith('gitbored-session='))?.split(';')[0];
    assert.ok(session);
    sensitive.add(session);
    sensitive.add(session.slice(session.indexOf('=') + 1));
    assert.equal((await fetch(`${applicationOrigin}/api/session`, { headers: { cookie: session } })).status, 200);
    assert.equal(diagnostics().length, 0, 'Successful authorization must not emit a failure diagnostic.');
    assert.ok((await stat(join(directory, 'gitbored.sqlite'))).size > 0);

    for (const scenario of scenarios) {
      active = scenario;
      const before = { diagnostics: diagnostics().length, tokenCalls, identityCalls };
      const attempt = await beginAuthorization();
      const failure: Response = await fetch(attempt.callback, { redirect: 'manual', headers: { cookie: `${attempt.binding}; ${session}` } });
      assert.equal(failure.status, 302);
      assert.equal(failure.headers.get('location'), scenario.redirect);
      assert.equal(failure.headers.getSetCookie().some((value) => value.startsWith('gitbored-session=')), false,
        'A failed callback must not replace the retained session.');
      await waitForOutput(() => diagnostics().length > before.diagnostics);
      assertRedacted();
      assert.equal(diagnostics().length, before.diagnostics + 1, 'Exactly one diagnostic per failed callback.');
      const event = diagnostics().at(-1);
      assert.ok(typeof event === 'object' && event !== null);
      assert.equal('event' in event && event.event, 'github_oauth_callback_failed');
      assert.equal('operation' in event && event.operation, scenario.operation);
      assert.equal('category' in event && event.category, scenario.category);
      if (scenario.category === 'network') {
        assert.equal('httpStatus' in event, false);
        assert.ok('networkCode' in event && ['UND_ERR_SOCKET', 'ECONNRESET'].includes(String(event.networkCode)));
      } else {
        assert.equal('httpStatus' in event && event.httpStatus, scenario.httpStatus);
        assert.equal('networkCode' in event, false);
      }
      assert.equal(Object.keys(event).sort().join(','), scenario.category === 'network'
        ? 'category,event,networkCode,operation' : 'category,event,httpStatus,operation');
      assert.equal(tokenCalls - before.tokenCalls, 1, 'OAuth exchange must not retry.');
      assert.equal(identityCalls - before.identityCalls, scenario.operation === 'identity_lookup' ? 1 : 0);
      const replay = await fetch(attempt.callback, { redirect: 'manual', headers: { cookie: attempt.binding } });
      assert.equal(replay.headers.get('location'), '/?authError=state');
      assert.equal(diagnostics().length, before.diagnostics + 1, 'Consumed state must not repeat the provider failure.');
      observed.push({ fault: scenario.fault, redirect: scenario.redirect, diagnostic: event });
    }
    active = undefined;
    const invalid = await fetch(`${applicationOrigin}/api/auth/callback?state=invalid-private-state&code=invalid-private-code`, { redirect: 'manual' });
    assert.equal(invalid.headers.get('location'), '/?authError=state');
    const deny = await fetch(`${providerOrigin}/__control`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deny: true }) });
    assert.equal(deny.status, 200);
    const consentDenied = await beginAuthorization();
    const denied = await fetch(consentDenied.callback, { redirect: 'manual', headers: { cookie: consentDenied.binding } });
    assert.equal(denied.headers.get('location'), '/?authError=denied');
    assert.equal(diagnostics().length, scenarios.length, 'State rejection and consent denial are not provider-operation failures.');
    const retained = await fetch(`${applicationOrigin}/api/session`, { headers: { cookie: session } });
    const retainedBody: unknown = await retained.json();
    assert.ok(typeof retainedBody === 'object' && retainedBody !== null && 'status' in retainedBody && retainedBody.status === 'signed-in');
    const database = new DatabaseSync(join(directory, 'gitbored.sqlite'), { readOnly: true });
    try {
      assert.equal(database.prepare('SELECT count(*) AS count FROM users').get()?.['count'], 1);
      assert.equal(database.prepare('SELECT count(*) AS count FROM sessions').get()?.['count'], 1);
    } finally { database.close(); }
    assertRedacted();
  } finally {
    try {
      if (application && application.exitCode === null && application.signalCode === null) {
        const exited = once(application, 'exit', { signal: AbortSignal.timeout(5_000) });
        application.kill('SIGTERM');
        const result: unknown[] = await exited;
        assert.equal(result[0], 0, 'Owned application must shut down cleanly.');
      }
    } finally {
      try { await provider?.close(); } finally { await rm(directory, { recursive: true, force: true }); }
    }
  }
  await assert.rejects(stat(directory), { code: 'ENOENT' });
  console.info(JSON.stringify({ callbackScenarios: observed, redaction: 'PASS', persistence: 'real SQLite; original session retained',
    cleanup: 'owned application/provider stopped; temporary SQLite removed', ports: [3009, 3019] }));
});
