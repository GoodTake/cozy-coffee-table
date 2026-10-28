export interface ElementContextEntry {
  tag: string;
  classNames?: string;
  loc: string;
}

export interface ElementContext {
  chain: ElementContextEntry[];
  text?: string;
  index?: {
    position: number;
    total: number;
  };
}

export interface ElementStyleSnapshot {
  color: string;
  backgroundColor: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  fontStyle?: string;
  textDecorationLine?: string;
  lineHeight: string;
  letterSpacing: string;
  textAlign: string;
  width: string;
  height: string;
  minWidth: string;
  minHeight: string;
  maxWidth: string;
  maxHeight: string;
  marginTop: string;
  marginRight: string;
  marginBottom: string;
  marginLeft: string;
  paddingTop: string;
  paddingRight: string;
  paddingBottom: string;
  paddingLeft: string;
  gap: string;
  rowGap: string;
  columnGap: string;
  display: string;
  flexDirection: string;
  flexWrap: string;
  alignItems: string;
  alignContent: string;
  justifyContent: string;
  flexGrow: string;
  flexShrink: string;
  flexBasis: string;
  order: string;
  gridTemplateColumns: string;
  gridTemplateRows: string;
  gridAutoFlow: string;
  gridColumn: string;
  gridRow: string;
  borderRadius: string;
  borderWidth: string;
  borderStyle: string;
  borderColor: string;
  boxShadow: string;
  opacity: string;
  cursor: string;
  overflow: string;
  position: string;
  top: string;
  right: string;
  bottom: string;
  left: string;
  zIndex: string;
  transform: string;
  transitionProperty: string;
  transitionDuration: string;
  transitionTimingFunction: string;
  transitionDelay: string;
  animationName: string;
  animationDuration: string;
  animationTimingFunction: string;
  animationDelay: string;
  animationIterationCount: string;
}

export type ElementAttributeName =
  | 'className'
  | 'title'
  | 'alt'
  | 'aria-label'
  | 'role'
  | 'tabIndex';

export interface ElementAiEditRequest {
  requestId: string;
  instruction: string;
  context: ElementContext;
}

export interface ElementSelection {
  context: ElementContext;
  loc: string;
  tag: string;
  text: string;
  textEditable: boolean;
  styles: ElementStyleSnapshot;
  inlineStyles: Partial<Record<keyof ElementStyleSnapshot, string>>;
  attributes: {
    className: string;
    title: string;
    alt: string;
    ariaLabel: string;
    role: string;
    tabIndex: string;
  };
}

export type VisualEditPatch =
  | { loc: string; kind: 'text'; before: string; value: string }
  | { loc: string; kind: 'style'; property: keyof ElementStyleSnapshot; before: string; value: string }
  | { loc: string; kind: 'attribute'; name: ElementAttributeName; before: string; value: string };

export interface VisualEditDraftState {
  patches: VisualEditPatch[];
  undoCount: number;
  redoCount: number;
}

export type EditorToPreviewMessage =
  | { type: 'steps:edit-init'; nonce: string }
  | { type: 'steps:edit-mode'; nonce: string; enabled: boolean }
  | { type: 'steps:clear-selection'; nonce: string }
  | { type: 'steps:select-loc'; nonce: string; loc: string }
  | { type: 'steps:set-text'; nonce: string; value: string }
  | { type: 'steps:set-style'; nonce: string; property: keyof ElementStyleSnapshot; value: string }
  | { type: 'steps:set-attribute'; nonce: string; name: ElementAttributeName; value: string }
  | { type: 'steps:undo'; nonce: string }
  | { type: 'steps:redo'; nonce: string }
  | { type: 'steps:cancel-draft'; nonce: string }
  | { type: 'steps:commit-draft'; nonce: string };

export type PreviewToEditorMessage =
  | { type: 'steps:edit-ready'; nonce: string }
  | { type: 'steps:preview-painted'; nonce: string }
  | { type: 'steps:element-selected'; nonce: string; selection: ElementSelection }
  | { type: 'steps:ai-edit-request'; nonce: string; request: ElementAiEditRequest }
  | { type: 'steps:selection-cleared'; nonce: string }
  | { type: 'steps:exit-edit-mode'; nonce: string }
  | { type: 'steps:draft-state'; nonce: string; state: VisualEditDraftState };
