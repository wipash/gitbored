import { BaseBoxShapeUtil, HTMLContainer, useEditor, resizeBox, type TLResizeInfo } from 'tldraw';
import { githubItemUrl } from '../../shared/items';
import { ITEM_CARD_TYPE, itemCardMigrations, itemCardProps, type ItemCardShape } from '../../shared/nativeDocument';
import { ProjectFields } from './planning';
import { Icon } from '../Icon';
import { itemStateLabel, describeItem, useItemMetadata } from './metadata';
import { useCardDetails } from './cardDetails';
import { badgeStyle, itemType, useCardColours } from './cardColours';

function ItemCard({ shape }: { shape: ItemCardShape }) {
  const editor = useEditor();
  const compact = shape.props.h < 260;
  // Geometry alone sets the title budget: loading metadata never resizes a card.
  const titleLines = Math.max(1, Math.floor((shape.props.h - 154) / 21));
  const { detailId, setDetailId } = useCardDetails();
  const showDetails = () => { editor.select(shape.id); setDetailId(shape.id); };
  const state = useItemMetadata(shape.props.referenceId);
  const item = state.status === 'ready' && state.item.kind === shape.props.kind ? state.item : null;
  const colours = useCardColours(item, shape.props.color);
  const description = describeItem(shape.props.kind, state);
  const url = item ? githubItemUrl(shape.props.kind, item.locator) : null;
  const anonymousMessage = state.status === 'loading' ? 'Loading…'
    : state.status === 'sso-required' ? 'SSO required. Reconnect your organisation.'
    : state.status === 'error' ? 'Could not load. Refresh to retry.'
      : state.status === 'unavailable' || state.status === 'ready' ? 'Unavailable. Check GitHub access.'
        : 'Unresolved reference.';
  return <HTMLContainer className="workspace-card-container">
    <article className="workspace-card" style={colours.cardStyle} data-card-density={compact ? 'compact' : 'expanded'} data-card-colour={shape.props.color} data-colour-by={colours.mode} aria-label={description} data-reference-id={shape.props.referenceId}>
      <div className="workspace-card-repository"><bdi>{item ? `${item.locator.owner}/${item.locator.repository}` : 'GitHub reference'}</bdi>
        {state.status === 'ready' && state.refreshing && <span className="card-refresh-indicator" role="status" aria-label="Refreshing card"><Icon name="refresh" /></span>}
        <button type="button" className="card-details-trigger" data-native-ui="card-action" data-detail-card={shape.id} aria-label="Card details" aria-expanded={detailId === shape.id} title="Card details" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); if (detailId === shape.id) setDetailId(null); else showDetails(); }}><Icon name="details" /></button>
      </div>
      <div className="workspace-card-heading"><strong className="card-category" style={badgeStyle(colours.type)}><Icon name={shape.props.kind === 'issue' ? 'issue' : 'pr'} />{shape.props.kind === 'issue' ? 'Issue' : 'Pull request'}{item ? ` #${item.locator.number}` : ''}</strong>{item && itemType(item) !== 'Issue' && itemType(item) !== 'Pull request' && <span className="card-category card-type" style={badgeStyle(colours.type)}>{itemType(item)}</span>}<span className="card-category" style={badgeStyle(colours.status)}>{item ? itemStateLabel(item) : state.status === 'loading' ? 'Loading…' : state.status === 'sso-required' ? 'SSO required' : 'Unavailable'}</span></div>
      <p className="workspace-card-title" style={{ WebkitLineClamp: titleLines, blockSize: `${titleLines * 1.5}em` }}>{item?.title ?? anonymousMessage}</p>
      <div className="workspace-card-labels">{item?.labels.slice(0, 2).map((label, index) => <span className="card-category" style={badgeStyle(colours.label(label))} title={label} key={index}><bdi>{label}</bdi></span>)}{item && item.labels.length > 2 && <span>+{item.labels.length - 2}</span>}</div>
      {item && <ProjectFields item={item} />}
      <footer><span>{item?.freshness === 'stale' && !(state.status === 'ready' && state.refreshing) ? 'Stale metadata' : item?.assignees.slice(0, 2).map((name) => `@${name}`).join(', ') || 'Unassigned'}</span>{!!item?.context?.related.length && <button type="button" className="card-related-count" data-native-ui="card-action" aria-label={`${item.context.related.length} related items`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); showDetails(); }}><Icon name="link" />{item.context.related.length}</button>}{url && <a href={url} target="_blank" rel="noreferrer" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()} aria-label="Open in GitHub"><Icon name="external" /></a>}</footer>
    </article>
  </HTMLContainer>;
}

export class ItemCardShapeUtil extends BaseBoxShapeUtil<ItemCardShape> {
  static override type = ITEM_CARD_TYPE;
  static override props = itemCardProps;
  static override migrations = itemCardMigrations;
  getDefaultProps(): ItemCardShape['props'] {
    return { version: 1, referenceId: 'unresolved', kind: 'issue', w: 280, h: 200, color: 'black' };
  }
  override canEdit() { return false; }
  override canResize() { return true; }
  override onResize(shape: ItemCardShape, info: TLResizeInfo<ItemCardShape>) {
    return resizeBox(shape, info, { minWidth: 220, minHeight: 180, maxWidth: 1920, maxHeight: 1920 });
  }
  // Descriptions must never read a private cache from a global SDK utility.
  override getAriaDescriptor(shape: ItemCardShape) { return `${shape.props.kind === 'issue' ? 'Issue' : 'Pull request'} card. Use Find for keyboard selection and the Card details button for full details.`; }
  component(shape: ItemCardShape) { return <ItemCard shape={shape} />; }
  getIndicatorPath(shape: ItemCardShape) {
    const path = new Path2D();
    path.rect(0, 0, shape.props.w, shape.props.h);
    return path;
  }
}
