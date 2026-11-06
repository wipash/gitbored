import { createContext } from 'react';
import type { CachedBoardMetadata } from '../../shared/cachedMetadata';
import type { WorkspaceMetadata } from '../../shared/items';
import type { BoardAuthority } from './boardRequest';

export interface BoardMetadataBootstrap { authority: BoardAuthority; value: CachedBoardMetadata }
export const BoardMetadataContext = createContext<BoardMetadataBootstrap | null>(null);
export function cachedWorkspaceMetadata(cache: CachedBoardMetadata): WorkspaceMetadata {
  return new Map(cache.items.map(({ item, context, stale, contextStale }) => [item.reference.id, {
    status: 'ready' as const,
    item: { ...item.metadata, freshness: stale ? 'stale' as const : 'current' as const, ...(context ? { context } : {}) },
    refreshing: stale || contextStale,
  }]));
}
