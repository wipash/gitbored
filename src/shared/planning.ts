import { T } from '@tldraw/validate';

export const planningRoles = ['status', 'weight', 'priority', 'sprint'] as const;
export type PlanningRole = typeof planningRoles[number];
const identifier = T.string.check((value) => { if (value.length > 256) throw new Error('Invalid project identifier'); });
export const planningSelectionValidator = T.object({
  projectId: identifier,
  status: identifier, weight: identifier, priority: identifier, sprint: identifier,
});
export type PlanningSelection = T.TypeOf<typeof planningSelectionValidator>;
export const itemContextValidator = T.object({
  status: T.literalEnum('ready', 'partial', 'unavailable'),
  projects: T.arrayOf(T.object({ id: identifier, title: T.string,
    fields: T.arrayOf(T.object({ id: identifier, name: T.string, value: T.string.nullable() })),
  })),
  related: T.arrayOf(T.object({ owner: T.string, repository: T.string, number: T.number, kind: T.literalEnum('issue', 'pull-request') })),
});
export type ItemContext = T.TypeOf<typeof itemContextValidator>;
export function readItemContext(value: unknown): ItemContext { return itemContextValidator.validate(value); }
