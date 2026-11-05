import { createContext, useContext } from 'react';
import type { ItemMetadataState, WorkspaceMetadata } from '../../shared/items';

export const MetadataContext = createContext<WorkspaceMetadata>(new Map());
export const anonymousMetadata: ItemMetadataState = { status: 'unresolved' };
export function useItemMetadata(referenceId: string): ItemMetadataState {
  return useContext(MetadataContext).get(referenceId) ?? anonymousMetadata;
}
export function describeItem(kind: 'issue' | 'pull-request', state: ItemMetadataState): string {
  const label = kind === 'issue' ? 'Issue' : 'Pull request';
  if (state.status !== 'ready' || state.item.kind !== kind) {
    return `${label} · ${state.status === 'ready' ? 'unavailable' : state.status}. Placement preserved.`;
  }
  const { item } = state;
  return `${label} ${item.locator.owner}/${item.locator.repository} #${item.locator.number}: ${item.title}. ${item.state}${item.freshness === 'stale' ? ' · Stale metadata' : ''}`;
}
