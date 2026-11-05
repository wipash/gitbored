import { T } from '@tldraw/validate';

export type ItemKind = 'issue' | 'pull-request';

export const itemReferenceIdValidator = T.string.check((value) => {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error('Invalid item reference');
});
export const itemKindValidator = T.literalEnum('issue', 'pull-request');
const opaqueId = T.string.check((value) => {
  if (value.length === 0 || value.length > 256) throw new Error('Invalid provider identifier');
});
const decimalId = T.string.check((value) => {
  if (!/^[1-9][0-9]*$/.test(value)) throw new Error('Provider REST IDs must be lossless decimal strings');
});

// Locators and private metadata live in the authorized registry, never in a shape.
export const itemReferenceValidator = T.object({
  id: itemReferenceIdValidator,
  host: T.literal('github.com'),
  kind: itemKindValidator,
  repositoryNodeId: opaqueId,
  repositoryRestId: decimalId,
  nodeId: opaqueId,
  issueRestId: decimalId.nullable(),
  pullRequestRestId: decimalId.nullable(),
});
export type ItemReference = T.TypeOf<typeof itemReferenceValidator>;

export interface GitHubLocator {
  owner: string;
  repository: string;
  number: number;
}

export function githubItemUrl(kind: ItemKind, locator: GitHubLocator): string | null {
  if (!/^[A-Za-z0-9-]+$/.test(locator.owner)
    || !/^[A-Za-z0-9_.-]+$/.test(locator.repository)
    || locator.repository === '.' || locator.repository === '..'
    || !Number.isSafeInteger(locator.number) || locator.number <= 0) return null;
  return `https://github.com/${locator.owner}/${locator.repository}/${kind === 'issue' ? 'issues' : 'pull'}/${locator.number}`;
}

export interface ItemMetadata {
  kind: ItemKind;
  locator: GitHubLocator;
  title: string;
  state: 'open' | 'closed' | 'draft' | 'merged' | 'unknown';
  labels: readonly string[];
  assignees: readonly string[];
  freshness: 'current' | 'stale';
  stateReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string | null;
}

export type ItemMetadataState =
  | { status: 'ready'; item: ItemMetadata }
  | { status: 'unresolved' | 'loading' | 'unavailable' | 'error' };

// The owner replaces/clears this map on authorization changes. No card fetches data.
export type WorkspaceMetadata = ReadonlyMap<string, ItemMetadataState>;
