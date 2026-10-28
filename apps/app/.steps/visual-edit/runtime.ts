import type {
  EditorToPreviewMessage,
  ElementAttributeName,
  ElementContext,
  ElementSelection,
  ElementStyleSnapshot,
  PreviewToEditorMessage,
  VisualEditDraftState,
  VisualEditPatch,
} from './protocol';

const MARKER_ATTRIBUTE = 'data-steps-loc';
const MAX_CHAIN_LENGTH = 12;
const MAX_CLASS_LENGTH = 240;
const MAX_TEXT_LENGTH = 400;
const OVERLAY_Z_INDEX = '2147483647';
const NON_RENDERING_TAGS = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE']);
const VISUAL_TAGS = new Set([
  'CANVAS', 'IFRAME', 'INPUT', 'PICTURE', 'PROGRESS', 'SELECT', 'SVG', 'TEXTAREA', 'VIDEO',
]);
const STYLE_PROPERTIES: Array<keyof ElementStyleSnapshot> = [
  'color', 'backgroundColor', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
  'textDecorationLine', 'lineHeight',
  'letterSpacing', 'textAlign', 'width', 'height', 'minWidth', 'minHeight',
  'maxWidth', 'maxHeight', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
  'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'gap', 'rowGap',
  'columnGap', 'display', 'flexDirection', 'flexWrap', 'alignItems', 'alignContent',
  'justifyContent', 'flexGrow', 'flexShrink', 'flexBasis', 'order',
  'gridTemplateColumns', 'gridTemplateRows', 'gridAutoFlow', 'gridColumn', 'gridRow',
  'borderRadius', 'borderWidth', 'borderStyle', 'borderColor', 'boxShadow', 'opacity',
  'cursor', 'overflow', 'position', 'top', 'right', 'bottom', 'left', 'zIndex',
  'transform', 'transitionProperty', 'transitionDuration', 'transitionTimingFunction',
  'transitionDelay', 'animationName', 'animationDuration', 'animationTimingFunction',
  'animationDelay', 'animationIterationCount',
];

interface ViteHotContext { dispose(callback: () => void): void }
interface RuntimeHandle { dispose(): void }

declare global {
  interface Window { __stepsVisualEditRuntime?: RuntimeHandle }
}

function compact(value: string, maxLength: number): string | undefined {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function cssName(property: string): string {
  return property.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

function editableTarget(value: EventTarget | null): Element | null {
  if (!(value instanceof Element)) return null;
  return value.closest(`[${MARKER_ATTRIBUTE}]`);
}

function hasOwnVisibleText(element: Element): boolean {
  return Array.from(element.childNodes).some((node) => (
    node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim())
  ));
}

function hasVisualContent(element: Element): boolean {
  if (element instanceof HTMLImageElement) {
    return element.complete && element.naturalWidth > 0;
  }
  if (VISUAL_TAGS.has(element.tagName)) return true;
  const style = window.getComputedStyle(element);
  return hasOwnVisibleText(element)
    || (Boolean(style.backgroundImage) && style.backgroundImage !== 'none');
}

function isVisible(element: Element): boolean {
  if (NON_RENDERING_TAGS.has(element.tagName)) return false;
  if (element instanceof HTMLElement && element.hidden) return false;
  const style = window.getComputedStyle(element);
  if (
    style.display === 'none'
    || style.visibility === 'hidden'
    || style.contentVisibility === 'hidden'
    || Number.parseFloat(style.opacity || '1') <= 0
  ) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function hasVisiblePreviewContent(
  root: Element | null = document.getElementById('root') ?? document.body,
): boolean {
  if (!root) return false;
  const candidates = [root, ...Array.from(root.querySelectorAll('*'))];
  return candidates.some((element) => isVisible(element) && hasVisualContent(element));
}

function sameTagIndex(target: Element): ElementContext['index'] {
  const parent = target.parentElement;
  if (!parent) return undefined;
  const tag = target.tagName;
  const siblings = Array.from(parent.children).filter((child) => child.tagName === tag);
  if (siblings.length <= 1) return undefined;
  const position = siblings.indexOf(target);
  return position < 0 ? undefined : { position: position + 1, total: siblings.length };
}

export function collectElementContext(target: Element): ElementContext | null {
  const chain: ElementContext['chain'] = [];
  let current: Element | null = target;
  while (current && chain.length < MAX_CHAIN_LENGTH) {
    const loc = current.getAttribute(MARKER_ATTRIBUTE);
    if (loc) {
      const classNames = compact(current.getAttribute('class') ?? '', MAX_CLASS_LENGTH);
      chain.push({ tag: current.tagName.toLowerCase(), ...(classNames ? { classNames } : {}), loc });
    }
    current = current.parentElement;
  }
  if (chain.length === 0) return null;
  const text = compact(target.textContent ?? '', MAX_TEXT_LENGTH);
  const index = sameTagIndex(target);
  return { chain, ...(text ? { text } : {}), ...(index ? { index } : {}) };
}

function inspectStyles(target: Element): ElementStyleSnapshot {
  const computed = getComputedStyle(target);
  return Object.fromEntries(STYLE_PROPERTIES.map((property) => [
    property,
    computed.getPropertyValue(cssName(property)).trim(),
  ])) as unknown as ElementStyleSnapshot;
}

function inspectInlineStyles(target: Element): Partial<Record<keyof ElementStyleSnapshot, string>> {
  if (!(target instanceof HTMLElement)) return {};
  return Object.fromEntries(STYLE_PROPERTIES.flatMap((property) => {
    const value = target.style.getPropertyValue(cssName(property));
    return value ? [[property, value]] : [];
  })) as Partial<Record<keyof ElementStyleSnapshot, string>>;
}

function canEditText(target: Element): boolean {
  if (target.children.length > 0) return false;
  if (['IMG', 'INPUT', 'TEXTAREA', 'SELECT', 'VIDEO', 'CANVAS', 'SVG'].includes(target.tagName)) return false;
  return (target.textContent ?? '').length <= 20_000;
}

function inspectSelection(target: Element): ElementSelection | null {
  const context = collectElementContext(target);
  const loc = target.getAttribute(MARKER_ATTRIBUTE);
  if (!context || !loc) return null;
  return {
    context,
    loc,
    tag: target.tagName.toLowerCase(),
    text: target.textContent ?? '',
    textEditable: canEditText(target),
    styles: inspectStyles(target),
    inlineStyles: inspectInlineStyles(target),
    attributes: {
      className: target.getAttribute('class') ?? '',
      title: target.getAttribute('title') ?? '',
      alt: target.getAttribute('alt') ?? '',
      ariaLabel: target.getAttribute('aria-label') ?? '',
      role: target.getAttribute('role') ?? '',
      tabIndex: target.getAttribute('tabindex') ?? '',
    },
  };
}

// The frame sits outside the element so the border and resize handles leave
// the selected text readable instead of covering the glyphs.
export const SELECTION_FRAME_OUTSET = 8;

function createOverlay(color: string, selected = false): HTMLDivElement {
  const overlay = document.createElement('div');
  overlay.dataset.stepsVisualOverlay = selected ? 'selected' : 'hover';
  overlay.setAttribute('data-steps-edit-overlay', '');
  Object.assign(overlay.style, {
    position: 'fixed', display: 'none', pointerEvents: 'none', boxSizing: 'border-box',
    border: `${selected ? 2 : 1}px solid ${color}`, borderRadius: '4px',
    background: selected ? 'rgba(37, 99, 235, 0.035)' : 'rgba(96, 165, 250, 0.06)',
    boxShadow: selected ? '0 0 0 1px rgba(255,255,255,.9), 0 8px 24px rgba(37,99,235,.18)' : 'none',
    zIndex: OVERLAY_Z_INDEX,
  });
  document.documentElement.appendChild(overlay);
  return overlay;
}

interface SelectionChrome {
  label: HTMLDivElement;
  toolbar: HTMLDivElement;
  popover: HTMLDivElement;
}

function createSelectionChrome(
  overlay: HTMLDivElement,
  onResize: (direction: string, event: PointerEvent) => void,
): SelectionChrome {
  const label = document.createElement('div');
  label.dataset.stepsVisualDragHandle = 'true';
  Object.assign(label.style, {
    position: 'absolute', left: '-2px', top: '-28px', maxWidth: '260px', height: '24px',
    display: 'flex', alignItems: 'center', gap: '6px', padding: '0 8px', borderRadius: '5px 5px 5px 0',
    background: '#2563eb', color: 'white', font: '600 11px/1 "Microsoft YaHei", Inter, ui-sans-serif, system-ui, sans-serif',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', pointerEvents: 'auto', cursor: 'grab',
    boxShadow: '0 4px 12px rgba(37,99,235,.28)', userSelect: 'none',
  });
  label.textContent = 'Drag to reposition';
  overlay.appendChild(label);

  const directions = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
  const positions: Record<string, Partial<CSSStyleDeclaration>> = {
    nw: { left: '-8px', top: '-8px' }, n: { left: 'calc(50% - 5px)', top: '-8px' },
    ne: { right: '-8px', top: '-8px' }, e: { right: '-8px', top: 'calc(50% - 5px)' },
    se: { right: '-8px', bottom: '-8px' }, s: { left: 'calc(50% - 5px)', bottom: '-8px' },
    sw: { left: '-8px', bottom: '-8px' }, w: { left: '-8px', top: 'calc(50% - 5px)' },
  };
  for (const direction of directions) {
    const handle = document.createElement('div');
    handle.dataset.stepsResize = direction;
    Object.assign(handle.style, {
      position: 'absolute', width: '10px', height: '10px', borderRadius: '2px',
      border: '1px solid white', background: '#2563eb', pointerEvents: 'auto',
      cursor: `${direction}-resize`, boxShadow: '0 1px 4px rgba(0,0,0,.25)',
      ...positions[direction],
    });
    handle.addEventListener('pointerdown', (event) => onResize(direction, event));
    overlay.appendChild(handle);
  }

  const toolbar = document.createElement('div');
  toolbar.dataset.stepsContextToolbar = 'true';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Visual edit toolbar');
  Object.assign(toolbar.style, {
    position: 'absolute', display: 'none', alignItems: 'center', gap: '2px', minHeight: '44px', height: '44px',
    width: 'min(1120px, calc(100vw - 16px))', maxWidth: 'calc(100vw - 16px)', padding: '4px 6px', border: '1px solid rgba(15,23,42,.12)',
    borderRadius: '10px', background: 'rgba(255,255,255,.98)', color: '#0f172a', pointerEvents: 'auto',
    boxShadow: '0 12px 32px rgba(15,23,42,.18), 0 2px 8px rgba(15,23,42,.08)',
    font: '500 12px/1.2 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    whiteSpace: 'nowrap', flexWrap: 'nowrap', overflow: 'hidden', zIndex: '2', boxSizing: 'border-box',
  });
  overlay.appendChild(toolbar);

  const popover = document.createElement('div');
  popover.dataset.stepsContextPopover = 'true';
  popover.setAttribute('role', 'dialog');
  Object.assign(popover.style, {
    position: 'fixed', display: 'none', minWidth: '220px', maxWidth: 'min(440px, calc(100vw - 16px))',
    padding: '12px', border: '1px solid rgba(15,23,42,.12)', borderRadius: '12px', background: '#fff',
    color: '#0f172a', pointerEvents: 'auto', boxShadow: '0 18px 44px rgba(15,23,42,.22)',
    font: '500 12px/1.35 Inter, ui-sans-serif, system-ui, sans-serif', zIndex: OVERLAY_Z_INDEX,
  });
  document.documentElement.appendChild(popover);

  return { label, toolbar, popover };
}

function positionOverlay(overlay: HTMLDivElement, target: Element | null): void {
  if (!target || !target.isConnected) { overlay.style.display = 'none'; return; }
  const rect = target.getBoundingClientRect();
  const outset = SELECTION_FRAME_OUTSET;
  Object.assign(overlay.style, {
    display: rect.width || rect.height ? 'block' : 'none',
    left: `${rect.left - outset}px`, top: `${rect.top - outset}px`,
    width: `${rect.width + outset * 2}px`, height: `${rect.height + outset * 2}px`,
  });
}

function patchKey(patch: VisualEditPatch): string {
  if (patch.kind === 'text') return `${patch.loc}:text`;
  if (patch.kind === 'style') return `${patch.loc}:style:${patch.property}`;
  return `${patch.loc}:attribute:${patch.name}`;
}

export function installVisualEditRuntime(
  configuredEditorOrigin = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env?.VITE_STEPS_EDITOR_ORIGIN,
): RuntimeHandle {
  let editorOrigin: string | null = null;
  let nonce: string | null = null;
  let editEnabled = false;
  let interactionsActive = false;
  let hoverTarget: Element | null = null;
  let selectedTarget: Element | null = null;
  let paintObserver: MutationObserver | null = null;
  let firstPaintFrame: number | null = null;
  let secondPaintFrame: number | null = null;
  let paintNonce: string | null = null;
  let hoverOverlay: HTMLDivElement | null = null;
  let selectedOverlay: HTMLDivElement | null = null;
  let selectedChrome: SelectionChrome | null = null;
  let activePopoverButton: HTMLButtonElement | null = null;
  let editingText = false;
  const undoStack: VisualEditPatch[] = [];
  const redoStack: VisualEditPatch[] = [];
  const baseValues = new Map<string, VisualEditPatch>();
  const currentValues = new Map<string, VisualEditPatch>();

  const clamp = (value: number, minimum: number, maximum: number): number => (
    Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
  );

  const closePopover = (): void => {
    if (!selectedChrome) return;
    selectedChrome.popover.style.display = 'none';
    selectedChrome.popover.replaceChildren();
    if (activePopoverButton) {
      activePopoverButton.setAttribute('aria-expanded', 'false');
      activePopoverButton.style.background = activePopoverButton.dataset.stepsAccent === 'true'
        ? '#2563eb'
        : 'transparent';
    }
    activePopoverButton = null;
  };

  const positionContextToolbar = (toolbar: HTMLDivElement, target: Element): void => {
    const rect = target.getBoundingClientRect();
    if ((!rect.width && !rect.height) || !target.isConnected) {
      toolbar.style.display = 'none';
      closePopover();
      return;
    }
    toolbar.style.display = 'flex';
    const toolbarWidth = toolbar.offsetWidth || Math.min(680, Math.max(220, window.innerWidth - 16));
    const toolbarHeight = toolbar.offsetHeight || 44;
    const viewportPadding = 8;
    const gap = 10;
    const desiredViewportLeft = rect.left + (rect.width - toolbarWidth) / 2;
    const viewportLeft = clamp(
      desiredViewportLeft,
      viewportPadding,
      window.innerWidth - toolbarWidth - viewportPadding,
    );
    const hasRoomBelow = rect.bottom + gap + toolbarHeight <= window.innerHeight - viewportPadding;
    const viewportTop = hasRoomBelow
      ? rect.bottom + gap
      : Math.max(viewportPadding, rect.top - gap - toolbarHeight);
    toolbar.dataset.stepsPlacement = hasRoomBelow ? 'below' : 'above';
    toolbar.style.left = `${viewportLeft - rect.left + SELECTION_FRAME_OUTSET}px`;
    toolbar.style.top = `${viewportTop - rect.top + SELECTION_FRAME_OUTSET}px`;
  };

  const positionContextPopover = (): void => {
    if (!selectedChrome || !activePopoverButton || selectedChrome.popover.style.display === 'none') return;
    const buttonRect = activePopoverButton.getBoundingClientRect();
    const popoverRect = selectedChrome.popover.getBoundingClientRect();
    const width = popoverRect.width || 260;
    const height = popoverRect.height || 180;
    const padding = 8;
    const left = clamp(buttonRect.left, padding, window.innerWidth - width - padding);
    const below = buttonRect.bottom + 8;
    const top = below + height <= window.innerHeight - padding
      ? below
      : Math.max(padding, buttonRect.top - height - 8);
    selectedChrome.popover.style.left = `${left}px`;
    selectedChrome.popover.style.top = `${top}px`;
  };

  const toolbarIcon = (action: string): SVGSVGElement | null => {
    const icons: Record<string, string> = {
      undo: '<path d="M9 7H5V3"/><path d="M5 7a7 7 0 1 1-1.5 7"/>',
      redo: '<path d="M15 7h4V3"/><path d="M19 7a7 7 0 1 0 1.5 7"/>',
      'edit-text': '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
      color: '<path d="M6 20h12"/><path d="m9 16 3-10 3 10"/><path d="M10 13h4"/>',
      background: '<path d="m14 4 6 6-9 9H5v-6Z"/><path d="m12 6 6 6"/>',
      'text-align': '<path d="M4 6h16"/><path d="M4 10h11"/><path d="M4 14h16"/><path d="M4 18h9"/>',
      spacing: '<path d="M8 5h12"/><path d="M8 12h12"/><path d="M8 19h12"/><path d="m4 7-2-2 2-2"/><path d="M2 5v14"/><path d="m4 17-2 2-2-2"/>',
      'alt-text': '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m21 15-5-5L5 20"/>',
      size: '<path d="M8 3H3v5"/><path d="m3 3 6 6"/><path d="M16 21h5v-5"/><path d="m21 21-6-6"/>',
      radius: '<path d="M4 13V8a4 4 0 0 1 4-4h5"/><path d="M20 11v5a4 4 0 0 1-4 4h-5"/>',
      layout: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
      align: '<path d="M4 7h10"/><path d="M4 12h16"/><path d="M4 17h13"/>',
      gap: '<rect x="3" y="6" width="6" height="12" rx="1"/><rect x="15" y="6" width="6" height="12" rx="1"/><path d="M11 12h2"/>',
      more: '<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/>',
      close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
      'clear-format': '<path d="m3 21 8-8"/><path d="m14 4 6 6-9 9H5v-6Z"/><path d="M15 15h6"/>',
      'ask-ai': '<path d="m12 3-1.2 3.3L7.5 7.5l3.3 1.2L12 12l1.2-3.3 3.3-1.2-3.3-1.2L12 3Z"/><path d="m5 13-.8 2.2L2 16l2.2.8L5 19l.8-2.2L8 16l-2.2-.8L5 13Z"/><path d="m18 14-1 2.8-2.8 1L17 19l1 2.8 1-2.8 2.8-1-2.8-1L18 14Z"/>',
      'ai-send': '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    };
    const markup = icons[action];
    if (!markup) return null;
    const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    icon.setAttribute('viewBox', '0 0 24 24');
    icon.setAttribute('aria-hidden', 'true');
    icon.setAttribute('focusable', 'false');
    icon.setAttribute('fill', 'none');
    icon.setAttribute('stroke', 'currentColor');
    icon.setAttribute('stroke-width', '1.8');
    icon.setAttribute('stroke-linecap', 'round');
    icon.setAttribute('stroke-linejoin', 'round');
    Object.assign(icon.style, { width: '15px', height: '15px', flex: '0 0 auto' });
    icon.innerHTML = markup;
    return icon;
  };

  const toolbarButton = (
    label: string,
    title: string,
    action: string,
    onActivate: (button: HTMLButtonElement) => void,
    iconOnly = false,
  ): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.stepsAction = action;
    button.title = title;
    button.setAttribute('aria-label', title);
    Object.assign(button.style, {
      height: '34px', minWidth: iconOnly ? '34px' : 'auto', padding: iconOnly ? '0 8px' : '0 10px',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px', flex: '0 0 auto',
      border: '0', borderRadius: '7px', background: 'transparent', color: '#334155', cursor: 'pointer',
      font: '500 12px/1 Inter, "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif', whiteSpace: 'nowrap',
    });
    const icon = toolbarIcon(action);
    if (icon) button.appendChild(icon);
    if (!iconOnly && label) {
      const caption = document.createElement('span');
      caption.textContent = label;
      button.appendChild(caption);
    }
    button.addEventListener('mouseenter', () => {
      if (!button.disabled) button.style.background = button.dataset.stepsAccent === 'true' ? '#1d4ed8' : '#f1f5f9';
    });
    button.addEventListener('mouseleave', () => {
      if (activePopoverButton !== button && button.dataset.stepsActive !== 'true') {
        button.style.background = button.dataset.stepsAccent === 'true' ? '#2563eb' : 'transparent';
      }
    });
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!button.disabled) onActivate(button);
    });
    return button;
  };

  const toolbarSelect = (
    action: string,
    title: string,
    value: string,
    options: Array<{ label: string; value: string }>,
    onChange: (value: string) => void,
    width: string,
  ): HTMLSelectElement => {
    const select = document.createElement('select');
    select.dataset.stepsAction = action;
    select.title = title;
    select.setAttribute('aria-label', title);
    const hasCurrent = options.some((option) => option.value === value);
    if (value && !hasCurrent) options = [{ label: value, value }, ...options];
    options.forEach((option) => {
      const node = document.createElement('option');
      node.value = option.value;
      node.textContent = option.label;
      select.appendChild(node);
    });
    select.value = value || options[0]?.value || '';
    Object.assign(select.style, {
      width, height: '34px', flex: '0 0 auto', boxSizing: 'border-box', padding: '0 24px 0 9px',
      border: '1px solid #e2e8f0', borderRadius: '7px', outline: 'none', background: '#fff', color: '#334155',
      font: '500 12px/1 Inter, "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif', cursor: 'pointer',
    });
    select.addEventListener('pointerdown', (event) => event.stopPropagation());
    select.addEventListener('click', (event) => event.stopPropagation());
    select.addEventListener('change', () => onChange(select.value));
    return select;
  };

  const toolbarDivider = (): HTMLSpanElement => {
    const divider = document.createElement('span');
    divider.setAttribute('aria-hidden', 'true');
    Object.assign(divider.style, { width: '1px', height: '22px', margin: '0 3px', background: '#e2e8f0', flex: '0 0 auto' });
    return divider;
  };

  const popoverTitle = (title: string): HTMLDivElement => {
    const heading = document.createElement('div');
    heading.textContent = title;
    Object.assign(heading.style, { marginBottom: '10px', color: '#0f172a', fontWeight: '700', fontSize: '13px' });
    return heading;
  };

  const popoverRow = (): HTMLDivElement => {
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' });
    return row;
  };

  const popoverField = (label: string, control: HTMLElement): HTMLLabelElement => {
    const wrapper = document.createElement('label');
    Object.assign(wrapper.style, { display: 'grid', gap: '5px', flex: '1 1 96px', color: '#64748b', fontSize: '11px' });
    const caption = document.createElement('span');
    caption.textContent = label;
    Object.assign(control.style, {
      width: '100%', height: '34px', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '7px',
      background: '#fff', color: '#0f172a', padding: '0 9px', font: '500 12px/1 system-ui, sans-serif',
    });
    wrapper.append(caption, control);
    return wrapper;
  };

  const openPopover = (
    button: HTMLButtonElement,
    title: string,
    build: (popover: HTMLDivElement) => void,
  ): void => {
    if (!selectedChrome) return;
    if (activePopoverButton === button && selectedChrome.popover.style.display !== 'none') {
      closePopover();
      return;
    }
    if (activePopoverButton) {
      activePopoverButton.setAttribute('aria-expanded', 'false');
      activePopoverButton.style.background = activePopoverButton.dataset.stepsAccent === 'true'
        ? '#2563eb'
        : 'transparent';
    }
    activePopoverButton = button;
    button.setAttribute('aria-expanded', 'true');
    button.style.background = button.dataset.stepsAccent === 'true' ? '#1d4ed8' : '#e2e8f0';
    delete selectedChrome.popover.dataset.stepsAiPrompt;
    selectedChrome.popover.style.width = 'auto';
    selectedChrome.popover.replaceChildren(popoverTitle(title));
    build(selectedChrome.popover);
    selectedChrome.popover.style.display = 'block';
    positionContextPopover();
    window.requestAnimationFrame?.(positionContextPopover);
  };

  const selectedHTMLElement = (): HTMLElement | null => (
    selectedTarget instanceof HTMLElement ? selectedTarget : null
  );

  const computedStyleValue = (property: keyof ElementStyleSnapshot): string => {
    const target = selectedTarget;
    return target ? getComputedStyle(target).getPropertyValue(cssName(property)).trim() : '';
  };

  const patchSelectedStyle = (property: keyof ElementStyleSnapshot, value: string): void => {
    const target = selectedHTMLElement();
    const loc = target?.getAttribute(MARKER_ATTRIBUTE);
    if (!target || !loc) return;
    const before = target.style.getPropertyValue(cssName(property));
    if (before === value) return;
    recordPatch({ loc, kind: 'style', property, before, value });
  };

  const patchSelectedAttribute = (name: ElementAttributeName, value: string): void => {
    const target = selectedTarget;
    const loc = target?.getAttribute(MARKER_ATTRIBUTE);
    if (!target || !loc) return;
    const domName = name === 'className' ? 'class' : name === 'tabIndex' ? 'tabindex' : name;
    const before = target.getAttribute(domName) ?? '';
    if (before === value) return;
    recordPatch({ loc, kind: 'attribute', name, before, value });
  };

  const pxNumber = (value: string, fallback = 0): number => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const colorToHex = (value: string, fallback = '#111827'): string => {
    const normalized = value.trim();
    if (/^#[0-9a-f]{6}$/i.test(normalized)) return normalized;
    if (/^#[0-9a-f]{3}$/i.test(normalized)) {
      return `#${normalized.slice(1).split('').map((part) => `${part}${part}`).join('')}`;
    }
    const match = normalized.match(/rgba?\(\s*(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)\D+(\d+(?:\.\d+)?)/i);
    if (!match) return fallback;
    return `#${match.slice(1, 4).map((part) => clamp(Math.round(Number(part)), 0, 255).toString(16).padStart(2, '0')).join('')}`;
  };

  const addColorEditor = (popover: HTMLDivElement, property: 'color' | 'backgroundColor'): void => {
    const current = colorToHex(computedStyleValue(property), property === 'color' ? '#111827' : '#ffffff');
    const presets = popoverRow();
    ['#111827', '#475569', '#2563EB', '#7C3AED', '#DC2626', '#059669', '#F59E0B', '#FFFFFF'].forEach((color) => {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.title = 'Choose color';
      swatch.setAttribute('aria-label', `Choose color ${color}`);
      Object.assign(swatch.style, {
        width: '28px', height: '28px', padding: '0', borderRadius: '999px',
        border: color.toLowerCase() === current.toLowerCase() ? '3px solid #2563eb' : '1px solid #cbd5e1',
        boxShadow: color.toLowerCase() === current.toLowerCase() ? '0 0 0 2px #dbeafe' : 'none',
        background: color, cursor: 'pointer',
      });
      swatch.addEventListener('click', () => patchSelectedStyle(property, color));
      presets.appendChild(swatch);
    });
    popover.appendChild(presets);
    const custom = document.createElement('input');
    custom.type = 'color';
    custom.value = current;
    custom.setAttribute('aria-label', 'Custom color');
    Object.assign(custom.style, { width: '100%', height: '36px', marginTop: '12px', padding: '3px', border: '1px solid #cbd5e1', borderRadius: '8px', background: '#fff' });
    custom.addEventListener('change', () => patchSelectedStyle(property, custom.value));
    popover.appendChild(popoverField('Custom color', custom));
    const reset = toolbarButton('Reset', 'Reset color', 'reset-color', () => patchSelectedStyle(property, ''));
    Object.assign(reset.style, { width: '100%', marginTop: '10px', border: '1px solid #e2e8f0' });
    popover.appendChild(reset);
  };

  const addChoiceButtons = (
    popover: HTMLDivElement,
    choices: Array<{ label: string; value: string }>,
    onChoose: (value: string) => void,
  ): void => {
    const row = popoverRow();
    choices.forEach((choice) => {
      const option = toolbarButton(choice.label, choice.label, `choice-${choice.value}`, () => onChoose(choice.value));
      option.style.border = '1px solid #e2e8f0';
      row.appendChild(option);
    });
    popover.appendChild(row);
  };

  const applyBoxSpacing = (prefix: 'padding' | 'margin', value: string): void => {
    (['Top', 'Right', 'Bottom', 'Left'] as const).forEach((side) => {
      patchSelectedStyle(`${prefix}${side}` as keyof ElementStyleSnapshot, value);
    });
  };

  const friendlyElementLabel = (element: Element): string => {
    const tag = element.tagName.toLowerCase();
    if (tag === 'img') return 'Image';
    if (tag === 'button' || tag === 'a') return 'Button';
    if (canEditText(element)) return /^h[1-6]$/.test(tag) ? 'Heading' : 'Text';
    if (tag === 'section' || tag === 'main' || tag === 'article') return 'Section';
    return 'Content';
  };

  const colorToolbarButton = (
    action: 'color' | 'background',
    title: string,
    property: 'color' | 'backgroundColor',
  ): HTMLButtonElement => {
    const button = toolbarButton('', title, action, (control) => openPopover(control, title, (popover) => addColorEditor(popover, property)), true);
    const swatch = document.createElement('span');
    Object.assign(swatch.style, {
      width: '10px', height: '10px', marginLeft: '-4px', borderRadius: '999px',
      border: '1px solid rgba(15,23,42,.18)', background: colorToHex(computedStyleValue(property), property === 'color' ? '#111827' : '#ffffff'),
    });
    button.appendChild(swatch);
    return button;
  };

  const styleToggleButton = (
    label: string,
    title: string,
    action: string,
    active: boolean,
    onToggle: (next: boolean) => void,
  ): HTMLButtonElement => {
    const button = toolbarButton(label, title, action, () => {
      const next = button.dataset.stepsActive !== 'true';
      button.dataset.stepsActive = String(next);
      button.style.background = next ? '#dbeafe' : 'transparent';
      button.style.color = next ? '#1d4ed8' : '#334155';
      onToggle(next);
    }, false);
    button.dataset.stepsActive = String(active);
    Object.assign(button.style, {
      minWidth: '32px', padding: '0 8px', fontWeight: action === 'font-weight' ? '800' : '600',
      fontStyle: action === 'font-style' ? 'italic' : 'normal',
      textDecoration: action === 'underline' ? 'underline' : 'none',
      background: active ? '#dbeafe' : 'transparent', color: active ? '#1d4ed8' : '#334155',
    });
    return button;
  };

  const clearCommonFormatting = (isText: boolean): void => {
    const properties: Array<keyof ElementStyleSnapshot> = isText
      ? ['color', 'backgroundColor', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'textDecorationLine', 'lineHeight', 'letterSpacing', 'textAlign']
      : ['backgroundColor', 'borderRadius', 'boxShadow', 'opacity', 'gap', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft'];
    properties.forEach((property) => patchSelectedStyle(property, ''));
    if (selectedTarget) renderContextToolbar(selectedTarget);
  };

  const updateToolbarState = (): void => {
    const toolbar = selectedChrome?.toolbar;
    if (!toolbar) return;
    const update = (action: string, disabled: boolean) => {
      const button = toolbar.querySelector(`[data-steps-action="${action}"]`) as HTMLButtonElement | null;
      if (!button) return;
      button.disabled = disabled;
      button.style.opacity = disabled ? '.35' : '1';
      button.style.cursor = disabled ? 'default' : 'pointer';
    };
    update('undo', undoStack.length === 0);
    update('redo', redoStack.length === 0);
  };

  const renderContextToolbar = (target: Element): void => {
    if (!selectedChrome) return;
    closePopover();
    const toolbar = selectedChrome.toolbar;
    toolbar.replaceChildren();
    const formatting = document.createElement('div');
    formatting.dataset.stepsFormattingControls = 'true';
    Object.assign(formatting.style, {
      minWidth: '0', display: 'flex', alignItems: 'center', gap: '2px', flex: '1 1 auto',
      overflowX: 'auto', overflowY: 'hidden', whiteSpace: 'nowrap', scrollbarWidth: 'thin',
    });
    const add = (control: HTMLElement) => formatting.appendChild(control);
    const isImage = target.tagName === 'IMG';
    const isText = canEditText(target) && !isImage;

    const askAi = toolbarButton('Ask AI', 'Ask AI to edit', 'ask-ai', (button) => openPopover(button, 'Ask AI to edit', (popover) => {
      popover.dataset.stepsAiPrompt = 'true';
      popover.style.width = '400px';
      const form = document.createElement('form');
      form.setAttribute('aria-label', 'Ask AI to edit this element');
      Object.assign(form.style, { display: 'grid', gap: '10px' });
      const input = document.createElement('textarea');
      input.placeholder = 'Describe what you want to change...';
      input.autocomplete = 'off';
      input.setAttribute('aria-label', 'AI edit instruction');
      Object.assign(input.style, {
        width: '100%', minHeight: '112px', maxHeight: '240px', padding: '10px 44px 10px 11px', resize: 'vertical',
        boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '8px', outline: 'none', background: '#fff',
        color: '#0f172a', font: '500 12px/1.45 Inter, "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif',
      });
      const actions = document.createElement('div');
      Object.assign(actions.style, { display: 'flex', justifyContent: 'flex-end', marginTop: '-48px', padding: '0 8px 8px', pointerEvents: 'none' });
      const send = toolbarButton('', 'Send to AI', 'ai-send', () => undefined, true);
      send.dataset.stepsAccent = 'true';
      Object.assign(send.style, {
        minWidth: '34px', width: '34px', height: '34px', padding: '0', background: '#2563eb', color: '#fff',
        boxShadow: '0 2px 6px rgba(37,99,235,.24)', pointerEvents: 'auto',
      });
      const updateSendState = () => {
        send.disabled = !input.value.trim();
        send.style.opacity = send.disabled ? '.4' : '1';
        send.style.cursor = send.disabled ? 'default' : 'pointer';
      };
      const submit = (): void => {
        const instruction = input.value.trim();
        const selection = inspectSelection(target);
        if (!instruction || !selection || !nonce) return;
        const requestId = globalThis.crypto?.randomUUID?.()
          ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        postToEditor({
          type: 'steps:ai-edit-request',
          nonce,
          request: { requestId, instruction, context: selection.context },
        });
        closePopover();
      };
      form.addEventListener('submit', (event) => { event.preventDefault(); event.stopPropagation(); submit(); });
      send.addEventListener('click', (event) => { event.preventDefault(); event.stopPropagation(); submit(); });
      input.addEventListener('input', updateSendState);
      input.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          closePopover();
          button.focus();
        } else if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          submit();
        }
      });
      input.addEventListener('pointerdown', (event) => event.stopPropagation());
      updateSendState();
      actions.appendChild(send);
      form.append(input, actions);
      popover.appendChild(form);
      window.requestAnimationFrame?.(() => input.focus());
    }));
    askAi.dataset.stepsAccent = 'true';
    Object.assign(askAi.style, { background: '#2563eb', color: '#fff', fontWeight: '700' });
    toolbar.append(askAi, toolbarDivider(), formatting);

    add(toolbarButton('', 'Undo', 'undo', () => undo(), true));
    add(toolbarButton('', 'Redo', 'redo', () => redo(), true));
    add(toolbarButton('', 'Clear formatting', 'clear-format', () => clearCommonFormatting(isText), true));
    formatting.appendChild(toolbarDivider());

    if (isText) {
      add(toolbarButton('Edit text', 'Edit text', 'edit-text', () => startTextEditing(target)));
      add(colorToolbarButton('color', 'Text color', 'color'));
      add(colorToolbarButton('background', 'Text background', 'backgroundColor'));

      const family = computedStyleValue('fontFamily').toLowerCase();
      const familyValue = family.includes('georgia') ? 'Georgia'
        : family.includes('times') ? 'Times New Roman'
          : family.includes('courier') || family.includes('mono') ? 'Courier New'
            : family.includes('arial') ? 'Arial'
              : family.includes('microsoft yahei') ? 'Microsoft YaHei'
                : 'system-ui';
      add(toolbarSelect('font-family', 'Font', familyValue, [
        { label: 'System font', value: 'system-ui' },
        { label: 'Microsoft YaHei', value: 'Microsoft YaHei' },
        { label: 'Arial', value: 'Arial' },
        { label: 'Serif', value: 'Georgia' },
        { label: 'Classic serif', value: 'Times New Roman' },
        { label: 'Monospace', value: 'Courier New' },
      ], (value) => patchSelectedStyle('fontFamily', value), '104px'));

      const currentSize = String(Math.round(pxNumber(computedStyleValue('fontSize'), 16)));
      add(toolbarSelect('font-size', 'Font size', currentSize, ['12', '14', '16', '18', '20', '24', '28', '32', '40', '48', '64'].map((value) => ({ label: value, value })),
        (value) => patchSelectedStyle('fontSize', `${value}px`), '64px'));

      const weight = computedStyleValue('fontWeight');
      const bold = weight === 'bold' || pxNumber(weight, 400) >= 600;
      add(styleToggleButton('B', 'Bold', 'font-weight', bold, (next) => patchSelectedStyle('fontWeight', next ? '700' : '400')));
      const italic = computedStyleValue('fontStyle') === 'italic';
      add(styleToggleButton('I', 'Italic', 'font-style', italic, (next) => patchSelectedStyle('fontStyle', next ? 'italic' : 'normal')));
      const underlined = computedStyleValue('textDecorationLine').includes('underline');
      add(styleToggleButton('U', 'Underline', 'underline', underlined, (next) => patchSelectedStyle('textDecorationLine', next ? 'underline' : 'none')));

      add(toolbarButton('', 'Text alignment', 'text-align', (button) => openPopover(button, 'Text alignment', (popover) => {
        addChoiceButtons(popover, [
          { label: 'Left', value: 'left' }, { label: 'Center', value: 'center' },
          { label: 'Right', value: 'right' }, { label: 'Justify', value: 'justify' },
        ], (value) => patchSelectedStyle('textAlign', value));
      }), true));
      add(toolbarButton('', 'Line and letter spacing', 'spacing', (button) => openPopover(button, 'Line and letter spacing', (popover) => {
        const lineTitle = document.createElement('div');
        lineTitle.textContent = 'Line height';
        Object.assign(lineTitle.style, { marginBottom: '7px', color: '#64748b', fontSize: '11px' });
        popover.appendChild(lineTitle);
        addChoiceButtons(popover, [
          { label: 'Compact', value: '1.2' }, { label: 'Default', value: '1.5' },
          { label: 'Relaxed', value: '1.8' }, { label: 'Loose', value: '2' },
        ], (value) => patchSelectedStyle('lineHeight', value));
        const letterTitle = document.createElement('div');
        letterTitle.textContent = 'Letter spacing';
        Object.assign(letterTitle.style, { margin: '12px 0 7px', color: '#64748b', fontSize: '11px' });
        popover.appendChild(letterTitle);
        addChoiceButtons(popover, [
          { label: 'Tight', value: '-0.02em' }, { label: 'Default', value: 'normal' },
          { label: 'Loose', value: '0.04em' }, { label: 'Wide', value: '0.08em' },
        ], (value) => patchSelectedStyle('letterSpacing', value));
      }), true));
    } else if (isImage) {
      add(toolbarButton('Alt text', 'Edit alt text', 'alt-text', (button) => openPopover(button, 'Alt text', (popover) => {
        const input = document.createElement('input');
        input.type = 'text';
        input.value = target.getAttribute('alt') ?? '';
        input.placeholder = 'Describe this image';
        const commit = () => patchSelectedAttribute('alt', input.value);
        input.addEventListener('change', commit);
        input.addEventListener('keydown', (event) => { if (event.key === 'Enter') commit(); });
        popover.appendChild(popoverField('Accessibility description', input));
      })));
      add(toolbarButton('Display size', 'Resize image', 'size', (button) => openPopover(button, 'Display size', (popover) => {
        addChoiceButtons(popover, [
          { label: 'Auto', value: '' }, { label: 'Small', value: '160px' },
          { label: 'Medium', value: '320px' }, { label: 'Large', value: '640px' },
        ], (value) => patchSelectedStyle('width', value));
      })));
      add(toolbarButton('Corners', 'Set image corner radius', 'radius', (button) => openPopover(button, 'Image corners', (popover) => {
        addChoiceButtons(popover, [
          { label: 'Square', value: '0' }, { label: 'Slight', value: '8px' },
          { label: 'Rounded', value: '16px' }, { label: 'Pill', value: '999px' },
        ], (value) => patchSelectedStyle('borderRadius', value));
      })));
    } else {
      add(toolbarButton('Layout', 'Content layout', 'layout', (button) => openPopover(button, 'Content layout', (popover) => {
        addChoiceButtons(popover, [
          { label: 'Block', value: 'block' }, { label: 'Row', value: 'row' },
          { label: 'Column', value: 'column' }, { label: 'Grid', value: 'grid' },
        ], (value) => {
          if (value === 'block') patchSelectedStyle('display', 'block');
          else if (value === 'grid') patchSelectedStyle('display', 'grid');
          else {
            patchSelectedStyle('display', 'flex');
            patchSelectedStyle('flexDirection', value);
          }
        });
      })));
      add(toolbarButton('Alignment', 'Content alignment', 'align', (button) => openPopover(button, 'Content alignment', (popover) => {
        addChoiceButtons(popover, [
          { label: 'Left', value: 'flex-start' }, { label: 'Center', value: 'center' },
          { label: 'Right', value: 'flex-end' }, { label: 'Space between', value: 'space-between' },
        ], (value) => patchSelectedStyle('justifyContent', value));
      })));
      add(toolbarButton('Gap', 'Space between items', 'gap', (button) => openPopover(button, 'Content gap', (popover) => {
        addChoiceButtons(popover, [
          { label: 'None', value: '0' }, { label: 'Compact', value: '8px' },
          { label: 'Default', value: '16px' }, { label: 'Loose', value: '24px' },
        ], (value) => patchSelectedStyle('gap', value));
      })));
      add(colorToolbarButton('background', 'Background', 'backgroundColor'));
      add(toolbarButton('Corners', 'Set section corner radius', 'radius', (button) => openPopover(button, 'Corner radius', (popover) => {
        addChoiceButtons(popover, [
          { label: 'Square', value: '0' }, { label: 'Slight', value: '8px' },
          { label: 'Rounded', value: '16px' }, { label: 'Large', value: '24px' },
        ], (value) => patchSelectedStyle('borderRadius', value));
      })));
    }

    formatting.appendChild(toolbarDivider());
    add(toolbarButton('', 'More formatting', 'more', (button) => openPopover(button, 'More formatting', (popover) => {
      const innerTitle = document.createElement('div');
      innerTitle.textContent = 'Padding';
      Object.assign(innerTitle.style, { marginBottom: '7px', color: '#64748b', fontSize: '11px' });
      popover.appendChild(innerTitle);
      addChoiceButtons(popover, [
        { label: 'None', value: '0' }, { label: 'Compact', value: '8px' },
        { label: 'Default', value: '16px' }, { label: 'Loose', value: '24px' },
      ], (value) => applyBoxSpacing('padding', value));
      const outerTitle = document.createElement('div');
      outerTitle.textContent = 'Margin';
      Object.assign(outerTitle.style, { margin: '12px 0 7px', color: '#64748b', fontSize: '11px' });
      popover.appendChild(outerTitle);
      addChoiceButtons(popover, [
        { label: 'None', value: '0' }, { label: 'Compact', value: '8px' },
        { label: 'Default', value: '16px' }, { label: 'Loose', value: '24px' },
      ], (value) => applyBoxSpacing('margin', value));
      const opacityLabel = document.createElement('label');
      Object.assign(opacityLabel.style, { display: 'grid', gridTemplateColumns: '1fr auto', gap: '8px', alignItems: 'center', marginTop: '14px', color: '#64748b', fontSize: '11px' });
      const opacityTitle = document.createElement('span');
      opacityTitle.textContent = 'Opacity';
      const opacityValue = document.createElement('span');
      const opacity = document.createElement('input');
      opacity.type = 'range';
      opacity.min = '0';
      opacity.max = '100';
      opacity.step = '5';
      opacity.value = String(Math.round(pxNumber(computedStyleValue('opacity'), 1) * 100));
      opacityValue.textContent = `${opacity.value}%`;
      Object.assign(opacity.style, { gridColumn: '1 / -1', width: '100%', accentColor: '#2563eb' });
      opacity.addEventListener('input', () => { opacityValue.textContent = `${opacity.value}%`; });
      opacity.addEventListener('change', () => patchSelectedStyle('opacity', String(Number(opacity.value) / 100)));
      opacityLabel.append(opacityTitle, opacityValue, opacity);
      popover.appendChild(opacityLabel);
    }), true));
    const close = toolbarButton('', 'Close toolbar', 'close', () => {
      clearSelection();
      if (nonce) postToEditor({ type: 'steps:selection-cleared', nonce });
    });
    Object.assign(close.style, {
      marginLeft: '3px', border: '1px solid #e2e8f0', background: '#fff', color: '#334155', fontWeight: '600',
    });
    toolbar.append(toolbarDivider(), close);
    updateToolbarState();
    positionContextToolbar(toolbar, target);
  };

  const startTextEditing = (target: Element): void => {
    if (!editEnabled || target !== selectedTarget || !canEditText(target) || !(target instanceof HTMLElement)) return;
    const loc = target.getAttribute(MARKER_ATTRIBUTE);
    if (!loc) return;
    closePopover();
    const before = target.textContent ?? '';
    editingText = true;
    target.contentEditable = 'plaintext-only';
    target.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(target);
    selection?.removeAllRanges();
    selection?.addRange(range);
    const finish = (commit: boolean) => {
      if (!editingText) return;
      const value = target.textContent ?? '';
      target.contentEditable = 'false';
      editingText = false;
      if (!commit) target.textContent = before;
      else if (value !== before) {
        target.textContent = before;
        recordPatch({ loc, kind: 'text', before, value });
      }
      target.removeEventListener('blur', onBlur);
      target.removeEventListener('keydown', onKeyDown);
      refresh();
    };
    const onBlur = () => finish(true);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); finish(false); }
      else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); finish(true); }
    };
    target.addEventListener('blur', onBlur);
    target.addEventListener('keydown', onKeyDown);
  };

  const postToEditor = (message: PreviewToEditorMessage): void => {
    if (editorOrigin) window.parent.postMessage(message, editorOrigin);
  };

  const stopPaintWatch = (): void => {
    paintObserver?.disconnect();
    paintObserver = null;
    document.removeEventListener('load', checkForPaint, true);
    if (firstPaintFrame !== null) window.cancelAnimationFrame(firstPaintFrame);
    if (secondPaintFrame !== null) window.cancelAnimationFrame(secondPaintFrame);
    firstPaintFrame = null;
    secondPaintFrame = null;
    paintNonce = null;
  };

  function checkForPaint(): void {
    if (!paintNonce || firstPaintFrame !== null || secondPaintFrame !== null) return;
    if (!hasVisiblePreviewContent()) return;

    const expectedNonce = paintNonce;
    firstPaintFrame = window.requestAnimationFrame(() => {
      firstPaintFrame = null;
      secondPaintFrame = window.requestAnimationFrame(() => {
        secondPaintFrame = null;
        if (paintNonce !== expectedNonce || !hasVisiblePreviewContent()) return;
        postToEditor({ type: 'steps:preview-painted', nonce: expectedNonce });
        stopPaintWatch();
      });
    });
  }

  const startPaintWatch = (expectedNonce: string): void => {
    stopPaintWatch();
    paintNonce = expectedNonce;
    paintObserver = new MutationObserver(checkForPaint);
    paintObserver.observe(document.body, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });
    document.addEventListener('load', checkForPaint, true);
    checkForPaint();
  };

  const draftState = (): VisualEditDraftState => ({
    patches: Array.from(currentValues.values()).filter((patch) => patch.value !== patch.before),
    undoCount: undoStack.length,
    redoCount: redoStack.length,
  });
  const emitDraftState = (): void => { if (nonce) postToEditor({ type: 'steps:draft-state', nonce, state: draftState() }); };
  const emitSelection = (): void => {
    if (!nonce || !selectedTarget) return;
    const selection = inspectSelection(selectedTarget);
    if (selection) postToEditor({ type: 'steps:element-selected', nonce, selection });
  };

  const applyPatch = (patch: VisualEditPatch, useValue: 'value' | 'before' = 'value'): void => {
    const target = Array.from(document.querySelectorAll(`[${MARKER_ATTRIBUTE}]`))
      .find((element) => element.getAttribute(MARKER_ATTRIBUTE) === patch.loc);
    if (!target) return;
    const value = patch[useValue];
    if (patch.kind === 'text') target.textContent = value;
    else if (patch.kind === 'style' && target instanceof HTMLElement) {
      if (value) target.style.setProperty(cssName(patch.property), value);
      else target.style.removeProperty(cssName(patch.property));
    } else if (patch.kind === 'attribute') {
      const domName = patch.name === 'className' ? 'class' : patch.name === 'tabIndex' ? 'tabindex' : patch.name;
      if (value) target.setAttribute(domName, value);
      else target.removeAttribute(domName);
    }
  };

  const syncPatch = (patch: VisualEditPatch): void => {
    const key = patchKey(patch);
    if (!baseValues.has(key)) baseValues.set(key, { ...patch });
    const base = baseValues.get(key)!;
    currentValues.set(key, { ...patch, before: base.before } as VisualEditPatch);
  };

  const refresh = (): void => {
    if (hoverOverlay) positionOverlay(hoverOverlay, hoverTarget);
    if (selectedOverlay) positionOverlay(selectedOverlay, selectedTarget);
    if (selectedChrome && selectedTarget) {
      selectedChrome.label.textContent = `${friendlyElementLabel(selectedTarget)} · Drag to reposition`;
      positionContextToolbar(selectedChrome.toolbar, selectedTarget);
      positionContextPopover();
      updateToolbarState();
    }
    emitSelection();
    emitDraftState();
  };

  const recordPatch = (patch: VisualEditPatch): void => {
    if (patch.value === patch.before) return;
    applyPatch(patch);
    undoStack.push(patch);
    redoStack.length = 0;
    syncPatch(patch);
    refresh();
  };

  const undo = (): void => {
    const patch = undoStack.pop();
    if (!patch) return;
    applyPatch(patch, 'before');
    redoStack.push(patch);
    const key = patchKey(patch);
    const base = baseValues.get(key)!;
    if (patch.before === base.before) currentValues.delete(key);
    else currentValues.set(key, { ...patch, before: base.before, value: patch.before } as VisualEditPatch);
    refresh();
  };
  const redo = (): void => {
    const patch = redoStack.pop();
    if (!patch) return;
    applyPatch(patch);
    undoStack.push(patch);
    syncPatch(patch);
    refresh();
  };
  const cancelDraft = (): void => {
    baseValues.forEach((patch) => applyPatch(patch, 'before'));
    undoStack.length = 0; redoStack.length = 0; baseValues.clear(); currentValues.clear(); refresh();
  };
  const commitDraft = (): void => {
    undoStack.length = 0; redoStack.length = 0; baseValues.clear(); currentValues.clear(); refresh();
  };

  const selectTarget = (target: Element): void => {
    const loc = target.getAttribute(MARKER_ATTRIBUTE);
    if (!loc) return;
    selectedTarget = target;
    if (selectedOverlay) positionOverlay(selectedOverlay, target);
    renderContextToolbar(target);
    refresh();
  };
  const clearSelection = (): void => {
    selectedTarget = null;
    closePopover();
    if (selectedChrome) selectedChrome.toolbar.style.display = 'none';
    if (selectedOverlay) positionOverlay(selectedOverlay, null);
  };
  const clearAll = (): void => {
    hoverTarget = null;
    if (hoverOverlay) positionOverlay(hoverOverlay, null);
    clearSelection();
  };

  const startResize = (direction: string, event: PointerEvent): void => {
    if (!selectedTarget || !(selectedTarget instanceof HTMLElement)) return;
    event.preventDefault(); event.stopPropagation();
    const target = selectedTarget;
    const loc = target.getAttribute(MARKER_ATTRIBUTE);
    if (!loc) return;
    const rect = target.getBoundingClientRect();
    const startX = event.clientX; const startY = event.clientY;
    const beforeWidth = target.style.width; const beforeHeight = target.style.height;
    const onMove = (move: PointerEvent) => {
      const dx = move.clientX - startX; const dy = move.clientY - startY;
      if (direction.includes('e')) target.style.width = `${Math.max(1, rect.width + dx)}px`;
      if (direction.includes('w')) target.style.width = `${Math.max(1, rect.width - dx)}px`;
      if (direction.includes('s')) target.style.height = `${Math.max(1, rect.height + dy)}px`;
      if (direction.includes('n')) target.style.height = `${Math.max(1, rect.height - dy)}px`;
      positionOverlay(selectedOverlay!, target);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      const nextWidth = target.style.width; const nextHeight = target.style.height;
      target.style.width = beforeWidth; target.style.height = beforeHeight;
      if (nextWidth !== beforeWidth) recordPatch({ loc, kind: 'style', property: 'width', before: beforeWidth, value: nextWidth });
      if (nextHeight !== beforeHeight) recordPatch({ loc, kind: 'style', property: 'height', before: beforeHeight, value: nextHeight });
    };
    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!editEnabled || editingText) return;
    const target = editableTarget(event.target);
    if (target && target !== hoverTarget) {
      hoverTarget = target;
      if (hoverOverlay) positionOverlay(hoverOverlay, target);
    }
  };
  const onClick = (event: MouseEvent): void => {
    if (!editEnabled || editingText) return;
    if ((event.target as Element | null)?.closest?.('[data-steps-visual-overlay], [data-steps-context-popover]')) return;
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
    const target = editableTarget(event.target);
    if (target) selectTarget(target);
  };

  const onDoubleClick = (event: MouseEvent): void => {
    if (!editEnabled) return;
    const target = editableTarget(event.target);
    if (!target || target !== selectedTarget || !canEditText(target)) return;
    event.preventDefault(); event.stopPropagation();
    startTextEditing(target);
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (!editEnabled || editingText) return;
    if ((event.target as Element | null)?.closest?.('[data-steps-context-toolbar], [data-steps-context-popover]')) return;
    const overlayPart = (event.target as Element | null)?.closest?.('[data-steps-visual-overlay]');
    const dragHandle = (event.target as Element | null)?.closest?.('[data-steps-visual-drag-handle]');
    const target = editableTarget(event.target);
    if (!overlayPart && target) event.preventDefault();
    if (!selectedTarget || !(selectedTarget instanceof HTMLElement)) return;
    if (!dragHandle && (overlayPart || target !== selectedTarget)) return;
    if ((event.target as Element | null)?.closest?.('[data-steps-resize]')) return;
    const element = selectedTarget;
    const loc = element.getAttribute(MARKER_ATTRIBUTE);
    if (!loc) return;
    const startX = event.clientX; const startY = event.clientY;
    const before = element.style.transform;
    let moved = false; let next = before;
    const onMove = (move: PointerEvent) => {
      const dx = move.clientX - startX; const dy = move.clientY - startY;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      moved = true; move.preventDefault();
      const translate = `translate(${Math.round(dx)}px, ${Math.round(dy)}px)`;
      next = before && before !== 'none' ? `${before} ${translate}` : translate;
      element.style.transform = next;
      positionOverlay(selectedOverlay!, element);
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      if (!moved) return;
      element.style.transform = before;
      recordPatch({ loc, kind: 'style', property: 'transform', before, value: next });
    };
    document.addEventListener('pointermove', onMove, { capture: true, passive: false });
    document.addEventListener('pointerup', onUp, true);
  };

  const blockPageAction = (event: Event): void => {
    if (!editEnabled || editingText) return;
    if ((event.target as Element | null)?.closest?.('[data-steps-context-toolbar], [data-steps-context-popover]')) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const blockInteractiveKey = (event: KeyboardEvent): void => {
    if (!editEnabled || editingText) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('[data-steps-context-toolbar], [data-steps-context-popover]')) return;
    if (!target?.closest('a, button, input, textarea, select, [contenteditable], [role="button"], [role="link"]')) return;
    if (event.key === 'Enter' || event.key === ' ' || target.matches('input, textarea, select, [contenteditable]')) {
      blockPageAction(event);
    }
  };

  const refreshOverlays = (): void => {
    if (!editEnabled) return;
    if (hoverOverlay) positionOverlay(hoverOverlay, hoverTarget);
    if (selectedOverlay) positionOverlay(selectedOverlay, selectedTarget);
    if (selectedChrome && selectedTarget) {
      positionContextToolbar(selectedChrome.toolbar, selectedTarget);
      positionContextPopover();
    }
  };

  const activateInteractions = (): void => {
    if (interactionsActive) return;
    interactionsActive = true;
    hoverOverlay = createOverlay('#60a5fa');
    selectedOverlay = createOverlay('#2563eb', true);
    selectedChrome = createSelectionChrome(selectedOverlay, startResize);
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('dblclick', onDoubleClick, true);
    document.addEventListener('submit', blockPageAction, true);
    document.addEventListener('beforeinput', blockPageAction, true);
    document.addEventListener('dragstart', blockPageAction, true);
    document.addEventListener('keydown', blockInteractiveKey, true);
    window.addEventListener('resize', refreshOverlays);
    window.addEventListener('scroll', refreshOverlays, true);
  };
  const deactivateInteractions = (): void => {
    clearAll();
    if (!interactionsActive) return;
    interactionsActive = false;
    document.removeEventListener('pointermove', onPointerMove, true);
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('dblclick', onDoubleClick, true);
    document.removeEventListener('submit', blockPageAction, true);
    document.removeEventListener('beforeinput', blockPageAction, true);
    document.removeEventListener('dragstart', blockPageAction, true);
    document.removeEventListener('keydown', blockInteractiveKey, true);
    window.removeEventListener('resize', refreshOverlays);
    window.removeEventListener('scroll', refreshOverlays, true);
    hoverOverlay?.remove(); selectedOverlay?.remove(); selectedChrome?.popover.remove();
    hoverOverlay = null; selectedOverlay = null; selectedChrome = null; activePopoverButton = null;
  };

  const onMessage = (event: MessageEvent<unknown>): void => {
    if (event.source !== window.parent || !event.data || typeof event.data !== 'object') return;
    const message = event.data as Partial<EditorToPreviewMessage>;
    if (message.type === 'steps:edit-init' && typeof message.nonce === 'string') {
      if (!configuredEditorOrigin || event.origin !== configuredEditorOrigin) return;
      editorOrigin = configuredEditorOrigin; nonce = message.nonce; editEnabled = false;
      deactivateInteractions();
      postToEditor({ type: 'steps:edit-ready', nonce });
      emitDraftState();
      startPaintWatch(nonce);
      return;
    }
    if (!editorOrigin || event.origin !== editorOrigin || message.nonce !== nonce) return;
    if (message.type === 'steps:edit-mode' && typeof message.enabled === 'boolean') {
      editEnabled = message.enabled;
      if (editEnabled) activateInteractions(); else deactivateInteractions();
    } else if (message.type === 'steps:clear-selection') clearSelection();
    else if (message.type === 'steps:select-loc' && typeof message.loc === 'string') {
      const target = Array.from(document.querySelectorAll(`[${MARKER_ATTRIBUTE}]`))
        .find((element) => element.getAttribute(MARKER_ATTRIBUTE) === message.loc);
      if (target) selectTarget(target);
    } else if (message.type === 'steps:set-text' && typeof message.value === 'string' && selectedTarget) {
      const loc = selectedTarget.getAttribute(MARKER_ATTRIBUTE);
      if (loc && canEditText(selectedTarget)) recordPatch({ loc, kind: 'text', before: selectedTarget.textContent ?? '', value: message.value });
    } else if (message.type === 'steps:set-style' && typeof message.property === 'string'
      && typeof message.value === 'string' && selectedTarget instanceof HTMLElement) {
      const loc = selectedTarget.getAttribute(MARKER_ATTRIBUTE);
      const property = message.property as keyof ElementStyleSnapshot;
      if (loc && STYLE_PROPERTIES.includes(property)) recordPatch({
        loc, kind: 'style', property, before: selectedTarget.style.getPropertyValue(cssName(property)), value: message.value,
      });
    } else if (message.type === 'steps:set-attribute' && typeof message.name === 'string'
      && typeof message.value === 'string' && selectedTarget) {
      const loc = selectedTarget.getAttribute(MARKER_ATTRIBUTE);
      const name = message.name as ElementAttributeName;
      const domName = name === 'className' ? 'class' : name === 'tabIndex' ? 'tabindex' : name;
      if (loc && ['className', 'title', 'alt', 'aria-label', 'role', 'tabIndex'].includes(name)) {
        recordPatch({ loc, kind: 'attribute', name, before: selectedTarget.getAttribute(domName) ?? '', value: message.value });
      }
    } else if (message.type === 'steps:undo') undo();
    else if (message.type === 'steps:redo') redo();
    else if (message.type === 'steps:cancel-draft') cancelDraft();
    else if (message.type === 'steps:commit-draft') commitDraft();
  };

  const onShortcut = (event: KeyboardEvent): void => {
    if (!editEnabled || editingText || !(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() !== 'z') return;
    event.preventDefault();
    if (event.shiftKey) redo(); else undo();
  };

  window.addEventListener('message', onMessage);
  window.addEventListener('keydown', onShortcut, true);
  return {
    dispose() {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('keydown', onShortcut, true);
      stopPaintWatch();
      editEnabled = false;
      deactivateInteractions();
    },
  };
}

if (typeof window !== 'undefined' && window.parent !== window) {
  window.__stepsVisualEditRuntime?.dispose();
  const runtime = installVisualEditRuntime();
  window.__stepsVisualEditRuntime = runtime;
  (import.meta as ImportMeta & { hot?: ViteHotContext }).hot?.dispose(() => runtime.dispose());
}
