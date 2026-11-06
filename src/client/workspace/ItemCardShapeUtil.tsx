import { BaseBoxShapeUtil, HTMLContainer, useEditor, resizeBox, type TLResizeInfo } from 'tldraw';
import { githubItemUrl } from '../../shared/items';
import { ITEM_CARD_TYPE, itemCardMigrations, itemCardProps, type ItemCardShape } from '../../shared/nativeDocument';
import { ProjectFields } from './planning';
import { Icon } from '../Icon';
import { itemStateLabel, describeItem, useItemMetadata } from './metadata';

function ItemCard({ shape }: { shape: ItemCardShape }) {
  const editor = useEditor();
  const state = useItemMetadata(shape.props.referenceId);
  const item = state.status === 'ready' && state.item.kind === shape.props.kind ? state.item : null;
  const description = describeItem(shape.props.kind, state);
  const url = item ? githubItemUrl(shape.props.kind, item.locator) : null;
  const anonymousMessage = state.status === 'loading' ? 'Loading…'
    : state.status === 'error' ? 'Could not load. Refresh to retry.'
      : state.status === 'unavailable' || state.status === 'ready' ? 'Unavailable. Check GitHub access.'
        : 'Unresolved reference.';
  return <HTMLContainer className="workspace-card-container">
    <article className="workspace-card" aria-label={description} data-reference-id={shape.props.referenceId}>
      <div className="workspace-card-repository"><bdi>{item ? `${item.locator.owner}/${item.locator.repository}` : 'GitHub reference'}</bdi></div>
      <div className="workspace-card-heading"><strong><Icon name={shape.props.kind === 'issue' ? 'issue' : 'pr'} />{shape.props.kind === 'issue' ? 'Issue' : 'Pull request'}{item ? ` #${item.locator.number}` : ''}</strong><span>{item ? itemStateLabel(item) : state.status === 'loading' ? 'Loading…' : 'Unavailable'}</span></div>
      <p className="workspace-card-title">{item?.title ?? anonymousMessage}</p>
      <div className="workspace-card-labels">{item?.labels.slice(0, 2).map((label, index) => <span key={index}><bdi>{label}</bdi></span>)}{item && item.labels.length > 2 && <span>+{item.labels.length - 2}</span>}</div>
      {item && <ProjectFields item={item} />}
      <footer><span>{item?.assignees.slice(0, 2).map((name) => `@${name}`).join(', ') || 'Unassigned'}</span>{!!item?.context?.related.length && <button type="button" className="card-related-count" aria-label={`${item.context.related.length} related items`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); editor.select(shape.id); }}><Icon name="link" />{item.context.related.length}</button>}{url && <a href={url} target="_blank" rel="noreferrer" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} aria-label="Open in GitHub"><Icon name="external" /></a>}</footer>
      {item?.freshness === 'stale' && <small>Stale metadata</small>}
    </article>
  </HTMLContainer>;
}

export class ItemCardShapeUtil extends BaseBoxShapeUtil<ItemCardShape> {
  static override type = ITEM_CARD_TYPE;
  static override props = itemCardProps;
  static override migrations = itemCardMigrations;
  getDefaultProps(): ItemCardShape['props'] {
    return { version: 1, referenceId: 'unresolved', kind: 'issue', w: 280, h: 200 };
  }
  override canEdit() { return false; }
  override canResize() { return true; }
  override onResize(shape: ItemCardShape, info: TLResizeInfo<ItemCardShape>) {
    return resizeBox(shape, info, { minWidth: 220, minHeight: 180, maxWidth: 1920, maxHeight: 1920 });
  }
  // Descriptions must never read a private cache from a global SDK utility.
  override getAriaDescriptor(shape: ItemCardShape) { return `${shape.props.kind === 'issue' ? 'Issue' : 'Pull request'} card. Use Find for full details and keyboard selection.`; }
  component(shape: ItemCardShape) { return <ItemCard shape={shape} />; }
  getIndicatorPath(shape: ItemCardShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}
