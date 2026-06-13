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
  sidebar:          $('sidebar'),
  projectsList:     $('projectsList'),
  welcomeScreen:    $('welcomeScreen'),
  chatScreen:       $('chatScreen'),
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
};

/* ============================================================
   INIT
   ============================================================ */

function init() {
  renderSidebar();
  initModelDropdowns();
  window.addEventListener('settings-changed', refreshModelDropdowns);
  showWelcomeScreen();
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

function closeAllModelDropdowns() {
  modelDropdowns.forEach((dropdown) => dropdown.close());
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
  const labelEl = container.querySelector('.model-selected-label');
  const options = Array.from(container.querySelectorAll('.model-option'));

  function close() {
    container.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    if (openModelDropdown === api) openModelDropdown = null;
  }

  function open() {
    closeAllModelDropdowns();
    container.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    openModelDropdown = api;
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

function setupWindowControls() {
  if (!window.electronAPI) return;
  dom.minimizeBtn.addEventListener('click', () => window.electronAPI.minimize());
  dom.maximizeBtn.addEventListener('click', () => window.electronAPI.maximize());
  dom.closeBtn.addEventListener('click', () => window.electronAPI.close());
  window.electronAPI.onWindowState((state) => {
    // Could update maximize icon here
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

function createChatItem(chat, projectId) {
  const item = document.createElement('div');
  item.className = `chat-item${chat.id === state.selectedChatId ? ' active' : ''}`;
  item.dataset.chatId = chat.id;
  item.dataset.projectId = projectId;

  item.innerHTML = `
    <span class="chat-item-title">${escapeHtml(chat.title)}</span>
    <span class="chat-item-time">${chat.time}</span>
  `;

  item.addEventListener('click', () => openChat(chat.id, chat.title, projectId));
  return item;
}

function toggleProject(projectId) {
  const isExpanded = state.expandedProjects.has(projectId);
  const chatsEl = document.getElementById(`chats-${projectId}`);
  const header = document.querySelector(`[data-project-id="${projectId}"] .project-header`);

  if (isExpanded) {
    state.expandedProjects.delete(projectId);
    chatsEl.classList.remove('expanded');
    chatsEl.classList.add('collapsed');
    header.classList.remove('expanded');
  } else {
    state.expandedProjects.add(projectId);
    chatsEl.classList.remove('collapsed');
    chatsEl.classList.add('expanded');
    header.classList.add('expanded');
  }

  state.selectedProjectId = projectId;
  updateProjectSelection();
}

function updateProjectSelection() {
  document.querySelectorAll('.project-header').forEach((h) => h.classList.remove('selected'));
  const selectedHeader = document.querySelector(`[data-project-id="${state.selectedProjectId}"] .project-header`);
  if (selectedHeader) selectedHeader.classList.add('selected');

  // Update welcome title
  const project = state.projects.find((p) => p.id === state.selectedProjectId);
  if (project) {
    dom.welcomeTitle.textContent = `What should we work on in ${project.name}?`;
  }
}

/* ============================================================
   SCREEN SWITCHING
   ============================================================ */

function showWelcomeScreen() {
  dom.welcomeScreen.style.display = 'flex';
  dom.chatScreen.style.display = 'none';
  state.selectedChatId = null;
  updateActiveChat();
  updateNavActive();
  setRandomWelcomeSubtitle();
  focusInput(dom.welcomeInput);
}

function showChatScreen(chatId, chatTitle, projectId) {
  dom.welcomeScreen.style.display = 'none';
  dom.chatScreen.style.display = 'flex';
  dom.chatTitle.textContent = chatTitle;
  updateNavActive();

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
  const onWelcome = dom.chatScreen.style.display === 'none';
  document.querySelectorAll('.sidebar-nav .nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.action === 'new-chat' && onWelcome);
  });
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
  if (!animate) el.style.animation = 'none';
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
          ${msg.toolCalls && msg.toolCalls.length ? renderToolCallsHTML(msg.toolCalls, msg.id) : ''}
          <div class="md-content" id="content-${msg.id}">${msg.content ? parseMarkdown(msg.content) : ''}</div>
          ${msg.content ? renderMessageActionsHTML() : ''}
        </div>
      </div>
    `;
    if (msg.toolCalls?.length) bindWorkingDropdown(el);
  }

  dom.messagesList.appendChild(el);
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
  const basename = (p) => (p ? String(p).split(/[/\\]/).pop() : '');

  switch (name) {
    case 'read_file':
      return args.path ? `Reading ${basename(args.path)}...` : 'Reading file...';
    case 'search_codebase':
      return args.query
        ? `Searching "${args.query}" in codebase...`
        : 'Searching codebase...';
    case 'write_file':
      return args.path ? `Writing ${basename(args.path)}...` : 'Writing file...';
    case 'create_file':
      return args.path ? `Creating ${basename(args.path)}...` : 'Creating file...';
    case 'edit_file':
      return args.path ? `Editing ${basename(args.path)}...` : 'Editing file...';
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
  const basename = (p) => (p ? String(p).split(/[/\\]/).pop() : '');

  switch (name) {
    case 'read_file':
      return args.path ? `Read ${basename(args.path)}` : 'Read file';
    case 'search_codebase':
      return args.query
        ? `Searched "${args.query}" in codebase`
        : 'Searched codebase';
    case 'write_file':
      return args.path ? `Wrote ${basename(args.path)}` : 'Wrote file';
    case 'create_file':
      return args.path ? `Created ${basename(args.path)}` : 'Created file';
    case 'edit_file':
      return args.path ? `Edited ${basename(args.path)}` : 'Edited file';
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

function renderWorkingDropdownHTML(toolCalls, msgId, expanded = false) {
  const items = toolCalls
    .map(
      (tc) =>
        `<div class="tool-working-item">${escapeHtml(getToolActivityLabelDone(tc))}</div>`
    )
    .join('');
  const count = toolCalls.length;
  const countLabel = count === 1 ? '1 step' : `${count} steps`;

  return `
    <div class="tool-working${expanded ? ' expanded' : ''}" id="tool-working-${msgId}">
      <button class="tool-working-trigger" type="button" aria-expanded="${expanded}">
        <span class="tool-working-label">Working</span>
        <span class="tool-working-count">${countLabel}</span>
        <svg class="tool-working-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div class="tool-working-panel">
        <div class="tool-working-items">${items}</div>
      </div>
    </div>
  `;
}

function bindWorkingDropdown(root) {
  root.querySelectorAll('.tool-working-trigger').forEach((trigger) => {
    if (trigger.dataset.bound) return;
    trigger.dataset.bound = 'true';
    trigger.addEventListener('click', () => {
      const wrap = trigger.closest('.tool-working');
      const isExpanded = wrap.classList.toggle('expanded');
      trigger.setAttribute('aria-expanded', String(isExpanded));
    });
  });
}

function showWorkingDropdown(msgId, toolCalls) {
  if (!toolCalls?.length) return;

  const msgEl = document.getElementById(`msg-${msgId}`);
  if (!msgEl) return;

  const activity = msgEl.querySelector('.tool-activity');
  if (activity) activity.remove();

  const body = msgEl.querySelector('.assistant-body');
  const content = body?.querySelector('.md-content');
  if (!body || !content || body.querySelector('.tool-working')) return;

  const wrap = document.createElement('div');
  wrap.innerHTML = renderWorkingDropdownHTML(toolCalls, msgId, false);
  body.insertBefore(wrap.firstElementChild, content);
  bindWorkingDropdown(body);
}

function renderToolCallsHTML(toolCalls, msgId) {
  if (!toolCalls?.length) return '';
  if (toolCalls.every((tc) => (tc.status || 'complete') === 'complete')) {
    return renderWorkingDropdownHTML(toolCalls, msgId, false);
  }
  return '<div class="tool-activity"></div>';
}

function getToolActivityContainer(msgId) {
  const msgEl = document.getElementById(`msg-${msgId}`);
  if (!msgEl) return null;
  let container = msgEl.querySelector('.tool-activity');
  if (!container) {
    container = document.createElement('div');
    container.className = 'tool-activity';
    const body = msgEl.querySelector('.assistant-body');
    const content = body?.querySelector('.md-content');
    if (body && content) body.insertBefore(container, content);
  }
  return container;
}

function showToolActivityLine(tc, msgId) {
  const container = getToolActivityContainer(msgId);
  if (!container) return;

  let line = document.getElementById(`tc-${tc.id}`);
  if (!line) {
    line = document.createElement('div');
    line.className = 'tool-activity-line running';
    line.id = `tc-${tc.id}`;
    line.innerHTML = `<span class="tool-activity-text">${escapeHtml(getToolActivityLabel(tc))}</span>`;
    container.appendChild(line);
  } else {
    line.classList.add('running');
    line.querySelector('.tool-activity-text').textContent = getToolActivityLabel(tc);
  }
}

function completeToolActivityLine(tcId, msgId) {
  const line = document.getElementById(`tc-${tcId}`);
  if (!line) return;

  line.classList.remove('running');
  line.classList.add('done');

  setTimeout(() => {
    line.remove();
    const msgEl = document.getElementById(`msg-${msgId}`);
    const container = msgEl?.querySelector('.tool-activity');
    if (container && !container.children.length) container.remove();
  }, 280);
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

  // If on welcome screen, create a new chat
  if (!state.selectedChatId) {
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
  renderMessage(userMsg, true);

  // Animate send button
  dom.chatSendBtn.classList.add('sending');
  setTimeout(() => dom.chatSendBtn.classList.remove('sending'), 300);

  scrollToEnd(false);
  state.isGenerating = true;
  disableSend(true);

  simulateAIResponse(chatId, text.trim());
}

function simulateAIResponse(chatId, userMessage) {
  const template = getAITemplate(userMessage);
  const toolCalls = template.toolCalls.map((tc, i) => ({
    id: `tc-${Date.now()}-${i}`,
    name: tc.name,
    args: tc.args || {},
    result: null,
    status: 'pending',
    duration: tc.duration,
  }));

  // Create assistant message placeholder
  const assistantMsgId = `msg-${state.nextMsgId++}`;
  const assistantMsg = {
    id: assistantMsgId,
    role: 'assistant',
    toolCalls: toolCalls,
    content: '',
  };
  state.chatMessages[chatId].push(assistantMsg);

  // Show thinking indicator first
  const thinkingEl = createThinkingIndicator();
  dom.messagesList.appendChild(thinkingEl);
  scrollToEnd(false);

  setTimeout(() => {
    thinkingEl.remove();

    // Render assistant message shell with tool calls in shimmer state
    const msgEl = renderMessage(assistantMsg, true);
    scrollToEnd(false);

    // Run tool calls sequentially
    runToolCallsSequentially(toolCalls, msgEl, assistantMsgId, chatId, () => {
      // After all tools done, stream the response text
      streamText(template.text, assistantMsgId, chatId, () => {
        state.isGenerating = false;
        disableSend(false);
        focusInput(dom.chatInput);
      });
    });
  }, 600);
}

function runToolCallsSequentially(toolCalls, msgEl, msgId, chatId, onDone) {
  let idx = 0;

  function runNext() {
    if (idx >= toolCalls.length) {
      showWorkingDropdown(msgId, toolCalls);
      onDone();
      return;
    }

    const tc = toolCalls[idx];
    idx++;

    // Set to running
    tc.status = 'running';
    updateToolCallUI(tc.id, 'running', msgId);
    scrollToEnd(false);

    setTimeout(() => {
      tc.status = 'complete';
      tc.result = generateToolResult(tc.name, chatId);
      updateToolCallUI(tc.id, 'complete', msgId);
      scrollToEnd(false);

      setTimeout(runNext, 200);
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

function streamText(fullText, msgId, chatId, onDone) {
  const contentEl = document.getElementById(`content-${msgId}`);
  if (!contentEl) { onDone(); return; }

  // Add cursor
  const cursor = document.createElement('span');
  cursor.className = 'streaming-cursor';
  contentEl.appendChild(cursor);
  scrollToEnd(false);

  // Split by words for smooth streaming
  const words = fullText.split(/(\s+)/);
  let currentText = '';
  let wordIdx = 0;
  const baseDelay = 18;

  // Update the message in state to final text
  const msgs = state.chatMessages[chatId];
  const msgInState = msgs?.find((m) => m.id === msgId);
  if (msgInState) msgInState.content = fullText;

  function addNextChunk() {
    if (wordIdx >= words.length) {
      cursor.remove();
      // Add message actions
      const actionsWrapper = document.createElement('div');
      actionsWrapper.innerHTML = renderMessageActionsHTML();
      contentEl.parentElement.appendChild(actionsWrapper.firstElementChild);
      onDone();
      return;
    }

    // Add 1-3 words at a time for more natural feel
    const chunkSize = wordIdx === 0 ? 1 : Math.floor(Math.random() * 3) + 1;
    for (let i = 0; i < chunkSize && wordIdx < words.length; i++) {
      currentText += words[wordIdx++];
    }

    contentEl.innerHTML = parseMarkdown(currentText);
    contentEl.appendChild(cursor);

    // Auto-scroll if near bottom
    if (!state.userHasScrolledUp) {
      scrollToEnd(false);
    }

    const delay = baseDelay + Math.random() * 10;
    setTimeout(addNextChunk, delay);
  }

  setTimeout(addNextChunk, 100);
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
  if (instant) {
    list.scrollTop = list.scrollHeight;
  } else {
    list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }
  state.userHasScrolledUp = false;
  dom.scrollToBottom.style.display = 'none';
}

function onMessagesScroll() {
  const list = dom.messagesList;
  const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
  state.userHasScrolledUp = distanceFromBottom > 80;
  dom.scrollToBottom.style.display = state.userHasScrolledUp && state.isGenerating ? 'flex' : 'none';
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

  const field = document.getElementById('searchField');
  field.focus();

  field.addEventListener('input', () => {
    const query = field.value.toLowerCase();
    const filtered = allChats.filter((c) =>
      c.title.toLowerCase().includes(query) || c.projectName.toLowerCase().includes(query)
    );
    document.getElementById('searchResults').innerHTML = renderSearchResults(filtered, query);
    // Re-bind click handlers
    bindSearchResults(overlay);
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
  overlay.classList.add('fade-out');
  document.removeEventListener('keydown', searchKeyHandler);
  setTimeout(() => overlay.remove(), 200);
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
  const placeholders = [
    'Ask anything...',
    'Refactor my authentication module...',
    'Debug this TypeScript error...',
    'Write tests for my API endpoints...',
    'Explain how this code works...',
    'Create a React component for...',
    'Optimize my database queries...',
  ];
  let idx = 0;

  function cycle() {
    idx = (idx + 1) % placeholders.length;
    dom.welcomeInput.setAttribute('placeholder', placeholders[idx]);
  }

  setInterval(cycle, 3500);
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
  });
}

/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */

function showToast(message) {
  const existing = document.getElementById('toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => toast.classList.add('toast-visible'));
  });

  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

/* ============================================================
   BOOTSTRAP
   ============================================================ */

document.addEventListener('DOMContentLoaded', init);
