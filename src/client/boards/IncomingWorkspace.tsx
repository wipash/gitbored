import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createShapeId, useEditor, type Editor, type TLShapeId } from 'tldraw';
import type { Board } from '../../shared/boards';
import { type IncomingCandidate, type IncomingState, type SourceFilter } from '../../shared/incoming';
import type { WorkspaceMetadata } from '../../shared/items';
import { ITEM_CARD_TYPE, type NativeDocument } from '../../shared/nativeDocument';
import { type RepositorySource, type SourceItem } from '../../shared/sources';
import { SsoRecoveryNotice } from '../SsoRecoveryNotice';
import { useBoardMetadata, type BoardMetadata } from './useBoardMetadata';
import { useIncomingDiscovery, type IncomingDiscovery } from './useIncomingDiscovery';
import { RepositoryConnector } from '../RepositoryConnector';
import { captureNativeDocument, NativeWorkspace } from '../workspace/NativeWorkspace';
import { Icon } from '../Icon';
import { itemStateLabel, describeItem } from '../workspace/metadata';
import { type BoardAuthority } from './boardRequest';
import type { SaveCoordinator } from './saveCoordinator';
import './incoming.css';
import { useWorkspacePanel } from '../workspace/panels';
import { usePanelClearance } from '../workspace/usePanelClearance';

interface PlacementHistory { candidate: IncomingCandidate; shapeId: TLShapeId }
interface WorkspaceModel {
  incoming: IncomingState;
  metadata: WorkspaceMetadata;
  authority: BoardAuthority;
  readReady: boolean;
  place: (candidate: IncomingCandidate, point?: { x: number; y: number }) => boolean;
  undo: () => void;
  placeMany: (candidates: IncomingCandidate[]) => number;
  discovery: IncomingDiscovery;
  retryMetadata: () => void;
  connector: BoardMetadata['connector'];
}
function placedReferences(document: NativeDocument): Set<string> {
  const result = new Set<string>();
  for (const record of Object.values(document.snapshot.store)) {
    if (record.typeName === 'shape' && record.type === ITEM_CARD_TYPE) result.add(record.props.referenceId);
  }
  return result;
}
/** One native editor/coordinator lifetime; metadata and Incoming never enter SDK history. */
export function IncomingWorkspace({ board, authority, coordinator, theme, noticeHost }: { noticeHost: HTMLDivElement | null; board: Board; authority: BoardAuthority; coordinator: SaveCoordinator; theme: 'light' | 'dark' }) {
  const restoreSsoFocus = useRef(false);
  const [sourceHost, setSourceHost] = useState<HTMLDivElement | null>(null);
  const [incoming, setIncoming] = useState(board.incoming);
  const current = useRef(board.incoming);
  const editorRef = useRef<Editor | null>(null);
  const documentRef = useRef(board.document);
  const [placedIds, setPlacedIds] = useState(() => [...placedReferences(board.document)].sort().join(','));
  const documentSerialization = useRef<string | null>(null);
  const history = useRef(new Map<string, PlacementHistory>());
  const [references, setReferences] = useState(() => [...new Set([...placedReferences(board.document), ...board.incoming.queue.map((candidate) => candidate.referenceId)])].sort((a, b) => a.localeCompare(b)).join(','));
  const authorityRef = useRef(authority);
  useLayoutEffect(() => { authorityRef.current = authority; }, [authority]);
  const save = useCallback((document: NativeDocument, next: IncomingState) => {
    const placed = placedReferences(document);
    // Native history can restore a deleted placement after explicit requeue, even
    // when that placement predates this editor's first-placement provenance.
    const queue = next.queue.filter((candidate) => !placed.has(candidate.referenceId));
    const consistent = queue.length === next.queue.length ? next : { ...next, queue };
    const serialized = JSON.stringify(document);
    documentSerialization.current ??= JSON.stringify(documentRef.current);
    // Checkpoints can precede the SDK's deferred notification. Equal native
    // redelivery is not another edit, but a real Incoming operation still is.
    if (consistent === current.current && serialized === documentSerialization.current) return;
    documentSerialization.current = serialized;
    documentRef.current = document;
    setPlacedIds([...placed].sort().join(','));
    current.current = consistent;
    setIncoming(consistent);
    setReferences([...new Set([...placed, ...consistent.queue.map((candidate) => candidate.referenceId)])].sort((a, b) => a.localeCompare(b)).join(','));
    coordinator.change(document, consistent);
  }, [coordinator]);
  const commit = useCallback((update: (state: IncomingState) => IncomingState) => {
    const next = update(current.current);
    if (next === current.current) return;
    save(editorRef.current ? captureNativeDocument(editorRef.current) : documentRef.current, next);
  }, [save]);
  const onDocumentChange = useCallback((document: NativeDocument) => { save(document, current.current); }, [save]);
  const onNativeHistory = useCallback((editor: Editor, direction: 'undo' | 'redo') => {
    const document = captureNativeDocument(editor);
    let next = current.current;
    const placed = placedReferences(document);
    for (const { candidate, shapeId } of history.current.values()) {
      const existed = documentRef.current.snapshot.store[shapeId] !== undefined;
      const exists = document.snapshot.store[shapeId] !== undefined;
      const queued = next.queue.some((item) => item.referenceId === candidate.referenceId);
      if (direction === 'undo' && existed && !exists && !placed.has(candidate.referenceId) && !queued) next = { ...next, queue: [...next.queue, candidate] };
    }
    save(document, next);
  }, [save]);
  const mount = useCallback((editor: Editor) => {
    editorRef.current = editor;
    const releaseCheckpoint = coordinator.setCheckpoint(() => {
      save(captureNativeDocument(editor), current.current);
    });
    return () => { releaseCheckpoint(); editorRef.current = null; history.current.clear(); };
  }, [coordinator, save]);
  const retrySources = useCallback((ids: ReadonlySet<string>) => {
    commit((state) => ({ ...state, sources: state.sources.map((source) => ids.has(source.repositoryNodeId) ? { ...source, status: 'idle' } : source) }));
  }, [commit]);
  const metadata = useBoardMetadata({ boardId: board.id, authority, references, placedIds, sources: incoming.sources, retrySources,
    onRecoveryRetry: () => { restoreSsoFocus.current = !!noticeHost?.contains(document.activeElement); },
  });
  const discovery = useIncomingDiscovery({ incoming, authority, metadata, commit,
    placedReferences: () => placedReferences(editorRef.current ? captureNativeDocument(editorRef.current) : documentRef.current),
  });
  useLayoutEffect(() => {
    if (!metadata.recovery.pending && restoreSsoFocus.current) {
      restoreSsoFocus.current = false;
      if (document.activeElement === document.body) {
        editorRef.current?.getContainer().focus({ preventScroll: true });
        editorRef.current?.focus();
      }
    }
  }, [metadata.recovery.pending]);
  function placeMany(candidates: IncomingCandidate[], point?: { x: number; y: number }): number {
    const editor = editorRef.current;
    if (!editor || !authorityRef.current.ready) return 0;
    const placed = placedReferences(captureNativeDocument(editor));
    const queued = new Set(current.current.queue.map((entry) => entry.referenceId));
    const items = candidates.filter((candidate) => queued.has(candidate.referenceId) && !placed.has(candidate.referenceId));
    if (!items.length) return 0;
    editor.complete(); editor.setCurrentTool('select');
    const viewport = editor.getViewportPageBounds();
    let receivingY = viewport.y + 100 / editor.getZoomLevel();
    for (const shape of editor.getCurrentPageShapes()) {
      const bounds = editor.getShapePageBounds(shape);
      if (bounds) receivingY = Math.max(receivingY, bounds.maxY + 24);
    }
    const startX = viewport.x + 40 / editor.getZoomLevel();
    const columns = Math.max(1, Math.floor((viewport.w - 440 / editor.getZoomLevel()) / 304));
    editor.markHistoryStoppingPoint('incoming-placement');
    editor.run(() => {
      items.forEach((candidate, index) => {
        const id = createShapeId();
        editor.createShape({ id, type: ITEM_CARD_TYPE,
          ...(point ? { x: point.x, y: point.y } : { x: startX + (index % columns) * 304, y: receivingY + Math.floor(index / columns) * 224, parentId: editor.getCurrentPageId() }),
          props: { version: 1, referenceId: candidate.referenceId, kind: candidate.kind, w: 280, h: 200 } });
        history.current.set(candidate.referenceId, { candidate, shapeId: id });
      });
    });
    const added = new Set(items.map((item) => item.referenceId));
    commit((state) => ({ ...state, queue: state.queue.filter((item) => !added.has(item.referenceId)) }));
    return items.length;
  }
  function place(candidate: IncomingCandidate, point?: { x: number; y: number }): boolean {
    return placeMany([candidate], point) > 0;
  }
  const model: WorkspaceModel = {
    undo: () => { const editor = editorRef.current; if (editor) { editor.undo(); onNativeHistory(editor, 'undo'); } },
    incoming, metadata: metadata.values, authority, readReady: metadata.readReady, place, placeMany, discovery,
    retryMetadata: metadata.retryUnavailable, connector: metadata.connector,
  };
  return <>{noticeHost && metadata.recovery.pending && createPortal(<SsoRecoveryNotice owners={metadata.recovery.owners} onRetry={metadata.recovery.retry} />, noticeHost)}<div ref={setSourceHost} className="board-source-host" data-native-ui="sources" />
    <div className="board-canvas"><NativeWorkspace preferenceKey={`${authority.session.user.id}:${board.id}`} planning={incoming.planning} onPlanningChange={(planning) => commit((state) => ({ ...state, planning }))} initialDocument={board.document} metadata={model.metadata} theme={theme} onDocumentChange={onDocumentChange} onNativeHistory={onNativeHistory} onMount={mount}><IncomingTray model={model} sourceHost={sourceHost} /></NativeWorkspace></div></>;

}

const dragType = 'application/x-gitbored-incoming';
function IncomingTray({ model, sourceHost }: { model: WorkspaceModel; sourceHost: HTMLDivElement | null }) {
  const editor = useEditor();
  const { message, announce: setMessage, error, busySource } = model.discovery;
  const repositoryTrigger = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const repositorySearch = useRef<HTMLInputElement>(null);
  const incomingPanel = useWorkspacePanel('incoming', { trigger, initialFocus: heading, focusReady: model.authority.ready });
  const repositories = useWorkspacePanel('repositories', { trigger: repositoryTrigger, initialFocus: repositorySearch, focusReady: model.readReady });
  const open = incomingPanel.isOpen;
  const browsing = repositories.isOpen;
  const openRepositories = repositories.open;
  useEffect(() => { if (new URLSearchParams(window.location.search).has('source')) openRepositories(); }, [openRepositories]);
  const panel = useRef<HTMLElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  usePanelClearance(panel, open);
  const drag = useRef<{ token: string; candidate: IncomingCandidate } | null>(null);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [kind, setKind] = useState('all');
  const [stateFilter, setStateFilter] = useState('all');
  const [label, setLabel] = useState('');
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const current = useRef(model);
  useLayoutEffect(() => { current.current = model; }, [model]);
  useEffect(() => {
    const container = editor.getContainer();
    const valid = (event: DragEvent) => drag.current !== null && event.dataTransfer?.types.includes(dragType)
      && event.target instanceof Element && event.target.closest('.tl-canvas') !== null && !event.target.closest('[data-native-ui]');
    const over = (event: DragEvent) => { if (valid(event)) { event.preventDefault(); event.stopPropagation(); if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'; } };
    const drop = (event: DragEvent) => {
      const operation = drag.current;
      if (!valid(event) || !operation || event.dataTransfer?.getData(dragType) !== operation.token) return;
      event.preventDefault(); event.stopPropagation(); drag.current = null;
      const bounds = container.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX >= bounds.right || event.clientY < bounds.top || event.clientY >= bounds.bottom) return;
      if (current.current.place(operation.candidate, editor.screenToPage({ x: event.clientX, y: event.clientY }))) setMessage('Card added.');
    };
    container.addEventListener('dragover', over, true); container.addEventListener('drop', drop, true);
    return () => { container.removeEventListener('dragover', over, true); container.removeEventListener('drop', drop, true); drag.current = null; };
  }, [editor, setMessage]);
  async function checkGithubAccess(button: HTMLButtonElement) {
    await model.authority.reconcile();
    if (!button.isConnected && document.activeElement === document.body) heading.current?.focus();
  }
  function selectSource(repository: RepositorySource, filter: SourceFilter) {
    if (!model.discovery.connect(repository, filter)) return;
    const location = new URL(window.location.href);
    location.searchParams.delete('source');
    window.history.replaceState(null, '', `${location.pathname}${location.search}${location.hash}`);
    incomingPanel.open();
  }
  function addCandidate(item: SourceItem) {
    if (model.discovery.add(item)) incomingPanel.open();
  }
  const missingMetadata = [...model.metadata.values()].some((value) => value.status === 'error' || value.status === 'unavailable' || value.status === 'sso-required');
  const complete = model.incoming.sources.every((source) => source.nextPage === null);
  const matches = model.incoming.queue.filter((candidate) => {
    const value = model.metadata.get(candidate.referenceId);
    if (kind !== 'all' && candidate.kind !== kind) return false;
    if (value?.status !== 'ready') return !query && stateFilter === 'all' && !label;
    const item = value.item;
    return (stateFilter === 'all' || item.state === stateFilter || (item.state === 'unknown' && item.sourceState === stateFilter))
      && (!label || item.labels.some((name) => name.toLowerCase().includes(label.toLowerCase())))
      && `${item.title} ${item.locator.owner}/${item.locator.repository} #${item.locator.number} ${item.assignees.join(' ')}`.toLowerCase().includes(query.toLowerCase());
  });
  const unresolved = model.incoming.queue.some((candidate) => model.metadata.get(candidate.referenceId)?.status !== 'ready');
  function add(candidates: IncomingCandidate[]) {
    const count = model.placeMany(candidates);
    setSelected(new Set()); heading.current?.focus({ preventScroll: true }); setMessage(`${count} ${count === 1 ? 'card' : 'cards'} added.`);
  }
  return <div ref={shell} className="incoming-shell" data-native-ui="incoming">
    <div className="incoming-controls">
      <button ref={repositoryTrigger} type="button" aria-expanded={browsing} onClick={repositories.toggle}><Icon name="repo" /> Repositories</button>
      <button type="button" onClick={model.discovery.refresh}>Refresh</button>
      <button ref={trigger} type="button" className="incoming-trigger" aria-expanded={open} aria-controls="incoming-panel" onClick={incomingPanel.toggle}><Icon name="incoming" /> Incoming <span>{model.incoming.queue.length}</span></button>
    </div>
    {model.authority.ready && sourceHost && createPortal(<section hidden={!browsing} className="board-source-panel" aria-label="Board repository connection">
      <div className="incoming-heading"><h2>Repositories</h2><button type="button" data-native-dismiss onClick={repositories.dismiss} aria-label="Close repositories"><Icon name="close" /></button></div>
      {model.readReady ? <RepositoryConnector searchRef={repositorySearch} session={model.authority.session} onConnect={selectSource} onAddItem={addCandidate} {...model.connector} connected={model.incoming.sources} /> : <p role="status">Check your GitHub account to continue.</p>}
      <ul className="incoming-sources">{model.incoming.sources.map((source) => <li key={source.repositoryNodeId}><span>{source.owner}/{source.repository}</span><button type="button" disabled={busySource !== null} onClick={() => model.discovery.disconnect(source.repositoryNodeId)}>Disconnect</button></li>)}</ul>
    </section>, sourceHost)}
    <p className="incoming-announcement" role="status">{message}</p>
    {open && <section ref={panel} className="incoming-panel" id="incoming-panel" aria-labelledby="incoming-heading">
      <div className="incoming-heading"><h2 ref={heading} tabIndex={-1} id="incoming-heading">Incoming <span>{matches.length}</span></h2><button type="button" data-native-dismiss onClick={incomingPanel.dismiss} aria-label="Close Incoming"><Icon name="close" /></button></div>
      <div className="incoming-body"><div className="incoming-filters">
        <input aria-label="Search Incoming" type="search" placeholder="Search cards…" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
        <div><select aria-label="Incoming state" value={stateFilter} onChange={(event) => setStateFilter(event.currentTarget.value)}><option value="all">All states</option><option value="open">Open</option><option value="closed">Closed</option><option value="merged">Merged</option><option value="draft">Draft</option></select>
        <select aria-label="Incoming kind" value={kind} onChange={(event) => setKind(event.currentTarget.value)}><option value="all">Issues + PRs</option><option value="issue">Issues</option><option value="pull-request">Pull requests</option></select></div>
        <input aria-label="Filter Incoming labels" placeholder="Label…" value={label} onChange={(event) => setLabel(event.currentTarget.value)} />
      </div>
      {!model.authority.ready && <p role="status">Check your account to continue.</p>}
      {model.authority.session.authorization === 'reauthorize' && <p role="alert"><a href="/api/auth/github" target="_blank" rel="noopener">Reconnect GitHub</a> <button type="button" onClick={(event) => { void checkGithubAccess(event.currentTarget); }}>Check GitHub access</button></p>}
      {(error || model.incoming.sources.some((source) => source.status === 'error')) && <div className="board-error" role="alert"><p>{error || 'Could not load more cards. Retry to continue.'}</p>{model.incoming.sources.filter((source) => source.status === 'error').map((source) => <button key={source.repositoryNodeId} type="button" onClick={() => { void model.discovery.retry(source); }}>Retry {source.owner}/{source.repository}</button>)}</div>}
      {missingMetadata && <button type="button" onClick={model.retryMetadata}>Retry unavailable details</button>}
      <div className="incoming-selection"><label><input type="checkbox" aria-label={`Select all ${matches.length} cards`} checked={matches.length > 0 && matches.every((entry) => selected.has(entry.referenceId))} onChange={(event) => setSelected(event.currentTarget.checked ? new Set(matches.map((entry) => entry.referenceId)) : new Set())} /> {matches.length} cards</label></div>
      <ul className="incoming-candidates">{matches.map((candidate) => {
        const state = model.metadata.get(candidate.referenceId);
        const item = state?.status === 'ready' ? state.item : null;
        return <li key={candidate.referenceId} data-reference-id={candidate.referenceId}>
          <input type="checkbox" aria-label={`Select ${item?.title ?? 'card'}`} checked={selected.has(candidate.referenceId)} onChange={(event) => { const next = new Set(selected); if (event.currentTarget.checked) next.add(candidate.referenceId); else next.delete(candidate.referenceId); setSelected(next); }} />
          <div className="incoming-card-preview" draggable={!!item} onDragStart={(event) => {
            if (!item) { event.preventDefault(); return; }
            const token = crypto.randomUUID(); drag.current = { token, candidate }; event.dataTransfer.setData(dragType, token); event.dataTransfer.effectAllowed = 'copy';
          }} onDragEnd={() => { drag.current = null; }}>
            <div className="incoming-item-meta"><Icon name={candidate.kind === 'issue' ? 'issue' : 'pr'} /> {item ? `${item.locator.repository} #${item.locator.number}` : 'Loading…'} <span>{item ? itemStateLabel(item) : ''}</span></div>
            <button type="button" className="incoming-title" aria-expanded={expanded === candidate.referenceId} onClick={() => setExpanded(expanded === candidate.referenceId ? null : candidate.referenceId)}>{item?.title ?? describeItem(candidate.kind, state ?? { status: 'loading' })}</button>
            {item && <small>{item.labels.slice(0, 2).join(' · ')}</small>}
          </div>
          <button type="button" aria-label={`Add to board: ${item?.title ?? 'card'}`} title="Add to board" onClick={() => add([candidate])}><Icon name="plus" /></button>
        </li>;
      })}</ul>
      {!matches.length && <p className="incoming-empty">{busySource ? 'Loading cards…' : model.incoming.sources.length ? 'No cards match.' : 'Connect a repository to get started.'}</p>}
      {!matches.length && (query || kind !== 'all' || stateFilter !== 'all' || label) && <button type="button" onClick={() => { setQuery(''); setKind('all'); setStateFilter('all'); setLabel(''); }}>Clear filters</button>}
      </div><div className="incoming-footer"><button type="button" disabled={!matches.some((entry) => selected.has(entry.referenceId))} onClick={() => add(matches.filter((entry) => selected.has(entry.referenceId)))}>Add selected</button>{message.includes('added.') && <button type="button" onClick={() => { model.undo(); setMessage('Addition undone.'); }}>Undo</button>}{!model.incoming.sources.length && <button type="button" onClick={repositories.open}><Icon name="repo" /> Connect repository</button>}<button className="board-primary" type="button" disabled={!complete || unresolved || !matches.length || !model.authority.ready} onClick={() => add(matches)}>Add all matching</button></div>
    </section>}
  </div>;
}
