import { useLayoutEffect } from 'react';
import { useEditor } from 'tldraw';

/** Keep native desktop styles below app chrome, including enlarged text. */
export function useStylePanelClearance(isMobile: boolean): void {
  const editor = useEditor();
  useLayoutEffect(() => {
    if (isMobile) return;
    const container = editor.getContainer();
    const root = container.closest('.desktop-app');
    if (!root) return;
    const controls = [...root.querySelectorAll('.workspace-tools, .board-heading, .mobile-workspace-menu')];
    const measure = () => {
      const viewport = container.getBoundingClientRect();
      const bounds = controls.map((element) => element.getBoundingClientRect()).filter((rect) => rect.width && rect.height);
      const top = Math.max(12, ...bounds.map((rect) => rect.bottom - viewport.top + 12));
      container.style.setProperty('--workspace-style-top', `${top}px`);
    };
    // Observe chrome only; selection and camera changes do not affect clearance.
    const observer = new ResizeObserver(measure);
    for (const control of controls) observer.observe(control);
    window.addEventListener('resize', measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      container.style.removeProperty('--workspace-style-top');
    };
  }, [editor, isMobile]);
}
