import { useId } from 'react';
import { useEditor, useValue } from 'tldraw';
import type { ItemMetadata, WorkspaceMetadata } from '../../shared/items';
import { ITEM_CARD_TYPE, type ItemCardShape } from '../../shared/nativeDocument';

export type ConnectionMode = 'off' | 'selected' | 'all';
export function relatedTo(source: ItemMetadata, target: ItemMetadata): boolean {
  return source.context?.related.some((link) => link.number === target.locator.number && link.kind === target.kind
    && link.owner.toLowerCase() === target.locator.owner.toLowerCase() && link.repository.toLowerCase() === target.locator.repository.toLowerCase()) === true;
}
export function RelatedLinks({ metadata, mode }: { metadata: WorkspaceMetadata; mode: ConnectionMode }) {
  const editor = useEditor();
  const maskId = useId();
  const occluders = useValue('Card link occlusion', () => editor.getCurrentPageShapes().filter((shape) => shape.type === ITEM_CARD_TYPE && !editor.isShapeHidden(shape)).flatMap((shape) => {
    const bounds = editor.getShapePageBounds(shape);
    if (!bounds) return [];
    const point = editor.pageToViewport(bounds);
    return [{ id: shape.id, x: point.x, y: point.y, w: bounds.w * editor.getZoomLevel(), h: bounds.h * editor.getZoomLevel() }];
  }), [editor]);
  const paths = useValue('Related links', () => {
    if (mode === 'off') return [];
    const shapes = editor.getCurrentPageShapes().filter((shape): shape is ItemCardShape => shape.type === ITEM_CARD_TYPE && !editor.isShapeHidden(shape));
    const selected = new Set(editor.getSelectedShapeIds());
    const viewport = editor.getViewportPageBounds();
    const identity = (value: { kind: string; owner: string; repository: string; number: number }) => `${value.kind}:${value.owner.toLowerCase()}/${value.repository.toLowerCase()}#${value.number}`;
    const indexed = new Map<string, typeof shapes>();
    for (const shape of shapes) {
      const state = metadata.get(shape.props.referenceId);
      const bounds = editor.getShapePageBounds(shape);
      if (state?.status !== 'ready' || !bounds || bounds.maxX < viewport.minX || bounds.minX > viewport.maxX || bounds.maxY < viewport.minY || bounds.minY > viewport.maxY) continue;
      const key = identity({ ...state.item.locator, kind: state.item.kind });
      const group = indexed.get(key) ?? []; group.push(shape); indexed.set(key, group);
    }
    // Visit explicit references, not every possible pair of board cards.
    const pairs = new Map<string, { path: string; distance: number; focused: boolean }>();
    for (const sources of indexed.values()) for (const a of sources) {
      const left = metadata.get(a.props.referenceId); if (left?.status !== 'ready') continue;
      for (const link of left.item.context?.related ?? []) for (const b of indexed.get(identity(link)) ?? []) {
        if (a.props.referenceId === b.props.referenceId) continue;
        const focused = selected.has(a.id) || selected.has(b.id);
        if (mode === 'selected' && !focused) continue;
        const ab = editor.getShapePageBounds(a); const bb = editor.getShapePageBounds(b);
        if (!ab || !bb) continue;
        const av = editor.pageToViewport({ x: ab.center.x <= bb.center.x ? ab.maxX : ab.minX, y: ab.center.y });
        const bv = editor.pageToViewport({ x: ab.center.x <= bb.center.x ? bb.minX : bb.maxX, y: bb.center.y });
        const distance = Math.hypot(av.x - bv.x, av.y - bv.y);
        const key = [a.props.referenceId, b.props.referenceId].sort().join(':');
        if ((pairs.get(key)?.distance ?? Infinity) < distance) continue;
        const middle = Math.abs(ab.center.x - bb.center.x) < 20 ? Math.min(av.x, bv.x) - 24 : (av.x + bv.x) / 2;
        pairs.set(key, { path: `M ${av.x} ${av.y} C ${middle} ${av.y}, ${middle} ${bv.y}, ${bv.x} ${bv.y}`, distance, focused });
      }
    }
    return [...pairs.entries()];
  }, [editor, metadata, mode]);
  return <svg className="related-links" aria-hidden="true"><defs><mask id={maskId}><rect width="100%" height="100%" fill="white" />{occluders.map((box) => <rect key={box.id} x={box.x} y={box.y} width={box.w} height={box.h} fill="black" />)}</mask></defs><g mask={`url(#${maskId})`}>{paths.map(([key, value]) => <path key={key} d={value.path} data-focused={value.focused} />)}</g></svg>;
}
