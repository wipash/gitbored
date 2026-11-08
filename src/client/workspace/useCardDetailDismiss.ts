import { useEffect, type RefObject } from 'react';

export function useCardDetailDismiss(open: boolean, panel: RefObject<HTMLElement | null>, dismiss: () => void) {
  useEffect(() => {
    const document = panel.current?.ownerDocument;
    if (!open || !document) return;
    let press: { id: number; x: number; y: number } | null = null;
    const outside = (target: EventTarget | null) => target instanceof Element
      && !panel.current?.contains(target) && !target.closest('[data-detail-card]');
    const down = (event: PointerEvent) => {
      press = event.button === 0 && event.isPrimary && outside(event.target)
        ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
    };
    const move = (event: PointerEvent) => {
      if (press && Math.hypot(event.clientX - press.x, event.clientY - press.y) > 5) press = null;
    };
    const up = (event: PointerEvent) => {
      if (press?.id === event.pointerId && outside(event.target)) dismiss();
      press = null;
    };
    const cancel = () => { press = null; };
    // Capture observes clicks even when canvas/UI handlers stop propagation.
    // Never cancel the event or return focus: the clicked destination owns it.
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', cancel, true);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', cancel, true);
    };
  }, [open, panel, dismiss]);
}
