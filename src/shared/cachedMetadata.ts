import { readItemContext, type ItemContext } from './planning.js';
import { readSourceItem, type SourceItem } from './sources.js';

export interface CachedBoardMetadataItem {
  item: SourceItem;
  context: ItemContext | null;
  stale: boolean;
  contextStale: boolean;
}
export interface CachedBoardMetadata { items: CachedBoardMetadataItem[] }

export function readCachedBoardMetadata(value: unknown): CachedBoardMetadata {
  if (typeof value !== 'object' || value === null || !('items' in value) || !Array.isArray(value.items)) {
    throw new Error('Invalid cached board metadata. Reload the board to retry.');
  }
  return { items: value.items.map((entry: unknown) => {
    if (typeof entry !== 'object' || entry === null || !('item' in entry) || !('context' in entry)
      || !('stale' in entry) || typeof entry.stale !== 'boolean' || !('contextStale' in entry) || typeof entry.contextStale !== 'boolean') {
      throw new Error('Invalid cached card metadata. Reload the board to retry.');
    }
    return { item: readSourceItem(entry.item), context: entry.context === null ? null : readItemContext(entry.context),
      stale: entry.stale, contextStale: entry.contextStale };
  }) };
}
