import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { SessionResponse } from '../shared/session';
import type { Installation, RepositorySource, SourceItem } from '../shared/sources';
import { readInstallation, readRepository, readSourceItem, readSourcePage } from '../shared/sources';
import { githubItemUrl } from '../shared/items';
import './sources.css';

type SignedInSession = Extract<SessionResponse, { status: 'signed-in' }>;
class SourceReadError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}
interface SourceSessionProps { session: SignedInSession; onAccessLoss: (status: number) => void }
async function requestJson<T>(path: string, signal: AbortSignal, session: SignedInSession, decode: (value: unknown) => T, url?: string): Promise<T> {
  const response = await fetch(path, { signal, cache: 'no-store', ...(url === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify({ url }),
  }) });
  const value: unknown = await response.json();
  if (!response.ok) {
    const message = typeof value === 'object' && value !== null && 'message' in value && typeof value.message === 'string'
      ? value.message : 'This read could not be completed. Check your connection and retry.';
    throw new SourceReadError(response.status, message);
  }
  return decode(value);
}
const itemIdentity = (item: SourceItem) => item.reference.id;
const repositoryIdentity = (item: RepositorySource) => item.nodeId;
const installationIdentity = (item: Installation) => item.id;
function usePages<T>(path: string, session: SignedInSession, identify: (item: T) => string, decode: (value: unknown) => T, onAccessLoss: (status: number) => void) {
  const [items, setItems] = useState<T[]>([]);
  const [nextPage, setNextPage] = useState<number | null>(1);
  const [loadedPage, setLoadedPage] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [requested, setRequested] = useState({ page: 1, attempt: 0 });
  function load(page: number): void {
    if (busy) return;
    setBusy(true); setError('');
    setRequested((previous) => ({ page, attempt: previous.attempt + 1 }));
  }
  useEffect(() => {
    const active = new AbortController();
    const fetchPage = async (): Promise<void> => {
      try {
        const result = await requestJson(`${path}?page=${requested.page}`, active.signal, session, (value) => readSourcePage(value, decode));
        if (active.signal.aborted) return;
        setItems((previous) => {
          const merged = new Map(previous.map((item) => [identify(item), item]));
          for (const item of result.items) merged.set(identify(item), item);
          return [...merged.values()];
        });
        setNextPage(result.nextPage); setLoadedPage(requested.page);
      } catch (failure) {
        if (active.signal.aborted) return;
        const accessLost = failure instanceof SourceReadError && [401, 403, 404].includes(failure.status);
        if (accessLost) { setItems([]); setLoadedPage(0); setNextPage(1); onAccessLoss(failure.status); }
        const message = failure instanceof Error ? failure.message : 'Unable to load this page. Retry shortly.';
        setError(`${message} ${accessLost ? 'Previously loaded values were cleared. Retry from page 1 after restoring access.' : 'Already loaded results are retained and may be stale.'}`);
      } finally {
        if (!active.signal.aborted) setBusy(false);
      }
    };
    void fetchPage();
    return () => active.abort();
  }, [path, requested, session, identify, decode, onAccessLoss]);
  return { items, nextPage, loadedPage, busy, error, load };
}
interface ProgressProps { busy: boolean; error: string; loadedPage: number; nextPage: number | null; load: (page: number) => void }
function PageProgress({ busy, error, loadedPage, nextPage, load }: ProgressProps) {
  return <div className="source-progress">
    <p role="status">{busy ? `Loading page ${nextPage ?? 1}…` : loadedPage === 0 ? '' : nextPage === null ? `All pages loaded (${loadedPage}).` : `Loaded through page ${loadedPage}. More pages are available.`}</p>
    {error && <p className="auth-error" role="alert">{error} <a href="/api/auth/github">Reconnect GitHub</a> if your authorization ended.</p>}
    {nextPage !== null && <button type="button" disabled={busy} onClick={() => load(nextPage)}>{error ? `Retry page ${nextPage}` : loadedPage === 0 ? 'Load first page' : 'Load next page'}</button>}
  </div>;
}
function ItemDetails({ item }: { item: SourceItem }) {
  const value = item.metadata;
  const link = githubItemUrl(value.kind, value.locator);
  return <details className="source-details"><summary>View full available details</summary>
    <div className="source-full">
      <h4>{value.title}</h4>
      <dl><dt>Kind and state</dt><dd>{value.kind === 'issue' ? 'Issue' : 'Pull request'} · {value.state === 'unknown' ? 'PR state unknown — enrichment unavailable' : value.state}</dd>
        <dt>State reason</dt><dd>{value.stateReason ?? 'Not provided by GitHub'}</dd>
        <dt>Labels ({value.labels.length})</dt><dd>{value.labels.length ? <ul>{value.labels.map((label, index) => <li key={index}><bdi>{label}</bdi></li>)}</ul> : 'None'}</dd>
        <dt>Assignees ({value.assignees.length})</dt><dd>{value.assignees.length ? <ul>{value.assignees.map((login, index) => <li key={index}><bdi>{login}</bdi></li>)}</ul> : 'None'}</dd>
        <dt>Created / updated / closed</dt><dd>{value.createdAt ?? 'Unknown'} / {value.updatedAt ?? 'Unknown'} / {value.closedAt ?? 'Not closed or not provided'}</dd>
      </dl>
      {link && <a href={link} target="_blank" rel="noreferrer">Open {value.locator.owner}/{value.locator.repository} #{value.locator.number} on GitHub (new tab)</a>}
    </div>
  </details>;
}
function ItemRow({ item }: { item: SourceItem }) {
  const value = item.metadata;
  return <li className="source-item"><p className="source-locator"><bdi>{value.locator.owner}/{value.locator.repository} #{value.locator.number}</bdi> · {value.kind === 'issue' ? 'Issue' : 'Pull request'} · {value.state === 'unknown' ? 'State unknown' : value.state}</p>
    <h3 className="source-title">{value.title}</h3>
    <p className="source-preview">{value.labels.length} labels · {value.assignees.length} assignees. {value.labels.slice(0, 3).join(', ')}</p>
    <ItemDetails item={item} />
  </li>;
}
function RepositoryItems({ repository, session, onAccessLoss }: SourceSessionProps & { repository: RepositorySource }) {
  const pages = usePages(`/api/sources/repositories/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.name)}/items`, session, itemIdentity, readSourceItem, onAccessLoss);
  const [query, setQuery] = useState(''); const [kind, setKind] = useState('all');
  const matches = pages.items.filter((item) => (kind === 'all' || item.metadata.kind === kind)
    && `${item.metadata.title} ${item.metadata.locator.number}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <section aria-labelledby="source-items-heading"><h2 id="source-items-heading"><bdi>{repository.owner}/{repository.name}</bdi></h2>
    <p>Browse mixed issues and pull requests. Discovery does not add anything to a board.</p>
    <div className="source-filters"><label>Filter loaded titles or numbers<input type="search" value={query} onChange={(event) => setQuery(event.currentTarget.value)} /></label>
      <label>Kind in loaded results<select value={kind} onChange={(event) => setKind(event.currentTarget.value)}><option value="all">Issues and pull requests</option><option value="issue">Issues</option><option value="pull-request">Pull requests</option></select></label></div>
    <p className="source-subset" role="status">Showing {matches.length} of {pages.items.length} loaded items. This filters the loaded subset only, not the whole repository.</p>
    {!pages.busy && !pages.error && matches.length === 0 && <p>{pages.items.length
      ? 'No loaded items match. Clear the filter or load another page.'
      : pages.nextPage === null
        ? 'No issues or pull requests were returned. Browse another repository or resolve a URL below.'
        : 'No items returned on the loaded pages. Load the next page below to continue.'}</p>}
    {(query || kind !== 'all') && <button type="button" onClick={() => { setQuery(''); setKind('all'); }}>Clear filters</button>}
    <ul className="source-items">{matches.map((item) => <ItemRow key={item.reference.id} item={item} />)}</ul>
    <PageProgress {...pages} />
  </section>;
}
function Repositories({ installation, session, onSelect, onAccessLoss }: SourceSessionProps & { installation: Installation; onSelect: (repository: RepositorySource) => void }) {
  const pages = usePages(`/api/sources/installations/${installation.id}/repositories`, session, repositoryIdentity, readRepository, onAccessLoss);
  return <section aria-labelledby="repositories-heading"><h2 id="repositories-heading">Repositories for <bdi>{installation.owner}</bdi></h2>
    <p>Only repositories available to both your GitHub account and this app are listed.</p>
    {!pages.busy && !pages.items.length && !pages.error && <p>No authorized repositories here. Ask the owner to select repositories for the app and, for organizations, approve the installation. Then reload installations.</p>}
    <ul className="source-choices">{pages.items.map((repo) => <li key={repo.nodeId}><button type="button" onClick={() => onSelect(repo)}>Browse <bdi>{repo.owner}/{repo.name}</bdi> · {repo.private ? 'Private' : 'Public'}</button></li>)}</ul><PageProgress {...pages} />
  </section>;
}
function Installations({ session, onSelect, onAccessLoss }: SourceSessionProps & { onSelect: (installation: Installation) => void }) {
  const pages = usePages('/api/sources/installations', session, installationIdentity, readInstallation, onAccessLoss);
  return <section aria-labelledby="installations-heading"><h2 id="installations-heading">Authorized installations</h2>
    {!pages.busy && !pages.items.length && !pages.error && <p>No installations are available. Ask a repository owner to install the app, select repositories and request organization approval if needed. Then reload installations. You can still try a public item URL below.</p>}
    <ul className="source-choices">{pages.items.map((item) => <li key={item.id}><button type="button" onClick={() => onSelect(item)}><bdi>{item.owner}</bdi> · {item.ownerType === 'Organization' ? 'Organization' : 'Personal'} · {item.repositorySelection === 'all' ? 'All repositories' : 'Selected repositories'}{item.suspended ? ' · Installation suspended' : ''}</button></li>)}</ul><PageProgress {...pages} />
  </section>;
}
export function SourceBrowser({ session }: { session: SignedInSession }) {
  const [installation, setInstallation] = useState<Installation | null>(null);
  const [repository, setRepository] = useState<RepositorySource | null>(null);
  const [generation, setGeneration] = useState(0);
  const [url, setUrl] = useState(''); const [resolved, setResolved] = useState<SourceItem | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [authorizationLost, setAuthorizationLost] = useState(false);
  const loseAccess = useCallback((status: number): void => {
    controller.current?.abort(); setBusy(false); setResolved(null);
    if (status === 401) { setAuthorizationLost(true); setInstallation(null); setRepository(null); }
  }, []);
  useEffect(() => () => controller.current?.abort(), []);
  async function resolve(): Promise<void> {
    controller.current?.abort(); const active = new AbortController(); controller.current = active;
    setBusy(true); setError(''); setResolved(null);
    try { const item = await requestJson('/api/sources/resolve', active.signal, session, readSourceItem, url); if (!active.signal.aborted) setResolved(item); }
    catch (failure) {
      if (!active.signal.aborted) {
        if (failure instanceof SourceReadError && [401, 403, 404].includes(failure.status)) loseAccess(failure.status);
        setError(failure instanceof Error ? failure.message : 'Unable to resolve this URL. Check it and retry.');
      }
    }
    finally { if (!active.signal.aborted) setBusy(false); }
  }
  function navigate(action: () => void): void { action(); heading.current?.focus(); }
  let browsing: ReactNode;
  if (authorizationLost) browsing = <p className="auth-error" role="alert">Your GitHub authorization or session ended. Loaded source values were cleared. <a href="/api/auth/github">Reconnect GitHub</a> to resume browsing.</p>;
  else if (repository) browsing = <RepositoryItems key={`${session.user.id}:${repository.nodeId}`} repository={repository} session={session} onAccessLoss={loseAccess} />;
  else if (installation) browsing = <Repositories key={`${session.user.id}:${installation.id}`} installation={installation} session={session} onAccessLoss={loseAccess} onSelect={(repo) => navigate(() => setRepository(repo))} />;
  else browsing = <Installations key={`${session.user.id}:${generation}`} session={session} onAccessLoss={loseAccess} onSelect={(item) => navigate(() => setInstallation(item))} />;
  return <section className="source-browser runtime-panel" aria-labelledby="sources-heading">
    <h2 id="sources-heading" ref={heading} tabIndex={-1}>Browse GitHub sources</h2>
    <p>Sign-in identifies you; it does not install the app or approve organization access. A repository owner must install the app and select private repositories. An organization may also need to approve it.</p>
    <p>Public issue and pull request URLs can be available even when their repository is not an installed source. URL access does not imply installation or webhook coverage.</p>
    {!authorizationLost && <div className="source-navigation">
      {(installation || repository) && <button type="button" onClick={() => navigate(() => { if (repository) setRepository(null); else setInstallation(null); })}>{repository ? 'Back to repositories' : 'Back to installations'}</button>}
      <button type="button" onClick={() => navigate(() => { setRepository(null); setInstallation(null); setGeneration((value) => value + 1); })}>Reload installations</button>
      <a href="https://github.com/settings/installations" target="_blank" rel="noreferrer">Manage GitHub installations (new tab)</a>
    </div>}
    {browsing}
    {!authorizationLost && <section className="source-url" aria-labelledby="resolve-heading"><h2 id="resolve-heading">Resolve an issue or pull request URL</h2>
      <form onSubmit={(event) => { event.preventDefault(); void resolve(); }}>
        <label htmlFor="source-url">GitHub item URL</label><p id="source-url-hint">Use https://github.com/owner/repository/issues/123 or /pull/123, without a query or fragment. Public and authorized private items are supported.</p>
        <input id="source-url" name="url" type="url" required value={url} aria-describedby={`source-url-hint${error ? ' source-url-error' : ''}`} aria-invalid={error ? true : undefined} onChange={(event) => setUrl(event.currentTarget.value)} placeholder="https://github.com/octo/project/issues/123" />
        <button type="submit" disabled={busy}>Resolve URL</button>
      </form>
      <p role="status">{busy ? 'Resolving GitHub URL…' : resolved ? 'Item resolved. No canvas placement was created.' : ''}</p>
      {error && <p id="source-url-error" className="auth-error" role="alert">{error} <a href="/api/auth/github">Reconnect GitHub</a> if needed, then retry.</p>}
      {resolved && <ul className="source-items"><ItemRow item={resolved} /></ul>}
    </section>}
  </section>;
}
