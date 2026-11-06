import { T } from '@tldraw/validate';
import { itemReferenceValidator } from './items.js';
import type { ItemMetadata, ItemReference } from './items.js';

export interface Installation {
  id: string;
  owner: string;
  ownerType: 'User' | 'Organization';
  repositorySelection: 'all' | 'selected';
  suspended: boolean;
}
export interface RepositorySource {
  id: string;
  nodeId: string;
  owner: string;
  name: string;
  private: boolean;
}
export interface SourceItem {
  reference: ItemReference;
  metadata: ItemMetadata;
}
export interface SourcePage<T> {
  items: T[];
  page: number;
  nextPage: number | null;
}

const installationValidator = T.object({
  id: T.string, owner: T.string, ownerType: T.literalEnum('User', 'Organization'),
  repositorySelection: T.literalEnum('all', 'selected'), suspended: T.boolean,
});
const repositoryValidator = T.object({ id: T.string, nodeId: T.string, owner: T.string, name: T.string, private: T.boolean });
const sourceItemValidator = T.object({
  reference: itemReferenceValidator,
  metadata: T.object({
    kind: T.literalEnum('issue', 'pull-request'),
    locator: T.object({ owner: T.string, repository: T.string, number: T.number }),
    title: T.string, state: T.literalEnum('open', 'closed', 'draft', 'merged', 'unknown'),
    labels: T.arrayOf(T.string), assignees: T.arrayOf(T.string), freshness: T.literalEnum('current', 'stale'),
    sourceState: T.literalEnum('open', 'closed').optional(),
    stateReason: T.string.nullable(), createdAt: T.string, updatedAt: T.string, closedAt: T.string.nullable(),
  }),
});
export function readInstallation(value: unknown): Installation { return installationValidator.validate(value); }
export function readRepository(value: unknown): RepositorySource { return repositoryValidator.validate(value); }
export function readRepositoryLocator(value: unknown): { owner: string; name: string } {
  return T.object({ owner: T.string, name: T.string }).validate(value);
}
export function readSourceItem(value: unknown): SourceItem { return sourceItemValidator.validate(value); }
export function readSourcePage<T>(value: unknown, readItem: (item: unknown) => T): SourcePage<T> {
  if (typeof value !== 'object' || value === null || !('items' in value) || !Array.isArray(value.items)
    || !('page' in value) || typeof value.page !== 'number' || !Number.isSafeInteger(value.page) || value.page < 1
    || !('nextPage' in value) || !(value.nextPage === null || (typeof value.nextPage === 'number' && value.nextPage === value.page + 1))) {
    throw new Error('The application returned an invalid page. Reload and retry.');
  }
  return { items: value.items.map(readItem), page: value.page, nextPage: value.nextPage };
}
