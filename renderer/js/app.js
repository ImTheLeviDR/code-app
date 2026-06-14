/* ============================================================
   CODE APP - Main Application Logic
   ============================================================ */

'use strict';

const CHAT_STORAGE_KEY = 'code-app-chats';
const SELECTED_MODEL_KEY = 'code-app-selected-model';
const PROJECT_COLORS = ['#6d28d9', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#64748b', '#8b5cf6', '#06b6d4'];
const LEGACY_PROJECT_IDS = new Set([
  'default', 'assistant', 'snycmod', 'llexa', 'translator', 'kvaesitso', 'eaglensserver', 'archive',
]);

function loadPersistedChatState() {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.projects?.length) return null;

    parsed.projects = parsed.projects.filter(
      (p) => p.folderPath && !LEGACY_PROJECT_IDS.has(p.id),
    );
    if (!parsed.projects.length) {
      localStorage.removeItem(CHAT_STORAGE_KEY);
      return null;
    }

    for (const project of parsed.projects) {
      for (const chat of project.chats || []) {
        delete chat.running;
      }
    }

    const validIds = new Set(parsed.projects.map((p) => p.id));
    if (!validIds.has(parsed.selectedProjectId)) {
      parsed.selectedProjectId = parsed.projects[0]?.id || null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function saveChatState() {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify({
      projects: state.projects,
      chatMessages: state.chatMessages,
      nextMsgId: state.nextMsgId,
      selectedProjectId: state.selectedProjectId,
      expandedChatLists: Array.from(state.expandedChatLists),
    }));
  } catch (err) {
    console.error('Failed to save chats:', err);
  }
}

function loadSelectedModelId(savedChatState = null) {
  try {
    const stored = localStorage.getItem(SELECTED_MODEL_KEY);
    if (stored) return stored;
    if (savedChatState?.selectedModelId) return savedChatState.selectedModelId;
  } catch {
    /* ignore */
  }
  return MODELS[0]?.id;
}

function saveSelectedModelId(modelId) {
  if (!modelId) return;
  try {
    localStorage.setItem(SELECTED_MODEL_KEY, modelId);
  } catch (err) {
    console.error('Failed to save model preference:', err);
  }
}

function createInitialState() {
  const saved = loadPersistedChatState();
  if (saved) {
    const expanded = saved.selectedProjectId ? [saved.selectedProjectId] : [];
    return {
      projects: saved.projects,
      selectedProjectId: saved.selectedProjectId,
      selectedChatId: null,
      expandedProjects: new Set(expanded),
      expandedChatLists: new Set(saved.expandedChatLists || []),
      chatMessages: saved.chatMessages || {},
      nextMsgId: saved.nextMsgId || 1000,
      isGenerating: false,
      userHasScrolledUp: false,
      selectedModelId: loadSelectedModelId(saved),
    };
  }

  return {
    projects: [],
    selectedProjectId: null,
    selectedChatId: null,
    expandedProjects: new Set(),
    expandedChatLists: new Set(),
    chatMessages: {},
    nextMsgId: 1000,
    isGenerating: false,
    userHasScrolledUp: false,
    selectedModelId: loadSelectedModelId(),
  };
}

/* ---- State ---- */
const state = createInitialState();

function getSelectedProject() {
  if (!state.selectedProjectId) return null;
  return state.projects.find((p) => p.id === state.selectedProjectId) || null;
}

function projectIdFromPath(folderPath) {
  const norm = folderPath.replace(/\\/g, '/').toLowerCase();
  let hash = 0;
  for (let i = 0; i < norm.length; i++) {
    hash = ((hash << 5) - hash) + norm.charCodeAt(i);
    hash |= 0;
  }
  return `proj-${Math.abs(hash)}`;
}

function projectNameFromPath(folderPath) {
  const parts = folderPath.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts[parts.length - 1] || folderPath;
}

function colorForProject(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash) + id.charCodeAt(i);
    hash |= 0;
  }
  return PROJECT_COLORS[Math.abs(hash) % PROJECT_COLORS.length];
}

async function setActiveProjectWorkspace(projectId) {
  const project = state.projects.find((p) => p.id === projectId);
  if (!project?.folderPath) return;
  if (typeof Backend !== 'undefined' && Backend.isAvailable()) {
    try {
      await Backend.setWorkspace(project.folderPath);
    } catch (err) {
      console.error('Failed to set workspace:', err);
    }
  }
}

async function openProjectFolder() {
  if (!window.electronAPI?.openFolderDialog) {
    showToast('Open folder is available in the desktop app');
    return;
  }

  const folderPath = await window.electronAPI.openFolderDialog();
  if (!folderPath) return;

  let project = state.projects.find((p) => p.folderPath === folderPath);
  if (!project) {
    const id = projectIdFromPath(folderPath);
    project = {
      id,
      name: projectNameFromPath(folderPath),
      color: colorForProject(id),
      folderPath,
      chats: [],
    };
    state.projects.unshift(project);
    showToast(`Added project: ${project.name}`);
  } else {
    showToast(`Opened ${project.name}`);
  }

  state.selectedProjectId = project.id;
  state.expandedProjects.add(project.id);
  state.selectedChatId = null;

  await setActiveProjectWorkspace(project.id);
  renderSidebar();
  updateProjectSelection();
  updateActiveChat();
  showWelcomeScreen();
  saveChatState();
  focusInput(dom.welcomeInput);
}

let modelDropdowns = [];
let openModelDropdown = null;
let modelDropdownClickBound = false;
let modelsLoading = typeof Backend !== 'undefined' && Backend.isAvailable();
const aiRuns = new Map();
const questionRequests = new Map();

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
  attachDiffsToMessages();
  renderSidebar();
  initModelDropdowns();
  initBackend();
  updateProjectSelection();
  window.addEventListener('settings-changed', refreshModelDropdowns);
  window.addEventListener('models-loading', (e) => {
    modelsLoading = Boolean(e.detail?.loading);
    syncModelDropdownLabels();
  });
  showWelcomeScreen({ animateWelcome: true });
  bindEvents();
  setupWindowControls();
  animateWelcomeInputPlaceholders();
}

function initBackend() {
  if (typeof Backend === 'undefined' || !Backend.isAvailable()) {
    modelsLoading = false;
    showToast('AI backend unavailable — restart the app');
    syncModelDropdownLabels();
    return;
  }

  modelsLoading = true;
  syncModelDropdownLabels();

  Backend.onEvent(handleBackendEvent);

  Backend.ensureReady()
    .then((status) => {
      if (!status?.running) {
        showToast(status?.error || 'Failed to start AI backend');
        return;
      }
      return setActiveProjectWorkspace(state.selectedProjectId);
    })
    .then(() => SettingsStore.syncProvidersToBackend())
    .then(() => SettingsStore.refreshModelsFromBackend())
    .then(() => refreshModelDropdowns())
    .catch((err) => {
      console.error('Backend init failed:', err);
      showToast('AI backend failed to start');
    })
    .finally(() => {
      modelsLoading = false;
      syncModelDropdownLabels();
    });
}

/* ============================================================
   MODEL DROPDOWN
   ============================================================ */

function getAvailableModels() {
  return SettingsStore.getChatModels();
}

const MODEL_CATEGORY_ORDER = ['Free', 'OpenRouter', 'OpenAI', 'Anthropic', 'Google'];

function getModelDisplayName(model) {
  return model?.name || model?.label || model?.id?.split('/').pop() || model?.id || '';
}

function groupModelsByCategory(models) {
  const groups = new Map();
  for (const model of models) {
    const category = model.category || model.providerName || 'Other';
    if (!groups.has(category)) groups.set(category, []);
    groups.get(category).push(model);
  }

  return [...groups.entries()].sort(([a], [b]) => {
    const ai = MODEL_CATEGORY_ORDER.indexOf(a);
    const bi = MODEL_CATEGORY_ORDER.indexOf(b);
    if (ai !== -1 && bi !== -1) return ai - bi;
    if (ai !== -1) return -1;
    if (bi !== -1) return 1;
    return a.localeCompare(b);
  });
}

function getModelLabel(modelId) {
  const model = getAvailableModels().find((m) => m.id === modelId);
  return model ? getModelDisplayName(model) : modelId;
}

function isSelectedModelResolved() {
  return getAvailableModels().some((m) => m.id === state.selectedModelId);
}

function shouldShowModelSpinner() {
  return modelsLoading || !isSelectedModelResolved();
}

function modelSelectorLabelHTML() {
  if (shouldShowModelSpinner()) {
    return '<span class="model-selector-spinner" aria-hidden="true"></span>';
  }
  return escapeHtml(getModelLabel(state.selectedModelId));
}

function syncModelDropdownLabels() {
  modelDropdowns.forEach((dropdown) => dropdown.syncSelection());
}

function buildModelMenuHTML(models, selectedId) {
  const checkSvg = `<svg class="model-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none">
    <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const groups = groupModelsByCategory(models);
  const groupsHtml = groups.map(([category, items]) => `
    <div class="model-dropdown-group" data-category="${escapeHtml(category)}">
      <div class="model-dropdown-group-label">${escapeHtml(category)}</div>
      ${items.map((model) => {
        const name = getModelDisplayName(model);
        return `
        <button
          class="model-option${model.id === selectedId ? ' selected' : ''}"
          type="button"
          role="option"
          data-model-id="${model.id}"
          data-search="${escapeHtml(`${name} ${category}`.toLowerCase())}"
          aria-selected="${model.id === selectedId}"
        >
          <span class="model-option-name">${escapeHtml(name)}</span>
          ${checkSvg}
        </button>`;
      }).join('')}
    </div>
  `).join('');

  return `
    <div class="model-dropdown-panel">
      <div class="model-dropdown-search-wrap">
        <svg class="model-dropdown-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"/>
          <path d="M20 20l-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <input
          type="text"
          class="model-dropdown-search"
          placeholder="Search models…"
          spellcheck="false"
          autocomplete="off"
          aria-label="Search models"
        />
      </div>
      <div class="model-dropdown-list">
        ${groupsHtml}
        <div class="model-dropdown-empty is-filtered-hidden">No models match your search</div>
      </div>
    </div>
  `;
}

function filterModelDropdown(menu, query) {
  const q = query.trim().toLowerCase();
  let anyVisible = false;

  menu.querySelectorAll('.model-dropdown-group').forEach((group) => {
    let groupVisible = false;
    const category = (group.dataset.category || '').toLowerCase();

    group.querySelectorAll('.model-option').forEach((opt) => {
      const name = (opt.querySelector('.model-option-name')?.textContent || '').trim().toLowerCase();
      const haystack = `${name} ${category}`;
      const match = !q || haystack.includes(q);
      opt.classList.toggle('is-filtered-hidden', !match);
      if (match) groupVisible = true;
    });

    group.classList.toggle('is-filtered-hidden', !groupVisible);
    if (groupVisible) anyVisible = true;
  });

  const empty = menu.querySelector('.model-dropdown-empty');
  if (empty) empty.classList.toggle('is-filtered-hidden', anyVisible || !q);
}

function closeAllModelDropdowns(instant = false) {
  modelDropdowns.forEach((dropdown) => dropdown.close(instant));
  openModelDropdown = null;
}

function setSelectedModel(modelId) {
  state.selectedModelId = modelId;
  saveSelectedModelId(modelId);
  modelDropdowns.forEach((dropdown) => dropdown.syncSelection());
}

function refreshModelDropdowns() {
  const models = getAvailableModels();
  if (!models.some((m) => m.id === state.selectedModelId)) {
    state.selectedModelId = models[0]?.id ?? state.selectedModelId;
    saveSelectedModelId(state.selectedModelId);
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

  container.innerHTML = `
    <button class="model-selector-trigger${shouldShowModelSpinner() ? ' is-loading' : ''}" type="button" aria-haspopup="listbox" aria-expanded="false"${shouldShowModelSpinner() ? ' aria-busy="true"' : ''}>
      <span class="model-selected-label">${modelSelectorLabelHTML()}</span>
      ${chevronSvg}
    </button>
    <div class="model-dropdown-menu" role="presentation">
      ${buildModelMenuHTML(getAvailableModels(), state.selectedModelId)}
    </div>
  `;

  const trigger = container.querySelector('.model-selector-trigger');
  const menu = container.querySelector('.model-dropdown-menu');
  const labelEl = container.querySelector('.model-selected-label');
  const searchInput = container.querySelector('.model-dropdown-search');

  menu.style.visibility = 'hidden';

  function getVisibleOptions() {
    return Array.from(container.querySelectorAll('.model-option:not(.is-filtered-hidden)'));
  }

  function bindOptionEvents() {
    const options = Array.from(container.querySelectorAll('.model-option'));
    options.forEach((opt, idx) => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        setSelectedModel(opt.dataset.modelId);
        close();
      });

      opt.addEventListener('keydown', (e) => {
        const visible = getVisibleOptions();
        const visIdx = visible.indexOf(opt);
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          visible[(visIdx + 1) % visible.length]?.focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          if (visIdx <= 0) searchInput?.focus();
          else visible[visIdx - 1]?.focus();
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
  }

  bindOptionEvents();

  function applySearchFilter() {
    filterModelDropdown(menu, searchInput?.value || '');
  }

  if (searchInput) {
    searchInput.addEventListener('input', applySearchFilter);
    searchInput.addEventListener('keyup', applySearchFilter);

    searchInput.addEventListener('click', (e) => e.stopPropagation());

    searchInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        getVisibleOptions()[0]?.focus();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        close();
        trigger.focus();
      } else if (e.key === 'Enter') {
        const first = getVisibleOptions()[0];
        if (first) {
          e.preventDefault();
          setSelectedModel(first.dataset.modelId);
          close();
          trigger.focus();
        }
      }
    });
  }

  function close(instant = false) {
    if (!container.classList.contains('open')) return;

    const finish = () => {
      container.classList.remove('open');
      trigger.setAttribute('aria-expanded', 'false');
      menu.style.visibility = 'hidden';
      if (searchInput) {
        searchInput.value = '';
        applySearchFilter();
      }
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
    if (searchInput) {
      searchInput.value = '';
      applySearchFilter();
      requestAnimationFrame(() => searchInput.focus());
    }
    const selected = container.querySelector('.model-option.selected:not(.is-filtered-hidden)');
    if (selected) {
      requestAnimationFrame(() => {
        selected.scrollIntoView({ block: 'nearest' });
      });
    }
  }

  function syncSelection() {
    const loading = shouldShowModelSpinner();
    labelEl.innerHTML = modelSelectorLabelHTML();
    trigger.classList.toggle('is-loading', loading);
    trigger.setAttribute('aria-busy', String(loading));
    container.classList.toggle('is-loading', loading);
    container.querySelectorAll('.model-option').forEach((opt) => {
      const isSelected = opt.dataset.modelId === state.selectedModelId;
      opt.classList.toggle('selected', isSelected);
      opt.setAttribute('aria-selected', String(isSelected));
    });
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (container.classList.contains('open')) close();
    else open();
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

  if (!state.projects.length) {
    dom.projectsList.innerHTML = `
      <div class="projects-empty">
        <p class="projects-empty-text">Open a folder to create a project.</p>
        <button class="projects-empty-btn" type="button" data-action="open-folder">Open Folder</button>
      </div>
    `;
    dom.projectsList.querySelector('[data-action="open-folder"]')
      ?.addEventListener('click', () => openProjectFolder());
    return;
  }

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
      <button class="project-add-chat" title="New chat">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M6 2v8M2 6h8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    `;

    header.addEventListener('click', () => toggleProject(project.id));

    const addChatBtn = header.querySelector('.project-add-chat');
    addChatBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      state.selectedProjectId = project.id;
      if (!state.expandedProjects.has(project.id)) {
        state.expandedProjects.add(project.id);
      }
      showWelcomeScreen();
      focusInput(dom.welcomeInput);
    });

    // Chats list
    const chatsDiv = document.createElement('div');
    chatsDiv.className = `project-chats ${isExpanded ? 'expanded' : 'collapsed'}`;
    chatsDiv.id = `chats-${project.id}`;

    const maxVisibleChats = 5;
    const isChatListExpanded = state.expandedChatLists.has(project.id);
    const visibleChats = isChatListExpanded
      ? project.chats
      : project.chats.slice(0, maxVisibleChats);
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
        state.expandedChatLists.add(project.id);
        saveChatState();
        renderSidebar();
      });
      chatsDiv.appendChild(showMore);
    } else if (isChatListExpanded && project.chats.length > maxVisibleChats) {
      const showLess = document.createElement('button');
      showLess.className = 'show-more-btn';
      showLess.textContent = 'Show less';
      showLess.addEventListener('click', (e) => {
        e.stopPropagation();
        state.expandedChatLists.delete(project.id);
        saveChatState();
        renderSidebar();
      });
      chatsDiv.appendChild(showLess);
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

  const wasRunning = chat.running;
  chat.running = running;
  syncChatItem(chatId);
  saveChatState();

  // Show notification when task finishes
  if (wasRunning && !running) {
    showToast(`Task finished: ${chat.title}`);
  }
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
  setActiveProjectWorkspace(projectId);
}

function updateProjectSelection() {
  updateNavActive();

  const project = getSelectedProject();
  if (project) {
    dom.welcomeTitle.textContent = `What should we work on in ${project.name}?`;
  } else {
    dom.welcomeTitle.textContent = 'Open a folder to get started';
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
  updateProjectSelection();
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
  setActiveProjectWorkspace(projectId);
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
    el.innerHTML = buildAssistantHTML(msg);
  }

  dom.messagesList.appendChild(el);
  if (animate) Physics.messageIn(el);
  return el;
}

function buildDefaultSegments(msg) {
  const hasTools = msg.toolCalls?.length > 0;
  const hasContent = !!msg.content;

  if (!hasTools && !hasContent) return [];

  const segs = [];
  if (hasTools && hasContent && msg.eventLog?.length) {
    const firstToolIdx = msg.eventLog.findIndex((e) => e.type === 'tool');
    const firstTextIdx = msg.eventLog.findIndex((e) => e.type === 'text');
    if (firstToolIdx !== -1 && (firstTextIdx === -1 || firstToolIdx < firstTextIdx)) {
      segs.push({ type: 'tools', toolCalls: msg.toolCalls });
      segs.push({ type: 'content', text: msg.content });
    } else {
      segs.push({ type: 'content', text: msg.content });
      segs.push({ type: 'tools', toolCalls: msg.toolCalls });
    }
  } else if (hasTools) {
    segs.push({ type: 'tools', toolCalls: msg.toolCalls });
  } else {
    segs.push({ type: 'content', text: msg.content });
  }
  return segs;
}

function buildAssistantHTML(msg) {
  const segments = msg.segments?.length ? msg.segments : buildDefaultSegments(msg);

  if (!segments.length) {
    return `
      <div class="message-wrapper">
        ${assistantAvatarHTML()}
        <div class="assistant-body">
          <div class="md-content" id="content-${msg.id}"></div>
        </div>
      </div>
    `;
  }

  const parts = [];
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const isLast = i === segments.length - 1;
    if (seg.type === 'tools') {
      parts.push(`<div class="assistant-meta">${renderToolCallsHTML(seg.toolCalls, msg.id)}</div>`);
    } else {
      if (isLast) {
        parts.push(`<div class="md-content" id="content-${msg.id}">${parseMarkdown(seg.text || '')}</div>`);
      } else {
        parts.push(`<div class="md-content md-content-segment">${parseMarkdown(seg.text || '')}</div>`);
      }
    }
  }

  const lastSeg = segments[segments.length - 1];
  const hasActions = lastSeg?.type === 'content';

  return `
    <div class="message-wrapper">
      ${assistantAvatarHTML()}
      <div class="assistant-body">
        ${parts.join('')}
        ${hasActions ? renderMessageActionsHTML() : ''}
      </div>
    </div>
  `;
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

function formatLineCount(count, word = 'line') {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

function truncateLabel(text, max = 40) {
  if (!text) return '';
  const s = String(text);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function getGrepPattern(args = {}) {
  return args.pattern ?? args.regex ?? args.grep;
}

function getGlobPattern(args = {}) {
  return args.pattern ?? args.glob_pattern ?? args.glob;
}

function getWebSearchQuery(args = {}) {
  return args.query ?? args.q ?? args.search;
}

function getWebFetchTarget(args = {}) {
  const url = args.url ?? args.uri ?? '';
  if (!url) return '';
  try {
    return new URL(url).hostname || truncateLabel(url, 48);
  } catch {
    return truncateLabel(url, 48);
  }
}

function getReadTarget(args = {}) {
  const path = args.path ?? args.file ?? args.filePath ?? '';
  if (!path) return '';
  return path.endsWith('/') || path.endsWith('\\')
    ? path
    : (getFileBasename(path) || path);
}

function isFileMutationTool(name) {
  return name === 'edit' || name === 'edit_file'
    || name === 'write' || name === 'write_file'
    || name === 'create_file';
}

function normalizeFileMutationName(name) {
  if (name === 'write' || name === 'write_file') return 'write';
  if (name === 'create_file') return 'create';
  if (name === 'edit' || name === 'edit_file') return 'edit';
  return name;
}

function getFileMutationRunningLabel(tc) {
  const file = getFileBasename(tc.args?.path);
  const { adds, dels } = getToolLineStats(tc);
  const kind = normalizeFileMutationName(tc.name);

  switch (kind) {
    case 'write':
      if (adds > 0 && file) return `Writing ${formatLineCount(adds)} to ${file}...`;
      return file ? `Writing ${file}...` : 'Writing file...';
    case 'create':
      if (adds > 0 && file) return `Creating ${formatLineCount(adds)} in ${file}...`;
      return file ? `Creating ${file}...` : 'Creating file...';
    case 'edit':
      if (file && (adds > 0 || dels > 0)) {
        let stats = 'Editing ';
        if (adds > 0) stats += `+${adds}`;
        if (adds > 0 && dels > 0) stats += ' ';
        if (dels > 0) stats += `-${dels}`;
        stats += ` ${adds + dels === 1 ? 'line' : 'lines'} in ${file}...`;
        return stats;
      }
      return file ? `Editing ${file}...` : 'Editing file...';
    default:
      return null;
  }
}

function getToolActivityLabel(tc) {
  const { name, args = {} } = tc;

  if (isFileMutationTool(name)) {
    return getFileMutationRunningLabel(tc) || `${name.replace(/_/g, ' ')}...`;
  }

  switch (name) {
    case 'read':
    case 'read_file': {
      const target = getReadTarget(args);
      return target ? `Reading ${target}...` : 'Reading file...';
    }
    case 'bash':
    case 'run_terminal_cmd':
      return args.command
        ? `Running ${truncateLabel(args.command)}...`
        : 'Running command...';
    case 'grep': {
      const pattern = getGrepPattern(args);
      return pattern
        ? `Searching file contents for "${truncateLabel(pattern, 32)}"...`
        : 'Searching file contents...';
    }
    case 'glob':
    case 'search_files': {
      const pattern = getGlobPattern(args);
      return pattern
        ? `Finding files matching "${truncateLabel(pattern, 32)}"...`
        : 'Finding files...';
    }
    case 'webfetch': {
      const target = getWebFetchTarget(args);
      return target ? `Fetching ${target}...` : 'Fetching URL...';
    }
    case 'websearch': {
      const query = getWebSearchQuery(args);
      return query
        ? `Searching the web for "${truncateLabel(query, 32)}"...`
        : 'Searching the web...';
    }
    case 'task':
      return args.description
        ? `Running sub-agent: ${truncateLabel(args.description, 36)}...`
        : 'Running sub-agent...';
    case 'skill':
      return args.name
        ? `Loading skill "${truncateLabel(args.name, 32)}"...`
        : 'Loading skill...';
    case 'question':
      return 'Waiting for your answer...';
    case 'todowrite':
      return 'Updating task list...';
    case 'search_codebase': {
      const query = getWebSearchQuery(args) || getGrepPattern(args);
      return query
        ? `Searching "${truncateLabel(query, 32)}" in codebase...`
        : 'Searching codebase...';
    }
    case 'list_directory':
      return args.path ? `Listing ${truncateLabel(args.path, 40)}...` : 'Listing directory...';
    default:
      return `${name.replace(/_/g, ' ')}...`;
  }
}

function getToolActivityLabelDone(tc) {
  const { name, args = {} } = tc;

  if (isFileMutationTool(name)) return null;

  switch (name) {
    case 'read':
    case 'read_file': {
      const target = getReadTarget(args);
      return target ? `Read ${target}` : 'Read file';
    }
    case 'bash':
    case 'run_terminal_cmd':
      return args.command
        ? `Ran ${truncateLabel(args.command)}`
        : 'Ran command';
    case 'grep': {
      const pattern = getGrepPattern(args);
      return pattern
        ? `Searched file contents for "${truncateLabel(pattern, 32)}"`
        : 'Searched file contents';
    }
    case 'glob':
    case 'search_files': {
      const pattern = getGlobPattern(args);
      return pattern
        ? `Found files matching "${truncateLabel(pattern, 32)}"`
        : 'Found files';
    }
    case 'webfetch': {
      const target = getWebFetchTarget(args);
      return target ? `Fetched ${target}` : 'Fetched URL';
    }
    case 'websearch': {
      const query = getWebSearchQuery(args);
      return query
        ? `Searched the web for "${truncateLabel(query, 32)}"`
        : 'Searched the web';
    }
    case 'task':
      return args.description
        ? `Ran sub-agent: ${truncateLabel(args.description, 36)}`
        : 'Ran sub-agent';
    case 'skill':
      return args.name
        ? `Loaded skill "${truncateLabel(args.name, 32)}"`
        : 'Loaded skill';
    case 'question':
      return 'Asked a question';
    case 'todowrite':
      return 'Updated task list';
    case 'search_codebase': {
      const query = getWebSearchQuery(args) || getGrepPattern(args);
      return query
        ? `Searched "${truncateLabel(query, 32)}" in codebase`
        : 'Searched codebase';
    }
    case 'write_file':
      return getFileBasename(args.path) ? `Wrote ${getFileBasename(args.path)}` : 'Wrote file';
    case 'create_file':
      return getFileBasename(args.path) ? `Created ${getFileBasename(args.path)}` : 'Created file';
    case 'edit_file':
      return getFileBasename(args.path) ? `Edited ${getFileBasename(args.path)}` : 'Edited file';
    case 'list_directory':
      return args.path ? `Listed ${truncateLabel(args.path, 40)}` : 'Listed directory';
    default:
      return name.replace(/_/g, ' ');
  }
}

function getFileBasename(path) {
  return path ? String(path).split(/[/\\]/).pop() : '';
}

function countContentLines(content) {
  if (content == null || content === '') return 0;
  const lines = String(content).split(/\r?\n/);
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines.length;
}

function getToolLineStats(tc) {
  let adds = tc.additions ?? tc.args?.additions;
  let dels = tc.deletions ?? tc.args?.deletions;

  if ((adds == null || adds === 0) && (tc.name === 'write' || tc.name === 'write_file' || tc.name === 'create_file')) {
    const content = tc.args?.content ?? tc.args?.text ?? tc.args?.body;
    if (content) adds = countContentLines(content);
  }

  return { adds: adds ?? 0, dels: dels ?? 0 };
}

function renderFileMutationLineHTML(tc) {
  const file = getFileBasename(tc.args?.path);
  const { adds, dels } = getToolLineStats(tc);
  const kind = normalizeFileMutationName(tc.name);

  if (kind === 'write') {
    const text = adds > 0 && file
      ? `Wrote ${formatLineCount(adds)} to ${file}`
      : (file ? `Wrote ${file}` : 'Wrote file');
    return `<span class="tool-activity-text">${escapeHtml(text)}</span>`;
  }

  if (kind === 'create') {
    const text = adds > 0 && file
      ? `Created ${formatLineCount(adds)} in ${file}`
      : (file ? `Created ${file}` : 'Created file');
    return `<span class="tool-activity-text">${escapeHtml(text)}</span>`;
  }

  if (kind === 'edit') {
    if (file && (adds > 0 || dels > 0)) {
      let html = `<span class="tool-activity-text">Edited ${escapeHtml(file)} </span>`;
      if (adds > 0) html += `<span class="tool-edit-stat tool-edit-stat-add">+${adds}</span>`;
      if (adds > 0 && dels > 0) html += '<span class="tool-activity-text"> </span>';
      if (dels > 0) html += `<span class="tool-edit-stat tool-edit-stat-del">-${dels}</span>`;
      return html;
    }
    const text = file ? `Edited ${file}` : 'Edited file';
    return `<span class="tool-activity-text">${escapeHtml(text)}</span>`;
  }

  return `<span class="tool-activity-text">${escapeHtml(file || 'File')}</span>`;
}

function isEditToolClickable(tc, running = false) {
  return !running && (tc.name === 'edit' || tc.name === 'edit_file') && tc.id;
}

function renderToolActivityLineHTML(tc, running = false) {
  const runClass = running ? ' running' : ' done';
  const idAttr = tc.id ? ` id="tc-${tc.id}"` : '';

  if (!running && isFileMutationTool(tc.name)) {
    const classes = isEditToolClickable(tc, running)
      ? 'tool-activity-line done tool-file-edit-line tool-edit-clickable'
      : 'tool-activity-line done tool-file-edit-line';
    const attrs = isEditToolClickable(tc, running) ? ' role="button" tabindex="0"' : '';
    return `<div class="${classes}"${idAttr}${attrs}>${renderFileMutationLineHTML(tc)}</div>`;
  }

  const label = running ? getToolActivityLabel(tc) : (getToolActivityLabelDone(tc) || getToolActivityLabel(tc));
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
    let sibling = contentEl.nextElementSibling;
    while (sibling) {
      if (sibling.classList.contains('assistant-meta')) return sibling;
      if (sibling.classList.contains('message-actions')) break;
      sibling = sibling.nextElementSibling;
    }
    sibling = contentEl.previousElementSibling;
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
    if (content) {
      const hasText = content.textContent.trim().length > 0;
      if (hasText) {
        body.insertBefore(meta, content.nextSibling);
      } else {
        body.insertBefore(meta, content);
      }
    } else {
      body.prepend(meta);
    }
  }

  let container = meta.querySelector('.tool-activity');
  if (!container) {
    container = document.createElement('div');
    container.className = 'tool-activity';
    meta.appendChild(container);
  }
  return container;
}

function getInlineThinkingContainer(msgId) {
  const msgEl = document.getElementById(`msg-${msgId}`);
  if (!msgEl) return null;

  const body = msgEl.querySelector('.assistant-body');
  if (!body) return null;

  let thinking = body.querySelector('.tool-thinking-indicator');
  if (thinking) return thinking;

  const toolContainer = getToolActivityContainer(msgId);
  const meta = toolContainer?.parentElement;
  if (!meta) return null;

  thinking = document.createElement('div');
  thinking.className = 'thinking-indicator tool-thinking-indicator';
  thinking.innerHTML = '<span class="thinking-typewriter-text"></span>';

  const toolActivity = meta.querySelector('.tool-activity');
  if (toolActivity) meta.insertBefore(thinking, toolActivity.nextSibling);
  else meta.appendChild(thinking);

  startThinkingTypewriter(thinking);
  return thinking;
}

function hasRunningToolCalls(run) {
  return Array.from(run?.toolCalls?.values() || [])
    .some((tc) => (tc.status || 'complete') !== 'complete');
}

function showInlineThinking(run) {
  if (!run || run.content || hasRunningToolCalls(run)) return;

  const thinking = getInlineThinkingContainer(run.assistantMsgId);
  if (thinking && !state.userHasScrolledUp) scrollToEnd(false);
}

function hideInlineThinking(msgId) {
  const thinking = document.querySelector(`#msg-${msgId} .tool-thinking-indicator`);
  if (!thinking) return;
  thinking._stopThinkingTypewriter?.();
  thinking.remove();
}

function showToolActivityLine(tc, msgId) {
  const container = getToolActivityContainer(msgId);
  if (!container) return;

  container.querySelectorAll('.tool-activity-line.running').forEach((el) => {
    const otherId = el.id?.replace(/^tc-/, '');
    if (otherId && otherId !== tc.id) {
      completeToolActivityLine(otherId, msgId);
    }
  });

  let line = document.getElementById(`tc-${tc.id}`);
  if (!line) {
    line = document.createElement('div');
    line.className = 'tool-activity-line running';
    line.id = `tc-${tc.id}`;
    container.appendChild(line);
  } else {
    line.classList.remove('done', 'tool-file-edit-line', 'tool-edit-clickable');
    line.classList.add('running');
    line.removeAttribute('role');
    line.removeAttribute('tabindex');
  }
  line.innerHTML = `<span class="tool-activity-text">${escapeHtml(getToolActivityLabel(tc))}</span>`;
}

function showToolActivityLineInline(tc, msgId, chatId) {
  const msgEl = document.getElementById(`msg-${msgId}`);
  if (!msgEl) return;

  const body = msgEl.querySelector('.assistant-body');
  if (!body) return;

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
    const container = document.createElement('div');
    container.className = 'tool-activity';
    meta.appendChild(container);
    body.insertBefore(meta, contentEl);

    container.querySelectorAll('.tool-activity-line.running').forEach((el) => {
      const otherId = el.id?.replace(/^tc-/, '');
      if (otherId && otherId !== tc.id) {
        completeToolActivityLine(otherId, msgId);
      }
    });

    let line = document.getElementById(`tc-${tc.id}`);
    if (!line) {
      line = document.createElement('div');
      line.className = 'tool-activity-line running';
      line.id = `tc-${tc.id}`;
      container.appendChild(line);
    } else {
      line.classList.remove('done', 'tool-file-edit-line', 'tool-edit-clickable');
      line.classList.add('running');
      line.removeAttribute('role');
      line.removeAttribute('tabindex');
    }
    line.innerHTML = `<span class="tool-activity-text">${escapeHtml(getToolActivityLabel(tc))}</span>`;
  } else {
    showToolActivityLine(tc, msgId);
  }
}

function completeToolActivityLine(tcId, msgId) {
  const tc = findToolCallById(tcId);
  let line = document.getElementById(`tc-${tcId}`);
  if (!line) {
    const container = getToolActivityContainer(msgId);
    if (!container || !tc) return;
    line = document.createElement('div');
    line.className = 'tool-activity-line done';
    line.id = `tc-${tcId}`;
    container.appendChild(line);
  }
  if (!tc) return;
  line.classList.remove('running');
  line.classList.add('done');

  if (isFileMutationTool(tc.name)) {
    line.classList.add('tool-file-edit-line');
    if (isEditToolClickable(tc, false)) {
      line.classList.add('tool-edit-clickable');
      line.setAttribute('role', 'button');
      line.setAttribute('tabindex', '0');
    } else {
      line.classList.remove('tool-edit-clickable');
      line.removeAttribute('role');
      line.removeAttribute('tabindex');
    }
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
    const project = getSelectedProject();
    if (!project) {
      showToast('Open a folder first');
      openProjectFolder();
      return;
    }

    newChatFromWelcome = true;
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
    saveChatState();
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
  saveChatState();

  // Animate send button
  Physics.pulse(newChatFromWelcome ? dom.welcomeSendBtn : dom.chatSendBtn);

  scrollToEnd(false);
  state.isGenerating = true;
  syncSendButtonState();
  setChatRunning(chatId, true);

  runAIResponse(chatId, text.trim());
}

async function runAIResponse(chatId, userMessage) {
  const assistantMsgId = `msg-${state.nextMsgId++}`;
  const assistantMsg = {
    id: assistantMsgId,
    role: 'assistant',
    toolCalls: [],
    content: '',
    segments: [],
    eventLog: [],
  };
  state.chatMessages[chatId].push(assistantMsg);

  const thinkingEl = createThinkingIndicator();
  dom.messagesList.appendChild(thinkingEl);
  scrollToEnd(false);

  aiRuns.set(chatId, {
    chatId,
    assistantMsgId,
    thinkingEl,
    msgEl: null,
    toolCalls: new Map(),
    content: '',
    started: false,
    sessionId: null,
  });

  const modelId = state.selectedModelId;
  if (!modelId.startsWith('opencode/')) {
    const providerPrefix = modelId.split('/')[0];
    const hasKey = SettingsStore.getProviders().some(
      (p) => p.enabled
        && p.apiKey?.trim()
        && resolveOpencodeProviderId(p) === providerPrefix,
    );
    if (!hasKey) {
      stopThinkingIndicator(thinkingEl);
      const msgs = state.chatMessages[chatId];
      const idx = msgs.findIndex((m) => m.id === assistantMsgId);
      if (idx !== -1) msgs.splice(idx, 1);
      aiRuns.delete(chatId);
      finishAIWithError(
        chatId,
        'This model needs an API key. Open Settings → Providers, add your key, click Sync — or pick a free OpenCode model.',
      );
      return;
    }
  }

  if (typeof Backend === 'undefined' || !Backend.isAvailable()) {
    stopThinkingIndicator(thinkingEl);
    const msgs = state.chatMessages[chatId];
    const idx = msgs.findIndex((m) => m.id === assistantMsgId);
    if (idx !== -1) msgs.splice(idx, 1);
    aiRuns.delete(chatId);
    finishAIWithError(chatId, 'AI backend is not running');
    return;
  }

  try {
    await Backend.sendMessage({
      chatId,
      text: userMessage,
      modelId: state.selectedModelId,
      title: findChatById(chatId)?.title,
    });
  } catch (err) {
    finishAIWithError(chatId, err.message || 'Failed to send message');
  }
}

function ensureAssistantVisible(run) {
  if (run.started) return;
  run.started = true;
  stopThinkingIndicator(run.thinkingEl);

  const msg = state.chatMessages[run.chatId]?.find((m) => m.id === run.assistantMsgId);
  if (!msg) return;

  run.msgEl = renderMessage(msg, false);
}

function appendStreamFull(run, text) {
  if (!text) return;
  hideInlineThinking(run.assistantMsgId);
  run.content = text;

  const msg = state.chatMessages[run.chatId]?.find((m) => m.id === run.assistantMsgId);
  if (msg) {
    msg.content = run.content;
    if (msg.eventLog) msg.eventLog.push({ type: 'text', seq: msg.eventLog.length });
  }

  const contentEl = document.getElementById(`content-${run.assistantMsgId}`);
  if (!contentEl) return;

  contentEl.classList.add('is-streaming');
  contentEl.innerHTML = `
    <span class="md-stream-wrap">
      <span class="md-stream-body">${parseMarkdown(closeOpenFences(run.content))}</span>
    </span>
  `;

  if (!state.userHasScrolledUp) scrollToEnd(false);
}

function appendStreamDelta(run, delta) {
  if (!delta) return;
  hideInlineThinking(run.assistantMsgId);
  run.content += delta;

  const msg = state.chatMessages[run.chatId]?.find((m) => m.id === run.assistantMsgId);
  if (msg) {
    msg.content = run.content;
    if (msg.eventLog) msg.eventLog.push({ type: 'text', seq: msg.eventLog.length });
  }

  const contentEl = document.getElementById(`content-${run.assistantMsgId}`);
  if (!contentEl) return;

  contentEl.classList.add('is-streaming');
  contentEl.innerHTML = `
    <span class="md-stream-wrap">
      <span class="md-stream-body">${parseMarkdown(closeOpenFences(run.content))}</span>
    </span>
  `;

  if (!state.userHasScrolledUp) scrollToEnd(false);
}

function upsertToolCall(run, toolCall) {
  if (!toolCall?.id) return;

  const msg = state.chatMessages[run.chatId]?.find((m) => m.id === run.assistantMsgId);
  if (!msg) return;

  run.toolCalls.set(toolCall.id, toolCall);
  msg.toolCalls = Array.from(run.toolCalls.values());

  if ((toolCall.status === 'pending' || toolCall.status === 'running') && msg.eventLog) {
    msg.eventLog.push({ type: 'tool', seq: msg.eventLog.length });
  }

  if (toolCall.status === 'pending' || toolCall.status === 'running') {
    hideInlineThinking(run.assistantMsgId);
    if (toolCall.name === 'question') {
      syncInlineQuestion(run.assistantMsgId, {
        chatId: run.chatId,
        sessionId: run.sessionId,
        toolCallId: toolCall.id,
        questions: toolCall.args?.questions,
        requestId: null,
      });
    } else {
      showToolActivityLineInline(toolCall, run.assistantMsgId, run.chatId);
    }
  } else if (toolCall.status === 'complete') {
    if (toolCall.name === 'question') removeInlineQuestion(run.assistantMsgId);
    completeToolActivityLine(toolCall.id, run.assistantMsgId);
    showInlineThinking(run);
  }
}

function finalizeToolCallsUI(msgId, toolCalls) {
  if (!toolCalls?.length) return;
  for (const tc of toolCalls) {
    if (tc.status !== 'complete') tc.status = 'complete';
    completeToolActivityLine(tc.id, msgId);
  }
}

function applyLateToolUpdate(chatId, toolCall, sessionId = null) {
  if (!toolCall?.id) return;
  const msgs = state.chatMessages[chatId];
  if (!msgs?.length) return;

  const msg = [...msgs].reverse().find((m) => m.role === 'assistant');
  if (!msg) return;

  if (!msg.toolCalls) msg.toolCalls = [];
  const idx = msg.toolCalls.findIndex((t) => t.id === toolCall.id);
  if (idx >= 0) msg.toolCalls[idx] = toolCall;
  else msg.toolCalls.push(toolCall);

  if (toolCall.status === 'pending' || toolCall.status === 'running') {
    if (toolCall.name === 'question') {
      syncInlineQuestion(msg.id, {
        chatId,
        sessionId,
        toolCallId: toolCall.id,
        questions: toolCall.args?.questions,
        requestId: null,
      });
    } else {
      showToolActivityLine(toolCall, msg.id);
    }
  } else if (toolCall.status === 'complete') {
    if (toolCall.name === 'question') removeInlineQuestion(msg.id);
    completeToolActivityLine(toolCall.id, msg.id);
  }
  saveChatState();
}

function buildSegmentsFromDOM(msgId, chatId) {
  const msg = state.chatMessages[chatId]?.find((m) => m.id === msgId);
  if (!msg) return;
  const body = document.querySelector(`#msg-${msgId} .assistant-body`);
  if (!body) return;
  const segments = [];
  for (const child of body.children) {
    if (child.classList.contains('assistant-meta')) {
      const lines = child.querySelectorAll('.tool-activity-line');
      const toolCalls = [];
      lines.forEach((line) => {
        const id = line.id?.replace(/^tc-/, '');
        const tc = msg.toolCalls?.find((t) => t.id === id);
        if (tc) toolCalls.push(tc);
      });
      if (toolCalls.length) segments.push({ type: 'tools', toolCalls });
    } else if (child.classList.contains('md-content-segment')) {
      const text = child.textContent || '';
      if (text.trim()) segments.push({ type: 'content', text });
    } else if (child.classList.contains('md-content') && !child.classList.contains('md-content-segment')) {
      if (msg.content) {
        segments.push({ type: 'content', text: msg.content });
      }
    }
  }
  if (segments.length) msg.segments = segments;
}

function finalizeAssistantMessage(run) {
  const msg = state.chatMessages[run.chatId]?.find((m) => m.id === run.assistantMsgId);
  const contentEl = document.getElementById(`content-${run.assistantMsgId}`);
  hideInlineThinking(run.assistantMsgId);
  if (!contentEl || !msg) return;

  finalizeToolCallsUI(run.assistantMsgId, msg.toolCalls);

  contentEl.classList.remove('is-streaming');
  if (run.content) {
    contentEl.innerHTML = parseMarkdown(run.content);
    const body = contentEl.parentElement;
    if (body && !body.querySelector('.message-actions')) {
      const actionsWrapper = document.createElement('div');
      actionsWrapper.innerHTML = renderMessageActionsHTML();
      body.appendChild(actionsWrapper.firstElementChild);
    }
  } else if (!msg.toolCalls?.length) {
    contentEl.innerHTML = '<p><em>No response received.</em></p>';
  }

  buildSegmentsFromDOM(run.assistantMsgId, run.chatId);
}

function finishAIRun(chatId) {
  const run = aiRuns.get(chatId);
  if (!run) return;

  finalizeAssistantMessage(run);
  stopThinkingIndicator(run.thinkingEl);
  aiRuns.delete(chatId);
  state.isGenerating = false;
  syncSendButtonState();
  setChatRunning(chatId, false);
  saveChatState();
  focusInput(dom.chatInput);
}

function finishAIWithError(chatId, message) {
  const run = aiRuns.get(chatId);
  if (run) {
    hideInlineThinking(run.assistantMsgId);
    stopThinkingIndicator(run.thinkingEl);
    if (!run.started) {
      const msg = state.chatMessages[chatId]?.find((m) => m.id === run.assistantMsgId);
      if (msg) {
        msg.content = `**Error:** ${message}`;
        renderMessage(msg, false);
      }
    } else {
      run.content += `\n\n**Error:** ${message}`;
      finalizeAssistantMessage(run);
    }
    aiRuns.delete(chatId);
  }

  state.isGenerating = false;
  syncSendButtonState();
  setChatRunning(chatId, false);
  saveChatState();
  showToast(message);
  focusInput(dom.chatInput);
}

function handleBackendEvent(event) {
  if (!event?.chatId) return;

  if (event.type === 'question-request') {
    const msgId = resolveQuestionMsgId(event);
    if (msgId) syncInlineQuestion(msgId, event);
    return;
  }

  if (event.type === 'tool-update') {
    if (!aiRuns.has(event.chatId)) {
      applyLateToolUpdate(event.chatId, event.toolCall, event.sessionId);
    } else {
      const run = aiRuns.get(event.chatId);
      if (event.sessionId) run.sessionId = event.sessionId;
      ensureAssistantVisible(run);
      upsertToolCall(run, event.toolCall);
    }
    return;
  }

  const run = aiRuns.get(event.chatId);
  if (!run) return;

  switch (event.type) {
    case 'text-delta':
      ensureAssistantVisible(run);
      appendStreamDelta(run, event.text);
      break;
    case 'text-full':
      ensureAssistantVisible(run);
      appendStreamFull(run, event.text);
      break;
    case 'assistant-message':
      if (event.error) {
        const errMsg = event.error.data?.message || event.error.name || 'Model error';
        finishAIWithError(event.chatId, errMsg);
      }
      break;
    case 'done':
      finishAIRun(event.chatId);
      break;
    case 'error':
      finishAIWithError(event.chatId, event.message || 'AI request failed');
      break;
    default:
      break;
  }
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
    segments: [],
    eventLog: [],
  };
  state.chatMessages[chatId].push(assistantMsg);

  // Show thinking indicator first
  const thinkingEl = createThinkingIndicator();
  dom.messagesList.appendChild(thinkingEl);
  scrollToEnd(false);

  setTimeout(() => {
    stopThinkingIndicator(thinkingEl);

    const msgEl = renderMessage(assistantMsg, false);
    runResponsePhases(phases, assistantMsgId, chatId, msgEl, () => {
      state.isGenerating = false;
      syncSendButtonState();
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
    diff: (tc.name === 'edit' || tc.name === 'edit_file') ? getEditDiffForTool(tc) : undefined,
    result: null,
    status: 'pending',
    duration: tc.duration,
  }));
}

function attachDiffsToMessages() {
  for (const chatId of Object.keys(state.chatMessages)) {
    for (const msg of state.chatMessages[chatId]) {
      const allTools = [];
      if (msg.segments?.length) {
        for (const seg of msg.segments) {
          if (seg.type === 'tools' && seg.toolCalls) {
            allTools.push(...seg.toolCalls);
          }
        }
      } else if (msg.toolCalls?.length) {
        allTools.push(...msg.toolCalls);
      }
      for (const tc of allTools) {
        if ((tc.name === 'edit' || tc.name === 'edit_file') && !tc.diff) {
          tc.diff = getEditDiffForTool(tc);
        }
      }
    }
  }
}

function getEditDiffForTool(tc) {
  if (tc.diff) return tc.diff;
  const path = tc.args?.path || 'file';
  const sample = EDIT_DIFF_SAMPLES?.[path];
  if (sample) return { path, ...sample };

  const file = getFileBasename(path);
  return {
    path,
    hunks: [
      {
        lines: [
          { type: 'ctx', text: `// ${file}` },
          { type: 'del', text: '  // previous implementation' },
          { type: 'add', text: '  // updated implementation' },
          { type: 'ctx', text: '  return result;' },
        ],
      },
    ],
  };
}

function openEditDiffFromLine(lineEl) {
  const tcId = lineEl.id?.startsWith('tc-') ? lineEl.id.slice(3) : '';
  if (!tcId) return;
  const tc = findToolCallById(tcId);
  if (tc?.name === 'edit' || tc?.name === 'edit_file') openEditDiffPopup(tc);
}

function openEditDiffPopup(tc) {
  closeEditDiffPopup();

  const diff = getEditDiffForTool(tc);
  const file = getFileBasename(diff.path || tc.args?.path);
  const { adds, dels } = getToolLineStats(tc);
  let stats = '';
  if (adds > 0) stats += `<span class="tool-edit-stat tool-edit-stat-add">+${adds}</span>`;
  if (dels > 0) stats += `<span class="tool-edit-stat tool-edit-stat-del">-${dels}</span>`;
  const statsHtml = stats ? `<span class="diff-header-stats">${stats}</span>` : '';

  const overlay = document.createElement('div');
  overlay.className = 'diff-overlay';
  overlay.id = 'diffOverlay';
  overlay.innerHTML = `
    <div class="diff-modal" role="dialog" aria-modal="true" aria-label="Edit diff for ${escapeHtml(file)}">
      <div class="diff-header">
        <div class="diff-header-main">
          <span class="diff-header-label">Edited</span>
          <span class="diff-header-file">${escapeHtml(file)}</span>
          ${statsHtml}
        </div>
        <button type="button" class="diff-close-btn" aria-label="Close">&times;</button>
      </div>
      <div class="diff-body">${renderDiffHTML(diff)}</div>
    </div>
  `;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeEditDiffPopup();
  });
  overlay.querySelector('.diff-close-btn').addEventListener('click', () => closeEditDiffPopup());

  document.body.appendChild(overlay);

  const panel = overlay.querySelector('.diff-modal');
  Physics.modalIn(overlay, panel);
  document.addEventListener('keydown', editDiffKeyHandler);
  overlay.querySelector('.diff-close-btn').focus();
}

function renderDiffHTML(diff) {
  const hunks = diff?.hunks || [];
  if (!hunks.length) {
    return '<div class="diff-empty">No diff available</div>';
  }

  return hunks.map((hunk) => {
    const lines = (hunk.lines || []).map((line) => {
      const prefix = line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' ';
      return `
        <div class="diff-line diff-line-${line.type}">
          <span class="diff-line-prefix">${prefix}</span>
          <span class="diff-line-text">${escapeHtml(line.text)}</span>
        </div>
      `;
    }).join('');
    return `<div class="diff-hunk">${lines}</div>`;
  }).join('');
}

function closeEditDiffPopup(overlay = document.getElementById('diffOverlay')) {
  if (!overlay) return;
  document.removeEventListener('keydown', editDiffKeyHandler);
  const panel = overlay.querySelector('.diff-modal');
  Physics.modalOut(overlay, panel, () => overlay.remove());
}

function editDiffKeyHandler(e) {
  if (e.key === 'Escape') closeEditDiffPopup();
}

function runResponsePhases(phases, msgId, chatId, msgEl, onDone) {
  let phaseIdx = 0;

  function runNextPhase() {
    if (phaseIdx >= phases.length) {
      const msg = state.chatMessages[chatId]?.find((m) => m.id === msgId);
      if (msg) {
        msg.segments = msg.segments || [];
        if (msg.content) {
          msg.segments.push({ type: 'content', text: msg.content });
          msg.content = '';
        }
      }
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

  const body = msgEl.querySelector('.assistant-body');
  const contentEl = document.getElementById(`content-${msgId}`);
  const hasPriorText = Boolean(contentEl?.innerHTML.trim());

  const msg = state.chatMessages[chatId]?.find((m) => m.id === msgId);
  if (msg) {
    msg.segments = msg.segments || [];
    if (hasPriorText && msg.content) {
      msg.segments.push({ type: 'content', text: msg.content });
      msg.content = '';
    }
    msg.toolCalls = toolCalls;
    msg.segments.push({ type: 'tools', toolCalls });
  }

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
      if (msg.segments?.length) {
        for (const seg of msg.segments) {
          if (seg.type === 'tools') {
            const found = seg.toolCalls?.find((t) => t.id === tcId);
            if (found) return found;
          }
        }
      }
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

  if (!streamBody) {
    contentEl.classList.add('is-streaming');
    contentEl.innerHTML = '';
    const streamWrap = document.createElement('span');
    streamWrap.className = 'md-stream-wrap';
    streamBody = document.createElement('span');
    streamBody.className = 'md-stream-body';
    streamWrap.appendChild(streamBody);
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

function stopThinkingIndicator(el) {
  if (!el) return;
  el._stopThinkingTypewriter?.();
  el.remove();
}

function startThinkingTypewriter(el) {
  const textEl = el.querySelector('.thinking-typewriter-text');
  if (!textEl || !THINKING_MESSAGES?.length) return;

  let timer = null;
  let messageIdx = Math.floor(Math.random() * THINKING_MESSAGES.length);
  let charIdx = 0;
  let deleting = false;

  const rand = (min, max) => min + Math.random() * (max - min);

  function pickNextMessage() {
    if (THINKING_MESSAGES.length <= 1) return 0;
    let next = messageIdx;
    while (next === messageIdx) {
      next = Math.floor(Math.random() * THINKING_MESSAGES.length);
    }
    return next;
  }

  function typingDelay(char) {
    let delay = rand(28, 55);
    if (char === ' ') delay += rand(15, 45);
    if (char === '.' || char === ',' || char === '?' || char === '!') delay += rand(80, 200);
    if (char === '…') delay += rand(100, 220);
    if (Math.random() < 0.06) delay += rand(40, 120);
    return delay;
  }

  function schedule(ms, fn) {
    timer = setTimeout(fn, ms);
  }

  function tick() {
    if (!el.isConnected) {
      schedule(16, tick);
      return;
    }

    const message = THINKING_MESSAGES[messageIdx];

    if (!deleting) {
      charIdx += 1;
      textEl.textContent = message.slice(0, charIdx);

      if (charIdx >= message.length) {
        schedule(rand(1200, 2400), () => {
          deleting = true;
          tick();
        });
        return;
      }

      schedule(typingDelay(message[charIdx - 1]), tick);
      return;
    }

    charIdx -= 1;
    textEl.textContent = message.slice(0, charIdx);

    if (charIdx <= 0) {
      deleting = false;
      messageIdx = pickNextMessage();
      schedule(rand(200, 500), tick);
      return;
    }

    schedule(rand(12, 28), tick);
  }

  el._stopThinkingTypewriter = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  tick();
}

function createThinkingIndicator() {
  const el = document.createElement('div');
  el.className = 'message assistant';
  el.id = 'thinking-indicator';
  el.innerHTML = `
    <div class="message-wrapper">
      ${assistantAvatarHTML()}
      <div class="assistant-body">
        <div class="thinking-indicator">
          <span class="thinking-typewriter-text"></span>
        </div>
      </div>
    </div>
  `;
  startThinkingTypewriter(el);
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

function setupInput(textarea) {
  textarea.addEventListener('input', () => {
    // Auto-resize
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 180) + 'px';
    syncSendButtonState();
  });

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!textarea.value.trim() || state.isGenerating) return;
      const text = textarea.value;
      textarea.value = '';
      textarea.style.height = 'auto';
      syncSendButtonState();
      sendMessage(text);
    }
  });
}

function focusInput(input) {
  setTimeout(() => input.focus(), 0);
}

function syncSendButtonState() {
  dom.welcomeSendBtn.disabled = state.isGenerating || !dom.welcomeInput.value.trim();
  dom.chatSendBtn.disabled = state.isGenerating || !dom.chatInput.value.trim();
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
  syncSendButtonState();
  setChatRunning(state.selectedChatId, true);
  runAIResponse(state.selectedChatId, userText);
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
  setupInput(dom.welcomeInput);
  dom.welcomeSendBtn.addEventListener('click', () => {
    const text = dom.welcomeInput.value;
    if (!text.trim() || state.isGenerating) return;
    dom.welcomeInput.value = '';
    dom.welcomeInput.style.height = 'auto';
    syncSendButtonState();
    sendMessage(text);
  });

  // Chat input
  setupInput(dom.chatInput);
  dom.chatSendBtn.addEventListener('click', () => {
    const text = dom.chatInput.value;
    if (!text.trim() || state.isGenerating) return;
    dom.chatInput.value = '';
    dom.chatInput.style.height = 'auto';
    syncSendButtonState();
    sendMessage(text);
  });

  // Messages scroll
  dom.messagesList.addEventListener('scroll', onMessagesScroll);

  dom.messagesList.addEventListener('click', (e) => {
    const line = e.target.closest('.tool-edit-clickable');
    if (line) openEditDiffFromLine(line);

    const option = e.target.closest('.question-option');
    if (option) {
      const card = option.closest('.question-inline');
      if (card) toggleQuestionOption(option, card.dataset.msgId);
      return;
    }

    const submitBtn = e.target.closest('.question-submit-btn');
    if (submitBtn) {
      const card = submitBtn.closest('.question-inline');
      if (card) void submitInlineQuestion(card.dataset.msgId);
      return;
    }

    const skipBtn = e.target.closest('.question-skip-btn');
    if (skipBtn) {
      const card = skipBtn.closest('.question-inline');
      if (card) void dismissInlineQuestion(card.dataset.msgId);
    }
  });

  dom.messagesList.addEventListener('input', (e) => {
    const input = e.target.closest('.question-custom-input');
    if (!input) return;
    const card = input.closest('.question-inline');
    if (!card) return;
    const req = questionRequests.get(card.dataset.msgId);
    if (!req) return;
    const qIdx = Number(input.dataset.qidx);
    if (Number.isNaN(qIdx)) return;
    req.customAnswers[qIdx] = input.value;
    updateQuestionSubmitState(card.dataset.msgId);
  });

  dom.messagesList.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const line = e.target.closest('.tool-edit-clickable');
    if (!line) return;
    e.preventDefault();
    openEditDiffFromLine(line);
  });

  // Scroll to bottom button
  dom.scrollToBottom.addEventListener('click', () => scrollToEnd(false));

  // Sidebar nav
  document.querySelector('[data-action="new-chat"]').addEventListener('click', () => {
    if (!getSelectedProject()) {
      openProjectFolder();
      return;
    }
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
      if (!getSelectedProject()) {
        openProjectFolder();
        return;
      }
      showWelcomeScreen();
      focusInput(dom.welcomeInput);
    }
    // Cmd/Ctrl+O for open folder
    if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
      e.preventDefault();
      openProjectFolder();
    }
    // Escape to go back or close dropdowns
    if (e.key === 'Escape') {
      if (typeof TitlebarMenu !== 'undefined') TitlebarMenu.closeAllMenus();
      if (document.getElementById('diffOverlay')) {
        closeEditDiffPopup();
        return;
      }
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

  syncSendButtonState();
}

/* ============================================================
   QUESTION TOOL UI (inline in message)
   ============================================================ */

function normalizeQuestionList(questions) {
  if (!Array.isArray(questions)) return [];
  return questions
    .map((q) => {
      if (!q || typeof q !== 'object') return null;
      const prompt = q.question || q.prompt || q.text || '';
      const options = Array.isArray(q.options) ? q.options : [];
      if (!prompt && !options.length) return null;
      return {
        header: q.header || '',
        question: prompt,
        options: options.map((opt) => ({
          label: opt?.label || String(opt),
          description: opt?.description || '',
        })),
        multiple: Boolean(q.multiple || q.allow_multiple),
        custom: q.custom !== false,
      };
    })
    .filter(Boolean);
}

function resolveQuestionMsgId(event) {
  const run = aiRuns.get(event.chatId);
  if (run?.assistantMsgId) return run.assistantMsgId;

  const msgs = state.chatMessages[event.chatId] || [];
  if (event.toolCallId) {
    const match = [...msgs].reverse().find(
      (m) => m.role === 'assistant'
        && m.toolCalls?.some((tc) => tc.id === event.toolCallId),
    );
    if (match) return match.id;
  }

  const latest = [...msgs].reverse().find((m) => m.role === 'assistant');
  return latest?.id || null;
}

function syncInlineQuestion(msgId, event) {
  const questions = normalizeQuestionList(event.questions);
  if (!questions.length) return;

  let req = questionRequests.get(msgId);
  if (!req) {
    req = {
      requestId: event.requestId || null,
      toolCallId: event.toolCallId || null,
      chatId: event.chatId,
      sessionId: event.sessionId || null,
      questions,
      selections: questions.map(() => new Set()),
      customAnswers: questions.map(() => ''),
      submitting: false,
    };
    questionRequests.set(msgId, req);
  } else {
    if (event.requestId) req.requestId = event.requestId;
    if (event.sessionId) req.sessionId = event.sessionId;
    if (event.toolCallId) req.toolCallId = event.toolCallId;
    if (!req.questions.length) req.questions = questions;
  }

  mountInlineQuestionUI(msgId);

  if (!req.requestId && req.sessionId) {
    void attachInlineQuestionRequestId(msgId, req.sessionId);
  }

  if (!state.userHasScrolledUp) scrollToEnd(false);
}

function getInlineQuestionHost(msgId) {
  const body = document.querySelector(`#msg-${msgId} .assistant-body`);
  if (!body) return null;

  let card = body.querySelector('.question-inline');
  if (!card) {
    card = document.createElement('div');
    card.className = 'question-inline';
    card.dataset.msgId = msgId;
    const content = body.querySelector('.md-content');
    if (content) body.insertBefore(card, content);
    else body.appendChild(card);
  }
  return card;
}

function hideQuestionToolLine(msgId) {
  const req = questionRequests.get(msgId);
  if (!req?.toolCallId) return;
  document.getElementById(`tc-${req.toolCallId}`)?.remove();
}

function mountInlineQuestionUI(msgId) {
  const req = questionRequests.get(msgId);
  if (!req) return;

  const card = getInlineQuestionHost(msgId);
  if (!card) return;

  hideQuestionToolLine(msgId);
  card.innerHTML = renderInlineQuestionHTML(req, msgId);
  updateQuestionSubmitState(msgId);
  Physics.messageIn(card, { soft: true });
}

function renderInlineQuestionHTML(req, msgId) {
  const blocks = req.questions.map((q, qIdx) => {
    const allowMultiple = Boolean(q.multiple);
    const allowCustom = q.custom !== false;
    const selected = req.selections[qIdx] || new Set();

    const options = (q.options || []).map((opt, optIdx) => {
      const isSelected = selected.has(opt.label);
      return `
        <button
          type="button"
          class="question-option${isSelected ? ' is-selected' : ''}"
          data-qidx="${qIdx}"
          data-optidx="${optIdx}"
          aria-pressed="${isSelected ? 'true' : 'false'}"
        >
          <span class="question-option-marker" aria-hidden="true"></span>
          <span class="question-option-content">
            <span class="question-option-label">${escapeHtml(opt.label)}</span>
            ${opt.description ? `<span class="question-option-desc">${escapeHtml(opt.description)}</span>` : ''}
          </span>
        </button>
      `;
    }).join('');

    const customField = allowCustom ? `
      <input
        type="text"
        class="question-custom-input"
        data-qidx="${qIdx}"
        value="${escapeHtml(req.customAnswers[qIdx] || '')}"
        placeholder="Other…"
        aria-label="Custom answer for question ${qIdx + 1}"
      >
    ` : '';

    return `
      <div class="question-block" data-qidx="${qIdx}">
        ${q.header ? `<div class="question-block-header">${escapeHtml(q.header)}</div>` : ''}
        <p class="question-prompt">${escapeHtml(q.question)}</p>
        <div class="question-options${allowMultiple ? ' is-multiple' : ''}" data-multiple="${allowMultiple ? '1' : '0'}">
          ${options}
        </div>
        ${customField}
      </div>
    `;
  }).join('');

  return `
    <div class="question-inline-body">${blocks}</div>
    <div class="question-inline-footer">
      <button type="button" class="question-skip-btn">Dismiss</button>
      <button type="button" class="question-submit-btn" disabled>Continue</button>
    </div>
  `;
}

async function attachInlineQuestionRequestId(msgId, sessionId) {
  const req = questionRequests.get(msgId);
  if (!req || req.requestId || !sessionId) return;
  if (typeof Backend === 'undefined' || !Backend.isAvailable()) return;

  const requestId = await Backend.resolveQuestionRequestId(sessionId);
  if (!requestId) return;
  req.requestId = requestId;
  updateQuestionSubmitState(msgId);
}

function toggleQuestionOption(optionEl, msgId) {
  const req = questionRequests.get(msgId);
  const card = getInlineQuestionHost(msgId);
  if (!req || !card) return;

  const qIdx = Number(optionEl.dataset.qidx);
  const optIdx = Number(optionEl.dataset.optidx);
  if (Number.isNaN(qIdx) || Number.isNaN(optIdx)) return;

  const label = req.questions[qIdx]?.options?.[optIdx]?.label;
  if (!label) return;

  const block = card.querySelector(`.question-block[data-qidx="${qIdx}"]`);
  const isMultiple = block?.querySelector('.question-options')?.dataset.multiple === '1';
  const selected = req.selections[qIdx];

  if (isMultiple) {
    if (selected.has(label)) selected.delete(label);
    else selected.add(label);
  } else {
    selected.clear();
    selected.add(label);
  }

  block?.querySelectorAll('.question-option').forEach((btn) => {
    const btnOptIdx = Number(btn.dataset.optidx);
    const btnLabel = req.questions[qIdx]?.options?.[btnOptIdx]?.label;
    const isSelected = btnLabel && selected.has(btnLabel);
    btn.classList.toggle('is-selected', isSelected);
    btn.setAttribute('aria-pressed', isSelected ? 'true' : 'false');
  });

  updateQuestionSubmitState(msgId);
}

function buildQuestionAnswersFor(msgId) {
  const req = questionRequests.get(msgId);
  if (!req) return [];
  return req.questions.map((_, qIdx) => {
    const labels = Array.from(req.selections[qIdx]);
    const custom = req.customAnswers[qIdx]?.trim();
    if (custom) labels.push(custom);
    return labels;
  });
}

function isInlineQuestionComplete(msgId) {
  const answers = buildQuestionAnswersFor(msgId);
  return answers.length > 0 && answers.every((answer) => answer.length > 0);
}

function updateQuestionSubmitState(msgId) {
  const req = questionRequests.get(msgId);
  const card = getInlineQuestionHost(msgId);
  if (!req || !card) return;
  const submitBtn = card.querySelector('.question-submit-btn');
  if (!submitBtn) return;
  submitBtn.disabled = !isInlineQuestionComplete(msgId) || req.submitting;
}

async function submitInlineQuestion(msgId) {
  const req = questionRequests.get(msgId);
  if (!req || req.submitting) return;
  if (!isInlineQuestionComplete(msgId)) return;

  let { requestId, sessionId } = req;
  const answers = buildQuestionAnswersFor(msgId);
  req.submitting = true;
  updateQuestionSubmitState(msgId);

  try {
    if (typeof Backend === 'undefined' || !Backend.isAvailable()) {
      throw new Error('Backend unavailable');
    }

    if (!requestId && sessionId) {
      requestId = await Backend.resolveQuestionRequestId(sessionId);
      if (requestId) req.requestId = requestId;
    }
    if (!requestId) {
      throw new Error('Question is still registering. Wait a moment and try again.');
    }

    const result = await Backend.replyQuestion({ requestId, answers, sessionId });
    if (!result?.ok) throw new Error(result?.error || 'Failed to submit answers');
    removeInlineQuestion(msgId);
  } catch (err) {
    req.submitting = false;
    updateQuestionSubmitState(msgId);
    showToast(err.message || 'Failed to submit answers');
  }
}

async function dismissInlineQuestion(msgId) {
  const req = questionRequests.get(msgId);
  if (!req) {
    removeInlineQuestion(msgId);
    return;
  }

  const { requestId, sessionId } = req;
  try {
    if (typeof Backend !== 'undefined' && Backend.isAvailable()) {
      await Backend.rejectQuestion({ requestId, sessionId });
    }
  } catch (_) {
    /* reject may fail if already answered */
  }
  removeInlineQuestion(msgId);
}

function removeInlineQuestion(msgId) {
  questionRequests.delete(msgId);
  document.querySelector(`#msg-${msgId} .question-inline`)?.remove();
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
  let activePointerId = null;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;

  function endDrag() {
    dragging = false;
    activePointerId = null;
    if (!toast.isConnected) return;
    toast.classList.remove("toast-dragging");
    toastDismissTimer = setTimeout(() => dismissToast(toast), 800);
  }

  function onPointerDown(e) {
    if (e.button !== 0) return;

    dragging = true;
    activePointerId = e.pointerId;
    toast.classList.add("toast-dragging");
    clearToastTimers();

    const rect = toast.getBoundingClientRect();
    toast.style.right = "auto";
    toast.style.top = `${rect.top}px`;
    toast.style.left = `${rect.left}px`;
    toast.style.transform = "none";

    startX = e.clientX;
    startY = e.clientY;
    originX = rect.left;
    originY = rect.top;
    toast.setPointerCapture(activePointerId);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!dragging || e.pointerId !== activePointerId) return;

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
      if (activePointerId !== null) {
        toast.releasePointerCapture(activePointerId);
      }
      dismissToast(toast, false);
    }
  }

  function onPointerUp(e) {
    if (!dragging || e.pointerId !== activePointerId) return;
    if (activePointerId !== null) {
      toast.releasePointerCapture(activePointerId);
    }
    endDrag();
  }

  function onPointerCancel(e) {
    if (!dragging || e.pointerId !== activePointerId) return;
    activePointerId = null;
    dragging = false;
    toast.classList.remove("toast-dragging");
    if (!toast.isConnected) return;
    toastDismissTimer = setTimeout(() => dismissToast(toast), 800);
  }

  function onAuxClick(e) {
    if (e.button !== 1) return;
    e.preventDefault();
    dismissToast(toast);
  }

  toast.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
  toast.addEventListener("pointercancel", onPointerCancel);
  toast.addEventListener('auxclick', onAuxClick);

  return () => {
    toast.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    toast.removeEventListener("pointercancel", onPointerCancel);
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
