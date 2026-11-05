import { useEffect, useState } from 'react';
import type { SessionResponse } from '../shared/session';
import { isSessionResponse } from '../shared/session';
import { isThemePreference, useTheme } from './theme';
import { SourceBrowser } from './SourceBrowser';
import './auth.css';

type View = { status: 'loading' } | { status: 'error' } | SessionResponse;

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
      // Full navigation clears all account-scoped React state and outstanding requests.
      window.location.replace('/');
    } catch {
      setBusy(false);
      setActionError('Sign-out could not be confirmed. Check your connection, reload this page and try Sign out again.');
    }
  }

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
        <p className="eyebrow">Your work, in perspective</p>
        <h1>{view.status === 'signed-in' ? 'Your GitBored account' : 'A little space for the big picture.'}</h1>
        <p className="intro">Arrange GitHub work in a space of your own. Your account and boards stay private to you.</p>
        <section className="runtime-panel auth-panel" aria-labelledby="account-heading" aria-busy={busy || view.status === 'loading'}>
          <h2 id="account-heading">{view.status === 'signed-in' ? 'Connected account' : 'Connect with GitHub'}</h2>
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
            </> : <p className="connection-detail">Signed in securely. Browse sources below; no GitHub changes are made here.</p>}
            <button type="button" disabled={busy} onClick={() => { void logout(); }}>Sign out</button>
          </>}
        </section>
        {view.status === 'signed-in' && view.authorization === 'ready' && <SourceBrowser key={view.user.id} session={view} />}
        {!theme.persistenceAvailable && <p id="theme-storage-note" className="storage-note" role="status">Theme changes apply for this visit. Allow site storage to keep your preference after reloading.</p>}
      </main>
      <footer><span>GitBored</span><a href="/runtime">Runtime diagnostics</a></footer>
    </div>
  );
}
