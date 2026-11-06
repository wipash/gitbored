import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';

type Panel = 'incoming' | 'repositories' | 'find' | 'settings' | 'boards' | null;
export const WorkspacePanelContext = createContext<{ active: Panel; setActive: Dispatch<SetStateAction<Panel>> } | null>(null);
export function useWorkspacePanel() {
  const shared = useContext(WorkspacePanelContext);
  const [active, setActive] = useState<Panel>(null);
  return shared ?? { active, setActive };
}

export const BoardSettingsContext = createContext<ReactNode>(null);

interface AccountSettingsValue {
  content: ReactNode;
  needsAttention: boolean;
  workspaceMounted: boolean;
  registerWorkspace: () => () => void;
}
export const AccountSettingsContext = createContext<AccountSettingsValue | null>(null);
