import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import type { TLShapeId } from 'tldraw';

const CardDetailsContext = createContext<{ detailId: TLShapeId | null; setDetailId: Dispatch<SetStateAction<TLShapeId | null>> } | null>(null);

export function CardDetailsProvider({ children }: { children: ReactNode }) {
  const [detailId, setDetailId] = useState<TLShapeId | null>(null);
  return <CardDetailsContext value={{ detailId, setDetailId }}>{children}</CardDetailsContext>;
}

export function useCardDetails() {
  const value = useContext(CardDetailsContext);
  if (!value) throw new Error('Card details require a workspace');
  return value;
}
