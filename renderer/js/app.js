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

function normalizePersistedChatState(parsed) {
  if (!parsed?.projects?.length) return null;

  parsed.projects = parsed.projects.filter(
    (p) => p.folderPath && !LEGACY_PROJECT_IDS.has(p.id),
  );
  if (!parsed.projects.length) return null;

  for (const project of parsed.projects) {
    for (const chat of project.chats || []) {
      if (chat.running) chat.unfinished = true;
      delete chat.running;
    }
  }

  const validChatIds = new Set();
  for (const project of parsed.projects) {
    for (const chat of project.chats || []) {
      validChatIds.add(chat.id);
      if (!parsed.chatMessages) parsed.chatMessages = {};
      if (!parsed.chatMessages[chat.id]) parsed.chatMessages[chat.id] = [];
    }
  }

  for (const chatId of Object.keys(parsed.chatMessages || {})) {
    if (!validChatIds.has(chatId)) delete parsed.chatMessages[chatId];
  }

  for (const chatId of Object.keys(parsed.chatMessages || {})) {
    const preserve = shouldPreserveIncompleteMessages(chatId, parsed.projects);
    parsed.chatMessages[chatId] = preserve
      ? parsed.chatMessages[chatId]
      : pruneEmptyAssistantMessages(parsed.chatMessages[chatId]);
  }

    for (const project of parsed.projects) {
      for (const chat of project.chats || []) {
        const msgs = parsed.chatMessages[chat.id] || [];
        for (const msg of msgs) {
          markContinuePromptUserMessage(msg);
        }
        if (chat.unfinished) {
          for (let i = msgs.length - 1; i >= 0; i--) {
            const msg = msgs[i];
            if (isContinuePromptUserMessage(msg) || isEmptyAssistantMessage(msg)) continue;
            if (msg.role === 'assistant' && msg.finished !== true) msg.finished = false;
            break;
          }
        }
        chat.unfinished = chatNeedsRecoveryFromMessages(msgs);
      }
    }

  const validIds = new Set(parsed.projects.map((p) => p.id));
  if (!validIds.has(parsed.selectedProjectId)) {
    parsed.selectedProjectId = parsed.projects[0]?.id || null;
  }

  if (parsed.selectedChatId && !validChatIds.has(parsed.selectedChatId)) {
    parsed.selectedChatId = null;
  }

  return parsed;
}

function loadPersistedChatState() {
  let parsed = null;
  let loadedFromLocalStorage = false;

  try {
    if (window.electronAPI?.loadChatsSync) {
      parsed = window.electronAPI.loadChatsSync();
    }
  } catch (err) {
    console.error('Failed to load chat state file:', err);
  }

  if (!parsed) {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (!raw) return null;
      parsed = JSON.parse(raw);
      loadedFromLocalStorage = true;
    } catch {
      return null;
    }
  }

  const normalized = normalizePersistedChatState(parsed);
  if (!normalized) {
    if (loadedFromLocalStorage) localStorage.removeItem(CHAT_STORAGE_KEY);
    return null;
  }

  if (loadedFromLocalStorage) normalized._migrateToFile = true;
  return normalized;
}

function isEmptyAssistantMessage(msg) {
  if (msg.role !== 'assistant') return false;
  const hasContent = Boolean(msg.content?.trim());
  const hasTools = Boolean(msg.toolCalls?.length)
    || Boolean(msg.segments?.some((seg) => seg.type === 'tools' && seg.toolCalls?.length));
  const hasSegmentText = Boolean(msg.segments?.some(
    (seg) => seg.type === 'content' && seg.text?.trim(),
  ));
  return !hasContent && !hasTools && !hasSegmentText;
}

function isEmptyUserMessage(msg) {
  return msg.role === 'user' && !msg.content?.trim() && !msg.images?.length;
}

function isContinuePromptUserMessage(msg) {
  return msg.role === 'user'
    && (msg.hidden || /^continue$/i.test(msg.content?.trim() || ''));
}

function markContinuePromptUserMessage(msg) {
  if (isContinuePromptUserMessage(msg)) msg.hidden = true;
}

function isHiddenMessage(msg) {
  return isContinuePromptUserMessage(msg);
}

function shouldSkipMessageRender(msg) {
  return isEmptyMessage(msg) || isHiddenMessage(msg);
}

function isEmptyMessage(msg) {
  if (msg.role === 'user') return isEmptyUserMessage(msg);
  if (msg.role === 'assistant') return isEmptyAssistantMessage(msg);
  return false;
}

function removeMessageElement(msgId) {
  document.getElementById(`msg-${msgId}`)?.remove();
}

function pruneEmptyAssistantMessages(messages = []) {
  return messages.filter((msg) => !isEmptyAssistantMessage(msg));
}

function pruneTrailingEmptyAssistants(chatId) {
  const msgs = state.chatMessages[chatId];
  if (!msgs?.length) return;
  while (msgs.length > 0) {
    const last = msgs[msgs.length - 1];
    if (last.role !== 'assistant' || !isEmptyAssistantMessage(last)) break;
    msgs.pop();
  }
}

function isAssistantResponseComplete(msg) {
  if (!msg || msg.role !== 'assistant') return false;
  if (msg.finished === true) return true;
  if (msg.finished === false) return false;
  return !isEmptyAssistantMessage(msg);
}

function chatNeedsRecoveryFromMessages(msgs = []) {
  if (!msgs.length) return true;

  const last = msgs[msgs.length - 1];
  if (last.role === 'assistant' && isEmptyAssistantMessage(last)) return true;

  for (let i = msgs.length - 1; i >= 0; i--) {
    const msg = msgs[i];
    if (isContinuePromptUserMessage(msg)) continue;
    if (isEmptyAssistantMessage(msg)) continue;
    if (msg.role === 'assistant') return !isAssistantResponseComplete(msg);
    if (msg.role === 'user') return true;
  }
  return true;
}

function chatNeedsRecovery(chatId) {
  return chatNeedsRecoveryFromMessages(state.chatMessages[chatId] || []);
}

function isChatUnfinished(chatId) {
  if (isChatGenerating(chatId)) return false;
  const needsRecovery = chatNeedsRecovery(chatId);
  const chat = findChatById(chatId);
  if (chat) chat.unfinished = needsRecovery;
  return needsRecovery;
}

function shouldPreserveIncompleteMessages(chatId, projects = state.projects) {
  for (const project of projects) {
    const chat = project.chats?.find((c) => c.id === chatId);
    if (chat && (chat.unfinished || chat.running)) return true;
  }
  return false;
}

function serializeMessagesForPersistence(chatId, messages = []) {
  const preserveIncomplete = shouldPreserveIncompleteMessages(chatId);
  const msgs = preserveIncomplete ? messages : pruneEmptyAssistantMessages(messages);
  return msgs.map((msg) => {
    const { eventLog, ...rest } = msg;
    return rest;
  });
}

function sanitizeChatMessagesForPersistence(chatMessages) {
  const sanitized = {};
  for (const [chatId, msgs] of Object.entries(chatMessages)) {
    sanitized[chatId] = serializeMessagesForPersistence(chatId, msgs);
  }
  return sanitized;
}

let saveChatStateTimer = null;
let suppressChatPersistence = false;

function scheduleSaveChatState() {
  if (suppressChatPersistence) return;
  clearTimeout(saveChatStateTimer);
  saveChatStateTimer = setTimeout(saveChatState, 400);
}

function buildChatStatePayload() {
  for (const project of state.projects) {
    for (const chat of project.chats || []) {
      if (!state.chatMessages[chat.id]) state.chatMessages[chat.id] = [];
    }
  }

  return {
    projects: state.projects,
    chatMessages: sanitizeChatMessagesForPersistence(state.chatMessages),
    nextMsgId: state.nextMsgId,
    selectedProjectId: state.selectedProjectId,
    selectedChatId: state.selectedChatId,
    expandedChatLists: Array.from(state.expandedChatLists),
  };
}

function saveChatState() {
  if (suppressChatPersistence) return;
  clearTimeout(saveChatStateTimer);
  saveChatStateTimer = null;
  try {
    const payload = buildChatStatePayload();
    const json = JSON.stringify(payload);

    if (window.electronAPI?.saveChatsSync) {
      const saved = window.electronAPI.saveChatsSync(payload);
      if (!saved) console.error('Failed to save chats to disk');
    }

    try {
      localStorage.setItem(CHAT_STORAGE_KEY, json);
    } catch (err) {
      if (err?.name === 'QuotaExceededError') {
        const slimPayload = {
          ...payload,
          chatMessages: sanitizeChatMessagesForPersistence(
            Object.fromEntries(
              Object.entries(state.chatMessages).map(([chatId, msgs]) => [
                chatId,
                msgs.map((msg) => ({
                  id: msg.id,
                  role: msg.role,
                  content: msg.content || '',
                  toolCalls: msg.toolCalls || [],
                  segments: msg.segments || [],
                })),
              ]),
            ),
          ),
        };
        const slimJson = JSON.stringify(slimPayload);
        if (window.electronAPI?.saveChatsSync) {
          window.electronAPI.saveChatsSync(slimPayload);
        }
        localStorage.setItem(CHAT_STORAGE_KEY, slimJson);
      } else {
        throw err;
      }
    }
  } catch (err) {
    console.error('Failed to save chats:', err);
  }
}

if (typeof window !== 'undefined') {
  window.saveChatState = saveChatState;
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
    const migrateToFile = Boolean(saved._migrateToFile);
    delete saved._migrateToFile;
    return {
      projects: saved.projects,
      selectedProjectId: saved.selectedProjectId,
      selectedChatId: saved.selectedChatId || null,
      expandedProjects: new Set(expanded),
      expandedChatLists: new Set(saved.expandedChatLists || []),
      chatMessages: saved.chatMessages || {},
      nextMsgId: saved.nextMsgId || 1000,
      isGenerating: false,
      userHasScrolledUp: false,
      selectedModelId: loadSelectedModelId(saved),
      migrateChatStateToFile: migrateToFile,
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
const pendingImages = { welcome: [], chat: [] };
let nextImageId = 1;

function getInputContext(textarea) {
  return textarea === dom.welcomeInput ? 'welcome' : 'chat';
}

function createPendingImage({ name, dataUrl }) {
  return {
    id: `img-${nextImageId++}`,
    name: name || 'Image',
    dataUrl,
  };
}

function getPendingImages(context) {
  return pendingImages[context] || [];
}

function clearPendingImages(context) {
  pendingImages[context] = [];
  renderPendingImages(context);
}

function addPendingImages(context, images) {
  if (!images?.length) return;
  pendingImages[context].push(...images.map(createPendingImage));
  renderPendingImages(context);
  syncSendButtonState();
}

function removePendingImage(context, imageId) {
  pendingImages[context] = pendingImages[context].filter((img) => img.id !== imageId);
  renderPendingImages(context);
  syncSendButtonState();
}

function renderPendingImages(context) {
  const container = context === 'welcome' ? dom.welcomeAttachments : dom.chatAttachments;
  if (!container) return;

  const images = getPendingImages(context);
  if (!images.length) {
    container.innerHTML = '';
    container.hidden = true;
    return;
  }

  container.hidden = false;
  container.innerHTML = images.map((img) => `
    <div class="input-attachment" data-image-id="${escapeHtml(img.id)}">
      <img src="${img.dataUrl}" alt="${escapeHtml(img.name)}" />
      <button class="input-attachment-remove" type="button" data-action="remove-pending-image" data-image-id="${escapeHtml(img.id)}" title="Remove">×</button>
    </div>
  `).join('');
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

function isImageFile(file) {
  if (file.type.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif|heic|heif)$/i.test(file.name || '');
}

async function addImageFilesToContext(context, files) {
  if (!files?.length) return;
  if (context === 'chat' && isChatGenerating(state.selectedChatId)) {
    showToast('Wait for the current response to finish');
    return;
  }
  if (!SettingsStore.canProcessImages()) {
    showToast('Connect OpenRouter and enable image processing in Settings');
    return;
  }

  const imageFiles = files.filter(isImageFile);
  if (!imageFiles.length) {
    showToast('Only image files can be attached');
    return;
  }

  const images = await Promise.all(imageFiles.map(async (file) => ({
    name: file.name || 'Image',
    dataUrl: await readFileAsDataUrl(file),
  })));
  addPendingImages(context, images);
}

async function pickImagesForContext(context) {
  if (!SettingsStore.canProcessImages()) {
    showToast('Connect OpenRouter and enable image processing in Settings');
    return;
  }

  if (window.electronAPI?.openImageDialog) {
    const picked = await window.electronAPI.openImageDialog();
    addPendingImages(context, picked);
    return;
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.multiple = true;
  input.onchange = async () => {
    await addImageFilesToContext(context, [...(input.files || [])]);
  };
  input.click();
}

async function addPastedImages(context, items) {
  const files = [];
  for (const item of items) {
    if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
    const file = item.getAsFile();
    if (file) files.push(file);
  }
  await addImageFilesToContext(context, files);
}

function transferHasImageFiles(dataTransfer) {
  if (!dataTransfer) return false;
  if ([...(dataTransfer.types || [])].includes('Files')) return true;
  return [...(dataTransfer.items || [])].some(
    (item) => item.kind === 'file' && item.type.startsWith('image/'),
  );
}

function collectImageFilesFromTransfer(dataTransfer) {
  const files = [];
  const seen = new Set();
  for (const file of dataTransfer?.files || []) {
    if (!isImageFile(file)) continue;
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (seen.has(key)) continue;
    seen.add(key);
    files.push(file);
  }
  return files;
}

function formatMessageWithImageDescriptions(text, images) {
  const parts = (images || [])
    .filter((img) => img.description?.trim())
    .map((img, index) => {
      const label = img.name || `Image ${index + 1}`;
      return `[${label}]\n${img.description.trim()}`;
    });

  const body = text?.trim() || '';
  if (!parts.length) return body;
  if (!body) return parts.join('\n\n');
  return `${parts.join('\n\n')}\n\n${body}`;
}

function getUserMessageModelContent(msg) {
  if (msg.modelContent?.trim()) return msg.modelContent.trim();
  if (msg.images?.length) return formatMessageWithImageDescriptions(msg.content || '', msg.images);
  return msg.content?.trim() || '';
}

async function describeImagesForMessage(images) {
  const apiKey = SettingsStore.getOpenRouterApiKey();
  if (!apiKey) throw new Error('OpenRouter API key is required for image processing');

  const toDescribe = images.filter((img) => !img.description?.trim());
  if (!toDescribe.length) return images;

  if (!window.electronAPI?.describeImages) {
    throw new Error('Image processing is unavailable in this environment');
  }

  const described = await window.electronAPI.describeImages({
    apiKey,
    images: toDescribe.map(({ id, dataUrl }) => ({ id, dataUrl })),
  });

  for (const result of described) {
    const image = images.find((img) => img.id === result.id);
    if (image) image.description = result.description;
  }

  return images;
}

async function prepareUserMessageForModel(userMsg) {
  const text = userMsg.content?.trim() || '';
  const images = userMsg.images?.length ? userMsg.images.map((img) => ({ ...img })) : [];

  if (!images.length) {
    userMsg.modelContent = text;
    return text;
  }

  if (!SettingsStore.canProcessImages()) {
    throw new Error('Connect OpenRouter and enable image processing to send images');
  }

  await describeImagesForMessage(images);
  userMsg.images = images;
  const modelContent = formatMessageWithImageDescriptions(text, images);
  userMsg.modelContent = modelContent;
  return modelContent;
}

function renderUserMessageImagesHTML(images) {
  if (!images?.length) return '';
  return `
    <div class="user-message-attachments">
      ${images.map((img) => `
        <figure class="user-message-attachment">
          <img
            src="${img.dataUrl}"
            alt="${escapeHtml(img.name || 'Attached image')}"
            title="${escapeHtml(img.name || 'Attached image')}"
            loading="lazy"
          />
        </figure>
      `).join('')}
    </div>
  `;
}

function renderUserMessageHTML(msg) {
  const text = msg.content?.trim() || '';
  const imagesHtml = renderUserMessageImagesHTML(msg.images);
  const textHtml = text
    ? `<div class="user-bubble">${escapeHtml(text)}</div>`
    : '';

  return `
    <div class="message-wrapper">
      <div class="user-message-stack">
        ${imagesHtml}
        ${textHtml}
        <div class="message-actions">
          <button class="msg-action-btn" onclick="copyMessageContent(this)">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
              <rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/>
              <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2"/>
            </svg>
            Copy
          </button>
        </div>
      </div>
    </div>
  `;
}

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

async function selectProject(projectId) {
  if (projectId === state.selectedProjectId) return;
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return;

  state.selectedProjectId = projectId;
  state.expandedProjects.add(projectId);
  await setActiveProjectWorkspace(projectId);
  renderSidebar();
  updateProjectSelection();
  saveChatState();
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
let backendReadyPromise = null;
const chatsNeedingContextSync = new Set();
const abortedChatIds = new Set();
const interruptGuard = new Map();
const chatRunGenerations = new Map();
const aiRuns = new Map();
const questionRequests = new Map();
const permissionRequests = new Map();

function isChatGenerating(chatId) {
  return Boolean(chatId && aiRuns.has(chatId));
}

function bumpChatRunGeneration(chatId) {
  const next = (chatRunGenerations.get(chatId) || 0) + 1;
  chatRunGenerations.set(chatId, next);
  return next;
}

function isActiveRunGeneration(chatId, run) {
  if (!run || run.generation == null) return false;
  return run.generation === chatRunGenerations.get(chatId);
}

function isCurrentChatVisible(chatId) {
  return chatId === state.selectedChatId;
}

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
  welcomeAttachBtn: $('welcomeAttachBtn'),
  welcomeAttachments: $('welcomeAttachments'),
  welcomeTitle:     $('welcomeTitle'),
  welcomeSubtitle:  $('welcomeSubtitle'),
  welcomeProjectDropdown: $('welcomeProjectDropdown'),
  chatInput:        $('chatInput'),
  chatSendBtn:      $('chatSendBtn'),
  chatAttachBtn:    $('chatAttachBtn'),
  chatAttachments:  $('chatAttachments'),
  continueSuggestion: $('continueSuggestion'),
  continueSuggestionBtn: $('continueSuggestionBtn'),
  chatTitle:        $('chatTitle'),
  chatMoreBtn:      $('chatMoreBtn'),
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

let appStartupComplete = false;
const pendingStartupToasts = [];
let updateNotificationShown = false;
let activeUpdateToast = null;
let pendingUpdateStatus = null;
let updateInstallActive = false;

function signalShellReady() {
  window.electronAPI?.signalShellReady?.();
}

function hideStartupLoader() {
  return new Promise((resolve) => {
    const loader = document.getElementById('startupLoader');
    if (!loader) {
      document.body.classList.remove('startup-loading');
      resolve();
      return;
    }
    document.getElementById('startupLoaderText')?._stopThinkingTypewriter?.();
    loader.setAttribute('aria-busy', 'false');
    Physics.animate(loader, { opacity: 0 }, {
      preset: 'soft',
      onComplete: () => {
        loader.remove();
        document.body.classList.remove('startup-loading');
        resolve();
      },
    });
  });
}

async function finishStartup() {
  await hideStartupLoader();
  appStartupComplete = true;
  window.electronAPI?.signalAppReady?.();

  for (const message of pendingStartupToasts.splice(0)) {
    showToast(message);
  }

  if (pendingUpdateStatus) {
    handleUpdateStatus(pendingUpdateStatus);
    pendingUpdateStatus = null;
  }

  if (!state.selectedChatId) {
    const content = dom.welcomeScreen.querySelector('.welcome-content');
    if (content) {
      Physics.stagger(content, '.welcome-title, .welcome-subtitle', {
        opacity: 0,
        y: 14,
        scale: 0.98,
      }, { preset: 'gentle', delay: 50 });
    }
    focusInput(dom.welcomeInput);
  } else {
    focusInput(dom.chatInput);
  }
}

async function init() {
  signalShellReady();

  if (state.migrateChatStateToFile) {
    delete state.migrateChatStateToFile;
    saveChatState();
  }

  const loaderText = document.getElementById('startupLoaderText');
  if (loaderText) startThinkingTypewriter(loaderText);

  Physics.init();
  attachDiffsToMessages();
  initializeContextSyncQueue();

  renderSidebar();
  initModelDropdowns();
  initWelcomeProjectDropdown();
  restoreActiveScreen({ silent: true });

  await initBackend();

  if (state.selectedChatId) {
    renderMessages(state.selectedChatId);
  }
  renderSidebar();
  updateProjectSelection();

  window.addEventListener('settings-changed', refreshModelDropdowns);
  window.addEventListener('models-loading', (e) => {
    modelsLoading = Boolean(e.detail?.loading);
    syncModelDropdownLabels();
  });

  bindEvents();
  if (typeof SidebarContextMenu !== 'undefined') SidebarContextMenu.bind();
  setupWindowControls();
  setupUpdateListener();
  animateWelcomeInputPlaceholders();
  window.addEventListener('beforeunload', saveChatState);
  window.addEventListener('pagehide', saveChatState);
  window.electronAPI?.onAppSaveState?.(() => saveChatState());

  await finishStartup();
}

function initBackend() {
  if (typeof Backend === 'undefined' || !Backend.isAvailable()) {
    modelsLoading = false;
    showToast('AI backend unavailable - restart the app');
    syncModelDropdownLabels();
    return Promise.resolve();
  }

  modelsLoading = true;
  syncModelDropdownLabels();

  Backend.onEvent(handleBackendEvent);

  backendReadyPromise = Backend.ensureReady()
    .then((status) => {
      if (!status?.running) {
        showToast(status?.error || 'Failed to start AI backend');
        return;
      }
      return setActiveProjectWorkspace(state.selectedProjectId);
    })
    .then(() => syncChatSessionsToBackend())
    .then(() => recoverChatsFromBackend())
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

  return backendReadyPromise;
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
    closeWelcomeProjectDropdown(true);
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

function findChatProject(chatId) {
  return state.projects.find((p) => p.chats?.some((c) => c.id === chatId)) || null;
}

function getChatSessionId(chatId) {
  return findChatById(chatId)?.sessionId || null;
}

function setChatSessionId(chatId, sessionId) {
  const chat = findChatById(chatId);
  if (!chat || !sessionId || chat.sessionId === sessionId) return;
  chat.sessionId = sessionId;
  saveChatState();
}

function getChatWorkspace(chatId) {
  return findChatProject(chatId)?.folderPath || null;
}

function buildHistoryForBackend(chatId, excludeMsgId = null) {
  const msgs = state.chatMessages[chatId] || [];
  const filtered = msgs
    .filter((m) => {
      if (m.id === excludeMsgId) return false;
      if (m.role === 'user') return Boolean(m.content?.trim()) || Boolean(m.images?.length);
      if (m.role === 'assistant') return Boolean(m.content?.trim());
      return false;
    })
    .map((m) => ({
      role: m.role,
      content: m.role === 'user' ? getUserMessageModelContent(m) : m.content.trim(),
    }))
    .filter((m) => Boolean(m.content?.trim()));
  return filtered;
}

function collectChatSessionMappings() {
  const mappings = [];
  for (const project of state.projects) {
    for (const chat of project.chats || []) {
      if (chat.sessionId) {
        mappings.push({
          chatId: chat.id,
          sessionId: chat.sessionId,
          workspace: project.folderPath || null,
        });
      }
    }
  }
  return mappings;
}

function mergeTranscriptIntoChat(chatId, transcript) {
  if (!transcript?.length) return false;

  const existing = state.chatMessages[chatId] || [];
  const hasAssistantContent = existing.some(
    (m) => m.role === 'assistant' && !isEmptyAssistantMessage(m),
  );
  if (hasAssistantContent) return false;

  const merged = [];
  let msgId = state.nextMsgId;
  for (const entry of transcript) {
    if (!entry.content?.trim() && !entry.toolCalls?.length) continue;
    merged.push({
      id: `msg-${msgId++}`,
      role: entry.role,
      content: entry.content || '',
      toolCalls: entry.toolCalls || [],
      segments: [],
      eventLog: [],
    });
  }

  if (!merged.length) return false;
  state.chatMessages[chatId] = merged;
  state.nextMsgId = msgId;
  return true;
}

async function recoverChatsFromBackend() {
  if (typeof Backend === 'undefined' || !Backend.isAvailable()) return;

  let changed = false;
  for (const project of state.projects) {
    for (const chat of project.chats || []) {
      if (!chat.sessionId || !project.folderPath || !chatNeedsRecovery(chat.id)) continue;
      try {
        const transcript = await Backend.fetchSessionMessages(chat.sessionId, project.folderPath);
        if (mergeTranscriptIntoChat(chat.id, transcript)) {
          chat.unfinished = chatNeedsRecovery(chat.id);
          changed = true;
        }
      } catch (err) {
        console.error(`Failed to recover chat ${chat.id}:`, err);
      }
    }
  }

  if (changed) {
    attachDiffsToMessages();
    saveChatState();
    if (state.selectedChatId) {
      renderMessages(state.selectedChatId);
      syncContinueSuggestion();
    }
  }
}

async function waitForBackendReady() {
  if (!backendReadyPromise) return;
  await backendReadyPromise;
}

function initializeContextSyncQueue() {
  chatsNeedingContextSync.clear();
  for (const project of state.projects) {
    for (const chat of project.chats || []) {
      const msgs = state.chatMessages[chat.id] || [];
      if (msgs.some((m) => m.role === 'user' && m.content?.trim())) {
        chatsNeedingContextSync.add(chat.id);
      }
    }
  }
}

async function syncChatSessionsToBackend() {
  if (typeof Backend === 'undefined' || !Backend.isAvailable()) return;

  let sessionsChanged = false;
  for (const project of state.projects) {
    for (const chat of project.chats || []) {
      if (!chat.sessionId || !project.folderPath) continue;
      const localHistory = buildHistoryForBackend(chat.id);
      if (!localHistory.length) continue;

      try {
        const transcript = await Backend.fetchSessionMessages(chat.sessionId, project.folderPath);
        if (!transcript.length) {
          delete chat.sessionId;
          sessionsChanged = true;
        }
      } catch (err) {
        console.error(`Failed to validate session for chat ${chat.id}:`, err);
        delete chat.sessionId;
        sessionsChanged = true;
      }
    }
  }

  const mappings = collectChatSessionMappings();
  if (mappings.length) {
    try {
      await Backend.restoreChatSessions(mappings);
    } catch (err) {
      console.error('Failed to restore chat sessions:', err);
    }
  }

  if (sessionsChanged) saveChatState();
}

function restoreActiveScreen(options = {}) {
  const silent = options.silent;
  if (state.selectedChatId) {
    const chat = findChatById(state.selectedChatId);
    const project = findChatProject(state.selectedChatId);
    if (chat && project) {
      state.selectedProjectId = project.id;
      state.expandedProjects.add(project.id);
      updateProjectSelection();
      updateActiveChat();
      showChatScreen(state.selectedChatId, chat.title, project.id, { silent });
      return;
    }
    state.selectedChatId = null;
  }
  showWelcomeScreen({ animateWelcome: !silent, silent });
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

function setChatRunning(chatId, running, options = {}) {
  const chat = findChatById(chatId);
  if (!chat) return;

  const wasRunning = chat.running;
  chat.running = running;
  if (running) {
    chat.unfinished = true;
    saveChatState();
    hideContinueSuggestion(true);
  }
  syncChatItem(chatId);

  // Notify when a task finishes
  if (wasRunning && !running) {
    saveChatState();
    if (!options.silent) {
      playTaskCompleteSound();
      if (chatId !== state.selectedChatId) {
        showToast(`Task finished: ${chat.title}`);
      }
      syncContinueSuggestion();
    } else {
      hideContinueSuggestion(true);
    }
  }

  if (chatId === state.selectedChatId) syncSendButtonState();
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

function cleanupChatRuntimeState(chatId) {
  delete state.chatMessages[chatId];
  chatsNeedingContextSync.delete(chatId);
  abortedChatIds.delete(chatId);
  aiRuns.delete(chatId);

  for (const [msgId, req] of questionRequests.entries()) {
    if (req.chatId === chatId) questionRequests.delete(msgId);
  }
  for (const [msgId, req] of permissionRequests.entries()) {
    if (req.chatId === chatId) permissionRequests.delete(msgId);
  }
}

async function deleteChat(chatId) {
  const project = findChatProject(chatId);
  const chat = findChatById(chatId);
  if (!project || !chat) return;

  if (isChatGenerating(chatId)) {
    await abortAgentRun(chatId);
  }
  cleanupChatRuntimeState(chatId);

  project.chats = project.chats.filter((c) => c.id !== chatId);
  const wasSelected = state.selectedChatId === chatId;

  if (wasSelected) {
    state.selectedChatId = null;
  }

  saveChatState();
  renderSidebar();
  updateActiveChat();
  updateNavActive();

  if (wasSelected) {
    showWelcomeScreen();
  }

  showToast(`Deleted "${chat.title}"`);
}

async function deleteProject(projectId) {
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return;

  const chatIds = (project.chats || []).map((c) => c.id);
  const runningIds = chatIds.filter((id) => isChatGenerating(id));
  await Promise.all(runningIds.map((id) => abortAgentRun(id)));
  for (const chatId of chatIds) {
    cleanupChatRuntimeState(chatId);
  }

  const wasSelectedProject = state.selectedProjectId === projectId;
  const wasSelectedChat = chatIds.includes(state.selectedChatId);

  state.projects = state.projects.filter((p) => p.id !== projectId);
  state.expandedProjects.delete(projectId);
  state.expandedChatLists.delete(projectId);

  if (wasSelectedProject) {
    state.selectedProjectId = state.projects[0]?.id || null;
  }
  if (wasSelectedChat) {
    state.selectedChatId = null;
  }

  if (state.selectedProjectId) {
    state.expandedProjects.add(state.selectedProjectId);
    void setActiveProjectWorkspace(state.selectedProjectId);
  }

  saveChatState();
  renderSidebar();
  updateProjectSelection();
  updateActiveChat();
  updateNavActive();

  if (wasSelectedChat || wasSelectedProject) {
    showWelcomeScreen();
  }

  showToast(`Removed "${project.name}"`);
}

function renameChat(chatId, title) {
  const chat = findChatById(chatId);
  if (!chat) return;

  const trimmed = title.trim();
  if (!trimmed || trimmed === chat.title) return;

  chat.title = trimmed;
  if (state.selectedChatId === chatId) {
    dom.chatTitle.textContent = trimmed;
  }

  saveChatState();
  syncChatItem(chatId);
  showToast('Chat renamed');
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

let welcomeProjectDropdownBound = false;

function closeWelcomeProjectDropdown(instant = false) {
  if (!dom.welcomeProjectDropdown) return;
  if (!dom.welcomeProjectDropdown.classList.contains('open')) return;

  const menu = dom.welcomeProjectDropdown.querySelector('.project-picker-menu');
  const trigger = dom.welcomeProjectDropdown.querySelector('.project-picker-trigger');

  const finish = () => {
    dom.welcomeProjectDropdown.classList.remove('open');
    trigger?.setAttribute('aria-expanded', 'false');
    if (menu) {
      menu.style.visibility = 'hidden';
      menu.style.opacity = '';
      menu.style.transform = '';
      menu.classList.remove('spring-driven');
      delete menu._springState;
    }
  };

  if (instant || !menu) {
    finish();
    return;
  }

  Physics.animate(menu, { opacity: 0, y: 6, scale: 0.97 }, {
    preset: 'stiff',
    onComplete: finish,
  });
}

function openWelcomeProjectDropdown() {
  if (!dom.welcomeProjectDropdown) return;

  const menu = dom.welcomeProjectDropdown.querySelector('.project-picker-menu');
  const trigger = dom.welcomeProjectDropdown.querySelector('.project-picker-trigger');
  if (!menu || !trigger) return;

  closeAllModelDropdowns(true);
  dom.welcomeProjectDropdown.classList.add('open');
  trigger.setAttribute('aria-expanded', 'true');
  menu.style.visibility = 'visible';
  Physics.animate(menu, { opacity: 1, y: 0, scale: 1 }, {
    from: { opacity: 0, y: 6, scale: 0.97 },
    preset: 'snappy',
  });

  const selected = menu.querySelector('.project-picker-option.selected');
  if (selected) {
    requestAnimationFrame(() => {
      selected.scrollIntoView({ block: 'nearest' });
    });
  }
}

function syncWelcomeProjectDropdown() {
  if (!dom.welcomeProjectDropdown) return;

  const valueEl = dom.welcomeProjectDropdown.querySelector('.project-picker-value');
  const menu = dom.welcomeProjectDropdown.querySelector('.project-picker-menu');
  if (!valueEl || !menu) return;

  const project = getSelectedProject();
  if (project) {
    valueEl.innerHTML = `<span class="project-picker-name">${escapeHtml(project.name)}</span>`;
  } else {
    valueEl.innerHTML = '<span class="project-picker-name project-picker-placeholder">Project</span>';
  }

  const checkSvg = `<svg class="project-picker-option-check" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  const optionsHtml = state.projects.map((p) => `
    <button
      class="project-picker-option${p.id === state.selectedProjectId ? ' selected' : ''}"
      type="button"
      role="option"
      data-project-id="${p.id}"
      aria-selected="${p.id === state.selectedProjectId}"
    >
      <span class="project-picker-name">${escapeHtml(p.name)}</span>
      ${checkSvg}
    </button>
  `).join('');

  const openFolderBtn = `
    <button class="project-picker-open-folder" type="button" data-action="open-folder">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Open folder…
    </button>
  `;

  menu.innerHTML = optionsHtml
    ? `<div class="project-picker-list">${optionsHtml}</div>${openFolderBtn}`
    : openFolderBtn;

  menu.querySelectorAll('.project-picker-option').forEach((opt) => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      void selectProject(opt.dataset.projectId);
      closeWelcomeProjectDropdown();
    });
  });

  menu.querySelector('[data-action="open-folder"]')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeWelcomeProjectDropdown();
    void openProjectFolder();
  });
}

function initWelcomeProjectDropdown() {
  if (!dom.welcomeProjectDropdown) return;

  const chevronSvg = `<svg class="project-picker-chevron" width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;

  dom.welcomeProjectDropdown.innerHTML = `
    <button class="project-picker-trigger" type="button" aria-haspopup="listbox" aria-expanded="false">
      <span class="project-picker-value"></span>
      ${chevronSvg}
    </button>
    <div class="project-picker-menu" role="presentation"></div>
  `;

  const trigger = dom.welcomeProjectDropdown.querySelector('.project-picker-trigger');
  const menu = dom.welcomeProjectDropdown.querySelector('.project-picker-menu');
  if (menu) menu.style.visibility = 'hidden';

  if (!welcomeProjectDropdownBound) {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dom.welcomeProjectDropdown.classList.contains('open')) {
        closeWelcomeProjectDropdown();
      } else {
        openWelcomeProjectDropdown();
      }
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.project-dropdown')) {
        closeWelcomeProjectDropdown();
      }
    });

    welcomeProjectDropdownBound = true;
  }

  syncWelcomeProjectDropdown();
}

function updateProjectSelection() {
  updateNavActive();
  syncWelcomeProjectDropdown();
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
  if (!options.silent) {
    state.selectedChatId = null;
    saveChatState();
  }
  closeWelcomeProjectDropdown(true);
  updateActiveChat();
  updateNavActive();
  updateProjectSelection();
  setRandomWelcomeSubtitle();

  dom.settingsScreen.style.display = 'none';
  dom.appBody.classList.remove('settings-open');
  Physics.switchScreens(dom.welcomeScreen, dom.chatScreen);

  if (options.animateWelcome && !options.silent) {
    const content = dom.welcomeScreen.querySelector('.welcome-content');
    Physics.stagger(content, '.welcome-title, .welcome-subtitle', {
      opacity: 0,
      y: 14,
      scale: 0.98,
    }, { preset: 'gentle', delay: 50 });
  }

  if (!options.silent) focusInput(dom.welcomeInput);
}

function showChatScreen(chatId, chatTitle, projectId, options = {}) {
  dom.chatTitle.textContent = chatTitle;
  updateNavActive();
  dom.settingsScreen.style.display = 'none';
  dom.appBody.classList.remove('settings-open');
  Physics.switchScreens(dom.chatScreen, dom.welcomeScreen);

  renderMessages(chatId);
  syncSendButtonState();
  syncContinueSuggestion();
  scrollToEnd(true);
  if (!options.silent) {
    setTimeout(() => focusInput(dom.chatInput), 50);
  }
}

function openChat(chatId, chatTitle, projectId) {
  state.selectedChatId = chatId;
  state.selectedProjectId = projectId;
  updateActiveChat();
  updateProjectSelection();
  setActiveProjectWorkspace(projectId);
  showChatScreen(chatId, chatTitle, projectId);
  saveChatState();
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
  messages.forEach((msg) => {
    if (!shouldSkipMessageRender(msg)) renderMessage(msg, false, chatId);
  });
  restoreActiveRunUI(chatId);

  for (const [msgId, req] of questionRequests.entries()) {
    if (req.chatId === chatId && document.getElementById(`msg-${msgId}`)) {
      mountInlineQuestionUI(msgId);
    }
  }

  scrollToEnd(true);
}

function restoreActiveRunUI(chatId) {
  const run = aiRuns.get(chatId);
  if (!run || !isCurrentChatVisible(chatId)) return;

  if (!run.started) {
    if (!run.thinkingEl?.isConnected) {
      run.thinkingEl = createThinkingIndicator(`thinking-${run.assistantMsgId}`);
      dom.messagesList.appendChild(run.thinkingEl);
    }
    return;
  }

  if (run.thinkingEl?.isConnected) stopThinkingIndicator(run.thinkingEl);
  run.msgEl = document.getElementById(`msg-${run.assistantMsgId}`);

  const contentEl = document.getElementById(`content-${run.assistantMsgId}`);
  if (contentEl && run.content) {
    contentEl.classList.add('is-streaming');
    contentEl.innerHTML = `
      <span class="md-stream-wrap">
        <span class="md-stream-body">${parseMarkdown(closeOpenFences(run.content))}</span>
      </span>
    `;
  }

  for (const tc of run.toolCalls.values()) {
    if (tc.status === 'pending' || tc.status === 'running') {
      if (tc.name === 'question') {
        syncInlineQuestion(run.assistantMsgId, {
          chatId: run.chatId,
          sessionId: run.sessionId,
          toolCallId: tc.id,
          questions: tc.args?.questions,
          requestId: null,
        });
      } else if (isSubAgentTool(tc)) {
        showSubAgentCardInline(tc, run.assistantMsgId);
      } else {
        showToolActivityLineInline(tc, run.assistantMsgId, run.chatId);
      }
    } else if (tc.status === 'complete') {
      if (isSubAgentTool(tc)) completeSubAgentCard(tc, run.assistantMsgId);
      else completeToolActivityLine(tc.id, run.assistantMsgId);
    }
  }

  showInlineThinking(run);
}

function renderMessage(msg, animate = true, chatId = state.selectedChatId) {
  if (shouldSkipMessageRender(msg)) return null;

  const el = document.createElement('div');
  el.className = `message ${msg.role}`;
  el.id = `msg-${msg.id}`;

  if (msg.role === 'user') {
    el.innerHTML = renderUserMessageHTML(msg);
  } else {
    el.innerHTML = buildAssistantHTML(msg);
  }

  dom.messagesList.appendChild(el);
  if (animate) Physics.messageIn(el);
  return el;
}

function buildDefaultSegments(msg) {
  const hasTools = msg.toolCalls?.length > 0;
  const contentText = msg.content?.trim() || '';
  const hasContent = Boolean(contentText);

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
  } else if (hasTools && hasContent) {
    segs.push({ type: 'tools', toolCalls: msg.toolCalls });
    segs.push({ type: 'content', text: msg.content });
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
  const hasContentSeg = segments.some((seg) => seg.type === 'content');
  const hasToolsSeg = segments.some((seg) => seg.type === 'tools');

  if (hasToolsSeg && !hasContentSeg) {
    parts.push(`<div class="md-content" id="content-${msg.id}"></div>`);
  }

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

function isSubAgentTool(tc) {
  return tc?.name === 'task';
}

function isToolCallRunning(tc) {
  return Boolean(tc && (tc.status || 'complete') !== 'complete');
}

function getSubAgentDescription(tc) {
  const args = tc?.args || {};
  return args.description || args.prompt || '';
}

function getSubAgentActivityText(tc, running = true) {
  if (!running) return 'Task completed';
  const activity = tc?.activity ? String(tc.activity).trim() : '';
  const desc = getSubAgentDescription(tc);
  if (activity && activity !== desc) return activity;
  return 'Starting sub-agent…';
}

function renderSubAgentCardHTML(tc, running = false) {
  const desc = getSubAgentDescription(tc);
  const title = desc ? truncateLabel(desc, 56) : 'Sub-agent';
  const activity = getSubAgentActivityText(tc, running);
  const stateClass = running ? ' is-running' : ' is-done';
  const shimmerClass = running ? ' is-shimmer' : '';

  return `
    <div class="subagent-inline${stateClass}" id="subagent-${tc.id}" data-tool-id="${escapeHtml(tc.id)}">
      <div class="subagent-inline-header">
        ${running
    ? '<span class="subagent-inline-spinner" aria-hidden="true"></span>'
    : '<span class="subagent-inline-check" aria-hidden="true">✓</span>'}
        <span class="subagent-inline-title">${escapeHtml(title)}</span>
      </div>
      <div class="subagent-inline-activity${shimmerClass}">
        <span class="subagent-inline-activity-text">${escapeHtml(activity)}</span>
      </div>
    </div>
  `;
}

function applySubAgentCardState(card, tc, running) {
  if (!card) return;

  const desc = getSubAgentDescription(tc);
  const title = desc ? truncateLabel(desc, 56) : 'Sub-agent';
  const activity = getSubAgentActivityText(tc, running);

  const titleEl = card.querySelector('.subagent-inline-title');
  if (titleEl && titleEl.textContent !== title) titleEl.textContent = title;

  const activityEl = card.querySelector('.subagent-inline-activity-text');
  if (activityEl && activityEl.textContent !== activity) activityEl.textContent = activity;

  card.querySelector('.subagent-inline-activity')?.classList.toggle('is-shimmer', running);
  card.classList.toggle('is-running', running);
  card.classList.toggle('is-done', !running);

  const header = card.querySelector('.subagent-inline-header');
  if (!header) return;

  if (running) {
    const check = header.querySelector('.subagent-inline-check');
    if (check) {
      const spinner = document.createElement('span');
      spinner.className = 'subagent-inline-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      check.replaceWith(spinner);
    } else if (!header.querySelector('.subagent-inline-spinner')) {
      const spinner = document.createElement('span');
      spinner.className = 'subagent-inline-spinner';
      spinner.setAttribute('aria-hidden', 'true');
      header.insertBefore(spinner, header.firstChild);
    }
  } else {
    const spinner = header.querySelector('.subagent-inline-spinner');
    if (spinner) {
      const check = document.createElement('span');
      check.className = 'subagent-inline-check';
      check.setAttribute('aria-hidden', 'true');
      check.textContent = '✓';
      spinner.replaceWith(check);
    }
  }
}

function mountSubAgentCard(meta, tc, running = true) {
  if (!meta || !tc?.id) return null;

  let card = document.getElementById(`subagent-${tc.id}`);
  if (!card) {
    meta.insertAdjacentHTML('beforeend', renderSubAgentCardHTML(tc, running));
    card = document.getElementById(`subagent-${tc.id}`);
    if (card) Physics.messageIn(card, { soft: true });
  } else {
    applySubAgentCardState(card, tc, running);
  }
  return card;
}

function getAssistantMeta(msgId) {
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
  return meta;
}

function showSubAgentCard(tc, msgId) {
  const meta = getAssistantMeta(msgId);
  if (!meta) return;
  mountSubAgentCard(meta, tc, isToolCallRunning(tc));
}

function showSubAgentCardInline(tc, msgId) {
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
    body.insertBefore(meta, contentEl);
    mountSubAgentCard(meta, tc, isToolCallRunning(tc));
  } else {
    showSubAgentCard(tc, msgId);
  }
}

function updateSubAgentCard(tc, msgId, chatId = null) {
  const running = isToolCallRunning(tc);
  const activity = getSubAgentActivityText(tc, running);
  const card = document.getElementById(`subagent-${tc.id}`);

  if (card) {
    const currentActivity = card.querySelector('.subagent-inline-activity-text')?.textContent;
    const stillRunning = card.classList.contains('is-running');
    if (running && stillRunning && currentActivity === activity) {
      if (chatId && !state.userHasScrolledUp && isCurrentChatVisible(chatId)) scrollToEnd(false);
      return;
    }
    applySubAgentCardState(card, tc, running);
  } else if (running) {
    showSubAgentCardInline(tc, msgId);
  }

  if (chatId && !state.userHasScrolledUp && isCurrentChatVisible(chatId)) {
    scrollToEnd(false);
  }
}

function completeSubAgentCard(tc, msgId) {
  if (!tc) return;
  const card = document.getElementById(`subagent-${tc.id}`);
  if (card) {
    applySubAgentCardState(card, { ...tc, status: 'complete' }, false);
    return;
  }
  const meta = getAssistantMeta(msgId);
  if (meta) mountSubAgentCard(meta, { ...tc, status: 'complete' }, false);
}

function renderToolActivityLineHTML(tc, running = false) {
  if (isSubAgentTool(tc)) {
    return renderSubAgentCardHTML(tc, running);
  }
  const idAttr = tc.id ? ` id="tc-${tc.id}"` : '';

  if (!running && isFileMutationTool(tc.name)) {
    const classes = isEditToolClickable(tc, running)
      ? 'tool-activity-line done tool-file-edit-line tool-edit-clickable'
      : 'tool-activity-line done tool-file-edit-line';
    const attrs = isEditToolClickable(tc, running) ? ' role="button" tabindex="0"' : '';
    return `<div class="${classes}"${idAttr}${attrs}>${renderFileMutationLineHTML(tc)}</div>`;
  }

  const label = running ? getToolActivityLabel(tc) : (getToolActivityLabelDone(tc) || getToolActivityLabel(tc));
  const runClass = running ? ' running' : ' done';
  return `<div class="tool-activity-line${runClass}"${idAttr}><span class="tool-activity-text">${escapeHtml(label)}</span></div>`;
}

function renderToolCallsHTML(toolCalls, msgId) {
  if (!toolCalls?.length) return '';

  let html = '';
  let regularLines = [];

  function flushRegular() {
    if (!regularLines.length) return;
    html += `<div class="tool-activity">${regularLines.join('')}</div>`;
    regularLines = [];
  }

  for (const tc of toolCalls) {
    if (isSubAgentTool(tc)) {
      flushRegular();
      html += renderSubAgentCardHTML(tc, isToolCallRunning(tc));
    } else {
      const normalized = (tc.status || 'complete') === 'complete'
        ? tc
        : { ...tc, status: 'complete' };
      regularLines.push(renderToolActivityLineHTML(normalized, false));
    }
  }
  flushRegular();
  return html;
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
  thinking.innerHTML = '<span class="thinking-indicator-spinner" aria-hidden="true"></span><span class="thinking-typewriter-text"></span>';

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
  if (thinking && !state.userHasScrolledUp && isCurrentChatVisible(run.chatId)) scrollToEnd(false);
}

function hideInlineThinking(msgId) {
  const thinking = document.querySelector(`#msg-${msgId} .tool-thinking-indicator`);
  if (!thinking) return;
  thinking._stopThinkingTypewriter?.();
  thinking.remove();
}

function showToolActivityLine(tc, msgId) {
  if (isSubAgentTool(tc)) {
    updateSubAgentCard(tc, msgId);
    return;
  }

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
  if (isSubAgentTool(tc)) {
    updateSubAgentCard(tc, msgId);
    return;
  }

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
  if (tc && isSubAgentTool(tc)) {
    completeSubAgentCard(tc, msgId);
    return;
  }

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

async function sendMessage(text, options = {}) {
  const trimmedText = text.trim();
  const context = options.context || (state.selectedChatId ? 'chat' : 'welcome');
  const images = options.images?.length
    ? options.images.map((img) => ({ ...img }))
    : getPendingImages(context).map((img) => ({ ...img }));

  if (!trimmedText && !images.length) return;

  let pendingAbort = null;

  if (state.selectedChatId && isChatGenerating(state.selectedChatId)) {
    const interruptChatId = state.selectedChatId;
    interruptGuard.set(interruptChatId, true);
    abortedChatIds.add(interruptChatId);
    finishAIAborted(interruptChatId, { skipFocus: true });
    hideContinueSuggestion(true);
    pendingAbort = waitForBackendAbort(interruptChatId);
  }

  if (images.length && !SettingsStore.canProcessImages()) {
    if (state.selectedChatId) interruptGuard.delete(state.selectedChatId);
    syncContinueSuggestion();
    showToast('Connect OpenRouter and enable image processing in Settings');
    return;
  }

  const fromContinue = Boolean(options.fromContinue);

  let newChatFromWelcome = false;
  let project = getSelectedProject();

  if (!state.selectedChatId) {
    if (!project) {
      showToast('Open a folder first');
      openProjectFolder();
      return;
    }

    newChatFromWelcome = true;
    const newChatId = `new-${Date.now()}`;
    const newChat = {
      id: newChatId,
      title: trimmedText.length > 40 ? trimmedText.slice(0, 40) + '...' : (trimmedText || 'Image message'),
      time: 'now',
      unfinished: true,
    };
    project.chats.unshift(newChat);
    state.chatMessages[newChatId] = [];
    state.selectedChatId = newChatId;
    state.selectedProjectId = project.id;
    if (!state.expandedProjects.has(project.id)) {
      state.expandedProjects.add(project.id);
    }
  }

  const chatId = state.selectedChatId;
  if (!state.chatMessages[chatId]) state.chatMessages[chatId] = [];

  removeIncompleteAssistantTail(chatId);

  // Add user message
  const userMsg = {
    id: `msg-${state.nextMsgId++}`,
    role: 'user',
    content: trimmedText,
    ...(images.length ? { images } : {}),
    ...(fromContinue ? { hidden: true } : {}),
  };
  if (fromContinue) markContinuePromptUserMessage(userMsg);
  state.chatMessages[chatId].push(userMsg);
  saveChatState();
  clearPendingImages(context);

  if (newChatFromWelcome) {
    renderSidebar();
    showChatScreen(chatId, findChatById(chatId)?.title || trimmedText || 'Image message', project.id);
  } else if (!userMsg.hidden) {
    renderMessage(userMsg, true);
  }

  // Animate send button
  Physics.pulse(newChatFromWelcome ? dom.welcomeSendBtn : dom.chatSendBtn);

  scrollToEnd(false);
  setChatRunning(chatId, true);

  runAIResponse(chatId, userMsg, { pendingAbort });
  syncSendButtonState();
  syncContinueSuggestion();
}

function removeIncompleteAssistantTail(chatId) {
  const msgs = state.chatMessages[chatId];
  if (!msgs?.length) return;
  const last = msgs[msgs.length - 1];
  if (last.role === 'assistant' && isEmptyAssistantMessage(last)) {
    msgs.pop();
  }
}

async function runAIResponse(chatId, userMsg, options = {}) {
  abortedChatIds.delete(chatId);

  const assistantMsgId = `msg-${state.nextMsgId++}`;
  const assistantMsg = {
    id: assistantMsgId,
    role: 'assistant',
    toolCalls: [],
    content: '',
    segments: [],
    eventLog: [],
    finished: false,
  };
  state.chatMessages[chatId].push(assistantMsg);
  saveChatState();

  let thinkingEl = null;
  if (isCurrentChatVisible(chatId)) {
    thinkingEl = createThinkingIndicator(`thinking-${assistantMsgId}`);
    dom.messagesList.appendChild(thinkingEl);
    scrollToEnd(false);
  }

  aiRuns.set(chatId, {
    chatId,
    assistantMsgId,
    thinkingEl,
    msgEl: null,
    toolCalls: new Map(),
    content: '',
    started: false,
    sessionId: null,
    generation: null,
  });
  syncContinueSuggestion();

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
      interruptGuard.delete(chatId);
      finishAIWithError(
        chatId,
        'This model needs an API key. Open Settings → Providers, add your key, click Sync - or pick a free OpenCode model.',
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
    interruptGuard.delete(chatId);
    finishAIWithError(chatId, 'AI backend is not running');
    return;
  }

  try {
    await waitForBackendReady();

    let modelText;
    try {
      modelText = await prepareUserMessageForModel(userMsg);
      saveChatState();
    } catch (err) {
      stopThinkingIndicator(thinkingEl);
      const msgs = state.chatMessages[chatId];
      const userIdx = msgs.findIndex((m) => m.id === userMsg.id);
      if (userIdx !== -1) msgs.splice(userIdx, 1);
      const idx = msgs.findIndex((m) => m.id === assistantMsgId);
      if (idx !== -1) msgs.splice(idx, 1);
      aiRuns.delete(chatId);
      interruptGuard.delete(chatId);
      setChatRunning(chatId, false);
      saveChatState();
      if (isCurrentChatVisible(chatId)) {
        document.getElementById(`msg-${userMsg.id}`)?.remove();
      }
      finishAIWithError(chatId, err.message || 'Failed to process images');
      return;
    }

    const run = aiRuns.get(chatId);
    if (run) run.generation = bumpChatRunGeneration(chatId);

    if (options.pendingAbort) {
      const abortResult = await options.pendingAbort;
      if (!abortResult.ok) {
        showToast('Previous task may still be stopping; sending your message…');
      }
    }

    interruptGuard.delete(chatId);

    const result = await Backend.sendMessage({
      chatId,
      text: modelText,
      modelId: state.selectedModelId,
      title: findChatById(chatId)?.title,
      sessionId: getChatSessionId(chatId),
      history: buildHistoryForBackend(chatId, userMsg.id),
      workspace: getChatWorkspace(chatId),
      forceHistory: chatsNeedingContextSync.has(chatId),
    });
    if (abortedChatIds.has(chatId)) {
      interruptGuard.delete(chatId);
      return;
    }
    if (result?.sessionId) setChatSessionId(chatId, result.sessionId);
    chatsNeedingContextSync.delete(chatId);
  } catch (err) {
    if (abortedChatIds.has(chatId)) {
      interruptGuard.delete(chatId);
      return;
    }
    interruptGuard.delete(chatId);
    finishAIWithError(chatId, err.message || 'Failed to send message');
  }
}

function ensureAssistantMessageRendered(run) {
  const msg = state.chatMessages[run.chatId]?.find((m) => m.id === run.assistantMsgId);
  if (!msg || isEmptyAssistantMessage(msg) || !isCurrentChatVisible(run.chatId)) return;

  if (!document.getElementById(`msg-${run.assistantMsgId}`)) {
    run.msgEl = renderMessage(msg, false, run.chatId);
  }
}

function ensureAssistantVisible(run) {
  if (run.started) return;
  run.started = true;
  if (run.thinkingEl?.isConnected) stopThinkingIndicator(run.thinkingEl);

  ensureAssistantMessageRendered(run);
}

function getOrCreateAssistantContentEl(msgId) {
  let contentEl = document.getElementById(`content-${msgId}`);
  if (contentEl) return contentEl;

  const msgEl = document.getElementById(`msg-${msgId}`);
  const body = msgEl?.querySelector('.assistant-body');
  if (!body) return null;

  contentEl = document.createElement('div');
  contentEl.className = 'md-content';
  contentEl.id = `content-${msgId}`;
  body.appendChild(contentEl);
  return contentEl;
}

function appendStreamFull(run, text) {
  if (!text) return;
  hideInlineThinking(run.assistantMsgId);
  run.content = text;

  const msg = state.chatMessages[run.chatId]?.find((m) => m.id === run.assistantMsgId);
  if (msg) {
    msg.content = run.content;
    if (msg.eventLog) msg.eventLog.push({ type: 'text', seq: msg.eventLog.length });
    scheduleSaveChatState();
  }

  ensureAssistantMessageRendered(run);

  const contentEl = getOrCreateAssistantContentEl(run.assistantMsgId);
  if (!contentEl) return;

  contentEl.classList.add('is-streaming');
  contentEl.innerHTML = `
    <span class="md-stream-wrap">
      <span class="md-stream-body">${parseMarkdown(closeOpenFences(run.content))}</span>
    </span>
  `;

  if (!state.userHasScrolledUp && isCurrentChatVisible(run.chatId)) scrollToEnd(false);
}

function appendStreamDelta(run, delta) {
  if (!delta) return;
  hideInlineThinking(run.assistantMsgId);
  run.content += delta;

  const msg = state.chatMessages[run.chatId]?.find((m) => m.id === run.assistantMsgId);
  if (msg) {
    msg.content = run.content;
    if (msg.eventLog) msg.eventLog.push({ type: 'text', seq: msg.eventLog.length });
    scheduleSaveChatState();
  }

  ensureAssistantMessageRendered(run);

  const contentEl = getOrCreateAssistantContentEl(run.assistantMsgId);
  if (!contentEl) return;

  contentEl.classList.add('is-streaming');
  contentEl.innerHTML = `
    <span class="md-stream-wrap">
      <span class="md-stream-body">${parseMarkdown(closeOpenFences(run.content))}</span>
    </span>
  `;

  if (!state.userHasScrolledUp && isCurrentChatVisible(run.chatId)) scrollToEnd(false);
}

function mergeToolCall(prev, next) {
  if (!prev) return next;
  if (!next) return prev;
  return {
    ...prev,
    ...next,
    args: { ...prev.args, ...next.args },
  };
}

function upsertToolCall(run, toolCall) {
  if (!toolCall?.id) return;

  const msg = state.chatMessages[run.chatId]?.find((m) => m.id === run.assistantMsgId);
  if (!msg) return;

  const merged = mergeToolCall(run.toolCalls.get(toolCall.id), toolCall);
  run.toolCalls.set(toolCall.id, merged);
  msg.toolCalls = Array.from(run.toolCalls.values());

  ensureAssistantMessageRendered(run);

  if ((merged.status === 'pending' || merged.status === 'running') && msg.eventLog) {
    msg.eventLog.push({ type: 'tool', seq: msg.eventLog.length });
  }

  if (merged.status === 'pending' || merged.status === 'running') {
    hideInlineThinking(run.assistantMsgId);
    if (merged.name === 'question') {
      syncInlineQuestion(run.assistantMsgId, {
        chatId: run.chatId,
        sessionId: run.sessionId,
        toolCallId: merged.id,
        questions: merged.args?.questions,
        requestId: null,
      });
    } else if (isSubAgentTool(merged)) {
      updateSubAgentCard(merged, run.assistantMsgId, run.chatId);
    } else {
      showToolActivityLineInline(merged, run.assistantMsgId, run.chatId);
    }
  } else if (merged.status === 'complete') {
    if (merged.name === 'question') removeInlineQuestion(run.assistantMsgId);
    if (isSubAgentTool(merged)) completeSubAgentCard(merged, run.assistantMsgId);
    else completeToolActivityLine(merged.id, run.assistantMsgId);
    showInlineThinking(run);
  }
  scheduleSaveChatState();
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

  let msg = [...msgs].reverse().find(
    (m) => m.role === 'assistant' && m.toolCalls?.some((t) => t.id === toolCall.id),
  );
  if (!msg) {
    msg = [...msgs].reverse().find(
      (m) => m.role === 'assistant' && !isEmptyAssistantMessage(m) && m.finished,
    );
  }
  if (!msg) return;

  if (!msg.toolCalls) msg.toolCalls = [];
  const idx = msg.toolCalls.findIndex((t) => t.id === toolCall.id);
  const merged = mergeToolCall(idx >= 0 ? msg.toolCalls[idx] : null, toolCall);
  if (idx >= 0) msg.toolCalls[idx] = merged;
  else msg.toolCalls.push(merged);

  if (!isEmptyAssistantMessage(msg) && isCurrentChatVisible(chatId)) {
    if (!document.getElementById(`msg-${msg.id}`)) {
      renderMessage(msg, false, chatId);
    }
  }

  if (merged.status === 'pending' || merged.status === 'running') {
    if (merged.name === 'question') {
      syncInlineQuestion(msg.id, {
        chatId,
        sessionId,
        toolCallId: merged.id,
        questions: merged.args?.questions,
        requestId: null,
      });
    } else if (isSubAgentTool(merged)) {
      updateSubAgentCard(merged, msg.id, chatId);
    } else {
      showToolActivityLine(merged, msg.id);
    }
  } else if (merged.status === 'complete') {
    if (merged.name === 'question') removeInlineQuestion(msg.id);
    if (isSubAgentTool(merged)) completeSubAgentCard(merged, msg.id);
    else completeToolActivityLine(merged.id, msg.id);
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
  hideInlineThinking(run.assistantMsgId);
  if (!msg) return;

  if (isEmptyAssistantMessage(msg)) {
    removeMessageElement(run.assistantMsgId);
    const msgs = state.chatMessages[run.chatId];
    const idx = msgs?.findIndex((m) => m.id === run.assistantMsgId);
    if (idx !== -1) msgs.splice(idx, 1);
    return;
  }

  let contentEl = document.getElementById(`content-${run.assistantMsgId}`);
  if (!contentEl) contentEl = getOrCreateAssistantContentEl(run.assistantMsgId);
  if (!contentEl) return;

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
  }

  buildSegmentsFromDOM(run.assistantMsgId, run.chatId);
}

function markChatFinished(chatId) {
  pruneTrailingEmptyAssistants(chatId);
  const msgs = state.chatMessages[chatId];
  if (msgs?.length) {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i];
      if (isContinuePromptUserMessage(msg) || isEmptyAssistantMessage(msg)) continue;
      if (msg.role === 'assistant') {
        msg.finished = true;
        break;
      }
      break;
    }
  }
  const chat = findChatById(chatId);
  if (chat) chat.unfinished = false;
}

function finishAIRun(chatId) {
  const run = aiRuns.get(chatId);
  if (!run) return;

  finalizeAssistantMessage(run);
  if (run.thinkingEl?.isConnected) stopThinkingIndicator(run.thinkingEl);
  aiRuns.delete(chatId);
  markChatFinished(chatId);
  setChatRunning(chatId, false);
  saveChatState();
  hideContinueSuggestion(true);
  if (isCurrentChatVisible(chatId)) focusInput(dom.chatInput);
}

function finishAIAborted(chatId, options = {}) {
  const run = aiRuns.get(chatId);
  if (!run) return;

  finalizeAssistantMessage(run);
  if (run.thinkingEl?.isConnected) stopThinkingIndicator(run.thinkingEl);
  aiRuns.delete(chatId);
  pruneTrailingEmptyAssistants(chatId);
  const chat = findChatById(chatId);
  if (chat) chat.unfinished = true;
  chatsNeedingContextSync.add(chatId);
  setChatRunning(chatId, false, { silent: true });
  saveChatState();
  if (!options.skipFocus && isCurrentChatVisible(chatId)) focusInput(dom.chatInput);
}

async function requestBackendAbort(chatId) {
  if (typeof Backend === 'undefined' || !Backend.isAvailable()) {
    return { ok: false, error: 'AI backend is not running' };
  }
  try {
    const ok = await Backend.abort(chatId);
    return { ok: Boolean(ok) };
  } catch (err) {
    return { ok: false, error: err.message || 'Abort failed' };
  }
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Abort in background; retries once. Safe to await before sending a follow-up message. */
async function waitForBackendAbort(chatId) {
  const first = await requestBackendAbort(chatId);
  if (first.ok) return first;

  await sleepMs(300);
  const retry = await requestBackendAbort(chatId);
  if (retry.ok) return retry;

  return {
    ok: false,
    error: retry.error || first.error || 'Abort failed',
  };
}

async function abortAgentRun(chatId) {
  if (!isChatGenerating(chatId)) return;

  abortedChatIds.add(chatId);
  Physics.pulse(dom.chatSendBtn);
  finishAIAborted(chatId);
  syncContinueSuggestion();

  await waitForBackendAbort(chatId);
}

function finishAIWithError(chatId, message) {
  const run = aiRuns.get(chatId);
  if (run) {
    hideInlineThinking(run.assistantMsgId);
    if (run.thinkingEl?.isConnected) stopThinkingIndicator(run.thinkingEl);
    if (!run.started) {
      const msg = state.chatMessages[chatId]?.find((m) => m.id === run.assistantMsgId);
      if (msg) {
        msg.content = `**Error:** ${message}`;
        if (isCurrentChatVisible(chatId)) renderMessage(msg, false, chatId);
      }
    } else {
      run.content += `\n\n**Error:** ${message}`;
      const msg = state.chatMessages[chatId]?.find((m) => m.id === run.assistantMsgId);
      if (msg) msg.content = run.content;
      finalizeAssistantMessage(run);
    }
    aiRuns.delete(chatId);
  }

  syncSendButtonState();
  setChatRunning(chatId, false);
  saveChatState();
  syncContinueSuggestion();
  showToast(message);
  if (isCurrentChatVisible(chatId)) focusInput(dom.chatInput);
}

function isStaleAssistantError(error) {
  const name = error?.name || '';
  const message = error?.data?.message || error?.message || '';
  return name === 'Aborted' || message === 'Aborted';
}

function shouldIgnoreBackendRunEvent(run, chatId, event) {
  if (!run) return true;
  if (!isActiveRunGeneration(chatId, run)) return true;
  if (interruptGuard.has(chatId)) return true;
  const msg = state.chatMessages[chatId]?.find((m) => m.id === run.assistantMsgId);
  if (event.type === 'assistant-message' && event.error && isStaleAssistantError(event.error) && !run.started) {
    return true;
  }
  if (event.type === 'done' && !run.started && isEmptyAssistantMessage(msg)) {
    return true;
  }
  return false;
}

function handleBackendEvent(event) {
  if (!event?.chatId) return;
  if (interruptGuard.has(event.chatId)) return;

  if (event.type === 'question-request') {
    const msgId = resolveQuestionMsgId(event);
    if (msgId) syncInlineQuestion(msgId, event);
    return;
  }

  if (event.type === 'permission-request') {
    const msgId = resolvePermissionMsgId(event);
    if (msgId) syncInlinePermission(msgId, event);
    return;
  }

  if (event.type === 'tool-update') {
    if (!aiRuns.has(event.chatId)) {
      applyLateToolUpdate(event.chatId, event.toolCall, event.sessionId);
    } else {
      const run = aiRuns.get(event.chatId);
      if (!isActiveRunGeneration(event.chatId, run)) return;
      if (event.sessionId) run.sessionId = event.sessionId;
      ensureAssistantVisible(run);
      upsertToolCall(run, event.toolCall);
    }
    return;
  }

  const run = aiRuns.get(event.chatId);
  if (!run) return;
  if (shouldIgnoreBackendRunEvent(run, event.chatId, event)) return;

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
      if (event.sessionId) setChatSessionId(event.chatId, event.sessionId);
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
    finished: false,
  };
  state.chatMessages[chatId].push(assistantMsg);

  // Show thinking indicator first
  const thinkingEl = createThinkingIndicator(`thinking-${assistantMsgId}`);
  if (isCurrentChatVisible(chatId)) {
    dom.messagesList.appendChild(thinkingEl);
    scrollToEnd(false);
  }

  setTimeout(() => {
    stopThinkingIndicator(thinkingEl);

    if (isCurrentChatVisible(chatId)) {
      const msgEl = renderMessage(assistantMsg, false, chatId);
      runResponsePhases(phases, assistantMsgId, chatId, msgEl, () => {
        syncSendButtonState();
        setChatRunning(chatId, false);
        focusInput(dom.chatInput);
      });
    } else {
      setChatRunning(chatId, false);
    }
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
        if (tc.name === 'edit' || tc.name === 'edit_file') {
          tc.diff = getEditDiffForTool(tc);
        }
      }
    }
  }
}

function pathsMatchForDiff(target, candidate) {
  const a = String(target || '').replace(/\\/g, '/').trim();
  const b = String(candidate || '').replace(/\\/g, '/').trim();
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.endsWith(`/${b}`) || b.endsWith(`/${a}`)) return true;
  const aBase = a.split('/').pop();
  const bBase = b.split('/').pop();
  return aBase && aBase === bBase;
}

function extractFileDiffFromUnified(diffText, targetPath) {
  if (!diffText || typeof diffText !== 'string') return '';
  const text = diffText.replace(/\r\n/g, '\n');
  if (!targetPath) return text;

  const sections = text.split(/(?=^diff |^--- )/m);
  if (sections.length <= 1) return text;

  const match = sections.find((section) =>
    pathsMatchForDiff(targetPath, section)
    || section.includes(targetPath)
    || pathsMatchForDiff(targetPath, section.split('\n')[0]),
  );
  return match || text;
}

function parseUnifiedDiff(diffText, targetPath = '') {
  const section = extractFileDiffFromUnified(diffText, targetPath);
  const hunks = [];
  let current = null;

  for (const rawLine of section.replace(/\r\n/g, '\n').split('\n')) {
    if (rawLine.startsWith('@@')) {
      if (current?.lines?.length) hunks.push(current);
      current = { header: rawLine, lines: [] };
      continue;
    }
    if (rawLine.startsWith('+++') || rawLine.startsWith('---') || rawLine.startsWith('diff ')) continue;
    if (!current) continue;

    if (rawLine.startsWith('+')) {
      current.lines.push({ type: 'add', text: rawLine.slice(1) });
    } else if (rawLine.startsWith('-')) {
      current.lines.push({ type: 'del', text: rawLine.slice(1) });
    } else if (rawLine.startsWith(' ') || rawLine === '') {
      current.lines.push({ type: 'ctx', text: rawLine.startsWith(' ') ? rawLine.slice(1) : rawLine });
    }
  }

  if (current?.lines?.length) hunks.push(current);
  return { path: targetPath, hunks };
}

function parseOpencodePatchForFile(patchText, targetPath = '') {
  if (!patchText || typeof patchText !== 'string') return null;
  const lines = patchText.replace(/\r\n/g, '\n').split('\n');
  let filePath = targetPath;
  let inTarget = false;
  let currentHunk = null;
  const hunks = [];

  for (const line of lines) {
    const header = line.match(/^\*\*\* (Update File|Add File|Delete File):\s*(.+)$/);
    if (header) {
      const candidate = header[2].trim();
      inTarget = !targetPath
        || pathsMatchForDiff(targetPath, candidate)
        || targetPath.includes(candidate);
      filePath = candidate;
      if (header[1] === 'Delete File' && inTarget) {
        return {
          path: filePath,
          hunks: [{ lines: [{ type: 'del', text: '(entire file deleted)' }] }],
        };
      }
      currentHunk = null;
      continue;
    }
    if (line.startsWith('*** ')) {
      inTarget = false;
      currentHunk = null;
      continue;
    }
    if (!inTarget) continue;
    if (line.startsWith('@@')) {
      if (currentHunk?.lines?.length) hunks.push(currentHunk);
      currentHunk = { header: line, lines: [] };
      continue;
    }
    if (!currentHunk) currentHunk = { lines: [] };
    if (line.startsWith('+')) currentHunk.lines.push({ type: 'add', text: line.slice(1) });
    else if (line.startsWith('-')) currentHunk.lines.push({ type: 'del', text: line.slice(1) });
    else if (line.startsWith(' ')) currentHunk.lines.push({ type: 'ctx', text: line.slice(1) });
  }

  if (currentHunk?.lines?.length) hunks.push(currentHunk);
  if (!hunks.length) return null;
  return { path: filePath || targetPath, hunks };
}

function buildLineDiff(path, oldText, newText) {
  const lines = [];
  for (const line of String(oldText).split(/\r?\n/)) {
    lines.push({ type: 'del', text: line });
  }
  for (const line of String(newText).split(/\r?\n/)) {
    lines.push({ type: 'add', text: line });
  }
  if (!lines.length) return { path, hunks: [] };
  return { path, hunks: [{ lines }] };
}

function isPlaceholderEditDiff(diff) {
  const lines = diff?.hunks?.[0]?.lines;
  if (!lines?.length) return false;
  const text = lines.map((line) => line.text).join('\n');
  return text.includes('previous implementation') && text.includes('updated implementation');
}

function normalizeDiffPathHint(path) {
  if (!path || typeof path !== 'string') return 'file';
  const first = path.split(',')[0].trim();
  return first || 'file';
}

function getEditDiffForTool(tc) {
  const path = normalizeDiffPathHint(tc.args?.path || tc.diff?.path || 'file');

  if (tc.diffText) {
    const parsed = parseUnifiedDiff(tc.diffText, path);
    if (parsed.hunks.length) return parsed;
  }

  const oldStr = tc.args?.old_string ?? tc.args?.oldString ?? tc.args?.oldContent;
  const newStr = tc.args?.new_string ?? tc.args?.newString ?? tc.args?.newContent;
  if (oldStr != null && newStr != null) {
    return buildLineDiff(path, oldStr, newStr);
  }

  const patchText = tc.args?.patchText;
  if (patchText) {
    const parsed = parseOpencodePatchForFile(patchText, path);
    if (parsed?.hunks?.length) return parsed;
  }

  if ((tc.name === 'write' || tc.name === 'write_file') && tc.args?.content != null) {
    return buildLineDiff(path, '', tc.args.content);
  }

  if (tc.diff?.hunks?.length && !isPlaceholderEditDiff(tc.diff)) return tc.diff;

  const sample = EDIT_DIFF_SAMPLES?.[path];
  if (sample) return { path, ...sample };

  return { path, hunks: [] };
}

function openEditDiffFromLine(lineEl) {
  const tcId = lineEl.id?.startsWith('tc-') ? lineEl.id.slice(3) : '';
  if (!tcId) return;
  const tc = findToolCallById(tcId);
  if (tc?.name === 'edit' || tc?.name === 'edit_file') openEditDiffPopup(tc);
}

function forceCloseEditDiffPopup() {
  const overlay = document.getElementById('diffOverlay');
  if (!overlay) return;
  document.removeEventListener('keydown', editDiffKeyHandler);
  Physics.cancel(overlay);
  const panel = overlay.querySelector('.diff-modal');
  const codeEl = overlay.querySelector('.diff-code');
  if (panel) Physics.cancel(panel);
  if (codeEl) Physics.cancel(codeEl);
  overlay.remove();
}

function openEditDiffPopup(tc) {
  forceCloseEditDiffPopup();

  const diff = getEditDiffForTool(tc);
  const fullPath = normalizeDiffPathHint(tc.args?.path || diff.path || '');
  const file = getFileBasename(fullPath);
  const showPath = fullPath && fullPath !== file;
  const { adds, dels } = getToolLineStats(tc);

  const badges = [];
  if (adds > 0) badges.push(`<span class="diff-header-badge diff-header-badge-add">+${adds}</span>`);
  if (dels > 0) badges.push(`<span class="diff-header-badge diff-header-badge-del">-${dels}</span>`);
  const badgesHtml = badges.length
    ? `<div class="diff-header-badges">${badges.join('')}</div>`
    : '';

  const changedLines = adds + dels;
  const footerMeta = changedLines > 0
    ? `${changedLines} line${changedLines === 1 ? '' : 's'} changed`
    : '';

  const overlay = document.createElement('div');
  overlay.className = 'diff-overlay';
  overlay.id = 'diffOverlay';
  overlay.innerHTML = `
    <div class="diff-modal" role="dialog" aria-modal="true" aria-label="Edit diff for ${escapeHtml(file)}">
      <div class="diff-header">
        <div class="diff-header-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>
            <path d="M14 2v6h6M10 13h4M10 17h4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
          </svg>
        </div>
        <div class="diff-header-text">
          <div class="diff-header-title-row">
            <span class="diff-header-label">Edited</span>
            <span class="diff-header-file">${escapeHtml(file)}</span>
            ${badgesHtml}
          </div>
          ${showPath ? `<div class="diff-header-path">${escapeHtml(fullPath)}</div>` : ''}
        </div>
        <button type="button" class="diff-close-btn" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
        </button>
      </div>
      <div class="diff-body">
        <div class="diff-code">${renderDiffHTML(diff)}</div>
      </div>
      <div class="diff-footer">
        <span class="diff-footer-hint"><kbd>Esc</kbd> to close</span>
        ${footerMeta ? `<span class="diff-footer-meta">${escapeHtml(footerMeta)}</span>` : ''}
      </div>
    </div>
  `;

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeEditDiffPopup();
  });
  overlay.querySelector('.diff-close-btn').addEventListener('click', () => closeEditDiffPopup());

  document.body.appendChild(overlay);

  const panel = overlay.querySelector('.diff-modal');
  const codeEl = overlay.querySelector('.diff-code');
  Physics.diffModalIn(overlay, panel, codeEl);
  document.addEventListener('keydown', editDiffKeyHandler);
  overlay.querySelector('.diff-close-btn').focus();
}

function renderDiffHTML(diff) {
  const hunks = diff?.hunks || [];
  if (!hunks.length) {
    return `
      <div class="diff-empty">
        <div class="diff-empty-icon" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" stroke-width="1.75"/>
            <path d="M10 13h4M10 17h4" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
          </svg>
        </div>
        <span>No diff available</span>
      </div>
    `;
  }

  return hunks.map((hunk) => {
    const headerHtml = hunk.header
      ? `<div class="diff-hunk-header">${escapeHtml(hunk.header)}</div>`
      : '';
    const lines = (hunk.lines || []).map((line) => {
      const prefix = line.type === 'add' ? '+ ' : line.type === 'del' ? '- ' : '  ';
      return `
        <div class="diff-line diff-line-${line.type}">
          <span class="diff-line-prefix">${prefix}</span>
          <span class="diff-line-text">${escapeHtml(line.text)}</span>
        </div>
      `;
    }).join('');
    return `<div class="diff-hunk">${headerHtml}<div class="diff-hunk-lines">${lines}</div></div>`;
  }).join('');
}

function closeEditDiffPopup(overlay = document.getElementById('diffOverlay')) {
  if (!overlay) return;
  document.removeEventListener('keydown', editDiffKeyHandler);
  const panel = overlay.querySelector('.diff-modal');
  const codeEl = overlay.querySelector('.diff-code');
  Physics.diffModalOut(overlay, panel, codeEl, () => overlay.remove());
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

function createThinkingIndicator(id = 'thinking-indicator') {
  const el = document.createElement('div');
  el.className = 'message assistant';
  el.id = id;
  el.innerHTML = `
    <div class="message-wrapper">
      ${assistantAvatarHTML()}
      <div class="assistant-body">
        <div class="thinking-indicator">
          <span class="thinking-indicator-spinner" aria-hidden="true"></span>
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
  const shouldShow = state.userHasScrolledUp && isChatGenerating(state.selectedChatId);
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
  const context = getInputContext(textarea);
  const inputBox = textarea?.closest('.input-box');

  textarea.addEventListener('input', () => {
    // Auto-resize
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 180) + 'px';
    syncSendButtonState();
  });

  textarea.addEventListener('paste', (e) => {
    const items = [...(e.clipboardData?.items || [])];
    if (!items.some((item) => item.kind === 'file' && item.type.startsWith('image/'))) return;
    e.preventDefault();
    void addPastedImages(context, items);
  });

  if (inputBox) setupInputDropZone(inputBox, context);

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const isChatInput = textarea === dom.chatInput;
      const images = getPendingImages(context);
      if (!textarea.value.trim() && !images.length) return;
      const text = textarea.value;
      textarea.value = '';
      textarea.style.height = 'auto';
      syncSendButtonState();
      sendMessage(text, { context, images });
    }
  });
}

function setupInputDropZone(inputBox, context) {
  let dragDepth = 0;

  inputBox.addEventListener('dragenter', (e) => {
    if (!transferHasImageFiles(e.dataTransfer)) return;
    e.preventDefault();
    dragDepth += 1;
    inputBox.classList.add('is-drag-over');
  });

  inputBox.addEventListener('dragover', (e) => {
    if (!transferHasImageFiles(e.dataTransfer)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });

  inputBox.addEventListener('dragleave', (e) => {
    if (!inputBox.classList.contains('is-drag-over')) return;
    if (e.relatedTarget && inputBox.contains(e.relatedTarget)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) inputBox.classList.remove('is-drag-over');
  });

  inputBox.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    inputBox.classList.remove('is-drag-over');
    const files = collectImageFilesFromTransfer(e.dataTransfer);
    if (!files.length) {
      showToast('Drop image files to attach');
      return;
    }
    void addImageFilesToContext(context, files);
  });
}

function focusInput(input) {
  setTimeout(() => input.focus(), 0);
}

function applySendButtonState(btn, { stopping }) {
  if (!btn) return;
  btn.classList.toggle('is-stop', stopping);
  btn.title = stopping ? 'Stop' : 'Send message';
  btn.setAttribute('aria-label', btn.title);
}

function syncSendButtonState() {
  const chatGenerating = isChatGenerating(state.selectedChatId);
  const welcomeReady = Boolean(dom.welcomeInput.value.trim()) || getPendingImages('welcome').length > 0;
  const chatReady = Boolean(dom.chatInput.value.trim()) || getPendingImages('chat').length > 0;
  applySendButtonState(dom.welcomeSendBtn, { stopping: false });
  dom.welcomeSendBtn.disabled = !welcomeReady;
  if (chatGenerating) {
    const hasContent = chatReady;
    applySendButtonState(dom.chatSendBtn, { stopping: !hasContent });
    dom.chatSendBtn.disabled = false;
  } else {
    applySendButtonState(dom.chatSendBtn, { stopping: false });
    dom.chatSendBtn.disabled = !chatReady;
  }
  syncContinueSuggestion();
}

function showContinueSuggestion() {
  const el = dom.continueSuggestion;
  if (!el || el.dataset.continueVisible === 'true') return;

  Physics.cancel(el);
  const inner = el.querySelector('.continue-suggestion-inner');
  if (inner) Physics.cancel(inner);

  el.hidden = false;
  el.dataset.continueVisible = 'true';

  Physics.animate(el, { opacity: 1, y: 0, scale: 1 }, {
    from: { opacity: 0, y: 16, scale: 0.96 },
    preset: 'gentle',
  });

  if (inner) {
    Physics.stagger(inner, '.continue-suggestion-text, .continue-suggestion-btn', {
      opacity: 0,
      y: 10,
    }, { preset: 'gentle', delay: 55 });
  }
}

function hideContinueSuggestion(immediate = false) {
  const el = dom.continueSuggestion;
  if (!el || el.hidden) return;

  delete el.dataset.continueVisible;
  const inner = el.querySelector('.continue-suggestion-inner');

  if (immediate) {
    Physics.cancel(el);
    if (inner) Physics.resetMotion(inner);
    Physics.resetMotion(el);
    el.hidden = true;
    return;
  }

  Physics.animate(el, { opacity: 0, y: 10, scale: 0.97 }, {
    preset: 'stiff',
    onComplete: () => {
      el.hidden = true;
      Physics.resetMotion(el);
      if (inner) Physics.resetMotion(inner);
    },
  });
}

function syncContinueSuggestion() {
  const el = dom.continueSuggestion;
  if (!el) return;
  const chatId = state.selectedChatId;
  const chat = chatId ? findChatById(chatId) : null;
  const shouldShow = Boolean(
    chatId
    && !interruptGuard.has(chatId)
    && isChatUnfinished(chatId)
    && !isChatGenerating(chatId)
    && !chat?.running,
  );

  if (shouldShow) {
    showContinueSuggestion();
  } else {
    hideContinueSuggestion(
      isChatGenerating(chatId) || chat?.running || interruptGuard.has(chatId),
    );
  }
}

/* ============================================================
   MARKDOWN PARSER (simple)
   ============================================================ */

function closeOpenFences(text) {
  // Count ``` occurrences to detect an unclosed code block
  const fences = text.match(/```/g);
  if (fences && fences.length % 2 !== 0) {
    // Unclosed fence - close it so the parser renders a proper block
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
  const content = msgWrapper.querySelector('.md-content, .user-bubble');
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
  if (isChatGenerating(state.selectedChatId)) return;
  const msgEl = btn.closest('.message');
  if (!msgEl || !state.selectedChatId) return;

  const assistantMsgId = msgEl.id.replace('msg-', '');
  const msgs = state.chatMessages[state.selectedChatId];
  const msgIdx = msgs.findIndex((m) => m.id === assistantMsgId);
  if (msgIdx === -1) return;

  let userMsg = null;
  for (let i = msgIdx - 1; i >= 0; i -= 1) {
    if (msgs[i].role === 'user' && !isHiddenMessage(msgs[i])) {
      userMsg = msgs[i];
      break;
    }
  }
  if (!userMsg) return;

  msgEl.remove();
  msgs.splice(msgIdx, 1);

  setChatRunning(state.selectedChatId, true);
  runAIResponse(state.selectedChatId, userMsg);
  syncSendButtonState();
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
    const images = getPendingImages('welcome');
    if (!text.trim() && !images.length) return;
    dom.welcomeInput.value = '';
    dom.welcomeInput.style.height = 'auto';
    syncSendButtonState();
    sendMessage(text, { context: 'welcome', images });
  });
  dom.welcomeAttachBtn?.addEventListener('click', () => {
    void pickImagesForContext('welcome');
  });
  dom.welcomeAttachments?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="remove-pending-image"]');
    if (!btn) return;
    removePendingImage('welcome', btn.dataset.imageId);
  });

  // Chat input
  setupInput(dom.chatInput);
  dom.chatSendBtn.addEventListener('click', () => {
    const generating = isChatGenerating(state.selectedChatId);
    const text = dom.chatInput.value;
    const images = getPendingImages('chat');
    const hasContent = Boolean(text.trim()) || images.length > 0;
    if (generating && !hasContent) {
      void abortAgentRun(state.selectedChatId);
      return;
    }
    if (!hasContent) return;
    dom.chatInput.value = '';
    dom.chatInput.style.height = 'auto';
    syncSendButtonState();
    sendMessage(text, { context: 'chat', images });
  });
  dom.chatAttachBtn?.addEventListener('click', () => {
    void pickImagesForContext('chat');
  });
  dom.chatAttachments?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="remove-pending-image"]');
    if (!btn) return;
    removePendingImage('chat', btn.dataset.imageId);
  });

  dom.continueSuggestionBtn?.addEventListener('click', () => {
    if (!state.selectedChatId || isChatGenerating(state.selectedChatId)) return;
    Physics.pulse(dom.continueSuggestionBtn, { down: 0.94 });
    hideContinueSuggestion(true);
    sendMessage('Continue', { fromContinue: true });
  });

  dom.continueSuggestionBtn?.addEventListener('mousedown', () => {
    Physics.press(dom.continueSuggestionBtn, 0.94);
  });
  dom.continueSuggestionBtn?.addEventListener('mouseup', () => {
    Physics.release(dom.continueSuggestionBtn);
  });
  dom.continueSuggestionBtn?.addEventListener('mouseleave', () => {
    Physics.release(dom.continueSuggestionBtn);
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
      return;
    }

    const permBtn = e.target.closest('[data-permission-action]');
    if (permBtn) {
      const card = permBtn.closest('.permission-inline');
      if (card) void submitInlinePermission(card.dataset.msgId, permBtn.dataset.permissionAction);
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

  // Sidebar nav (scope to #sidebar — titlebar menu uses the same data-action values)
  dom.sidebar.querySelector('[data-action="new-chat"]')?.addEventListener('click', () => {
    if (!getSelectedProject()) {
      openProjectFolder();
      return;
    }
    showWelcomeScreen();
    focusInput(dom.welcomeInput);
  });

  dom.sidebar.querySelector('[data-action="search"]')?.addEventListener('click', openSearch);

  dom.sidebar.querySelector('[data-action="plugins"]')?.addEventListener('click', () => {
    showToast('Plugins panel coming soon');
  });

  dom.sidebar.querySelector('[data-action="settings"]')?.addEventListener('click', openSettings);

  dom.sidebar.querySelector('.projects-open-folder')?.addEventListener('click', (e) => {
    e.stopPropagation();
    openProjectFolder();
  });

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
      if (typeof SidebarContextMenu !== 'undefined') {
        SidebarContextMenu.close();
        SidebarContextMenu.closeConfirm();
      }
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

function resolvePermissionMsgId(event) {
  return resolveQuestionMsgId(event);
}

function formatPermissionLabel(permission) {
  const title = permission?.title || permission?.type || 'Permission required';
  const filePath = permission?.metadata?.path || permission?.metadata?.file;
  if (filePath) return `${title}: ${filePath}`;
  const patterns = [].concat(permission?.pattern || permission?.patterns || []);
  if (patterns.length) return `${title}: ${patterns.join(', ')}`;
  return title;
}

function syncInlinePermission(msgId, event) {
  const permission = event.permission;
  if (!permission && !event.permissionId) return;

  let req = permissionRequests.get(msgId);
  if (!req) {
    req = {
      permissionId: event.permissionId || permission?.id,
      chatId: event.chatId,
      sessionId: event.sessionId || permission?.sessionID || null,
      label: formatPermissionLabel(permission),
      submitting: false,
    };
    permissionRequests.set(msgId, req);
  } else {
    if (event.permissionId) req.permissionId = event.permissionId;
    if (event.sessionId) req.sessionId = event.sessionId;
    if (permission) req.label = formatPermissionLabel(permission);
  }

  mountInlinePermissionUI(msgId);

  if (!state.userHasScrolledUp && isCurrentChatVisible(event.chatId)) scrollToEnd(false);
}

function getInlinePermissionHost(msgId) {
  const body = document.querySelector(`#msg-${msgId} .assistant-body`);
  if (!body) return null;

  let card = body.querySelector('.permission-inline');
  if (!card) {
    card = document.createElement('div');
    card.className = 'permission-inline';
    card.dataset.msgId = msgId;
    const content = body.querySelector('.md-content');
    if (content) body.insertBefore(card, content);
    else body.appendChild(card);
  }
  return card;
}

function mountInlinePermissionUI(msgId) {
  const req = permissionRequests.get(msgId);
  if (!req) return;

  const card = getInlinePermissionHost(msgId);
  if (!card) return;

  card.innerHTML = `
    <p class="permission-inline-prompt">${escapeHtml(req.label)}</p>
    <div class="permission-inline-footer">
      <button type="button" class="permission-action-btn" data-permission-action="reject">Deny</button>
      <button type="button" class="permission-action-btn permission-action-btn--primary" data-permission-action="once">Allow once</button>
      <button type="button" class="permission-action-btn permission-action-btn--primary" data-permission-action="always">Always allow</button>
    </div>
  `;
  Physics.messageIn(card, { soft: true });
}

async function submitInlinePermission(msgId, response) {
  const req = permissionRequests.get(msgId);
  if (!req || req.submitting) return;
  if (!req.sessionId || !req.permissionId) {
    showToast('Permission request expired');
    return;
  }

  req.submitting = true;
  const card = document.querySelector(`#msg-${msgId} .permission-inline`);
  card?.querySelectorAll('[data-permission-action]').forEach((btn) => {
    btn.disabled = true;
  });

  try {
    const result = await Backend.replyPermission({
      sessionId: req.sessionId,
      permissionId: req.permissionId,
      response,
    });
    if (!result?.ok) {
      showToast('Could not respond to permission request');
      req.submitting = false;
      card?.querySelectorAll('[data-permission-action]').forEach((btn) => {
        btn.disabled = false;
      });
      return;
    }
  } catch (_) {
    showToast('Could not respond to permission request');
    req.submitting = false;
    card?.querySelectorAll('[data-permission-action]').forEach((btn) => {
      btn.disabled = false;
    });
    return;
  }

  permissionRequests.delete(msgId);
  card?.remove();
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

  if (!state.userHasScrolledUp && isCurrentChatVisible(event.chatId)) scrollToEnd(false);
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
   TASK COMPLETE SOUND
   ============================================================ */

function playTaskCompleteSound() {
  const prefs = typeof SettingsStore !== 'undefined'
    ? SettingsStore.getNotificationSettings()
    : { taskCompleteEnabled: true, taskCompleteSoundId: 'chime', volume: 75 };
  if (!prefs.taskCompleteEnabled) return;
  if (typeof TaskSounds !== 'undefined') TaskSounds.play(prefs.taskCompleteSoundId, prefs.volume);
}

/* ============================================================
   TOAST NOTIFICATIONS
   ============================================================ */

const TOAST_AUTO_DISMISS_MS = 2500;
const TOAST_OUTSIDE_MARGIN = 16;
const TOAST_FLING_SPEED = 620;
const TOAST_HOME_TOP = 52;
const TOAST_HOME_RIGHT = 16;

let toastDismissTimer = null;
let toastInteractionCleanup = null;

function clearToastDismissTimer() {
  if (toastDismissTimer) {
    clearTimeout(toastDismissTimer);
    toastDismissTimer = null;
  }
}

function clearToastTimers() {
  clearToastDismissTimer();
  if (toastInteractionCleanup) {
    toastInteractionCleanup();
    toastInteractionCleanup = null;
  }
}

function scheduleToastDismiss(toast, delay = TOAST_AUTO_DISMISS_MS) {
  clearToastDismissTimer();
  toastDismissTimer = setTimeout(() => dismissToast(toast), delay);
}

function getToastHomePosition(toast) {
  const width = toast.offsetWidth || toast.getBoundingClientRect().width || 180;
  return {
    left: window.innerWidth - TOAST_HOME_RIGHT - width,
    top: TOAST_HOME_TOP,
  };
}

function anchorToastAtHome(toast) {
  const home = getToastHomePosition(toast);
  toast.style.right = 'auto';
  toast.style.bottom = 'auto';
  toast.style.left = `${home.left}px`;
  toast.style.top = `${home.top}px`;
  toast.dataset.homeLeft = String(home.left);
  toast.dataset.homeTop = String(home.top);
  return home;
}

function readToastHome(toast) {
  return {
    left: parseFloat(toast.dataset.homeLeft) || getToastHomePosition(toast).left,
    top: parseFloat(toast.dataset.homeTop) || TOAST_HOME_TOP,
  };
}

function isToastOutsideViewport(rect, margin = TOAST_OUTSIDE_MARGIN) {
  return (
    rect.right < -margin ||
    rect.left > window.innerWidth + margin ||
    rect.bottom < -margin ||
    rect.top > window.innerHeight + margin
  );
}

function getPointerVelocity(samples) {
  if (samples.length < 2) return { vx: 0, vy: 0 };
  const first = samples[0];
  const last = samples[samples.length - 1];
  const dt = Math.max((last.t - first.t) / 1000, 0.016);
  return {
    vx: (last.x - first.x) / dt,
    vy: (last.y - first.y) / dt,
  };
}

function getToastEdgeFade(rect) {
  const distOutside = Math.max(
    -rect.right,
    rect.left - window.innerWidth,
    -rect.bottom,
    rect.top - window.innerHeight,
    0,
  );
  if (distOutside <= 0) return 1;
  return Math.max(0.3, 1 - distOutside / 72);
}

function getToastDragTilt(vx) {
  return Math.max(-10, Math.min(10, vx * 0.018));
}

function getToastFlingTarget(toast, vx, vy) {
  const rect = toast.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const speed = Math.hypot(vx, vy);

  let dirX = vx;
  let dirY = vy;
  if (speed < 120) {
    const distances = [
      { edge: 'left', dist: cx, dx: -1, dy: 0 },
      { edge: 'right', dist: window.innerWidth - cx, dx: 1, dy: 0 },
      { edge: 'top', dist: cy, dx: 0, dy: -1 },
      { edge: 'bottom', dist: window.innerHeight - cy, dx: 0, dy: 1 },
    ];
    const nearest = distances.sort((a, b) => a.dist - b.dist)[0];
    dirX = nearest.dx;
    dirY = nearest.dy;
  } else {
    dirX /= speed;
    dirY /= speed;
  }

  const throwDist = Math.max(window.innerWidth, window.innerHeight) * 0.65;
  return {
    left: rect.left + dirX * throwDist,
    top: rect.top + dirY * throwDist,
    rotate: dirX * 14 + dirY * 4,
  };
}

function shouldFlingDismissToast(toast, vx, vy) {
  if (isToastOutsideViewport(toast.getBoundingClientRect())) return true;

  const rect = toast.getBoundingClientRect();
  const speed = Math.hypot(vx, vy);
  if (speed < TOAST_FLING_SPEED) return false;

  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const nx = vx / speed;
  const ny = vy / speed;
  const towardEdge =
    (nx < -0.45 && cx < window.innerWidth * 0.55) ||
    (nx > 0.45 && cx > window.innerWidth * 0.45) ||
    (ny < -0.45 && cy < window.innerHeight * 0.5) ||
    (ny > 0.45 && cy > window.innerHeight * 0.5);
  return towardEdge;
}

function applyToastDragVisuals(toast, vx, opacity = 1) {
  const tilt = getToastDragTilt(vx);
  toast.style.transform = `rotate(${tilt}deg) scale(0.96)`;
  toast.style.opacity = String(opacity);
}

function resetToastVisuals(toast) {
  toast.style.transform = '';
  toast.style.opacity = '';
}

function flingToastOff(toast, vx, vy, onComplete) {
  const target = getToastFlingTarget(toast, vx, vy);
  const speed = Math.hypot(vx, vy);
  const startRotate = getToastDragTilt(vx);
  const startOpacity = parseFloat(toast.style.opacity) || 1;

  Physics.cancel(toast);
  toast.style.transform = '';

  Physics.animate(toast, {
    left: target.left,
    top: target.top,
    opacity: 0,
    scale: 0.78,
    rotate: target.rotate,
  }, {
    from: { scale: 0.96, rotate: startRotate, opacity: startOpacity },
    velocity: {
      left: vx,
      top: vy,
      opacity: speed > 200 ? -2.4 : -1.6,
      scale: -0.8,
      rotate: vx * 0.01,
    },
    preset: { stiffness: 210, damping: 24, mass: 0.82 },
    onComplete: () => {
      Physics.resetMotion(toast);
      toast.remove();
      onComplete?.();
    },
  });
}

function snapToastHome(toast, vx = 0, vy = 0, onComplete) {
  const home = readToastHome(toast);
  const currentLeft = parseFloat(toast.style.left) || toast.getBoundingClientRect().left;
  const currentTop = parseFloat(toast.style.top) || toast.getBoundingClientRect().top;
  const startRotate = getToastDragTilt(vx);
  const startOpacity = parseFloat(toast.style.opacity) || 1;

  Physics.cancel(toast);
  toast.style.left = `${currentLeft}px`;
  toast.style.top = `${currentTop}px`;
  toast.style.transform = '';
  toast.style.opacity = '';

  Physics.animate(toast, {
    left: home.left,
    top: home.top,
    opacity: 1,
    scale: 1,
    rotate: 0,
    y: 0,
  }, {
    from: { scale: 0.96, rotate: startRotate, opacity: startOpacity, y: 0 },
    velocity: {
      left: vx * 0.22,
      top: vy * 0.22,
      rotate: startRotate * 0.35,
    },
    preset: 'bouncy',
    onComplete: () => {
      resetToastVisuals(toast);
      onComplete?.();
    },
  });
}

function dismissToast(toast, animate = true) {
  if (!toast?.isConnected) return;
  clearToastTimers();

  if (!animate) {
    Physics.cancel(toast);
    toast.remove();
    return;
  }

  const rect = toast.getBoundingClientRect();
  Physics.cancel(toast);
  toast.style.left = `${rect.left}px`;
  toast.style.top = `${rect.top}px`;
  toast.style.right = 'auto';
  toast.style.bottom = 'auto';

  Physics.animate(toast, { opacity: 0, y: -14, scale: 0.9, rotate: -2 }, {
    preset: 'soft',
    onComplete: () => {
      Physics.resetMotion(toast);
      toast.remove();
    },
  });
}

function setupToastInteractions(toast) {
  let dragging = false;
  let flinging = false;
  let activePointerId = null;
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;
  const moveSamples = [];

  function releaseCapture() {
    if (activePointerId === null) return;
    try {
      toast.releasePointerCapture(activePointerId);
    } catch {
      /* pointer may already be released */
    }
    activePointerId = null;
  }

  function stopDragging() {
    dragging = false;
    moveSamples.length = 0;
    releaseCapture();
    if (!toast.isConnected) return;
    toast.classList.remove('toast-dragging');
  }

  function beginFling(vx, vy) {
    if (flinging || !toast.isConnected) return;
    flinging = true;
    stopDragging();
    flingToastOff(toast, vx, vy);
  }

  function onPointerDown(e) {
    if (e.button !== 0 || flinging) return;
    if (e.target.closest('button, a, input, textarea, select, .toast-action-btn')) return;

    dragging = true;
    flinging = false;
    activePointerId = e.pointerId;
    moveSamples.length = 0;
    clearToastDismissTimer();
    Physics.cancel(toast);
    toast.classList.add('toast-dragging');

    const rect = toast.getBoundingClientRect();
    toast.style.right = 'auto';
    toast.style.bottom = 'auto';
    toast.style.left = `${rect.left}px`;
    toast.style.top = `${rect.top}px`;

    startX = e.clientX;
    startY = e.clientY;
    originX = rect.left;
    originY = rect.top;

    moveSamples.push({ x: e.clientX, y: e.clientY, t: performance.now() });
    applyToastDragVisuals(toast, 0);

    toast.setPointerCapture(activePointerId);
    e.preventDefault();
  }

  function onPointerMove(e) {
    if (!dragging || flinging || e.pointerId !== activePointerId) return;

    const x = originX + (e.clientX - startX);
    const y = originY + (e.clientY - startY);
    toast.style.left = `${x}px`;
    toast.style.top = `${y}px`;

    const now = performance.now();
    moveSamples.push({ x: e.clientX, y: e.clientY, t: now });
    if (moveSamples.length > 6) moveSamples.shift();

    const { vx } = getPointerVelocity(moveSamples);
    const fade = getToastEdgeFade(toast.getBoundingClientRect());
    applyToastDragVisuals(toast, vx, fade);

    if (isToastOutsideViewport(toast.getBoundingClientRect())) {
      const { vx: flingVx, vy: flingVy } = getPointerVelocity(moveSamples);
      beginFling(flingVx, flingVy);
    }
  }

  function onPointerUp(e) {
    if (!dragging || flinging || e.pointerId !== activePointerId) return;

    const { vx, vy } = getPointerVelocity(moveSamples);
    stopDragging();

    if (shouldFlingDismissToast(toast, vx, vy)) {
      beginFling(vx, vy);
      return;
    }

    snapToastHome(toast, vx, vy, () => scheduleToastDismiss(toast));
  }

  function onPointerCancel(e) {
    if (!dragging || flinging || e.pointerId !== activePointerId) return;
    stopDragging();
    if (!toast.isConnected) return;
    snapToastHome(toast, 0, 0, () => scheduleToastDismiss(toast));
  }

  function onAuxClick(e) {
    if (e.button !== 1) return;
    e.preventDefault();
    dismissToast(toast);
  }

  toast.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  toast.addEventListener('pointercancel', onPointerCancel);
  toast.addEventListener('auxclick', onAuxClick);

  return () => {
    toast.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    toast.removeEventListener('pointercancel', onPointerCancel);
    toast.removeEventListener('auxclick', onAuxClick);
  };
}

function showToast(message) {
  if (!appStartupComplete) {
    pendingStartupToasts.push(message);
    return;
  }

  const existing = document.getElementById('toast');
  if (existing) dismissToast(existing, false);

  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = 'toast';
  toast.title = 'Drag out of the window to dismiss';
  toast.textContent = message;
  document.body.appendChild(toast);

  const home = anchorToastAtHome(toast);
  toast.style.left = `${home.left}px`;
  toast.style.top = `${home.top}px`;

  Physics.animate(toast, { opacity: 1, y: 0, scale: 1 }, {
    from: { opacity: 0, y: -18, scale: 0.9 },
    preset: 'bouncy',
  });

  toastInteractionCleanup = setupToastInteractions(toast);
  scheduleToastDismiss(toast);
}

function showActionToast({ message, actionLabel, onAction, persistent = true }) {
  if (!appStartupComplete) return;

  const existing = document.getElementById('toast');
  if (existing) dismissToast(existing, false);

  const toast = document.createElement('div');
  toast.id = 'toast';
  toast.className = 'toast toast-action';
  toast.title = 'Drag out of the window to dismiss';

  const messageEl = document.createElement('span');
  messageEl.className = 'toast-action-message';
  messageEl.textContent = message;

  const actionBtn = document.createElement('button');
  actionBtn.type = 'button';
  actionBtn.className = 'toast-action-btn';
  actionBtn.textContent = actionLabel;
  actionBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
  });
  actionBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onAction?.();
  });

  toast.append(messageEl, actionBtn);
  document.body.appendChild(toast);
  activeUpdateToast = toast;

  const home = anchorToastAtHome(toast);
  toast.style.left = `${home.left}px`;
  toast.style.top = `${home.top}px`;

  Physics.animate(toast, { opacity: 1, y: 0, scale: 1 }, {
    from: { opacity: 0, y: -18, scale: 0.9 },
    preset: 'bouncy',
  });

  if (!persistent) scheduleToastDismiss(toast);
}

function setupUpdateListener() {
  window.electronAPI?.onUpdateStatus?.((status) => {
    handleUpdateStatus(status);
  });

  window.electronAPI?.onBeginInstall?.(() => {
    showUpdateInstallScreen();
  });

  document.getElementById('updateInstallerRetry')?.addEventListener('click', () => {
    void installAppUpdate();
  });

  window.electronAPI?.getUpdateStatus?.()
    .then((status) => handleUpdateStatus(status, { silent: true }))
    .catch(() => {});
}

function formatUpdateBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}

function showUpdateInstallScreen() {
  let screen = document.getElementById('updateInstallerScreen');
  if (!screen) {
    screen = document.getElementById('startupLoader');
  }
  if (!screen) return;

  updateInstallActive = true;
  document.body.classList.add('update-installing');
  screen.hidden = false;
  screen.removeAttribute('hidden');
  screen.style.display = '';
  screen.classList.remove('is-error');
  screen.setAttribute('aria-busy', 'true');

  const toast = document.getElementById('toast');
  if (toast) dismissToast(toast, false);

  const versionEl = document.getElementById('updateInstallerVersion');
  const statusEl = document.getElementById('updateInstallerStatus');
  const detailEl = document.getElementById('updateInstallerDetail');
  const barEl = document.getElementById('updateInstallerProgressBar');
  const retryBtn = document.getElementById('updateInstallerRetry');

  if (versionEl) versionEl.textContent = 'Preparing download…';
  if (statusEl) statusEl.textContent = 'Starting update…';
  if (detailEl) detailEl.textContent = '';
  if (barEl) barEl.style.width = '0%';
  retryBtn?.setAttribute('hidden', '');
}

function hideUpdateInstallScreen() {
  const screen = document.getElementById('updateInstallerScreen');
  updateInstallActive = false;
  document.body.classList.remove('update-installing');
  if (screen) {
    screen.hidden = true;
    screen.setAttribute('aria-busy', 'false');
  }
}

function renderUpdateInstallProgress(status) {
  if (!updateInstallActive) return;

  const screen = document.getElementById('updateInstallerScreen');
  const versionEl = document.getElementById('updateInstallerVersion');
  const statusEl = document.getElementById('updateInstallerStatus');
  const detailEl = document.getElementById('updateInstallerDetail');
  const barEl = document.getElementById('updateInstallerProgressBar');
  const retryBtn = document.getElementById('updateInstallerRetry');
  if (!screen || !versionEl || !statusEl || !detailEl || !barEl) return;

  const versionLabel = status.latestVersion ? `v${status.latestVersion}` : 'the latest version';

  if (status.installPhase === 'preparing') {
    versionEl.textContent = `Preparing ${versionLabel}…`;
    statusEl.textContent = 'Getting update ready';
    detailEl.textContent = status.assetName || '';
    barEl.style.width = '0%';
    retryBtn?.setAttribute('hidden', '');
    screen.classList.remove('is-error');
    return;
  }

  if (status.installPhase === 'downloading') {
    versionEl.textContent = `Downloading ${versionLabel}`;
    statusEl.textContent = `${status.downloadProgress || 0}% complete`;
    const downloaded = formatUpdateBytes(status.downloadedBytes);
    const total = status.totalBytes ? formatUpdateBytes(status.totalBytes) : '';
    detailEl.textContent = total ? `${downloaded} of ${total}` : downloaded;
    barEl.style.width = `${status.downloadProgress || 0}%`;
    retryBtn?.setAttribute('hidden', '');
    screen.classList.remove('is-error');
    return;
  }

  if (status.installPhase === 'launching' || status.installPhase === 'done') {
    versionEl.textContent = `Installing ${versionLabel}`;
    statusEl.textContent = 'Opening installer…';
    detailEl.textContent = 'Code app will close automatically';
    barEl.style.width = '100%';
    retryBtn?.setAttribute('hidden', '');
    screen.classList.remove('is-error');
    return;
  }

  if (status.installPhase === 'error') {
    versionEl.textContent = `Could not install ${versionLabel}`;
    statusEl.textContent = status.error || 'Update failed';
    detailEl.textContent = 'You can try again or install manually from GitHub';
    screen.classList.add('is-error');
    retryBtn?.removeAttribute('hidden');
    screen.setAttribute('aria-busy', 'false');
  }
}

function handleUpdateStatus(status, { silent = false } = {}) {
  pendingUpdateStatus = status;
  SettingsStore.refreshAboutUpdateStatus?.(status);

  if (status.installPhase) {
    renderUpdateInstallProgress(status);
  }

  if (!appStartupComplete) {
    if (!silent) pendingUpdateStatus = status;
    return;
  }

  if (status.downloading || status.installPhase) {
    if (activeUpdateToast) dismissToast(activeUpdateToast, false);
    activeUpdateToast = null;
    return;
  }

  if (status.error && !silent && appStartupComplete && !updateInstallActive) {
    showToast(status.error);
    return;
  }

  if (status.upToDate === false && !updateNotificationShown && !silent && !updateInstallActive) {
    updateNotificationShown = true;
    showActionToast({
      message: `Update available: v${status.latestVersion}`,
      actionLabel: 'Install',
      onAction: () => {
        void installAppUpdate();
      },
    });
    return;
  }

  if (status.upToDate && activeUpdateToast) {
    dismissToast(activeUpdateToast, false);
    activeUpdateToast = null;
  }
}

async function installAppUpdate() {
  if (!window.electronAPI?.installUpdate) {
    showToast('Updates are only available in the desktop app');
    return;
  }

  showUpdateInstallScreen();

  try {
    await window.electronAPI.installUpdate();
    const status = await window.electronAPI.getUpdateStatus?.();
    if (status) handleUpdateStatus(status);
  } catch (err) {
    updateInstallActive = true;
    renderUpdateInstallProgress({
      installPhase: 'error',
      latestVersion: pendingUpdateStatus?.latestVersion,
      error: err.message || 'Update failed',
    });
  }
}

window.installAppUpdate = installAppUpdate;

function buildEmptyChatStatePayload() {
  return {
    projects: [],
    chatMessages: {},
    nextMsgId: 1000,
    selectedProjectId: null,
    selectedChatId: null,
    expandedChatLists: [],
  };
}

function resetApp() {
  suppressChatPersistence = true;
  clearTimeout(saveChatStateTimer);
  saveChatStateTimer = null;

  try {
    localStorage.removeItem(CHAT_STORAGE_KEY);
    localStorage.removeItem(SELECTED_MODEL_KEY);
    localStorage.removeItem('code-app-settings');

    const emptyPayload = buildEmptyChatStatePayload();
    if (window.electronAPI?.saveChatsSync) {
      const saved = window.electronAPI.saveChatsSync(emptyPayload);
      if (!saved) {
        showToast('Could not reset app');
        suppressChatPersistence = false;
        return;
      }
    } else if (window.electronAPI?.deleteChatsSync && !window.electronAPI.deleteChatsSync()) {
      showToast('Could not reset app');
      suppressChatPersistence = false;
      return;
    }

    if (window.electronAPI?.deleteChatsSync) {
      window.electronAPI.deleteChatsSync();
    }
  } catch (err) {
    console.error('Failed to reset app:', err);
    showToast('Could not reset app');
    suppressChatPersistence = false;
    return;
  }

  location.reload();
}

window.resetApp = resetApp;

/* ============================================================
   BOOTSTRAP
   ============================================================ */

document.addEventListener('DOMContentLoaded', init);
