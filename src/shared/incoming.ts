import { T } from '@tldraw/validate';
import type { ItemKind } from './items.js';

export interface IncomingCandidate { referenceId: string; kind: ItemKind }
export interface IncomingSource {
  repositoryNodeId: string;
  owner: string;
  repository: string;
  nextPage: number | null;
  loadedPage: number;
  status: 'idle' | 'loading' | 'partial' | 'complete' | 'error';
}
export interface IncomingState {
  version: 1;
  sources: IncomingSource[];
  queue: IncomingCandidate[];
  seen: string[];
}
export const MAX_INCOMING_REFERENCES = 20000;
const identifier = T.string.check((value) => { if (!value.length || value.length > 256) throw new Error('Invalid Incoming identifier'); });
const page = T.number.check((value) => { if (!Number.isSafeInteger(value) || value < 1 || value > 10000) throw new Error('Invalid Incoming cursor'); });
const loadedPage = T.number.check((value) => { if (!Number.isSafeInteger(value) || value < 0 || value > 10000) throw new Error('Invalid Incoming progress'); });
const validator = T.object({
  version: T.literal(1),
  sources: T.arrayOf(T.object({ repositoryNodeId: identifier, owner: identifier, repository: identifier,
    nextPage: page.nullable(), loadedPage, status: T.literalEnum('idle', 'loading', 'partial', 'complete', 'error') })),
  queue: T.arrayOf(T.object({ referenceId: identifier, kind: T.literalEnum('issue', 'pull-request') })),
  seen: T.arrayOf(identifier),
});
export function emptyIncoming(): IncomingState { return { version: 1, sources: [], queue: [], seen: [] }; }
export function validateIncoming(input: unknown): IncomingState {
  const result = validator.validate(input);
  if (result.sources.length > 100 || result.queue.length > MAX_INCOMING_REFERENCES || result.seen.length > MAX_INCOMING_REFERENCES
    || new Set(result.sources.map((source) => source.repositoryNodeId)).size !== result.sources.length
    || new Set(result.queue.map((candidate) => candidate.referenceId)).size !== result.queue.length
    || new Set(result.seen).size !== result.seen.length) throw new Error('Invalid Incoming bounds or duplicates');
  const seen = new Set(result.seen);
  if (result.queue.some((candidate) => !seen.has(candidate.referenceId))) throw new Error('Unseen Incoming candidate');
  for (const source of result.sources) {
    if (source.status === 'complete' ? source.nextPage !== null : source.nextPage === null) throw new Error('Invalid Incoming completeness');
    if (source.nextPage !== null && source.nextPage !== source.loadedPage + 1) throw new Error('Invalid Incoming progress');
  }
  return result;
}
