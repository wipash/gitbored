import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { T } from '@tldraw/validate';
import { boardSummaryValidator, validateBoard, type Board, type BoardSummary } from '../../shared/boards';
import type { SessionResponse } from '../../shared/session';
import { NativeWorkspace } from '../workspace/NativeWorkspace';
import { BoardSaveError, SaveCoordinator } from './saveCoordinator';
import './boards.css';

type Session = Extract<SessionResponse, { status: 'signed-in' }>;
const emptyMetadata = new Map();
async function requestBoard(url: string, session: Session, method: string, data?: unknown): Promise<Response> {
  return await fetch(url, { method, cache: 'no-store', headers: { 'X-CSRF-Token': session.csrfToken, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
}
export function Boards({ session, theme }: { session: Session; theme: 'light' | 'dark' }) {
  const boardId = /^\/boards\/([^/]+)\/?$/.exec(window.location.pathname)?.[1];
  return boardId ? <LoadBoard key={`${session.user.id}:${boardId}`} id={boardId} session={session} theme={theme} /> : <BoardList session={session} />;
}
function BoardList({ session }: { session: Session }) {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { document.title = 'Boards · GitBored'; heading.current?.focus(); }, []);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch('/api/boards', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Cannot load boards');
        const value = T.object({ boards: T.arrayOf(boardSummaryValidator) }).validate(await response.json());
        if (!controller.signal.aborted) setBoards(value.boards);
      } catch { if (!controller.signal.aborted) setError('Boards could not be loaded. Check your connection and Retry loading. If your session ended, sign in again.'); }
    };
    void load();
    return () => controller.abort();
  }, [attempt]);
  async function create() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await requestBoard('/api/boards', session, 'POST', { title });
      if (!response.ok) throw new Error('Cannot create board');
      const board = validateBoard(await response.json());
      window.location.assign(`/boards/${encodeURIComponent(board.id)}`);
    } catch { setError('The board could not be created. Check your connection and board name, then Create board again. If your session ended, sign in again.'); setBusy(false); }
  }
  return <section className="boards-list" aria-labelledby="boards-heading">
    <h1 id="boards-heading" tabIndex={-1} ref={heading}>Boards</h1>
    <p>Private spaces for your GitHub work, notes and drawings.</p>
    <form className="board-create" onSubmit={(event) => { event.preventDefault(); void create(); }}>
      <label htmlFor="new-board-title">Board name <span className="connection-detail">(1–160 characters)</span></label>
      <div className="board-form-row"><input id="new-board-title" name="title" required maxLength={160} value={title} onChange={(event) => setTitle(event.currentTarget.value)} /><button className="board-primary" aria-disabled={busy} aria-busy={busy} type="submit">{busy ? 'Creating board…' : 'Create board'}</button></div>
    </form>
    <p role="status">{boards === null && !error ? 'Loading boards…' : boards?.length === 0 ? 'No boards yet. Name your first board above to start drawing and arranging work.' : ''}</p>
    {error && <div className="board-error"><p role="alert">{error}</p><button type="button" onClick={() => { setError(''); setAttempt((value) => value + 1); }}>Retry loading</button><a href="/api/auth/github">Sign in again</a></div>}
    {boards && <ul className="board-entries">{boards.map((board) => <li key={board.id}><a href={`/boards/${encodeURIComponent(board.id)}`}>{board.title}</a><span>Updated {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(board.updatedAt)}</span></li>)}</ul>}
  </section>;
}
function LoadBoard({ id, session, theme }: { id: string; session: Session; theme: 'light' | 'dark' }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch(`/api/boards/${encodeURIComponent(id)}`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Cannot load board');
        const result = validateBoard(await response.json());
        if (!controller.signal.aborted) setBoard(result);
      } catch { if (!controller.signal.aborted) setError('This board could not be opened. Check your connection and Retry opening, or return to Boards. If your session ended, sign in again.'); }
    };
    void load();
    return () => controller.abort();
  }, [id, attempt]);
  if (board) return <BoardEditor initialBoard={board} session={session} theme={theme} />;
  return <section className="board-loading"><h1>Open board</h1><p role="status">{!error ? 'Loading your board…' : ''}</p>{error && <><p role="alert" className="board-error">{error}</p><button type="button" onClick={() => { setError(''); setAttempt((value) => value + 1); }}>Retry opening</button></>}<a href="/boards">Return to Boards</a></section>;
}
function BoardEditor({ initialBoard, session, theme }: { initialBoard: Board; session: Session; theme: 'light' | 'dark' }) {
  const [coordinator, setCoordinator] = useState<SaveCoordinator | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const saves = new SaveCoordinator(initialBoard.revision, async (save) => {
      const response = await fetch(`/api/boards/${encodeURIComponent(initialBoard.id)}`, { method: 'PUT', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': session.csrfToken }, body: JSON.stringify(save) });
      if (response.status === 409) throw new BoardSaveError('conflict');
      if (!response.ok) throw new BoardSaveError('failed');
      const value = T.object({ revision: T.number }).validate(await response.json());
      if (value.revision !== save.expectedRevision + 1) throw new BoardSaveError('failed');
      return value.revision;
    });
    // The coordinator owns an abortable request lifetime; recreate it after StrictMode's cleanup.
    // oxlint-disable-next-line react/set-state-in-effect
    setCoordinator(saves);
    const preventLoss = (event: BeforeUnloadEvent) => { if (saves.dirty) event.preventDefault(); };
    window.addEventListener('beforeunload', preventLoss);
    return () => { saves.dispose(); controller.abort(); window.removeEventListener('beforeunload', preventLoss); };
  }, [initialBoard, session]);
  return coordinator ? <EditableBoard board={initialBoard} session={session} theme={theme} coordinator={coordinator} /> : <p role="status">Opening canvas…</p>;
}
function EditableBoard({ board, session, theme, coordinator }: { board: Board; session: Session; theme: 'light' | 'dark'; coordinator: SaveCoordinator }) {
  const save = useSyncExternalStore(coordinator.subscribe, coordinator.getSnapshot);
  const [title, setTitle] = useState(board.title);
  const [name, setName] = useState(board.title);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [retryInProgress, setRetryInProgress] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const confirmation = useRef<HTMLInputElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const saveStatus = useRef<HTMLParagraphElement>(null);
  useEffect(() => { document.title = `${title} · GitBored`; }, [title]);
  useEffect(() => { heading.current?.focus(); }, []);
  async function rename() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await requestBoard(`/api/boards/${board.id}`, session, 'PATCH', { title: name });
      if (!response.ok) throw new Error('Cannot rename board');
      setTitle(validateBoard(await response.json()).title);
    } catch { setError('The name could not be saved. Check your connection and name, then Rename board again. Your canvas is unchanged.'); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const response = await requestBoard(`/api/boards/${board.id}`, session, 'DELETE');
      if (!response.ok) throw new Error('Cannot delete board');
      coordinator.dispose();
      window.location.assign('/boards');
    } catch { setError('The board could not be deleted. Check your connection and try Delete board again.'); setBusy(false); dialog.current?.close(); }
  }
  async function retrySave() {
    if (retryInProgress) return;
    setRetryInProgress(true);
    await coordinator.retry();
    if (!coordinator.getSnapshot().retryable && document.activeElement === retryButton.current) saveStatus.current?.focus();
    setRetryInProgress(false);
  }
  return <section className="board-editor" aria-labelledby="board-heading">
    <div className="board-heading"><h1 id="board-heading" ref={heading} tabIndex={-1}>{title}</h1><a href="/boards">All boards</a></div>
    <div className="board-save" data-save-state={save.status}><p ref={saveStatus} role="status" tabIndex={-1}>{save.message}</p>{(save.retryable || retryInProgress) && <button ref={retryButton} type="button" aria-disabled={retryInProgress} aria-busy={retryInProgress} onClick={() => { void retrySave(); }}>Retry save</button>}{save.status === 'conflict' && <button type="button" onClick={() => { if (window.confirm('Reload the server version? Your unsaved local changes will be discarded.')) window.location.reload(); }}>Reload server version</button>}</div>
    <details className="board-settings"><summary>Board settings</summary><form aria-busy={busy} onSubmit={(event) => { event.preventDefault(); void rename(); }}><label htmlFor="board-name">Board name (1–160 characters)</label><div className="board-form-row"><input id="board-name" name="title" required maxLength={160} value={name} onChange={(event) => setName(event.currentTarget.value)} /><button aria-disabled={busy} type="submit">Rename board</button></div><p role="status">{busy ? 'Updating board…' : ''}</p></form><button className="board-danger" type="button" aria-disabled={busy} onClick={() => { if (!busy) dialog.current?.showModal(); }}>Delete board</button></details>
    {error && <p className="board-error" role="alert">{error}</p>}
    <div className="board-canvas"><NativeWorkspace initialDocument={board.document} metadata={emptyMetadata} theme={theme} onDocumentChange={coordinator.change} /></div>
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
    }}><label htmlFor="delete-board-name">Type the board name to confirm</label><input ref={confirmation} id="delete-board-name" name="confirmation" required autoComplete="off" onChange={(event) => event.currentTarget.setCustomValidity('')} /><div className="board-form-row"><button type="button" aria-disabled={busy} onClick={() => { if (!busy) dialog.current?.close(); }}>Cancel</button><button className="board-danger" type="submit" aria-disabled={busy}>Delete board permanently</button></div></form></dialog>
  </section>;
}
