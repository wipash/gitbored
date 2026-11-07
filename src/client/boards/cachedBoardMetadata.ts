import { createContext } from 'react';
import { readCachedBoardMetadata, type CachedBoardMetadata } from '../../shared/cachedMetadata';
import type { WorkspaceMetadata } from '../../shared/items';
import { requestBoard, type BoardAuthority } from './boardRequest';

export interface BoardMetadataBootstrap { authority: BoardAuthority; value: CachedBoardMetadata }
export const BoardMetadataContext = createContext<BoardMetadataBootstrap | null>(null);
export function cachedWorkspaceMetadata(cache: CachedBoardMetadata): WorkspaceMetadata {
  return new Map(cache.items.map(({ item, context, stale, contextStale }) => [item.reference.id, {
    status: 'ready' as const,
    item: { ...item.metadata, freshness: stale ? 'stale' as const : 'current' as const, ...(context ? { context } : {}) },
    refreshing: stale || contextStale,
  }]));
}

/** Optional cache bootstrap never prevents opening the native board. */
export async function loadCachedBoardMetadata(boardId: string, authority: BoardAuthority, signal: AbortSignal): Promise<CachedBoardMetadata> {
  if (authority.session.authorization !== 'ready') return { items: [] };
  try {
    const response = await requestBoard(`/api/boards/${encodeURIComponent(boardId)}/metadata`, authority, 'GET', undefined, signal);
    return response.ok ? readCachedBoardMetadata(await response.json()) : { items: [] };
  } catch {
    return { items: [] };
  }
}
