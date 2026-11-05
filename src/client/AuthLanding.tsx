import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SessionResponse } from '../shared/session';
import { isSessionResponse } from '../shared/session';
import { isThemePreference, useTheme } from './theme';
import { SourceBrowser } from './SourceBrowser';
import { Boards } from './boards/Boards';
import './auth.css';

type View = { status: 'loading' } | { status: 'error' } | SessionResponse;
type AccountCheck = { status: 'ready' | 'checking' | 'blocked'; message: string };

const signInErrors: Record<string, string> = {
  state: 'This sign-in link expired or has already been used. Start again with Sign in with GitHub.',
  denied: 'GitHub authorization was not completed. Select Sign in with GitHub to try again.',
  provider: 'GitHub could not complete sign-in. Try again shortly with Sign in with GitHub.',
  unconfigured: 'Sign-in is not configured. Ask the deployment operator to configure the GitHub App, then reload this page.',
};

export function AuthLanding() {
  const theme = useTheme();
  const [view, setView] = useState<View>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [accountCheck, setAccountCheck] = useState<AccountCheck>({ status: 'ready', message: '' });
  const currentView = useRef(view);
  const checking = useRef<Promise<void> | null>(null);
  const checkController = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const accountHeading = useRef<HTMLHeadingElement>(null);
  const checkButton = useRef<HTMLButtonElement>(null);
  const accountStatus = useRef<HTMLParagraphElement>(null);
  const focusCheckedStatus = useRef(false);
  useLayoutEffect(() => {
    if (focusCheckedStatus.current) { accountStatus.current?.focus(); focusCheckedStatus.current = false; }
  }, [accountCheck]);
  useLayoutEffect(() => { currentView.current = view; }, [view]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; checkController.current?.abort(); };
  }, []);
  const reconcileAccount = useCallback(async (expectedUserId: string): Promise<void> => {
    if (currentView.current.status !== 'signed-in' || currentView.current.user.id !== expectedUserId) return;
    if (checking.current) return await checking.current;
    const controller = new AbortController();
    checkController.current = controller;
    setAccountCheck({ status: 'checking', message: 'Checking the current account. Protected requests are paused; local canvas work remains in this tab.' });
    const task = (async () => {
      try {
        const response = await fetch('/api/session', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Cannot check session');
        const session: unknown = await response.json();
        if (!isSessionResponse(session)) throw new Error('Invalid session response');
        if (!mounted.current || controller.signal.aborted) return;
        if (session.status === 'signed-in') {
          // Identity, not CSRF rotation, owns the account subtree. Same-user drafts stay mounted.
          currentView.current = session;
          setView(session);
          setAccountCheck({ status: 'ready', message: session.user.id === expectedUserId
            ? 'Your account is confirmed. Any paused canvas save still needs an explicit Retry save.'
            : 'The current account changed. Previous account state was cleared from this page.' });
          focusCheckedStatus.current = document.activeElement === checkButton.current;
        } else {
          setAccountCheck({ status: 'blocked', message: session.status === 'signed-out'
            ? 'Your session ended. Local canvas work remains in this tab. Renew sign-in in another tab, then Check account here and explicitly Retry save.'
            : 'Sign-in configuration is unavailable. Local canvas work remains in this tab. Ask the operator to restore sign-in, then Check account.' });
        }
      } catch {
        if (mounted.current && !controller.signal.aborted) setAccountCheck({ status: 'blocked', message: 'Your account could not be checked. Local canvas work remains in this tab; protected requests are paused. Check your connection, then Check account and explicitly Retry save.' });
      }
    })();
    checking.current = task;
    try { await task; } finally { if (checking.current === task) checking.current = null; }
  }, []);
  const [signInError] = useState(() => {
    const error = new URLSearchParams(window.location.search).get('authError');
    if (error) window.history.replaceState(null, '', '/');
    return error ? signInErrors[error] ?? signInErrors['provider'] : '';
  });

  useEffect(() => {
    const controller = new AbortController();
    // The server is the sole authority; no account data is persisted in browser storage.
    const load = async (): Promise<void> => {
      try {
        const response = await fetch('/api/session', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('Cannot load session');
        const session: unknown = await response.json();
        if (!isSessionResponse(session)) throw new Error('Invalid session response');
        if (!controller.signal.aborted) setView(session);
      } catch {
        if (!controller.signal.aborted) setView({ status: 'error' });
      }
    };
    void load();
    return () => controller.abort();
  }, [attempt]);

  function retry(): void {
    setView({ status: 'loading' });
    setAttempt((value) => value + 1);
  }

  async function logout(): Promise<void> {
    if (view.status !== 'signed-in') return;
    setBusy(true);
    setActionError('');
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST', headers: { 'X-CSRF-Token': view.csrfToken } });
      if (!response.ok && response.status !== 401) throw new Error('Cannot sign out');
      setBusy(false);
      setAccountCheck({ status: 'blocked', message: 'You signed out. Local canvas work remains in this tab if you choose to stay. Renew sign-in in another tab, then Check account here and explicitly Retry save.' });
      // Full navigation clears account state; a canceled dirty-leave prompt retains a truthful blocked draft.
      window.location.replace('/');
    } catch {
      setBusy(false);
      setActionError('Sign-out could not be confirmed. Check your connection, reload this page and try Sign out again.');
    }
  }

  const inBoard = window.location.pathname.startsWith('/boards');
  const inSources = window.location.pathname.startsWith('/sources');
  const inAccount = view.status !== 'signed-in' || (!inBoard && !inSources);
  useEffect(() => {
    if (!inAccount || view.status === 'loading') return;
    document.title = view.status === 'signed-in' ? 'Account · GitBored' : 'GitBored';
    accountHeading.current?.focus();
  }, [inAccount, view.status]);

  return (
    <div className="runtime-shell auth-shell">
      <a className="skip-link" href="#auth-content">Skip to content</a>
      <header className="runtime-header">
        <div className="identity"><span className="identity-mark" aria-hidden="true">G</span><span className="brand">GitBored</span></div>
        <div className="theme-control">
          <label htmlFor="theme">Theme</label>
          <select id="theme" value={theme.preference} aria-describedby={!theme.persistenceAvailable ? 'theme-storage-note' : undefined}
            onChange={(event) => { if (isThemePreference(event.currentTarget.value)) theme.selectTheme(event.currentTarget.value); }}>
            <option value="system">System</option><option value="light">Light</option><option value="dark">Dark</option>
          </select>
        </div>
      </header>
      <main id="auth-content">
        {view.status === 'signed-in' && <nav className="application-nav" aria-label="Application">
          <a href="/boards" aria-current={inBoard ? 'page' : undefined}>Boards</a>
          <a href="/sources" aria-current={inSources ? 'page' : undefined}>Sources</a>
          <a href="/account" aria-current={inAccount ? 'page' : undefined}>Account</a>
          <span className="application-account">{accountCheck.status === 'ready' ? 'Account' : 'Last checked'}: @{view.user.login}</span>
          {!inAccount && <button type="button" disabled={busy || accountCheck.status !== 'ready'} onClick={() => { void logout(); }}>Sign out</button>}
        </nav>}
        {!inAccount && busy && <p role="status">Signing out…</p>}
        {!inAccount && actionError && <p className="auth-error" role="alert">{actionError}</p>}
        {view.status === 'signed-in' && <p className="auth-status account-context-status" ref={accountStatus} tabIndex={-1} role="status">{accountCheck.message}</p>}
        {view.status === 'signed-in' && accountCheck.status !== 'ready' && <section className="account-check runtime-panel" aria-label="Account check" aria-busy={accountCheck.status === 'checking'}>
          <p>Previously checked account: @{view.user.login}. A confirmed different account clears this account's canvas from the page.</p>
          <div className="account-check-actions"><button ref={checkButton} type="button" aria-disabled={accountCheck.status === 'checking'} onClick={() => { void reconcileAccount(view.user.id); }}>{accountCheck.status === 'checking' ? 'Checking account…' : 'Check account'}</button>
            <a href="/api/auth/github" target="_blank" rel="noopener">Renew sign-in in a new tab</a></div>
        </section>}
        {inAccount && <>
        <p className="eyebrow">Your work, in perspective</p>
        <h1 ref={accountHeading} tabIndex={-1}>{view.status === 'signed-in' ? 'Your GitBored account' : 'A little space for the big picture.'}</h1>
        <p className="intro">Arrange GitHub work in a space of your own. Your account and boards stay private to you.</p>
        <section className="runtime-panel auth-panel" aria-labelledby="account-heading" aria-busy={busy || view.status === 'loading'}>
          <h2 id="account-heading">{view.status === 'signed-in' ? accountCheck.status === 'ready' ? 'Connected account' : 'Last checked account' : 'Connect with GitHub'}</h2>
          <p className="auth-status" role="status">{view.status === 'loading' ? 'Checking your session…' : busy ? 'Signing out…' : ''}</p>
          {signInError && <p className="auth-error" role="alert">{signInError}</p>}
          {actionError && <p className="auth-error" role="alert">{actionError}</p>}
          {view.status === 'unconfigured' && <>
            <p>GitHub sign-in is not configured on this deployment.</p>
            <p className="connection-detail">Ask the deployment operator to set the GitHub App client credentials, callback URL and token-encryption key described in the README. Then reload this page.</p>
            <button type="button" onClick={retry}>Check configuration again</button>
          </>}
          {view.status === 'error' && <>
            <p role="alert">Your session could not be checked. Check your connection and try again. If this continues, ask the deployment operator to check the server and GitHub connection.</p>
            <button type="button" onClick={retry}>Try again</button>
          </>}
          {view.status === 'signed-out' && <>
            <p>{view.reason === 'expired' ? 'Your session ended. Sign in again to continue.' : 'Sign in with your GitHub account to get started.'}</p>
            <a className="auth-primary" href="/api/auth/github">Sign in with GitHub</a>
            <p className="connection-detail">GitBored uses your GitHub App authorization. Signing in does not give other users access to your work.</p>
          </>}
          {view.status === 'signed-in' && <>
            <p className="account-login">@{view.user.login}</p>
            {view.user.name && <p>{view.user.name}</p>}
            {view.authorization === 'reauthorize' ? <>
              <p className="auth-error" role="alert">Your GitHub authorization ended. Reconnect to resume GitHub access. Your account is still yours.</p>
              <a className="auth-primary" href="/api/auth/github">Reconnect GitHub</a>
            </> : <p className="connection-detail">{accountCheck.status === 'ready' ? 'Signed in securely. Open Boards to arrange your work or Sources to browse GitHub. GitBored makes no changes to GitHub.' : 'Protected requests are paused until your current account can be confirmed.'}</p>}
            <button type="button" disabled={busy || accountCheck.status !== 'ready'} onClick={() => { void logout(); }}>Sign out</button>
          </>}
        </section>
        </>}
        {view.status === 'signed-in' && inBoard && <Boards key={view.user.id} session={view} ready={accountCheck.status === 'ready'} reconcileAccount={reconcileAccount} theme={theme.resolved} />}
        {view.status === 'signed-in' && inSources && <SourcesRoute key={view.user.id} session={view} ready={accountCheck.status === 'ready'} />}
        {!theme.persistenceAvailable && <p id="theme-storage-note" className="storage-note" role="status">Theme changes apply for this visit. Allow site storage to keep your preference after reloading.</p>}
      </main>
      <footer><span>GitBored</span><a href="/runtime">Runtime diagnostics</a></footer>
    </div>
  );
}

function SourcesRoute({ session, ready }: { session: Extract<SessionResponse, { status: 'signed-in' }>; ready: boolean }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { document.title = 'Sources · GitBored'; heading.current?.focus(); }, []);
  return <section className="sources-route" aria-labelledby="sources-route-heading">
    <h1 ref={heading} id="sources-route-heading" tabIndex={-1}>Sources</h1>
    {!ready ? <p role="status">GitHub values are withheld until your current account is checked.</p>
      : session.authorization === 'ready' ? <SourceBrowser session={session} />
        : <p className="auth-error" role="alert">Your GitHub authorization ended. <a href="/api/auth/github">Reconnect GitHub</a> to browse sources. Your boards remain private to your account.</p>}
  </section>;
}
