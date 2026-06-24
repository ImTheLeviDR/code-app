/* ============================================================
   SIDEBAR - resize, persist, edge reopen
   ============================================================ */

'use strict';

const Sidebar = (() => {
  const DEFAULT_WIDTH = 240;
  const MIN_WIDTH = 120;
  const MAX_WIDTH = 560;
  const CLOSE_THRESHOLD = 120;
  const EDGE_ZONE = 6;

  let toggling = false;
  let dragging = false;
  let dragMode = null;
  let dragStartX = 0;
  let dragStartWidth = 0;
  let widthAtDragStart = DEFAULT_WIDTH;

  function clampWidth(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return DEFAULT_WIDTH;
    return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(n)));
  }

  function readCssWidth() {
    const w = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width').trim();
    return parseFloat(w) || DEFAULT_WIDTH;
  }

  function applyWidth(width) {
    const next = clampWidth(width);
    document.documentElement.style.setProperty('--sidebar-width', `${next}px`);
    if (dom.sidebar) dom.sidebar.style.width = `${next}px`;
    return next;
  }

  function applyCssWidth(width) {
    const next = clampWidth(width);
    document.documentElement.style.setProperty('--sidebar-width', `${next}px`);
    clearInlineWidth();
    return next;
  }

  function previewWidth(width) {
    const next = Math.max(0, Math.round(width));
    document.documentElement.style.setProperty('--sidebar-width', `${next}px`);
    if (dom.sidebar) dom.sidebar.style.width = `${next}px`;
    return next;
  }

  function clearInlineWidth() {
    if (dom.sidebar) dom.sidebar.style.width = '';
  }

  function isHidden() {
    return dom.appBody?.classList.contains('sidebar-hidden') === true;
  }

  function isResizeBlocked() {
    return toggling
      || dom.appBody?.classList.contains('settings-open')
      || dragging;
  }

  function persistLayout({ width, hidden } = {}) {
    if (typeof SettingsStore?.setSidebarLayout !== 'function') return;
    SettingsStore.setSidebarLayout({ width, hidden });
  }

  function loadLayout() {
    if (typeof SettingsStore?.getSidebarLayout === 'function') {
      return SettingsStore.getSidebarLayout();
    }
    return { width: DEFAULT_WIDTH, hidden: false };
  }

  function hideSidebar({ animate = true, restoreWidth = null } = {}) {
    if (!dom.appBody || !dom.sidebar || isHidden()) return;

    const layout = loadLayout();
    const widthToKeep = restoreWidth != null ? clampWidth(restoreWidth) : layout.width;

    const finishHide = () => {
      dom.appBody.classList.add('sidebar-hidden');
      if (dom.sidebar) {
        dom.sidebar.style.width = '';
        dom.sidebar.style.opacity = '';
      }
      persistLayout({ width: widthToKeep, hidden: true });
      toggling = false;
    };

    if (!animate) {
      finishHide();
      return;
    }

    toggling = true;
    Physics.sidebarToggle(dom.sidebar, false, finishHide);
  }

  function showSidebar({ animate = true } = {}) {
    if (!dom.appBody || !dom.sidebar || !isHidden()) return;

    const { width } = loadLayout();
    applyWidth(width);

    const finishShow = () => {
      applyCssWidth(width);
      persistLayout({ hidden: false });
      toggling = false;
    };

    if (!animate) {
      dom.appBody.classList.remove('sidebar-hidden');
      finishShow();
      return;
    }

    toggling = true;
    dom.sidebar.style.width = '0px';
    dom.sidebar.style.opacity = '0';
    dom.appBody.classList.remove('sidebar-hidden');
    Physics.sidebarToggle(dom.sidebar, true, finishShow);
  }

  function toggleSidebar() {
    if (isResizeBlocked() || !dom.appBody || !dom.sidebar) return;
    if (isHidden()) showSidebar();
    else hideSidebar({ animate: true });
  }

  function finishDrag(finalWidth) {
    dragging = false;
    dragMode = null;
    document.body.classList.remove('sidebar-resizing');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    if (finalWidth <= CLOSE_THRESHOLD) {
      hideSidebar({ animate: false, restoreWidth: widthAtDragStart });
      return;
    }

    const next = applyWidth(finalWidth);
    clearInlineWidth();
    document.documentElement.style.setProperty('--sidebar-width', `${next}px`);
    dom.appBody?.classList.remove('sidebar-hidden');
    persistLayout({ width: next, hidden: false });
  }

  function onPointerMove(e) {
    if (!dragging) return;

    let nextWidth;
    if (dragMode === 'edge') {
      nextWidth = e.clientX;
    } else {
      nextWidth = dragStartWidth + (e.clientX - dragStartX);
    }

    if (nextWidth <= CLOSE_THRESHOLD) {
      previewWidth(nextWidth);
      if (isHidden()) dom.appBody.classList.remove('sidebar-hidden');
      return;
    }

    dom.appBody?.classList.remove('sidebar-hidden');
    previewWidth(nextWidth);
  }

  function onPointerUp(e) {
    if (!dragging) return;

    let finalWidth;
    if (dragMode === 'edge') {
      finalWidth = e.clientX;
    } else {
      finalWidth = dragStartWidth + (e.clientX - dragStartX);
    }

    finishDrag(finalWidth);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
  }

  function beginDrag(mode, clientX) {
    if (isResizeBlocked()) return;

    const layout = loadLayout();
    widthAtDragStart = isHidden() ? layout.width : readCssWidth();
    dragMode = mode;
    dragging = true;
    dragStartX = clientX;
    dragStartWidth = isHidden() ? 0 : (dom.sidebar?.offsetWidth || layout.width);

    if (mode === 'edge' && isHidden()) {
      dom.appBody?.classList.remove('sidebar-hidden');
      previewWidth(0);
    } else if (dom.sidebar) {
      dom.sidebar.style.width = `${dragStartWidth}px`;
    }

    document.body.classList.add('sidebar-resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  }

  function bindResizeHandle() {
    const handle = document.getElementById('sidebarResizeHandle');
    if (!handle) return;

    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || isHidden() || isResizeBlocked()) return;
      e.preventDefault();
      handle.setPointerCapture?.(e.pointerId);
      beginDrag('handle', e.clientX);
    });
  }

  function bindEdgeOpener() {
    const edge = document.getElementById('sidebarEdgeOpener');
    if (!edge) return;

    edge.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !isHidden() || isResizeBlocked()) return;
      if (dom.appBody?.classList.contains('settings-open')) return;
      e.preventDefault();
      edge.setPointerCapture?.(e.pointerId);
      beginDrag('edge', e.clientX);
    });
  }

  function applySavedLayout() {
    const { width, hidden } = loadLayout();
    applyCssWidth(width);
    if (hidden) dom.appBody?.classList.add('sidebar-hidden');
    else dom.appBody?.classList.remove('sidebar-hidden');
  }

  function persistCurrentLayout() {
    const saved = loadLayout();
    const width = isHidden()
      ? saved.width
      : clampWidth(dom.sidebar?.offsetWidth || readCssWidth());
    persistLayout({ width, hidden: isHidden() });
  }

  function init() {
    if (!dom.appBody || !dom.sidebar) return;
    applySavedLayout();
    bindResizeHandle();
    bindEdgeOpener();
    window.addEventListener('beforeunload', persistCurrentLayout);
    window.addEventListener('pagehide', persistCurrentLayout);
  }

  return {
    init,
    toggleSidebar,
    isHidden,
    EDGE_ZONE,
  };
})();

function toggleSidebar() {
  Sidebar.toggleSidebar();
}
