import type { SessionResponse } from '../../shared/session';
import { isSessionContextFailure } from '../../shared/session';
import { BoardSaveError } from './saveCoordinator';

export interface BoardAuthority { session: Extract<SessionResponse, { status: 'signed-in' }>; ready: boolean; reconcile(): Promise<void> }
export async function requestBoard(url: string, authority: BoardAuthority, method: string, data?: unknown, signal?: AbortSignal): Promise<Response> {
  if (!authority.ready) throw new BoardSaveError('blocked');
  const response = await fetch(url, { method, cache: 'no-store', ...(signal ? { signal } : {}), headers: { 'X-CSRF-Token': authority.session.csrfToken, ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
  if (!response.ok) {
    const failure: unknown = await response.clone().json().catch(() => null);
    const code = typeof failure === 'object' && failure !== null && 'error' in failure && typeof failure.error === 'string' ? failure.error : '';
    if (isSessionContextFailure(response.status, code)) {
      await authority.reconcile();
      throw new BoardSaveError('blocked');
    }
  }
  return response;
}
