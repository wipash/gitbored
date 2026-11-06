import type { SessionResponse } from '../shared/session';
type SignedInSession = Extract<SessionResponse, { status: 'signed-in' }>;
export class SourceReadError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) { super(message); }
}
export async function requestJson<T>(path: string, signal: AbortSignal, session: SignedInSession, decode: (value: unknown) => T, url?: string): Promise<T> {
  const response = await fetch(path, { signal, cache: 'no-store', headers: {
    'X-CSRF-Token': session.csrfToken, ...(url === undefined ? {} : { 'Content-Type': 'application/json' }),
  }, ...(url === undefined ? {} : { method: 'POST', body: JSON.stringify({ url }) }) });
  const value: unknown = await response.json();
  if (!response.ok) {
    const message = typeof value === 'object' && value !== null && 'message' in value && typeof value.message === 'string'
      ? value.message : 'This read could not be completed. Check your connection and retry.';
    const code = typeof value === 'object' && value !== null && 'error' in value && typeof value.error === 'string' ? value.error : '';
    throw new SourceReadError(response.status, code, message);
  }
  return decode(value);
}
