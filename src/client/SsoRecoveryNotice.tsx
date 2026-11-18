import './ssoRecovery.css';

interface SsoRecoveryNoticeProps {
  owners: readonly string[];
  onRetry: () => void;
  checking?: boolean;
}

/** Construct GitHub destinations from account names, never provider-supplied URLs. */
export function SsoRecoveryNotice({ owners, onRetry, checking = false }: SsoRecoveryNoticeProps) {
  const organizations = [...new Set(owners.filter((owner) => /^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(owner)).map((owner) => owner.toLowerCase()))];
  return <aside className="sso-recovery-notice" aria-label="GitHub SSO recovery" data-native-ui="sso-recovery" onPointerDown={(event) => event.stopPropagation()}>
    <details>
      <summary><strong role="status">GitHub SSO required</strong><span>Recovery steps</span></summary>
      <div className="sso-recovery-body">
        <p>You can keep editing with your saved card details. Sign in to your organization to refresh them.</p>
        <ol>
          <li>Start an SSO session on GitHub.{organizations.length > 0
            ? <ul>{organizations.map((owner) => <li key={owner}><a href={`https://github.com/orgs/${owner}/sso`} target="_blank" rel="noopener noreferrer">Sign in to <bdi>{owner}</bdi> SSO</a></li>)}</ul>
            : <p><a href="https://github.com/settings/organizations" target="_blank" rel="noopener noreferrer">Open your GitHub organizations</a> and sign in to the affected organization.</p>}
          </li>
          <li>Return here and <button type="button" disabled={checking} onClick={onRetry}>Check access</button>.</li>
          <li>If GitHub still requires SSO, open <a href="https://github.com/settings/applications" target="_blank" rel="noopener noreferrer">GitHub application settings</a>, choose <strong>Authorized GitHub Apps</strong> and revoke GitBored’s authorization. Then <a href="/api/auth/github" target="_blank" rel="noopener noreferrer">reauthorize GitBored</a> with the same account while your SSO session is active.</li>
        </ol>
        <p className="sso-recovery-hint">Sign-in links open in a new tab. Keep this board tab open.</p>
        <p role="status">{checking ? 'Checking GitHub access…' : ''}</p>
      </div>
    </details>
  </aside>;
}
