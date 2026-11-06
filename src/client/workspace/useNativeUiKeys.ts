import { useEffect } from 'react';
import { useEditor } from 'tldraw';

/** UI press ownership outlives panels; genuine native releases still reach the SDK. */
export function useNativeUiKeys() {
  const editor = useEditor();
  useEffect(() => {
    const ownerDocument = editor.getContainer().ownerDocument;
    const uiOwnedCodes = new Set<string>();
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.repeat) uiOwnedCodes.delete(event.code);
      if (event.key === 'Shift' || event.key === 'Control' || event.key === 'Alt' || event.key === 'Meta' || event.key === 'AltGraph') return;
      const ui = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-native-ui]') : null;
      const inUi = ui !== null;
      if (!event.repeat) {
        if (!inUi) return;
        uiOwnedCodes.add(event.code);
      } else if (!uiOwnedCodes.has(event.code) && !inUi) return;
      event.stopPropagation();
      if (event.key === 'Escape' && inUi && uiOwnedCodes.has(event.code)) ui.querySelector<HTMLButtonElement>('[data-native-dismiss]')?.click();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (uiOwnedCodes.delete(event.code)) event.stopPropagation();
    };
    const onBlur = () => uiOwnedCodes.clear();
    ownerDocument.defaultView?.addEventListener('blur', onBlur);
    ownerDocument.addEventListener('keydown', onKeyDown, true);
    ownerDocument.addEventListener('keyup', onKeyUp, true);
    return () => {
      ownerDocument.removeEventListener('keydown', onKeyDown, true);
      ownerDocument.removeEventListener('keyup', onKeyUp, true);
      ownerDocument.defaultView?.removeEventListener('blur', onBlur);
      uiOwnedCodes.clear();
    };
  }, [editor]);
}
