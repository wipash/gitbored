import { createHash, randomUUID } from 'node:crypto';
import Fastify from 'fastify';

interface ProviderSettings {
  login: string;
  expiresIn: number;
  refreshExpiresIn: number;
  fail: boolean;
  deny: boolean;
  rateLimit: boolean;
}

/** External HTTP seam only. Imported by the E2E runner, never the application. */
export async function startControlledGitHub(port = 3101) {
  const app = Fastify({ logger: false });
  const codes = new Map<string, { id: number; challenge: string; redirect: string }>();
  const tokens = new Map<string, { id: number; revoked: boolean }>();
  const refreshTokens = new Map<string, number>();
  let settings: ProviderSettings = { login: 'alice', expiresIn: 28800, refreshExpiresIn: 15897600, fail: false, deny: false, rateLimit: false };
  let refreshCount = 0;
  let exchangeCount = 0;
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, body, done) => {
    done(null, typeof body === 'string' ? new URLSearchParams(body) : new URLSearchParams());
  });
  app.post('/__control', (request) => {
    const value = request.body;
    if (typeof value !== 'object' || value === null) return { error: 'invalid settings' };
    if ('reset' in value) {
      codes.clear(); tokens.clear(); refreshTokens.clear(); refreshCount = 0; exchangeCount = 0;
      settings = { login: 'alice', expiresIn: 28800, refreshExpiresIn: 15897600, fail: false, deny: false, rateLimit: false };
    }
    if ('login' in value && typeof value.login === 'string') settings.login = value.login;
    if ('expiresIn' in value && typeof value.expiresIn === 'number') settings.expiresIn = value.expiresIn;
    if ('refreshExpiresIn' in value && typeof value.refreshExpiresIn === 'number') settings.refreshExpiresIn = value.refreshExpiresIn;
    if ('fail' in value && typeof value.fail === 'boolean') settings.fail = value.fail;
    if ('deny' in value && typeof value.deny === 'boolean') settings.deny = value.deny;
    if ('rateLimit' in value && typeof value.rateLimit === 'boolean') settings.rateLimit = value.rateLimit;
    if ('revoke' in value) for (const token of tokens.values()) token.revoked = true;
    if ('revokeRefresh' in value) refreshTokens.clear();
    return { ok: true };
  });
  app.get('/__stats', () => ({ refreshCount, exchangeCount }));
  app.get('/login/oauth/authorize', (request, reply) => {
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    if (url.searchParams.get('code_challenge_method') !== 'S256' || !url.searchParams.get('code_challenge')) {
      return reply.code(400).send({ error: 'PKCE required' });
    }
    const choice = url.searchParams.get('identity');
    if (!choice) {
      const alice = new URL(url); alice.searchParams.set('identity', '101');
      const bob = new URL(url); bob.searchParams.set('identity', '202');
      return reply.type('text/html').send(`<!doctype html><html lang="en"><title>Controlled GitHub</title><body><h1>Controlled GitHub authorization</h1><p>Test identities only; not real GitHub.</p><a href="${alice.pathname}${alice.search.replaceAll('&', '&amp;')}">Authorize Alice</a> <a href="${bob.pathname}${bob.search.replaceAll('&', '&amp;')}">Authorize Bob</a></body></html>`);
    }
    const redirect = url.searchParams.get('redirect_uri');
    if (redirect !== 'http://127.0.0.1:3100/api/auth/callback' && redirect !== 'http://127.0.0.1:3001/api/auth/callback') {
      return reply.code(400).send({ error: 'Unregistered test callback' });
    }
    const callback = new URL(redirect);
    callback.searchParams.set('state', url.searchParams.get('state') ?? '');
    if (settings.deny) callback.searchParams.set('error', 'access_denied');
    else {
      const code = randomUUID();
      codes.set(code, { id: choice === '202' ? 202 : 101, challenge: url.searchParams.get('code_challenge') ?? '', redirect });
      callback.searchParams.set('code', code);
    }
    return reply.redirect(callback.href);
  });
  app.post('/login/oauth/access_token', (request, reply) => {
    if (settings.fail) return reply.code(503).send({ error: 'Controlled provider unavailable' });
    const body = request.body;
    if (!(body instanceof URLSearchParams) || body.get('client_id') !== 'controlled-client' || body.get('client_secret') !== 'controlled-secret') {
      return reply.code(401).send({ error: 'invalid_client' });
    }
    let id: number | undefined;
    if (body.get('grant_type') === 'refresh_token') {
      const refresh = body.get('refresh_token') ?? '';
      id = refreshTokens.get(refresh);
      refreshTokens.delete(refresh);
      refreshCount += 1;
    } else {
      const code = body.get('code') ?? '';
      const authorization = codes.get(code);
      codes.delete(code);
      exchangeCount += 1;
      if (authorization && body.get('redirect_uri') === authorization.redirect
        && createHash('sha256').update(body.get('code_verifier') ?? '').digest('base64url') === authorization.challenge) id = authorization.id;
    }
    if (!id) return reply.code(400).send({ error: 'invalid_grant', error_description: 'SENSITIVE_PROVIDER_PAYLOAD' });
    const accessToken = `controlled-access-${randomUUID()}`;
    const refreshToken = `controlled-refresh-${randomUUID()}`;
    tokens.set(accessToken, { id, revoked: false }); refreshTokens.set(refreshToken, id);
    return { access_token: accessToken, token_type: 'bearer', expires_in: settings.expiresIn,
      refresh_token: refreshToken, refresh_token_expires_in: settings.refreshExpiresIn };
  });
  app.get('/user', (request, reply) => {
    if (settings.fail) return reply.code(503).send({ error: 'SENSITIVE_PROVIDER_PAYLOAD' });
    if (settings.rateLimit) return reply.header('X-RateLimit-Remaining', '0').code(403).send({ error: 'SENSITIVE_PROVIDER_PAYLOAD' });
    const token = tokens.get(request.headers.authorization?.replace('Bearer ', '') ?? '');
    if (!token || token.revoked) return reply.code(401).send({ error: 'SENSITIVE_PROVIDER_PAYLOAD' });
    return { id: token.id, login: token.id === 101 ? settings.login : 'bob', name: token.id === 101 ? 'Alice Example' : 'Bob Example' };
  });
  await app.listen({ host: '127.0.0.1', port });
  return app;
}
