import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/** Pointer coordinates are viewport coordinates; clipping and physical UI placement matter. */
export async function expectNativePoint(page: Page, point: { x: number; y: number }, shapeId?: string) {
  const target = await page.evaluate(({ point, shapeId }) => {
    const canvas = document.querySelector('.tl-canvas')?.getBoundingClientRect();
    const hit = document.elementFromPoint(point.x, point.y);
    const shape = shapeId ? document.querySelector(`[data-shape-id="${shapeId}"]`)?.getBoundingClientRect() : null;
    const inside = (rect: DOMRect) => point.x > rect.left && point.x < rect.right && point.y > rect.top && point.y < rect.bottom;
    return {
      visible: point.x > 0 && point.x < innerWidth && point.y > 0 && point.y < innerHeight,
      canvas: canvas ? inside(canvas) : false,
      native: !!hit?.closest('.tl-canvas'),
      obstructed: !!hit?.closest('details, button, a, input, select'),
      shape: shape ? inside(shape) : !shapeId,
      hit: hit?.getAttribute('class') ?? null,
    };
  }, { point, shapeId });
  expect(target).toMatchObject({ visible: true, canvas: true, native: true, obstructed: false, shape: true });
}
