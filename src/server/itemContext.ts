import type { ItemContext } from '../shared/planning.js';
import { boolean, list, object, opaque, parseItemUrl, text } from './sourceProvider.js';

const fields = `projectItems(first: 20) {
  pageInfo { hasNextPage }
  nodes {
    project { id title fields(first: 100) { pageInfo { hasNextPage } nodes { ... on ProjectV2FieldCommon { id name dataType } } } }
    fieldValues(first: 100) { pageInfo { hasNextPage } nodes {
      ... on ProjectV2ItemFieldTextValue { text field { ... on ProjectV2FieldCommon { id } } }
      ... on ProjectV2ItemFieldNumberValue { number field { ... on ProjectV2FieldCommon { id } } }
      ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { id } } }
      ... on ProjectV2ItemFieldIterationValue { title field { ... on ProjectV2FieldCommon { id } } }
      ... on ProjectV2ItemFieldDateValue { date field { ... on ProjectV2FieldCommon { id } } }
    } }
  }
}
timelineItems(first: 100, itemTypes: [CROSS_REFERENCED_EVENT]) {
  pageInfo { hasNextPage }
  nodes { ... on CrossReferencedEvent { source { ... on Issue { url } ... on PullRequest { url } } } }
}`;
export const itemContextQuery = `query ItemContext($id: ID!) { node(id: $id) {
  ... on Issue { ${fields} }
  ... on PullRequest { ${fields} closingIssuesReferences(first: 100) { pageInfo { hasNextPage } nodes { url } } }
} }`;

export function normalizeContext(value: unknown): ItemContext {
  const payload = object(value);
  // Partial GraphQL errors can hide a permission failure: do not retain old fields.
  if (payload['errors'] !== undefined || object(payload['data'])['node'] === null) return { status: 'unavailable', projects: [], related: [] };
  const node = object(object(payload['data'])['node']);
  let partial = false;
  function nodes(value: unknown): unknown[] {
    const connection = object(value);
    if (boolean(object(connection['pageInfo'])['hasNextPage'])) partial = true;
    return list(connection['nodes']);
  }
  const projects = nodes(node['projectItems']).map((value) => {
    const row = object(value); const project = object(row['project']);
    const values = new Map<string, string>();
    for (const fieldValue of nodes(row['fieldValues'])) {
      const value = object(fieldValue);
      if (!value['field']) continue;
      const fieldId = opaque(object(value['field'])['id']);
      const raw = value['text'] ?? value['number'] ?? value['name'] ?? value['title'] ?? value['date'];
      if (typeof raw === 'number' && Number.isFinite(raw)) values.set(fieldId, String(raw));
      else if (typeof raw === 'string') values.set(fieldId, text(raw));
    }
    return { id: opaque(project['id']), title: text(project['title']), fields: nodes(project['fields']).filter((field) => ['TEXT', 'NUMBER', 'SINGLE_SELECT', 'ITERATION', 'DATE'].includes(String(object(field)['dataType']))).map((field) => {
      const entry = object(field); const id = opaque(entry['id']);
      return { id, name: text(entry['name'], 1024), value: values.get(id) ?? null };
    }) };
  });
  const related: ItemContext['related'] = [];
  const urls = nodes(node['timelineItems']).flatMap((value) => {
    const source = object(value)['source'];
    return source && object(source)['url'] ? [text(object(source)['url'], 512)] : [];
  });
  if (node['closingIssuesReferences']) for (const issue of nodes(node['closingIssuesReferences'])) urls.push(text(object(issue)['url'], 512));
  for (const url of new Set(urls)) {
    try { related.push(parseItemUrl(url)); } catch { /* Unsupported provider locator cannot become a link. */ }
  }
  return { status: partial ? 'partial' : 'ready', projects, related };
}
