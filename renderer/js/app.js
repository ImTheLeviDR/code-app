/* ============================================================
   CODE APP - Main Application Logic
   ============================================================ */

'use strict';

/* ---- State ---- */
const state = {
  projects: PROJECTS,
  selectedProjectId: 'assistant',
  selectedChatId: null,
  expandedProjects: new Set(['llexa', 'assistant']),
  chatMessages: { ...CHAT_MESSAGES },   // chatId -> Message[]
  nextMsgId: 1000,
  isGenerating: false,
  userHasScrolledUp: false,
  selectedModelId: MODELS[0].id,
};

let modelDropdowns = [];
let openModelDropdown = null;
let modelDropdownClickBound = false;

/* ---- DOM refs ---- */
const $ = (id) => document.getElementById(id);
const dom = {
  appBody:          $('appBody'),
  sidebar:          $('sidebar'),
  projectsList:     $('projectsList'),
  welcomeScreen:    $('welcomeScreen'),
  chatScreen:       $('chatScreen'),
  settingsScreen:   $('settingsScreen'),
  welcomeInput:     $('welcomeInput'),
  welcomeSendBtn:   $('welcomeSendBtn'),
  welcomeTitle:     $('welcomeTitle'),
  welcomeSubtitle:  $('welcomeSubtitle'),
  chatInput:        $('chatInput'),
  chatSendBtn:      $('chatSendBtn'),
  chatTitle:        $('chatTitle'),
  messagesList:     $('messagesList'),
  scrollToBottom:   $('scrollToBottom'),
  minimizeBtn:      $('minimizeBtn'),
  maximizeBtn:      $('maximizeBtn'),
  closeBtn:         $('closeBtn'),
  titlebarLogoWrap:   $('titlebarLogoWrap'),
  titlebarDragRegion: $('titlebarDragRegion'),
};

/* ============================================================
   INIT
   ============================================================ */

function init() {
  Physics.init();
  state.projects.forEach((project) => {
    if (project.chats.some((chat) => chat.running)) {
      state.expandedProjects.add(project.id);
    }
  });
  renderSidebar();
  initModelDropdowns();
  window.addEventListener('settings-changed', refreshModelDropdowns);
  showWelcomeScreen({ animateWelcome: true });
  bindEvents();
  setupWindowControls();
  animateWelcomeInputPlaceholders();
}

/* ============================================================
   MODEL DROPDOWN
   ============================================================ */

function getAvailableModels() {
  return SettingsStore.getChatModels();
}

function getModelLabel(modelId) {
  return getAvailableModels().find((m) => m.id === modelId)?.label ?? modelId;
}

function closeAllModelDropdowns(instant = false) {
  modelDropdowns.forEach((dropdown) => dropdown.close(instant));
  openModelDropdown = null;
}

function setSelectedModel(modelId) {
  state.selectedModelId = modelId;
  modelDropdowns.forEach((dropdown) => dropdown.syncSelection());
}

function refreshModelDropdowns() {
  const models = getAvailableModels();
  if (!models.some((m) => m.id === state.selectedModelId)) {
    state.selectedModelId = models[0]?.id ?? state.selectedModelId;
  }
  initModelDropdowns();
}

function initModelDropdowns() {
  modelDropdowns = [
    createModelDropdown($('welcomeModelDropdown')),
    createModelDropdown($('chatModelDropdown')),
  ];

  if (!modelDropdownClickBound) {
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.model-dropdown')) {
        closeAllModelDropdowns();
      }
    });
    modelDropdownClickBound = true;
  }
}

function createModelDropdown(container) {
  const chevronSvg = `<svg class="model-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none">
    <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
  const checkSvg = `<svg class="model-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  container.innerHTML = `
    <button class="model-selector-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
      <span class="model-selected-label">${escapeHtml(getModelLabel(state.selectedModelId))}</span>
      ${chevronSvg}
    </button>
    <div class="model-dropdown-menu" role="listbox">
      ${getAvailableModels().map((model) => `
        <button
          class="model-option${model.id === state.selectedModelId ? ' selected' : ''}"
          type="button"
          role="option"
          data-model-id="${model.id}"
          aria-selected="${model.id === state.selectedModelId}"
        >
          <span>${escapeHtml(model.label)}</span>
          ${checkSvg}
        </button>
      `).join('')}
    </div>
  `;

  const trigger = container.querySelector('.model-selector-trigger');
  const menu = container.querySelector('.model-dropdown-menu');
  const labelEl = container.querySelector('.model-selected-label');
  const options = Array.from(container.querySelectorAll('.model-option'));

  menu.style.visibility = 'hidden';

  function close(instant = false) {
    if (!container.classList.contains('open')) return;

    const finish = () => {
      container.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      menu.style.visibility = 'hidden';
      if (openModelDropdown === api) openModelDropdown = null;
    };

    if (instant) {
      finish();
      return;
    }

    Physics.animate(menu, { opacity: 0, y: 6, scale: 0.97 }, {
      preset: 'stiff',
      onComplete: finish,
    });
  }

  function open() {
    if (typeof TitlebarMenu !== 'undefined') TitlebarMenu.closeAllMenus();
    closeAllModelDropdowns(true);
    container.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    openModelDropdown = api;
    menu.style.visibility = 'visible';
    Physics.animate(menu, { opacity: 1, y: 0, scale: 1 }, {
      from: { opacity: 0, y: 6, scale: 0.97 },
      preset: 'snappy',
    });
    const selected = options.find((opt) => opt.classList.contains('selected'));
    (selected || options[0])?.focus();
  }

  function syncSelection() {
    labelEl.textContent = getModelLabel(state.selectedModelId);
    options.forEach((opt) => {
      const isSelected = opt.dataset.modelId === state.selectedModelId;
      opt.classList.toggle('selected', isSelected);
      opt.setAttribute('aria-selected', String(isSelected));
    });
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (container.classList.contains('open')) {
      close();
    } else {
      open();
    }
  });

  options.forEach((opt, idx) => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      setSelectedModel(opt.dataset.modelId);
      close();
    });

    opt.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        options[(idx + 1) % options.length].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        options[(idx - 1 + options.length) % options.length].focus();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setSelectedModel(opt.dataset.modelId);
        close();
        trigger.focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
        trigger.focus();
      }
    });
  });

  const api = { close, syncSelection };
  return api;
}

/* ============================================================
   WINDOW CONTROLS
   ============================================================ */

const MAXIMIZE_ICON = '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><rect width="9" height="9" x=".5" y=".5" fill="none" stroke="currentColor"/></svg>';
const RESTORE_ICON = '<svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 1.5h5v5h-5v-5zm.5.5v4h4v-4H4zM1.5 3.5h5v5h-5v-5zm.5.5v4h4v-4H2z" fill="none" stroke="currentColor" stroke-width=".9"/></svg>';

function updateMaximizeButton(isMaximized) {
  dom.maximizeBtn.innerHTML = isMaximized ? RESTORE_ICON : MAXIMIZE_ICON;
  dom.maximizeBtn.title = isMaximized ? 'Restore down' : 'Maximize';
  dom.maximizeBtn.setAttribute('aria-label', isMaximized ? 'Restore down' : 'Maximize');
  dom.maximizeBtn.classList.toggle('is-maximized', isMaximized);
}

function setupWindowControls() {
  const toggleMaximize = () => {
    if (window.electronAPI) window.electronAPI.maximize();
  };

  dom.titlebarLogoWrap?.addEventListener('click', () => {
    toggleSidebar();
  });

  dom.titlebarDragRegion?.addEventListener('dblclick', toggleMaximize);

  if (!window.electronAPI) return;

  dom.minimizeBtn.addEventListener('click', () => window.electronAPI.minimize());
  dom.maximizeBtn.addEventListener('click', toggleMaximize);
  dom.closeBtn.addEventListener('click', () => window.electronAPI.close());
  window.electronAPI.onWindowState((state) => {
    updateMaximizeButton(state === 'maximized');
  });
}

/* ============================================================
   SIDEBAR RENDERING
   ============================================================ */

function renderSidebar() {
  dom.projectsList.innerHTML = '';

  state.projects.forEach((project) => {
    const group = document.createElement('div');
    group.className = 'project-group';
    group.dataset.projectId = project.id;

    const isExpanded = state.expandedProjects.has(project.id);
    const isSelected = project.id === state.selectedProjectId;

    // Project header
    const header = document.createElement('div');
    header.className = `project-header${isExpanded ? ' expanded' : ''}${isSelected ? ' selected' : ''}`;
    header.innerHTML = `
      <div class="project-expand-icon">
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
          <path d="M2 1l4 3-4 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="project-icon" style="background: linear-gradient(135deg, ${project.color}cc, ${project.color})">
        ${project.name[0].toUpperCase()}
      </div>
      <span class="project-name">${project.name}</span>
    `;

    header.addEventListener('click', () => toggleProject(project.id));

    // Chats list
    const chatsDiv = document.createElement('div');
    chatsDiv.className = `project-chats ${isExpanded ? 'expanded' : 'collapsed'}`;
    chatsDiv.id = `chats-${project.id}`;

    const visibleChats = project.chats.slice(0, 5);
    const hiddenCount = project.chats.length - visibleChats.length;

    visibleChats.forEach((chat) => {
      const chatItem = createChatItem(chat, project.id);
      chatsDiv.appendChild(chatItem);
    });

    if (hiddenCount > 0) {
      const showMore = document.createElement('button');
      showMore.className = 'show-more-btn';
      showMore.textContent = `Show ${hiddenCount} more`;
      showMore.addEventListener('click', (e) => {
        e.stopPropagation();
        // TODO: expand
      });
      chatsDiv.appendChild(showMore);
    }

    group.appendChild(header);
    group.appendChild(chatsDiv);
    dom.projectsList.appendChild(group);
  });
}

function findChatById(chatId) {
  for (const project of state.projects) {
    const chat = project.chats.find((c) => c.id === chatId);
    if (chat) return chat;
  }
  return null;
}

function renderChatItemContent(chat) {
  const isRunning = !!chat.running;

  return `
    <span class="chat-item-title">${escapeHtml(chat.title)}</span>
    ${isRunning
      ? '<span class="chat-item-spinner" aria-label="Running"></span>'
      : `<span class="chat-item-time">${chat.time}</span>`}
  `;
}

function syncChatItem(chatId) {
  const chat = findChatById(chatId);
  const el = document.querySelector(`.chat-item[data-chat-id="${chatId}"]`);
  if (!chat || !el) return;

  el.classList.toggle('running', !!chat.running);
  el.innerHTML = renderChatItemContent(chat);
}

function setChatRunning(chatId, running) {
  const chat = findChatById(chatId);
  if (!chat) return;

  chat.running = running;
  syncChatItem(chatId);
}

function createChatItem(chat, projectId) {
  const item = document.createElement('div');
  item.className = `chat-item${chat.id === state.selectedChatId ? ' active' : ''}${chat.running ? ' running' : ''}`;
  item.dataset.chatId = chat.id;
  item.dataset.projectId = projectId;

  item.innerHTML = renderChatItemContent(chat);

  item.addEventListener('click', () => openChat(chat.id, chat.title, projectId));
  return item;
}

function toggleProject(projectId) {
  const isExpanded = state.expandedProjects.has(projectId);
  const chatsEl = document.getElementById(`chats-${projectId}`);
  const header = document.querySelector(`[data-project-id="${projectId}"] .project-header`);
  const chevron = header?.querySelector('.project-expand-icon');

  if (isExpanded) {
    state.expandedProjects.delete(projectId);
    Physics.rotate(chevron, 0);
    Physics.expandVertical(chatsEl, false, () => {
      chatsEl.classList.remove('expanded');
      chatsEl.classList.add('collapsed');
      header.classList.remove('expanded');
    });
  } else {
    state.expandedProjects.add(projectId);
    chatsEl.classList.remove('collapsed');
    chatsEl.classList.add('expanded');
    header.classList.add('expanded');
    Physics.rotate(chevron, 90);
    Physics.expandVertical(chatsEl, true);
  }

  state.selectedProjectId = projectId;
  updateProjectSelection();
}

function updateProjectSelection() {
  updateNavActive();

  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  if (project) {
    dom.welcomeTitle.textContent = `What should we work on in ${project.name}?`;
  }
}

/* ============================================================
   SCREEN SWITCHING
   ============================================================ */

function hideAllScreens() {
  dom.welcomeScreen.style.display = 'none';
  dom.chatScreen.style.display = 'none';
  dom.settingsScreen.style.display = 'none';
}

function showSettingsScreen() {
  hideAllScreens();
  dom.settingsScreen.style.display = 'flex';
  dom.appBody.classList.add('settings-open');
  updateNavActive();
}

function hideSettingsScreen() {
  dom.settingsScreen.style.display = 'none';
  dom.appBody.classList.remove('settings-open');
  const prev = state.selectedChatId ? dom.chatScreen : dom.welcomeScreen;
  prev.style.display = 'flex';
  updateNavActive();
}

function showWelcomeScreen(options = {}) {
  state.selectedChatId = null;
  updateActiveChat();
  updateNavActive();
  setRandomWelcomeSubtitle();

  dom.settingsScreen.style.display = 'none';
  dom.appBody.classList.remove('settings-open');
  Physics.switchScreens(dom.welcomeScreen, dom.chatScreen);

  if (options.animateWelcome) {
    const content = dom.welcomeScreen.querySelector('.welcome-content');
    Physics.stagger(content, '.welcome-icon, .welcome-title, .welcome-subtitle', {
      opacity: 0,
      y: 14,
      scale: 0.98,
    }, { preset: 'gentle', delay: 50 });
  }

  focusInput(dom.welcomeInput);
}

function showChatScreen(chatId, chatTitle, projectId) {
  dom.chatTitle.textContent = chatTitle;
  updateNavActive();
  dom.settingsScreen.style.display = 'none';
  dom.appBody.classList.remove('settings-open');
  Physics.switchScreens(dom.chatScreen, dom.welcomeScreen);

  renderMessages(chatId);
  scrollToEnd(true);
  setTimeout(() => focusInput(dom.chatInput), 50);
}

function openChat(chatId, chatTitle, projectId) {
  state.selectedChatId = chatId;
  state.selectedProjectId = projectId;
  updateActiveChat();
  updateProjectSelection();
  showChatScreen(chatId, chatTitle, projectId);
}

function updateActiveChat() {
  document.querySelectorAll('.chat-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.chatId === state.selectedChatId);
  });
}

function updateNavActive() {
  const onWelcome = state.selectedChatId === null;
  const onSettings = SettingsStore.getIsOpen();
  const onChat = state.selectedChatId !== null;

  document.querySelectorAll('.sidebar-nav .nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.action === 'new-chat' && onWelcome && !onSettings);
  });

  document.querySelectorAll('.project-header').forEach((header) => {
    header.classList.toggle('selected', onChat && header.closest('.project-group')?.dataset.projectId === state.selectedProjectId);
  });

  const settingsBtn = document.querySelector('.footer-btn[data-action="settings"]');
  if (settingsBtn) settingsBtn.classList.toggle('active', onSettings);
}

/* ============================================================
   MESSAGE RENDERING
   ============================================================ */

function renderMessages(chatId) {
  dom.messagesList.innerHTML = '';
  const messages = state.chatMessages[chatId] || [];
  messages.forEach((msg) => renderMessage(msg, false));
  scrollToEnd(true);
}

function renderMessage(msg, animate = true) {
  const el = document.createElement('div');
  el.className = `message ${msg.role}`;
  el.id = `msg-${msg.id}`;

  if (msg.role === 'user') {
    el.innerHTML = `
      <div class="message-wrapper">
        <div class="user-bubble">${escapeHtml(msg.content)}</div>
      </div>
    `;
  } else {
    el.innerHTML = `
      <div class="message-wrapper">
        ${assistantAvatarHTML()}
        <div class="assistant-body">
          <div class="assistant-meta">
            ${msg.toolCalls && msg.toolCalls.length ? renderToolCallsHTML(msg.toolCalls, msg.id) : ''}
          </div>
          <div class="md-content" id="content-${msg.id}">${msg.content ? parseMarkdown(msg.content) : ''}</div>
          ${msg.content ? renderMessageActionsHTML() : ''}
        </div>
      </div>
    `;
  }

  dom.messagesList.appendChild(el);
  if (animate) Physics.messageIn(el);
  return el;
}

function assistantAvatarHTML() {
  return `
    <div class="assistant-avatar">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
  `;
}

function getToolActivityLabel(tc) {
  const { name, args = {} } = tc;
  const basename = getFileBasename(args.path);

  switch (name) {
    case 'read_file':
      return basename ? `Reading ${basename}...` : 'Reading file...';
    case 'search_codebase':
      return args.query
        ? `Searching "${args.query}" in codebase...`
        : 'Searching codebase...';
    case 'write_file':
      return basename ? `Writing ${basename}...` : 'Writing file...';
    case 'create_file':
      return basename ? `Creating ${basename}...` : 'Creating file...';
    case 'edit_file':
      return basename ? `Editing ${basename}...` : 'Editing file...';
    case 'run_terminal_cmd':
      return args.command
        ? `Running ${args.command.length > 36 ? args.command.slice(0, 36) + '…' : args.command}...`
        : 'Running command...';
    case 'search_files':
      return args.pattern
        ? `Searching for "${args.pattern}"...`
        : 'Searching files...';
    case 'list_directory':
      return args.path ? `Listing ${args.path}...` : 'Listing directory...';
    default:
      return `${name.replace(/_/g, ' ')}...`;
  }
}

function getToolActivityLabelDone(tc) {
  const { name, args = {} } = tc;
  const basename = getFileBasename(args.path);

  switch (name) {
    case 'read_file':
      return basename ? `Read ${basename}` : 'Read file';
    case 'search_codebase':
      return args.query
        ? `Searched "${args.query}" in codebase`
        : 'Searched codebase';
    case 'write_file':
      return basename ? `Wrote ${basename}` : 'Wrote file';
    case 'create_file':
      return basename ? `Created ${basename}` : 'Created file';
    case 'edit_file':
      return basename ? `Edited ${basename}` : 'Edited file';
    case 'run_terminal_cmd':
      return args.command
        ? `Ran ${args.command.length > 36 ? args.command.slice(0, 36) + '…' : args.command}`
        : 'Ran command';
    case 'search_files':
      return args.pattern
        ? `Searched for "${args.pattern}"`
        : 'Searched files';
    case 'list_directory':
      return args.path ? `Listed ${args.path}` : 'Listed directory';
    default:
      return name.replace(/_/g, ' ');
  }
}

function getFileBasename(path) {
  return path ? String(path).split(/[/\\]/).pop() : '';
}

function isFileMutationTool(name) {
  return name === 'edit_file' || name === 'write_file' || name === 'create_file';
}

function getToolLineStats(tc) {
  const adds = tc.additions ?? tc.args?.additions ?? 0;
  const dels = tc.deletions ?? tc.args?.deletions ?? 0;
  return { adds, dels };
}

function renderFileMutationLineHTML(tc) {
  const file = getFileBasename(tc.args?.path);
  const verb = { edit_file: 'Edited', write_file: 'Wrote', create_file: 'Created' }[tc.name] || 'Edited';
  const { adds, dels } = getToolLineStats(tc);
  let stats = '';
  if (adds > 0) stats += `<span class="tool-edit-stat tool-edit-stat-add">+${adds}</span>`;
  if (dels > 0) stats += `<span class="tool-edit-stat tool-edit-stat-del">-${dels}</span>`;
  const statsHtml = stats ? ` <span class="tool-edit-stats">${stats}</span>` : '';
  return `<span class="tool-activity-verb">${verb}</span><span class="tool-activity-file">${escapeHtml(file)}</span>${statsHtml}`;
}

function renderToolActivityLineHTML(tc, running = false) {
  const runClass = running ? ' running' : ' done';
  const idAttr = tc.id ? ` id="tc-${tc.id}"` : '';

  if (!running && isFileMutationTool(tc.name)) {
    return `<div class="tool-activity-line done tool-file-edit-line"${idAttr}>${renderFileMutationLineHTML(tc)}</div>`;
  }

  const label = running ? getToolActivityLabel(tc) : getToolActivityLabelDone(tc);
  return `<div class="tool-activity-line${runClass}"${idAttr}><span class="tool-activity-text">${escapeHtml(label)}</span></div>`;
}

function renderToolCallsHTML(toolCalls, msgId) {
  if (!toolCalls?.length) return '';
  const allComplete = toolCalls.every((tc) => (tc.status || 'complete') === 'complete');
  if (!allComplete) return '<div class="tool-activity"></div>';
  return `<div class="tool-activity">${toolCalls.map((tc) => renderToolActivityLineHTML(tc, false)).join('')}</div>`;
}

function getActiveToolMeta(body) {
  if (!body) return null;
  const contentEl = body.querySelector('.md-content:not(.md-content-segment)');
  if (contentEl) {
    let sibling = contentEl.previousElementSibling;
    while (sibling) {
      if (sibling.classList.contains('assistant-meta')) return sibling;
      sibling = sibling.previousElementSibling;
    }
  }
  const metas = body.querySelectorAll('.assistant-meta');
  return metas[metas.length - 1] || null;
}

function getToolActivityContainer(msgId) {
  const msgEl = document.getElementById(`msg-${msgId}`);
  if (!msgEl) return null;

  const body = msgEl.querySelector('.assistant-body');
  if (!body) return null;

  let meta = getActiveToolMeta(body);
  if (!meta) {
    meta = document.createElement('div');
    meta.className = 'assistant-meta';
    const content = body.querySelector('.md-content');
    if (content) body.insertBefore(meta, content);
    else body.prepend(meta);
  }

  let container = meta.querySelector('.tool-activity');
  if (!container) {
    container = document.createElement('div');
    container.className = 'tool-activity';
    meta.appendChild(container);
  }
  return container;
}

function showToolActivityLine(tc, msgId) {
  const container = getToolActivityContainer(msgId);
  if (!container) return;

  container.querySelectorAll('.tool-activity-line.running').forEach((el) => el.remove());

  const line = document.createElement('div');
  line.className = 'tool-activity-line running';
  line.id = `tc-${tc.id}`;
  line.innerHTML = `<span class="tool-activity-text">${escapeHtml(getToolActivityLabel(tc))}</span>`;
  container.appendChild(line);
}

function completeToolActivityLine(tcId, msgId) {
  const line = document.getElementById(`tc-${tcId}`);
  if (!line) return;

  const tc = findToolCallById(tcId);
  line.classList.remove('running');
  line.classList.add('done');
  if (!tc) return;

  if (isFileMutationTool(tc.name)) {
    line.classList.add('tool-file-edit-line');
    line.innerHTML = renderFileMutationLineHTML(tc);
  } else {
    line.classList.remove('tool-file-edit-line');
    line.innerHTML = `<span class="tool-activity-text">${escapeHtml(getToolActivityLabelDone(tc))}</span>`;
  }
}

function renderMessageActionsHTML() {
  return `
    <div class="message-actions">
      <button class="msg-action-btn" onclick="copyMessageContent(this)">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
          <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
          <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/>
        </svg>
        Copy
      </button>
      <button class="msg-action-btn" onclick="regenerateResponse(this)">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
          <path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        Regenerate
      </button>
    </div>
  `;
}

/* ============================================================
   SEND MESSAGE + AI SIMULATION
   ============================================================ */

function sendMessage(text) {
  if (!text.trim() || state.isGenerating) return;

  let newChatFromWelcome = false;

  // If on welcome screen, create a new chat
  if (!state.selectedChatId) {
    newChatFromWelcome = true;
    const project = state.projects.find((p) => p.id === state.selectedProjectId) || state.projects[0];
    const newChatId = `new-${Date.now()}`;
    const newChat = {
      id: newChatId,
      title: text.length > 40 ? text.slice(0, 40) + '...' : text,
      time: 'now',
    };
    project.chats.unshift(newChat);
    state.chatMessages[newChatId] = [];
    state.selectedChatId = newChatId;

    // Re-render sidebar to show new chat
    if (!state.expandedProjects.has(project.id)) {
      state.expandedProjects.add(project.id);
    }
    renderSidebar();
    showChatScreen(newChatId, newChat.title, project.id);
  }

  const chatId = state.selectedChatId;
  if (!state.chatMessages[chatId]) state.chatMessages[chatId] = [];

  // Add user message
  const userMsg = {
    id: `msg-${state.nextMsgId++}`,
    role: 'user',
    content: text.trim(),
  };
  state.chatMessages[chatId].push(userMsg);
  renderMessage(userMsg, !newChatFromWelcome);

  // Animate send button
  Physics.pulse(newChatFromWelcome ? dom.welcomeSendBtn : dom.chatSendBtn);

  scrollToEnd(false);
  state.isGenerating = true;
  disableSend(true);
  setChatRunning(chatId, true);

  simulateAIResponse(chatId, text.trim());
}

function simulateAIResponse(chatId, userMessage) {
  const template = getAITemplate(userMessage);
  const phases = normalizeResponsePhases(template);
  const startsWithTools = phases[0]?.type === 'tools';

  const assistantMsgId = `msg-${state.nextMsgId++}`;
  const assistantMsg = {
    id: assistantMsgId,
    role: 'assistant',
    toolCalls: startsWithTools ? mapToolCalls(phases[0].toolCalls, 0) : [],
    content: '',
  };
  state.chatMessages[chatId].push(assistantMsg);

  // Show thinking indicator first
  const thinkingEl = createThinkingIndicator();
  dom.messagesList.appendChild(thinkingEl);
  scrollToEnd(false);

  setTimeout(() => {
    thinkingEl.remove();

    const msgEl = renderMessage(assistantMsg, false);
    runResponsePhases(phases, assistantMsgId, chatId, msgEl, () => {
      state.isGenerating = false;
      disableSend(false);
      setChatRunning(chatId, false);
      focusInput(dom.chatInput);
    });
  }, 600);
}

function normalizeResponsePhases(template) {
  if (template.phases?.length) {
    return template.phases.map((phase) => {
      if (phase.type === 'tools') {
        return { type: 'tools', toolCalls: phase.toolCalls || [] };
      }
      return { type: 'stream', text: phase.text || '', append: Boolean(phase.append) };
    });
  }

  const phases = [];
  if (template.textBefore) {
    phases.push({ type: 'stream', text: template.textBefore });
  }
  if (template.toolCalls?.length) {
    phases.push({ type: 'tools', toolCalls: template.toolCalls });
  }
  if (template.text) {
    phases.push({
      type: 'stream',
      text: template.text,
      append: Boolean(template.textBefore),
    });
  }
  return phases;
}

function mapToolCalls(toolCalls, phaseKey = 0) {
  const stamp = Date.now();
  return toolCalls.map((tc, i) => ({
    id: `tc-${stamp}-${phaseKey}-${i}`,
    name: tc.name,
    args: tc.args || {},
    additions: tc.additions,
    deletions: tc.deletions,
    result: null,
    status: 'pending',
    duration: tc.duration,
  }));
}

function runResponsePhases(phases, msgId, chatId, msgEl, onDone) {
  let phaseIdx = 0;

  function runNextPhase() {
    if (phaseIdx >= phases.length) {
      onDone();
      return;
    }

    const phase = phases[phaseIdx++];
    if (phase.type === 'stream') {
      const hasMoreStreams = phases.slice(phaseIdx).some((p) => p.type === 'stream');
      streamText(phase.text, msgId, chatId, runNextPhase, {
        append: phase.append,
        showActions: !hasMoreStreams,
      });
    } else {
      startToolsPhase(phase.toolCalls, msgId, chatId, msgEl, phaseIdx - 1, runNextPhase);
    }
  }

  runNextPhase();
}

function startToolsPhase(toolCallsTemplate, msgId, chatId, msgEl, phaseKey, onDone) {
  if (!toolCallsTemplate?.length) {
    onDone();
    return;
  }

  const toolCalls = mapToolCalls(toolCallsTemplate, phaseKey);
  const msg = state.chatMessages[chatId]?.find((m) => m.id === msgId);
  if (msg) msg.toolCalls = toolCalls;

  const body = msgEl.querySelector('.assistant-body');
  const contentEl = document.getElementById(`content-${msgId}`);
  const hasPriorText = Boolean(contentEl?.innerHTML.trim());

  if (hasPriorText) {
    const prior = document.createElement('div');
    prior.className = 'md-content md-content-segment';
    prior.innerHTML = contentEl.innerHTML;
    body.insertBefore(prior, contentEl);
    contentEl.innerHTML = '';
    contentEl.classList.remove('is-streaming');

    const meta = document.createElement('div');
    meta.className = 'assistant-meta';
    meta.innerHTML = renderToolCallsHTML(toolCalls, msgId);
    body.insertBefore(meta, contentEl);
  } else {
    let meta = body.querySelector('.assistant-meta');
    if (!meta) {
      meta = document.createElement('div');
      meta.className = 'assistant-meta';
      body.insertBefore(meta, contentEl);
    }
    meta.innerHTML = renderToolCallsHTML(toolCalls, msgId);
  }

  runToolCallsSequentially(toolCalls, msgEl, msgId, chatId, onDone);
}

function runToolCallsSequentially(toolCalls, msgEl, msgId, chatId, onDone) {
  let idx = 0;

  function runNext() {
    if (idx >= toolCalls.length) {
      onDone();
      return;
    }

    const tc = toolCalls[idx];
    idx++;

    tc.status = 'running';
    updateToolCallUI(tc.id, 'running', msgId);

    setTimeout(() => {
      tc.status = 'complete';
      tc.result = generateToolResult(tc.name, chatId);
      updateToolCallUI(tc.id, 'complete', msgId);
      runNext();
    }, tc.duration);
  }

  runNext();
}

function updateToolCallUI(tcId, status, msgId) {
  const tc = findToolCallById(tcId);
  if (!tc) return;

  if (status === 'running') {
    showToolActivityLine(tc, msgId);
  } else if (status === 'complete') {
    completeToolActivityLine(tcId, msgId);
  }
}

function findToolCallById(tcId) {
  for (const chatId of Object.keys(state.chatMessages)) {
    for (const msg of state.chatMessages[chatId]) {
      const tc = msg.toolCalls?.find((t) => t.id === tcId);
      if (tc) return tc;
    }
  }
  return null;
}

function generateToolResult(toolName, chatId) {
  const results = {
    read_file: 'File contents loaded successfully.\n[245 lines read]',
    write_file: 'File written successfully.',
    create_file: 'File created at path.',
    edit_file: 'Changes applied (3 hunks, +12 -7 lines).',
    search_codebase: 'Found 6 results across 4 files.',
    run_terminal_cmd: '$ npm run build\n✓ Build completed in 2.1s',
    search_files: 'Located 4 matching files.',
    list_directory: 'src/\n  components/\n  hooks/\n  utils/\n  styles/',
  };
  return results[toolName] || 'Completed successfully.';
}

/* ============================================================
   TEXT STREAMING
   ============================================================ */

function streamText(fullText, msgId, chatId, onDone, options = {}) {
  const { append = false, showActions = true } = options;
  const contentEl = document.getElementById(`content-${msgId}`);
  if (!contentEl) { onDone(); return; }

  const msgs = state.chatMessages[chatId];
  const msgInState = msgs?.find((m) => m.id === msgId);

  const body = contentEl.parentElement;
  const hasSegment = Boolean(body?.querySelector('.md-content-segment'));

  let prefix = '';
  let part1Text = '';
  let separator = '';

  if (append && msgInState?.content) {
    if (hasSegment) {
      part1Text = msgInState.content;
      if (part1Text && fullText) {
        separator = part1Text.endsWith('\n') ? '\n' : '\n\n';
      }
    } else {
      prefix = msgInState.content;
      if (prefix && fullText && !prefix.endsWith('\n')) prefix += '\n\n';
    }
  }

  const finalContent = hasSegment && append
    ? part1Text + separator + fullText
    : prefix + fullText;

  let streamBody = contentEl.querySelector('.md-stream-body');
  let cursor = contentEl.querySelector('.streaming-cursor');

  if (!streamBody) {
    contentEl.classList.add('is-streaming');
    contentEl.innerHTML = '';
    const streamWrap = document.createElement('span');
    streamWrap.className = 'md-stream-wrap';
    streamBody = document.createElement('span');
    streamBody.className = 'md-stream-body';
    cursor = document.createElement('span');
    cursor.className = 'streaming-cursor';
    streamWrap.appendChild(streamBody);
    streamWrap.appendChild(cursor);
    contentEl.appendChild(streamWrap);
    if (prefix && !hasSegment) streamBody.innerHTML = parseMarkdown(prefix);
  }

  scrollToEnd(false);

  const words = fullText.split(/(\s+)/);
  let currentText = hasSegment && append ? '' : prefix;
  let wordIdx = 0;
  const baseDelay = 18;

  function finishStream() {
    contentEl.classList.remove('is-streaming');
    if (hasSegment && append) {
      contentEl.innerHTML = parseMarkdown(fullText);
      if (msgInState) msgInState.content = finalContent;
    } else {
      contentEl.innerHTML = parseMarkdown(finalContent);
      if (msgInState) msgInState.content = finalContent;
    }
    if (showActions && !body.querySelector('.message-actions')) {
      const actionsWrapper = document.createElement('div');
      actionsWrapper.innerHTML = renderMessageActionsHTML();
      body.appendChild(actionsWrapper.firstElementChild);
    }
    onDone();
  }

  function addNextChunk() {
    if (wordIdx >= words.length) {
      finishStream();
      return;
    }

    const chunkSize = wordIdx === 0 ? 1 : Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < chunkSize && wordIdx < words.length; i++) {
      currentText += words[wordIdx++];
    }

    streamBody.innerHTML = parseMarkdown(closeOpenFences(currentText));
    if (msgInState) {
      msgInState.content = hasSegment && append
        ? part1Text + separator + currentText
        : currentText;
    }

    if (!state.userHasScrolledUp) {
      scrollToEnd(false);
    }

    const delay = baseDelay + Math.random() * 10;
    setTimeout(addNextChunk, delay);
  }

  setTimeout(addNextChunk, append ? 50 : 100);
}

/* ============================================================
   THINKING INDICATOR
   ============================================================ */

function createThinkingIndicator() {
  const el = document.createElement('div');
  el.className = 'message assistant';
  el.id = 'thinking-indicator';
  el.innerHTML = `
    <div class="message-wrapper">
      ${assistantAvatarHTML()}
      <div class="assistant-body">
        <div class="thinking-indicator">
          <div class="thinking-dots">
            <div class="thinking-dot"></div>
            <div class="thinking-dot"></div>
            <div class="thinking-dot"></div>
          </div>
          <span>Thinking...</span>
        </div>
      </div>
    </div>
  `;
  return el;
}

/* ============================================================
   SCROLL MANAGEMENT
   ============================================================ */

function scrollToEnd(instant) {
  const list = dom.messagesList;
  const target = list.scrollHeight - list.clientHeight;
  if (instant) {
    list.scrollTop = list.scrollHeight;
  } else {
    Physics.animateScroll(list, target, { preset: 'gentle' });
  }
  state.userHasScrolledUp = false;
  if (dom.scrollToBottom.style.display !== 'none') {
    Physics.hide(dom.scrollToBottom);
  }
}

function onMessagesScroll() {
  const list = dom.messagesList;
  const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
  state.userHasScrolledUp = distanceFromBottom > 80;
  const shouldShow = state.userHasScrolledUp && state.isGenerating;
  if (shouldShow && dom.scrollToBottom.style.display === 'none') {
    Physics.show(dom.scrollToBottom);
  } else if (!shouldShow && dom.scrollToBottom.style.display !== 'none') {
    Physics.hide(dom.scrollToBottom);
  }
}

/* ============================================================
   INPUT HANDLING
   ============================================================ */

function setupInput(textarea, sendBtn) {
  textarea.addEventListener('input', () => {
    // Auto-resize
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 180) + 'px';
    sendBtn.disabled = !textarea.value.trim();
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!textarea.value.trim() || state.isGenerating) return;
      const text = textarea.value;
      textarea.value = '';
      textarea.style.height = 'auto';
      sendBtn.disabled = true;
      sendMessage(text);
    }
  });
}

function focusInput(input) {
  setTimeout(() => input.focus(), 0);
}

function disableSend(disabled) {
  dom.chatSendBtn.disabled = disabled;
  dom.welcomeSendBtn.disabled = disabled;
}

/* ============================================================
   MARKDOWN PARSER (simple)
   ============================================================ */

function closeOpenFences(text) {
  // Count ``` occurrences to detect an unclosed code block
  const fences = text.match(/```/g);
  if (fences && fences.length % 2 !== 0) {
    // Unclosed fence — close it so the parser renders a proper block
    return text + '\n```';
  }
  return text;
}

function parseMarkdown(text) {
  let html = escapeHtml(text);

  // Code blocks first (before other processing)
  html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const langLabel = lang || 'code';
    return `<div class="code-block-wrapper">
      <pre><code class="lang-${escapeHtml(langLabel)}">${code.trim()}</code></pre>
      <button class="copy-btn" onclick="copyCode(this)">Copy</button>
    </div>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Headers
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Lists (ordered and unordered)
  html = wrapListBlocks(html);

  // Ensure lists sit in their own blocks (not inside <p>)
  html = html.replace(/\n(?=<(?:ol|ul)>)/g, '\n\n');
  html = html.replace(/(<\/(?:ol|ul)>)\n(?!\n)/g, '$1\n\n');

  // Tables (simple)
  html = html.replace(/\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)+)/g, (_, header, rows) => {
    const headerCells = header.split('|').filter((c) => c.trim()).map((c) => `<th>${c.trim()}</th>`).join('');
    const rowHtml = rows.trim().split('\n').map((row) => {
      const cells = row.split('|').filter((c) => c.trim()).map((c) => `<td>${c.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<div style="overflow-x:auto;margin:10px 0"><table style="border-collapse:collapse;width:100%;font-size:12px">
      <thead><tr>${headerCells}</tr></thead>
      <tbody>${rowHtml}</tbody>
    </table></div>`;
  });

  // Paragraphs: wrap blocks separated by double newlines
  const blocks = html.split(/\n\n+/);
  const wrapped = blocks.map((block) => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    // Don't wrap items that are already block elements
    if (
      trimmed.startsWith('<pre') ||
      trimmed.startsWith('<ul') ||
      trimmed.startsWith('<ol') ||
      trimmed.startsWith('<h') ||
      trimmed.startsWith('<div') ||
      trimmed.startsWith('<table')
    ) return trimmed;
    // Single newlines within a block → <br>
    return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
  });

  return wrapped.filter(Boolean).join('\n');
}

function wrapListBlocks(html) {
  const lines = html.split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const isUl = /^[-•]\s+(.+)$/.test(line);
    const isOl = /^\d+\.\s+(.+)$/.test(line);

    if (isUl || isOl) {
      const ordered = isOl;
      const tag = ordered ? 'ol' : 'ul';
      const items = [];

      while (i < lines.length) {
        const ulMatch = lines[i].match(/^[-•]\s+(.+)$/);
        const olMatch = lines[i].match(/^\d+\.\s+(.+)$/);
        if (ordered && olMatch) {
          items.push(`<li>${olMatch[1]}</li>`);
          i++;
        } else if (!ordered && ulMatch) {
          items.push(`<li>${ulMatch[1]}</li>`);
          i++;
        } else {
          break;
        }
      }

      out.push(`<${tag}>${items.join('')}</${tag}>`);
    } else {
      out.push(line);
      i++;
    }
  }

  return out.join('\n');
}

/* ============================================================
   SEARCH OVERLAY
   ============================================================ */

function openSearch() {
  const overlay = document.createElement('div');
  overlay.className = 'search-overlay';
  overlay.id = 'searchOverlay';

  const allChats = state.projects.flatMap((p) =>
    p.chats.map((c) => ({ ...c, projectId: p.id, projectName: p.name }))
  );

  overlay.innerHTML = `
    <div class="search-modal">
      <div class="search-input-row">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
          <circle cx="11" cy="11" r="8" stroke="currentColor" stroke-width="2"/>
          <path d="M21 21l-4.35-4.35" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <input class="search-field" placeholder="Search chats..." id="searchField" autofocus />
      </div>
      <div class="search-results" id="searchResults">
        ${renderSearchResults(allChats)}
      </div>
    </div>
  `;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSearch(overlay);
  });

  document.body.appendChild(overlay);

  const panel = overlay.querySelector('.search-modal');
  Physics.modalIn(overlay, panel);
  Physics.stagger(overlay.querySelector('.search-results'), '.search-result-item', {
    opacity: 0,
    y: 8,
    scale: 0.98,
  }, { preset: 'snappy', delay: 30 });

  const field = document.getElementById('searchField');
  field.focus();

  field.addEventListener('input', () => {
    const query = field.value.toLowerCase();
    const filtered = allChats.filter((c) =>
      c.title.toLowerCase().includes(query) || c.projectName.toLowerCase().includes(query)
    );
    document.getElementById('searchResults').innerHTML = renderSearchResults(filtered, query);
    bindSearchResults(overlay);
    Physics.stagger(document.getElementById('searchResults'), '.search-result-item', {
      opacity: 0,
      y: 6,
      scale: 0.98,
    }, { preset: 'snappy', delay: 25 });
  });

  document.addEventListener('keydown', searchKeyHandler);
  bindSearchResults(overlay);
}

function renderSearchResults(chats, query = '') {
  if (!chats.length) {
    return '<div class="search-empty">No chats found</div>';
  }
  return chats.map((chat) => `
    <div class="search-result-item" data-chat-id="${chat.id}" data-project-id="${chat.projectId}" data-title="${escapeHtml(chat.title)}">
      <span class="search-result-project">${escapeHtml(chat.projectName)}</span>
      <span class="search-result-title">${escapeHtml(chat.title)}</span>
    </div>
  `).join('');
}

function bindSearchResults(overlay) {
  overlay.querySelectorAll('.search-result-item').forEach((item) => {
    item.addEventListener('click', () => {
      const chatId = item.dataset.chatId;
      const projectId = item.dataset.projectId;
      const title = item.dataset.title;
      closeSearch(overlay);
      openChat(chatId, title, projectId);
    });
  });
}

function closeSearch(overlay) {
  const panel = overlay.querySelector('.search-modal');
  document.removeEventListener('keydown', searchKeyHandler);
  Physics.modalOut(overlay, panel, () => overlay.remove());
}

function searchKeyHandler(e) {
  if (e.key === 'Escape') {
    const overlay = document.getElementById('searchOverlay');
    if (overlay) closeSearch(overlay);
  }
}

/* ============================================================
   COPY HELPERS
   ============================================================ */

function copyCode(btn) {
  const code = btn.previousElementSibling.querySelector('code').textContent;
  navigator.clipboard.writeText(code).then(() => {
    btn.textContent = 'Copied!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = 'Copy';
      btn.classList.remove('copied');
    }, 2000);
  });
}

function copyMessageContent(btn) {
  const msgWrapper = btn.closest('.message-wrapper');
  const content = msgWrapper.querySelector('.md-content');
  if (content) {
    navigator.clipboard.writeText(content.innerText).then(() => {
      btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg> Copied!`;
      setTimeout(() => {
        btn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/></svg> Copy`;
      }, 2000);
    });
  }
}

function regenerateResponse(btn) {
  if (state.isGenerating) return;
  const msgEl = btn.closest('.message');
  if (!msgEl) return;

  // Find the user message before this one
  const allMessages = Array.from(dom.messagesList.children);
  const idx = allMessages.indexOf(msgEl);
  const prevMsg = idx > 0 ? allMessages[idx - 1] : null;
  const userText = prevMsg?.querySelector('.user-bubble')?.textContent;

  if (!userText || !state.selectedChatId) return;

  // Remove current assistant message from DOM + state
  msgEl.remove();
  const msgs = state.chatMessages[state.selectedChatId];
  const msgIdx = msgs.findIndex((m) => m.id === msgEl.id.replace('msg-', ''));
  if (msgIdx !== -1) msgs.splice(msgIdx, 1);

  state.isGenerating = true;
  disableSend(true);
  setChatRunning(state.selectedChatId, true);
  simulateAIResponse(state.selectedChatId, userText);
}

/* ============================================================
   WELCOME SUBTITLE & INPUT PLACEHOLDER
   ============================================================ */

function setRandomWelcomeSubtitle() {
  const idx = Math.floor(Math.random() * WELCOME_SUBTITLES.length);
  dom.welcomeSubtitle.textContent = WELCOME_SUBTITLES[idx];
}

function animateWelcomeInputPlaceholders() {
  const prefix = 'Try ';
  const suffixes = [
    'anything new...',
    'refactor my authentication module...',
    'debug this TypeScript error...',
    'write tests for my API endpoints...',
    'explain how this code works...',
    'create a React component for...',
    'optimize my database queries...',
  ];

  let suffixIdx = 0;
  let charIdx = 0;
  let deleting = false;
  let timer = null;

  const rand = (min, max) => min + Math.random() * (max - min);

  function setPlaceholder(text) {
    dom.welcomeInput.setAttribute('placeholder', prefix + text);
  }

  function typingDelay(char, prevChar) {
    let delay = rand(42, 78);

    if (prevChar === ' ') delay += rand(10, 38);
    if (char === ' ') delay += rand(24, 90);
    if (char === ',') delay += rand(95, 220);
    if (char === '.' || char === '?' || char === '!') delay += rand(150, 360);

    if (char === ' ' && Math.random() < 0.14) {
      delay += rand(120, 280);
    }

    if (Math.random() < 0.08) delay += rand(60, 150);

    return delay;
  }

  function deletingDelay(deletedChar, charBefore) {
    let delay = rand(12, 30);

    if (deletedChar === ' ') delay += rand(18, 60);
    if (charBefore === ' ') delay += rand(8, 30);
    if (deletedChar === '.' || deletedChar === ',') delay += rand(28, 75);
    if (Math.random() < 0.22) delay *= rand(0.45, 0.75);

    return delay;
  }

  function isActive() {
    return dom.welcomeScreen.style.display !== 'none' && !dom.welcomeInput.value;
  }

  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(step, ms);
  }

  function step() {
    if (!isActive()) {
      schedule(rand(250, 400));
      return;
    }

    const suffix = suffixes[suffixIdx];

    if (!deleting) {
      charIdx = Math.min(charIdx + 1, suffix.length);
      setPlaceholder(suffix.slice(0, charIdx));

      if (charIdx >= suffix.length) {
        deleting = true;
        schedule(rand(1200, 2400));
      } else {
        const char = suffix[charIdx - 1];
        const prevChar = charIdx > 1 ? suffix[charIdx - 2] : '';
        schedule(typingDelay(char, prevChar));
      }
      return;
    }

    const deleteIdx = charIdx - 1;
    charIdx = deleteIdx;
    setPlaceholder(suffix.slice(0, charIdx));

    if (charIdx <= 0) {
      deleting = false;
      suffixIdx = (suffixIdx + 1) % suffixes.length;
      schedule(rand(320, 720));
    } else {
      const deletedChar = suffix[deleteIdx];
      const charBefore = deleteIdx > 0 ? suffix[deleteIdx - 1] : '';
      schedule(deletingDelay(deletedChar, charBefore));
    }
  }

  setPlaceholder('');
  schedule(rand(450, 800));
}

/* ============================================================
   UTILITIES
   ============================================================ */

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ============================================================
   EVENT BINDING
   ============================================================ */

function bindEvents() {
  // Welcome input
  setupInput(dom.welcomeInput, dom.welcomeSendBtn);
  dom.welcomeSendBtn.addEventListener('click', () => {
    const text = dom.welcomeInput.value;
    dom.welcomeInput.value = '';
    dom.welcomeInput.style.height = 'auto';
    dom.welcomeSendBtn.disabled = true;
    sendMessage(text);
  });

  // Chat input
  setupInput(dom.chatInput, dom.chatSendBtn);
  dom.chatSendBtn.addEventListener('click', () => {
    const text = dom.chatInput.value;
    dom.chatInput.value = '';
    dom.chatInput.style.height = 'auto';
    dom.chatSendBtn.disabled = true;
    sendMessage(text);
  });

  // Messages scroll
  dom.messagesList.addEventListener('scroll', onMessagesScroll);

  // Scroll to bottom button
  dom.scrollToBottom.addEventListener('click', () => scrollToEnd(false));

  // Sidebar nav
  document.querySelector('[data-action="new-chat"]').addEventListener('click', () => {
    showWelcomeScreen();
    focusInput(dom.welcomeInput);
  });

  document.querySelector('[data-action="search"]').addEventListener('click', openSearch);

  document.querySelector('[data-action="plugins"]').addEventListener('click', () => {
    showToast('Plugins panel coming soon');
  });
  document.querySelector('[data-action="settings"]').addEventListener('click', openSettings);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Cmd/Ctrl+K for search
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      openSearch();
    }
    // Cmd/Ctrl+N for new chat
    if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
      e.preventDefault();
      showWelcomeScreen();
      focusInput(dom.welcomeInput);
    }
    // Escape to go back or close dropdowns
    if (e.key === 'Escape') {
      if (typeof TitlebarMenu !== 'undefined') TitlebarMenu.closeAllMenus();
      if (SettingsStore.getIsOpen()) {
        closeSettings();
        return;
      }
      if (openModelDropdown) {
        closeAllModelDropdowns();
        return;
      }
      if (dom.chatScreen.style.display !== 'none') {
        const overlay = document.getElementById('searchOverlay');
        if (!overlay) showWelcomeScreen();
      }
    }
    // Cmd/Ctrl+B for sidebar toggle
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault();
      toggleSidebar();
    }
    // Cmd/Ctrl+, for settings
    if ((e.metaKey || e.ctrlKey) && e.key === ',') {
      e.preventDefault();
      if (SettingsStore.getIsOpen()) closeSettings();
      else openSettings();
    }
  });
}

/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */

let toastDismissTimer = null;
let toastInteractionCleanup = null;

function clearToastTimers() {
  if (toastDismissTimer) {
    clearTimeout(toastDismissTimer);
    toastDismissTimer = null;
  }
  if (toastInteractionCleanup) {
    toastInteractionCleanup();
    toastInteractionCleanup = null;
  }
}

function dismissToast(toast, animate = true) {
  if (!toast?.isConnected) return;
  clearToastTimers();

  if (animate) {
    Physics.animate(toast, { opacity: 0, y: -8 }, {
      preset: 'stiff',
      onComplete: () => toast.remove(),
    });
    return;
  }

  toast.remove();
}

function setupToastInteractions(toast) {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;

  function onMouseDown(e) {
    if (e.button !== 0) return;

    dragging = true;
    toast.classList.add('toast-dragging');
    clearToastTimers();

    const rect = toast.getBoundingClientRect();
    toast.style.right = 'auto';
    toast.style.top = `${rect.top}px`;
    toast.style.left = `${rect.left}px`;
    toast.style.transform = 'none';

    startX = e.clientX;
    startY = e.clientY;
    originX = rect.left;
    originY = rect.top;
    e.preventDefault();
  }

  function onMouseMove(e) {
    if (!dragging) return;

    const x = originX + (e.clientX - startX);
    const y = originY + (e.clientY - startY);
    toast.style.left = `${x}px`;
    toast.style.top = `${y}px`;

    const rect = toast.getBoundingClientRect();
    const margin = 24;
    const isOutside =
      rect.right < -margin ||
      rect.left > window.innerWidth + margin ||
      rect.bottom < -margin ||
      rect.top > window.innerHeight + margin;

    if (isOutside) {
      dragging = false;
      dismissToast(toast, false);
    }
  }

  function onMouseUp() {
    if (!dragging) return;
    dragging = false;
    if (!toast.isConnected) return;
    toast.classList.remove('toast-dragging');
    toastDismissTimer = setTimeout(() => dismissToast(toast), 2500);
  }

  function onAuxClick(e) {
    if (e.button !== 1) return;
    e.preventDefault();
    dismissToast(toast);
  }

  toast.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  toast.addEventListener('auxclick', onAuxClick);

  return () => {
    toast.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('mouseup', onMouseUp);
    toast.removeEventListener('auxclick', onAuxClick);
  };
}

function showToast(message) {
  const existing = document.getElementById('toast');
  if (existing) dismissToast(existing, false);

  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  Physics.animate(toast, { opacity: 1, y: 0 }, {
    from: { opacity: 0, y: -12 },
    preset: 'bouncy',
  });

  toastInteractionCleanup = setupToastInteractions(toast);

  toastDismissTimer = setTimeout(() => {
    dismissToast(toast);
  }, 2500);
}

/* ============================================================
   BOOTSTRAP
   ============================================================ */

document.addEventListener('DOMContentLoaded', init);
