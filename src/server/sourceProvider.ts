import type { ItemKind } from '../shared/items.js';
import type { Installation, RepositorySource } from '../shared/sources.js';
import { AuthenticationError } from './auth.js';

export function invalidProvider(): never {
  throw new AuthenticationError(502, 'invalid_provider', 'GitHub returned incomplete or invalid data. Retry this page shortly.');
}
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function object(value: unknown): Record<string, unknown> {
  if (!isObject(value)) return invalidProvider();
  return value;
}
export function text(value: unknown, maximum = 65536): string {
  if (typeof value !== 'string' || value.length > maximum) return invalidProvider();
  return value;
}
export function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,127}$/.test(value)) return invalidProvider();
  return value;
}
export function opaque(value: unknown): string {
  const result = text(value, 256);
  return result.length ? result : invalidProvider();
}
export function list(value: unknown, maximum = 100): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) return invalidProvider();
  return value;
}
export function boolean(value: unknown): boolean {
  return typeof value === 'boolean' ? value : invalidProvider();
}
export function number(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : invalidProvider();
}
export function owner(value: unknown): string {
  const result = text(value, 39);
  return /^[A-Za-z0-9-]+$/.test(result) ? result : invalidProvider();
}
export function repositoryName(value: unknown): string {
  const result = text(value, 100);
  return /^[A-Za-z0-9_.-]+$/.test(result) && result !== '.' && result !== '..' ? result : invalidProvider();
}
export function repository(value: unknown): RepositorySource {
  const row = object(value);
  return { id: id(row['id']), nodeId: opaque(row['node_id']), owner: owner(object(row['owner'])['login']),
    name: repositoryName(row['name']), private: boolean(row['private']) };
}
export function installation(value: unknown): Installation {
  const row = object(value); const account = object(row['account']);
  const ownerType = account['type']; const selection = row['repository_selection'];
  if ((ownerType !== 'User' && ownerType !== 'Organization') || (selection !== 'all' && selection !== 'selected')) return invalidProvider();
  if (!(row['suspended_at'] === null || typeof row['suspended_at'] === 'string')) return invalidProvider();
  return { id: id(row['id']), owner: owner(account['login']), ownerType, repositorySelection: selection, suspended: row['suspended_at'] !== null };
}
export interface ItemUrl { owner: string; repository: string; kind: ItemKind; number: number }
export function parseItemUrl(input: unknown): ItemUrl {
  const fail = (): never => { throw new AuthenticationError(400, 'invalid_url', 'Use an HTTPS github.com owner/repository/issues/number or owner/repository/pull/number URL, without a query or fragment.'); };
  if (typeof input !== 'string' || input.length > 512) return fail();
  let url: URL;
  try { url = new URL(input); } catch { return fail(); }
  if (url.protocol !== 'https:' || url.host !== 'github.com' || url.username || url.password || url.search || url.hash
    || input !== `${url.origin}${url.pathname}` || input.includes('%') || input.includes('\\')) return fail();
  const match = /^\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9_.-]{1,100})\/(issues|pull)\/([1-9][0-9]*)\/?$/.exec(url.pathname);
  if (!match || match[2] === '.' || match[2] === '..' || !Number.isSafeInteger(Number(match[4]))) return fail();
  return { owner: match[1] ?? '', repository: match[2] ?? '', kind: match[3] === 'pull' ? 'pull-request' : 'issue', number: Number(match[4]) };
}

/** Reviver context reads original JSON tokens before any numeric rounding can become identity. */
function decode(raw: string): unknown {
  return JSON.parse(raw, (key: string, value: unknown, context?: { source: string }) => {
    if (key !== 'id' || typeof value !== 'number') return value;
    if (!context || !/^[1-9][0-9]*$/.test(context.source)) return invalidProvider();
    return context.source;
  });
}
export async function providerRead(origin: string, token: string, path: string, page?: number): Promise<{ value: unknown; nextPage: number | null }> {
  const url = new URL(path, origin);
  if (page !== undefined) { url.searchParams.set('per_page', '30'); url.searchParams.set('page', String(page)); }
  let response: Response;
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      redirect: 'error', signal: AbortSignal.timeout(15000) });
  } catch { throw new AuthenticationError(502, 'provider_unavailable', 'GitHub could not be reached. Retry this page shortly.'); }
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 401) throw new AuthenticationError(401, 'reauthorize', 'GitHub authorization ended. Reconnect GitHub to continue.');
    if (response.status === 403 || response.status === 429) {
      const rate = response.status === 429 || response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after');
      throw new AuthenticationError(rate ? 429 : 403, rate ? 'rate_limit' : 'missing_access', rate
        ? 'GitHub is limiting requests. Wait before retrying this page.'
        : 'GitHub denied this read. Check the app installation, selected repositories and organization approval, then retry.');
    }
    if (response.status === 404) throw new AuthenticationError(404, 'unavailable', 'This item or repository is unavailable to your GitHub authorization. Check the URL, installation access and organization approval, then retry. A private 404 does not mean deletion.');
    throw new AuthenticationError(502, 'provider_unavailable', 'GitHub could not complete this read. Retry this page shortly.');
  }
  let raw = ''; const reader = response.body?.getReader(); const decoder = new TextDecoder(); let size = 0;
  if (!reader) return invalidProvider();
  try {
    while (true) {
      const part = await reader.read(); if (part.done) break;
      size += part.value.byteLength;
      if (size > 4_000_000) { await reader.cancel(); return invalidProvider(); }
      raw += decoder.decode(part.value, { stream: true });
    }
    raw += decoder.decode();
  } catch { return invalidProvider(); }
  let value: unknown;
  try { value = decode(raw); } catch { return invalidProvider(); }
  let nextPage: number | null = null;
  const link = response.headers.get('link');
  if (page !== undefined && link) {
    for (const segment of link.split(',')) {
      if (!/;\s*rel="next"/.test(segment)) continue;
      const match = /^\s*<([^>]+)>/.exec(segment); if (!match?.[1]) return invalidProvider();
      let next: URL; try { next = new URL(match[1]); } catch { return invalidProvider(); }
      const nextValue = next.searchParams.get('page');
      if (next.origin !== url.origin || next.pathname !== url.pathname || next.username || next.password || next.hash
        || next.searchParams.get('per_page') !== '30' || !nextValue || !/^[1-9][0-9]*$/.test(nextValue)
        || Number(nextValue) !== page + 1 || Number(nextValue) > 10000) return invalidProvider();
      // Only the validated page number is used. Never follow a provider-supplied URL.
      nextPage = Number(nextValue);
    }
  }
  return { value, nextPage };
}
