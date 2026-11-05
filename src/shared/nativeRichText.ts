import { T } from '@tldraw/validate';

export const annotationLinkValidator = T.linkUrl.check((value) => {
  if (value === '') return;
  const url = new URL(value, 'https://github.com');
  if (url.username || url.password) throw new Error('Annotation links cannot contain credentials');
});

const direction = { dir: T.literalEnum('auto', 'ltr', 'rtl').nullable().optional() };
const integer = T.number.check((value) => {
  if (!Number.isSafeInteger(value)) throw new Error('Invalid annotation integer');
});
const blockAttributes = T.object(direction);
const headingAttributes = T.object({ ...direction, level: integer.optional() });
const listAttributes = T.object({ ...direction, start: integer.optional(), type: T.literalEnum('1', 'a', 'A', 'i', 'I').nullable().optional() });
const emptyAttributes = T.object({});
const linkAttributes = T.object({
  href: annotationLinkValidator.nullable().optional(),
  target: T.string.nullable().optional(), rel: T.string.nullable().optional(),
  class: T.string.nullable().optional(), title: T.string.nullable().optional(),
});
const markValidator = T.object({
  type: T.literalEnum('bold', 'italic', 'strike', 'underline', 'code', 'link', 'highlight'),
  attrs: T.dict(T.string, T.unknown).optional(),
});
const nodeValidator = T.object({
  type: T.literalEnum('doc', 'paragraph', 'heading', 'bulletList', 'orderedList', 'listItem', 'text', 'hardBreak'),
  attrs: T.dict(T.string, T.unknown).optional(), content: T.arrayOf(T.unknown).optional(),
  text: T.string.optional(), marks: T.arrayOf(T.unknown).optional(),
});
const noAttributes = {};
const noChildren: readonly unknown[] = [];

/** Matches the nodes, marks and attributes of the pinned SDK's default TipTap extensions. */
export function validateNativeRichText(input: unknown): void {
  let count = 0;
  function visit(value: unknown, parent: string | null, depth: number): void {
    if (depth > 64 || ++count > 20000) throw new Error('Annotation text is too complex');
    const node = nodeValidator.validate(value);
    const attrs = node.attrs ?? noAttributes;
    const children = node.content ?? noChildren;
    const inline = node.type === 'text' || node.type === 'hardBreak';
    switch (parent) {
      case null:
        if (node.type !== 'doc' || !node.content) throw new Error('Expected annotation document');
        break;
      case 'paragraph': case 'heading':
        if (!inline) throw new Error('Expected inline annotation text');
        break;
      case 'bulletList': case 'orderedList':
        if (node.type !== 'listItem') throw new Error('Expected annotation list item');
        break;
      default:
        if (!['paragraph', 'heading', 'bulletList', 'orderedList'].includes(node.type)) throw new Error('Expected annotation block');
    }
    if (node.type !== 'text' && node.text !== undefined) throw new Error('Only text nodes can contain text');
    if (!inline && node.marks?.length) throw new Error('Only inline text can contain marks');
    for (const value of node.marks ?? noChildren) {
      const mark = markValidator.validate(value);
      if (mark.type === 'link') linkAttributes.validate(mark.attrs ?? noAttributes);
      else emptyAttributes.validate(mark.attrs ?? noAttributes);
    }
    switch (node.type) {
      case 'text':
        emptyAttributes.validate(attrs);
        if (!node.text || children.length > 0) throw new Error('Invalid annotation text node');
        break;
      case 'hardBreak':
        blockAttributes.validate(attrs);
        if (children.length > 0) throw new Error('Line breaks cannot contain annotation nodes');
        break;
      case 'heading': {
        const heading = headingAttributes.validate(attrs);
        if (heading.level !== undefined && (heading.level < 1 || heading.level > 6)) throw new Error('Unsupported annotation heading');
        break;
      }
      case 'orderedList': listAttributes.validate(attrs); break;
      default: blockAttributes.validate(attrs);
    }
    if ((node.type === 'bulletList' || node.type === 'orderedList') && children.length === 0) throw new Error('Empty annotation list');
    if (node.type === 'listItem' && (!children.length || nodeValidator.validate(children[0]).type !== 'paragraph')) throw new Error('Annotation list items must start with a paragraph');
    for (const child of children) visit(child, node.type, depth + 1);
  }
  visit(input, null, 0);
}
