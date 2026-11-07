import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { MAX_INCOMING_REFERENCES, type IncomingSource, type IncomingState, type SourceFilter } from '../../shared/incoming';
import type { RepositorySource, SourceItem } from '../../shared/sources';
import type { BoardAuthority } from './boardRequest';
import type { BoardMetadata } from './useBoardMetadata';

interface IncomingDiscoveryOptions {
  incoming: IncomingState;
  authority: BoardAuthority;
  metadata: BoardMetadata;
  commit: (update: (state: IncomingState) => IncomingState) => void;
  placedReferences: () => ReadonlySet<string>;
}

/** Source progress and queue acceptance commit together through the native board owner. */
export function useIncomingDiscovery({ incoming, authority, metadata, commit, placedReferences }: IncomingDiscoveryOptions) {
  const [message, announce] = useState('');
  const [error, setError] = useState('');
  const [busySource, setBusySource] = useState<string | null>(null);
  const loadingSource = useRef(false);
  const current = useRef(incoming);
  useLayoutEffect(() => { current.current = incoming; }, [incoming]);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); request.current = controller;
    // An authority replacement aborts the previous external discovery operation.
    // oxlint-disable-next-line react/set-state-in-effect
    setBusySource(null); loadingSource.current = false;
    return () => controller.abort();
  }, [authority]);
  async function discover(source: IncomingSource) {
    const signal = request.current?.signal;
    if (loadingSource.current || !metadata.isCurrent() || source.nextPage === null || !signal || signal.aborted) return;
    loadingSource.current = true;
    const page = source.nextPage;
    setBusySource(source.repositoryNodeId); setError('');
    commit((state) => ({ ...state, sources: state.sources.map((item) => item.repositoryNodeId === source.repositoryNodeId ? { ...item, status: 'loading' } : item) }));
    try {
      const result = await metadata.readSource(source, page, signal);
      if (!result || signal.aborted || !metadata.isCurrent()) return;
      const filter = source.filter;
      const eligible = result.items.filter((item) => !filter || (
        (filter.state === 'all' || item.metadata.sourceState === 'open' || item.metadata.state === 'open' || item.metadata.state === 'draft')
        && (filter.kind === 'all' || item.metadata.kind === filter.kind)
        && (!filter.label || item.metadata.labels.some((label) => label.toLowerCase().includes(filter.label.toLowerCase())))
      ));
      commit((state) => {
        const seen = new Set(state.seen);
        for (const item of eligible) seen.add(item.reference.id);
        if (seen.size > MAX_INCOMING_REFERENCES) throw new Error('Incoming is full');
        for (const item of eligible) metadata.remember(item);
        const known = new Set(state.seen); const placed = placedReferences(); const queue = [...state.queue];
        for (const item of eligible) if (!known.has(item.reference.id) && !placed.has(item.reference.id)) queue.push({ referenceId: item.reference.id, kind: item.reference.kind });
        return { ...state, queue, seen: [...seen], sources: state.sources.map((item) => item.repositoryNodeId === source.repositoryNodeId ? { ...item, loadedPage: page, nextPage: result.nextPage, status: result.nextPage === null ? 'complete' : 'partial' } : item) };
      });
      announce('');
    } catch {
      if (signal.aborted || !metadata.isCurrent()) return;
      commit((state) => ({ ...state, sources: state.sources.map((item) => item.repositoryNodeId === source.repositoryNodeId ? { ...item, status: 'error' } : item) }));
      setError('Could not load more cards. Check your connection and retry.');
    } finally {
      // A superseded read must not release the next authority's discovery lock.
      if (!signal.aborted) { loadingSource.current = false; setBusySource(null); }
    }
  }
  // Resume saved cursors and prefetch until the bounded source is exhausted.
  useEffect(() => {
    if (!metadata.readReady || busySource || loadingSource.current) return;
    const source = incoming.sources.find((entry) => entry.nextPage !== null && entry.status !== 'error');
    // Resuming a persisted cursor synchronizes with external GitHub reads.
    // oxlint-disable-next-line react/set-state-in-effect
    if (source) void discover(source);
  });
  function connect(repository: RepositorySource, filter: SourceFilter): boolean {
    if (!metadata.isCurrent()) return false;
    const existing = current.current.sources.find((source) => source.repositoryNodeId === repository.nodeId);
    commit((state) => {
      const selected = state.sources.find((source) => source.repositoryNodeId === repository.nodeId);
      if (selected) return selected.owner === repository.owner && selected.repository === repository.name ? state : {
        ...state, sources: state.sources.map((source) => source.repositoryNodeId === repository.nodeId ? { ...source, owner: repository.owner, repository: repository.name } : source),
      };
      return { ...state, sources: [...state.sources, { repositoryNodeId: repository.nodeId, owner: repository.owner, repository: repository.name, nextPage: 1, loadedPage: 0, status: 'idle', filter }] };
    });
    announce(`${repository.owner}/${repository.name} connected to this board.`);
    if (!existing) void discover({ repositoryNodeId: repository.nodeId, owner: repository.owner, repository: repository.name, nextPage: 1, loadedPage: 0, status: 'idle', filter });
    return true;
  }
  function add(item: SourceItem): boolean {
    if (!metadata.isCurrent()) return false;
    metadata.remember(item);
    const candidate = { referenceId: item.reference.id, kind: item.reference.kind };
    if (placedReferences().has(candidate.referenceId)) { announce('Already on this board.'); return false; }
    if (current.current.seen.length >= MAX_INCOMING_REFERENCES && !current.current.seen.includes(candidate.referenceId)) {
      setError('This board has reached its card limit. Use another board.'); return false;
    }
    commit((state) => state.queue.some((entry) => entry.referenceId === candidate.referenceId) ? state : {
      ...state, queue: [...state.queue, candidate], seen: state.seen.includes(candidate.referenceId) ? state.seen : [...state.seen, candidate.referenceId],
    });
    announce('Added to Incoming.');
    return true;
  }
  function disconnect(repositoryNodeId: string) {
    commit((state) => ({ ...state, sources: state.sources.filter((entry) => entry.repositoryNodeId !== repositoryNodeId) }));
  }
  function refresh() {
    if (!metadata.refresh()) return;
    commit((state) => ({ ...state, sources: state.sources.map((source) => ({ ...source, nextPage: 1, loadedPage: 0, status: 'idle' })) }));
  }
  return { message, announce, error, busySource, connect, add, disconnect, refresh, retry: discover };
}
export type IncomingDiscovery = ReturnType<typeof useIncomingDiscovery>;
