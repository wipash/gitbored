import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { TLDefaultColorStyle } from '@tldraw/tlschema';
import type { ItemMetadata } from '../../shared/items';
import type { PlanningSelection } from '../../shared/planning';
import { MetadataContext, itemStateLabel } from './metadata';
import { PlanningContext } from './planningContext';
import { Icon } from '../Icon';
import { useWorkspacePanel } from './panels';
import { usePanelClearance } from './usePanelClearance';
import './cardColours.css';

type ColourMode = 'off' | 'status' | 'priority' | 'labels' | 'type' | 'assignee';
type Category = 'status' | 'priority' | 'label' | 'type' | 'assignee';
interface ColourPreferences { mode: ColourMode; overrides: Record<string, string> }
interface ColourContextValue { preferences: ColourPreferences; update: (preferences: ColourPreferences) => void; persistent: boolean }
const emptyPreferences: ColourPreferences = { mode: 'off', overrides: {} };
interface ColourModeOption { value: ColourMode; label: string }
const colourModes: ColourModeOption[] = [
  { value: 'off', label: 'Off' }, { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Priority' }, { value: 'labels', label: 'Labels' }, { value: 'type', label: 'Type' },
  { value: 'assignee', label: 'Assignee' },
];
const ColourContext = createContext<ColourContextValue>({ preferences: emptyPreferences, update: () => {}, persistent: true });
const palette = ['#437ed1', '#9561c9', '#168879', '#cd731b', '#bd4f7c', '#597d32'];
const nativeColours: Record<TLDefaultColorStyle, string> = { black: 'var(--color-border-subtle)', grey: '#87929e', 'light-violet': '#b69ddd', violet: '#9561c9', blue: '#437ed1', 'light-blue': '#68b8db', yellow: '#d4ad21', orange: '#cd731b', green: '#168879', 'light-green': '#8baf53', 'light-red': '#df91a7', red: '#cd5860', white: '#ffffff' };
const defaults: Record<string, string> = { 'status:cancelled': '#87929e', 'assignee:unassigned': '#ffffff', 'status:open': '#168879', 'status:closed': '#9561c9', 'status:merged': '#9561c9', 'status:draft': '#87929e', 'status:in progress': '#437ed1', 'status:ready': '#168879', 'priority:no priority': '#87929e', 'priority:high': '#cd731b', 'priority:urgent': '#cd5860', 'priority:low': '#597d32', 'type:issue': '#168879', 'type:pull request': '#9561c9', 'type:bug': '#cd5860', 'type:feature': '#437ed1' };
function isMode(value: unknown): value is ColourMode { return value === 'off' || value === 'status' || value === 'priority' || value === 'labels' || value === 'type' || value === 'assignee'; }
function readPreferences(key: string): ColourPreferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!value || typeof value !== 'object' || !('mode' in value) || !('overrides' in value) || !value.overrides || typeof value.overrides !== 'object') return emptyPreferences;
    const mode = value.mode === 'assignment' ? 'assignee' : value.mode;
    if (!isMode(mode)) return emptyPreferences;
    const overrides: Record<string, string> = {};
    for (const [name, colour] of Object.entries(value.overrides)) if (typeof colour === 'string' && /^#[0-9a-f]{6}$/i.test(colour)) overrides[name] = colour;
    return { mode, overrides };
  } catch { return emptyPreferences; }
}
export function CardColourProvider({ children, preferenceKey }: { children: ReactNode; preferenceKey: string | undefined }) {
  const key = `gitbored.card-colours.${preferenceKey ?? 'workspace'}`;
  const [preferences, setPreferences] = useState(() => readPreferences(key));
  const [persistent, setPersistent] = useState(true);
  function update(next: ColourPreferences) {
    setPreferences(next);
    try { localStorage.setItem(key, JSON.stringify(next)); setPersistent(true); } catch { setPersistent(false); }
  }
  return <ColourContext value={{ preferences, update, persistent }}>{children}</ColourContext>;
}
function colourFor(preferences: ColourPreferences, category: Category, value: string): string {
  const key = `${category}:${value.toLowerCase()}`;
  const override = Object.hasOwn(preferences.overrides, key) ? preferences.overrides[key] : undefined;
  if (override) return override;
  const standard = defaults[key];
  if (standard) return standard;
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length] ?? '#437ed1';
}
export function useCategoryColour() {
  const { preferences } = useContext(ColourContext);
  return (category: Category, value: string) => colourFor(preferences, category, value);
}
export function itemType(item: ItemMetadata): string {
  if (item.kind === 'pull-request') return 'Pull request';
  if (item.labels.some((label) => /(^|[\s:/-])bug($|[\s:/-])/i.test(label))) return 'Bug';
  if (item.labels.some((label) => /(^|[\s:/-])(feature|enhancement)($|[\s:/-])/i.test(label))) return 'Feature';
  return 'Issue';
}
function projectValue(item: ItemMetadata, planning: PlanningSelection | undefined, role: 'status' | 'priority') {
  return item.context?.projects.find((project) => project.id === planning?.projectId)?.fields.find((field) => field.id === planning?.[role])?.value;
}
function categoryValues(item: ItemMetadata, planning: PlanningSelection | undefined) {
  return { status: projectValue(item, planning, 'status') || itemStateLabel(item), priority: projectValue(item, planning, 'priority') || 'No priority', type: itemType(item) };
}
interface CardStyle extends CSSProperties { '--card-accent'?: string; '--card-stripes'?: string; '--badge-accent'?: string }
export function badgeStyle(colour: string): CardStyle { return { '--badge-accent': colour }; }
export function useCardColours(item: ItemMetadata | null, manual: TLDefaultColorStyle) {
  const { preferences } = useContext(ColourContext);
  const planning = useContext(PlanningContext);
  const values = item ? categoryValues(item, planning) : { status: 'Unavailable', priority: 'No priority', type: 'Issue' };
  const label = (value: string) => colourFor(preferences, 'label', value);
  const status = colourFor(preferences, 'status', item ? itemStateLabel(item) : 'Unavailable');
  const type = colourFor(preferences, 'type', values.type);
  let colours = [nativeColours[manual]];
  if (item && preferences.mode !== 'off') {
    if (preferences.mode === 'labels') colours = item.labels.length ? item.labels.map(label) : [nativeColours[manual]];
    else if (preferences.mode === 'assignee') colours = assigneeValues(item).map((value) => colourFor(preferences, 'assignee', value));
    else colours = [colourFor(preferences, preferences.mode, values[preferences.mode])];
  }
  const accent = colours[0] ?? nativeColours.black;
  const stripes = colours.length > 1 ? `linear-gradient(to right, ${colours.map((colour, index) => `${colour} ${index * 100 / colours.length}% ${(index + 1) * 100 / colours.length}%`).join(', ')})` : accent;
  const cardStyle: CardStyle = { '--card-accent': accent, '--card-stripes': stripes };
  return { cardStyle, status, type, label, mode: preferences.mode };
}
function assigneeValues(item: ItemMetadata): string[] {
  return item.assignees.length ? [...new Set(item.assignees.map((login) => `@${login.toLowerCase()}`))].sort() : ['Unassigned'];
}
function modeCategory(mode: Exclude<ColourMode, 'off'>): Category { return mode === 'labels' ? 'label' : mode; }

export function CardColourControl() {
  const { preferences, update, persistent } = useContext(ColourContext);
  const trigger = useRef<HTMLButtonElement>(null);
  const dismissButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const control = useRef<HTMLDivElement>(null);
  const { isOpen, toggle, close, dismiss } = useWorkspacePanel('colours', { trigger, initialFocus: dismissButton });
  usePanelClearance(panel, isOpen);
  useEffect(() => {
    if (!isOpen) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !control.current?.contains(event.target)) close();
    };
    document.addEventListener('pointerdown', outside, true);
    return () => document.removeEventListener('pointerdown', outside, true);
  }, [isOpen, close]);
  const selected = colourModes.find(({ value }) => value === preferences.mode);
  return <div ref={control} className="card-colour-control" data-native-ui="card-colours" onPointerDown={(event) => event.stopPropagation()}>
    <fieldset className="card-colour-modes">
      <legend>Colour by</legend>
      <div className="card-colour-segments">{colourModes.map(({ value, label }) => <label key={value}>
        <input type="radio" name="card-colour-mode" value={value} checked={preferences.mode === value} onChange={() => update({ ...preferences, mode: value })} />
        <span>{label}</span>
      </label>)}</div>
    </fieldset>
    <button ref={trigger} type="button" aria-expanded={isOpen} aria-controls="card-colour-panel" onClick={toggle}>Colours<Icon name="chevronDown" /></button>
    <div className="colour-storage-status" role="status">{!persistent && !isOpen && <p className="colour-help">Colours apply for this visit. Allow browser storage to keep these settings.</p>}</div>
    {isOpen && <section ref={panel} id="card-colour-panel" className="workspace-floating-panel card-colour-panel" aria-label="Card colours">
      <div className="incoming-heading"><h2>{preferences.mode === 'off' ? 'Card colours' : `${selected?.label} colours`}</h2><button ref={dismissButton} type="button" data-native-dismiss aria-label="Close Card colours" onClick={dismiss}><Icon name="close" /></button></div>
      <div className="workspace-panel-body">
        {preferences.mode === 'off' ? <p className="colour-help">Cards use their saved colours. Choose a mode to colour them by their GitHub data.</p> : <CategoryColourSettings category={modeCategory(preferences.mode)} />}
        <div role="status">{!persistent && <p className="colour-help">Colours apply for this visit. Allow browser storage to keep these settings.</p>}</div>
      </div>
    </section>}
  </div>;
}
function CategoryColourSettings({ category }: { category: Category }) {
  const { preferences, update } = useContext(ColourContext);
  const metadata = useContext(MetadataContext);
  const planning = useContext(PlanningContext);
  const items = [...metadata.values()].flatMap((state) => state.status === 'ready' ? [state.item] : []);
  const standardValues: Partial<Record<Category, string[]>> = {
    status: ['Open', 'Closed', 'Merged', 'Cancelled', 'Draft'],
    assignee: ['Unassigned'], type: ['Issue', 'Pull request', 'Feature', 'Bug'],
  };
  const values = [...new Set([
    ...(standardValues[category] ?? []),
    ...items.flatMap((item) => category === 'label' ? [...item.labels] : category === 'assignee' ? assigneeValues(item) : [categoryValues(item, planning)[category]]),
  ])].sort((a, b) => a.localeCompare(b));
  const help = category === 'status' ? 'Uses project status when set, otherwise Open, Closed, Merged or Draft. Issues closed as not planned show as Cancelled.'
      : category === 'priority' ? 'Uses the project priority field chosen in Settings. Cards without one show as No priority.'
        : category === 'assignee' ? 'Each person has a consistent colour. Multiple assignees share a split strip. Unassigned defaults to white.'
          : category === 'label' ? 'Cards with multiple labels use a split strip.' : null;
  return <fieldset className="card-colour-settings"><legend>Colour key</legend>
    {help && <p className="colour-help">{help}</p>}
    <div className="category-colour-list">{values.map((value) => <label key={value}><span><bdi>{value}</bdi></span><input type="color" aria-label={`${value} colour`} value={colourFor(preferences, category, value)} onChange={(event) => update({ ...preferences, overrides: { ...preferences.overrides, [`${category}:${value.toLowerCase()}`]: event.currentTarget.value } })} /></label>)}</div>
    {!values.length && <p>No values on these cards yet.</p>}
    {!values.length && <p className="colour-help">Add cards from Incoming. If their data is unavailable, refresh the board to retry.</p>}
    {!!values.length && <p className="colour-help">Select a swatch to change its colour.</p>}
    <button type="button" onClick={() => update({ ...preferences, overrides: Object.fromEntries(Object.entries(preferences.overrides).filter(([key]) => !key.startsWith(`${category}:`))) })}>Reset these colours</button>
  </fieldset>;
}
