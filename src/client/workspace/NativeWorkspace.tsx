import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowToolbarItem, DefaultToolbar, DrawToolbarItem, EraserToolbarItem, FrameToolbarItem,
  RectangleToolbarItem, HandToolbarItem, HighlightToolbarItem, NoteToolbarItem, SelectToolbarItem,
  TextToolbarItem, Tldraw, atom, computed, createTLStore, defaultHandleExternalTldrawContent,
  DefaultStylePanel, StylePanelColorPicker, StylePanelFillPicker, StylePanelDashPicker,
  StylePanelSizePicker, StylePanelFontPicker, StylePanelTextAlignPicker, StylePanelLabelAlignPicker,
  StylePanelGeoShapePicker, StylePanelArrowKindPicker, StylePanelArrowheadPicker, StylePanelSplinePicker,
  useStylePanelContext, type TLUiStylePanelProps,
  useEditor, useValue, type Editor, type TLShape, type TLComponents, type TLUiOverrides, type TLUiEventHandler, type TLUserStore,
} from 'tldraw';
import type { WorkspaceMetadata } from '../../shared/items';
import { ITEM_CARD_TYPE, nativeSchema, validateNativeDocument, validateNativeShape, type NativeDocument } from '../../shared/nativeDocument';
import { validateNativeClipboard } from '../../shared/nativeClipboard';
import { ItemCardShapeUtil } from './ItemCardShapeUtil';
import { MetadataContext } from './metadata';
import 'tldraw/tldraw.css';
import './workspace.css';
import type { PlanningSelection } from '../../shared/planning';
import { PlanningContext } from './planning';
import { WorkspacePanels } from './WorkspacePanels';
import { CardColourProvider } from './cardColours';

export interface NativeWorkspaceProps {
  planning?: PlanningSelection | undefined;
  preferenceKey?: string;
  onPlanningChange?: (selection: PlanningSelection) => void;
  /** Initial only. Remount with an account/board key when switching authority or documents. */
  initialDocument?: NativeDocument;
  /** Replace the immutable map to refresh metadata; it never enters the editor store/history. */
  metadata: WorkspaceMetadata;
  theme: 'light' | 'dark';
  onDocumentChange(document: NativeDocument): void;
  onMount?(editor: Editor): void | (() => void);
  onNativeHistory?(editor: Editor, direction: 'undo' | 'redo'): void;
  children?: ReactNode;
}

/** Export only canvas content; SDK local-user and session records are not board data. */
export function captureNativeDocument(editor: Editor): NativeDocument {
  const snapshot = editor.store.getStoreSnapshot('document');
  const store: NativeDocument['snapshot']['store'] = {};
  for (const record of Object.values(snapshot.store)) {
    if (record.typeName === 'shape') store[record.id] = validateNativeShape(record);
    else if (['document', 'page', 'binding'].includes(record.typeName)) store[record.id] = record;
  }
  return { format: 'gitbored-native', version: 1, snapshot: { store, schema: snapshot.schema } };
}
const workspaceUsers: TLUserStore = {
  currentUser: computed('workspace annotation attribution', () => null),
};
function WorkspaceToolbar() {
  return <DefaultToolbar><SelectToolbarItem /><HandToolbarItem /><DrawToolbarItem /><EraserToolbarItem /><ArrowToolbarItem /><TextToolbarItem /><NoteToolbarItem /><RectangleToolbarItem /><FrameToolbarItem /><HighlightToolbarItem /></DefaultToolbar>;
}
function WorkspaceOpacity() {
  const editor = useEditor();
  const stylePanel = useStylePanelContext();
  const opacity = useValue('Workspace opacity', () => editor.getSharedOpacity(), [editor]);
  return <label className="workspace-opacity">Opacity
    <input aria-label="Opacity" type="range" min={10} max={100} step={5}
      value={opacity?.type === 'shared' ? opacity.value * 100 : 100}
      onPointerDown={() => stylePanel.onHistoryMark('opacity')}
      onKeyDown={() => stylePanel.onHistoryMark('opacity')}
      onChange={(event) => stylePanel.onOpacityChange(Number(event.currentTarget.value) / 100)} />
  </label>;
}
function WorkspaceStylePanel(props: TLUiStylePanelProps) {
  const editor = useEditor();
  const visible = useValue('Drawing styles visible', () => editor.getCurrentToolId() !== 'select' || editor.getSelectedShapes().length > 0, [editor]);
  if (!visible) return null;
  return <DefaultStylePanel {...props}><StylePanelColorPicker /><WorkspaceOpacity /><StylePanelFillPicker /><StylePanelDashPicker /><StylePanelSizePicker /><StylePanelFontPicker /><StylePanelTextAlignPicker /><StylePanelLabelAlignPicker /><StylePanelGeoShapePicker /><StylePanelArrowKindPicker /><StylePanelArrowheadPicker /><StylePanelSplinePicker /></DefaultStylePanel>;
}
function WorkspaceBackground() {
  const editor = useEditor();
  const camera = useValue('Canvas dot grid', () => editor.getCamera(), [editor]);
  const step = 20 * camera.z;
  const spacing = step * Math.max(1, 2 ** Math.ceil(Math.log2(16 / step)));
  return <div className="tl-background" style={{ backgroundImage: 'radial-gradient(var(--color-border-subtle) .8px, transparent .8px)', backgroundSize: `${spacing}px ${spacing}px`, backgroundPosition: `${camera.x * camera.z}px ${camera.y * camera.z}px` }} />;
}
const components: TLComponents = { Background: WorkspaceBackground, Toolbar: WorkspaceToolbar, StylePanel: WorkspaceStylePanel, MainMenu: null, SharePanel: null };
const shapeUtils = [ItemCardShapeUtil];
const overrides: TLUiOverrides = {
  tools(_editor, tools) {
    delete tools.asset;
    delete tools.embed;
    return tools;
  },
  actions(_editor, actions) {
    for (const id of ['insert-embed', 'insert-media', 'convert-to-bookmark', 'convert-to-embed', 'flatten-to-image', 'image-replace']) delete actions[id];
    return actions;
  },
};
const workspaceOptions = {
  maxPages: 1,
  text: { tipTapConfig: { editorProps: { attributes: { 'aria-label': 'Canvas annotation text', 'aria-multiline': 'true' } } } },
};

export function NativeWorkspace(props: NativeWorkspaceProps) {
  const licenseKey = window.gitboredConfig?.tldrawKey;
  const [hiddenReferences] = useState(() => atom<ReadonlySet<string>>('Filtered board references', new Set()));
  const getShapeVisibility = useCallback((shape: TLShape) => shape.type === ITEM_CARD_TYPE && hiddenReferences.get().has(shape.props.referenceId) ? 'hidden' as const : 'inherit' as const, [hiddenReferences]);
  const [hideClosed, setHideClosed] = useState(false);
  useEffect(() => { hiddenReferences.set(new Set([...props.metadata].filter(([, value]) => hideClosed && value.status === 'ready' && (value.item.state === 'closed' || value.item.state === 'merged' || value.item.sourceState === 'closed')).map(([id]) => id))); }, [props.metadata, hideClosed, hiddenReferences]);
  const [pasteError, setPasteError] = useState('');
  const latest = useRef(props);
  useLayoutEffect(() => { latest.current = props; });
  const editorRef = useRef<Editor | null>(null);
  const [store] = useState(() => createTLStore({ schema: nativeSchema, users: workspaceUsers,
    ...(props.initialDocument ? { snapshot: validateNativeDocument(props.initialDocument).snapshot } : {}),
  }));
  useEffect(() => { editorRef.current?.user.updateUserPreferences({ colorScheme: props.theme }); }, [props.theme]);
  // SDK keyboard registrations depend on the event handler identity. Keep it stable
  // while floating panels and fetched metadata change around a held native key.
  const handleUiEvent = useCallback<TLUiEventHandler>((name) => {
        if (name !== 'undo' && name !== 'redo') return;
        // The supported UI event precedes the synchronous native command. Observe its
        // completed document in a microtask, before deferred store-listener delivery.
        queueMicrotask(() => { const editor = editorRef.current; if (editor) latest.current.onNativeHistory?.(editor, name); });
  }, []);
  const mount = useCallback((editor: Editor) => {
    editorRef.current = editor;
    editor.user.updateUserPreferences({ colorScheme: latest.current.theme });
    editor.registerExternalAssetHandler('file', null);
    editor.registerExternalAssetHandler('url', null);
    editor.registerExternalContentHandler('url', null);
    editor.registerExternalContentHandler('embed', null);
    editor.registerExternalContentHandler('files', null);
    editor.registerExternalContentHandler('file-replace', null);
    editor.registerExternalContentHandler('svg-text', null);
    editor.registerExternalContentHandler('excalidraw', null);
    editor.registerExternalContentHandler('tldraw', (info) => {
      const known = new Set(latest.current.metadata.keys());
      for (const shape of editor.getCurrentPageShapes()) if (shape.type === ITEM_CARD_TYPE) known.add(shape.props.referenceId);
      let content;
      try {
        content = validateNativeClipboard(info.content, known);
      } catch {
        setPasteError('Unable to paste this content. Copy native annotations or references already available to this board.');
        return;
      }
      defaultHandleExternalTldrawContent(editor, { ...info, content }).catch(() => {
        setPasteError('Unable to paste this content. Copy supported canvas shapes and try again.');
      });
    });
    const stop = editor.store.listen(({ changes }) => {
      const records = [...Object.values(changes.added), ...Object.values(changes.removed), ...Object.values(changes.updated).map((pair) => pair[1])];
      if (records.some((record) => ['document', 'page', 'shape', 'binding'].includes(record.typeName))) {
        latest.current.onDocumentChange(captureNativeDocument(editor));
      }
    }, { scope: 'document' });
    const unmount = latest.current.onMount?.(editor);
    return () => { stop(); unmount?.(); editorRef.current = null; };
  }, []);
  return <section className="native-workspace" data-theme={props.theme} aria-label="Issue canvas">
    <MetadataContext value={props.metadata}><PlanningContext value={props.planning}><CardColourProvider preferenceKey={props.preferenceKey}>
      <Tldraw {...(licenseKey ? { licenseKey } : {})} getShapeVisibility={getShapeVisibility} store={store} shapeUtils={shapeUtils} components={components} overrides={overrides} onMount={mount} options={workspaceOptions} onUiEvent={handleUiEvent}>
        <WorkspacePanels hideClosed={hideClosed} onHideClosedChange={setHideClosed} metadata={props.metadata} planning={props.planning} onPlanningChange={props.onPlanningChange} preferenceKey={props.preferenceKey}>{props.children}</WorkspacePanels>
        <div className="workspace-status" role="status">{pasteError}</div>
      </Tldraw>
    </CardColourProvider></PlanningContext></MetadataContext>
  </section>;
}
