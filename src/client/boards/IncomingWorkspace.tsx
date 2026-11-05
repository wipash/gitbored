import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createShapeId, useEditor, type Editor, type TLShapeId } from 'tldraw';
import type { Board } from '../../shared/boards';
import { MAX_INCOMING_REFERENCES, type IncomingCandidate, type IncomingSource, type IncomingState } from '../../shared/incoming';
import type { ItemMetadataState, WorkspaceMetadata } from '../../shared/items';
import { ITEM_CARD_TYPE, type NativeDocument } from '../../shared/nativeDocument';
import { readRepository, readSourceItem, readSourcePage, type RepositorySource, type SourceItem } from '../../shared/sources';
import { SourceBrowser } from '../SourceBrowser';
import { captureNativeDocument, NativeWorkspace } from '../workspace/NativeWorkspace';
import { describeItem } from '../workspace/metadata';
import { requestBoard, type BoardAuthority } from './boardRequest';
import type { SaveCoordinator } from './saveCoordinator';
import './incoming.css';

interface PlacementHistory { candidate: IncomingCandidate; shapeId: TLShapeId }
interface WorkspaceModel {
  incoming: IncomingState;
  metadata: WorkspaceMetadata;
  authority: BoardAuthority;
  readReady: boolean;
  canRead: () => boolean;
  commit: (update: (state: IncomingState) => IncomingState) => void;
  remember: (item: SourceItem) => void;
  place: (candidate: IncomingCandidate, point?: { x: number; y: number }) => boolean;
  accessLost: (scope?: string) => void;
  retrySource: (scope: string) => void;
  retryMetadata: () => void;
}
function placedReferences(document: NativeDocument): Set<string> {
  const result = new Set<string>();
  for (const record of Object.values(document.snapshot.store)) {
    if (record.typeName === 'shape' && record.type === ITEM_CARD_TYPE) result.add(record.props.referenceId);
  }
  return result;
}
/** One native editor/coordinator lifetime; metadata and Incoming never enter SDK history. */
export function IncomingWorkspace({ board, authority, coordinator, theme }: { board: Board; authority: BoardAuthority; coordinator: SaveCoordinator; theme: 'light' | 'dark' }) {
  const [incoming, setIncoming] = useState(board.incoming);
  const current = useRef(board.incoming);
  const editorRef = useRef<Editor | null>(null);
  const documentRef = useRef(board.document);
  const documentSerialization = useRef<string | null>(null);
  const history = useRef(new Map<string, PlacementHistory>());
  const [references, setReferences] = useState(() => [...new Set([...placedReferences(board.document), ...board.incoming.queue.map((candidate) => candidate.referenceId)])].sort((a, b) => a.localeCompare(b)).join(','));
  const [metadata, setMetadata] = useState<{ authority: BoardAuthority | null; values: WorkspaceMetadata }>(() => ({ authority, values: new Map() }));
  const metadataRef = useRef(metadata.values);
  const [metadataAttempt, setMetadataAttempt] = useState(0);
  const lastAuthority = useRef(authority);
  const authorityRef = useRef(authority);
  const deniedScopes = useRef(new Set<string>());
  const rejectedAuthority = useRef<BoardAuthority | null>(null);
  useLayoutEffect(() => { authorityRef.current = authority; }, [authority]);
  const canRead = useCallback((expected: BoardAuthority) => authorityRef.current === expected && rejectedAuthority.current !== expected
    && expected.ready && expected.session.authorization === 'ready', []);
  const publishMetadata = useCallback((next: WorkspaceMetadata, context: BoardAuthority | null) => { metadataRef.current = next; setMetadata({ authority: context, values: next }); }, []);
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
  const remember = useCallback((item: SourceItem) => {
    const scope = `${item.metadata.locator.owner}/${item.metadata.locator.repository}`.toLowerCase();
    if (!canRead(authority) || deniedScopes.current.has(scope)) return;
    const next = new Map(metadataRef.current); next.set(item.reference.id, { status: 'ready', item: item.metadata }); publishMetadata(next, authority);
  }, [authority, canRead, publishMetadata]);
  const accessLost = useCallback((scope?: string) => {
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
      if (state.status === 'ready' && `${state.item.locator.owner}/${state.item.locator.repository}`.toLowerCase() === scope) next.set(id, { status: 'unavailable' });
    }
    publishMetadata(next, authority);
  }, [authority, publishMetadata]);
  useEffect(() => {
    const controller = new AbortController();
    const changedAuthority = lastAuthority.current !== authority;
    lastAuthority.current = authority;
    const next = new Map<string, ItemMetadataState>();
    const readable = canRead(authority);
    if (readable) for (const id of references ? references.split(',') : []) next.set(id, !changedAuthority ? metadataRef.current.get(id) ?? { status: 'loading' } : { status: 'loading' });
    // Synchronize fetched state with the external authorization/request lifetime.
    // oxlint-disable-next-line react/set-state-in-effect
    publishMetadata(next, authority);
    if (!readable) return () => controller.abort();
    const ids = [...next.keys()].filter((id) => next.get(id)?.status !== 'ready');
    const cursor = { index: 0 };
    const hydrate = async () => {
      while (cursor.index < ids.length && !controller.signal.aborted && canRead(authority)) {
        const id = ids[cursor.index++];
        if (!id) continue;
        try {
          const response = await requestBoard(`/api/references/${encodeURIComponent(id)}`, authority, 'GET', undefined, controller.signal);
          if (controller.signal.aborted || !canRead(authority)) return;
          if (!response.ok) {
            const updated = new Map(metadataRef.current);
            const previous = updated.get(id);
            if ((response.status === 403 || response.status === 404) && previous?.status === 'ready') {
              for (const [key, state] of updated) if (state.status === 'ready' && state.item.locator.owner === previous.item.locator.owner && state.item.locator.repository === previous.item.locator.repository) updated.set(key, { status: 'unavailable' });
            }
            updated.set(id, { status: response.status === 403 || response.status === 404 ? 'unavailable' : 'error' }); publishMetadata(updated, authority); continue;
          }
          const item = readSourceItem(await response.json());
          if (!controller.signal.aborted && canRead(authority) && item.reference.id === id) remember(item);
        } catch {
          if (controller.signal.aborted || !canRead(authority)) return;
          const updated = new Map(metadataRef.current); updated.set(id, { status: 'error' }); publishMetadata(updated, authority);
        }
      }
    };
    void Promise.all(Array.from({ length: Math.min(4, ids.length) }, hydrate));
    return () => controller.abort();
  }, [authority, references, metadataAttempt, canRead, publishMetadata, remember]);
  function place(candidate: IncomingCandidate, point?: { x: number; y: number }): boolean {
    const editor = editorRef.current;
    if (!editor || !authorityRef.current.ready) return false;
    const existing = editor.getCurrentPageShapes().find((shape) => shape.type === ITEM_CARD_TYPE && shape.props.referenceId === candidate.referenceId);
    editor.complete(); editor.setCurrentTool('select');
    if (existing) { editor.select(existing.id); editor.zoomToSelection({ animation: { duration: 0 } }); editor.getContainer().focus({ preventScroll: true }); editor.focus(); return true; }
    if (!current.current.queue.some((item) => item.referenceId === candidate.referenceId)) return false;
    const id = createShapeId();
    editor.markHistoryStoppingPoint('incoming-placement');
    let receivingY = 0;
    if (!point) for (const shape of editor.getCurrentPageShapes()) { const bounds = editor.getShapePageBounds(shape); if (bounds) receivingY = Math.max(receivingY, bounds.maxY + 64); }
    // With a positioned page-space drop and no parentId, native createShapes chooses
    // a receiving frame and performs its page-to-parent point AND rotation conversion.
    editor.createShape({ id, type: ITEM_CARD_TYPE, ...(point ? { x: point.x, y: point.y } : { x: 0, y: receivingY, parentId: editor.getCurrentPageId() }), props: { version: 1, referenceId: candidate.referenceId, kind: candidate.kind, w: 320, h: 240 } });
    if (!editor.getShape(id)) return false;
    history.current.set(candidate.referenceId, { candidate, shapeId: id });
    commit((state) => ({ ...state, queue: state.queue.filter((item) => item.referenceId !== candidate.referenceId) }));
    editor.select(id);
    if (!point) editor.zoomToSelection({ animation: { duration: 0 } });
    editor.getContainer().focus({ preventScroll: true }); editor.focus();
    return true;
  }
  const readReady = authority.ready && authority.session.authorization === 'ready' && metadata.authority === authority;
  const model: WorkspaceModel = { incoming, metadata: readReady ? metadata.values : new Map(), authority, readReady, canRead: () => canRead(authority), commit, remember, place, accessLost,
    retrySource: (scope) => { deniedScopes.current.delete(scope); },
    retryMetadata: () => {
    if (!canRead(authority)) return;
    deniedScopes.current.clear(); publishMetadata(new Map(), authority); setMetadataAttempt((attempt) => attempt + 1);
  } };
  return <NativeWorkspace initialDocument={board.document} metadata={model.metadata} theme={theme} onDocumentChange={onDocumentChange} onNativeHistory={onNativeHistory} onMount={mount}><IncomingTray model={model} /></NativeWorkspace>;
}

const dragType = 'application/x-gitbored-incoming';
function IncomingTray({ model }: { model: WorkspaceModel }) {
  const editor = useEditor();
  const [open, setOpen] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busySource, setBusySource] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const panel = useRef<HTMLElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const drag = useRef<{ token: string; candidate: IncomingCandidate } | null>(null);
  const current = useRef(model);
  useLayoutEffect(() => { current.current = model; }, [model]);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); request.current = controller;
    // An authority replacement aborts the previous external discovery operation.
    // oxlint-disable-next-line react/set-state-in-effect
    setBusySource(null);
    return () => controller.abort();
  }, [model.authority]);
  useEffect(() => { if (open) heading.current?.focus(); }, [open]);
  useEffect(() => {
    const outside = (event: PointerEvent) => { if (event.target instanceof Node && !shell.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, []);
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
      if (current.current.place(operation.candidate, editor.screenToPage({ x: event.clientX, y: event.clientY }))) setMessage('Card placed. Incoming remains open.');
    };
    container.addEventListener('dragover', over, true); container.addEventListener('drop', drop, true);
    return () => { container.removeEventListener('dragover', over, true); container.removeEventListener('drop', drop, true); drag.current = null; };
  }, [editor]);
  function dismiss() { setOpen(false); trigger.current?.focus(); }
  async function checkGithubAccess(button: HTMLButtonElement) {
    await model.authority.reconcile();
    if (!button.isConnected && document.activeElement === document.body) heading.current?.focus();
  }
  function selectSource(repository: RepositorySource) {
    if (!model.canRead()) return;
    model.commit((state) => {
      const selected = state.sources.find((source) => source.repositoryNodeId === repository.nodeId);
      if (selected) return selected.owner === repository.owner && selected.repository === repository.name ? state : {
        ...state, sources: state.sources.map((source) => source.repositoryNodeId === repository.nodeId ? { ...source, owner: repository.owner, repository: repository.name } : source),
      };
      return { ...state, sources: [...state.sources, { repositoryNodeId: repository.nodeId, owner: repository.owner, repository: repository.name, nextPage: 1, loadedPage: 0, status: 'idle' }] };
    });
    setBrowsing(false); setMessage('Source selected. Discovery resumes from its saved progress.'); heading.current?.focus();
  }
  function addCandidate(item: SourceItem) {
    if (!model.canRead()) return;
    model.remember(item);
    const candidate = { referenceId: item.reference.id, kind: item.reference.kind };
    const existing = editor.getCurrentPageShapes().some((shape) => shape.type === ITEM_CARD_TYPE && shape.props.referenceId === candidate.referenceId);
    if (existing) { model.place(candidate); setOpen(false); return; }
    model.commit((state) => state.queue.some((entry) => entry.referenceId === candidate.referenceId) ? state : { ...state, queue: [...state.queue, candidate], seen: state.seen.includes(candidate.referenceId) ? state.seen : [...state.seen, candidate.referenceId] });
    setMessage('Reference added to Incoming. No canvas placement was created.');
  }
  async function discover(source: IncomingSource) {
    if (busySource || !model.canRead() || source.nextPage === null) return;
    const page = source.nextPage;
    const signal = request.current?.signal;
    model.retrySource(`${source.owner}/${source.repository}`.toLowerCase());
    setBusySource(source.repositoryNodeId); setError('');
    model.commit((state) => ({ ...state, sources: state.sources.map((item) => item.repositoryNodeId === source.repositoryNodeId ? { ...item, status: 'loading' } : item) }));
    try {
      const response = await requestBoard(`/api/sources/repositories/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repository)}/items?page=${page}`, model.authority, 'GET', undefined, signal);
      if (signal?.aborted || !model.canRead()) return;
      if (!response.ok) {
        if (response.status === 403 || response.status === 404) model.accessLost(`${source.owner}/${source.repository}`.toLowerCase());
        throw new Error('Discovery failed');
      }
      const payload: unknown = await response.json();
      if (typeof payload !== 'object' || payload === null || !('repository' in payload) || readRepository(payload.repository).nodeId !== source.repositoryNodeId) throw new Error('Source identity changed');
      const result = readSourcePage(payload, readSourceItem);
      if (signal?.aborted || !model.canRead()) return;
      if (result.page !== page) throw new Error('Invalid discovery progress');
      const seen = new Set(current.current.incoming.seen);
      for (const item of result.items) seen.add(item.reference.id);
      if (seen.size > MAX_INCOMING_REFERENCES) throw new Error('Incoming is full');
      for (const item of result.items) model.remember(item);
      model.commit((state) => {
        const known = new Set(state.seen); const placed = placedReferences(captureNativeDocument(editor)); const queue = [...state.queue];
        for (const item of result.items) if (!known.has(item.reference.id) && !placed.has(item.reference.id)) queue.push({ referenceId: item.reference.id, kind: item.reference.kind });
        return { ...state, queue, seen: [...seen], sources: state.sources.map((item) => item.repositoryNodeId === source.repositoryNodeId ? { ...item, loadedPage: page, nextPage: result.nextPage, status: result.nextPage === null ? 'complete' : 'partial' } : item) };
      });
      setMessage(`Discovery page ${page} loaded. No canvas placements were created.`);
    } catch {
      if (signal?.aborted || !model.canRead()) return;
      model.commit((state) => ({ ...state, sources: state.sources.map((item) => item.repositoryNodeId === source.repositoryNodeId ? { ...item, status: 'error' } : item) }));
      setError('This discovery page could not be loaded. Existing Incoming and progress are retained. Check your connection or restore GitHub access, then Retry discovery.');
    } finally { if (!signal?.aborted) setBusySource(null); }
  }
  const missingMetadata = [...model.metadata.values()].some((value) => value.status === 'error' || value.status === 'unavailable');
  return <div ref={shell} className="incoming-shell" data-native-ui="incoming">
    <button ref={trigger} type="button" className="incoming-trigger" aria-expanded={open} aria-controls="incoming-panel" onClick={() => setOpen((value) => !value)}>Incoming <span>{model.incoming.queue.length}</span></button>
    <p className="incoming-announcement" role="status">{message}</p>
    {open && <section ref={panel} className="incoming-panel" id="incoming-panel" aria-labelledby="incoming-heading">
      <div className="incoming-heading"><h2 ref={heading} tabIndex={-1} id="incoming-heading">Incoming <span>{model.incoming.queue.length}</span></h2><button type="button" data-native-dismiss onClick={dismiss}>Close Incoming</button></div>
      <p>Unplaced work. Drag onto the canvas or Add to board.</p>
      <p id="incoming-receiving-area"><strong>Receiving row:</strong> Add places a card below existing work, reveals it and closes this tray. Existing objects stay in place.</p>
      <p role="status">{!model.authority.ready ? 'Incoming reads are paused until your account is checked. Your local queue and canvas remain here.' : busySource ? 'Loading discovery page…' : `${model.incoming.queue.length} references in Incoming.`}</p>
      {!model.authority.ready ? null : <>
        {model.authority.session.authorization === 'reauthorize' && <div className="board-error" role="alert"><p>GitHub authorization ended. Reconnect to resume source and reference reads. Local canvas editing and saving remain available.</p><a href="/api/auth/github" target="_blank" rel="noopener">Reconnect GitHub</a> <button type="button" onClick={(event) => { void checkGithubAccess(event.currentTarget); }}>Check GitHub access</button></div>}
        <button type="button" disabled={!model.readReady} aria-expanded={browsing} onClick={() => setBrowsing((value) => !value)}>{browsing ? 'Close source browser' : 'Choose sources or add a URL'}</button>
        {browsing && model.readReady && <SourceBrowser session={model.authority.session} boardActions={{ selectSource, addCandidate, accessLost: model.accessLost }} />}
        <ul className="incoming-sources">{model.incoming.sources.map((source) => <li key={source.repositoryNodeId}>
          <p><bdi>{source.owner}/{source.repository}</bdi></p><p>{source.status === 'loading' && busySource !== source.repositoryNodeId ? 'Discovery interrupted. Continue from the saved cursor.' : source.status === 'complete' ? `Complete through page ${source.loadedPage}.` : source.status === 'error' ? `Discovery failed after page ${source.loadedPage}.` : `Loaded through page ${source.loadedPage}. More pages remain.`}</p>
          {source.nextPage !== null && <button type="button" aria-disabled={busySource !== null || !model.readReady} onClick={() => { void discover(source); }}>{source.status === 'error' ? 'Retry discovery' : source.loadedPage ? 'Discover next page' : 'Discover first page'}</button>}
          {source.status === 'complete' && <button type="button" onClick={() => model.commit((state) => ({ ...state, sources: state.sources.map((item) => item.repositoryNodeId === source.repositoryNodeId ? { ...item, nextPage: 1, loadedPage: 0, status: 'idle' } : item) }))}>Reconcile source again</button>}
          <button type="button" aria-disabled={busySource !== null} onClick={() => { if (!busySource) model.commit((state) => ({ ...state, sources: state.sources.filter((item) => item.repositoryNodeId !== source.repositoryNodeId) })); }}>Remove source</button>
        </li>)}</ul>
        {error && <p role="alert" className="board-error">{error}</p>}
        {missingMetadata && <><p role="alert">Some reference details are unavailable. Geometry and Incoming are retained. Restore access or check your connection, then Retry reference details.</p><button type="button" onClick={model.retryMetadata}>Retry reference details</button></>}
        {model.incoming.queue.length === 0 && <p>{busySource ? 'Discovery is in progress; this is not a complete empty result.' : 'No unplaced work. Choose a source and discover a page, or add a GitHub URL.'}</p>}
        <ul className="incoming-candidates">{model.incoming.queue.map((candidate) => {
          const state: ItemMetadataState = model.metadata.get(candidate.referenceId) ?? { status: model.readReady ? 'loading' : 'unavailable' };
          return <li key={candidate.referenceId} data-reference-id={candidate.referenceId}>
            <p>{describeItem(candidate.kind, state)}</p>
            <div className="incoming-actions"><span className="incoming-drag-handle" draggable={state.status === 'ready'} onDragStart={(event) => {
              if (state.status !== 'ready') { event.preventDefault(); return; }
              const token = crypto.randomUUID(); drag.current = { token, candidate }; event.dataTransfer.setData(dragType, token); event.dataTransfer.effectAllowed = 'copy';
            }} onDragEnd={() => { drag.current = null; }}>Drag to canvas</span><button type="button" aria-describedby="incoming-receiving-area" onClick={() => { if (model.place(candidate)) { setMessage('Card added in the receiving row and selected.'); setOpen(false); } }}>Add to board</button></div>
          </li>;
        })}</ul>
      </>}
    </section>}
  </div>;
}
