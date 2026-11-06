import { createContext, useContext } from 'react';
import type { ItemMetadata } from '../../shared/items';
import { planningRoles, type PlanningSelection } from '../../shared/planning';

export const PlanningContext = createContext<PlanningSelection | undefined>(undefined);
export function ProjectFields({ item }: { item: ItemMetadata }) {
  const selection = useContext(PlanningContext);
  if (!selection?.projectId) return null;
  const context = item.context;
  const project = context?.projects.find((entry) => entry.id === selection.projectId);
  return <dl className="card-project-fields">{planningRoles.map((role) => {
    const field = project?.fields.find((entry) => entry.id === selection[role]);
    const value = !context ? '…' : context.status === 'unavailable' ? 'Unavailable' : field?.value ?? '—';
    return <div key={role}><dt>{role}</dt><dd title={value}>{value}</dd></div>;
  })}</dl>;
}
