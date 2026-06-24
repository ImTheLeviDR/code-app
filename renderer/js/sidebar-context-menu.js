/* ============================================================
   SIDEBAR CONTEXT MENU
   ============================================================ */

'use strict';

const SidebarContextMenu = (() => {
  let menuEl = null;
  let confirmOverlay = null;
  let open = false;
  let bound = false;
  let headerBound = false;

  function ensureMenu() {
    if (menuEl) return menuEl;
    menuEl = document.createElement('div');
    menuEl.id = 'sidebarContextMenu';
    menuEl.className = 'context-menu';
    menuEl.setAttribute('role', 'menu');
    menuEl.hidden = true;
    document.body.appendChild(menuEl);
    return menuEl;
  }

  function close() {
    if (!menuEl) return;
    menuEl.hidden = true;
    menuEl.innerHTML = '';
    open = false;
    dom.chatMoreBtn?.setAttribute('aria-expanded', 'false');
  }

  function closeConfirm() {
    if (!confirmOverlay) return;
    const panel = confirmOverlay.querySelector('.confirm-modal');
    const finish = () => {
      confirmOverlay.remove();
      confirmOverlay = null;
      document.removeEventListener('keydown', confirmKeyHandler);
    };
    if (panel && typeof Physics !== 'undefined') {
      Physics.modalOut(confirmOverlay, panel, finish);
    } else {
      finish();
    }
  }

  function confirmKeyHandler(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeConfirm();
    }
  }

  function showConfirmDialog({
    title,
    message,
    confirmLabel = 'Delete',
    cancelLabel = 'Cancel',
    destructive = true,
    onConfirm,
  }) {
    close();
    closeConfirm();

    confirmOverlay = document.createElement('div');
    confirmOverlay.className = 'confirm-overlay';
    confirmOverlay.innerHTML = `
      <div class="confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirmDialogTitle">
        <h2 class="confirm-title" id="confirmDialogTitle">${escapeHtml(title)}</h2>
        <p class="confirm-message">${escapeHtml(message)}</p>
        <div class="confirm-actions">
          <button type="button" class="confirm-btn confirm-btn-cancel" data-action="cancel">${escapeHtml(cancelLabel)}</button>
          <button type="button" class="confirm-btn${destructive ? ' confirm-btn-danger' : ' confirm-btn-primary'}" data-action="confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;

    confirmOverlay.addEventListener('click', (e) => {
      if (e.target === confirmOverlay) closeConfirm();
    });

    const cancelBtn = confirmOverlay.querySelector('[data-action="cancel"]');
    const confirmBtn = confirmOverlay.querySelector('[data-action="confirm"]');

    cancelBtn.addEventListener('click', () => closeConfirm());
    confirmBtn.addEventListener('click', () => {
      closeConfirm();
      onConfirm?.();
    });

    document.body.appendChild(confirmOverlay);
    document.addEventListener('keydown', confirmKeyHandler);

    const panel = confirmOverlay.querySelector('.confirm-modal');
    if (typeof Physics !== 'undefined') {
      Physics.modalIn(confirmOverlay, panel);
    }
    cancelBtn.focus();
  }

  function showPromptDialog({
    title,
    message,
    value = '',
    confirmLabel = 'Save',
    cancelLabel = 'Cancel',
    onConfirm,
  }) {
    close();
    closeConfirm();

    confirmOverlay = document.createElement('div');
    confirmOverlay.className = 'confirm-overlay';
    confirmOverlay.innerHTML = `
      <div class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="promptDialogTitle">
        <h2 class="confirm-title" id="promptDialogTitle">${escapeHtml(title)}</h2>
        ${message ? `<p class="confirm-message">${escapeHtml(message)}</p>` : ''}
        <input class="confirm-input" type="text" value="${escapeHtml(value)}" maxlength="120" />
        <div class="confirm-actions">
          <button type="button" class="confirm-btn confirm-btn-cancel" data-action="cancel">${escapeHtml(cancelLabel)}</button>
          <button type="button" class="confirm-btn confirm-btn-primary" data-action="confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;

    confirmOverlay.addEventListener('click', (e) => {
      if (e.target === confirmOverlay) closeConfirm();
    });

    const input = confirmOverlay.querySelector('.confirm-input');
    const cancelBtn = confirmOverlay.querySelector('[data-action="cancel"]');
    const confirmBtn = confirmOverlay.querySelector('[data-action="confirm"]');

    const submit = () => {
      const next = input.value.trim();
      if (!next) {
        input.focus();
        return;
      }
      closeConfirm();
      onConfirm?.(next);
    };

    cancelBtn.addEventListener('click', () => closeConfirm());
    confirmBtn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submit();
      }
    });

    document.body.appendChild(confirmOverlay);
    document.addEventListener('keydown', confirmKeyHandler);

    const panel = confirmOverlay.querySelector('.confirm-modal');
    if (typeof Physics !== 'undefined') {
      Physics.modalIn(confirmOverlay, panel);
    }
    input.focus();
    input.select();
  }

  function positionMenuFromAnchor(menu, anchor) {
    menu.hidden = false;
    menu.style.left = '0px';
    menu.style.top = '0px';

    const rect = menu.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    const margin = 8;
    let left = anchorRect.right - rect.width;
    let top = anchorRect.bottom + 4;

    if (left + rect.width > window.innerWidth - margin) {
      left = window.innerWidth - rect.width - margin;
    }
    if (top + rect.height > window.innerHeight - margin) {
      top = anchorRect.top - rect.height - 4;
    }
    if (left < margin) left = margin;
    if (top < margin) top = margin;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function positionMenu(menu, x, y) {
    menu.hidden = false;
    menu.style.left = '0px';
    menu.style.top = '0px';

    const rect = menu.getBoundingClientRect();
    const margin = 8;
    let left = x;
    let top = y;

    if (left + rect.width > window.innerWidth - margin) {
      left = window.innerWidth - rect.width - margin;
    }
    if (top + rect.height > window.innerHeight - margin) {
      top = window.innerHeight - rect.height - margin;
    }
    if (left < margin) left = margin;
    if (top < margin) top = margin;

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;
  }

  function renderItems(items) {
    return items.map((item) => {
      if (item.separator) {
        return '<div class="context-menu-separator" role="separator"></div>';
      }

      const disabled = item.disabled ? ' disabled' : '';
      const danger = item.danger ? ' context-menu-option-danger' : '';
      const shortcut = item.shortcut
        ? `<span class="context-menu-shortcut">${escapeHtml(item.shortcut)}</span>`
        : '';

      return `
        <button
          type="button"
          class="context-menu-option${danger}"
          role="menuitem"
          data-action="${item.action}"
          ${item.disabled ? 'disabled' : ''}
        >
          <span class="context-menu-label">${escapeHtml(item.label)}</span>
          ${shortcut}
        </button>
      `;
    }).join('');
  }

  function showFromButton(event, items, onAction) {
    event.preventDefault();
    event.stopPropagation();

    if (typeof TitlebarMenu !== 'undefined') TitlebarMenu.closeAllMenus();
    if (typeof closeAllModelDropdowns === 'function') closeAllModelDropdowns(true);
    if (typeof closeWelcomeProjectDropdown === 'function') closeWelcomeProjectDropdown(true);

    const menu = ensureMenu();
    menu.innerHTML = renderItems(items);
    open = true;

    menu.querySelectorAll('.context-menu-option').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        close();
        onAction?.(action);
      });
    });

    positionMenuFromAnchor(menu, event.currentTarget);

    const first = menu.querySelector('.context-menu-option:not([disabled])');
    first?.focus();
  }

  function show(event, items, onAction) {
    event.preventDefault();
    event.stopPropagation();

    if (typeof TitlebarMenu !== 'undefined') TitlebarMenu.closeAllMenus();
    if (typeof closeAllModelDropdowns === 'function') closeAllModelDropdowns(true);
    if (typeof closeWelcomeProjectDropdown === 'function') closeWelcomeProjectDropdown(true);

    const menu = ensureMenu();
    menu.innerHTML = renderItems(items);
    open = true;

    menu.querySelectorAll('.context-menu-option').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btn.dataset.action;
        close();
        onAction?.(action);
      });
    });

    positionMenu(menu, event.clientX, event.clientY);

    const first = menu.querySelector('.context-menu-option:not([disabled])');
    first?.focus();
  }

  function getHeaderChatMenuItems(chat) {
    return [
      { label: 'Rename', action: 'rename-chat' },
      { label: 'Export chat…', action: 'export-chat' },
      { separator: true },
      { label: 'New chat', action: 'new-chat', shortcut: 'Ctrl+N' },
      { separator: true },
      {
        label: chat.running ? 'Delete chat (running)' : 'Delete chat',
        action: 'delete-chat',
        danger: true,
      },
      {
        label: 'Remove project',
        action: 'delete-project',
        danger: true,
      },
    ];
  }

  function getProjectMenuItems(project) {
    return [
      { label: 'New chat', action: 'new-chat', shortcut: 'Ctrl+N' },
      { separator: true },
      {
        label: 'Remove project',
        action: 'delete-project',
        danger: true,
      },
    ];
  }

  function getChatMenuItems(chat) {
    const items = [
      { label: 'Rename', action: 'rename-chat' },
      { separator: true },
      {
        label: chat.running ? 'Delete chat (running)' : 'Delete chat',
        action: 'delete-chat',
        danger: true,
      },
    ];
    return items;
  }

  function sanitizeExportFilename(title) {
    const base = (title || 'chat').trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 80);
    return base || 'chat';
  }

  function buildChatExportPayload(chatId) {
    const chat = findChatById(chatId);
    const project = findChatProject(chatId);
    if (!chat) return null;

    const messages = typeof serializeMessagesForPersistence === 'function'
      ? serializeMessagesForPersistence(chatId, state.chatMessages[chatId] || [])
      : (state.chatMessages[chatId] || []);

    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      chat: {
        id: chat.id,
        title: chat.title,
        model: chat.model || null,
        createdAt: chat.createdAt || null,
        sessionId: chat.sessionId || null,
      },
      project: project
        ? { id: project.id, name: project.name, folderPath: project.folderPath || null }
        : null,
      messages,
    };
  }

  function messageTextForExport(msg) {
    if (msg.role === 'user') {
      if (typeof getUserMessageModelContent === 'function') {
        return getUserMessageModelContent(msg);
      }
      return msg.content?.trim() || '';
    }
    return msg.content?.trim() || '';
  }

  function appendToolCallsToExport(lines, toolCalls) {
    for (const tc of toolCalls || []) {
      const name = tc.name || tc.tool || 'tool';
      lines.push(`[Tool: ${name}]`);
      if (tc.args && Object.keys(tc.args).length) {
        lines.push(JSON.stringify(tc.args, null, 2));
      }
      if (tc.result) {
        lines.push(String(tc.result));
      }
      lines.push('');
    }
  }

  function buildChatExportText(chatId) {
    const chat = findChatById(chatId);
    const project = findChatProject(chatId);
    if (!chat) return '';

    const messages = state.chatMessages[chatId] || [];
    const lines = [
      `Chat: ${chat.title}`,
      project ? `Project: ${project.name}` : null,
      project?.folderPath ? `Folder: ${project.folderPath}` : null,
      `Exported: ${new Date().toLocaleString()}`,
      '',
      '---',
      '',
    ].filter(Boolean);

    for (const msg of messages) {
      if (typeof shouldSkipMessageRender === 'function' && shouldSkipMessageRender(msg)) continue;

      const roleLabel = msg.role === 'user' ? 'User' : 'Assistant';

      if (msg.segments?.length) {
        for (const seg of msg.segments) {
          if (seg.type === 'content' && seg.text?.trim()) {
            lines.push(`${roleLabel}:`);
            lines.push(seg.text.trim());
            lines.push('');
          } else if (seg.type === 'tools') {
            appendToolCallsToExport(lines, seg.toolCalls);
          }
        }
      } else {
        const text = messageTextForExport(msg);
        if (text) {
          lines.push(`${roleLabel}:`);
          lines.push(text);
          lines.push('');
        }
        if (msg.toolCalls?.length) {
          appendToolCallsToExport(lines, msg.toolCalls);
        }
      }
    }

    return lines.join('\n').trimEnd() + '\n';
  }

  function downloadExportFallback(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function saveExportedChat(chatId, format) {
    const chat = findChatById(chatId);
    if (!chat) return;

    const baseName = sanitizeExportFilename(chat.title);
    const isJson = format === 'json';
    const defaultFilename = `${baseName}.${isJson ? 'json' : 'txt'}`;
    const content = isJson
      ? JSON.stringify(buildChatExportPayload(chatId), null, 2)
      : buildChatExportText(chatId);
    const mimeType = isJson ? 'application/json' : 'text/plain';

    if (window.electronAPI?.saveFileDialog && window.electronAPI?.writeTextFile) {
      const filePath = await window.electronAPI.saveFileDialog({
        title: 'Export chat',
        defaultPath: defaultFilename,
        filters: isJson
          ? [{ name: 'JSON', extensions: ['json'] }]
          : [{ name: 'Plain text', extensions: ['txt'] }],
      });
      if (!filePath) return;
      await window.electronAPI.writeTextFile({ filePath, content });
      if (typeof showToast === 'function') showToast(`Exported to ${filePath.split(/[/\\]/).pop()}`);
      return;
    }

    downloadExportFallback(defaultFilename, content, mimeType);
    if (typeof showToast === 'function') showToast(`Downloaded ${defaultFilename}`);
  }

  function showExportDialog(chatId) {
    close();
    closeConfirm();

    confirmOverlay = document.createElement('div');
    confirmOverlay.className = 'confirm-overlay';
    confirmOverlay.innerHTML = `
      <div class="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="exportDialogTitle">
        <h2 class="confirm-title" id="exportDialogTitle">Export chat</h2>
        <p class="confirm-message">Choose a format, then pick where to save the file.</p>
        <div class="export-format-options">
          <label class="export-format-option">
            <input type="radio" name="exportFormat" value="json" checked />
            <span>JSON — full chat data</span>
          </label>
          <label class="export-format-option">
            <input type="radio" name="exportFormat" value="txt" />
            <span>Plain text — readable transcript</span>
          </label>
        </div>
        <div class="confirm-actions">
          <button type="button" class="confirm-btn confirm-btn-cancel" data-action="cancel">Cancel</button>
          <button type="button" class="confirm-btn confirm-btn-primary" data-action="confirm">Export…</button>
        </div>
      </div>
    `;

    confirmOverlay.addEventListener('click', (e) => {
      if (e.target === confirmOverlay) closeConfirm();
    });

    const cancelBtn = confirmOverlay.querySelector('[data-action="cancel"]');
    const confirmBtn = confirmOverlay.querySelector('[data-action="confirm"]');

    const submit = () => {
      const selected = confirmOverlay.querySelector('input[name="exportFormat"]:checked')?.value || 'json';
      closeConfirm();
      void saveExportedChat(chatId, selected);
    };

    cancelBtn.addEventListener('click', () => closeConfirm());
    confirmBtn.addEventListener('click', submit);

    document.body.appendChild(confirmOverlay);
    document.addEventListener('keydown', confirmKeyHandler);

    const panel = confirmOverlay.querySelector('.confirm-modal');
    if (typeof Physics !== 'undefined') {
      Physics.modalIn(confirmOverlay, panel);
    }
    confirmBtn.focus();
  }

  function handleProjectAction(action, projectId) {
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return;

    switch (action) {
      case 'new-chat':
        state.selectedProjectId = projectId;
        state.expandedProjects.add(projectId);
        showWelcomeScreen();
        focusInput(dom.welcomeInput);
        break;
      case 'delete-project': {
        const chatCount = project.chats?.length || 0;
        const chatNote = chatCount === 1
          ? '1 chat'
          : `${chatCount} chats`;
        showConfirmDialog({
          title: 'Remove project?',
          message: chatCount
            ? `"${project.name}" and its ${chatNote} will be permanently deleted.`
            : `"${project.name}" will be removed from the sidebar.`,
          confirmLabel: 'Remove',
          onConfirm: () => void deleteProject(projectId),
        });
        break;
      }
      default:
        break;
    }
  }

  function handleChatAction(action, chatId, projectId) {
    const chat = findChatById(chatId);
    const project = state.projects.find((p) => p.id === projectId);
    if (!chat || !project) return;

    switch (action) {
      case 'rename-chat':
        showPromptDialog({
          title: 'Rename chat',
          value: chat.title,
          confirmLabel: 'Rename',
          onConfirm: (title) => renameChat(chatId, title),
        });
        break;
      case 'delete-chat':
        showConfirmDialog({
          title: 'Delete chat?',
          message: chat.running
            ? `"${chat.title}" is still running. It will be stopped and permanently deleted.`
            : `"${chat.title}" will be permanently deleted.`,
          confirmLabel: 'Delete',
          onConfirm: () => void deleteChat(chatId),
        });
        break;
      case 'export-chat':
        showExportDialog(chatId);
        break;
      default:
        break;
    }
  }

  function handleHeaderChatAction(action, chatId, projectId) {
    if (action === 'export-chat') {
      showExportDialog(chatId);
      return;
    }
    if (action === 'new-chat' || action === 'delete-project') {
      handleProjectAction(action, projectId);
      return;
    }
    handleChatAction(action, chatId, projectId);
  }

  function bindHeaderMenu() {
    if (headerBound || !dom?.chatMoreBtn) return;
    headerBound = true;

    dom.chatMoreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const chatId = state.selectedChatId;
      if (!chatId) return;

      const chat = findChatById(chatId);
      const project = findChatProject(chatId);
      if (!chat || !project) return;

      if (open) {
        close();
        return;
      }

      dom.chatMoreBtn.setAttribute('aria-expanded', 'true');
      showFromButton(e, getHeaderChatMenuItems(chat), (action) => {
        handleHeaderChatAction(action, chatId, project.id);
      });
    });
  }

  function bind() {
    bindHeaderMenu();
    if (bound || !dom?.sidebar) return;
    bound = true;

    dom.sidebar.addEventListener('contextmenu', (e) => {
      const chatItem = e.target.closest('.chat-item');
      if (chatItem) {
        const { chatId, projectId } = chatItem.dataset;
        if (!chatId || !projectId) return;
        show(e, getChatMenuItems(findChatById(chatId)), (action) => {
          handleChatAction(action, chatId, projectId);
        });
        return;
      }

      const projectHeader = e.target.closest('.project-header');
      if (projectHeader) {
        const group = projectHeader.closest('.project-group');
        const projectId = group?.dataset.projectId;
        if (!projectId) return;
        const project = state.projects.find((p) => p.id === projectId);
        if (!project) return;
        show(e, getProjectMenuItems(project), (action) => {
          handleProjectAction(action, projectId);
        });
      }
    });

    document.addEventListener('pointerdown', (e) => {
      if (!open) return;
      if (menuEl?.contains(e.target)) return;
      if (dom.chatMoreBtn?.contains(e.target)) return;
      close();
    });

    document.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('blur', close);
  }

  return {
    bind,
    close,
    closeConfirm,
    showConfirmDialog,
    showPromptDialog,
  };
})();
