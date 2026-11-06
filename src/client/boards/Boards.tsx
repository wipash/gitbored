import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { T } from '@tldraw/validate';
import { boardSummaryValidator, validateBoard, type Board, type BoardSummary } from '../../shared/boards';
import type { SessionResponse } from '../../shared/session';
import { BoardSaveError, SaveCoordinator } from './saveCoordinator';
import { requestBoard, type BoardAuthority } from './boardRequest';
import { IncomingWorkspace } from './IncomingWorkspace';
import { readRecovery, readRecoveryCopy, recoveryStorageChanged, rememberRecoveryCopy, RecoveryStore, type RecoveryCopyReceipt, type StoredRecovery } from './recovery';
import './boards.css';

type Session = Extract<SessionResponse, { status: 'signed-in' }>;
function copyTitle(title: string): string {
  const suffix = ` (copy ${new Date().toISOString()})`;
  return `${title.slice(0, 160 - suffix.length)}${suffix}`;
}
export function Boards({ session, ready, reconcileAccount, theme }: { session: Session; ready: boolean; reconcileAccount: (expectedUserId: string) => Promise<void>; theme: 'light' | 'dark' }) {
  const authority = useMemo(() => ({ session, ready, reconcile: () => reconcileAccount(session.user.id) }), [session, ready, reconcileAccount]);
  const boardId = /^\/boards\/([^/]+)\/?$/.exec(window.location.pathname)?.[1];
  return boardId ? <LoadBoard key={`${authority.session.user.id}:${boardId}`} id={boardId} authority={authority} theme={theme} /> : <BoardList authority={authority} />;
}
function BoardList({ authority }: { authority: BoardAuthority }) {
  const requestedSource = new URLSearchParams(window.location.search).get('source');
  const sourceQuery = requestedSource ? `?source=${encodeURIComponent(requestedSource.slice(0, 512))}` : '';
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const requests = useRef<AbortController | null>(null);
  useEffect(() => { const controller = new AbortController(); requests.current = controller; return () => controller.abort(); }, []);
  useEffect(() => { document.title = 'Boards · GitBored'; heading.current?.focus(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    if (!authority.ready) return () => controller.abort();
    const load = async () => {
      try {
        const response = await requestBoard('/api/boards', authority, 'GET', undefined, controller.signal);
        if (!response.ok) throw new Error('Cannot load boards');
        const value = T.object({ boards: T.arrayOf(boardSummaryValidator) }).validate(await response.json());
        if (!controller.signal.aborted) setBoards(value.boards);
      } catch { if (!controller.signal.aborted) setError('Boards could not be loaded. Check your connection and Retry loading. If your session ended, sign in again.'); }
    };
    void load();
    return () => controller.abort();
  }, [attempt, authority]);
  async function create() {
    if (busy || !authority.ready) return;
    setBusy(true); setError('');
    const signal = requests.current?.signal;
    try {
      const response = await requestBoard('/api/boards', authority, 'POST', { title }, signal);
      if (!response.ok) throw new Error('Cannot create board');
      const board = validateBoard(await response.json());
      if (signal?.aborted) return;
      window.location.assign(`/boards/${encodeURIComponent(board.id)}${sourceQuery}`);
    } catch { if (!signal?.aborted) { setError('The board could not be created. Check your connection and board name, then Create board again. If your session ended, use Check account above.'); setBusy(false); } }
  }
  return <section className="boards-list" aria-labelledby="boards-heading">
    <h1 id="boards-heading" tabIndex={-1} ref={heading}>Boards</h1>
    <p>Private spaces for your GitHub work, notes and drawings.</p>
    {requestedSource && <p className="board-source-intent">Choose a board for <strong><bdi>{requestedSource}</bdi></strong>, or create one below.</p>}
    <form className="board-create" onSubmit={(event) => { event.preventDefault(); void create(); }}>
      <label htmlFor="new-board-title">Board name <span className="connection-detail">(1–160 characters)</span></label>
      <div className="board-form-row"><input id="new-board-title" name="title" required maxLength={160} value={title} onChange={(event) => setTitle(event.currentTarget.value)} /><button className="board-primary" aria-disabled={busy || !authority.ready} aria-busy={busy} type="submit">{busy ? 'Creating board…' : 'Create board'}</button></div>
    </form>
    {!authority.ready && <p role="status">Boards are paused until your account is checked. Your entered board name remains here.</p>}
    {authority.ready && <><p role="status">{boards === null && !error ? 'Loading boards…' : boards?.length === 0 ? 'No boards yet. Name your first board above to start drawing and arranging work.' : ''}</p>
    {error && <div className="board-error"><p role="alert">{error}</p><button type="button" onClick={() => { setError(''); setAttempt((value) => value + 1); heading.current?.focus(); }}>Retry loading</button></div>}
    {boards && <ul className="board-entries">{boards.map((board) => <li key={board.id}><a href={`/boards/${encodeURIComponent(board.id)}${sourceQuery}`}>{board.title}</a><span>Updated {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(board.updatedAt)}</span></li>)}</ul>}</>}
  </section>;
}
function LoadBoard({ id, authority, theme }: { id: string; authority: BoardAuthority; theme: 'light' | 'dark' }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (!board) { document.title = 'Open board · GitBored'; heading.current?.focus(); } }, [id, board]);
  useEffect(() => {
    const controller = new AbortController();
    if (board || !authority.ready) return () => controller.abort();
    const load = async () => {
      try {
        const response = await requestBoard(`/api/boards/${encodeURIComponent(id)}`, authority, 'GET', undefined, controller.signal);
        if (!response.ok) throw new Error('Cannot load board');
        const result = validateBoard(await response.json());
        if (!controller.signal.aborted) setBoard(result);
      } catch { if (!controller.signal.aborted) setError('This board could not be opened. Check your connection and Retry opening, or return to Boards. If your session ended, sign in again.'); }
    };
    void load();
    return () => controller.abort();
  }, [id, attempt, authority, board]);
  if (board) return <RecoverBoard board={board} authority={authority} theme={theme} />;
  return <section className="board-loading"><h1 ref={heading} tabIndex={-1}>Open board</h1><p role="status">{!authority.ready ? 'Opening is paused until your account is checked.' : !error ? 'Loading your board…' : ''}</p>{authority.ready && error && <><p role="alert" className="board-error">{error}</p><button type="button" onClick={() => { setError(''); setAttempt((value) => value + 1); }}>Retry opening</button></>}<a href="/boards">Return to Boards</a></section>;
}
function RecoverBoard({ board, authority, theme }: { board: Board; authority: BoardAuthority; theme: 'light' | 'dark' }) {
  const [recovery] = useState(() => readRecovery(authority.session.user.id, board.id));
  const [selected, setSelected] = useState<{ board: Board; restored: boolean; source?: StoredRecovery } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipts, setReceipts] = useState(() => new Map<string, RecoveryCopyReceipt | null>());
  const headingFocused = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const requests = useRef<AbortController | null>(null);
  useEffect(() => { const controller = new AbortController(); requests.current = controller; return () => controller.abort(); }, []);
  useEffect(() => {
    if (selected || !recovery.drafts.length) return;
    document.title = `Recover local work · ${board.title} · GitBored`;
    if (!headingFocused.current) { heading.current?.focus(); headingFocused.current = true; }
  }, [board.title, recovery.drafts.length, selected]);
  useEffect(() => {
    if (selected || !recovery.drafts.length) return;
    let controller = new AbortController();
    const load = () => {
      controller.abort();
      controller = new AbortController();
      const signal = controller.signal;
      void Promise.all(recovery.drafts.map(async (stored) => [stored.key, await readRecoveryCopy(stored, signal)] as const)).then((entries) => {
        if (!signal.aborted) setReceipts(new Map(entries));
      });
    };
    const changed = (event: StorageEvent) => {
      if (event.storageArea !== localStorage || !recoveryStorageChanged(event.key, authority.session.user.id, board.id)) return;
      setReceipts(new Map());
      load();
    };
    load();
    window.addEventListener('storage', changed);
    return () => { controller.abort(); window.removeEventListener('storage', changed); };
  }, [authority.session.user.id, board.id, recovery.drafts, selected]);
  async function copy(stored: StoredRecovery) {
    const signal = requests.current?.signal;
    if (busy || !authority.ready || !signal || signal.aborted) return;
    setBusy(true); setError('');
    try {
      const response = await requestBoard(`/api/boards/${encodeURIComponent(board.id)}/copy`, authority, 'POST',
        { title: copyTitle(board.title), document: stored.draft.document, incoming: stored.draft.incoming }, signal);
      if (!response.ok) throw new Error('Copy failed');
      const result = validateBoard(await response.json());
      if (signal.aborted) return;
      const remembered = await rememberRecoveryCopy(stored, stored.draft, result, signal);
      if (!signal.aborted) window.location.assign(`/boards/${encodeURIComponent(result.id)}${remembered ? '' : '?copyReceipt=unavailable'}`);
    } catch { if (!signal?.aborted) { setError('The copy could not be saved. Your recovery draft remains here. Check your connection and account, then Save as copy again.'); setBusy(false); } }
  }
  async function reloadServer() {
    if (busy || !authority.ready || !window.confirm('Open the server version instead of a local draft? The recovery drafts will remain available on your next visit.')) return;
    setBusy(true); setError('');
    const signal = requests.current?.signal;
    try {
      const response = await requestBoard(`/api/boards/${encodeURIComponent(board.id)}`, authority, 'GET', undefined, signal);
      if (!response.ok) throw new Error('Reload failed');
      const latest = validateBoard(await response.json());
      if (!signal?.aborted) setSelected({ board: latest, restored: false });
    } catch { if (!signal?.aborted) { setError('The server version could not be opened. Your recovery drafts remain here. Check your connection and account, then Reload server version again.'); setBusy(false); } }
  }
  if (selected || recovery.drafts.length === 0) return <BoardEditor initialBoard={selected?.board ?? board} restored={selected?.restored ?? false} source={selected?.source} authority={authority} theme={theme} />;
  return <section className="board-recovery" aria-labelledby="recovery-heading">
    <h1 ref={heading} tabIndex={-1} id="recovery-heading">Recover local work</h1>
    <p>“{board.title}” has local recovery drafts on this browser. Nothing has been applied to the server. Another open tab may still be editing one of these drafts.</p>
    <p>Save a draft as a new private copy to keep both versions. Reloading opens the server version without clearing other tabs’ recovery work.</p>
    <p role="status">{busy ? 'Resolving board recovery…' : !authority.ready ? 'Recovery actions are paused until your account is checked.' : ''}</p>
    {error && <p role="alert" className="board-error">{error}</p>}
    <ul className="board-recovery-drafts">{recovery.drafts.map((stored) => {
      const receipt = receipts.get(stored.key);
      return <li key={stored.key}>
      <h2>Local draft · {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(stored.draft.updatedAt)}</h2>
      <p>{stored.draft.expectedRevision === board.revision ? 'The server is still at this draft’s base revision. You can review and explicitly retry saving.' : 'The server revision differs from this draft’s base. It will not be overwritten. Save a copy to keep this work.'}</p>
      {receipt && <p>This exact local draft was saved as a private copy on {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(receipt.copiedAt)}. Saving the copy did not change the original board. <a href={`/boards/${encodeURIComponent(receipt.copiedBoardId)}`}>Open saved private copy</a></p>}
      <div className="board-form-row"><button type="button" aria-disabled={busy || !authority.ready} aria-busy={busy} onClick={() => { void copy(stored); }}>Save as copy</button>
      {stored.draft.expectedRevision === board.revision && <button type="button" aria-disabled={busy || !authority.ready} onClick={() => {
        if (busy || !authority.ready) return;
        // Opening a draft never writes to the server; retry remains explicit.
        setSelected({ board: { ...board, document: stored.draft.document, incoming: stored.draft.incoming }, restored: true, source: stored });
      }}>Review local draft</button>}</div>
    </li>; })}</ul>
    <button type="button" aria-disabled={busy || !authority.ready} onClick={() => { void reloadServer(); }}>Reload server version</button>
    <a href="/boards">Return to Boards</a>
  </section>;
}
function BoardEditor({ initialBoard, authority, theme, restored = false, source }: { initialBoard: Board; authority: BoardAuthority; theme: 'light' | 'dark'; restored?: boolean; source?: StoredRecovery | undefined }) {
  const [coordinator, setCoordinator] = useState<SaveCoordinator | null>(null);
  const [recoveryStore] = useState(() => new RecoveryStore(authority.session.user.id, initialBoard.id, source));
  const context = useRef(authority);
  useLayoutEffect(() => { context.current = authority; }, [authority]);
  useEffect(() => {
    const controller = new AbortController();
    const saves = new SaveCoordinator(initialBoard.revision, async (save) => {
      const response = await requestBoard(`/api/boards/${encodeURIComponent(initialBoard.id)}`, context.current, 'PUT', save, controller.signal);
      if (response.status === 409) throw new BoardSaveError('conflict');
      if (!response.ok) throw new BoardSaveError('failed');
      const value = T.object({ revision: T.number }).validate(await response.json());
      if (value.revision !== save.expectedRevision + 1) throw new BoardSaveError('failed');
      return value.revision;
    }, initialBoard, recoveryStore, restored);
    // The coordinator owns an abortable request lifetime; recreate it after StrictMode's cleanup.
    // oxlint-disable-next-line react/set-state-in-effect
    setCoordinator(saves);
    const preventLoss = (event: BeforeUnloadEvent) => { saves.checkpoint(); if (saves.dirty) event.preventDefault(); };
    window.addEventListener('beforeunload', preventLoss);
    return () => { saves.dispose(); controller.abort(); window.removeEventListener('beforeunload', preventLoss); };
  }, [initialBoard, restored, recoveryStore]);
  return coordinator ? <EditableBoard board={initialBoard} authority={authority} theme={theme} coordinator={coordinator} source={source} /> : <p role="status">Opening canvas…</p>;
}
function EditableBoard({ board, authority, theme, coordinator, source }: { board: Board; authority: BoardAuthority; theme: 'light' | 'dark'; coordinator: SaveCoordinator; source?: StoredRecovery | undefined }) {
  const save = useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot);
  const [title, setTitle] = useState(board.title);
  const [name, setName] = useState(board.title);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retryInProgress, setRetryInProgress] = useState(false);
  const [copy, setCopy] = useState<{ id: string; receiptUnavailable: boolean } | null>(null);
  const [copyReceiptUnavailable] = useState(() => new URLSearchParams(window.location.search).get('copyReceipt') === 'unavailable');
  const [copyBusy, setCopyBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const confirmation = useRef<HTMLInputElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const saveStatus = useRef<HTMLParagraphElement>(null);
  const requests = useRef<AbortController | null>(null);
  useEffect(() => { const controller = new AbortController(); requests.current = controller; return () => controller.abort(); }, []);
  useEffect(() => { document.title = `${title} · GitBored`; }, [title]);
  useEffect(() => { heading.current?.focus(); }, []);
  async function rename() {
    if (busy || !authority.ready) return;
    setBusy(true); setError('');
    const signal = requests.current?.signal;
    try {
      const response = await requestBoard(`/api/boards/${board.id}`, authority, 'PATCH', { title: name }, signal);
      if (!response.ok) throw new Error('Cannot rename board');
      if (signal?.aborted) return;
      setTitle(validateBoard(await response.json()).title);
    } catch (failure) { if (!signal?.aborted) setError(failure instanceof BoardSaveError && failure.kind === 'blocked'
      ? 'The name was not saved. Use Check account above if requests remain paused, then Rename board again. Your canvas is unchanged.'
      : 'The name could not be saved. Check your connection and name, then Rename board again. Your canvas is unchanged.'); }
    finally { if (!signal?.aborted) setBusy(false); }
  }
  async function remove() {
    if (busy || !authority.ready) return;
    setBusy(true); setError('');
    const signal = requests.current?.signal;
    try {
      const response = await requestBoard(`/api/boards/${board.id}`, authority, 'DELETE', undefined, signal);
      if (!response.ok) throw new Error('Cannot delete board');
      if (signal?.aborted) return;
      coordinator.dispose();
      window.location.assign('/boards');
    } catch (failure) { if (!signal?.aborted) { setError(failure instanceof BoardSaveError && failure.kind === 'blocked'
      ? 'The board was not deleted. Use Check account above if requests remain paused, then Delete board again.'
      : 'The board could not be deleted. Check your connection and try Delete board again.'); setBusy(false); dialog.current?.close(); } }
  }
  async function saveCopy() {
    const signal = requests.current?.signal;
    if (copyBusy || !authority.ready || !signal || signal.aborted) return;
    setCopyBusy(true); setError('');
    coordinator.checkpoint();
    const operation = coordinator.getOperation();
    try {
      const response = await requestBoard(`/api/boards/${encodeURIComponent(board.id)}/copy`, authority, 'POST',
        { title: copyTitle(title), document: operation.document, incoming: operation.incoming }, signal);
      if (!response.ok) throw new Error('Copy failed');
      const result = validateBoard(await response.json());
      if (signal.aborted) return;
      const remembered = !source || await rememberRecoveryCopy(source, operation, result, signal);
      if (signal.aborted) return;
      if (coordinator.completeCopy(operation)) window.location.assign(`/boards/${encodeURIComponent(result.id)}${remembered ? '' : '?copyReceipt=unavailable'}`);
      else setCopy({ id: result.id, receiptUnavailable: !remembered });
    } catch { if (!signal?.aborted) setError('The copy could not be saved. Your local work remains here. Check your connection and account, then Save as copy again.'); }
    finally { if (!signal?.aborted) setCopyBusy(false); }
  }
  function reloadServer() {
    if (copyBusy || !authority.ready || !window.confirm('Reload the server version? This tab’s unsaved local changes will be discarded. Other tabs’ recovery drafts are kept.')) return;
    coordinator.discard();
    window.location.reload();
  }
  async function retrySave() {
    if (retryInProgress || !authority.ready) return;
    setRetryInProgress(true);
    await coordinator.retry();
    if (!coordinator.getSnapshot().retryable && document.activeElement === retryButton.current) saveStatus.current?.focus();
    setRetryInProgress(false);
  }
  return <section className="board-editor" aria-labelledby="board-heading">
    <div className="board-heading"><h1 id="board-heading" ref={heading} tabIndex={-1}>{title}</h1><a href="/boards">All boards</a></div>
    <div className="board-save" data-save-state={save.status}><p ref={saveStatus} role="status" tabIndex={-1}>{save.message}</p>{(save.retryable || retryInProgress) && <button ref={retryButton} type="button" aria-disabled={retryInProgress || !authority.ready} aria-busy={retryInProgress} onClick={() => { void retrySave(); }}>Retry save</button>}{(save.status === 'conflict' || save.retryable) && <div className="board-form-row"><button type="button" aria-disabled={copyBusy || !authority.ready} aria-busy={copyBusy} onClick={() => { void saveCopy(); }}>{copyBusy ? 'Saving copy…' : 'Save as copy'}</button><button className="board-danger" type="button" aria-disabled={copyBusy || !authority.ready} onClick={reloadServer}>Reload server version</button></div>}</div>
    {save.recoveryUnavailable && <p role="alert" className="board-error">Browser recovery storage is unavailable. Keep this tab open until saving succeeds, or save a private copy. Browser recovery is best effort, not a server backup.</p>}
    {copyReceiptUnavailable && <p role="status">Your private copy is saved. Browser storage could not remember its link on the original recovery draft, so that draft may still appear unmarked.</p>}
    {copy && <p role="status">A private copy was saved, but you made newer changes while it was saving. Those changes remain in this tab.{copy.receiptUnavailable ? ' Browser storage could not remember the saved copy’s link on the original recovery draft.' : ''} <a href={`/boards/${encodeURIComponent(copy.id)}`} target="_blank" rel="noopener">Open saved copy (new tab)</a></p>}
    <details className="board-settings"><summary>Board settings</summary><form aria-busy={busy} onSubmit={(event) => { event.preventDefault(); void rename(); }}><label htmlFor="board-name">Board name (1–160 characters)</label><div className="board-form-row"><input id="board-name" name="title" required maxLength={160} value={name} onChange={(event) => setName(event.currentTarget.value)} /><button aria-disabled={busy || !authority.ready} type="submit">Rename board</button></div><p role="status">{busy ? 'Updating board…' : ''}</p></form><button className="board-danger" type="button" aria-disabled={busy || !authority.ready} onClick={() => { if (!busy && authority.ready) dialog.current?.showModal(); }}>Delete board</button></details>
    {error && <p className="board-error" role="alert">{error}</p>}
    <IncomingWorkspace board={board} authority={authority} coordinator={coordinator} theme={theme} />
    <dialog ref={dialog} className="board-dialog" aria-labelledby="delete-board-heading" onClose={() => {
      if (confirmation.current) { confirmation.current.value = ''; confirmation.current.setCustomValidity(''); }
    }}><h2 id="delete-board-heading">Delete “{title}”?</h2><p>This permanently deletes the board and all its notes, drawings and placements. It cannot be undone.</p><form aria-busy={busy} onSubmit={(event) => {
      event.preventDefault();
      if (confirmation.current?.value !== title) {
        confirmation.current?.setCustomValidity('Type the exact board name to confirm deletion.');
        confirmation.current?.reportValidity();
        return;
      }
      void remove();
    }}><label htmlFor="delete-board-name">Type the board name to confirm</label><input ref={confirmation} id="delete-board-name" name="confirmation" required autoComplete="off" onChange={(event) => event.currentTarget.setCustomValidity('')} /><div className="board-form-row"><button type="button" aria-disabled={busy} onClick={() => { if (!busy) dialog.current?.close(); }}>Cancel</button><button className="board-danger" type="submit" aria-disabled={busy || !authority.ready}>Delete board permanently</button></div></form></dialog>
  </section>;
}
