import { T } from '@tldraw/validate';
import { validateIncoming, type IncomingState } from './incoming.js';
import { nativeSchema, validateNativeDocument, type NativeDocument } from './nativeDocument.js';

export interface BoardSummary {
  id: string;
  title: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
}
export interface Board extends BoardSummary { document: NativeDocument; incoming: IncomingState }
/** Revision covers the document and atomic Incoming effects, not the display title. */
export interface BoardSave { expectedRevision: number; document: NativeDocument; incoming: IncomingState }
const revision = T.number.check((value) => { if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid revision'); });
export const boardTitle = T.string.check((value) => {
  if (value.trim().length === 0 || value.length > 160) throw new Error('Use a board name from 1 to 160 characters');
});
export const boardSummaryValidator = T.object({ id: T.string, title: boardTitle, revision, createdAt: T.number, updatedAt: T.number });
export const boardSaveValidator = T.object({ expectedRevision: revision, document: T.unknown, incoming: T.unknown });
export const boardNameValidator = T.object({ title: boardTitle });
export function validateBoard(input: unknown): Board {
  const value = T.object({ id: T.string, title: boardTitle, revision, createdAt: T.number, updatedAt: T.number, document: T.unknown, incoming: T.unknown }).validate(input);
  return { ...value, document: validateNativeDocument(value.document), incoming: validateIncoming(value.incoming) };
}
export function createEmptyBoardDocument(): NativeDocument {
  return validateNativeDocument({ format: 'gitbored-native', version: 1, snapshot: { schema: nativeSchema.serialize(), store: {
    'document:document': { id: 'document:document', typeName: 'document', name: '', meta: {}, gridSize: 10 },
    'page:page': { id: 'page:page', typeName: 'page', name: 'Page 1', index: 'a1', meta: {} },
  } } });
}
