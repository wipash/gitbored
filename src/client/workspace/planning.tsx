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
    const value = !selection[role] ? 'Not mapped' : !context ? 'Loading…' : context.status === 'unavailable' ? 'Unavailable' : field?.value ?? (context.status === 'partial' ? 'Unavailable' : 'Not set');
    const hasValue = !!selection[role] && context?.status !== 'unavailable' && field?.value != null;
    const category = hasValue && (role === 'status' || role === 'priority');
    return <div key={role}><dt>{role}</dt><dd title={`${role}: ${value}`} data-empty={!hasValue} className={category ? 'card-category' : undefined} style={category ? badgeStyle(categoryColour(role, value)) : undefined}>{value}</dd></div>;
  })}</dl>;
}
