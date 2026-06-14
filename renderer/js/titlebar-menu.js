/* ============================================================
   TITLEBAR MENU (VS Code-style)
   ============================================================ */

'use strict';

const TitlebarMenu = (() => {
  const MENUBAR_CONFIG = [
    {
      label: 'File',
      items: [
        { label: 'New Chat', shortcut: 'Ctrl+N', action: 'new-chat' },
        { label: 'Open Folder', shortcut: 'Ctrl+O', action: 'open-folder' },
        { label: 'Search Chats', shortcut: 'Ctrl+K', action: 'search' },
        { type: 'separator' },
        { label: 'Settings', shortcut: 'Ctrl+,', action: 'settings' },
        { type: 'separator' },
        { label: 'Exit', shortcut: 'Alt+F4', action: 'exit' },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: 'Ctrl+Z', action: 'undo' },
        { label: 'Redo', shortcut: 'Ctrl+Y', action: 'redo' },
        { type: 'separator' },
        { label: 'Cut', shortcut: 'Ctrl+X', action: 'cut' },
        { label: 'Copy', shortcut: 'Ctrl+C', action: 'copy' },
        { label: 'Paste', shortcut: 'Ctrl+V', action: 'paste' },
        { type: 'separator' },
        { label: 'Select All', shortcut: 'Ctrl+A', action: 'select-all' },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Toggle Sidebar', shortcut: 'Ctrl+B', action: 'toggle-sidebar' },
        { type: 'separator' },
        { label: 'Welcome Screen', action: 'welcome' },
        { label: 'Settings', shortcut: 'Ctrl+,', action: 'settings' },
      ],
    },
  ];

  let openMenu = null;
  let menuItems = [];
  let clickBound = false;

  function renderMenuItems(items) {
    return items.map((item) => {
      if (item.type === 'separator') {
        return '<div class="menubar-separator" role="separator"></div>';
      }

      const shortcut = item.shortcut
        ? `<span class="menubar-option-shortcut">${item.shortcut}</span>`
        : '';

      return `
        <button
          type="button"
          class="menubar-option"
          role="menuitem"
          data-action="${item.action}"
        >
          <span class="menubar-option-label">${item.label}</span>
          ${shortcut}
        </button>
      `;
    }).join('');
  }

  function closeAllMenus() {
    menuItems.forEach(({ item, trigger, menu }) => {
      item.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      menu.style.visibility = 'hidden';
    });
    openMenu = null;
  }

  function openMenuItem(entry) {
    if (openMenu === entry) {
      closeAllMenus();
      return;
    }

    if (typeof closeAllModelDropdowns === 'function') closeAllModelDropdowns(true);
    closeAllMenus();
    entry.item.classList.add('open');
    entry.trigger.setAttribute('aria-expanded', 'true');
    entry.menu.style.visibility = 'visible';
    openMenu = entry;
    entry.options[0]?.focus();
  }

  function runAction(action) {
    closeAllMenus();

    switch (action) {
      case 'new-chat':
        if (!getSelectedProject()) {
          openProjectFolder();
          break;
        }
        showWelcomeScreen();
        focusInput(dom.welcomeInput);
        break;
      case 'open-folder':
        openProjectFolder();
        break;
      case 'search':
        openSearch();
        break;
      case 'settings':
        openSettings();
        break;
      case 'exit':
        quitApp();
        break;
      case 'welcome':
        showWelcomeScreen();
        focusInput(dom.welcomeInput);
        break;
      case 'toggle-sidebar':
        toggleSidebar();
        break;
      case 'undo':
        runEditCommand('undo');
        break;
      case 'redo':
        runEditCommand('redo');
        break;
      case 'cut':
        runEditCommand('cut');
        break;
      case 'copy':
        runEditCommand('copy');
        break;
      case 'paste':
        runEditCommand('paste');
        break;
      case 'select-all':
        runEditCommand('selectAll');
        break;
      default:
        break;
    }
  }

  function createMenuItem(root, config) {
    root.innerHTML = `
      <button type="button" class="menubar-trigger" aria-haspopup="true" aria-expanded="false">
        ${config.label}
      </button>
      <div class="menubar-menu" role="menu">
        ${renderMenuItems(config.items)}
      </div>
    `;

    const trigger = root.querySelector('.menubar-trigger');
    const menu = root.querySelector('.menubar-menu');
    const options = Array.from(root.querySelectorAll('.menubar-option'));

    menu.style.visibility = 'hidden';

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      openMenuItem(entry);
    });

    options.forEach((option, idx) => {
      option.addEventListener('click', (e) => {
        e.stopPropagation();
        runAction(option.dataset.action);
      });

      option.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          options[(idx + 1) % options.length].focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          options[(idx - 1 + options.length) % options.length].focus();
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          runAction(option.dataset.action);
          trigger.focus();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          closeAllMenus();
          trigger.focus();
        }
      });
    });

    const entry = { item: root, trigger, menu, options };
    menuItems.push(entry);
    return entry;
  }

  function init() {
    const menubar = document.getElementById('titlebarMenubar');
    if (!menubar) return;

    MENUBAR_CONFIG.forEach((config) => {
      const item = document.createElement('div');
      item.className = 'menubar-item';
      menubar.appendChild(item);
      createMenuItem(item, config);
    });

    if (!clickBound) {
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.titlebar-menubar')) {
          closeAllMenus();
        }
      });
      clickBound = true;
    }
  }

  return { init, closeAllMenus };
})();

function runEditCommand(command) {
  const el = document.activeElement;

  if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT' || el.isContentEditable)) {
    el.focus();

    if (command === 'selectAll') {
      if (typeof el.select === 'function') el.select();
      return;
    }

    document.execCommand(command);
    return;
  }

  showToast('Select a text field first');
}

function toggleSidebar() {
  const hidden = dom.appBody.classList.toggle('sidebar-hidden');
  showToast(hidden ? 'Sidebar hidden' : 'Sidebar shown');
}

function quitApp() {
  if (window.electronAPI?.quit) {
    window.electronAPI.quit();
    return;
  }

  if (window.electronAPI?.close) {
    window.electronAPI.close();
    return;
  }

  showToast('Exit is available in the desktop app');
}

document.addEventListener('DOMContentLoaded', () => {
  TitlebarMenu.init();
});
