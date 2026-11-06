import { useLayoutEffect, useRef, useState } from 'react';
import { useEditor, useValue } from 'tldraw';

/** Keep readable screen-sized details attached to the card through camera and geometry changes. */
export function useCardDetailPosition(open: boolean) {
  const editor = useEditor();
  const ref = useRef<HTMLElement>(null);
  const [height, setHeight] = useState(0);
  const [clearance, setClearance] = useState({ top: 12, bottom: 12 });
  useLayoutEffect(() => {
    const root = editor.getContainer().closest('.desktop-app');
    if (!open || !root) return;
    const topControls = [...root.querySelectorAll('.board-heading, .workspace-tools')];
    const bottomControls = [...root.querySelectorAll('.workspace-account, .tlui-layout__bottom .tlui-toolbar, .tlui-navigation-panel, .tlui-layout__top__left')];
    const measure = () => {
      const viewport = editor.getContainer().getBoundingClientRect();
      const bottom = bottomControls.map((element) => element.getBoundingClientRect()).filter((box) => box.height && box.width);
      setClearance({
        top: Math.max(12, ...topControls.map((element) => element.getBoundingClientRect().bottom - viewport.top + 8)),
        bottom: Math.max(12, ...bottom.map((box) => viewport.bottom - box.top + 8)),
      });
    };
    const observer = new ResizeObserver(measure);
    for (const element of [...topControls, ...bottomControls]) observer.observe(element);
    window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [editor, open]);
  useLayoutEffect(() => {
    const panel = ref.current;
    if (!open || !panel) return;
    const observer = new ResizeObserver(() => setHeight(panel.getBoundingClientRect().height));
    observer.observe(panel);
    return () => observer.disconnect();
  }, [open]);
  const position = useValue('Card detail position', () => {
    const selected = editor.getOnlySelectedShape();
    const bounds = selected && editor.getShapePageBounds(selected);
    if (!bounds) return undefined;
    const viewport = editor.getViewportScreenBounds();
    const point = editor.pageToViewport(bounds);
    const gap = 12;
    const width = Math.min(350, Math.max(0, viewport.w - gap * 2));
    const right = point.x + bounds.w * editor.getZoomLevel() + gap;
    const left = point.x - width - gap;
    // Prefer the card's right edge; flip when its left side has room.
    const x = right + width <= viewport.w - gap ? right : left >= gap ? left : right;
    const maxHeight = Math.max(80, viewport.h - clearance.top - clearance.bottom);
    return {
      left: Math.max(gap, Math.min(x, viewport.w - width - gap)),
      top: Math.max(clearance.top, Math.min(point.y, viewport.h - clearance.bottom - Math.min(height, maxHeight))),
      width,
      maxHeight,
    };
  }, [editor, height, clearance]);
  return { ref, position };
}
