import { createContext, useContext, useState, type Dispatch, type SetStateAction } from 'react';

type Panel = 'incoming' | 'repositories' | 'find' | 'view' | 'settings' | 'boards' | null;
export const WorkspacePanelContext = createContext<{ active: Panel; setActive: Dispatch<SetStateAction<Panel>> } | null>(null);
export function useWorkspacePanel() {
  const shared = useContext(WorkspacePanelContext);
  const [active, setActive] = useState<Panel>(null);
  return shared ?? { active, setActive };
}
