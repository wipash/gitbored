export interface SessionUser {
  id: string;
  githubId: string;
  login: string;
  name: string | null;
}

export type SessionResponse =
  | { status: 'unconfigured' }
  | { status: 'signed-out'; reason?: 'expired' }
  | { status: 'signed-in'; user: SessionUser; csrfToken: string; authorization: 'ready' | 'reauthorize' };

export function isSessionUser(value: unknown): value is SessionUser {
  return typeof value === 'object' && value !== null
    && 'id' in value && typeof value.id === 'string'
    && 'githubId' in value && typeof value.githubId === 'string'
    && 'login' in value && typeof value.login === 'string'
    && 'name' in value && (value.name === null || typeof value.name === 'string');
}

export function isSessionResponse(value: unknown): value is SessionResponse {
  if (typeof value !== 'object' || value === null || !('status' in value)) return false;
  if (value.status === 'unconfigured') return true;
  if (value.status === 'signed-out') return !('reason' in value) || value.reason === 'expired';
  return value.status === 'signed-in' && 'user' in value && isSessionUser(value.user)
    && 'csrfToken' in value && typeof value.csrfToken === 'string'
    && 'authorization' in value && (value.authorization === 'ready' || value.authorization === 'reauthorize');
}

export function isSessionContextFailure(status: number, code: string): boolean {
  return status === 401 || (status === 409 && code === 'session_changed') || (status === 403 && code === 'csrf');
}
