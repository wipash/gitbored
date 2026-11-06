import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ItemKind, ItemMetadata } from '../shared/items.js';
import type { RepositorySource, SourceItem } from '../shared/sources.js';
import { AuthenticationError, type AuthenticatedUser } from './auth.js';
import type { AuthConfig } from './config.js';
import { boolean, id, installation, invalidProvider, list, number, object, opaque, parseItemUrl, providerRead, repository, text } from './sourceProvider.js';

import { itemContextQuery, normalizeContext } from './itemContext.js';

interface SourceContext { request: FastifyRequest; user: AuthenticatedUser; token: string; origin: string }
interface NormalizedItem {
  item: Omit<SourceItem, 'reference'>;
  nodeId: string;
  issueId: string;
  pullId: string | null;
  kind: ItemKind;
}
export function initializeSources(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS repository_sources (
      user_id TEXT NOT NULL REFERENCES users(id), repository_node_id TEXT NOT NULL,
      repository_rest_id TEXT NOT NULL, owner TEXT NOT NULL, name TEXT NOT NULL,
      private INTEGER NOT NULL, next_page INTEGER, PRIMARY KEY(user_id, repository_node_id)
    );
    CREATE TABLE IF NOT EXISTS item_references (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
      host TEXT NOT NULL, kind TEXT NOT NULL, node_id TEXT NOT NULL,
      repository_node_id TEXT NOT NULL, repository_rest_id TEXT NOT NULL,
      issue_rest_id TEXT, pull_request_rest_id TEXT,
      owner TEXT NOT NULL, repository TEXT NOT NULL, number INTEGER NOT NULL,
      UNIQUE(user_id, host, kind, node_id)
    );
    CREATE TABLE IF NOT EXISTS recent_repositories (
      user_id TEXT NOT NULL REFERENCES users(id), repository_node_id TEXT NOT NULL,
      used_at INTEGER NOT NULL, PRIMARY KEY(user_id, repository_node_id)
    );
  `);
}
function badRequest(message: string): never { throw new AuthenticationError(400, 'invalid_request', message); }
function pageInput(request: FastifyRequest): number {
  const query = new URL(request.url, 'http://localhost').searchParams;
  if ([...query.keys()].some((key) => key !== 'page') || query.getAll('page').length > 1) return badRequest('Use a single page number between 1 and 10000.');
  const value = query.get('page') ?? '1';
  return /^[1-9][0-9]{0,4}$/.test(value) && Number(value) <= 10000 ? Number(value) : badRequest('Use a page number between 1 and 10000.');
}
function timestamp(value: unknown): string {
  const result = text(value, 64);
  return /^\d{4}-\d\d-\d\dT/.test(result) && Number.isFinite(Date.parse(result)) ? result : invalidProvider();
}
function normalize(value: unknown, repo: RepositorySource, detail?: unknown): NormalizedItem {
  const row = object(value);
  const kind: ItemKind = row['pull_request'] === undefined ? 'issue' : 'pull-request';
  if (kind === 'pull-request') object(row['pull_request']);
  const nodeId = opaque(row['node_id']); const issueId = id(row['id']); const itemNumber = number(row['number']);
  const commonState = row['state'];
  if (commonState !== 'open' && commonState !== 'closed') return invalidProvider();
  let state: ItemMetadata['state'] = kind === 'issue' ? commonState : 'unknown';
  let pullId: string | null = null;
  if (kind === 'pull-request' && detail !== undefined) {
    const pull = object(detail);
    if (opaque(pull['node_id']) !== nodeId || number(pull['number']) !== itemNumber) return invalidProvider();
    const headRepo = repository(object(pull['base'])['repo']);
    if (headRepo.nodeId !== repo.nodeId || headRepo.id !== repo.id) return invalidProvider();
    pullId = id(pull['id']);
    const merged = boolean(pull['merged']); const draft = boolean(pull['draft']);
    if (pull['state'] !== 'open' && pull['state'] !== 'closed') return invalidProvider();
    state = merged ? 'merged' : pull['state'] === 'closed' ? 'closed' : draft ? 'draft' : 'open';
  }
  const reason = row['state_reason'];
  const metadata: ItemMetadata = { kind, locator: { owner: repo.owner, repository: repo.name, number: itemNumber },
    title: text(row['title']), state, sourceState: commonState, labels: list(row['labels'], 1000).map((label) => text(object(label)['name'], 1024)),
    assignees: list(row['assignees'], 1000).map((assignee) => text(object(assignee)['login'], 256)), freshness: 'current',
    stateReason: reason === undefined || reason === null ? null : text(reason, 256),
    createdAt: timestamp(row['created_at']), updatedAt: timestamp(row['updated_at']),
    closedAt: row['closed_at'] === null ? null : timestamp(row['closed_at']) };
  return { item: { metadata }, nodeId, issueId, pullId, kind };
}
export function registerSources(app: FastifyInstance, database: DatabaseSync, config: AuthConfig | null): void {
  function rememberRepository(userId: string, repo: RepositorySource): void {
    database.prepare(`INSERT INTO recent_repositories VALUES (?, ?, ?)
      ON CONFLICT(user_id, repository_node_id) DO UPDATE SET used_at=excluded.used_at`).run(userId, repo.nodeId, Date.now());
  }
  function persistRepository(userId: string, repo: RepositorySource, nextPage?: number | null): void {
    database.prepare(`INSERT INTO repository_sources VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, repository_node_id) DO UPDATE SET repository_rest_id=excluded.repository_rest_id,
      owner=excluded.owner, name=excluded.name, private=excluded.private,
      next_page=CASE WHEN ? THEN excluded.next_page ELSE repository_sources.next_page END`)
      .run(userId, repo.nodeId, repo.id, repo.owner, repo.name, Number(repo.private), nextPage === undefined ? 1 : nextPage, Number(nextPage !== undefined));
  }
  function persistItem(userId: string, repo: RepositorySource, normalized: NormalizedItem): SourceItem {
    const existing = database.prepare('SELECT id, pull_request_rest_id AS pullRequestRestId FROM item_references WHERE user_id=? AND host=? AND kind=? AND node_id=?')
      .get(userId, 'github.com', normalized.kind, normalized.nodeId);
    const referenceId = typeof existing?.['id'] === 'string' ? existing['id'] : randomUUID();
    const reference = { id: referenceId, host: 'github.com' as const, kind: normalized.kind, repositoryNodeId: repo.nodeId,
      repositoryRestId: repo.id, nodeId: normalized.nodeId, issueRestId: normalized.issueId,
      pullRequestRestId: normalized.pullId ?? (typeof existing?.['pullRequestRestId'] === 'string' ? existing['pullRequestRestId'] : null) };
    database.prepare(`INSERT INTO item_references VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET repository_node_id=excluded.repository_node_id, repository_rest_id=excluded.repository_rest_id,
      issue_rest_id=excluded.issue_rest_id, pull_request_rest_id=COALESCE(excluded.pull_request_rest_id, item_references.pull_request_rest_id),
      owner=excluded.owner, repository=excluded.repository, number=excluded.number`)
      .run(referenceId, userId, reference.host, reference.kind, reference.nodeId, repo.nodeId, repo.id,
        normalized.issueId, normalized.pullId, repo.owner, repo.name, normalized.item.metadata.locator.number);
    return { reference, metadata: normalized.item.metadata };
  }
  async function context(request: FastifyRequest): Promise<SourceContext> {
    const user = app.authentication.requireUserContext(request);
    if (!config) throw new AuthenticationError(503, 'unconfigured', 'Configure GitHub sign-in, then reload.');
    const token = await app.authentication.getAuthorizedUserToken(user.id);
    app.authentication.assertUserContext(request, user);
    return { request, user, token, origin: config.apiOrigin };
  }
  async function read(ctx: SourceContext, path: string, page?: number, canonicalPaginationPath?: string) {
    try {
      const result = await providerRead(ctx.origin, ctx.token, path, page, canonicalPaginationPath);
      app.authentication.assertUserContext(ctx.request, ctx.user);
      return result;
    }
    catch (error) {
      if (error instanceof AuthenticationError && error.code === 'reauthorize') {
        app.authentication.invalidateAuthorizationIfCurrent(ctx.user.id, ctx.token);
      }
      app.authentication.assertUserContext(ctx.request, ctx.user);
      throw error;
    }
  }
  app.get('/api/sources/installations', async (request) => {
    const ctx = await context(request); const page = pageInput(request);
    const result = await read(ctx, '/user/installations', page);
    return { items: list(object(result.value)['installations'], 30).map(installation), page, nextPage: result.nextPage };
  });
  app.get('/api/sources/recent-repositories', (request) => {
    const user = app.authentication.requireUserContext(request);
    // These account-owned shortcuts contain locators only. Opening one rechecks GitHub access.
    const items = database.prepare(`SELECT s.owner, s.name FROM recent_repositories r
      JOIN repository_sources s ON s.user_id=r.user_id AND s.repository_node_id=r.repository_node_id
      WHERE r.user_id=? ORDER BY r.used_at DESC, s.owner, s.name LIMIT 8`).all(user.id);
    return { items, page: 1, nextPage: null };
  });
  app.post('/api/sources/repositories/resolve', async (request) => {
    const ctx = await context(request);
    const body = request.body;
    if (typeof body !== 'object' || body === null || !('url' in body) || typeof body.url !== 'string' || body.url.length > 512) {
      return badRequest('Enter a repository as owner/name or https://github.com/owner/name.');
    }
    const input = body.url.trim().replace(/\/$/, '');
    const base = input.startsWith('https://github.com/') ? input : `https://github.com/${input}`;
    let locator;
    try { locator = parseItemUrl(`${base}/issues/1`); }
    catch { return badRequest('Enter a repository as owner/name or https://github.com/owner/name.'); }
    const repo = repository((await read(ctx, `/repos/${locator.owner}/${locator.repository}`)).value);
    app.authentication.assertUserContext(request, ctx.user);
    persistRepository(ctx.user.id, repo);
    rememberRepository(ctx.user.id, repo);
    return repo;
  });
  app.get<{ Params: { installationId: string } }>('/api/sources/installations/:installationId/repositories', async (request) => {
    const ctx = await context(request); const page = pageInput(request);
    const installationId = request.params.installationId;
    if (!/^[1-9][0-9]{0,127}$/.test(installationId)) return badRequest('Choose a valid installation.');
    const result = await read(ctx, `/user/installations/${installationId}/repositories`, page);
    const items = list(object(result.value)['repositories'], 30).map(repository);
    app.authentication.assertUserContext(request, ctx.user);
    for (const repo of items) persistRepository(ctx.user.id, repo);
    return { items, page, nextPage: result.nextPage };
  });
  app.get<{ Params: { owner: string; repository: string } }>('/api/sources/repositories/:owner/:repository/items', async (request) => {
    const ctx = await context(request); const page = pageInput(request);
    const locator = parseItemUrl(`https://github.com/${request.params.owner}/${request.params.repository}/issues/1`);
    const path = `/repos/${locator.owner}/${locator.repository}`;
    const repo = repository((await read(ctx, path)).value);
    // GitHub's Link header uses the canonical numeric repository route.
    // Derive that one allowed alias from this authorized repository response.
    const result = await read(ctx, `${path}/issues?state=all&sort=created&direction=asc`, page, `/repositories/${repo.id}/issues`);
    // Validate the whole page before committing progress or references.
    const normalized = list(result.value, 30).map((item) => normalize(item, repo));
    app.authentication.assertUserContext(request, ctx.user);
    database.exec('BEGIN IMMEDIATE');
    try {
      const items = normalized.map((item) => persistItem(ctx.user.id, repo, item));
      persistRepository(ctx.user.id, repo, result.nextPage);
      rememberRepository(ctx.user.id, repo);
      database.exec('COMMIT');
      return { items, repository: repo, page, nextPage: result.nextPage };
    } catch (error) { database.exec('ROLLBACK'); throw error; }
  });
  async function resolve(ctx: SourceContext, input: unknown, expectedNodeId?: string): Promise<SourceItem> {
    const locator = parseItemUrl(input); const path = `/repos/${locator.owner}/${locator.repository}`;
    const repo = repository((await read(ctx, path)).value);
    const issue = (await read(ctx, `${path}/issues/${locator.number}`)).value;
    const common = normalize(issue, repo);
    if (common.kind !== locator.kind || common.item.metadata.locator.number !== locator.number) return invalidProvider();
    if (expectedNodeId !== undefined && common.nodeId !== expectedNodeId) {
      throw new AuthenticationError(404, 'unresolved', 'GitHub no longer confirms this reference at its saved URL. Resolve its current GitHub URL or browse the repository again.');
    }
    let detail: unknown;
    if (locator.kind === 'pull-request') {
      try { detail = (await read(ctx, `${path}/pulls/${locator.number}`)).value; }
      catch (error) {
        // Common-field authority is not authority to deliver old PR enrichment.
        if (!(error instanceof AuthenticationError) || error.code === 'reauthorize') throw error;
      }
    }
    const normalized = detail === undefined ? common : normalize(issue, repo, detail);
    app.authentication.assertUserContext(ctx.request, ctx.user);
    persistRepository(ctx.user.id, repo);
    return persistItem(ctx.user.id, repo, normalized);
  }
  app.post('/api/sources/resolve', async (request) => {
    const ctx = await context(request);
    if (typeof request.body !== 'object' || request.body === null || !('url' in request.body)) return badRequest('Enter a supported GitHub item URL.');
    return await resolve(ctx, request.body.url);
  });
  app.get<{ Params: { id: string } }>('/api/references/:id/context', async (request) => {
    const ctx = await context(request);
    const row = database.prepare('SELECT node_id AS nodeId FROM item_references WHERE id=? AND user_id=?').get(request.params.id, ctx.user.id);
    if (!row) throw new AuthenticationError(404, 'unavailable', 'Reference unavailable. Refresh the board.');
    try {
      const result = await providerRead(ctx.origin, ctx.token, '/graphql', undefined, undefined,
        { query: itemContextQuery, variables: { id: opaque(row['nodeId']) } });
      app.authentication.assertUserContext(request, ctx.user);
      return normalizeContext(result.value);
    } catch (error) {
      if (error instanceof AuthenticationError && error.code === 'reauthorize') app.authentication.invalidateAuthorizationIfCurrent(ctx.user.id, ctx.token);
      app.authentication.assertUserContext(request, ctx.user);
      throw error;
    }
  });
  app.get<{ Params: { id: string } }>('/api/references/:id', async (request) => {
    const ctx = await context(request);
    const row = database.prepare('SELECT owner, repository, number, kind, node_id AS nodeId FROM item_references WHERE id=? AND user_id=?').get(request.params.id, ctx.user.id);
    if (!row) throw new AuthenticationError(404, 'unavailable', 'This reference is unavailable. Browse your sources or resolve its GitHub URL again.');
    return await resolve(ctx, `https://github.com/${String(row['owner'])}/${String(row['repository'])}/${row['kind'] === 'issue' ? 'issues' : 'pull'}/${String(row['number'])}`, String(row['nodeId']));
  });
}
