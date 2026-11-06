import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { BoardAuthority } from './boardRequest';

/** Only a bounded error code and validated organisation name cross this seam. */
export async function readSsoFailure(response: Response): Promise<{ owner?: string } | null> {
  if (response.status !== 403) return null;
  const value: unknown = await response.clone().json().catch(() => null);
  if (typeof value !== 'object' || value === null || !('error' in value) || value.error !== 'sso_required') return null;
  const owner = 'ssoOrganization' in value ? value.ssoOrganization : undefined;
  return typeof owner === 'string' && /^[A-Za-z0-9-]{1,39}$/.test(owner) ? { owner } : {};
}

export function useSsoRecovery(authority: BoardAuthority) {
  const [state, setState] = useState<{ authority: BoardAuthority; failures: ReadonlyMap<string, string | undefined> }>(() => ({ authority, failures: new Map() }));
  const current = useRef(state);
  const active = useRef(authority);
  useLayoutEffect(() => { active.current = authority; }, [authority]);
  const update = useCallback((key: string, failure: { owner?: string } | null) => {
    if (active.current !== authority || !authority.ready) return;
    const previous = current.current.authority === authority ? current.current.failures : new Map<string, string | undefined>();
    if (failure === null && !previous.has(key)) return;
    if (failure !== null && previous.has(key) && previous.get(key) === failure.owner) return;
    const failures = new Map(previous);
    if (failure === null) failures.delete(key); else failures.set(key, failure.owner);
    current.current = { authority, failures };
    setState(current.current);
  }, [authority]);
  return { failures: state.authority === authority && authority.ready ? state.failures : new Map<string, string | undefined>(), update };
}
