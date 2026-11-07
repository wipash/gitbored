import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { readItemContext } from '../../shared/planning';
import type { IncomingSource } from '../../shared/incoming';
import type { ItemMetadataState, WorkspaceMetadata } from '../../shared/items';
import { readRepository, readSourceItem, readSourcePage, type SourceItem } from '../../shared/sources';
import { BoardMetadataContext, cachedWorkspaceMetadata, loadCachedBoardMetadata } from './cachedBoardMetadata';
import { requestBoard, type BoardAuthority } from './boardRequest';
import { readSsoFailure, useSsoRecovery } from './useSsoRecovery';
import type { ConnectorRead } from '../RepositoryConnector';

interface BoardMetadataOptions {
  boardId: string;
  authority: BoardAuthority;
  references: string;
  placedIds: string;
  sources: readonly IncomingSource[];
  retrySources: (ids: ReadonlySet<string>) => void;
  onRecoveryRetry: () => void;
}

/** Cached and fetched metadata share one account-owned read lifetime, outside native history. */
export function useBoardMetadata({ boardId, authority, references, placedIds, sources, retrySources, onRecoveryRetry }: BoardMetadataOptions) {
  const bootstrap = useContext(BoardMetadataContext);
  const initialCache = bootstrap?.authority === authority ? bootstrap.value : { items: [] };
  const [batchAuthority, setBatchAuthority] = useState<BoardAuthority | null>(bootstrap?.authority === authority ? authority : null);
  const refreshReferences = useRef(new Set(initialCache.items.filter((entry) => entry.stale).map((entry) => entry.item.reference.id)));
  const refreshContexts = useRef(new Set(initialCache.items.filter((entry) => entry.contextStale).map((entry) => entry.item.reference.id)));
  const { failures: ssoFailures, update: reportSso } = useSsoRecovery(authority);
  const [ssoAttempt, setSsoAttempt] = useState(0);
  const [metadata, setMetadata] = useState<{ authority: BoardAuthority | null; values: WorkspaceMetadata }>(() => ({ authority, values: cachedWorkspaceMetadata(initialCache) }));
  const metadataRef = useRef(metadata.values);
  const [metadataAttempt, setMetadataAttempt] = useState(0);
  const authorityRef = useRef(authority);
  const deniedScopes = useRef(new Set<string>());
  const rejectedAuthority = useRef<BoardAuthority | null>(null);
  useLayoutEffect(() => { authorityRef.current = authority; }, [authority]);
  const canRead = useCallback((expected: BoardAuthority) => authorityRef.current === expected && rejectedAuthority.current !== expected
    && expected.ready && expected.session.authorization === 'ready', []);
  const publishMetadata = useCallback((next: WorkspaceMetadata, context: BoardAuthority | null) => { metadataRef.current = next; setMetadata({ authority: context, values: next }); }, []);
  const remember = useCallback((item: SourceItem) => {
    const scope = `${item.metadata.locator.owner}/${item.metadata.locator.repository}`.toLowerCase();
    if (!canRead(authority) || deniedScopes.current.has(scope)) return;
    const previous = metadataRef.current.get(item.reference.id);
    const context = previous?.status === 'ready' ? previous.item.context : undefined;
    const next = new Map(metadataRef.current); next.set(item.reference.id, { status: 'ready', item: { ...item.metadata, ...(context ? { context } : {}) }, refreshing: refreshContexts.current.has(item.reference.id) }); publishMetadata(next, authority);
  }, [authority, canRead, publishMetadata]);
  const accessLost = useCallback((scope?: string, ssoRequired = false) => {
    if (authorityRef.current !== authority) return;
    if (scope === undefined) {
      if (rejectedAuthority.current === authority) return;
      rejectedAuthority.current = authority;
      publishMetadata(new Map(), null);
      // Reuse account reconciliation and its existing request-abort lifetimes.
      // Reject this context synchronously, before its checking render can commit.
      void authority.reconcile();
      return;
    }
    const next = new Map(metadataRef.current);
    deniedScopes.current.add(scope);
    for (const [id, state] of next) {
      if (state.status === 'ready' && `${state.item.locator.owner}/${state.item.locator.repository}`.toLowerCase() === scope) next.set(id, { status: ssoRequired ? 'sso-required' : 'unavailable' });
    }
    publishMetadata(next, authority);
  }, [authority, publishMetadata]);
  useEffect(() => {
    if (!canRead(authority) || batchAuthority === authority) return;
    const controller = new AbortController();
    const load = async () => {
      const cache = await loadCachedBoardMetadata(boardId, authority, controller.signal);
      if (controller.signal.aborted || !canRead(authority)) return;
      refreshReferences.current = new Set(cache.items.filter((entry) => entry.stale).map((entry) => entry.item.reference.id));
      refreshContexts.current = new Set(cache.items.filter((entry) => entry.contextStale).map((entry) => entry.item.reference.id));
      deniedScopes.current.clear();
      publishMetadata(cachedWorkspaceMetadata(cache), authority);
      setBatchAuthority(authority);
    };
    void load();
    return () => controller.abort();
  }, [authority, batchAuthority, boardId, canRead, publishMetadata]);
  useEffect(() => {
    if (!canRead(authority) || batchAuthority !== authority) return;
    const controller = new AbortController();
    const currentRead = () => !controller.signal.aborted && canRead(authority);
    const placed = new Set(placedIds.split(','));
    const next = new Map<string, ItemMetadataState>();
    const ids: string[] = [];
    for (const id of references ? references.split(',') : []) {
      const value = metadataRef.current.get(id);
      const needsReference = value?.status !== 'ready' || refreshReferences.current.has(id)
        || value.item.kind === 'pull-request' && value.item.state === 'unknown';
      const needsContext = placed.has(id) && (value?.status !== 'ready' || !value.item.context || refreshContexts.current.has(id));
      if (needsReference) ids.push(id);
      next.set(id, value?.status === 'ready' ? { ...value, refreshing: needsReference || needsContext } : { status: 'loading' });
    }
    // Install the complete cached map before any provider request can complete.
    // oxlint-disable-next-line react/set-state-in-effect
    publishMetadata(next, authority);
    async function pool(values: string[], task: (id: string) => Promise<void>) {
      const cursor = { index: 0 };
      await Promise.all(Array.from({ length: Math.min(4, values.length) }, async () => {
        while (cursor.index < values.length && currentRead()) { const id = values[cursor.index++]; if (id) await task(id); }
      }));
    }
    function referenceFailed(id: string, denied: boolean, sso: boolean) {
      const updated = new Map(metadataRef.current);
      const previous = updated.get(id);
      if (denied && previous?.status === 'ready') {
        const scope = `${previous.item.locator.owner}/${previous.item.locator.repository}`.toLowerCase();
        deniedScopes.current.add(scope);
        for (const [key, value] of updated) if (value.status === 'ready' && `${value.item.locator.owner}/${value.item.locator.repository}`.toLowerCase() === scope) {
          updated.set(key, { status: sso ? 'sso-required' : 'unavailable' });
        }
      }
      updated.set(id, !denied && previous?.status === 'ready'
        ? { status: 'ready', item: { ...previous.item, freshness: 'stale' }, refreshing: false }
        : { status: sso ? 'sso-required' : denied ? 'unavailable' : 'error' });
      publishMetadata(updated, authority);
    }
    async function hydrateReference(id: string) {
      try {
        const response = await requestBoard(`/api/references/${encodeURIComponent(id)}${refreshReferences.current.has(id) ? '?refresh=1' : ''}`, authority, 'GET', undefined, controller.signal);
        const failure = await readSsoFailure(response);
        if (!currentRead()) return;
        reportSso({ kind: 'reference', id }, failure);
        if (!response.ok) { referenceFailed(id, response.status === 403 || response.status === 404, failure !== null); return; }
        const item = readSourceItem(await response.json());
        if (!currentRead() || item.reference.id !== id) return;
        refreshReferences.current.delete(id);
        remember(item);
      } catch { if (currentRead()) referenceFailed(id, false, false); }
    }
    async function hydrateContext(id: string) {
      try {
        const response = await requestBoard(`/api/references/${encodeURIComponent(id)}/context${refreshContexts.current.has(id) ? '?refresh=1' : ''}`, authority, 'GET', undefined, controller.signal);
        const failure = await readSsoFailure(response);
        if (!currentRead()) return;
        reportSso({ kind: 'context', id }, failure);
        const fetchedContext = response.ok ? readItemContext(await response.json()) : null;
        if (!currentRead()) return;
        // Another request may revoke this scope while the response body is read.
        const latest = metadataRef.current.get(id);
        if (latest?.status !== 'ready' || deniedScopes.current.has(`${latest.item.locator.owner}/${latest.item.locator.repository}`.toLowerCase())) return;
        const denied = response.status === 403 || response.status === 404;
        const context = fetchedContext ?? (denied || !latest.item.context
          ? { status: 'unavailable' as const, projects: [], related: [] } : latest.item.context);
        if (response.ok) refreshContexts.current.delete(id);
        const updated = new Map(metadataRef.current);
        updated.set(id, { status: 'ready', item: { ...latest.item, context, ...(!response.ok ? { freshness: 'stale' as const } : {}) }, refreshing: false });
        publishMetadata(updated, authority);
      } catch {
        if (!currentRead()) return;
        const latest = metadataRef.current.get(id);
        if (latest?.status !== 'ready') return;
        const updated = new Map(metadataRef.current);
        updated.set(id, { status: 'ready', item: { ...latest.item, freshness: 'stale' }, refreshing: false });
        publishMetadata(updated, authority);
      }
    }
    const hydrate = async () => {
      await pool(ids, hydrateReference);
      if (!currentRead()) return;
      const contextIds = [...placed].filter((id) => { const value = metadataRef.current.get(id); return value?.status === 'ready' && (!value.item.context || refreshContexts.current.has(id)); });
      await pool(contextIds, hydrateContext);
      if (!currentRead()) return;
      const settled = new Map(metadataRef.current);
      for (const [id, value] of settled) if (value.status === 'ready' && value.refreshing) settled.set(id, { ...value, refreshing: false });
      publishMetadata(settled, authority);
    };
    void hydrate();
    return () => controller.abort();
  }, [authority, batchAuthority, references, placedIds, metadataAttempt, canRead, publishMetadata, remember, reportSso]);
  useEffect(() => {
    const liveReferences = new Set(references.split(','));
    const livePlacements = new Set(placedIds.split(','));
    const liveSources = new Set(sources.map((source) => source.repositoryNodeId));
    for (const { read } of ssoFailures) {
      const removed = read.kind === 'reference' ? !liveReferences.has(read.id)
        : read.kind === 'context' ? !livePlacements.has(read.id)
          : read.kind === 'source' && !liveSources.has(read.id);
      // Removed canvas references no longer have a read that could clear this notice.
      // oxlint-disable-next-line react/set-state-in-effect
      if (removed) reportSso(read, null);
    }
  }, [references, placedIds, sources, ssoFailures, reportSso]);
  function retrySso() {
    if (!canRead(authority) || !ssoFailures.length) return;
    onRecoveryRetry();
    const next = new Map(metadataRef.current);
    for (const { read } of ssoFailures) {
      if (read.kind === 'reference') refreshReferences.current.add(read.id);
      if (read.kind === 'context') {
        const value = next.get(read.id);
        if (value?.status === 'ready') {
          refreshContexts.current.add(read.id);
          next.set(read.id, { ...value, refreshing: true });
        }
      }
    }
    deniedScopes.current.clear();
    retrySources(new Set(ssoFailures.filter(({ read }) => read.kind === 'source').map(({ read }) => read.id)));
    publishMetadata(next, authority);
    setMetadataAttempt((attempt) => attempt + 1);
    setSsoAttempt((attempt) => attempt + 1);
  }
  const retrySsoRef = useRef(retrySso);
  useLayoutEffect(() => { retrySsoRef.current = retrySso; });
  useEffect(() => {
    if (!ssoFailures.length) return;
    // One check on return from GitHub; no timer or background retry loop.
    const onFocus = () => { if (document.visibilityState === 'visible') retrySsoRef.current(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [ssoFailures.length]);
  const readReady = authority.ready && authority.session.authorization === 'ready' && metadata.authority === authority;
  async function readSource(source: IncomingSource, page: number, signal: AbortSignal) {
    if (signal.aborted || !canRead(authority)) return null;
    const scope = `${source.owner}/${source.repository}`.toLowerCase();
    deniedScopes.current.delete(scope);
    const response = await requestBoard(`/api/sources/repositories/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repository)}/items?page=${page}${metadataAttempt > 0 ? '&refresh=1' : ''}`, authority, 'GET', undefined, signal);
    if (signal.aborted || !canRead(authority)) return null;
    if (!response.ok) {
      const failure = await readSsoFailure(response);
      if (signal.aborted || !canRead(authority)) return null;
      reportSso({ kind: 'source', id: source.repositoryNodeId }, failure ? { owner: failure.owner ?? source.owner } : null);
      if (response.status === 403 || response.status === 404) accessLost(scope, failure !== null);
      throw new Error('Discovery failed');
    }
    reportSso({ kind: 'source', id: source.repositoryNodeId }, null);
    const payload: unknown = await response.json();
    if (typeof payload !== 'object' || payload === null || !('repository' in payload) || readRepository(payload.repository).nodeId !== source.repositoryNodeId) throw new Error('Source identity changed');
    const result = readSourcePage(payload, readSourceItem);
    if (signal.aborted || !canRead(authority)) return null;
    if (result.page !== page) throw new Error('Invalid discovery progress');
    return result;
  }
  function refresh() {
    if (!canRead(authority)) return false;
    deniedScopes.current.clear();
    refreshReferences.current = new Set(references.split(','));
    refreshContexts.current = new Set(placedIds.split(','));
    setMetadataAttempt((attempt) => attempt + 1);
    return true;
  }
  function retryUnavailable() {
    if (!canRead(authority)) return;
    deniedScopes.current.clear();
    for (const [id, value] of metadataRef.current) if (value.status !== 'ready' || value.item.freshness === 'stale') {
      refreshReferences.current.add(id); refreshContexts.current.add(id);
    }
    setMetadataAttempt((attempt) => attempt + 1);
  }
  return {
    values: readReady ? metadata.values : new Map<string, ItemMetadataState>(),
    readReady,
    isCurrent: () => canRead(authority),
    remember,
    readSource,
    refresh,
    retryUnavailable,
    recovery: {
      pending: ssoFailures.length > 0,
      owners: [...new Set(ssoFailures.map(({ owner }) => owner).filter((owner): owner is string => !!owner))],
      retry: retrySso,
    },
    connector: {
      onAccessLoss: accessLost,
      onSsoRequired: (owner?: string, key: ConnectorRead = 'catalogue') => reportSso({ kind: 'connector', id: key }, owner === undefined ? {} : { owner }),
      onSsoRecovered: (key: ConnectorRead = 'catalogue') => reportSso({ kind: 'connector', id: key }, null),
      retryAttempt: ssoAttempt,
    },
  };
}
export type BoardMetadata = ReturnType<typeof useBoardMetadata>;
