import { useContext } from 'react';
import type { ItemMetadata } from '../../shared/items';
import { planningRoles } from '../../shared/planning';
import { PlanningContext } from './planningContext';
import { badgeStyle, useCategoryColour } from './cardColours';
export { PlanningContext } from './planningContext';

export function ProjectFields({ item }: { item: ItemMetadata }) {
  const selection = useContext(PlanningContext);
  const categoryColour = useCategoryColour();
  if (!selection?.projectId) return null;
  const context = item.context;
  const project = context?.projects.find((entry) => entry.id === selection.projectId);
  return <dl className="card-project-fields">{planningRoles.map((role) => {
    const field = project?.fields.find((entry) => entry.id === selection[role]);
    const value = !context ? '…' : context.status === 'unavailable' ? 'Unavailable' : field?.value ?? '—';
    return <div key={role}><dt>{role}</dt><dd title={`${role}: ${value}`} className={role === 'status' || role === 'priority' ? 'card-category' : undefined} style={role === 'status' || role === 'priority' ? badgeStyle(categoryColour(role, value)) : undefined}>{value}</dd></div>;
  })}</dl>;
}
