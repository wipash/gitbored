import { useEffect, useId, useRef, useState } from 'react';
import type { SessionResponse } from '../shared/session';
import { isSessionContextFailure } from '../shared/session';
import { readRepository, readRepositoryLocator, readSourcePage, type RepositorySource } from '../shared/sources';
import { requestJson, SourceReadError } from './sourceRequest';

type Session = Extract<SessionResponse, { status: 'signed-in' }>;
interface RepositoryFinderProps {
  session: Session;
  onSelect: (repository: RepositorySource) => void;
  onAccessLoss: (failure: SourceReadError, scope?: string) => void;
}
export function RepositoryFinder({ session, onSelect, onAccessLoss }: RepositoryFinderProps) {
  const id = useId();
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('source') ?? '');
  const [recent, setRecent] = useState<{ owner: string; name: string }[]>([]);
  const [recentError, setRecentError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const result = await requestJson('/api/sources/recent-repositories', controller.signal, session,
          (value) => readSourcePage(value, readRepositoryLocator));
        if (!controller.signal.aborted) { setRecent(result.items); setRecentError(''); }
      } catch (failure) {
        if (controller.signal.aborted) return;
        if (failure instanceof SourceReadError && isSessionContextFailure(failure.status, failure.code)) onAccessLoss(failure);
        setRecentError('Recent repositories could not be loaded. Retry, or enter a repository name above.');
      }
    };
    void load();
    return () => controller.abort();
  }, [session, onAccessLoss, attempt]);
  useEffect(() => () => request.current?.abort(), []);
  async function find(value: string) {
    if (busy) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setBusy(true); setError('');
    try {
      const repo = await requestJson('/api/sources/repositories/resolve', controller.signal, session, readRepository, value);
      if (controller.signal.aborted) return;
      setQuery(`${repo.owner}/${repo.name}`);
      setRecent((previous) => [{ owner: repo.owner, name: repo.name }, ...previous.filter((item) =>
        `${item.owner}/${item.name}`.toLowerCase() !== `${repo.owner}/${repo.name}`.toLowerCase())].slice(0, 8));
      onSelect(repo);
    } catch (failure) {
      if (controller.signal.aborted) return;
      if (failure instanceof SourceReadError && (isSessionContextFailure(failure.status, failure.code) || failure.status === 403 || failure.status === 404)) {
        // Attribute a denied lookup to the same repository as its existing cards.
        // The server has already validated this locator before contacting GitHub.
        const parts = value.trim().replace(/^https:\/\/github\.com\//, '').replace(/\/$/, '').split('/');
        onAccessLoss(failure, parts.length === 2 ? `${parts[0]}/${parts[1]}`.toLowerCase() : undefined);
      }
      setError(failure instanceof Error ? failure.message : 'The repository could not be found. Check its name and your GitHub access, then Find repository again.');
      input.current?.focus();
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }
  return <section className="repository-finder" aria-labelledby={`${id}-heading`}>
    <div><p className="eyebrow">Skip the repository list</p><h3 id={`${id}-heading`}>Find a repository</h3></div>
    <form onSubmit={(event) => { event.preventDefault(); void find(query); }}>
      <label htmlFor={`${id}-query`}>Repository name or URL</label>
      <div className="repository-search-row"><input ref={input} id={`${id}-query`} name="repository" type="search" required maxLength={512}
        placeholder="HolmesGroup/email-filer" value={query} autoComplete="off" spellCheck={false}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`} aria-invalid={error ? true : undefined}
        onChange={(event) => { setQuery(event.currentTarget.value); setError(''); }} />
        <button type="submit" className="source-primary" aria-disabled={busy}>{busy ? 'Finding…' : 'Find repository'}</button></div>
      <p id={`${id}-hint`} className="source-subset">Enter owner/repository or paste its GitHub URL. No paging required.</p>
    </form>
    <p className="repository-feedback" role="status">{busy ? 'Checking repository access…' : ''}</p>
    {error && <p id={`${id}-error`} className="auth-error" role="alert">{error}</p>}
    {recent.length > 0 && <div className="repository-recent"><h4>Recently used</h4><p className="source-subset">Available across your boards. Access is checked when opened.</p>
      <ul>{recent.map((repo) => <li key={`${repo.owner}/${repo.name}`}><button type="button" disabled={busy}
        onClick={() => { void find(`${repo.owner}/${repo.name}`); }}>Open <bdi>{repo.owner}/{repo.name}</bdi></button></li>)}</ul>
    </div>}
    {recentError && <div><p className="auth-error">{recentError}</p><button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry recent repositories</button></div>}
  </section>;
}
