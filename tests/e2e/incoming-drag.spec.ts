import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { validateBoard } from '../../src/shared/boards.js';
import { validateNativeDocument } from '../../src/shared/nativeDocument.js';
import { readSourceItem } from '../../src/shared/sources.js';
import { applicationOrigin, controlProvider, currentSession, signIn } from './auth-support.js';
import { expectNativePoint } from './board-gestures.js';

test.describe.configure({ mode: 'serial' });
test.use({ viewport: { width: 1440, height: 1000 } });
test.skip(process.env['E2E_AUTH_MODE'] === 'unconfigured', 'Requires controlled GitHub authorization.');
test.beforeEach(async ({ request }) => { await controlProvider(request, { reset: true }); });

async function headers(page: Page) {
  const session = await currentSession(page.request);
  if (session.status !== 'signed-in') throw new Error('Expected authenticated owner');
  return { Origin: applicationOrigin, 'X-CSRF-Token': session.csrfToken };
}
async function read(page: Page, id: string) {
  const response = await page.request.get(`/api/boards/${id}`, { headers: await headers(page) });
  expect(response.status()).toBe(200);
  return validateBoard(await response.json());
}

test('only a live Incoming drag onto the native canvas consumes the queue, preserving rotated frame geometry after pan and zoom', async ({ page }) => {
  await signIn(page);
  const resolved = await page.request.post('/api/sources/resolve', {
    headers: await headers(page), data: { url: 'https://github.com/alice/project/issues/1' },
  });
  expect(resolved.status()).toBe(200);
  const item = readSourceItem(await resolved.json());
  const candidate = { referenceId: item.reference.id, kind: item.reference.kind };
  const created = await page.request.post('/api/boards', { headers: await headers(page), data: { title: 'Rotated Incoming drop' } });
  expect(created.status()).toBe(201);
  const board = validateBoard(await created.json());
  expect(board.incoming).toEqual({ version: 1, sources: [], queue: [], seen: [] });
  const frame = {
    id: 'shape:incoming-frame', typeName: 'shape', type: 'frame', parentId: 'page:page', index: 'a1',
    x: 180, y: 120, rotation: Math.PI / 12, opacity: 1, isLocked: false, meta: {},
    props: { w: 800, h: 600, name: 'Receiving frame', color: 'black' },
  };
  const document = validateNativeDocument({ ...board.document, snapshot: { ...board.document.snapshot,
    store: { ...board.document.snapshot.store, [frame.id]: frame },
  } });
  const seeded = await page.request.put(`/api/boards/${board.id}`, {
    headers: await headers(page), data: { expectedRevision: board.revision, document,
      incoming: { version: 1, sources: [], queue: [candidate], seen: [candidate.referenceId] } },
  });
  expect(seeded.status()).toBe(200);
  const before = await read(page, board.id);
  await page.goto(`/boards/${board.id}`);
  await expect(page.locator('.tl-canvas')).toBeVisible();
  const frameElement = page.locator(`[data-shape-id="${frame.id}"]`);
  await expect(frameElement).toBeVisible();
  await page.locator('.tl-container').focus();
  await page.keyboard.press('Shift+1');
  const fitted = await frameElement.boundingBox();
  if (!fitted) throw new Error('Missing fitted frame');
  const panOrigin = { x: fitted.x + fitted.width / 2, y: fitted.y + fitted.height / 2 };
  await expectNativePoint(page, panOrigin, frame.id);
  await page.mouse.move(panOrigin.x, panOrigin.y);
  // Pan the frame center into visible canvas to the right of the real Incoming tray.
  await page.mouse.wheel(-200, 45);
  await expect.poll(async () => (await frameElement.boundingBox())?.x).not.toBe(fitted.x);
  const panned = await frameElement.boundingBox();
  if (!panned) throw new Error('Missing panned frame');
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -100);
  await page.keyboard.up('Control');
  await expect.poll(async () => (await frameElement.boundingBox())?.width).not.toBe(panned.width);
  // Advance actual save debounce windows deterministically; rejected drops must not schedule a write.
  const now = Date.now();
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now + 1000);
  await page.getByRole('button', { name: 'Incoming 1', exact: true }).click();
  await expect(page.locator('.incoming-panel')).toBeVisible();
  const handle = page.locator('.incoming-drag-handle');
  await expect(handle).toHaveAttribute('draggable', 'true');
  await handle.evaluate((element) => {
    element.addEventListener('dragstart', () => { element.setAttribute('data-observed-start', 'yes'); });
    element.addEventListener('dragend', () => { element.setAttribute('data-observed-end', 'yes'); });
  });
  const writes: unknown[] = [];
  page.on('request', (request) => {
    if (request.method() === 'PUT' && new URL(request.url()).pathname === `/api/boards/${board.id}`) writes.push(request.postDataJSON());
  });
  async function unchanged() {
    await page.clock.runFor(1000);
    expect(await read(page, board.id)).toEqual(before);
    expect(writes).toEqual([]);
    await expect(page.locator('.tl-shape')).toHaveCount(1);
    await expect(page.getByRole('button', { name: 'Incoming 1', exact: true })).toBeVisible();
  }
  await handle.dragTo(page.getByRole('heading', { name: board.title, exact: true }));
  await expect(handle).toHaveAttribute('data-observed-start', 'yes');
  await expect(handle).toHaveAttribute('data-observed-end', 'yes');
  await unchanged();

  await handle.evaluate((element) => { element.removeAttribute('data-observed-start'); element.removeAttribute('data-observed-end'); });
  const source = await handle.boundingBox();
  if (!source) throw new Error('Missing drag handle');
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(source.x - 35, source.y + source.height / 2, { steps: 8 });
  await expect(handle).toHaveAttribute('data-observed-start', 'yes');
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(handle).toHaveAttribute('data-observed-end', 'yes');
  await unchanged();

  const bounds = await frameElement.boundingBox();
  if (!bounds) throw new Error('Missing transformed frame');
  // A rotated rectangle's DOM bounding-box center is its transformed local center.
  // This oracle uses only public DOM geometry, not editor screenToPage or transforms.
  const target = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  await expectNativePoint(page, target, frame.id);
  expect(target.x < source.x || target.x > source.x + source.width || target.y < source.y || target.y > source.y + source.height).toBe(true);
  const forged = await page.evaluateHandle(({ candidate }) => {
    const transfer = new DataTransfer();
    transfer.setData('application/x-gitbored-incoming', JSON.stringify({ ...candidate, token: 'not-a-live-drag' }));
    return transfer;
  }, { candidate });
  await page.locator('.tl-canvas').dispatchEvent('dragover', { dataTransfer: forged, clientX: target.x, clientY: target.y });
  await page.locator('.tl-canvas').dispatchEvent('drop', { dataTransfer: forged, clientX: target.x, clientY: target.y });
  await forged.dispose();
  await unchanged();

  await expectNativePoint(page, target, frame.id);
  const canvas = await page.locator('.tl-canvas').boundingBox();
  if (!canvas) throw new Error('Missing native canvas');
  await handle.dragTo(page.locator('.tl-canvas'), { targetPosition: { x: target.x - canvas.x, y: target.y - canvas.y } });
  await expect(page.locator('.tl-shape')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Incoming 0', exact: true })).toBeVisible();
  await page.clock.runFor(1000);
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state', 'saved');
  const after = await read(page, board.id);
  expect(after.revision).toBe(before.revision + 1);
  expect(after.incoming).toEqual({ ...before.incoming, queue: [] });
  expect(Object.values(after.document.snapshot.store).find((record) => record.id === frame.id)).toEqual(Object.values(before.document.snapshot.store).find((record) => record.id === frame.id));
  const cards = Object.values(after.document.snapshot.store).filter((record) => record.typeName === 'shape' && record.type === 'item-card');
  expect(cards).toHaveLength(1);
  const card = cards[0];
  if (!card || card.typeName !== 'shape') throw new Error('Missing durable dropped card');
  expect(card.parentId).toBe(frame.id);
  // Native HTML drag coordinates are integer CSS pixels; allow their sub-page rounding.
  expect(Math.abs(card.x - frame.props.w / 2)).toBeLessThan(2);
  expect(Math.abs(card.y - frame.props.h / 2)).toBeLessThan(2);
  expect(card.rotation + frame.rotation).toBeCloseTo(0, 5);
  expect(card.props).toMatchObject({ referenceId: candidate.referenceId, kind: candidate.kind });
  expect(writes).toEqual([{ expectedRevision: before.revision, document: after.document, incoming: after.incoming }]);
});
