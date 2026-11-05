import { setTimeout as delay } from 'node:timers/promises';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface ControlledSourceSettings {
  sourceMode: 'normal' | 'empty' | 'malformed' | 'untrusted-link';
  sourceFailurePage: number;
  pullUnavailable: boolean;
  sourceDelayMs: number;
  sourceDenied: boolean;
}
export function registerControlledSources(app: FastifyInstance, port: number, identity: (request: FastifyRequest) => number | null,
  settings: () => ControlledSourceSettings) {
  const requests: { user: number; path: string }[] = [];
  app.addHook('onRequest', async (request) => {
    if ((request.routeOptions.url?.startsWith('/repos/') || request.routeOptions.url?.startsWith('/user/installations')) && settings().sourceDelayMs > 0) {
      await delay(settings().sourceDelayMs);
    }
  });
  const repo = (owner: string, name: string) => ({ id: `raw:${(name === 'outside' ? 9007199254740997n : owner === 'alice' ? 9007199254740993n : owner === 'bob' ? 9007199254741101n : 9007199254741201n) + (name === 'other' ? 2n : 0n)}`,
    node_id: `R_${owner}_${name}`, name, owner: { login: owner }, private: name !== 'outside' });
  const issue = (owner: string, name: string, number: number, pull = false) => ({ id: `raw:${9007199254741001n + BigInt(number) + (name === 'other' ? 2000n : 0n) + (owner === 'alice' ? 0n : owner === 'bob' ? 10000n : 20000n)}`,
    node_id: `${pull ? 'PR' : 'I'}_${owner}_${name}_${number}`, number, title: number === 1
      ? `${owner} ${name === 'outside' ? 'public' : 'private'} issue — ${'Long complete title, with accessible full details. '.repeat(8)}` : `${pull ? 'Pull request' : 'Issue'} ${number}`,
    state: pull ? 'closed' : 'open', state_reason: pull ? null : 'reopened',
    ...(pull ? { pull_request: { url: `http://127.0.0.1:${port}/repos/${owner}/${name}/pulls/${number}` } } : {}),
    labels: Array.from({ length: 8 }, (_, index) => ({ name: `Label ${index + 1} ${'extended '.repeat(4)}` })),
    assignees: [{ login: owner }, { login: 'another-contributor' }], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', closed_at: pull ? '2026-11-01T00:00:00Z' : null });
  const raw = (reply: FastifyReply, value: unknown) => reply.type('application/json').send(JSON.stringify(value).replace(/"raw:([0-9]+)"/g, '$1'));
  function authorize(request: FastifyRequest, reply: FastifyReply): number | null {
    const user = identity(request);
    if (!user) { void reply.code(401).send({ message: 'Controlled unauthorized' }); return null; }
    requests.push({ user, path: request.url });
    if (settings().sourceDenied) { void reply.code(403).send({ message: 'Controlled missing approval' }); return null; }
    return user;
  }
  function next(reply: FastifyReply, request: FastifyRequest, page: number, hasNext: boolean): void {
    if (!hasNext) return;
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    url.searchParams.set('page', String(page + 1)); url.searchParams.set('per_page', '30');
    if (settings().sourceMode === 'untrusted-link') url.host = 'example.invalid';
    reply.header('Link', `<${url.href}>; rel="next"`);
  }
  app.get('/__source-stats', () => ({ requests }));
  app.post('/__source-stats/reset', () => { requests.length = 0; return { ok: true }; });
  app.get('/user/installations', (request, reply) => {
    const user = authorize(request, reply); if (!user) return reply;
    if (settings().sourceMode === 'malformed') return raw(reply, { installations: [{ id: 'raw:9007199254740993' }] });
    const page = Number(new URL(request.url, `http://127.0.0.1:${port}`).searchParams.get('page') ?? '1');
    if (settings().sourceMode === 'empty') return { installations: [], total_count: 0 };
    next(reply, request, page, page === 1);
    return raw(reply, { total_count: 2, installations: [{ id: `raw:${page === 1 ? '9007199254740993' : '9007199254740995'}`,
      account: { login: page === 1 ? user === 101 ? 'alice' : 'bob' : 'example-org', type: page === 1 ? 'User' : 'Organization' },
      repository_selection: page === 1 ? 'all' : 'selected', suspended_at: null }] });
  });
  app.get<{ Params: { id: string } }>('/user/installations/:id/repositories', (request, reply) => {
    const user = authorize(request, reply); if (!user) return reply;
    if (!['9007199254740993', '9007199254740995'].includes(request.params.id)) return reply.code(404).send({ message: 'Unknown installation' });
    const page = Number(new URL(request.url, `http://127.0.0.1:${port}`).searchParams.get('page') ?? '1');
    next(reply, request, page, page === 1);
    const own = user === 101 ? 'alice' : 'bob';
    const owner = request.params.id === '9007199254740995' ? 'example-org' : own;
    return raw(reply, { total_count: 2, repositories: [repo(owner, page === 1 ? 'project' : 'other')] });
  });
  app.get<{ Params: { owner: string; name: string } }>('/repos/:owner/:name', (request, reply) => {
    const user = authorize(request, reply); if (!user) return reply;
    const { owner, name } = request.params;
    if (owner === 'missing' || (name !== 'outside' && owner !== (user === 101 ? 'alice' : 'bob') && owner !== 'example-org')) return reply.code(404).send({ message: 'Private access denied' });
    if (owner === 'approval') return reply.code(403).send({ message: 'Organization approval required' });
    return raw(reply, repo(owner, name));
  });
  app.get<{ Params: { owner: string; name: string } }>('/repos/:owner/:name/issues', (request, reply) => {
    if (!authorize(request, reply)) return reply;
    const page = Number(new URL(request.url, `http://127.0.0.1:${port}`).searchParams.get('page') ?? '1');
    if (page === settings().sourceFailurePage) return reply.code(503).send({ message: 'Controlled failed page' });
    if (settings().sourceMode === 'malformed') return [{ id: 2, title: 'Malformed row' }];
    if (settings().sourceMode === 'empty') return raw(reply, []);
    next(reply, request, page, page < 3);
    const { owner, name } = request.params;
    return raw(reply, page === 1 ? [issue(owner, name, 1), issue(owner, name, 2, true)]
      : page === 2 ? [issue(owner, name, 3, true), issue(owner, name, 4, true)] : [issue(owner, name, 5)]);
  });
  app.get<{ Params: { owner: string; name: string; number: string } }>('/repos/:owner/:name/issues/:number', (request, reply) => {
    if (!authorize(request, reply)) return reply;
    const { owner, name, number } = request.params;
    return raw(reply, issue(owner, name, Number(number), Number(number) % 2 === 0));
  });
  app.get<{ Params: { owner: string; name: string; number: string } }>('/repos/:owner/:name/pulls/:number', (request, reply) => {
    if (!authorize(request, reply)) return reply;
    if (settings().pullUnavailable) return reply.code(403).send({ message: 'PR enrichment unavailable' });
    const { owner, name, number } = request.params;
    return raw(reply, { id: 'raw:9007199254741999', node_id: `PR_${owner}_${name}_${number}`, number: Number(number), state: 'closed', merged: true, draft: false, base: { repo: repo(owner, name) } });
  });
}
