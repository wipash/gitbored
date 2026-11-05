import { shapeIdValidator, type TLBinding, type TLShape, type TLShapeId, type TLStoreSnapshot } from '@tldraw/tlschema';
import { T } from '@tldraw/validate';
import { ITEM_CARD_TYPE, nativeSchema, nativeSerializedSchemaValidator, validateNativeShape } from './nativeDocument.js';

export interface NativeClipboardContent {
  shapes: TLShape[];
  bindings: TLBinding[] | undefined;
  rootShapeIds: TLShapeId[];
  assets: never[];
  users: never[];
  schema: TLStoreSnapshot['schema'];
}
const clipboardValidator = T.object({
  shapes: T.arrayOf(T.unknown), bindings: T.arrayOf(T.unknown).optional(),
  rootShapeIds: T.arrayOf(shapeIdValidator), assets: T.arrayOf(T.unknown),
  users: T.arrayOf(T.unknown).optional(), schema: nativeSerializedSchemaValidator,
});
const recordHeader = T.object({ id: T.string, typeName: T.string }).allowUnknownProperties();

/** Rebuild the entire SDK payload after validation; never forward unchecked record collections. */
export function validateNativeClipboard(input: unknown, knownReferences: ReadonlySet<string>): NativeClipboardContent {
  const content = clipboardValidator.validate(input);
  // Native note copies include attribution users. Validate them, but never forward identities.
  if (content.assets.length) throw new Error('Unsupported clipboard records');
  if (content.shapes.length + (content.bindings?.length ?? 0) + (content.users?.length ?? 0) > 20000) throw new Error('Too many clipboard records');
  const store: Record<string, unknown> = {};
  for (const [typeName, records] of Object.entries({ shape: content.shapes, binding: content.bindings ?? [], user: content.users ?? [] })) {
    for (const value of records) {
      const record = recordHeader.validate(value);
      if (record.typeName !== typeName || !record.id.startsWith(`${typeName}:`) || Object.hasOwn(store, record.id)) throw new Error('Invalid clipboard record collection');
      store[record.id] = value;
    }
  }
  if (!nativeSchema.getMigrationsSince(content.schema).ok) throw new Error('Unsupported clipboard schema');
  // Only SDK record headers have been read so far; migration precedes complete validation below.
  // oxlint-disable-next-line typescript/consistent-type-assertions
  const migration = nativeSchema.migrateStoreSnapshot({ store, schema: content.schema } as TLStoreSnapshot);
  if (migration.type !== 'success') throw new Error('Unsupported clipboard schema');
  const shapes: TLShape[] = [];
  const bindings: TLBinding[] = [];
  for (const record of Object.values(migration.value)) {
    if (record.typeName === 'shape') {
      const shape = validateNativeShape(record);
      if (shape.type === ITEM_CARD_TYPE && !knownReferences.has(shape.props.referenceId)) throw new Error('Unknown clipboard reference');
      shapes.push(shape);
    } else if (record.typeName === 'binding') {
      nativeSchema.types.binding.validate(record);
      if (Object.keys(record.meta).length) throw new Error('Unsupported clipboard metadata');
      bindings.push(record);
    } else if (record.typeName === 'user') {
      nativeSchema.types.user.validate(record);
    } else throw new Error('Unsupported clipboard record');
  }
  const ids = new Set(shapes.map((shape) => shape.id));
  if (content.rootShapeIds.some((id) => !ids.has(id)) || new Set(content.rootShapeIds).size !== content.rootShapeIds.length) throw new Error('Invalid clipboard roots');
  if (bindings.some((binding) => !ids.has(binding.fromId) || !ids.has(binding.toId))) throw new Error('Missing bound clipboard shape');
  const byId = new Map<string, TLShape>(shapes.map((shape) => [shape.id, shape]));
  const roots = new Set(content.rootShapeIds);
  for (const shape of shapes) {
    if (roots.has(shape.id) === byId.has(shape.parentId)) throw new Error('Invalid clipboard root parent');
    const seen = new Set([shape.id]);
    let parent = byId.get(shape.parentId);
    while (parent) {
      if (seen.has(parent.id) || (parent.type !== 'group' && parent.type !== 'frame')) throw new Error('Invalid clipboard parent');
      seen.add(parent.id);
      parent = byId.get(parent.parentId);
    }
  }
  return { shapes, bindings, rootShapeIds: content.rootShapeIds, assets: [], users: [], schema: nativeSchema.serialize() };
}
