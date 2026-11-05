import { createHash, randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { registerControlledSources, type ControlledSourceSettings } from './controlled-sources.js';

interface ProviderSettings extends ControlledSourceSettings {
  login: string;
  expiresIn: number;
  refreshExpiresIn: number;
  fail: boolean;
  deny: boolean;
  rateLimit: boolean;
}

/** External HTTP seam only. Imported by the E2E runner, never the application. */
export async function startControlledGitHub(port = 3101, configure?: (app: FastifyInstance) => void) {
  const app = Fastify({ logger: false });
  const codes = new Map<string, { id: number; challenge: string; redirect: string }>();
  const tokens = new Map<string, { id: number; revoked: boolean; expires: number }>();
  const refreshTokens = new Map<string, number>();
  const defaults = (): ProviderSettings => ({ login: 'alice', expiresIn: 28800, refreshExpiresIn: 15897600,
    fail: false, deny: false, rateLimit: false, sourceMode: 'normal', sourceFailurePage: 0, pullUnavailable: false, sourceDelayMs: 0, sourceDenied: false, sourceDenialStatus: 403, sourceThrottlePage: 0, sourceRepositoryRenamed: false });
  let settings = defaults();
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
      settings = defaults();
    }
    if ('login' in value && typeof value.login === 'string') settings.login = value.login;
    if ('expiresIn' in value && typeof value.expiresIn === 'number') settings.expiresIn = value.expiresIn;
    if ('refreshExpiresIn' in value && typeof value.refreshExpiresIn === 'number') settings.refreshExpiresIn = value.refreshExpiresIn;
    if ('fail' in value && typeof value.fail === 'boolean') settings.fail = value.fail;
    if ('deny' in value && typeof value.deny === 'boolean') settings.deny = value.deny;
    if ('rateLimit' in value && typeof value.rateLimit === 'boolean') settings.rateLimit = value.rateLimit;
    if ('revoke' in value) for (const token of tokens.values()) token.revoked = true;
    if ('revokeRefresh' in value) refreshTokens.clear();
    if ('sourceMode' in value && (value.sourceMode === 'normal' || value.sourceMode === 'empty' || value.sourceMode === 'malformed' || value.sourceMode === 'untrusted-link')) settings.sourceMode = value.sourceMode;
    if ('sourceFailurePage' in value && typeof value.sourceFailurePage === 'number') settings.sourceFailurePage = value.sourceFailurePage;
    if ('pullUnavailable' in value && typeof value.pullUnavailable === 'boolean') settings.pullUnavailable = value.pullUnavailable;
    if ('sourceDelayMs' in value && typeof value.sourceDelayMs === 'number' && value.sourceDelayMs >= 0 && value.sourceDelayMs <= 5000) settings.sourceDelayMs = value.sourceDelayMs;
    if ('sourceDenied' in value && typeof value.sourceDenied === 'boolean') settings.sourceDenied = value.sourceDenied;
    if ('sourceDenialStatus' in value && (value.sourceDenialStatus === 403 || value.sourceDenialStatus === 404)) settings.sourceDenialStatus = value.sourceDenialStatus;
    if ('sourceThrottlePage' in value && typeof value.sourceThrottlePage === 'number') settings.sourceThrottlePage = value.sourceThrottlePage;
    if ('sourceRepositoryRenamed' in value && typeof value.sourceRepositoryRenamed === 'boolean') settings.sourceRepositoryRenamed = value.sourceRepositoryRenamed;
    return { ok: true };
  });
  app.get('/__stats', () => ({ refreshCount, exchangeCount,
    expiredAccessCount: [...tokens.values()].filter((token) => token.expires <= Date.now()).length }));
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
    if (!redirect || !['http://127.0.0.1:3100/api/auth/callback', 'http://127.0.0.1:3001/api/auth/callback', 'http://127.0.0.1:3005/api/auth/callback'].includes(redirect)) {
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
    tokens.set(accessToken, { id, revoked: false, expires: Date.now() + settings.expiresIn * 1000 });
    refreshTokens.set(refreshToken, id);
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
  registerControlledSources(app, port, (request) => {
    const token = tokens.get(request.headers.authorization?.replace('Bearer ', '') ?? '');
    return token && !token.revoked && token.expires > Date.now() ? token.id : null;
  }, () => settings);
  configure?.(app);
  await app.listen({ host: '127.0.0.1', port });
  return app;
}
