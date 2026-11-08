import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { computed, useEditor, useValue } from 'tldraw';
import { githubItemUrl, type WorkspaceMetadata } from '../../shared/items';
import { ITEM_CARD_TYPE, type ItemCardShape } from '../../shared/nativeDocument';
import { Icon } from '../Icon';
import { itemStateLabel, describeItem } from './metadata';
import { planningRoles, type PlanningSelection } from '../../shared/planning';
import { ProjectFields } from './planning';
import { RelatedLinks, relatedTo, type ConnectionMode } from './RelatedLinks';
import { AccountSettingsContext, BoardSettingsContext, useWorkspacePanel, useWorkspacePanels } from './panels';
import { useNativeUiKeys } from './useNativeUiKeys';
import { useCardDetailPosition } from './useCardDetailPosition';
import { CardColourSettings } from './cardColours';
import { usePanelClearance } from './usePanelClearance';
import { useCardDetails } from './cardDetails';
import { CardMarkdown } from './CardMarkdown';
import { useCardDetailDismiss } from './useCardDetailDismiss';

export function WorkspacePanels({ children, metadata, planning, onPlanningChange, preferenceKey, hideClosed, onHideClosedChange }: { children?: ReactNode; metadata: WorkspaceMetadata; hideClosed: boolean; onHideClosedChange: (value: boolean) => void; planning?: PlanningSelection | undefined; onPlanningChange?: ((selection: PlanningSelection) => void) | undefined; preferenceKey?: string | undefined }) {
  const editor = useEditor();
  const { active, open: openPanel, menuTrigger: mobileMenuTrigger } = useWorkspacePanels();
  const menu = useWorkspacePanel('menu', { trigger: mobileMenuTrigger });
  const mobileMenuOpen = menu.isOpen;
  useNativeUiKeys();
  const boardSettings = useContext(BoardSettingsContext);
  const accountSettings = useContext(AccountSettingsContext);
  const registerAccountSettings = accountSettings?.registerWorkspace;
  useLayoutEffect(() => registerAccountSettings?.(), [registerAccountSettings]);
  const accountNeedsAttention = accountSettings?.needsAttention ?? false;
  useEffect(() => { if (accountNeedsAttention) openPanel('settings'); }, [accountNeedsAttention, openPanel]);
  const [mode, setMode] = useState<ConnectionMode>(() => {
    try { const value = localStorage.getItem(`gitbored.connections.${preferenceKey}`); return value === 'off' || value === 'all' ? value : 'selected'; } catch { return 'selected'; }
  });
  const [query, setQuery] = useState('');
  const { detailId, setDetailId } = useCardDetails();
  const viewTrigger = useRef<HTMLButtonElement>(null);
  const settingsPanel = useRef<HTMLElement>(null);
  const settingsDismiss = useRef<HTMLButtonElement>(null);
  const settings = useWorkspacePanel('settings', { trigger: viewTrigger, initialFocus: settingsDismiss, focusWhenTriggerHidden: true });
  const settingsOpen = settings.isOpen;
  usePanelClearance(settingsPanel, settingsOpen);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const find = useWorkspacePanel('find', { trigger, initialFocus: search });
  const open = find.isOpen;
  // Panel content follows membership and card properties; geometry stays in the canvas.
  const cards = useValue(useMemo(() => computed('Board cards', () => editor.getCurrentPageShapes().filter((shape): shape is ItemCardShape => shape.type === ITEM_CARD_TYPE && !editor.isShapeHidden(shape)), {
    isEqual: (a: ItemCardShape[], b: ItemCardShape[]) => a.length === b.length && a.every((shape, index) => shape.id === b[index]?.id && shape.props === b[index]?.props),
  }), [editor]));
  const matchingCards = cards.filter((shape) => describeItem(shape.props.kind, metadata.get(shape.props.referenceId) ?? { status: 'loading' }).toLowerCase().includes(query.toLowerCase()));
  const selected = useValue(useMemo(() => computed('Inspected card', () => {
    const shape = detailId ? editor.getShape(detailId) : undefined;
    return shape?.type === ITEM_CARD_TYPE && !editor.isShapeHidden(shape) ? shape : null;
  }, { isEqual: (a: ItemCardShape | null, b: ItemCardShape | null) => a?.id === b?.id && a?.props === b?.props }), [editor, detailId]));
  const detailsOpen = !mobileMenuOpen && !!selected && active !== 'settings' && active !== 'boards';
  const { ref: detailRef, position: detailPosition } = useCardDetailPosition(detailsOpen ? selected?.id ?? null : null);
  const dismissDetails = useCallback(() => setDetailId(null), [setDetailId]);
  useCardDetailDismiss(detailsOpen, detailRef, dismissDetails);
  useEffect(() => { if (detailsOpen) detailRef.current?.querySelector<HTMLButtonElement>('[data-native-dismiss]')?.focus({ preventScroll: true }); }, [detailsOpen, detailId, detailRef]);
  const state = selected ? metadata.get(selected.props.referenceId) : undefined;
  const item = state?.status === 'ready' ? state.item : null;
  const url = item ? githubItemUrl(item.kind, item.locator) : null;
  const projects = [...new Map([...metadata.values()].flatMap((value) => value.status === 'ready' ? value.item.context?.projects.map((project) => [project.id, project] as const) ?? [] : [])).values()];
  const project = projects.find((entry) => entry.id === planning?.projectId);
  const related = item ? cards.filter((shape) => {
    if (shape.id === selected?.id) return false;
    const value = metadata.get(shape.props.referenceId);
    return value?.status === 'ready' && (relatedTo(item, value.item) || relatedTo(value.item, item));
  }) : [];
  return <>
    <RelatedLinks metadata={metadata} mode={mode} />
    <div className="workspace-tools" data-menu-open={mobileMenuOpen}>
      <div className="mobile-menu-control" data-native-ui="mobile-menu" onPointerDown={(event) => event.stopPropagation()}>
        <button ref={mobileMenuTrigger} className="mobile-workspace-menu" type="button" aria-expanded={mobileMenuOpen} data-mobile-dismiss aria-label="Menu" onClick={menu.toggle}><Icon name="menu" /><span>Menu</span></button>
        {mobileMenuOpen && <div className="mobile-menu-heading"><h2>Board tools</h2><button className="mobile-menu-dismiss" type="button" data-native-dismiss aria-label="Close menu" onClick={menu.dismiss}><Icon name="close" /></button></div>}
      </div>
      <div className="workspace-view" data-native-ui="settings" onPointerDown={(event) => event.stopPropagation()}>
      <button ref={viewTrigger} type="button" aria-expanded={settingsOpen} onClick={settings.toggle}><Icon name="settings" /> Settings</button>
      {settingsOpen && <section ref={settingsPanel} className="workspace-floating-panel workspace-settings-panel" aria-label="Settings"><div className="incoming-heading"><h2>Settings</h2><button ref={settingsDismiss} type="button" data-native-dismiss aria-label="Close Settings" onClick={settings.dismiss}><Icon name="close" /></button></div><div className="workspace-panel-body view-settings">
        {accountSettings?.workspaceMounted && <fieldset className="settings-group"><legend>Account & appearance</legend>{accountSettings.content}</fieldset>}
        {boardSettings && <fieldset className="settings-group"><legend>Board</legend>{boardSettings}</fieldset>}
        <fieldset className="settings-group"><legend>View</legend>
        <label>Hide closed<input type="checkbox" checked={hideClosed} onChange={(event) => { onHideClosedChange(event.currentTarget.checked); editor.selectNone(); }} /></label>
        <label>Connections<select aria-label="Connections" value={mode} onChange={(event) => { const value = event.currentTarget.value; if (value !== 'off' && value !== 'selected' && value !== 'all') return; setMode(value); try { localStorage.setItem(`gitbored.connections.${preferenceKey}`, value); } catch { /* Session preference still applies. */ } }}><option value="off">Off</option><option value="selected">Selected</option><option value="all">All</option></select></label>
        </fieldset>
        <CardColourSettings />
        <fieldset className="settings-group"><legend>Project fields</legend>
        <label>Project<select aria-label="Project" value={planning?.projectId ?? ''} onChange={(event) => {
          const selected = projects.find((entry) => entry.id === event.currentTarget.value);
          const field = (pattern: RegExp) => selected?.fields.find((entry) => pattern.test(entry.name))?.id ?? '';
          onPlanningChange?.({ projectId: selected?.id ?? '', status: field(/^status$/i), weight: field(/^(weight|estimate|points)$/i), priority: field(/^priority$/i), sprint: field(/^(sprint|iteration)$/i) });
        }}><option value="">None</option>{projects.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select></label>
        {planning?.projectId && planningRoles.map((role) => <label key={role}>{role}<select aria-label={`${role} field`} value={planning[role]} onChange={(event) => onPlanningChange?.({ ...planning, [role]: event.currentTarget.value })}><option value="">None</option>{project?.fields.map((field) => <option key={field.id} value={field.id}>{field.name}</option>)}</select></label>)}
        {!projects.length && <p>{[...metadata.values()].some((value) => value.status === 'ready' && value.item.context?.status === 'unavailable') ? 'Project data unavailable. Check GitHub access and refresh.' : 'No projects on these cards.'}</p>}
        </fieldset>
      </div></section>}
    </div>
    <div className="workspace-find" data-native-ui="cards" onPointerDown={(event) => event.stopPropagation()}>
      <button ref={trigger} type="button" aria-expanded={open} onClick={find.toggle}><Icon name="search" /> Find <span>{cards.length}</span></button>
      {open && <section className="workspace-floating-panel" aria-label="Find cards">
        <div className="incoming-heading"><h2>Find cards</h2><button data-native-dismiss type="button" aria-label="Close Find" onClick={find.dismiss}><Icon name="close" /></button></div>
        <div className="workspace-panel-body"><input ref={search} type="search" aria-label="Find cards" placeholder="Title, number, repository…" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
        <ul className="workspace-find-results">{matchingCards.map((shape) => {
          const value = metadata.get(shape.props.referenceId);
          return <li key={shape.id}><button type="button" onClick={() => {
            editor.complete(); editor.setCurrentTool('select'); editor.select(shape.id);
            const bounds = editor.getShapePageBounds(shape.id);
            if (bounds) editor.centerOnPoint(bounds.center, { animation: { duration: 0 } });
            setDetailId(null); find.close();
            editor.getContainer().focus({ preventScroll: true }); editor.focus();
          }}><Icon name={shape.props.kind === 'issue' ? 'issue' : 'pr'} /><span>{value?.status === 'ready' ? <><small>{value.item.locator.repository} #{value.item.locator.number} · {itemStateLabel(value.item)}</small><span className="find-result-title">{value.item.title}</span></> : 'Unavailable card'}</span></button></li>;
        })}</ul>{!cards.length ? <p className="panel-empty">No cards on this board. Connect a repository, then add cards from Incoming.</p> : !matchingCards.length && <div className="panel-empty"><p>No cards match “{query}”.</p><button type="button" onClick={() => { setQuery(''); search.current?.focus(); }}>Clear search</button></div>}</div>
      </section>}
    </div>
    {children}</div>
    {selected && detailsOpen && <section ref={detailRef} style={detailPosition} className="workspace-detail workspace-floating-panel" data-native-ui="details" aria-label="Card details" onPointerDown={(event) => event.stopPropagation()}>
      <div className="incoming-heading"><h2>Card details</h2><button type="button" data-native-dismiss aria-label="Close details" onClick={() => { setDetailId(null); const trigger = editor.getContainer().querySelector<HTMLButtonElement>(`[data-detail-card="${CSS.escape(selected.id)}"]`); if (trigger) trigger.focus({ preventScroll: true }); else { editor.getContainer().focus({ preventScroll: true }); editor.focus(); } }}><Icon name="close" /></button></div>
      <div className="workspace-panel-body">{item ? <>
        <p className="detail-locator">{item.locator.owner}/{item.locator.repository} #{item.locator.number}</p>
        <h3>{item.title}</h3>
        <div className="card-detail-body">{item.body?.trim() ? <CardMarkdown body={item.body} /> : 'No description provided.'}</div>
        <ProjectFields item={item} />
        <dl className="detail-values"><div><dt>State</dt><dd>{itemStateLabel(item)}</dd></div><div><dt>Labels</dt><dd>{item.labels.join(', ') || '—'}</dd></div><div><dt>Assignees</dt><dd>{item.assignees.map((login) => `@${login}`).join(', ') || '—'}</dd></div></dl>
        <h4>Related <span>{related.length}</span></h4>
        <ul className="workspace-find-results">{related.map((shape) => {
          const value = metadata.get(shape.props.referenceId);
          return <li key={shape.id}><button type="button" onClick={() => { editor.select(shape.id); setDetailId(shape.id); }}><Icon name="link" />{value?.status === 'ready' ? `#${value.item.locator.number} ${value.item.title}` : 'Related card'}</button></li>;
        })}</ul>
        {item.context?.related.filter((link) => !cards.some((shape) => { const value = metadata.get(shape.props.referenceId); return value?.status === 'ready' && value.item.locator.owner === link.owner && value.item.locator.repository === link.repository && value.item.locator.number === link.number; })).map((link) => {
          const href = githubItemUrl(link.kind, link);
          return href ? <p key={href}><a href={href} target="_blank" rel="noreferrer"><Icon name="external" />{link.owner}/{link.repository} #{link.number}</a></p> : null;
        })}
        {item.context?.status === 'unavailable'  && <p>Related items unavailable. Refresh to retry.</p>}
        {item.context?.status === 'partial' && <p>Some project fields or links are unavailable. Open GitHub for the full list.</p>}
        {url && <a href={url} target="_blank" rel="noreferrer"><Icon name="external" /> Open in GitHub</a>}
      </> : <p>{state?.status === 'loading' ? 'Loading…' : state?.status === 'sso-required' ? 'GitHub SSO required. Use the recovery notice to reconnect your organisation.' : 'Details unavailable. Refresh to retry.'}</p>}</div>
    </section>}
  </>;
}
