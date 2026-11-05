import { BaseBoxShapeUtil, HTMLContainer } from 'tldraw';
import { githubItemUrl } from '../../shared/items';
import { ITEM_CARD_TYPE, itemCardMigrations, itemCardProps, type ItemCardShape } from '../../shared/nativeDocument';
import { describeItem, useItemMetadata } from './metadata';

function ItemCard({ shape }: { shape: ItemCardShape }) {
  const state = useItemMetadata(shape.props.referenceId);
  const item = state.status === 'ready' && state.item.kind === shape.props.kind ? state.item : null;
  const description = describeItem(shape.props.kind, state);
  const url = item ? githubItemUrl(shape.props.kind, item.locator) : null;
  const anonymousMessage = state.status === 'loading' ? 'Loading metadata. Placement preserved.'
    : state.status === 'error' ? 'Metadata could not load. Refresh board metadata to try again.'
      : state.status === 'unavailable' || state.status === 'ready' ? 'Metadata is unavailable under your current access. Placement preserved.'
        : 'This reference is not resolved. Placement preserved.';
  return <HTMLContainer className="workspace-card-container">
    <article className="workspace-card" aria-label={description} data-reference-id={shape.props.referenceId}>
      <div className="workspace-card-repository"><bdi>{item ? `${item.locator.owner}/${item.locator.repository}` : 'GitHub reference'}</bdi></div>
      <div className="workspace-card-heading"><strong>{shape.props.kind === 'issue' ? 'Issue' : 'Pull request'}{item ? ` #${item.locator.number}` : ''}</strong><span>{item?.state ?? (state.status === 'ready' ? 'unavailable' : state.status)}</span></div>
      <p className="workspace-card-title">{item?.title ?? anonymousMessage}</p>
      <div className="workspace-card-labels">{item?.labels.slice(0, 2).map((label, index) => <span key={index}><bdi>{label}</bdi></span>)}{item && item.labels.length > 2 && <span>+{item.labels.length - 2}</span>}</div>
      <footer><span>{item?.assignees.slice(0, 2).map((name) => `@${name}`).join(', ') || 'No assignee information'}</span>{url && <a href={url} target="_blank" rel="noreferrer" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>Open in GitHub</a>}</footer>
      {item?.freshness === 'stale' && <small>Stale metadata</small>}
    </article>
  </HTMLContainer>;
}

export class ItemCardShapeUtil extends BaseBoxShapeUtil<ItemCardShape> {
  static override type = ITEM_CARD_TYPE;
  static override props = itemCardProps;
  static override migrations = itemCardMigrations;
  getDefaultProps(): ItemCardShape['props'] {
    return { version: 1, referenceId: 'unresolved', kind: 'issue', w: 320, h: 240 };
  }
  override canEdit() { return false; }
  override canResize() { return false; }
  // Descriptions must never read a private cache from a global SDK utility.
  override getAriaDescriptor(shape: ItemCardShape) { return `${shape.props.kind === 'issue' ? 'Issue' : 'Pull request'} card. Use Cards for metadata and keyboard actions.`; }
  component(shape: ItemCardShape) { return <ItemCard shape={shape} />; }
  getIndicatorPath(shape: ItemCardShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}
