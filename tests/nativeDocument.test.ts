import assert from 'node:assert/strict';
import { test } from 'node:test';
import { itemReferenceValidator } from '../src/shared/items.js';
import { nativeSchema, validateNativeDocument } from '../src/shared/nativeDocument.js';

function documentInput() {
  return { format: 'gitbored-native', version: 1, snapshot: {
    schema: nativeSchema.serialize(),
    store: {
      'document:document': { id: 'document:document', typeName: 'document', name: '', meta: {}, gridSize: 10 },
      'page:page': { id: 'page:page', typeName: 'page', name: 'Page 1', index: 'a1', meta: {} },
      'shape:card': { id: 'shape:card', typeName: 'shape', type: 'item-card', parentId: 'page:page', index: 'a1', x: 120, y: 80, rotation: 0, opacity: 1, isLocked: false, meta: {}, props: { version: 1, referenceId: 'ref-1', kind: 'pull-request', w: 320, h: 240 } },
    },
  } };
}
await test('reference documents preserve independent placement geometry without fetched data', () => {
  const input = documentInput();
  const document = validateNativeDocument(input);
  assert.deepEqual(Object.values(document.snapshot.store).find((record) => record.id === 'shape:card'), input.snapshot.store['shape:card']);
  assert.deepEqual(validateNativeDocument(JSON.parse(JSON.stringify(document))), document);
});
await test('import rejects private caches, unexpected properties and unsupported schemas', () => {
  const input = documentInput();
  const card = input.snapshot.store['shape:card'];
  for (const invalid of [
    { ...input, version: 2 },
    { ...input, privateCache: { title: 'Private title' } },
    { ...input, snapshot: { ...input.snapshot, session: {} } },
    { ...input, snapshot: { ...input.snapshot, schema: { schemaVersion: 2, sequences: { ...input.snapshot.schema.sequences, 'com.tldraw.shape.item-card': 99 } } } },
  ]) assert.throws(() => validateNativeDocument(invalid));
  for (const invalidCard of [
    { ...card, type: 'image' }, { ...card, type: 'embed' },
    { ...card, meta: { title: 'Private title' } },
    { ...card, props: { ...card.props, title: 'Private title' } },
    { ...card, props: { ...card.props, version: 2 } },
    { ...card, props: { ...card.props, w: 0 } },
    { ...card, parentId: card.id },
  ]) assert.throws(() => validateNativeDocument({ ...input, snapshot: { ...input.snapshot, store: { ...input.snapshot.store, [card.id]: invalidCard } } }));
});
await test('supported older custom card schema migrates to explicit version one', () => {
  const input = documentInput();
  const { version: _version, ...props } = input.snapshot.store['shape:card'].props;
  input.snapshot.schema.sequences['com.tldraw.shape.item-card'] = 0;
  const document = validateNativeDocument({ ...input, snapshot: { ...input.snapshot, store: { ...input.snapshot.store, 'shape:card': { ...input.snapshot.store['shape:card'], props } } } });
  const shape = Object.values(document.snapshot.store).find((record) => record.id === 'shape:card');
  assert.equal(shape?.typeName === 'shape' && shape.type === 'item-card' && shape.props.version, 1);
});
await test('provider IDs remain lossless strings instead of rounded JavaScript numbers', () => {
  const reference = { id: 'ref-1', host: 'github.com', kind: 'pull-request', repositoryNodeId: 'R_opaque', repositoryRestId: '9999999999999999999999', nodeId: 'PR_opaque', issueRestId: '9999999999999999999998', pullRequestRestId: '9999999999999999999997' };
  assert.equal(itemReferenceValidator.validate(reference).repositoryRestId, reference.repositoryRestId);
  assert.throws(() => itemReferenceValidator.validate({ ...reference, repositoryRestId: Number('9999999999999999999999') }));
});
await test('import excludes SDK identity records and rejects unsafe annotation links', () => {
  const input = documentInput();
  assert.throws(() => validateNativeDocument({
    ...input, snapshot: { ...input.snapshot, store: {
      ...input.snapshot.store, 'user:local': { id: 'user:local', typeName: 'user', name: 'Private user', color: '#000000', imageUrl: '', meta: {} },
    } },
  }));
  const text = {
    ...input.snapshot.store['shape:card'], type: 'text', props: {
      color: 'black', size: 'm', font: 'draw', textAlign: 'start', w: 320, autoSize: true, scale: 1,
      richText: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Unsafe link', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] },
    },
  };
  assert.throws(() => validateNativeDocument({ ...input, snapshot: { ...input.snapshot, store: { ...input.snapshot.store, 'shape:card': text } } }));
  const mark = text.props.richText.content[0]?.content[0]?.marks[0];
  assert.ok(mark);
  mark.attrs.href = 'https://github.com/example/repository';
  assert.doesNotThrow(() => validateNativeDocument({ ...input, snapshot: { ...input.snapshot, store: { ...input.snapshot.store, 'shape:card': text } } }));
});
