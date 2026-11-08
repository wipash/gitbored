import { useLayoutEffect, type RefObject } from 'react';

/** Fit Incoming between its trigger and floating controls, including enlarged text. */
export function usePanelClearance(ref: RefObject<HTMLElement | null>, open: boolean): void {
  useLayoutEffect(() => {
    const panel = ref.current;
    const tools = panel?.closest('.workspace-tools');
    if (!open || !panel || !tools) return;
    const root = panel.closest('.desktop-app');
    if (!root) return;
    const obstacles = '.tlui-layout__bottom .tlui-toolbar, .tlui-navigation-panel';
    const measure = () => {
      const bounds = panel.getBoundingClientRect();
      let bottom = window.innerHeight - 12;
      for (const element of root.querySelectorAll(obstacles)) {
        const other = element.getBoundingClientRect();
        if (other.width && other.height && bounds.left < other.right && bounds.right > other.left) {
          bottom = Math.min(bottom, other.top - 8);
        }
      }
      panel.style.setProperty('--workspace-panel-height', `${Math.max(0, Math.floor(bottom - bounds.top))}px`);
    };
    // Observe chrome only: canvas geometry changes never trigger layout measurement.
    const observer = new ResizeObserver(measure);
    observer.observe(tools);
    for (const element of root.querySelectorAll(obstacles)) observer.observe(element);
    window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [ref, open]);
}
