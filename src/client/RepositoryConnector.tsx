import { useEffect, useRef, useState } from 'react';
import type { SessionResponse } from '../shared/session';
import { isSessionContextFailure } from '../shared/session';
import { readInstallation, readSourceItem, readRepository, readRepositoryLocator, readSourcePage, type SourceItem, type RepositorySource, type SourcePage, type Installation } from '../shared/sources';
import type { SourceFilter } from '../shared/incoming';
import { requestJson, SourceReadError } from './sourceRequest';
import { Icon } from './Icon';

interface Props {
  session: Extract<SessionResponse, { status: 'signed-in' }>;
  onConnect: (repository: RepositorySource, filter: SourceFilter) => void;
  onAccessLoss: (scope?: string) => void;
  onAddItem: (item: SourceItem) => void;
  connected: readonly { repositoryNodeId: string; owner: string; repository: string }[];
}
/** A mounted, account-owned catalogue; opening the menu never starts from scratch. */
export function RepositoryConnector({ session, onConnect, onAccessLoss, onAddItem, connected }: Props) {
  const [repos, setRepos] = useState<RepositorySource[]>([]);
  const [recent, setRecent] = useState<{ owner: string; name: string }[]>([]);
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('source') ?? '');
  const [item, setItem] = useState<SourceItem | null>(null);
  const [selected, setSelected] = useState<RepositorySource | null>(null);
  const [filter, setFilter] = useState<SourceFilter>({ state: 'open', kind: 'all', label: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const access = useRef(onAccessLoss);
  useEffect(() => { access.current = onAccessLoss; }, [onAccessLoss]);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      setBusy(true); setError(''); setRepos([]);
      try {
        const shortcuts = await requestJson('/api/sources/recent-repositories', controller.signal, session, (value) => readSourcePage(value, readRepositoryLocator));
        if (!controller.signal.aborted) setRecent(shortcuts.items);
        let page: number | null = 1;
        while (page !== null && !controller.signal.aborted) {
          const installations: SourcePage<Installation> = await requestJson(`/api/sources/installations?page=${page}`, controller.signal, session, (value) => readSourcePage(value, readInstallation));
          for (const installation of installations.items) {
            if (installation.suspended) continue;
            let cursor: number | null = 1;
            while (cursor !== null && !controller.signal.aborted) {
              const result: SourcePage<RepositorySource> = await requestJson(`/api/sources/installations/${installation.id}/repositories?page=${cursor}`, controller.signal, session, (value) => readSourcePage(value, readRepository));
              if (controller.signal.aborted) return;
              setRepos((previous) => [...new Map([...previous, ...result.items].map((repo) => [repo.nodeId, repo])).values()]);
              cursor = result.nextPage;
            }
          }
          page = installations.nextPage;
        }
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (failure instanceof SourceReadError && isSessionContextFailure(failure.status, failure.code)) { setRepos([]); setRecent([]); access.current(); }
        setError(failure instanceof Error ? failure.message : 'Could not load repositories. Retry.');
      } finally { if (!controller.signal.aborted) setBusy(false); }
    };
    void load();
    return () => controller.abort();
  }, [session, attempt]);
  useEffect(() => {
    const value = query.trim().replace(/^https:\/\/github.com\//, '').replace(/\/$/, '');
    if (!/^[\w-]+\/[\w.-]+$/.test(value)) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      requestJson('/api/sources/repositories/resolve', controller.signal, session, readRepository, value).then((repo) => {
        if (!controller.signal.aborted) setRepos((previous) => [...new Map([...previous, repo].map((item) => [item.nodeId, item])).values()]);
      }).catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        if (failure instanceof SourceReadError && isSessionContextFailure(failure.status, failure.code)) access.current();
        else if (failure instanceof SourceReadError && (failure.status === 403 || failure.status === 404)) { access.current(value.toLowerCase()); setRepos((previous) => previous.filter((repo) => `${repo.owner}/${repo.name}`.toLowerCase() !== value.toLowerCase())); setSelected(null); }
        setError(failure instanceof Error ? failure.message : 'Repository lookup failed. Retry.');
      });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, session, attempt]);
  useEffect(() => {
    if (!/^https:\/\/github\.com\/[^/]+\/[^/]+\/(issues|pull)\/[1-9][0-9]*\/?$/.test(query.trim())) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      requestJson('/api/sources/resolve', controller.signal, session, readSourceItem, query.trim()).then((result) => {
        if (!controller.signal.aborted) setItem(result);
      }).catch((failure: unknown) => {
        if (controller.signal.aborted) return;
        if (failure instanceof SourceReadError && isSessionContextFailure(failure.status, failure.code)) access.current();
        if (failure instanceof SourceReadError && (failure.status === 403 || failure.status === 404)) { const parts = new URL(query.trim()).pathname.split('/'); access.current(`${parts[1]}/${parts[2]}`.toLowerCase()); }
        setItem(null); setError(failure instanceof Error ? failure.message : 'Could not load this item. Retry.');
      });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, session, attempt]);
  const normalized = query.toLowerCase().replace('https://github.com/', '');
  const matches = repos.filter((repo) => `${repo.owner}/${repo.name}`.toLowerCase().includes(normalized)).sort((a, b) => {
    const rank = (repo: RepositorySource) => recent.findIndex((item) => item.owner === repo.owner && item.name === repo.name);
    return (rank(a) < 0 ? 99 : rank(a)) - (rank(b) < 0 ? 99 : rank(b));
  });
  return <div className="repository-connector">
    <input type="search" aria-label="Search repositories" placeholder="Search repositories or paste a URL…" value={query} onChange={(event) => { setQuery(event.currentTarget.value); setError(''); setSelected(null); setItem(null); }} />
    {error && <div role="alert"><p>{error}</p><button type="button" onClick={() => setAttempt(attempt + 1)}>Retry</button></div>}
    {item && <section className="repository-preview"><h3>{item.metadata.title}</h3><p>{item.metadata.kind} #{item.metadata.locator.number} · {item.metadata.state}</p><button type="button" onClick={() => onAddItem(item)}>Add to Incoming</button></section>}
    {selected ? <section className="repository-preview"><button type="button" onClick={() => setSelected(null)}>← Repositories</button><h3>{selected.owner}/{selected.name}</h3>
      <label>State<select aria-label="State" value={filter.state} onChange={(event) => setFilter({ ...filter, state: event.currentTarget.value === 'open' ? 'open' : 'all' })}><option value="open">Open</option><option value="all">All states</option></select></label>
      <label>Kind<select aria-label="Kind" value={filter.kind} onChange={(event) => { const kind = event.currentTarget.value; if (kind === 'all' || kind === 'issue' || kind === 'pull-request') setFilter({ ...filter, kind }); }}><option value="all">Issues + PRs</option><option value="issue">Issues</option><option value="pull-request">Pull requests</option></select></label>
      <label>Label<input maxLength={1024} value={filter.label} onChange={(event) => setFilter({ ...filter, label: event.currentTarget.value })} /></label>
      <button type="button" className="board-primary" disabled={connected.some((entry) => entry.repositoryNodeId === selected.nodeId && entry.owner === selected.owner && entry.repository === selected.name)} onClick={() => { onConnect(selected, filter); setSelected(null); }}>Connect repository</button>
    </section> : <ul className="repository-results">{matches.map((repo) => <li key={repo.nodeId}><button type="button" onClick={() => setSelected(repo)}><Icon name="repo" /><span><strong>{repo.owner}/{repo.name}</strong><small>{connected.some((entry) => entry.repositoryNodeId === repo.nodeId) ? 'Connected' : repo.private ? 'Private' : 'Public'}</small></span><Icon name="plus" /></button></li>)}</ul>}
    <p role="status">{busy ? 'Loading repositories…' : !matches.length && !selected && !item ? 'No matching repositories.' : ''}</p>
  </div>;
}
