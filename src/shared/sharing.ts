import { T } from '@tldraw/validate';
import { boardTitle } from './boards.js';
import { readCachedBoardMetadata, type CachedBoardMetadata } from './cachedMetadata.js';
import { validateNativeDocument, type NativeDocument } from './nativeDocument.js';
import { planningSelectionValidator, type PlanningSelection } from './planning.js';

export const sharingModeValidator = T.literalEnum('private', 'link', 'people');
export type SharingMode = T.TypeOf<typeof sharingModeValidator>;
const version = T.number.check((value) => { if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid sharing version'); });
export const shareTokenPattern = /^[A-Za-z0-9_-]{43}$/;
export const shareReturnPathPattern = /^\/share\/[A-Za-z0-9_-]{43}$/;
const person = T.object({ id: T.string, login: T.string, name: T.string.nullable() });
const settingsValidator = T.object({ mode: sharingModeValidator, path: T.string.check((value) => {
  if (!shareReturnPathPattern.test(value)) throw new Error('Invalid share link');
}), people: T.arrayOf(person), version });
export type SharingSettings = T.TypeOf<typeof settingsValidator>;
export const sharingUpdateValidator = T.object({
  mode: sharingModeValidator,
  logins: T.arrayOf(T.string.check((value) => {
    if (!/^[A-Za-z0-9_-]{1,39}$/.test(value)) throw new Error('Enter an existing GitHub username');
  })).check((values) => { if (values.length > 100) throw new Error('Too many people'); }),
  expectedVersion: version,
});
export function readSharingSettings(value: unknown): SharingSettings { return settingsValidator.validate(value); }

export interface SharedBoard {
  id: string;
  title: string;
  revision: number;
  document: NativeDocument;
  planning: PlanningSelection | null;
  metadata: CachedBoardMetadata;
  publishedAt: number;
  publicationVersion: number;
}
export type SharedBoardDetails = Omit<SharedBoard, 'document'>;
const sharedDetailsValidator = T.object({
  id: T.string, title: boardTitle, revision: version,
  planning: planningSelectionValidator.nullable(), metadata: T.unknown,
  publishedAt: version, publicationVersion: version,
});
export function readSharedBoardDetails(input: unknown): SharedBoardDetails {
  const value = sharedDetailsValidator.validate(input);
  return { ...value, metadata: readCachedBoardMetadata(value.metadata) };
}
const sharedBoardValidator = T.object({
  id: T.string, title: boardTitle, revision: version, document: T.unknown,
  planning: planningSelectionValidator.nullable(), metadata: T.unknown,
  publishedAt: version, publicationVersion: version,
});
export function readSharedBoard(input: unknown): SharedBoard {
  const value = sharedBoardValidator.validate(input);
  return { ...value, document: validateNativeDocument(value.document), metadata: readCachedBoardMetadata(value.metadata) };
}
