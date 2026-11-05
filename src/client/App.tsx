import { useEffect, useState } from 'react';
import { checkHealth } from './health';
import { isThemePreference, useTheme } from './theme';

type HealthState =
  | { status: 'loading' }
  | { status: 'ready' }
  | { status: 'failed'; detail: string };

export function App() {
  const theme = useTheme();
  const [health, setHealth] = useState<HealthState>({ status: 'loading' });
  const [checkNumber, setCheckNumber] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void checkHealth(controller.signal).then(
      () => {
        if (!controller.signal.aborted) {
          setHealth({ status: 'ready' });
        }
      },
      (error: unknown) => {
        if (!controller.signal.aborted) {
          setHealth({
            status: 'failed',
            detail: error instanceof Error && error.name !== 'TimeoutError'
              ? error.message
              : 'The runtime did not respond in time.',
          });
        }
      },
    );
    return () => controller.abort();
  }, [checkNumber]);

  function refreshHealth(): void {
    setHealth({ status: 'loading' });
    setCheckNumber((number) => number + 1);
  }

  return (
    <div className="runtime-shell">
      <header className="runtime-header">
        <div className="identity">
          <span className="identity-mark" aria-hidden="true">G</span>
          <span className="brand">GitBored</span>
          <span className="environment-label">Development runtime</span>
        </div>
        <div className="theme-control">
          <label htmlFor="theme">Theme</label>
          <select
            id="theme"
            name="theme"
            value={theme.preference}
            aria-describedby={!theme.persistenceAvailable ? 'theme-storage-note' : undefined}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (isThemePreference(value)) {
                theme.selectTheme(value);
              }
            }}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </header>

      <main>
        <div className="page-heading">
          <p className="eyebrow">Developer diagnostics</p>
          <h1>Local runtime</h1>
          <p className="intro">A small check that the browser, API, and local SQLite storage can work together.</p>
        </div>

        <section className="runtime-panel" aria-labelledby="connection-heading">
          <div className="panel-heading">
            <h2 id="connection-heading">Runtime connection</h2>
            <button type="button" onClick={refreshHealth} disabled={health.status === 'loading'}>
              Check again
            </button>
          </div>
          <div className="connection-status" data-status={health.status}>
            <span className="status-dot" aria-hidden="true" />
            <p role="status">
              {health.status === 'loading' && 'Checking API and SQLite…'}
              {health.status === 'ready' && 'API and SQLite are ready.'}
              {health.status === 'failed' && 'Unable to confirm runtime readiness.'}
            </p>
          </div>
          {health.status === 'failed' ? (
            <div className="connection-detail">
              <p>{health.detail}</p>
              <p>Check that the local server is running and its data directory is writable, then select Check again.</p>
            </div>
          ) : (
            <p className="connection-detail">
              {health.status === 'ready'
                ? 'The API responded and completed a query against the local SQLite database. This is the result of the latest check.'
                : 'Waiting for the server to answer and complete a real database query.'}
            </p>
          )}
          <dl className="runtime-details">
            <div><dt>API endpoint</dt><dd><code>/api/health</code></dd></div>
            <div><dt>Storage</dt><dd>Local SQLite</dd></div>
          </dl>
        </section>

        <section className="scope-note" aria-labelledby="scope-heading">
          <h2 id="scope-heading">Runtime only, not a board yet</h2>
          <p>This page checks the development setup. GitHub sign-in, issue intake, and boards are not implemented. No GitHub data is requested.</p>
        </section>
        {!theme.persistenceAvailable && (
          <p id="theme-storage-note" className="storage-note" role="status">
            This browser is blocking local storage. The theme works for this visit; allow site storage to keep it after a reload.
          </p>
        )}
      </main>
      <footer>GitBored <span aria-hidden="true">/</span> Local development</footer>
    </div>
  );
}
