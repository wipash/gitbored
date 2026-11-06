import {
  createShapePropsMigrationIds, createShapePropsMigrationSequence, createTLSchema,
  defaultShapeSchemas, type TLShape, type TLStoreSnapshot,
} from '@tldraw/tlschema';
import { T } from '@tldraw/validate';
import { itemKindValidator, itemReferenceIdValidator } from './items.js';
import { annotationLinkValidator, validateNativeRichText } from './nativeRichText.js';

export const ITEM_CARD_TYPE = 'item-card';
export interface ItemCardProps {
  version: 1;
  referenceId: string;
  kind: 'issue' | 'pull-request';
  w: number;
  h: number;
}
declare module '@tldraw/tlschema' {
  interface TLGlobalShapePropsMap { 'item-card': ItemCardProps }
}
export type ItemCardShape = TLShape<typeof ITEM_CARD_TYPE>;
const dimension = T.number.check((value) => {
  if (!Number.isFinite(value) || value < 180 || value > 1920) throw new Error('Invalid card dimension');
});
export const itemCardProps = {
  version: T.literal(1), referenceId: itemReferenceIdValidator,
  kind: itemKindValidator, w: dimension, h: dimension,
};
const versions = createShapePropsMigrationIds(ITEM_CARD_TYPE, { AddVersion: 1 });
export const itemCardMigrations = createShapePropsMigrationSequence({
  sequence: [{ id: versions.AddVersion, up: (props: unknown) => {
    const previous = T.object({}).allowUnknownProperties().validate(props);
    return { ...previous, version: 1 };
  }, down: 'retired' }],
});
export const nativeShapeSchemas = {
  arrow: defaultShapeSchemas.arrow, draw: defaultShapeSchemas.draw,
  frame: defaultShapeSchemas.frame, geo: defaultShapeSchemas.geo,
  group: defaultShapeSchemas.group, highlight: defaultShapeSchemas.highlight,
  line: defaultShapeSchemas.line, note: defaultShapeSchemas.note,
  text: defaultShapeSchemas.text,
  [ITEM_CARD_TYPE]: { props: itemCardProps, migrations: itemCardMigrations },
};
export const nativeSchema = createTLSchema({ shapes: nativeShapeSchemas, assets: {} });
export interface NativeDocument {
  format: 'gitbored-native';
  version: 1;
  snapshot: TLStoreSnapshot;
}
export const nativeSerializedSchemaValidator = T.object({
  schemaVersion: T.literal(2), sequences: T.dict(T.string, T.number),
});
const envelopeValidator = T.object({
  format: T.literal('gitbored-native'), version: T.literal(1),
  snapshot: T.object({
    schema: nativeSerializedSchemaValidator,
    store: T.dict(T.string, T.unknown),
  }),
});
export const MAX_NATIVE_DOCUMENT_BYTES = 8 * 1024 * 1024;


/** Validates a native shape at import and clipboard boundaries, including user-authored links. */
export function validateNativeShape(input: unknown) {
  const shape = nativeSchema.types.shape.validate(input);
  if (shape.typeName !== 'shape') throw new Error('Expected canvas shape');
  if (Object.keys(shape.meta).length > 0) throw new Error('Canvas record metadata is not supported');
  if ('richText' in shape.props) validateNativeRichText(shape.props.richText);
  if ('url' in shape.props) annotationLinkValidator.validate(shape.props.url);
  if (shape.type === 'note' && shape.props.textLastEditedBy !== null) {
    return { ...shape, props: { ...shape.props, textLastEditedBy: null } };
  }
  return shape;
}
/** Server-safe validation and SDK migration. Accept JSON values, not editor/session state. */
export function validateNativeDocument(input: unknown): NativeDocument {
  const serialized = JSON.stringify(input);
  if (serialized === undefined || new TextEncoder().encode(serialized).length > MAX_NATIVE_DOCUMENT_BYTES) {
    throw new Error('Canvas document exceeds the supported size');
  }
  // Detach from caller mutation and reject non-JSON values before SDK migrations.
  const envelope = envelopeValidator.validate(JSON.parse(serialized));
  const records = Object.values(envelope.snapshot.store);
  if (records.length > 20000) throw new Error('Too many canvas records');
  const recordHeader = T.object({ id: T.string, typeName: T.string }).allowUnknownProperties();
  for (const [id, value] of Object.entries(envelope.snapshot.store)) {
    const record = recordHeader.validate(value);
    if (record.id !== id || !['document', 'page', 'shape', 'binding'].includes(record.typeName)) {
      throw new Error('Unsupported canvas record');
    }
  }
  if (!nativeSchema.getMigrationsSince(envelope.snapshot.schema).ok) throw new Error('Unsupported canvas schema');
  // The envelope validates JSON/schema/record headers; SDK migrations precede record validation.
  // oxlint-disable-next-line typescript/consistent-type-assertions
  const migration = nativeSchema.migrateStoreSnapshot(envelope.snapshot as TLStoreSnapshot);
  if (migration.type !== 'success') throw new Error(`Unsupported canvas schema: ${migration.reason}`);
  const store = migration.value;
  for (const record of Object.values(store)) {
    switch (record.typeName) {
      case 'document': nativeSchema.types.document.validate(record); break;
      case 'page': nativeSchema.types.page.validate(record); break;
      case 'shape': store[record.id] = validateNativeShape(record); break;
      case 'binding': nativeSchema.types.binding.validate(record); break;
      default: throw new Error('Unsupported canvas record');
    }
    if (Object.keys(record.meta).length > 0) throw new Error('Canvas record metadata is not supported');
    if (record.typeName === 'shape') {
      const visited = new Set([record.id]);
      let parent = store[record.parentId];
      while (parent?.typeName === 'shape') {
        if (visited.has(parent.id) || (parent.type !== 'group' && parent.type !== 'frame')) {
          throw new Error('Invalid canvas parent');
        }
        visited.add(parent.id);
        parent = store[parent.parentId];
      }
      if (parent?.typeName !== 'page') throw new Error('Missing canvas page');
    }
    if (record.typeName === 'binding'
      && (store[record.fromId]?.typeName !== 'shape' || store[record.toId]?.typeName !== 'shape')) {
      throw new Error('Missing bound canvas shape');
    }
  }
  if (!Object.values(store).some((record) => record.id === 'document:document' && record.typeName === 'document')
    || !Object.values(store).some((record) => record.typeName === 'page')) throw new Error('Missing canvas document or page');
  return { format: 'gitbored-native', version: 1, snapshot: { store, schema: nativeSchema.serialize() } };
}

export function getDocumentReferenceIds(document: NativeDocument): string[] {
  return [...new Set(Object.values(document.snapshot.store).flatMap((record) =>
    record.typeName === 'shape' && record.type === ITEM_CARD_TYPE ? [record.props.referenceId] : []))];
}
