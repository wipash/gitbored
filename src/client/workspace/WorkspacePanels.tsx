import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { computed, useEditor, useValue } from 'tldraw';
import { githubItemUrl, type WorkspaceMetadata } from '../../shared/items';
import { ITEM_CARD_TYPE, type ItemCardShape } from '../../shared/nativeDocument';
import { Icon } from '../Icon';
import { itemStateLabel, describeItem } from './metadata';
import { planningRoles, type PlanningSelection } from '../../shared/planning';
import { ProjectFields } from './planning';
import { RelatedLinks, relatedTo, type ConnectionMode } from './RelatedLinks';
import { AccountSettingsContext, BoardSettingsContext, useWorkspacePanel } from './panels';
import { useNativeUiKeys } from './useNativeUiKeys';
import { useCardDetailPosition } from './useCardDetailPosition';
import { CardColourSettings } from './cardColours';
import { usePanelClearance } from './usePanelClearance';
import { focusPanelTrigger } from './focusPanelTrigger';

export function WorkspacePanels({ children, metadata, planning, onPlanningChange, preferenceKey, hideClosed, onHideClosedChange }: { children?: ReactNode; metadata: WorkspaceMetadata; hideClosed: boolean; onHideClosedChange: (value: boolean) => void; planning?: PlanningSelection | undefined; onPlanningChange?: ((selection: PlanningSelection) => void) | undefined; preferenceKey?: string | undefined }) {
  const editor = useEditor();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 901px)');
    const close = () => { if (desktop.matches) setMobileMenuOpen(false); };
    desktop.addEventListener('change', close);
    return () => desktop.removeEventListener('change', close);
  }, []);
  useNativeUiKeys();
  const { active, setActive } = useWorkspacePanel();
  const boardSettings = useContext(BoardSettingsContext);
  const accountSettings = useContext(AccountSettingsContext);
  const registerAccountSettings = accountSettings?.registerWorkspace;
  useLayoutEffect(() => registerAccountSettings?.(), [registerAccountSettings]);
  const accountNeedsAttention = accountSettings?.needsAttention ?? false;
  useEffect(() => { if (accountNeedsAttention) setActive('settings'); }, [accountNeedsAttention, setActive]);
  const settingsOpen = active === 'settings';
  const setSettingsOpen = (value: boolean) => setActive(value ? 'settings' : null);
  const [mode, setMode] = useState<ConnectionMode>(() => {
    try { const value = localStorage.getItem(`gitbored.connections.${preferenceKey}`); return value === 'off' || value === 'all' ? value : 'selected'; } catch { return 'selected'; }
  });
  const open = active === 'find';
  const setOpen = (value: boolean) => setActive(value ? 'find' : null);
  const [query, setQuery] = useState('');
  const [dismissed, setDismissed] = useState<string | null>(null);
  const viewTrigger = useRef<HTMLButtonElement>(null);
  const settingsPanel = useRef<HTMLElement>(null);
  usePanelClearance(settingsPanel, settingsOpen);
  useEffect(() => {
    if (settingsOpen && viewTrigger.current?.getClientRects().length === 0) settingsPanel.current?.querySelector<HTMLButtonElement>('[data-native-dismiss]')?.focus();
  }, [settingsOpen]);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  // Panel content follows membership and card properties; geometry stays in the canvas.
  const cards = useValue(useMemo(() => computed('Board cards', () => editor.getCurrentPageShapes().filter((shape): shape is ItemCardShape => shape.type === ITEM_CARD_TYPE && !editor.isShapeHidden(shape)), {
    isEqual: (a: ItemCardShape[], b: ItemCardShape[]) => a.length === b.length && a.every((shape, index) => shape.id === b[index]?.id && shape.props === b[index]?.props),
  }), [editor]));
  const selected = useValue(useMemo(() => computed('Inspected card', () => {
    const shape = editor.getOnlySelectedShape();
    return shape?.type === ITEM_CARD_TYPE ? shape : null;
  }, { isEqual: (a: ItemCardShape | null, b: ItemCardShape | null) => a?.id === b?.id && a?.props === b?.props }), [editor]));
  const detailsOpen = !mobileMenuOpen && !!selected && dismissed !== selected.id && active !== 'settings' && active !== 'boards';
  const { ref: detailRef, position: detailPosition } = useCardDetailPosition(detailsOpen);
  const state = selected ? metadata.get(selected.props.referenceId) : undefined;
  const item = state?.status === 'ready' ? state.item : null;
  const url = item ? githubItemUrl(item.kind, item.locator) : null;
  useEffect(() => { if (open) search.current?.focus(); }, [open]);
  const projects = [...new Map([...metadata.values()].flatMap((value) => value.status === 'ready' ? value.item.context?.projects.map((project) => [project.id, project] as const) ?? [] : [])).values()];
  const project = projects.find((entry) => entry.id === planning?.projectId);
  const related = item ? cards.filter((shape) => {
    if (shape.id === selected?.id) return false;
    const value = metadata.get(shape.props.referenceId);
    return value?.status === 'ready' && (relatedTo(item, value.item) || relatedTo(value.item, item));
  }) : [];
  return <>
    <RelatedLinks metadata={metadata} mode={mode} />
    <div className="workspace-tools" data-menu-open={mobileMenuOpen} onClick={(event) => {
      const button = event.target instanceof Element ? event.target.closest('button') : null;
      if (button?.matches('.workspace-view > button, .workspace-find > button, .incoming-controls > button')) setMobileMenuOpen(false);
    }}>
      <div className="mobile-menu-control" data-native-ui="mobile-menu" onPointerDown={(event) => event.stopPropagation()}>
        <button ref={mobileMenuTrigger} className="mobile-workspace-menu" type="button" aria-expanded={mobileMenuOpen} data-mobile-dismiss aria-label="Menu" onClick={() => { setMobileMenuOpen(!mobileMenuOpen); setActive(null); }}><Icon name="menu" /><span>Menu</span></button>
        {mobileMenuOpen && <button className="mobile-menu-dismiss" type="button" data-native-dismiss aria-label="Close menu" onClick={() => { setMobileMenuOpen(false); mobileMenuTrigger.current?.focus(); }}><Icon name="close" /></button>}
      </div>
      <div className="workspace-view" data-native-ui="settings" onPointerDown={(event) => event.stopPropagation()}>
      <button ref={viewTrigger} type="button" aria-expanded={settingsOpen} onClick={() => setSettingsOpen(!settingsOpen)}>Settings</button>
      {settingsOpen && <section ref={settingsPanel} className="workspace-floating-panel workspace-settings-panel" aria-label="Settings"><div className="incoming-heading"><h2>Settings</h2><button type="button" data-native-dismiss aria-label="Close Settings" onClick={() => { setSettingsOpen(false); focusPanelTrigger(viewTrigger.current); }}><Icon name="close" /></button></div><div className="workspace-panel-body view-settings">
        {accountSettings?.workspaceMounted && accountSettings.content}
        {boardSettings}
        <label>Hide closed<input type="checkbox" checked={hideClosed} onChange={(event) => { onHideClosedChange(event.currentTarget.checked); editor.selectNone(); }} /></label>
        <label>Connections<select aria-label="Connections" value={mode} onChange={(event) => { const value = event.currentTarget.value; if (value !== 'off' && value !== 'selected' && value !== 'all') return; setMode(value); try { localStorage.setItem(`gitbored.connections.${preferenceKey}`, value); } catch { /* Session preference still applies. */ } }}><option value="off">Off</option><option value="selected">Selected</option><option value="all">All</option></select></label>
        <label>Project<select aria-label="Project" value={planning?.projectId ?? ''} onChange={(event) => {
          const selected = projects.find((entry) => entry.id === event.currentTarget.value);
          const field = (pattern: RegExp) => selected?.fields.find((entry) => pattern.test(entry.name))?.id ?? '';
          onPlanningChange?.({ projectId: selected?.id ?? '', status: field(/^status$/i), weight: field(/^(weight|estimate|points)$/i), priority: field(/^priority$/i), sprint: field(/^(sprint|iteration)$/i) });
        }}><option value="">None</option>{projects.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select></label>
        {planning?.projectId && planningRoles.map((role) => <label key={role}>{role}<select aria-label={`${role} field`} value={planning[role]} onChange={(event) => onPlanningChange?.({ ...planning, [role]: event.currentTarget.value })}><option value="">None</option>{project?.fields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label>)}
        <CardColourSettings />
        {!projects.length && <p>{[...metadata.values()].some((value) => value.status === 'ready' && value.item.context?.status === 'unavailable') ? 'Project data unavailable. Check GitHub access and refresh.' : 'No projects on these cards.'}</p>}
      </div></section>}
    </div>
    <div className="workspace-find" data-native-ui="cards" onPointerDown={(event) => event.stopPropagation()}>
      <button ref={trigger} type="button" aria-expanded={open} onClick={() => setOpen(!open)}><Icon name="search" /> Find <span>{cards.length}</span></button>
      {open && <section className="workspace-floating-panel" aria-label="Find cards">
        <div className="incoming-heading"><h2>Find cards</h2><button data-native-dismiss type="button" aria-label="Close Find" onClick={() => { setOpen(false); focusPanelTrigger(trigger.current); }}><Icon name="close" /></button></div>
        <div className="workspace-panel-body"><input ref={search} type="search" aria-label="Find cards" placeholder="Title, number, repository…" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
        <ul className="workspace-find-results">{cards.filter((shape) => describeItem(shape.props.kind, metadata.get(shape.props.referenceId) ?? { status: 'loading' }).toLowerCase().includes(query.toLowerCase())).map((shape) => {
          const value = metadata.get(shape.props.referenceId);
          return <li key={shape.id}><button type="button" onClick={() => {
            editor.complete(); editor.setCurrentTool('select'); editor.select(shape.id);
            const bounds = editor.getShapePageBounds(shape.id);
            if (bounds) editor.centerOnPoint(bounds.center, { animation: { duration: 0 } });
            setDismissed(null); setOpen(false);
            editor.getContainer().focus({ preventScroll: true }); editor.focus();
          }}><Icon name={shape.props.kind === 'issue' ? 'issue' : 'pr'} /><span>{value?.status === 'ready' ? <><small>{value.item.locator.repository} #{value.item.locator.number} · {itemStateLabel(value.item)}</small>{value.item.title}</> : 'Unavailable card'}</span></button></li>;
        })}</ul>{!cards.length && <p>No cards on this board.</p>}</div>
      </section>}
    </div>
    {children}</div>
    {selected && detailsOpen && <section ref={detailRef} style={detailPosition} className="workspace-detail workspace-floating-panel" data-native-ui="details" aria-label="Card details" onPointerDown={(event) => event.stopPropagation()}>
      <div className="incoming-heading"><h2>Card details</h2><button type="button" data-native-dismiss aria-label="Close details" onClick={() => { setDismissed(selected.id); editor.getContainer().focus({ preventScroll: true }); editor.focus(); }}><Icon name="close" /></button></div>
      <div className="workspace-panel-body">{item ? <>
        <p className="detail-locator">{item.locator.owner}/{item.locator.repository} #{item.locator.number}</p>
        <h3>{item.title}</h3>
        <ProjectFields item={item} />
        <label className="card-size">Card size<select aria-label="Card size" value={selected.props.w === 280 && selected.props.h === 200 ? 'compact' : selected.props.w === 420 && selected.props.h === 300 ? 'expanded' : 'custom'} onChange={(event) => { const size = event.currentTarget.value; if (size === 'custom') return; editor.markHistoryStoppingPoint('resize-card'); editor.updateShape({ id: selected.id, type: selected.type, props: size === 'compact' ? { w: 280, h: 200 } : { w: 420, h: 300 } }); }}><option value="compact">Compact</option><option value="expanded">Expanded</option><option value="custom" disabled>Custom</option></select></label>
        <dl className="detail-values"><div><dt>State</dt><dd>{itemStateLabel(item)}</dd></div><div><dt>Labels</dt><dd>{item.labels.join(', ') || '—'}</dd></div><div><dt>Assignees</dt><dd>{item.assignees.map((login) => `@${login}`).join(', ') || '—'}</dd></div></dl>
        <h4>Related <span>{related.length}</span></h4>
        <ul className="workspace-find-results">{related.map((shape) => {
          const value = metadata.get(shape.props.referenceId);
          return <li key={shape.id}><button type="button" onClick={() => { editor.select(shape.id); setDismissed(null); }}><Icon name="link" />{value?.status === 'ready' ? `#${value.item.locator.number} ${value.item.title}` : 'Related card'}</button></li>;
        })}</ul>
        {item.context?.related.filter((link) => !cards.some((shape) => { const value = metadata.get(shape.props.referenceId); return value?.status === 'ready' && value.item.locator.owner === link.owner && value.item.locator.repository === link.repository && value.item.locator.number === link.number; })).map((link) => {
          const href = githubItemUrl(link.kind, link);
          return href ? <p key={href}><a href={href} target="_blank" rel="noreferrer"><Icon name="external" />{link.owner}/{link.repository} #{link.number}</a></p> : null;
        })}
        {item.context?.status === 'unavailable'  && <p>Related items unavailable. Refresh to retry.</p>}
        {item.context?.status === 'partial' && <p>Some project fields or links are unavailable. Open GitHub for the full list.</p>}
        {url && <a href={url} target="_blank" rel="noreferrer"><Icon name="external" /> Open in GitHub</a>}
      </> : <p>{state?.status === 'loading' ? 'Loading…' : 'Details unavailable. Refresh to retry.'}</p>}</div>
    </section>}
  </>;
}
