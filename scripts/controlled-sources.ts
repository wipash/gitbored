import { setTimeout as delay } from 'node:timers/promises';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface ControlledSourceSettings {
  sourceCardLayout: boolean;
  sourceMode: 'normal' | 'empty' | 'malformed' | 'untrusted-link';
  sourceFailurePage: number;
  sourceDetailFailure: boolean;
  pullUnavailable: boolean;
  sourceDelayMs: number;
  sourceDenied: boolean;
  sourceSsoRequired: boolean;
  sourceSsoPath: string;
  sourceDenialStatus: 403 | 404;
  sourceThrottlePage: number;
  sourceRepositoryRenamed: boolean;
}
export function registerControlledSources(app: FastifyInstance, port: number, identity: (request: FastifyRequest) => number | null,
  settings: () => ControlledSourceSettings) {
  const requests: { user: number; path: string }[] = [];
  type GateTarget = 'repositories-page-2' | 'items-page-2' | 'old-token-401' | 'issue-detail' | 'issue-detail-next' | 'repository-denial';
  const gates = new Map<string, { target: GateTarget; entered: boolean; released: boolean; completed: boolean; promise: Promise<void>; release: () => void }>();
  let latestGate: string | null = null;
  app.post('/__source-gate', (request, reply) => {
    const body = request.body;
    if (typeof body !== 'object' || body === null || !('action' in body)) return reply.code(400).send({ error: 'Choose a gate action.' });
    if (body.action === 'release' || body.action === 'reset') {
      if ('target' in body && typeof body.target !== 'string') return reply.code(400).send({ error: 'Choose a supported gate target.' });
      for (const [target, current] of gates) {
        if ('target' in body && body.target !== target) continue;
        current.released = true; current.release();
        if (body.action === 'reset') gates.delete(target);
      }
      if (body.action === 'reset' && !('target' in body)) latestGate = null;
      return { ok: true };
    }
    if (body.action !== 'arm' || !('target' in body) || (body.target !== 'repositories-page-2' && body.target !== 'items-page-2' && body.target !== 'old-token-401' && body.target !== 'issue-detail' && body.target !== 'issue-detail-next' && body.target !== 'repository-denial')) return reply.code(400).send({ error: 'Choose a supported gate target.' });
    const existing = gates.get(body.target);
    if (existing && !existing.released) return reply.code(409).send({ error: 'Release this active gate first.' });
    let release: (() => void) | undefined;
    const promise = new Promise<void>((resolve) => { release = resolve; });
    if (!release) throw new Error('The controlled gate must initialize its release synchronously.');
    gates.set(body.target, { target: body.target, entered: false, released: false, completed: false, promise, release });
    latestGate = body.target;
    return { ok: true };
  });
  app.get('/__source-gate', (request) => {
    const target = new URL(request.url, `http://127.0.0.1:${port}`).searchParams.get('target') ?? latestGate;
    const current = target ? gates.get(target) : undefined;
    return { target: current?.target ?? null, entered: current?.entered ?? false, released: current?.released ?? false, completed: current?.completed ?? false };
  });
  app.addHook('preClose', async () => { for (const current of gates.values()) current.release(); });
  async function hold(target: GateTarget): Promise<boolean> {
    const current = gates.get(target);
    if (!current || current.entered) return false;
    current.entered = true;
    await current.promise;
    current.completed = true;
    return true;
  }
  app.addHook('onRequest', async (request) => {
    if ((request.routeOptions.url?.startsWith('/repos/') || request.routeOptions.url?.startsWith('/user/installations')) && settings().sourceDelayMs > 0) {
      await delay(settings().sourceDelayMs);
    }
  });
  const canonicalName = (owner: string, name: string) =>
    settings().sourceRepositoryRenamed && owner === 'alice' && name === 'renamed-project' ? 'project' : name;
  const repo = (owner: string, name: string) => ({ id: `raw:${(name === 'outside' ? 9007199254740997n : owner === 'alice' ? 9007199254740993n : owner === 'bob' ? 9007199254741101n : 9007199254741201n) + (name === 'other' ? 2n : 0n)}`,
    node_id: `R_${owner}_${canonicalName(owner, name)}`, name, owner: { login: owner }, private: name !== 'outside' });
  const issue = (owner: string, name: string, number: number, pull = false) => ({ id: `raw:${9007199254741001n + BigInt(number) + (name === 'other' ? 2000n : 0n) + (owner === 'alice' ? 0n : owner === 'bob' ? 10000n : 20000n)}`,
    node_id: `${pull ? 'PR' : 'I'}_${owner}_${canonicalName(owner, name)}_${number}`, number, title: settings().sourceCardLayout && number === 2 ? 'Tighten card spacing' : settings().sourceCardLayout && number === 5 ? 'Keep board titles readable with project fields and labels visible' : number === 1
      ? `${owner} ${name === 'outside' ? 'public' : 'private'} issue — ${'Long complete title, with accessible full details. '.repeat(8)}` : `${pull ? 'Pull request' : 'Issue'} ${number}`,
    body: settings().sourceCardLayout && number === 5 ? '' : `## ${pull ? 'Pull request summary' : 'Issue description'}\n\nInvestigate the board loading behaviour.\n\n- [ ] Preserve cached content\n- [x] Keep the canvas usable\n\n**Expected result:** preserve \`cached_body\`. Read the [issue guide](https://example.com/guide). [Unsafe link](javascript:alert(1))\n\n| Field | Value |\n| --- | --- |\n| State | Ready |\n\n\`\`\`text\n${'long_identifier_'.repeat(12)}\n\`\`\`\n\n<script>window.fixtureBodyExecuted = true</script>\n<img src=x onerror="window.fixtureBodyExecuted = true">`,
    state: pull ? 'closed' : 'open', state_reason: pull ? null : 'reopened',
    ...(pull ? { pull_request: { url: `http://127.0.0.1:${port}/repos/${owner}/${name}/pulls/${number}` } } : {}),
    labels: settings().sourceCardLayout && number === 2 ? [] : Array.from({ length: 8 }, (_, index) => ({ name: settings().sourceCardLayout && index === 0 && (number === 1 || number === 5) ? number === 1 ? 'bug' : 'enhancement' : `Label ${index + 1} ${'extended '.repeat(4)}` })),
    assignees: [{ login: owner }, { login: 'another-contributor' }], created_at: '2026-01-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', closed_at: pull ? '2026-11-01T00:00:00Z' : null });
  const raw = (reply: FastifyReply, value: unknown) => reply.type('application/json').send(JSON.stringify(value).replace(/"raw:([0-9]+)"/g, '$1'));
  function authorize(request: FastifyRequest, reply: FastifyReply, checkDenial = true): number | null {
    const user = identity(request);
    if (!user) { void reply.code(401).send({ message: 'Controlled unauthorized' }); return null; }
    requests.push({ user, path: request.url });
    if (settings().sourceSsoRequired && (!settings().sourceSsoPath || request.url.split('?')[0] === settings().sourceSsoPath)) {
      void reply.header('X-GitHub-SSO', 'required; url=https://example.invalid/private-sso-token').code(403).send({ message: 'Controlled private SSO payload' });
      return null;
    }
    if (checkDenial && settings().sourceDenied) { void reply.code(settings().sourceDenialStatus).send({ message: 'Controlled missing approval' }); return null; }
    return user;
  }
  function next(reply: FastifyReply, request: FastifyRequest, page: number, hasNext: boolean): void {
    if (!hasNext) return;
    const url = new URL(request.url, `http://127.0.0.1:${port}`);
    url.searchParams.set('page', String(page + 1)); url.searchParams.set('per_page', '30');
    if (settings().sourceMode === 'untrusted-link') url.host = 'example.invalid';
    reply.header('Link', `<${url.href}>; rel="next"`);
  }
  app.post('/graphql', (request, reply) => {
    const user = authorize(request, reply); if (!user) return reply;
    const body = request.body;
    if (typeof body !== 'object' || body === null || !('variables' in body) || typeof body.variables !== 'object' || body.variables === null || !('id' in body.variables) || typeof body.variables.id !== 'string') return reply.code(400).send({ errors: [{ message: 'Missing node' }] });
    const match = /^(I|PR)_([^_]+)_([^_]+)_([0-9]+)$/.exec(body.variables.id);
    const owner = match?.[2]; const name = match?.[3]; const number = Number(match?.[4]);
    if (!match || !owner || !name || (owner !== (user === 101 ? 'alice' : 'bob') && owner !== 'example-org')) return { data: { node: null } };
    const connection = (nodes: unknown[]) => ({ nodes, pageInfo: { hasNextPage: false } });
    const field = (id: string, name: string) => ({ id, name, dataType: id === 'F_weight' ? 'NUMBER' : id === 'F_sprint' ? 'ITERATION' : 'SINGLE_SELECT' });
    return { data: { node: {
      projectItems: connection([{ project: { id: `P_${owner}`, title: 'Delivery', fields: connection([field('F_status', 'Status'), field('F_weight', 'Estimate'), field('F_priority', 'Priority'), field('F_sprint', 'Iteration')]) },
        fieldValues: connection(settings().sourceCardLayout && number === 2 ? [] : [{ field: { id: 'F_status' }, name: number === 1 ? 'In progress' : 'Ready' }, { field: { id: 'F_weight' }, number: number === 1 ? 0 : 3 }, { field: { id: 'F_priority' }, name: 'High' }, { field: { id: 'F_sprint' }, title: 'Sprint 12' }]) }]),
      timelineItems: connection(number === 1 ? [{ source: { url: `https://github.com/${owner}/${name}/pull/2` } }] : []),
      ...(match[1] === 'PR' ? { closingIssuesReferences: connection([{ url: `https://github.com/${owner}/${name}/issues/1` }]) } : {}),
    } } };
  });
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
  app.get<{ Params: { id: string } }>('/user/installations/:id/repositories', async (request, reply) => {
    const user = authorize(request, reply); if (!user) return reply;
    if (!['9007199254740993', '9007199254740995'].includes(request.params.id)) return reply.code(404).send({ message: 'Unknown installation' });
    const page = Number(new URL(request.url, `http://127.0.0.1:${port}`).searchParams.get('page') ?? '1');
    next(reply, request, page, page === 1);
    const own = user === 101 ? 'alice' : 'bob';
    const owner = request.params.id === '9007199254740995' ? 'example-org' : own;
    if (page === 2) await hold('repositories-page-2');
    return raw(reply, { total_count: 2, repositories: [repo(owner, page === 1 ? settings().sourceRepositoryRenamed && owner === 'alice' ? 'renamed-project' : 'project' : 'other')] });
  });
  app.get<{ Params: { owner: string; name: string } }>('/repos/:owner/:name', async (request, reply) => {
    const denied = settings().sourceDenied; const denialStatus = settings().sourceDenialStatus;
    const user = authorize(request, reply, false); if (!user) return reply;
    if (denied) {
      await hold('repository-denial');
      return reply.code(denialStatus).send({ message: 'Controlled missing approval' });
    }
    const { owner, name } = request.params;
    if (owner === 'missing' || (name !== 'outside' && owner !== (user === 101 ? 'alice' : 'bob') && owner !== 'example-org')) return reply.code(404).send({ message: 'Private access denied' });
    if (owner === 'approval') return reply.code(403).send({ message: 'Organization approval required' });
    if (settings().sourceRepositoryRenamed && owner === 'alice' && name === 'project') {
      return reply.code(301).header('Location', `http://127.0.0.1:${port}/repos/alice/renamed-project`).send();
    }
    return raw(reply, repo(owner, name));
  });
  app.get<{ Params: { owner: string; name: string } }>('/repos/:owner/:name/issues', async (request, reply) => {
    if (!authorize(request, reply)) return reply;
    const page = Number(new URL(request.url, `http://127.0.0.1:${port}`).searchParams.get('page') ?? '1');
    if (page === settings().sourceFailurePage) return reply.code(503).send({ message: 'Controlled failed page' });
    if (page === settings().sourceThrottlePage) return reply.header('Retry-After', '1').header('X-RateLimit-Remaining', '4999').code(403).send({ message: 'Controlled secondary rate limit' });
    if (page === 2 && await hold('old-token-401')) return reply.code(401).send({ message: 'Controlled delayed rejection' });
    if (settings().sourceMode === 'malformed') return [{ id: 2, title: 'Malformed row' }];
    if (settings().sourceMode === 'empty') return raw(reply, []);
    next(reply, request, page, page < 3);
    const { owner, name } = request.params;
    if (page === 2) await hold('items-page-2');
    return raw(reply, page === 1 ? [issue(owner, name, 1), issue(owner, name, 2, true)]
      : page === 2 ? [issue(owner, name, 3, true), issue(owner, name, 4, true)] : [issue(owner, name, 5)]);
  });
  app.get<{ Params: { owner: string; name: string; number: string } }>('/repos/:owner/:name/issues/:number', async (request, reply) => {
    if (!authorize(request, reply)) return reply;
    const { owner, name, number } = request.params;
    if (settings().sourceDetailFailure) return reply.code(503).send({ message: 'Controlled unavailable item detail' });
    if (!await hold('issue-detail')) await hold('issue-detail-next');
    return raw(reply, issue(owner, name, Number(number), (Number(number) % 2 === 0 || Number(number) === 3)));
  });
  app.get<{ Params: { owner: string; name: string; number: string } }>('/repos/:owner/:name/pulls/:number', (request, reply) => {
    if (!authorize(request, reply)) return reply;
    if (settings().pullUnavailable) return reply.code(403).send({ message: 'PR enrichment unavailable' });
    const { owner, name, number } = request.params;
    return raw(reply, { id: 'raw:9007199254741999', node_id: `PR_${owner}_${canonicalName(owner, name)}_${number}`, number: Number(number), body: '## Pull request details\n\nThis change fixes cached board loading.\n\n```ts\nconst ready = true;\n```', state: 'closed', merged: true, draft: false, base: { repo: repo(owner, name) } });
  });
}
