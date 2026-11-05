import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { SessionResponse, SessionUser } from '../shared/session.js';
import { isSessionUser } from '../shared/session.js';
import type { AuthConfig } from './config.js';

export class AuthenticationError extends Error {
  constructor(public readonly statusCode: number, public readonly code: string, message: string) {
    super(message);
  }
}

export interface AuthenticatedUser extends SessionUser {
  csrfToken: string;
}

export interface Authentication {
  requireUser(request: FastifyRequest): AuthenticatedUser;
  getAuthorizedUserToken(userId: string): Promise<string>;
  invalidateAuthorization(userId: string): void;
}

declare module 'fastify' {
  interface FastifyInstance {
    authentication: Authentication;
  }
}

interface ProviderIdentity {
  githubId: string;
  login: string;
  name: string | null;
}

interface StoredUser extends SessionUser {
  accessToken: string | null;
  refreshToken: string | null;
  accessExpires: number | null;
  refreshExpires: number | null;
  reauthorize: number;
}

interface ProviderTokens {
  accessToken: string;
  refreshToken: string | null;
  accessExpires: number | null;
  refreshExpires: number | null;
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function secret(): string {
  return randomBytes(32).toString('base64url');
}

function cookie(request: FastifyRequest, name: string): string | undefined {
  return request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
}

function setCookie(reply: FastifyReply, config: AuthConfig, name: string, value: string, seconds: number): void {
  reply.header('Set-Cookie', `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${config.secure ? '; Secure' : ''}`);
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function providerIdentity(value: unknown): ProviderIdentity {
  if (!record(value) || typeof value['id'] !== 'number' || !Number.isSafeInteger(value['id']) || value['id'] < 1
    || typeof value['login'] !== 'string' || !/^[a-zA-Z0-9-]{1,39}$/.test(value['login'])
    || !(value['name'] === null || (typeof value['name'] === 'string' && value['name'].length <= 256))) {
    throw new AuthenticationError(502, 'provider_unavailable', 'GitHub could not confirm your identity. Try signing in again.');
  }
  return { githubId: String(value['id']), login: value['login'], name: value['name'] };
}

export function registerAuthentication(app: FastifyInstance, database: DatabaseSync, config: AuthConfig | null): Authentication {
  const sessionCookie = config?.secure ? '__Host-gitbored-session' : 'gitbored-session';
  const stateCookie = config?.secure ? '__Host-gitbored-oauth' : 'gitbored-oauth';
  const refreshes = new Map<string, Promise<string>>();
  const userQuery = database.prepare(`SELECT id, github_id AS githubId, login, name,
    access_token AS accessToken, refresh_token AS refreshToken,
    access_expires AS accessExpires, refresh_expires AS refreshExpires, reauthorize FROM users WHERE id = ?`);

  function encrypt(value: string, context: string): string {
    if (!config) throw new Error('Authentication is not configured.');
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', config.encryptionKey, iv);
    cipher.setAAD(Buffer.from(context));
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
  }

  function decrypt(value: string, context: string): string {
    if (!config) throw new Error('Authentication is not configured.');
    const data = Buffer.from(value, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', config.encryptionKey, data.subarray(0, 12));
    decipher.setAAD(Buffer.from(context));
    decipher.setAuthTag(data.subarray(12, 28));
    return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8');
  }

  function storedUser(id: string): StoredUser {
    const row = userQuery.get(id);
    if (!row) throw new AuthenticationError(401, 'signed_out', 'Sign in to continue.');
    if (!isSessionUser(row)
      || !(row['accessToken'] === null || typeof row['accessToken'] === 'string')
      || !(row['refreshToken'] === null || typeof row['refreshToken'] === 'string')
      || !(row['accessExpires'] === null || typeof row['accessExpires'] === 'number')
      || !(row['refreshExpires'] === null || typeof row['refreshExpires'] === 'number')
      || typeof row['reauthorize'] !== 'number') throw new Error('Invalid stored identity.');
    return { id: row.id, githubId: row.githubId, login: row.login, name: row.name,
      accessToken: row['accessToken'], refreshToken: row['refreshToken'], accessExpires: row['accessExpires'],
      refreshExpires: row['refreshExpires'], reauthorize: row['reauthorize'] };
  }

  function requireUser(request: FastifyRequest): AuthenticatedUser {
    const token = cookie(request, sessionCookie);
    const row = token ? database.prepare(`SELECT u.id, u.github_id AS githubId, u.login, u.name,
      s.csrf_token AS csrfToken FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires > ?`).get(hash(token), Date.now()) : undefined;
    if (!config || !row) throw new AuthenticationError(401, 'signed_out', 'Your session ended. Sign in to continue.');
    if (!isSessionUser(row) || typeof row['csrfToken'] !== 'string') throw new Error('Invalid stored session.');
    return { id: row.id, githubId: row.githubId, login: row.login, name: row.name, csrfToken: row['csrfToken'] };
  }

  function invalidateAuthorization(userId: string): void {
    database.prepare(`UPDATE users SET reauthorize = 1, access_token = NULL, refresh_token = NULL,
      access_expires = NULL, refresh_expires = NULL WHERE id = ?`).run(userId);
  }

  async function exchange(parameters: URLSearchParams): Promise<ProviderTokens> {
    if (!config) throw new Error('Authentication is not configured.');
    let response: Response;
    try {
      response = await fetch(`${config.providerOrigin}/login/oauth/access_token`, {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: parameters, signal: AbortSignal.timeout(10_000), redirect: 'error',
      });
    } catch {
      throw new AuthenticationError(502, 'provider_unavailable', 'GitHub is unavailable. Try again shortly.');
    }
    let value: unknown;
    try { value = await response.json(); } catch {
      throw new AuthenticationError(502, 'provider_unavailable', 'GitHub returned an unreadable response. Try again shortly.');
    }
    if (!response.ok || !record(value) || typeof value['access_token'] !== 'string' || !value['access_token']) {
      if (response.status === 429 || response.status >= 500) {
        throw new AuthenticationError(502, 'provider_unavailable', 'GitHub is unavailable. Try again shortly.');
      }
      throw new AuthenticationError(401, 'reauthorize', 'GitHub authorization ended. Sign in again to reconnect.');
    }
    const expires = value['expires_in'];
    const refreshExpires = value['refresh_token_expires_in'];
    const refreshToken = value['refresh_token'];
    if ((expires !== undefined && (typeof expires !== 'number' || !Number.isSafeInteger(expires) || expires < 1))
      || (refreshExpires !== undefined && (typeof refreshExpires !== 'number' || !Number.isSafeInteger(refreshExpires) || refreshExpires < 1))
      || (refreshToken !== undefined && (typeof refreshToken !== 'string' || !refreshToken))) {
      throw new AuthenticationError(502, 'provider_unavailable', 'GitHub returned invalid credentials. Try signing in again.');
    }
    return { accessToken: value['access_token'], refreshToken: typeof refreshToken === 'string' ? refreshToken : null,
      accessExpires: typeof expires === 'number' ? Date.now() + expires * 1000 : null,
      refreshExpires: typeof refreshExpires === 'number' ? Date.now() + refreshExpires * 1000 : null };
  }

  function saveTokens(userId: string, tokens: ProviderTokens): void {
    database.prepare(`UPDATE users SET access_token = ?, refresh_token = ?, access_expires = ?,
      refresh_expires = ?, reauthorize = 0 WHERE id = ?`).run(encrypt(tokens.accessToken, `${userId}:access`),
      tokens.refreshToken ? encrypt(tokens.refreshToken, `${userId}:refresh`) : null,
      tokens.accessExpires, tokens.refreshExpires, userId);
  }

  async function refreshToken(userId: string): Promise<string> {
    const user = storedUser(userId);
    if (!config || user.reauthorize || !user.accessToken) {
      throw new AuthenticationError(401, 'reauthorize', 'Sign in again to reconnect GitHub.');
    }
    if (user.accessExpires === null || user.accessExpires > Date.now()) return decrypt(user.accessToken, `${userId}:access`);
    if (!user.refreshToken || (user.refreshExpires !== null && user.refreshExpires <= Date.now())) {
      invalidateAuthorization(userId);
      throw new AuthenticationError(401, 'reauthorize', 'GitHub authorization expired. Sign in again to reconnect.');
    }
    try {
      const tokens = await exchange(new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret,
        grant_type: 'refresh_token', refresh_token: decrypt(user.refreshToken, `${userId}:refresh`) }));
      // Never revive credentials removed by a concurrent revocation or reauthorization.
      if (storedUser(userId).refreshToken !== user.refreshToken) {
        return await refreshToken(userId);
      }
      saveTokens(userId, tokens);
      return tokens.accessToken;
    } catch (error) {
      if (storedUser(userId).refreshToken !== user.refreshToken) return await refreshToken(userId);
      if (error instanceof AuthenticationError && error.code === 'reauthorize') invalidateAuthorization(userId);
      throw error;
    }
  }

  async function getAuthorizedUserToken(userId: string): Promise<string> {
    const existing = refreshes.get(userId);
    if (existing) return existing;
    const pending = refreshToken(userId);
    refreshes.set(userId, pending);
    try { return await pending; } finally { refreshes.delete(userId); }
  }

  async function identity(accessToken: string): Promise<ProviderIdentity> {
    if (!config) throw new Error('Authentication is not configured.');
    let response: Response;
    try {
      response = await fetch(`${config.apiOrigin}/user`, { headers: { Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      redirect: 'error', signal: AbortSignal.timeout(10_000) });
    } catch {
      throw new AuthenticationError(502, 'provider_unavailable', 'GitHub is unavailable. Try again shortly.');
    }
    if (response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after'))) {
      throw new AuthenticationError(502, 'provider_unavailable', 'GitHub is temporarily limiting requests. Try again shortly.');
    }
    if (response.status === 401 || response.status === 403) {
      throw new AuthenticationError(401, 'reauthorize', 'GitHub authorization was revoked. Sign in again to reconnect.');
    }
    if (!response.ok) throw new AuthenticationError(502, 'provider_unavailable', 'GitHub is unavailable. Try again shortly.');
    try { return providerIdentity(await response.json()); } catch (error) {
      if (error instanceof AuthenticationError) throw error;
      throw new AuthenticationError(502, 'provider_unavailable', 'GitHub returned an unreadable identity. Try again shortly.');
    }
  }

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer');
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return;
    const user = requireUser(request);
    const csrf = request.headers['x-csrf-token'];
    if (!config || request.headers.origin !== config.origin || typeof csrf !== 'string'
      || !timingSafeEqual(Buffer.from(hash(csrf)), Buffer.from(hash(user.csrfToken)))) {
      throw new AuthenticationError(403, 'csrf', 'This request could not be verified. Reload the page and try again.');
    }
  });

  app.get('/api/session', async (request, reply): Promise<SessionResponse> => {
    if (!config) return { status: 'unconfigured' };
    let user: AuthenticatedUser;
    try { user = requireUser(request); } catch (error) {
      if (!(error instanceof AuthenticationError)) throw error;
      const expired = Boolean(cookie(request, sessionCookie));
      if (expired) setCookie(reply, config, sessionCookie, '', 0);
      return expired ? { status: 'signed-out', reason: 'expired' } : { status: 'signed-out' };
    }
    let authorization: 'ready' | 'reauthorize' = 'ready';
    let accessToken: string | undefined;
    try {
      accessToken = await getAuthorizedUserToken(user.id);
      const provider = await identity(accessToken);
      if (provider.githubId !== user.githubId) throw new AuthenticationError(401, 'reauthorize', 'Sign in again to reconnect GitHub.');
    } catch (error) {
      if (!(error instanceof AuthenticationError) || error.code !== 'reauthorize') throw error;
      const current = storedUser(user.id).accessToken;
      if (accessToken && current && decrypt(current, `${user.id}:access`) === accessToken) invalidateAuthorization(user.id);
      authorization = 'reauthorize';
    }
    return { status: 'signed-in', user: { id: user.id, githubId: user.githubId, login: user.login, name: user.name },
      csrfToken: user.csrfToken, authorization };
  });

  app.get('/api/auth/github', (request, reply) => {
    if (!config) return reply.redirect('/?authError=unconfigured');
    if (request.headers['sec-fetch-site'] === 'cross-site') {
      throw new AuthenticationError(403, 'csrf', 'Open GitBored first, then select Sign in.');
    }
    database.prepare('DELETE FROM oauth_states WHERE expires <= ?').run(Date.now());
    database.prepare('DELETE FROM sessions WHERE expires <= ?').run(Date.now());
    const state = secret();
    const binding = secret();
    const verifier = secret();
    database.prepare('INSERT INTO oauth_states VALUES (?, ?, ?, ?)').run(hash(state), hash(binding),
      encrypt(verifier, hash(state)), Date.now() + 600_000);
    setCookie(reply, config, stateCookie, binding, 600);
    const url = new URL('/login/oauth/authorize', config.providerOrigin);
    url.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: `${config.origin}/api/auth/callback`,
      state, code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
    return reply.redirect(url.href);
  });

  app.get('/api/auth/callback', async (request, reply) => {
    if (!config) return reply.redirect('/?authError=unconfigured');
    const query = new URL(request.url, config.origin).searchParams;
    const state = query.get('state');
    const binding = cookie(request, stateCookie);
    setCookie(reply, config, stateCookie, '', 0);
    const row = state && binding ? database.prepare(`DELETE FROM oauth_states
      WHERE state_hash = ? AND binding_hash = ? AND expires > ? RETURNING verifier`).get(hash(state), hash(binding), Date.now()) : undefined;
    if (!row || typeof row['verifier'] !== 'string' || !state) return reply.redirect('/?authError=state');
    if (query.has('error')) return reply.redirect('/?authError=denied');
    const code = query.get('code');
    if (!code || code.length > 2048) return reply.redirect('/?authError=state');
    try {
      const tokens = await exchange(new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret,
        code, redirect_uri: `${config.origin}/api/auth/callback`, code_verifier: decrypt(row['verifier'], hash(state)) }));
      const provider = await identity(tokens.accessToken);
      database.exec('BEGIN IMMEDIATE');
      let userId: string;
      const token = secret();
      try {
        const existing = database.prepare('SELECT id FROM users WHERE github_id = ?').get(provider.githubId);
        userId = typeof existing?.['id'] === 'string' ? existing['id'] : randomUUID();
        database.prepare(`INSERT INTO users (id, github_id, login, name) VALUES (?, ?, ?, ?)
          ON CONFLICT(github_id) DO UPDATE SET login = excluded.login, name = excluded.name`).run(userId, provider.githubId, provider.login, provider.name);
        saveTokens(userId, tokens);
        const previous = cookie(request, sessionCookie);
        if (previous) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(previous));
        database.prepare('INSERT INTO sessions VALUES (?, ?, ?, ?)').run(hash(token), userId, secret(), Date.now() + config.sessionSeconds * 1000);
        database.exec('COMMIT');
      } catch (error) { database.exec('ROLLBACK'); throw error; }
      // Keep the state-cookie deletion alongside the new session cookie.
      reply.header('Set-Cookie', [ `${stateCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${config.secure ? '; Secure' : ''}`,
        `${sessionCookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${config.sessionSeconds}${config.secure ? '; Secure' : ''}` ]);
      return reply.redirect('/');
    } catch (error) {
      if (error instanceof AuthenticationError) return reply.redirect(`/?authError=${error.code === 'reauthorize' ? 'denied' : 'provider'}`);
      throw error;
    }
  });

  app.post('/api/auth/logout', (request, reply) => {
    requireUser(request);
    const token = cookie(request, sessionCookie);
    if (token) database.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hash(token));
    if (config) setCookie(reply, config, sessionCookie, '', 0);
    return reply.code(204).send();
  });

  return { requireUser, getAuthorizedUserToken, invalidateAuthorization };
}
