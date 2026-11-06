import { readCachedBoardMetadata } from '../../shared/cachedMetadata';
import { BoardMetadataContext, cachedWorkspaceMetadata } from './cachedBoardMetadata';
import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { createShapeId, useEditor, type Editor, type TLShapeId } from 'tldraw';
import { readItemContext } from '../../shared/planning';
import type { Board } from '../../shared/boards';
import { MAX_INCOMING_REFERENCES, type IncomingCandidate, type IncomingSource, type IncomingState, type SourceFilter } from '../../shared/incoming';
import type { ItemMetadataState, WorkspaceMetadata } from '../../shared/items';
import { ITEM_CARD_TYPE, type NativeDocument } from '../../shared/nativeDocument';
import { readRepository, readSourceItem, readSourcePage, type RepositorySource, type SourceItem } from '../../shared/sources';
import { SsoRecoveryNotice } from '../SsoRecoveryNotice';
import { readSsoFailure, useSsoRecovery } from './useSsoRecovery';
import { RepositoryConnector } from '../RepositoryConnector';
import { captureNativeDocument, NativeWorkspace } from '../workspace/NativeWorkspace';
import { Icon } from '../Icon';
import { itemStateLabel, describeItem } from '../workspace/metadata';
import { requestBoard, type BoardAuthority } from './boardRequest';
import type { SaveCoordinator } from './saveCoordinator';
import './incoming.css';
import { useWorkspacePanel } from '../workspace/panels';
import { usePanelClearance } from '../workspace/usePanelClearance';
import { focusPanelTrigger } from '../workspace/focusPanelTrigger';

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
  undo: () => void;
  placeMany: (candidates: IncomingCandidate[]) => number;
  accessLost: (scope?: string, ssoRequired?: boolean) => void;
  retrySource: (scope: string) => void;
  retryMetadata: () => void;
  refresh: () => void;
  refreshRequested: boolean;
  ssoRequired: (owner?: string, key?: string) => void;
  ssoRecovered: (key?: string) => void;
  retryAttempt: number;
  reportSso: (key: string, failure: { owner?: string } | null) => void;
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
  const bootstrap = useContext(BoardMetadataContext);
  const initialCache = bootstrap?.authority === authority ? bootstrap.value : { items: [] };
  const [batchAuthority, setBatchAuthority] = useState<BoardAuthority | null>(bootstrap?.authority === authority ? authority : null);
  const refreshReferences = useRef(new Set(initialCache.items.filter((entry) => entry.stale).map((entry) => entry.item.reference.id)));
  const refreshContexts = useRef(new Set(initialCache.items.filter((entry) => entry.contextStale).map((entry) => entry.item.reference.id)));
  const { failures: ssoFailures, update: reportSso } = useSsoRecovery(authority);
  const [ssoAttempt, setSsoAttempt] = useState(0);
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
      let cache: ReturnType<typeof readCachedBoardMetadata> = { items: [] };
      try {
        const response = await requestBoard(`/api/boards/${encodeURIComponent(board.id)}/metadata`, authority, 'GET', undefined, controller.signal);
        if (response.ok) cache = readCachedBoardMetadata(await response.json());
      } catch { /* Cold reads below recover a failed optional cache bootstrap. */ }
      if (controller.signal.aborted || !canRead(authority)) return;
      refreshReferences.current = new Set(cache.items.filter((entry) => entry.stale).map((entry) => entry.item.reference.id));
      refreshContexts.current = new Set(cache.items.filter((entry) => entry.contextStale).map((entry) => entry.item.reference.id));
      deniedScopes.current.clear();
      publishMetadata(cachedWorkspaceMetadata(cache), authority);
      setBatchAuthority(authority);
    };
    void load();
    return () => controller.abort();
  }, [authority, batchAuthority, board.id, canRead, publishMetadata]);
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
        reportSso(`reference:${id}`, failure);
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
        reportSso(`context:${id}`, failure);
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
    const liveSources = new Set(incoming.sources.map((source) => source.repositoryNodeId));
    for (const key of ssoFailures.keys()) {
      const removed = key.startsWith('reference:') ? !liveReferences.has(key.slice('reference:'.length))
        : key.startsWith('context:') ? !livePlacements.has(key.slice('context:'.length))
          : key.startsWith('source:') && !liveSources.has(key.slice('source:'.length));
      // Removed canvas references no longer have a read that could clear this notice.
      // oxlint-disable-next-line react/set-state-in-effect
      if (removed) reportSso(key, null);
    }
  }, [references, placedIds, incoming.sources, ssoFailures, reportSso]);
  function retrySso() {
    if (!canRead(authority) || !ssoFailures.size) return;
    restoreSsoFocus.current = !!noticeHost?.contains(document.activeElement);
    const next = new Map(metadataRef.current);
    for (const key of ssoFailures.keys()) {
      if (key.startsWith('reference:')) refreshReferences.current.add(key.slice('reference:'.length));
      if (key.startsWith('context:')) {
        const id = key.slice('context:'.length);
        const value = next.get(id);
        if (value?.status === 'ready') {
          refreshContexts.current.add(id);
          next.set(id, { ...value, refreshing: true });
        }
      }
    }
    deniedScopes.current.clear();
    commit((state) => ({ ...state, sources: state.sources.map((source) => ssoFailures.has(`source:${source.repositoryNodeId}`) ? { ...source, status: 'idle' } : source) }));
    publishMetadata(next, authority);
    setMetadataAttempt((attempt) => attempt + 1);
    setSsoAttempt((attempt) => attempt + 1);
  }
  const retrySsoRef = useRef(retrySso);
  useLayoutEffect(() => { retrySsoRef.current = retrySso; });
  useEffect(() => {
    if (!ssoFailures.size) return;
    // One check on return from GitHub; no timer or background retry loop.
    const onFocus = () => { if (document.visibilityState === 'visible') retrySsoRef.current(); };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [ssoFailures.size]);
  useLayoutEffect(() => {
    if (!ssoFailures.size && restoreSsoFocus.current) {
      restoreSsoFocus.current = false;
      if (document.activeElement === document.body) {
        editorRef.current?.getContainer().focus({ preventScroll: true });
        editorRef.current?.focus();
      }
    }
  }, [ssoFailures.size]);
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
  const readReady = authority.ready && authority.session.authorization === 'ready' && metadata.authority === authority;
  const model: WorkspaceModel = { undo: () => { const editor = editorRef.current; if (editor) { editor.undo(); onNativeHistory(editor, 'undo'); } }, incoming, metadata: readReady ? metadata.values : new Map(), authority, readReady, canRead: () => canRead(authority), commit, remember, place, placeMany, accessLost,
    refreshRequested: metadataAttempt > 0,
    reportSso,
    retryAttempt: ssoAttempt,
    ssoRequired: (owner, key = 'catalogue') => reportSso(`connector:${key}`, owner === undefined ? {} : { owner }),
    ssoRecovered: (key = 'catalogue') => reportSso(`connector:${key}`, null),
    retrySource: (scope) => { deniedScopes.current.delete(scope); },
    refresh: () => { if (!canRead(authority)) return; deniedScopes.current.clear(); refreshReferences.current = new Set(references.split(',')); refreshContexts.current = new Set(placedIds.split(',')); commit((state) => ({ ...state, sources: state.sources.map((source) => ({ ...source, nextPage: 1, loadedPage: 0, status: 'idle' })) })); setMetadataAttempt((attempt) => attempt + 1); },
    retryMetadata: () => {
    if (!canRead(authority)) return;
    deniedScopes.current.clear();
    for (const [id, value] of metadataRef.current) if (value.status !== 'ready' || value.item.freshness === 'stale') { refreshReferences.current.add(id); refreshContexts.current.add(id); }
    setMetadataAttempt((attempt) => attempt + 1);
  } };
  return <>{noticeHost && ssoFailures.size > 0 && createPortal(<SsoRecoveryNotice owners={[...new Set([...ssoFailures.values()].filter((owner): owner is string => !!owner))]} onRetry={retrySso} />, noticeHost)}<div ref={setSourceHost} className="board-source-host" data-native-ui="sources" />
    <div className="board-canvas"><NativeWorkspace preferenceKey={`${authority.session.user.id}:${board.id}`} planning={incoming.planning} onPlanningChange={(planning) => commit((state) => ({ ...state, planning }))} initialDocument={board.document} metadata={model.metadata} theme={theme} onDocumentChange={onDocumentChange} onNativeHistory={onNativeHistory} onMount={mount}><IncomingTray model={model} sourceHost={sourceHost} /></NativeWorkspace></div></>;
}

const dragType = 'application/x-gitbored-incoming';
function IncomingTray({ model, sourceHost }: { model: WorkspaceModel; sourceHost: HTMLDivElement | null }) {
  const editor = useEditor();
  const { active, setActive } = useWorkspacePanel();
  const open = active === 'incoming';
  const browsing = active === 'repositories';
  const setOpen = (value: boolean) => setActive((current) => value ? 'incoming' : current === 'incoming' ? null : current);
  const setBrowsing = (value: boolean) => setActive((current) => value ? 'repositories' : current === 'repositories' ? null : current);
  useEffect(() => { if (new URLSearchParams(window.location.search).has('source')) setActive('repositories'); }, [setActive]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busySource, setBusySource] = useState<string | null>(null);
  const repositoryTrigger = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
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
  const loadingSource = useRef(false);
  const current = useRef(model);
  useLayoutEffect(() => { current.current = model; }, [model]);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); request.current = controller;
    // An authority replacement aborts the previous external discovery operation.
    // oxlint-disable-next-line react/set-state-in-effect
    setBusySource(null); loadingSource.current = false;
    return () => controller.abort();
  }, [model.authority]);
  useEffect(() => { if (open) heading.current?.focus(); }, [open]);
  useEffect(() => {
    if (browsing && model.authority.ready) sourceHost?.querySelector<HTMLInputElement>('input')?.focus();
    else heading.current?.focus();
  }, [browsing, sourceHost, model.authority.ready]);
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
  }, [editor]);
  function dismiss() { setOpen(false); focusPanelTrigger(trigger.current); }
  async function checkGithubAccess(button: HTMLButtonElement) {
    await model.authority.reconcile();
    if (!button.isConnected && document.activeElement === document.body) heading.current?.focus();
  }
  function selectSource(repository: RepositorySource, filter: SourceFilter) {
    if (!model.canRead()) return;
    model.commit((state) => {
      const selected = state.sources.find((source) => source.repositoryNodeId === repository.nodeId);
      if (selected) return selected.owner === repository.owner && selected.repository === repository.name ? state : {
        ...state, sources: state.sources.map((source) => source.repositoryNodeId === repository.nodeId ? { ...source, owner: repository.owner, repository: repository.name } : source),
      };
      return { ...state, sources: [...state.sources, { repositoryNodeId: repository.nodeId, owner: repository.owner, repository: repository.name, nextPage: 1, loadedPage: 0, status: 'idle', filter }] };
    });
    const existing = model.incoming.sources.find((source) => source.repositoryNodeId === repository.nodeId);
    const location = new URL(window.location.href);
    location.searchParams.delete('source');
    window.history.replaceState(null, '', `${location.pathname}${location.search}${location.hash}`);
    setBrowsing(false); setOpen(true); setMessage(`${repository.owner}/${repository.name} connected to this board.`); heading.current?.focus();
    if (!existing) void discover({ repositoryNodeId: repository.nodeId, owner: repository.owner, repository: repository.name, nextPage: 1, loadedPage: 0, status: 'idle', filter });
  }
  function addCandidate(item: SourceItem) {
    if (!model.canRead()) return;
    model.remember(item);
    const candidate = { referenceId: item.reference.id, kind: item.reference.kind };
    if (placedReferences(captureNativeDocument(editor)).has(candidate.referenceId)) {
      setMessage('Already on this board.'); return;
    }
    if (model.incoming.seen.length >= MAX_INCOMING_REFERENCES && !model.incoming.seen.includes(candidate.referenceId)) {
      setError('This board has reached its card limit. Use another board.'); return;
    }
    model.commit((state) => state.queue.some((entry) => entry.referenceId === candidate.referenceId) ? state : {
      ...state, queue: [...state.queue, candidate], seen: state.seen.includes(candidate.referenceId) ? state.seen : [...state.seen, candidate.referenceId],
    });
    setBrowsing(false); setOpen(true); setMessage('Added to Incoming.');
  }
  async function discover(source: IncomingSource) {
    if (loadingSource.current || !model.canRead() || source.nextPage === null) return;
    loadingSource.current = true;
    const page = source.nextPage;
    const signal = request.current?.signal;
    model.retrySource(`${source.owner}/${source.repository}`.toLowerCase());
    setBusySource(source.repositoryNodeId); setError('');
    model.commit((state) => ({ ...state, sources: state.sources.map((item) => item.repositoryNodeId === source.repositoryNodeId ? { ...item, status: 'loading' } : item) }));
    try {
      const response = await requestBoard(`/api/sources/repositories/${encodeURIComponent(source.owner)}/${encodeURIComponent(source.repository)}/items?page=${page}${model.refreshRequested ? '&refresh=1' : ''}`, model.authority, 'GET', undefined, signal);
      if (signal?.aborted || !model.canRead()) return;
      if (!response.ok) {
        const failure = await readSsoFailure(response);
        if (signal?.aborted || !model.canRead()) return;
        model.reportSso(`source:${source.repositoryNodeId}`, failure ? { owner: failure.owner ?? source.owner } : null);
        if (response.status === 403 || response.status === 404) model.accessLost(`${source.owner}/${source.repository}`.toLowerCase(), failure !== null);
        throw new Error('Discovery failed');
      }
      model.reportSso(`source:${source.repositoryNodeId}`, null);
      const payload: unknown = await response.json();
      if (typeof payload !== 'object' || payload === null || !('repository' in payload) || readRepository(payload.repository).nodeId !== source.repositoryNodeId) throw new Error('Source identity changed');
      const result = readSourcePage(payload, readSourceItem);
      if (signal?.aborted || !model.canRead()) return;
      if (result.page !== page) throw new Error('Invalid discovery progress');
      const filter = source.filter;
      const eligible = result.items.filter((item) => !filter || (
        (filter.state === 'all' || item.metadata.sourceState === 'open' || item.metadata.state === 'open' || item.metadata.state === 'draft')
        && (filter.kind === 'all' || item.metadata.kind === filter.kind)
        && (!filter.label || item.metadata.labels.some((label) => label.toLowerCase().includes(filter.label.toLowerCase())))
      ));
      const seen = new Set(current.current.incoming.seen);
      for (const item of eligible) seen.add(item.reference.id);
      if (seen.size > MAX_INCOMING_REFERENCES) throw new Error('Incoming is full');
      for (const item of eligible) model.remember(item);
      model.commit((state) => {
        const known = new Set(state.seen); const placed = placedReferences(captureNativeDocument(editor)); const queue = [...state.queue];
        for (const item of eligible) if (!known.has(item.reference.id) && !placed.has(item.reference.id)) queue.push({ referenceId: item.reference.id, kind: item.reference.kind });
        return { ...state, queue, seen: [...seen], sources: state.sources.map((item) => item.repositoryNodeId === source.repositoryNodeId ? { ...item, loadedPage: page, nextPage: result.nextPage, status: result.nextPage === null ? 'complete' : 'partial' } : item) };
      });
      setMessage('');
    } catch {
      if (signal?.aborted || !model.canRead()) return;
      model.commit((state) => ({ ...state, sources: state.sources.map((item) => item.repositoryNodeId === source.repositoryNodeId ? { ...item, status: 'error' } : item) }));
      setError('Could not load more cards. Check your connection and retry.');
    } finally { loadingSource.current = false; if (!signal?.aborted) setBusySource(null); }
  }
  // Resume saved cursors and prefetch until the bounded source is exhausted.
  useEffect(() => {
    if (!model.readReady || busySource || loadingSource.current) return;
    const source = model.incoming.sources.find((entry) => entry.nextPage !== null && entry.status !== 'error');
    if (source) void discover(source);
  });
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
      <button ref={repositoryTrigger} type="button" aria-expanded={browsing} onClick={() => { setBrowsing(!browsing); setOpen(false); }}><Icon name="repo" /> Repositories</button>
      <button type="button" onClick={model.refresh}>Refresh</button>
      <button ref={trigger} type="button" className="incoming-trigger" aria-expanded={open} aria-controls="incoming-panel" onClick={() => { setOpen(!open); setBrowsing(false); }}><Icon name="incoming" /> Incoming <span>{model.incoming.queue.length}</span></button>
    </div>
    {model.authority.ready && sourceHost && createPortal(<section hidden={!browsing} className="board-source-panel" aria-label="Board repository connection">
      <div className="incoming-heading"><h2>Repositories</h2><button type="button" data-native-dismiss onClick={() => { setBrowsing(false); focusPanelTrigger(repositoryTrigger.current); }} aria-label="Close repositories"><Icon name="close" /></button></div>
      {model.readReady ? <RepositoryConnector session={model.authority.session} onConnect={selectSource} onAddItem={addCandidate} onAccessLoss={model.accessLost} onSsoRequired={model.ssoRequired} onSsoRecovered={model.ssoRecovered} retryAttempt={model.retryAttempt} connected={model.incoming.sources} /> : <p role="status">Check your GitHub account to continue.</p>}
      <ul className="incoming-sources">{model.incoming.sources.map((source) => <li key={source.repositoryNodeId}><span>{source.owner}/{source.repository}</span><button type="button" disabled={busySource !== null} onClick={() => model.commit((state) => ({ ...state, sources: state.sources.filter((entry) => entry.repositoryNodeId !== source.repositoryNodeId) }))}>Disconnect</button></li>)}</ul>
    </section>, sourceHost)}
    <p className="incoming-announcement" role="status">{message}</p>
    {open && <section ref={panel} className="incoming-panel" id="incoming-panel" aria-labelledby="incoming-heading">
      <div className="incoming-heading"><h2 ref={heading} tabIndex={-1} id="incoming-heading">Incoming <span>{matches.length}</span></h2><button type="button" data-native-dismiss onClick={dismiss} aria-label="Close Incoming"><Icon name="close" /></button></div>
      <div className="incoming-body"><div className="incoming-filters">
        <input aria-label="Search Incoming" type="search" placeholder="Search cards…" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
        <div><select aria-label="Incoming state" value={stateFilter} onChange={(event) => setStateFilter(event.currentTarget.value)}><option value="all">All states</option><option value="open">Open</option><option value="closed">Closed</option><option value="merged">Merged</option><option value="draft">Draft</option></select>
        <select aria-label="Incoming kind" value={kind} onChange={(event) => setKind(event.currentTarget.value)}><option value="all">Issues + PRs</option><option value="issue">Issues</option><option value="pull-request">Pull requests</option></select></div>
        <input aria-label="Filter Incoming labels" placeholder="Label…" value={label} onChange={(event) => setLabel(event.currentTarget.value)} />
      </div>
      {!model.authority.ready && <p role="status">Check your account to continue.</p>}
      {model.authority.session.authorization === 'reauthorize' && <p role="alert"><a href="/api/auth/github" target="_blank" rel="noopener">Reconnect GitHub</a> <button type="button" onClick={(event) => { void checkGithubAccess(event.currentTarget); }}>Check GitHub access</button></p>}
      {(error || model.incoming.sources.some((source) => source.status === 'error')) && <div className="board-error" role="alert"><p>{error || 'Could not load more cards. Retry to continue.'}</p>{model.incoming.sources.filter((source) => source.status === 'error').map((source) => <button key={source.repositoryNodeId} type="button" onClick={() => { void discover(source); }}>Retry {source.owner}/{source.repository}</button>)}</div>}
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
      </div><div className="incoming-footer"><button type="button" disabled={!matches.some((entry) => selected.has(entry.referenceId))} onClick={() => add(matches.filter((entry) => selected.has(entry.referenceId)))}>Add selected</button>{message.includes('added.') && <button type="button" onClick={() => { model.undo(); setMessage('Addition undone.'); }}>Undo</button>}{!model.incoming.sources.length && <button type="button" onClick={() => { setBrowsing(true); setOpen(false); }}><Icon name="repo" /> Connect repository</button>}<button className="board-primary" type="button" disabled={!complete || unresolved || !matches.length || !model.authority.ready} onClick={() => add(matches)}>Add all matching</button></div>
    </section>}
  </div>;
}
