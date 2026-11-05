import assert from 'node:assert/strict';
import { test } from 'node:test';
import { itemReferenceValidator } from '../src/shared/items.js';
import { nativeSchema, validateNativeDocument } from '../src/shared/nativeDocument.js';
import { validateNativeClipboard } from '../src/shared/nativeClipboard.js';
import { validateNativeRichText } from '../src/shared/nativeRichText.js';

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

function clipboardInput() {
  return { schema: nativeSchema.serialize(), shapes: [documentInput().snapshot.store['shape:card']], bindings: [], rootShapeIds: ['shape:card'], assets: [], users: [] };
}

await test('clipboard validates every collection instead of trusting the SDK collection name', () => {
  const clip = clipboardInput();
  const card = clip.shapes[0];
  assert.ok(card);
  const smuggled = { ...card, meta: { privateTitle: 'Not a canvas annotation' }, props: { ...card.props, referenceId: 'unknown-reference' } };
  const known = new Set(['ref-1']);
  assert.equal(validateNativeClipboard(clip, known).shapes[0]?.id, card.id);
  for (const invalid of [
    { ...clip, shapes: [], users: [smuggled] },
    { ...clip, shapes: [], users: [{ id: 'user:local', typeName: 'user', name: 'Private identity', color: '#000000', imageUrl: '', meta: {} }] },
    { ...clip, shapes: [], bindings: [smuggled] },
    { ...clip, assets: [smuggled] },
    { ...clip, shapes: [smuggled] },
    { ...clip, shapes: [{ ...card, props: { ...card.props, referenceId: 'unknown-reference' } }] },
    { ...clip, uncheckedCollection: [smuggled] },
    { ...clip, rootShapeIds: ['shape:missing'] },
  ]) assert.throws(() => validateNativeClipboard(invalid, known));
});

await test('document and clipboard reject rich text that the native renderer cannot display', () => {
  const input = documentInput();
  const clip = clipboardInput();
  const base = input.snapshot.store['shape:card'];
  const invalidTexts = [
    { type: 'doc', content: [{ type: 'image', attrs: { src: 'https://example.com/image.png' } }] },
    { type: 'doc', attrs: { privateTitle: 'Not an annotation' }, content: [{ type: 'paragraph' }] },
    { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'paragraph' }] }] },
    { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: '' }] }] },
    { type: 'doc', content: [{ type: 'heading', attrs: { level: 7 } }] },
    { type: 'doc', content: [{ type: 'orderedList', content: [{ type: 'paragraph' }] }] },
    { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Text', attrs: { src: 'https://example.com/image.png' } }] }] },
    { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Text', marks: [{ type: 'html', attrs: { html: '<iframe>' } }] }] }] },
    { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Text', marks: [{ type: 'bold', attrs: { privateTitle: 'Not an annotation' } }] }] }] },
  ];
  for (const richText of invalidTexts) {
    const text = { ...base, type: 'text', props: { color: 'black', size: 'm', font: 'draw', textAlign: 'start', w: 320, autoSize: true, scale: 1, richText } };
    assert.throws(() => validateNativeDocument({ ...input, snapshot: { ...input.snapshot, store: { ...input.snapshot.store, [base.id]: text } } }));
    assert.throws(() => validateNativeClipboard({ ...clip, shapes: [text] }, new Set()));
  }
});

await test('native rich text retains supported formatting, headings, direction and nested lists', () => {
  const richText = { type: 'doc', attrs: { dir: 'auto' }, content: [
    { type: 'heading', attrs: { level: 2, dir: 'rtl' }, content: [{ type: 'text', text: 'Heading', marks: [{ type: 'bold' }] }] },
    { type: 'paragraph', content: [
      { type: 'text', text: 'Formatting', marks: [{ type: 'italic' }, { type: 'strike' }, { type: 'underline' }, { type: 'code' }, { type: 'highlight' }] },
      { type: 'hardBreak', attrs: { dir: 'auto' } },
      { type: 'text', text: 'Email', marks: [{ type: 'link', attrs: { href: 'mailto:user@example.com', target: '_blank', rel: 'noopener noreferrer nofollow', class: null, title: null } }] },
    ] },
    { type: 'bulletList', attrs: { dir: 'ltr' }, content: [{ type: 'listItem', content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'First item' }] },
      { type: 'orderedList', attrs: { start: 3, type: 'a' }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested item' }] }] }] },
    ] }] },
  ] };
  assert.doesNotThrow(() => validateNativeRichText(richText));
  const input = documentInput();
  const text = { ...input.snapshot.store['shape:card'], type: 'text', props: { color: 'black', size: 'm', font: 'draw', textAlign: 'start', w: 320, autoSize: true, scale: 1, richText } };
  const document = validateNativeDocument({ ...input, snapshot: { ...input.snapshot, store: { ...input.snapshot.store, [text.id]: text } } });
  const pasted = validateNativeClipboard({ ...clipboardInput(), shapes: [text] }, new Set());
  assert.deepEqual(pasted.shapes[0], Object.values(document.snapshot.store).find((record) => record.id === text.id));
});

await test('native mailto annotation edits round-trip through document and clipboard boundaries', () => {
  const input = documentInput();
  const shape = { ...input.snapshot.store['shape:card'], type: 'geo', props: {
    w: 300, h: 200, geo: 'rectangle', dash: 'draw', growY: 0, url: 'mailto:user@example.com', scale: 1,
    flipX: false, flipY: false, color: 'black', labelColor: 'black', fill: 'none', size: 'm', font: 'draw', align: 'middle', verticalAlign: 'middle',
    richText: { type: 'doc', content: [{ type: 'paragraph' }] },
  } };
  const document = validateNativeDocument({ ...input, snapshot: { ...input.snapshot, store: { ...input.snapshot.store, [shape.id]: shape } } });
  const pasted = validateNativeClipboard({ ...clipboardInput(), shapes: [shape] }, new Set());
  assert.deepEqual(pasted.shapes[0], Object.values(document.snapshot.store).find((record) => record.id === shape.id));
  assert.deepEqual(validateNativeDocument(JSON.parse(JSON.stringify(document))), document);
});
