import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowToolbarItem, DefaultToolbar, DrawToolbarItem, EraserToolbarItem, FrameToolbarItem,
  RectangleToolbarItem, HandToolbarItem, HighlightToolbarItem, NoteToolbarItem, SelectToolbarItem,
  TextToolbarItem, Tldraw, computed, createTLStore, defaultHandleExternalTldrawContent,
  DefaultStylePanel, StylePanelColorPicker, StylePanelFillPicker, StylePanelDashPicker,
  StylePanelSizePicker, StylePanelFontPicker, StylePanelTextAlignPicker, StylePanelLabelAlignPicker,
  StylePanelGeoShapePicker, StylePanelArrowKindPicker, StylePanelArrowheadPicker, StylePanelSplinePicker,
  useStylePanelContext, type TLUiStylePanelProps,
  useEditor, useValue, type Editor, type TLComponents, type TLUiOverrides, type TLUserStore,
} from 'tldraw';
import { githubItemUrl, type WorkspaceMetadata } from '../../shared/items';
import { ITEM_CARD_TYPE, nativeSchema, validateNativeDocument, validateNativeShape, type NativeDocument } from '../../shared/nativeDocument';
import { validateNativeClipboard } from '../../shared/nativeClipboard';
import { ItemCardShapeUtil } from './ItemCardShapeUtil';
import { MetadataContext, anonymousMetadata, describeItem } from './metadata';
import 'tldraw/tldraw.css';
import './workspace.css';

export interface NativeWorkspaceProps {
  /** Initial only. Remount with an account/board key when switching authority or documents. */
  initialDocument?: NativeDocument;
  /** Replace the immutable map to refresh metadata; it never enters the editor store/history. */
  metadata: WorkspaceMetadata;
  theme: 'light' | 'dark';
  onDocumentChange(document: NativeDocument): void;
  onMount?(editor: Editor): void | (() => void);
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
  return <DefaultStylePanel {...props}><StylePanelColorPicker /><WorkspaceOpacity /><StylePanelFillPicker /><StylePanelDashPicker /><StylePanelSizePicker /><StylePanelFontPicker /><StylePanelTextAlignPicker /><StylePanelLabelAlignPicker /><StylePanelGeoShapePicker /><StylePanelArrowKindPicker /><StylePanelArrowheadPicker /><StylePanelSplinePicker /></DefaultStylePanel>;
}
const components: TLComponents = { Toolbar: WorkspaceToolbar, StylePanel: WorkspaceStylePanel, MainMenu: null, SharePanel: null };
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

function WorkspaceCards({ metadata }: { metadata: WorkspaceMetadata }) {
  const editor = useEditor();
  const listRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && listRef.current && !listRef.current.contains(event.target)) listRef.current.open = false;
    };
    document.addEventListener('pointerdown', dismiss, true);
    return () => document.removeEventListener('pointerdown', dismiss, true);
  }, []);
  const cards = useValue('Workspace cards', () => editor.getCurrentPageShapes().filter((shape) => shape.type === ITEM_CARD_TYPE), [editor]);
  return <details className="workspace-cards" ref={listRef} onKeyDownCapture={(event) => {
    // Capture before the SDK container's native bubble listeners; keep browser defaults.
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.currentTarget.open = false;
      event.currentTarget.querySelector('summary')?.focus();
    }
  }} onKeyUpCapture={(event) => {
    // Release modifiers held before entering Cards, without invoking canvas action keys.
    switch (event.key) {
      case 'Shift': case 'Control': case 'Alt': case 'Meta': return;
      default: event.stopPropagation();
    }
  }}>
    <summary>Cards <span>{cards.length}</span></summary>
    <section aria-label="Cards on this page">
      <p>Select a card here, then use the arrow keys to move it on the canvas. Native menus provide grouping, stacking and duplication.</p>
      {cards.length === 0 && <p>No cards placed. Add references from your board’s Incoming tray. You can draw or type on the canvas now.</p>}
      <ul>{cards.map((shape) => {
        const state = metadata.get(shape.props.referenceId) ?? anonymousMetadata;
        const item = state.status === 'ready' && state.item.kind === shape.props.kind ? state.item : null;
        const url = item ? githubItemUrl(shape.props.kind, item.locator) : null;
        return <li key={shape.id}>
          <p>{describeItem(shape.props.kind, state)}</p>
          {item && <><p>Labels: {item.labels.join(', ') || 'None'}</p><p>Assignees: {item.assignees.join(', ') || 'None'}</p></>}
          <button type="button" onClick={(event) => {
            editor.complete();
            editor.setCurrentTool('select');
            editor.select(shape.id);
            editor.zoomToSelection({ animation: { duration: 0 } });
            event.currentTarget.closest('details')?.removeAttribute('open');
            // SDK focus() returns early when logical focus is already true, even inside Cards.
            editor.getContainer().focus({ preventScroll: true });
            editor.focus();
          }}>Select card</button>
          {url && <a href={url} target="_blank" rel="noreferrer">Open in GitHub</a>}
        </li>;
      })}</ul>
    </section>
  </details>;
}

export function NativeWorkspace(props: NativeWorkspaceProps) {
  const [pasteError, setPasteError] = useState('');
  const latest = useRef(props);
  useLayoutEffect(() => { latest.current = props; });
  const editorRef = useRef<Editor | null>(null);
  const [store] = useState(() => createTLStore({ schema: nativeSchema, users: workspaceUsers,
    ...(props.initialDocument ? { snapshot: validateNativeDocument(props.initialDocument).snapshot } : {}),
  }));
  useEffect(() => { editorRef.current?.user.updateUserPreferences({ colorScheme: props.theme }); }, [props.theme]);
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
    <MetadataContext value={props.metadata}>
      <Tldraw store={store} shapeUtils={shapeUtils} components={components} overrides={overrides} onMount={mount} options={workspaceOptions}>
        <WorkspaceCards metadata={props.metadata} />
        <div className="workspace-status" role="status">{pasteError}</div>
        {props.children}
      </Tldraw>
    </MetadataContext>
  </section>;
}
