import { createContext, useContext } from 'react';
import type { ItemMetadata, ItemMetadataState, WorkspaceMetadata } from '../../shared/items';

export const MetadataContext = createContext<WorkspaceMetadata>(new Map());
export const anonymousMetadata: ItemMetadataState = { status: 'unresolved' };
export function useItemMetadata(referenceId: string): ItemMetadataState {
  return useContext(MetadataContext).get(referenceId) ?? anonymousMetadata;
}
export function describeItem(kind: 'issue' | 'pull-request', state: ItemMetadataState): string {
  const label = kind === 'issue' ? 'Issue' : 'Pull request';
  if (state.status !== 'ready' || state.item.kind !== kind) {
    return `${label} · ${state.status === 'ready' ? 'unavailable' : state.status === 'sso-required' ? 'SSO required. Reconnect your organisation' : state.status}. Placement preserved.`;
  }
  const { item } = state;
  return `${label} ${item.locator.owner}/${item.locator.repository} #${item.locator.number}: ${item.title}. ${item.state}${item.freshness === 'stale' ? ' · Stale metadata' : ''}`;
}

export function itemStateLabel(item: ItemMetadata): string {
  const state = item.state === 'unknown' ? item.sourceState : item.state;
  if (item.kind === 'issue' && state === 'closed' && item.stateReason?.toLowerCase() === 'not_planned') return 'Cancelled';
  return state ? state.charAt(0).toUpperCase() + state.slice(1) : 'Status unavailable';
}
