import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

type Panel = 'incoming' | 'repositories' | 'find' | 'settings' | 'boards' | 'menu' | 'colours' | 'share';
interface WorkspacePanels {
  active: Panel | null;
  open: (panel: Panel) => void;
  close: (panel: Panel) => void;
  toggle: (panel: Panel) => void;
  menuTrigger: RefObject<HTMLButtonElement | null>;
}
const WorkspacePanelContext = createContext<WorkspacePanels | null>(null);

/** Panel transitions share the board lifetime, independently of the native editor. */
export function WorkspacePanelProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<Panel | null>(null);
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const open = useCallback((panel: Panel) => setActive(panel), []);
  const close = useCallback((panel: Panel) => setActive((current) => current === panel ? null : current), []);
  const toggle = useCallback((panel: Panel) => setActive((current) => current === panel ? null : panel), []);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 901px)');
    const changed = () => { if (desktop.matches) close('menu'); };
    desktop.addEventListener('change', changed);
    return () => desktop.removeEventListener('change', changed);
  }, [close]);
  return <WorkspacePanelContext value={{ active, open, close, toggle, menuTrigger }}>{children}</WorkspacePanelContext>;
}

export function useWorkspacePanels() {
  const panels = useContext(WorkspacePanelContext);
  if (!panels) throw new Error('Workspace panels require a board');
  return panels;
}

interface PanelFocus {
  trigger: RefObject<HTMLButtonElement | null>;
  initialFocus?: RefObject<HTMLElement | null>;
  focusWhenTriggerHidden?: boolean;
  /** Refocus when conditional content or account checking changes while open. */
  contentReady?: boolean;
}

/** Callers name their focus targets; transitions and mobile focus return stay here. */
export function useWorkspacePanel(name: Panel, { trigger, initialFocus, focusWhenTriggerHidden = false, contentReady = true }: PanelFocus) {
  const { active, open: openPanel, close: closePanel, toggle: togglePanel, menuTrigger } = useWorkspacePanels();
  const isOpen = active === name;
  useEffect(() => {
    if (isOpen && (!focusWhenTriggerHidden || trigger.current?.getClientRects().length === 0)) {
      initialFocus?.current?.focus({ preventScroll: true });
    }
  }, [isOpen, initialFocus, trigger, focusWhenTriggerHidden, contentReady]);
  const open = useCallback(() => openPanel(name), [openPanel, name]);
  const close = useCallback(() => closePanel(name), [closePanel, name]);
  const toggle = useCallback(() => togglePanel(name), [togglePanel, name]);
  const dismiss = () => {
    close();
    const target = trigger.current?.getClientRects().length ? trigger.current : menuTrigger.current;
    target?.focus({ preventScroll: true });
  };
  return { isOpen, open, close, toggle, dismiss };
}

export const BoardSettingsContext = createContext<ReactNode>(null);

interface AccountSettingsValue {
  content: ReactNode;
  needsAttention: boolean;
  workspaceMounted: boolean;
  registerWorkspace: () => () => void;
}
export const AccountSettingsContext = createContext<AccountSettingsValue | null>(null);
