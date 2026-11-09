import { useEffect, useRef, useState } from 'react';
import { readSharingSettings, type SharingMode, type SharingSettings } from '../../shared/sharing';
import { requestBoard, type BoardAuthority } from './boardRequest';
import { useWorkspacePanel } from '../workspace/panels';
import './sharing.css';

export function SharePanel({ boardId, authority }: { boardId: string; authority: BoardAuthority }) {
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const panel = useWorkspacePanel('share', { trigger, initialFocus: close });
  return <>
    <button ref={trigger} type="button" aria-expanded={panel.isOpen} onClick={panel.toggle}>Share</button>
    {panel.isOpen && <section className="share-panel" aria-label="Share board" data-native-ui="share" onKeyDown={(event) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); panel.dismiss(); }
    }}>
      <div className="incoming-heading"><h2>Share board</h2><button ref={close} type="button" data-native-dismiss aria-label="Close sharing" onClick={panel.dismiss}>Close</button></div>
      <ShareSettings key={authority.session.csrfToken} boardId={boardId} authority={authority} />
    </section>}
  </>;
}

function ShareSettings({ boardId, authority }: { boardId: string; authority: BoardAuthority }) {
  const [settings, setSettings] = useState<SharingSettings | null>(null);
  const [mode, setMode] = useState<SharingMode>('private');
  const [logins, setLogins] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const lifetime = useRef<AbortController | null>(null);
  const link = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    async function load() {
      try {
        const response = await requestBoard(`/api/boards/${encodeURIComponent(boardId)}/sharing`, authority, 'GET', undefined, controller.signal);
        if (!response.ok) throw new Error('Sharing unavailable');
        const value = readSharingSettings(await response.json());
        if (controller.signal.aborted) return;
        setSettings(value); setMode(value.mode); setLogins(value.people.map((person) => person.login).join(', '));
      } catch { if (!controller.signal.aborted) setError('Sharing could not be loaded. Check your connection and Retry loading.'); }
    }
    void load();
    return () => controller.abort();
  }, [boardId, authority, attempt]);
  async function save() {
    if (busy || !settings || !authority.ready) return;
    const signal = lifetime.current?.signal;
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await requestBoard(`/api/boards/${encodeURIComponent(boardId)}/sharing`, authority, 'PUT', {
        mode, logins: mode === 'people' ? logins.split(/[,\s]+/).map((value) => value.replace(/^@/, '')).filter(Boolean) : [], expectedVersion: settings.version,
      }, signal);
      if (signal?.aborted) return;
      if (!response.ok) {
        setError(response.status === 409 ? 'Sharing changed in another tab. Retry loading before saving again.'
          : response.status === 400 ? 'Use GitHub usernames of people who have already signed in to GitBored, then Save sharing again.'
            : 'Sharing was not saved. Check your connection and account, then Save sharing again.');
        return;
      }
      const value = readSharingSettings(await response.json());
      if (signal?.aborted) return;
      setSettings(value); setMode(value.mode); setLogins(value.people.map((person) => person.login).join(', '));
      setNotice(value.mode === 'private' ? 'Sharing is off. Only you can open the link.' : 'Sharing saved. Viewers can see your saved board and published issue details.');
    } catch { if (!signal?.aborted) setError('Sharing was not saved. Check your connection and account, then Save sharing again.'); }
    finally { if (!signal?.aborted) setBusy(false); }
  }
  async function copy() {
    if (!settings) return;
    try { await navigator.clipboard.writeText(new URL(settings.path, window.location.origin).href); setNotice('Link copied.'); }
    catch { link.current?.focus(); link.current?.select(); setNotice('Select and copy the link below.'); }
  }
  return <div className="share-body">
    <p>People with access can see this board’s issue details, including details from private repositories. Everyone must sign in. Only you can edit.</p>
    {settings && <form onSubmit={(event) => { event.preventDefault(); void save(); }} aria-busy={busy}>
      <label htmlFor="sharing-access">Sharing access</label>
      <select id="sharing-access" value={mode} onChange={(event) => {
        const next = event.currentTarget.value; if (next === 'private' || next === 'link' || next === 'people') setMode(next);
      }}>
        <option value="private">Private</option><option value="link">Anyone with the link</option><option value="people">Specific people</option>
      </select>
      {mode === 'people' && <><label htmlFor="sharing-people">GitHub usernames</label><input id="sharing-people" name="people" autoComplete="off" placeholder="alice, bob" value={logins} onChange={(event) => setLogins(event.currentTarget.value)} aria-describedby="sharing-people-hint" /><p id="sharing-people-hint">Separate usernames with commas. Each person must have signed in to GitBored before you add them.</p></>}
      {mode === 'link' && <p>Anyone signed in who receives this link can view the board, including people it is forwarded to.</p>}
      <button className="board-primary" type="submit" aria-disabled={busy || !authority.ready}>{busy ? 'Saving sharing…' : 'Save sharing'}</button>
    </form>}
    <p role="status">{notice || (!settings && !error ? 'Loading sharing…' : '')}</p>
    {error && <div className="board-error"><p role="alert">{error}</p><button type="button" disabled={busy} onClick={() => { setError(''); setAttempt((value) => value + 1); }}>Retry loading</button></div>}
    {settings && <div className="share-link"><label htmlFor="share-link">Share link</label><input ref={link} id="share-link" readOnly value={new URL(settings.path, window.location.origin).href} onFocus={(event) => event.currentTarget.select()} /><button type="button" onClick={() => { void copy(); }}>Copy link</button><p>{settings.mode === 'private' ? 'Currently private. Save a sharing option to let others view.' : 'The link stays the same when you change who has access.'}</p></div>}
  </div>;
}
