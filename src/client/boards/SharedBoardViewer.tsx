import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSync } from '@tldraw/sync';
import { TLRemoteSyncError, TLSyncErrorCloseEventReason } from '@tldraw/sync-core';
import type { Editor, TLCamera, TLAssetStore } from 'tldraw';
import { readSharedBoard, readSharedBoardDetails, type SharedBoard, type SharedBoardDetails } from '../../shared/sharing';
import { nativeSchema, type NativeDocument } from '../../shared/nativeDocument';
import { NativeWorkspace, captureNativeDocument } from '../workspace/NativeWorkspace';
import { WorkspacePanelProvider } from '../workspace/panels';
import { cachedWorkspaceMetadata } from './cachedBoardMetadata';
import { requestBoard, type BoardAuthority } from './boardRequest';
import './sharing.css';

const assets: TLAssetStore = {
  upload: async () => { throw new Error('Shared boards do not support uploads'); },
  resolve: () => null,
};
const noPresence = () => null;
const ignoreDocumentChange = () => {};

export function SharedBoardViewer({ token, authority, theme }: { token: string; authority: BoardAuthority; theme: 'light' | 'dark' }) {
  const [board, setBoard] = useState<SharedBoard | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await requestBoard(`/api/shared/${encodeURIComponent(token)}`, authority, 'GET', undefined, controller.signal);
        if (!response.ok) throw new Error('Shared board unavailable');
        const value = readSharedBoard(await response.json());
        if (!controller.signal.aborted) setBoard(value);
      } catch { if (!controller.signal.aborted) setError('This shared board is unavailable. Check your account and connection, then Retry opening. If access was removed, ask the owner to share it again.'); }
    }
    if (authority.ready) void load();
    return () => controller.abort();
  }, [token, authority, attempt]);
  const deny = useCallback(() => {
    setBoard(null);
    setError('Access to this shared board ended. Check your account or ask the owner for access, then Retry opening.');
  }, []);
  useEffect(() => { if (!board) { document.title = 'Shared board · GitBored'; heading.current?.focus(); } }, [board]);
  if (board && authority.ready && !error) return <WorkspacePanelProvider><LiveSharedBoard key={`${attempt}:${authority.session.csrfToken}`} initial={board} token={token} authority={authority} theme={theme} onDenied={deny} /></WorkspacePanelProvider>;
  return <section className="board-loading"><h1 ref={heading} tabIndex={-1}>Shared board</h1><p role="status">{error || (!authority.ready ? 'Check your account to open this board.' : 'Opening shared board…')}</p><div className="board-form-row"><button type="button" onClick={() => { setError(''); setBoard(null); setAttempt((value) => value + 1); }}>Retry opening</button><a href="/boards">Return to Boards</a></div></section>;
}

function LiveSharedBoard({ initial, token, authority, theme, onDenied }: { initial: SharedBoard; token: string; authority: BoardAuthority; theme: 'light' | 'dark'; onDenied: () => void }) {
  const [details, setDetails] = useState<SharedBoardDetails>(initial);
  const [refresh, setRefresh] = useState(0);
  const [refreshError, setRefreshError] = useState(false);
  const [paused, setPaused] = useState<{ document: NativeDocument; details: SharedBoardDetails } | null>(null);
  const editor = useRef<Editor | null>(null);
  const camera = useRef<TLCamera | null>(null);
  const lifetime = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const refreshDetails = useCallback(() => setRefresh((value) => value + 1), []);
  const latestVersion = useRef(initial.publicationVersion);
  const notifiedVersion = useRef(initial.publicationVersion);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    // HTTP context checks also detect account changes in another tab, even while
    // updates are paused or a socket is disconnected.
    const timer = window.setInterval(refreshDetails, 15_000);
    window.addEventListener('focus', refreshDetails);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener('focus', refreshDetails); };
  }, [refreshDetails]);
  const uri = useCallback(async () => {
    const signal = lifetime.current?.signal;
    const response = await requestBoard(`/api/shared/${encodeURIComponent(token)}/ticket`, authority, 'POST', undefined, signal);
    if (!response.ok) {
      if ([401, 403, 404, 409].includes(response.status) && !signal?.aborted) onDenied();
      throw new Error('Cannot connect to shared board');
    }
    const value: unknown = await response.json();
    if (typeof value !== 'object' || value === null || !('ticket' in value) || typeof value.ticket !== 'string') throw new Error('Invalid connection ticket');
    const url = new URL(`/api/shared/${encodeURIComponent(token)}/connect`, window.location.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.searchParams.set('ticket', value.ticket);
    return url.href;
  }, [token, authority, onDenied]);
  const notification = useCallback((value: unknown) => {
    if (typeof value !== 'object' || value === null || !('type' in value) || value.type !== 'publication' || !('version' in value) || typeof value.version !== 'number') return;
    if (value.version > notifiedVersion.current) { notifiedVersion.current = value.version; refreshDetails(); }
  }, [refreshDetails]);
  const remote = useSync({ uri, schema: nativeSchema, assets, getUserPresence: noPresence, onCustomMessageReceived: notification });
  const connection = remote.status === 'synced-remote' ? remote.connectionStatus : remote.status;
  // Reconnect can miss publication notifications; synchronize with the server again.
  // oxlint-disable-next-line react/set-state-in-effect
  useEffect(() => { if (connection === 'online') refreshDetails(); }, [connection, refreshDetails]);
  const syncError = remote.status === 'error' ? remote.error : null;
  const accessEnded = syncError instanceof TLRemoteSyncError && (
    syncError.reason === TLSyncErrorCloseEventReason.NOT_AUTHENTICATED
    || syncError.reason === TLSyncErrorCloseEventReason.FORBIDDEN
    || syncError.reason === TLSyncErrorCloseEventReason.NOT_FOUND);
  useEffect(() => { if (accessEnded) onDenied(); }, [accessEnded, onDenied]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await requestBoard(`/api/shared/${encodeURIComponent(token)}/details`, authority, 'GET', undefined, controller.signal);
        if (!response.ok) {
          if ([401, 403, 404, 409].includes(response.status)) { if (!controller.signal.aborted) onDenied(); return; }
          throw new Error('Cannot refresh board details');
        }
        const value = readSharedBoardDetails(await response.json());
        if (controller.signal.aborted || value.publicationVersion < latestVersion.current) return;
        latestVersion.current = value.publicationVersion;
        setDetails(value); setRefreshError(false);
      } catch { if (!controller.signal.aborted) setRefreshError(true); }
    }
    void load();
    return () => controller.abort();
  }, [token, authority, refresh, onDenied]);
  const displayed = paused?.details ?? details;
  const metadata = useMemo(() => {
    const values = cachedWorkspaceMetadata(displayed.metadata);
    return new Map([...values].map(([id, value]) => [id, value.status === 'ready' ? { ...value, refreshing: false } : value]));
  }, [displayed.metadata]);
  const mount = useCallback((value: Editor) => {
    editor.current = value;
    if (camera.current) value.setCamera(camera.current);
    return () => { camera.current = value.getCamera(); editor.current = null; };
  }, []);
  useEffect(() => { document.title = `${displayed.title} · Shared board · GitBored`; }, [displayed.title]);
  useEffect(() => { heading.current?.focus(); }, []);
  function togglePause() {
    if (!editor.current) return;
    camera.current = editor.current.getCamera();
    const document = captureNativeDocument(editor.current);
    setPaused((current) => current ? null : { document, details });
  }
  if (remote.status === 'error') return <section className="board-loading"><h1>Shared board connection ended</h1><p role="alert">The live board could not be synchronized. Reload to use the latest application version and reconnect.</p><button type="button" onClick={() => window.location.reload()}>Reload shared board</button><a href="/boards">Return to Boards</a></section>;
  return <section className="board-editor shared-viewer" aria-labelledby="shared-board-title">
    <div className="board-heading shared-heading" data-native-ui="shared-controls"><h1 ref={heading} id="shared-board-title" tabIndex={-1} title={displayed.title}>{displayed.title}</h1><span>Read only</span><a href="/boards">Boards</a></div>
    <div className="shared-status" data-native-ui="shared-controls"><p role="status">{paused ? 'Live updates paused.' : connection === 'online' ? 'Live saved changes' : 'Reconnecting… Showing the last received board.'}</p><p>Updated {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(displayed.publishedAt)}</p>
      <button type="button" disabled={remote.status !== 'synced-remote'} onClick={togglePause}>{paused ? 'Resume live updates' : 'Pause live updates'}</button>
      {refreshError && <p role="alert">Board details could not be refreshed. Check your connection, then <button type="button" onClick={refreshDetails}>Retry details</button>.</p>}
    </div>
    {remote.status === 'synced-remote' ? <div className="board-canvas"><NativeWorkspace key={paused ? 'paused' : 'live'} {...(paused ? { initialDocument: paused.document } : { store: remote.store })} readOnly metadata={metadata} planning={displayed.planning ?? undefined} preferenceKey={`${authority.session.user.id}:${initial.id}:shared`} theme={theme} onDocumentChange={ignoreDocumentChange} onMount={mount} /></div> : <p className="board-loading" role="status">Connecting to shared board…</p>}
  </section>;
}

