/* ============================================================
   SETTINGS - Full-page settings with category navigation
   ============================================================ */

'use strict';

const SETTINGS_STORAGE_KEY = 'code-app-settings';

/* ============================================================
   THEME SYSTEM
   ============================================================ */

const THEMES = [
  {
    id: 'default',
    name: 'Default',
    accent: '#7c3aed',
    vars: {
      'bg-base': '#0d0d0d', 'bg-sidebar': '#111111', 'bg-main': '#141414',
      'bg-elevated': '#1a1a1a', 'bg-hover': '#1e1e1e', 'bg-active': '#222222',
      'bg-input': '#181818', 'bg-message-user': '#1c1c1c', 'bg-tool': '#161616',
      'border': '#2a2a2a', 'border-light': '#363636', 'border-focus': '#c4b5fd',
      'text-primary': '#f3f3f3', 'text-secondary': '#bdbdbd', 'text-muted': '#9a9a9a',
      'input-placeholder': '#a7a7a7',
      'accent': '#7c3aed', 'accent-hover': '#6d28d9', 'accent-text': '#c4b5fd',
      'accent-glow': 'rgba(124, 45, 237, 0.14)', 'accent-glow2': 'rgba(124, 45, 237, 0.10)',
      'success': '#22c55e', 'success-dim': 'rgba(34, 197, 94, 0.15)',
      'warning': '#f59e0b', 'error': '#ef4444', 'error-dim': 'rgba(239, 68, 68, 0.12)', 'info': '#60a5fa',
    },
  },
  {
    id: 'mono',
    name: 'Mono',
    accent: '#ffffff',
    vars: {
      'bg-base': '#0a0a0a', 'bg-sidebar': '#0e0e0e', 'bg-main': '#111111',
      'bg-elevated': '#161616', 'bg-hover': '#1a1a1a', 'bg-active': '#1e1e1e',
      'bg-input': '#141414', 'bg-message-user': '#181818', 'bg-tool': '#121212',
      'border': '#222222', 'border-light': '#2e2e2e', 'border-focus': '#ffffff',
      'text-primary': '#e5e5e5', 'text-secondary': '#a3a3a3', 'text-muted': '#808080',
      'input-placeholder': '#8a8a8a',
      'btn-text': '#111111',
      'accent': '#ffffff', 'accent-hover': '#e5e5e5', 'accent-text': '#ffffff',
      'accent-glow': 'rgba(255, 255, 255, 0.14)', 'accent-glow2': 'rgba(255, 255, 255, 0.10)',
      'success': '#22c55e', 'success-dim': 'rgba(34, 197, 94, 0.15)',
      'warning': '#f59e0b', 'error': '#ef4444', 'error-dim': 'rgba(239, 68, 68, 0.12)', 'info': '#60a5fa',
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    accent: '#3b82f6',
    vars: {
      'bg-base': '#0a0e1a', 'bg-sidebar': '#0e121f', 'bg-main': '#111625',
      'bg-elevated': '#161c2e', 'bg-hover': '#1a2238', 'bg-active': '#1e2740',
      'bg-input': '#13182a', 'bg-message-user': '#171d30', 'bg-tool': '#0f1423',
      'border': '#1e2a44', 'border-light': '#2a3a5c', 'border-focus': '#93c5fd',
      'text-primary': '#e8edf5', 'text-secondary': '#b0bccf', 'text-muted': '#8a96b0',
      'input-placeholder': '#9aa5bf',
      'accent': '#3b82f6', 'accent-hover': '#2563eb', 'accent-text': '#93c5fd',
      'accent-glow': 'rgba(59, 130, 246, 0.14)', 'accent-glow2': 'rgba(59, 130, 246, 0.10)',
      'success': '#22c55e', 'success-dim': 'rgba(34, 197, 94, 0.15)',
      'warning': '#f59e0b', 'error': '#ef4444', 'error-dim': 'rgba(239, 68, 68, 0.12)', 'info': '#60a5fa',
    },
  },
  {
    id: 'emerald',
    name: 'Emerald',
    accent: '#10b981',
    vars: {
      'bg-base': '#0a140e', 'bg-sidebar': '#0d1811', 'bg-main': '#101d14',
      'bg-elevated': '#15241a', 'bg-hover': '#192c20', 'bg-active': '#1e3426',
      'bg-input': '#121f18', 'bg-message-user': '#16261c', 'bg-tool': '#0e1a12',
      'border': '#1e3a28', 'border-light': '#2a4e36', 'border-focus': '#a7f3d0',
      'text-primary': '#e2f0e8', 'text-secondary': '#a8c4b4', 'text-muted': '#84a894',
      'input-placeholder': '#96b8a4',
      'accent': '#10b981', 'accent-hover': '#059669', 'accent-text': '#a7f3d0',
      'accent-glow': 'rgba(16, 185, 129, 0.14)', 'accent-glow2': 'rgba(16, 185, 129, 0.10)',
      'success': '#22c55e', 'success-dim': 'rgba(34, 197, 94, 0.15)',
      'warning': '#f59e0b', 'error': '#ef4444', 'error-dim': 'rgba(239, 68, 68, 0.12)', 'info': '#60a5fa',
    },
  },
  {
    id: 'ruby',
    name: 'Ruby',
    accent: '#ef4444',
    vars: {
      'bg-base': '#140a0a', 'bg-sidebar': '#180d0d', 'bg-main': '#1c1010',
      'bg-elevated': '#241515', 'bg-hover': '#2c1919', 'bg-active': '#341e1e',
      'bg-input': '#1e1212', 'bg-message-user': '#221717', 'bg-tool': '#160c0c',
      'border': '#3a1e1e', 'border-light': '#4e2a2a', 'border-focus': '#fca5a5',
      'text-primary': '#f0e2e2', 'text-secondary': '#c4a8a8', 'text-muted': '#a88484',
      'input-placeholder': '#b89696',
      'accent': '#ef4444', 'accent-hover': '#dc2626', 'accent-text': '#fca5a5',
      'accent-glow': 'rgba(239, 68, 68, 0.14)', 'accent-glow2': 'rgba(239, 68, 68, 0.10)',
      'success': '#22c55e', 'success-dim': 'rgba(34, 197, 94, 0.15)',
      'warning': '#f59e0b', 'error': '#ef4444', 'error-dim': 'rgba(239, 68, 68, 0.12)', 'info': '#60a5fa',
    },
  },
  {
    id: 'amber',
    name: 'Amber',
    accent: '#f59e0b',
    vars: {
      'bg-base': '#141008', 'bg-sidebar': '#18140a', 'bg-main': '#1c180d',
      'bg-elevated': '#241e12', 'bg-hover': '#2c2616', 'bg-active': '#342e1a',
      'bg-input': '#1e1a10', 'bg-message-user': '#221e12', 'bg-tool': '#16120a',
      'border': '#3a3018', 'border-light': '#4e4022', 'border-focus': '#fde68a',
      'text-primary': '#f0e8d8', 'text-secondary': '#c4b898', 'text-muted': '#a89876',
      'input-placeholder': '#b8a886',
      'accent': '#f59e0b', 'accent-hover': '#d97706', 'accent-text': '#fde68a',
      'accent-glow': 'rgba(245, 158, 11, 0.14)', 'accent-glow2': 'rgba(245, 158, 11, 0.10)',
      'success': '#22c55e', 'success-dim': 'rgba(34, 197, 94, 0.15)',
      'warning': '#f59e0b', 'error': '#ef4444', 'error-dim': 'rgba(239, 68, 68, 0.12)', 'info': '#60a5fa',
    },
  },
  {
    id: 'sky',
    name: 'Sky',
    accent: '#0ea5e9',
    vars: {
      'bg-base': '#081218', 'bg-sidebar': '#0c161c', 'bg-main': '#0f1a22',
      'bg-elevated': '#14222a', 'bg-hover': '#182a34', 'bg-active': '#1c323e',
      'bg-input': '#111e28', 'bg-message-user': '#15222c', 'bg-tool': '#0c1820',
      'border': '#1a3442', 'border-light': '#26485c', 'border-focus': '#bae6fd',
      'text-primary': '#dceaf2', 'text-secondary': '#a0bccf', 'text-muted': '#7ca0b8',
      'input-placeholder': '#8fb0c8',
      'accent': '#0ea5e9', 'accent-hover': '#0284c7', 'accent-text': '#bae6fd',
      'accent-glow': 'rgba(14, 165, 233, 0.14)', 'accent-glow2': 'rgba(14, 165, 233, 0.10)',
      'success': '#22c55e', 'success-dim': 'rgba(34, 197, 94, 0.15)',
      'warning': '#f59e0b', 'error': '#ef4444', 'error-dim': 'rgba(239, 68, 68, 0.12)', 'info': '#60a5fa',
    },
  },
  {
    id: 'rose',
    name: 'Rose',
    accent: '#ec4899',
    vars: {
      'bg-base': '#140a12', 'bg-sidebar': '#180d16', 'bg-main': '#1c101a',
      'bg-elevated': '#241522', 'bg-hover': '#2c192a', 'bg-active': '#341e32',
      'bg-input': '#1e121c', 'bg-message-user': '#221720', 'bg-tool': '#160c14',
      'border': '#3a1e32', 'border-light': '#4e2a46', 'border-focus': '#f9a8d4',
      'text-primary': '#f0e2ea', 'text-secondary': '#c4a8b8', 'text-muted': '#a884a0',
      'input-placeholder': '#b896ac',
      'accent': '#ec4899', 'accent-hover': '#db2777', 'accent-text': '#f9a8d4',
      'accent-glow': 'rgba(236, 72, 153, 0.14)', 'accent-glow2': 'rgba(236, 72, 153, 0.10)',
      'success': '#22c55e', 'success-dim': 'rgba(34, 197, 94, 0.15)',
      'warning': '#f59e0b', 'error': '#ef4444', 'error-dim': 'rgba(239, 68, 68, 0.12)', 'info': '#60a5fa',
    },
  },
  {
    id: 'teal',
    name: 'Teal',
    accent: '#14b8a6',
    vars: {
      'bg-base': '#081414', 'bg-sidebar': '#0c1818', 'bg-main': '#0e1c1c',
      'bg-elevated': '#142424', 'bg-hover': '#182c2c', 'bg-active': '#1c3434',
      'bg-input': '#102020', 'bg-message-user': '#142626', 'bg-tool': '#0c1a1a',
      'border': '#1a3838', 'border-light': '#264c4c', 'border-focus': '#99f6e4',
      'text-primary': '#dceeea', 'text-secondary': '#a0c4be', 'text-muted': '#7ca8a2',
      'input-placeholder': '#8fbab4',
      'accent': '#14b8a6', 'accent-hover': '#0d9488', 'accent-text': '#99f6e4',
      'accent-glow': 'rgba(20, 184, 166, 0.14)', 'accent-glow2': 'rgba(20, 184, 166, 0.10)',
      'success': '#22c55e', 'success-dim': 'rgba(34, 197, 94, 0.15)',
      'warning': '#f59e0b', 'error': '#ef4444', 'error-dim': 'rgba(239, 68, 68, 0.12)', 'info': '#60a5fa',
    },
  },
  {
    id: 'violet',
    name: 'Violet',
    accent: '#8b5cf6',
    vars: {
      'bg-base': '#0e0a18', 'bg-sidebar': '#120d1c', 'bg-main': '#151022',
      'bg-elevated': '#1b152a', 'bg-hover': '#201934', 'bg-active': '#251e3e',
      'bg-input': '#171228', 'bg-message-user': '#1b152e', 'bg-tool': '#100c1a',
      'border': '#281e44', 'border-light': '#382a5e', 'border-focus': '#c4b5fd',
      'text-primary': '#e8e2f2', 'text-secondary': '#b2a8cc', 'text-muted': '#8e84b0',
      'input-placeholder': '#9e94c0',
      'accent': '#8b5cf6', 'accent-hover': '#7c3aed', 'accent-text': '#c4b5fd',
      'accent-glow': 'rgba(139, 92, 246, 0.14)', 'accent-glow2': 'rgba(139, 92, 246, 0.10)',
      'success': '#22c55e', 'success-dim': 'rgba(34, 197, 94, 0.15)',
      'warning': '#f59e0b', 'error': '#ef4444', 'error-dim': 'rgba(239, 68, 68, 0.12)', 'info': '#60a5fa',
    },
  },
  {
    id: 'slate',
    name: 'Slate',
    accent: '#64748b',
    vars: {
      'bg-base': '#0c0e12', 'bg-sidebar': '#101216', 'bg-main': '#13161b',
      'bg-elevated': '#181c22', 'bg-hover': '#1c2028', 'bg-active': '#20242e',
      'bg-input': '#15181e', 'bg-message-user': '#191c24', 'bg-tool': '#0e1016',
      'border': '#242a34', 'border-light': '#303848', 'border-focus': '#cbd5e1',
      'text-primary': '#e2e6ed', 'text-secondary': '#a8b0c0', 'text-muted': '#8690a4',
      'input-placeholder': '#96a0b4',
      'accent': '#64748b', 'accent-hover': '#556379', 'accent-text': '#cbd5e1',
      'accent-glow': 'rgba(100, 116, 139, 0.14)', 'accent-glow2': 'rgba(100, 116, 139, 0.10)',
      'success': '#22c55e', 'success-dim': 'rgba(34, 197, 94, 0.15)',
      'warning': '#f59e0b', 'error': '#ef4444', 'error-dim': 'rgba(239, 68, 68, 0.12)', 'info': '#60a5fa',
    },
  },
  {
    id: 'orange',
    name: 'Orange',
    accent: '#f97316',
    vars: {
      'bg-base': '#140e08', 'bg-sidebar': '#18120a', 'bg-main': '#1c150c',
      'bg-elevated': '#241c12', 'bg-hover': '#2c2416', 'bg-active': '#342c1a',
      'bg-input': '#1e1810', 'bg-message-user': '#221c12', 'bg-tool': '#16100a',
      'border': '#3a2c18', 'border-light': '#4e3c22', 'border-focus': '#fdba74',
      'text-primary': '#f0e6d8', 'text-secondary': '#c4b498', 'text-muted': '#a89476',
      'input-placeholder': '#b8a486',
      'accent': '#f97316', 'accent-hover': '#ea580c', 'accent-text': '#fdba74',
      'accent-glow': 'rgba(249, 115, 22, 0.14)', 'accent-glow2': 'rgba(249, 115, 22, 0.10)',
      'success': '#22c55e', 'success-dim': 'rgba(34, 197, 94, 0.15)',
      'warning': '#f59e0b', 'error': '#ef4444', 'error-dim': 'rgba(239, 68, 68, 0.12)', 'info': '#60a5fa',
    },
  },
];

function applyTheme(themeId) {
  const theme = THEMES.find(t => t.id === themeId) || THEMES[0];
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(`--${key}`, value);
  }
}

function getThemeAccent(themeId) {
  const theme = THEMES.find(t => t.id === themeId) || THEMES[0];
  return theme.accent;
}

/* ============================================================
   SETTINGS STORE
   ============================================================ */

function normalizeSidebarWidth(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 240;
  return Math.min(560, Math.max(120, Math.round(n)));
}

const SettingsStore = (() => {
  let settings = loadSettingsFromStorage();
  let pageEl = null;
  let isOpen = false;
  let activeCategory = 'providers';
  const expandedProviderIds = new Set();
  let focusApiKeyId = null;
  let focusProviderField = null;
  let animateExpandId = null;
  let staggerProviders = false;
  let providerSyncState = {};

  function loadSettingsFromStorage() {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      }

      if (!Array.isArray(parsed.providers)) {
        parsed.providers = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.providers));
      }

      parsed.providers = parsed.providers.map(({ models, imageModels, ...provider }) => provider);
      const migrated = migrateSettings(parsed);
      const rawAppe = parsed.appearance || {};
      if (rawAppe.sidebarWidth === undefined || rawAppe.sidebarHidden === undefined || rawAppe.language === undefined) {
        try {
          localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(migrated));
        } catch (_) { /* ignore quota errors */ }
      }
      return migrated;
    } catch (_) { /* use defaults */ }
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }

  function migrateSettings(settings) {
    const next = { ...settings, providers: [...settings.providers] };
    if (!next.providers.some((p) => p.type === 'opencode')) {
      next.providers.unshift({
        id: 'prov-opencode',
        type: 'opencode',
        name: 'OpenCode Zen',
        baseUrl: PROVIDER_PRESETS.opencode.baseUrl,
        apiKey: '',
        enabled: true,
      });
    }
    if (!next.providers.some((p) => p.type === 'openrouter')) {
      next.providers.unshift({
        id: 'prov-openrouter',
        type: 'openrouter',
        name: 'OpenRouter',
        baseUrl: PROVIDER_PRESETS.openrouter.baseUrl,
        apiKey: '',
        enabled: true,
      });
    }
    next.notifications = {
      taskCompleteEnabled: next.notifications?.taskCompleteEnabled !== false,
      taskCompleteSoundId: TaskSounds.isValid(next.notifications?.taskCompleteSoundId)
        ? next.notifications.taskCompleteSoundId
        : 'chime',
      volume: normalizeNotificationVolume(next.notifications?.volume),
    };
    next.imageProcessing = {
      enabled: next.imageProcessing?.enabled !== false,
    };
    next.appearance = {
      themeId: next.appearance?.themeId || 'default',
      fontSize: next.appearance?.fontSize || 13,
      sidebarWidth: normalizeSidebarWidth(next.appearance?.sidebarWidth),
      sidebarHidden: next.appearance?.sidebarHidden === true,
      language: typeof I18n !== 'undefined' && I18n.isValidPreference(next.appearance?.language)
        ? next.appearance.language
        : (next.appearance?.language === 'en' || next.appearance?.language === 'hu'
          ? next.appearance.language
          : 'system'),
    };
    next.personalization = normalizePersonalization(next.personalization);
    return next;
  }

  const RESPONSE_STYLES = {
    concise: { id: 'concise' },
    balanced: { id: 'balanced' },
    detailed: { id: 'detailed' },
  };

  function getLocalizedResponseStyles() {
    return Object.keys(RESPONSE_STYLES).map((id) => ({
      id,
      label: t(`settings.personalization.style.${id}.label`),
      description: t(`settings.personalization.style.${id}.description`),
    }));
  }

  function normalizePersonalization(value) {
    const style = value?.responseStyle;
    return {
      enabled: value?.enabled !== false,
      preferredName: typeof value?.preferredName === 'string' ? value.preferredName : '',
      role: typeof value?.role === 'string' ? value.role : '',
      responseStyle: RESPONSE_STYLES[style] ? style : 'balanced',
      preferredLanguage: typeof value?.preferredLanguage === 'string' ? value.preferredLanguage : '',
      customInstructions: typeof value?.customInstructions === 'string' ? value.customInstructions : '',
    };
  }

  function buildPersonalizationSystemPrompt(personalization = settings.personalization) {
    const prefs = normalizePersonalization(personalization);
    if (!prefs.enabled) return '';

    const parts = [];

    const name = prefs.preferredName.trim();
    const role = prefs.role.trim();
    const language = prefs.preferredLanguage.trim();

    const stylePrompts = {
      concise: 'Keep responses concise and to the point. Prefer short paragraphs and bullet points when helpful.',
      balanced: 'Use a balanced response style — clear and thorough without unnecessary verbosity.',
      detailed: 'Provide detailed, thorough explanations. Include context and reasoning when helpful.',
    };

    const custom = prefs.customInstructions.trim();
    const hasIdentity = name || role || language;

    if (name) {
      parts.push(`The user's preferred name is ${name}. Address them by this name when appropriate.`);
    }
    if (role) {
      parts.push(`The user's background or role: ${role}. Tailor explanations to this context.`);
    }
    if (language) {
      parts.push(`Respond in ${language} unless the user writes in a different language.`);
    }
    if (prefs.responseStyle !== 'balanced' || hasIdentity || custom) {
      parts.push(stylePrompts[prefs.responseStyle] || stylePrompts.balanced);
    }
    if (custom) parts.push(custom);

    return parts.join('\n\n');
  }

  function normalizeNotificationVolume(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 75;
    return Math.min(100, Math.max(0, Math.round(n)));
  }

  function getNotificationVolume() {
    return normalizeNotificationVolume(settings.notifications?.volume);
  }

  function getSidebarLayout() {
    settings = loadSettingsFromStorage();
    return {
      width: normalizeSidebarWidth(settings.appearance?.sidebarWidth),
      hidden: settings.appearance?.sidebarHidden === true,
    };
  }

  function setSidebarLayout({ width, hidden } = {}) {
    if (width == null && hidden == null) return;

    settings = loadSettingsFromStorage();

    if (!settings.appearance) {
      settings.appearance = {
        themeId: 'default',
        fontSize: 13,
        sidebarWidth: 240,
        sidebarHidden: false,
        language: 'system',
      };
    }

    if (width != null) {
      settings.appearance.sidebarWidth = normalizeSidebarWidth(width);
    }

    if (hidden != null) {
      settings.appearance.sidebarHidden = hidden === true;
    }

    persistSettings();
  }

  function playNotificationSound(soundId = settings.notifications.taskCompleteSoundId) {
    TaskSounds.play(soundId, getNotificationVolume());
  }

  function persistSettings() {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('settings-changed'));
  }

  function save() {
    persistSettings();
    syncProvidersToBackend();
  }

  function getProviders()  { return settings.providers; }
  function getProvider(id) { return settings.providers.find((p) => p.id === id); }

  function isProviderConfiguredForModel(modelId) {
    const prefix = modelId?.split('/')[0];
    if (!prefix) return false;
    return settings.providers.some(
      (p) => p.enabled && p.apiKey?.trim() && resolveOpencodeProviderId(p) === prefix,
    );
  }

  function filterConfiguredModels(models) {
    return models.filter((model) => isProviderConfiguredForModel(model.id));
  }

  function getChatModels() {
    const cached = typeof Backend !== 'undefined' ? Backend.getCachedModels() : null;
    const source = cached?.length ? cached : MODELS;
    return filterConfiguredModels(source);
  }

  async function refreshModelsFromBackend() {
    window.dispatchEvent(new CustomEvent('models-loading', { detail: { loading: true } }));
    try {
      if (typeof Backend === 'undefined' || !Backend.isAvailable()) return getChatModels();
      const ready = await Backend.ensureReady();
      if (!ready?.running) return getChatModels();

      const models = await Backend.getModels(settings.providers);
      if (models?.length) {
        window.dispatchEvent(new CustomEvent('settings-changed'));
        return models;
      }
    } catch (err) {
      Logger.error('settings', 'Failed to load models from backend', err);
    } finally {
      window.dispatchEvent(new CustomEvent('models-loading', { detail: { loading: false } }));
    }
    return getChatModels();
  }

  async function syncProvidersToBackend({ showFeedback = false } = {}) {
    if (typeof Backend === 'undefined' || !Backend.isAvailable()) {
      if (isOpen && activeCategory === 'providers') renderContent();
      return;
    }
    try {
      const ready = await Backend.ensureReady();
      if (!ready?.running) {
        showToast(ready?.error || t('toast.backendNotRunning'));
        if (isOpen && activeCategory === 'providers') renderContent();
        return;
      }

      const results = await Backend.syncProviders(settings.providers);
      providerSyncState = {};

      if (results?.error) {
        showToast(results.error);
        if (isOpen && activeCategory === 'providers') renderContent();
        return;
      }

      if (Array.isArray(results)) {
        for (const result of results) {
          if (result?.id) providerSyncState[result.id] = result;
          const provider = settings.providers.find((p) => p.id === result.id);
          if (provider && !result.ok && !result.skipped && provider.apiKey?.trim()) {
            Logger.error('settings', `Provider sync failed: ${provider.name}`, {
              providerType: provider.type,
              providerId: result.providerId,
              isOpenRouter: provider.type === 'openrouter',
              error: result.error || 'Provider is not connected',
              connectedProviders: result.connected,
            });
          }
        }
        const keyed = results.filter((r) => {
          if (r.skipped) return false;
          const provider = settings.providers.find((p) => p.id === r.id);
          return Boolean(provider?.apiKey?.trim());
        });
        if (showFeedback && keyed.length > 0) {
          const connected = keyed.filter((r) => r.ok).length;
          showToast(t('toast.syncProvidersResult', { connected, total: keyed.length }));
        }
      }

      await refreshModelsFromBackend();
      if (isOpen && activeCategory === 'providers') renderContent();
    } catch (err) {
      Logger.error('settings', 'Failed to sync providers', err);
      showToast(t('toast.syncProvidersFailed'));
    }
  }

  function updateProvider(id, patch, rerender = false) {
    const provider = getProvider(id);
    if (!provider) return;
    Object.assign(provider, patch);
    save();
    if (rerender && isOpen) renderContent();
  }

  function addProvider(type, { expand = false, focusKey = false, focusBaseUrl = false } = {}) {
    const preset = PROVIDER_PRESETS[type] || PROVIDER_PRESETS.custom;
    const provider = {
      id: `prov-${Date.now()}`,
      type,
      name: preset.name,
      baseUrl: preset.baseUrl,
      apiKey: '',
      enabled: true,
    };
    settings.providers.push(provider);
    if (expand) {
      expandedProviderIds.add(provider.id);
      animateExpandId = provider.id;
    }
    if (focusKey) {
      focusApiKeyId = provider.id;
      focusProviderField = 'apiKey';
    }
    if (focusBaseUrl) {
      focusApiKeyId = provider.id;
      focusProviderField = 'baseUrl';
    }
    save();
    staggerProviders = true;
    if (isOpen) renderContent();
    return provider.id;
  }

  function removeProvider(id) {
    settings.providers = settings.providers.filter((p) => p.id !== id);
    expandedProviderIds.delete(id);
    if (!settings.providers.length) {
      settings.providers.push({
        id: `prov-${Date.now()}`,
        type: 'custom',
        name: 'Custom',
        baseUrl: '',
        apiKey: '',
        enabled: true,
      });
    }
    save();
    staggerProviders = true;
    if (isOpen) renderContent();
  }

  function toggleProviderExpanded(id) {
    const isExpanded = expandedProviderIds.has(id);
    const row = pageEl?.querySelector(`[data-provider-id="${id}"]`);

    if (!row) {
      if (isExpanded) expandedProviderIds.delete(id);
      else expandedProviderIds.add(id);
      if (isOpen) renderContent();
      return;
    }

    const details = row.querySelector('.prov-row-body');
    const chevron = row.querySelector('.prov-row-chevron');

    if (isExpanded) {
      expandedProviderIds.delete(id);
      row.classList.remove('is-expanded');
      chevron?.setAttribute('aria-expanded', 'false');
      Physics.rotate(chevron, 0);
      Physics.expandVertical(details, false, () => {
        details.classList.remove('expanded');
        details.classList.add('collapsed');
      });
    } else {
      expandedProviderIds.add(id);
      details.classList.remove('collapsed');
      details.classList.add('expanded');
      row.classList.add('is-expanded');
      chevron?.setAttribute('aria-expanded', 'true');
      Physics.rotate(chevron, 90);
      Physics.expandVertical(details, true);
    }
  }

  function renderRowStatus(provider) {
    if (!provider.enabled) {
      return `<span class="prov-row-status">${t('settings.providers.status.disabled')}</span>`;
    }
    if (!provider.apiKey?.trim()) {
      return `<span class="prov-row-status is-missing">${t('settings.providers.status.noKey')}</span>`;
    }

    const sync = providerSyncState[provider.id];
    if (sync?.ok) {
      return `<span class="prov-row-status is-set">${t('settings.providers.status.connected')}</span>`;
    }
    if (sync && !sync.ok && !sync.skipped) {
      return `<span class="prov-row-status is-error">${t('settings.providers.status.notConnected')}</span>`;
    }
    return `<span class="prov-row-status is-missing">${t('settings.providers.status.notSynced')}</span>`;
  }

  function patchProviderRow(row, provider) {
    if (!row || !provider) return;
    row.classList.toggle('is-enabled', provider.enabled);
    row.classList.toggle('is-disabled', !provider.enabled);
    const nameEl = row.querySelector('.prov-row-name');
    if (nameEl) nameEl.textContent = provider.name;
    const status = row.querySelector('.prov-row-status');
    if (status) {
      const next = renderRowStatus(provider);
      status.outerHTML = next;
    }
  }

  function initProviderRows(container) {
    container.querySelectorAll('.prov-row').forEach((row) => {
      const id = row.dataset.providerId;
      const details = row.querySelector('.prov-row-body');
      const chevron = row.querySelector('.prov-row-chevron');
      const isExpanded = expandedProviderIds.has(id);
      const deferExpand = id === animateExpandId;

      Physics.resetMotion(details);
      Physics.resetMotion(chevron);

      if (isExpanded && !deferExpand) {
        row.classList.add('is-expanded');
        details.classList.remove('collapsed');
        details.classList.add('expanded');
        details.style.height = 'auto';
        details.style.overflow = '';
        details.style.opacity = '1';
        chevron?.setAttribute('aria-expanded', 'true');
        if (chevron) {
          chevron.style.transform = 'rotate(90deg)';
          chevron._springState = { rotate: 90 };
        }
      } else {
        row.classList.remove('is-expanded');
        details.classList.add('collapsed');
        details.classList.remove('expanded');
        details.style.height = '0';
        details.style.overflow = 'hidden';
        details.style.opacity = '0';
        chevron?.setAttribute('aria-expanded', 'false');
        if (chevron) {
          chevron.style.transform = '';
          delete chevron._springState;
        }
      }
    });
  }

  function focusProviderInput(container, id) {
    if (!id || !focusProviderField) return;
    const row = container.querySelector(`[data-provider-id="${id}"]`);
    row?.querySelector(`[data-field="${focusProviderField}"]`)?.focus();
    focusApiKeyId = null;
    focusProviderField = null;
  }

  function runProviderEnterAnimations(container) {
    const configured = container.querySelector('.prov-group-panel');
    if (configured) {
      Physics.stagger(configured, '.prov-row', { opacity: 0, y: 4 }, { preset: 'gentle', delay: 30 });
    }

    const addPanel = container.querySelector('.prov-add-panel');
    if (addPanel) {
      const delay = (container.querySelectorAll('.prov-row').length + 1) * 30;
      setTimeout(() => {
        Physics.stagger(addPanel, '.prov-panel-row', { opacity: 0, y: 4 }, { preset: 'gentle', delay: 25 });
      }, delay);
    }

    const customPanel = container.querySelector('.prov-custom-panel');
    if (customPanel) {
      const delay = (container.querySelectorAll('.prov-row').length + 1) * 30 + 50;
      setTimeout(() => {
        Physics.stagger(customPanel, '.prov-panel-row', { opacity: 0, y: 4 }, { preset: 'gentle', delay: 25 });
      }, delay);
    }

    if (animateExpandId) {
      const id = animateExpandId;
      animateExpandId = null;
      const rows = [...container.querySelectorAll('.prov-row')];
      const index = Math.max(0, rows.findIndex((r) => r.dataset.providerId === id));
      const delay = (index + 1) * 30 + 60;

      setTimeout(() => {
        const row = container.querySelector(`[data-provider-id="${id}"]`);
        if (!row) return;
        const details = row.querySelector('.prov-row-body');
        const chevron = row.querySelector('.prov-row-chevron');
        expandedProviderIds.add(id);
        details.classList.remove('collapsed');
        details.classList.add('expanded');
        row.classList.add('is-expanded');
        chevron?.setAttribute('aria-expanded', 'true');
        Physics.rotate(chevron, 90);
        Physics.expandVertical(details, true, () => {
          focusProviderInput(container, id);
        });
      }, delay);
      return;
    }

    focusProviderInput(container, focusApiKeyId);
  }

  /* ---- Rendering ---- */

  function renderProviderRow(provider) {
    const isExpanded = expandedProviderIds.has(provider.id);
    const deferExpand = provider.id === animateExpandId;
    const detailsClass = isExpanded && !deferExpand ? 'expanded' : 'collapsed';

    return `
      <article
        class="prov-row ${provider.enabled ? 'is-enabled' : 'is-disabled'}${isExpanded && !deferExpand ? ' is-expanded' : ''}"
        data-provider-id="${provider.id}"
      >
        <button class="prov-row-head" type="button" data-action="toggle-expand" aria-expanded="${isExpanded && !deferExpand}">
          <span class="prov-row-chevron" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </span>
          <span class="prov-row-main">
            <span class="prov-row-name">${escapeHtml(provider.name)}</span>
            <span class="prov-row-type">${escapeHtml(provider.type)}</span>
          </span>
          ${renderRowStatus(provider)}
          <label class="settings-toggle prov-row-toggle" title="${provider.enabled ? t('settings.providers.toggle.disable') : t('settings.providers.toggle.enable')}" data-action="stop-propagation">
            <input type="checkbox" class="settings-toggle-input" data-field="enabled" ${provider.enabled ? 'checked' : ''} />
            <span class="settings-toggle-track"></span>
          </label>
        </button>

        <div class="prov-row-body ${detailsClass}">
          <div class="prov-row-fields">
            <div class="prov-form-row">
              <span class="prov-form-label">${t('settings.providers.field.name')}</span>
              <div class="prov-form-control">
                <input
                  class="settings-input"
                  type="text"
                  value="${escapeHtml(provider.name)}"
                  data-field="name"
                  placeholder="${t('settings.providers.placeholder.name')}"
                  spellcheck="false"
                />
              </div>
            </div>

            <div class="prov-form-row">
              <span class="prov-form-label">${t('settings.providers.field.apiKey')}</span>
              <div class="prov-form-control">
                <input
                  class="settings-input settings-api-key-input"
                  type="password"
                  value="${escapeHtml(provider.apiKey)}"
                  data-field="apiKey"
                  placeholder="${t('settings.providers.placeholder.apiKey')}"
                  autocomplete="off"
                  spellcheck="false"
                />
                <button class="settings-icon-btn" type="button" data-action="toggle-key" title="${t('settings.providers.toggle.showKey')}">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2"/>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
                  </svg>
                </button>
                <button class="prov-text-btn prov-test-btn" type="button" data-action="test-provider">${t('settings.providers.test')}</button>
              </div>
            </div>

            ${provider.type === 'custom' ? `
            <div class="prov-form-row">
              <span class="prov-form-label">${t('settings.providers.field.baseUrl')}</span>
              <div class="prov-form-control">
                <input
                  class="settings-input"
                  type="url"
                  value="${escapeHtml(provider.baseUrl)}"
                  data-field="baseUrl"
                  placeholder="${t('settings.providers.placeholder.baseUrl')}"
                  spellcheck="false"
                />
              </div>
            </div>
            ` : ''}
          </div>

          <div class="prov-row-actions">
            <button class="prov-text-btn" type="button" data-action="remove-provider">${t('settings.providers.remove')}</button>
          </div>
        </div>
      </article>
    `;
  }

  const POPULAR_PROVIDERS = [
    { type: 'opencode', name: 'OpenCode Zen' },
    { type: 'openrouter', name: 'OpenRouter' },
    { type: 'openai', name: 'OpenAI' },
    { type: 'anthropic', name: 'Anthropic' },
    { type: 'google', name: 'Google' },
  ];

  function renderPresetRow(provider) {
    const isAdded = settings.providers.some((p) => p.type === provider.type);
    return `
      <div class="prov-panel-row${isAdded ? ' is-added' : ''}">
        <span class="prov-panel-row-label">${escapeHtml(provider.name)}</span>
        <button class="prov-panel-action" type="button" data-action="add-preset" data-type="${provider.type}" ${isAdded ? 'disabled' : ''}>
          ${isAdded ? t('settings.providers.added') : t('settings.providers.add')}
        </button>
      </div>
    `;
  }

  function getOpenRouterProvider() {
    return settings.providers.find((p) => p.type === 'openrouter');
  }

  function isOpenRouterConnected() {
    const provider = getOpenRouterProvider();
    if (!provider?.enabled || !provider.apiKey?.trim()) return false;
    return Boolean(providerSyncState[provider.id]?.ok);
  }

  function isImageProcessingEnabled() {
    return settings.imageProcessing?.enabled !== false;
  }

  function canProcessImages() {
    return isOpenRouterConnected() && isImageProcessingEnabled();
  }

  function getOpenRouterApiKey() {
    const provider = getOpenRouterProvider();
    if (!provider?.enabled || !provider.apiKey?.trim()) return null;
    return provider.apiKey.trim();
  }

  function renderImageProcessingSection() {
    if (!isOpenRouterConnected()) return '';
    const enabled = isImageProcessingEnabled();
    return `
      <div class="prov-group">
        <div class="prov-group-label">${t('settings.providers.group.options')}</div>
        <div class="prov-group-panel">
          <div class="prov-option-row">
            <div class="prov-option-copy">
              <span class="prov-row-name">${t('settings.providers.imageProcessing')}</span>
              <span class="prov-option-note">${t('settings.providers.imageProcessingNote', { model: escapeHtml(IMAGE_DESCRIPTION_MODEL) })}</span>
            </div>
            <label class="settings-toggle prov-row-toggle" title="${enabled ? t('settings.providers.toggle.disableImage') : t('settings.providers.toggle.enableImage')}">
              <input
                type="checkbox"
                class="settings-toggle-input"
                data-image-processing-field="enabled"
                ${enabled ? 'checked' : ''}
              />
              <span class="settings-toggle-track"></span>
            </label>
          </div>
        </div>
      </div>
    `;
  }

  function renderProvidersContent() {
    const connectedCount = Object.values(providerSyncState).filter((s) => s.ok).length;
    return `
      <div class="settings-section">
        <div class="settings-section-header">
          <h2>${t('settings.providers.title')}</h2>
          <p>${t('settings.providers.subtitleBefore')} <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">${t('settings.providers.openRouterLink')}</a>${t('settings.providers.subtitleMiddle')}<a href="https://opencode.ai/auth" target="_blank" rel="noopener noreferrer">${t('settings.providers.openCodeZenLink')}</a>${t('settings.providers.subtitleAfter')}</p>
          <div class="prov-sync-row">
            <button class="prov-sync-btn" type="button" data-action="sync-providers">${t('settings.providers.syncButton')}</button>
            <span class="prov-sync-meta">${t('settings.providers.syncMeta', { connected: connectedCount })}</span>
          </div>
        </div>

        ${renderImageProcessingSection()}

        <div class="prov-group">
          <div class="prov-group-label">${t('settings.providers.group.configured')}</div>
          <div class="prov-group-panel" id="settingsProvidersList">
            ${settings.providers.map(renderProviderRow).join('')}
          </div>
        </div>

        <div class="prov-group">
          <div class="prov-group-label">${t('settings.providers.group.add')}</div>
          <div class="prov-group-panel prov-add-panel">
            ${POPULAR_PROVIDERS.map(renderPresetRow).join('')}
          </div>
        </div>

        <div class="prov-group">
          <div class="prov-group-label">${t('settings.providers.group.custom')}</div>
          <div class="prov-group-panel prov-custom-panel">
            <div class="prov-panel-row">
              <span class="prov-panel-row-label">${t('settings.providers.customEndpoint')}</span>
              <button class="prov-panel-action" type="button" data-action="add-custom">${t('settings.providers.add')}</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderPersonalizationContent() {
    const prefs = normalizePersonalization(settings.personalization);
    const disabledClass = prefs.enabled ? '' : ' is-disabled';

    return `
      <div class="settings-section">
        <div class="settings-section-header">
          <h2>${t('settings.personalization.title')}</h2>
          <p>${t('settings.personalization.subtitle')}</p>
        </div>

        <div class="settings-notif-toggle-row">
          <div class="settings-notif-toggle-copy">
            <div class="settings-label">${t('settings.personalization.useToggle')}</div>
            <div class="settings-label-note">${t('settings.personalization.useToggleNote')}</div>
          </div>
          <label class="settings-toggle" title="${prefs.enabled ? t('settings.personalization.toggleDisable') : t('settings.personalization.toggleEnable')}">
            <input
              type="checkbox"
              class="settings-toggle-input"
              data-pers-field="enabled"
              ${prefs.enabled ? 'checked' : ''}
            />
            <span class="settings-toggle-track"></span>
          </label>
        </div>

        <div class="settings-pers-body${disabledClass}">
          <div class="settings-field-row">
            <div class="settings-field">
              <label class="settings-label" for="pers-preferred-name">${t('settings.personalization.preferredName')}</label>
              <input
                id="pers-preferred-name"
                type="text"
                class="settings-input"
                data-pers-field="preferredName"
                value="${escapeHtml(prefs.preferredName)}"
                placeholder="${t('settings.personalization.placeholder.name')}"
                autocomplete="off"
              />
            </div>
            <div class="settings-field">
              <label class="settings-label" for="pers-role">${t('settings.personalization.role')}</label>
              <input
                id="pers-role"
                type="text"
                class="settings-input"
                data-pers-field="role"
                value="${escapeHtml(prefs.role)}"
                placeholder="${t('settings.personalization.placeholder.role')}"
                autocomplete="off"
              />
            </div>
          </div>

          <div class="settings-field">
            <label class="settings-label" for="pers-language">${t('settings.personalization.language')}</label>
            <input
              id="pers-language"
              type="text"
              class="settings-input"
              data-pers-field="preferredLanguage"
              value="${escapeHtml(prefs.preferredLanguage)}"
              placeholder="${t('settings.personalization.placeholder.language')}"
              autocomplete="off"
            />
          </div>

          <div class="sett-appe-group">
            <div class="sett-appe-group-label">${t('settings.personalization.responseStyle')}</div>
            <div class="settings-pers-style-list">
              ${getLocalizedResponseStyles().map((style) => `
                <button
                  class="settings-pers-style-option${style.id === prefs.responseStyle ? ' active' : ''}"
                  type="button"
                  data-pers-style="${style.id}"
                >
                  <span class="settings-pers-style-label">${escapeHtml(style.label)}</span>
                  <span class="settings-pers-style-desc">${escapeHtml(style.description)}</span>
                </button>
              `).join('')}
            </div>
          </div>

          <div class="settings-field settings-pers-instructions-field">
            <label class="settings-label" for="pers-custom-instructions">${t('settings.personalization.customInstructions')}</label>
            <div class="settings-label-note settings-pers-instructions-note">
              ${t('settings.personalization.customInstructionsNote')}
            </div>
            <textarea
              id="pers-custom-instructions"
              class="settings-input settings-pers-textarea"
              data-pers-field="customInstructions"
              placeholder="${t('settings.personalization.placeholder.instructions')}"
              rows="8"
            >${escapeHtml(prefs.customInstructions)}</textarea>
          </div>
        </div>
      </div>
    `;
  }

  function renderNotificationsContent() {
    const { taskCompleteEnabled, taskCompleteSoundId, volume } = settings.notifications;
    const sounds = TaskSounds.list();

    return `
      <div class="settings-section">
        <div class="settings-section-header">
          <h2>${t('settings.notifications.title')}</h2>
          <p>${t('settings.notifications.subtitle')}</p>
        </div>

        <div class="settings-notif-toggle-row">
          <div class="settings-notif-toggle-copy">
            <div class="settings-label">${t('settings.notifications.taskComplete')}</div>
            <div class="settings-label-note">${t('settings.notifications.taskCompleteNote')}</div>
          </div>
          <label class="settings-toggle" title="${taskCompleteEnabled ? t('settings.notifications.toggleDisable') : t('settings.notifications.toggleEnable')}">
            <input
              type="checkbox"
              class="settings-toggle-input"
              data-notif-field="taskCompleteEnabled"
              ${taskCompleteEnabled ? 'checked' : ''}
            />
            <span class="settings-toggle-track"></span>
          </label>
        </div>

        <div class="settings-notif-volume-row${taskCompleteEnabled ? '' : ' is-disabled'}">
          <div class="settings-notif-volume-copy">
            <div class="settings-label">${t('settings.notifications.volume')}</div>
            <div class="settings-label-note">${t('settings.notifications.volumeNote')}</div>
          </div>
          <div class="settings-volume-control">
            <input
              type="range"
              class="settings-volume-slider"
              data-notif-field="volume"
              min="0"
              max="100"
              step="1"
              value="${volume}"
              aria-valuemin="0"
              aria-valuemax="100"
              aria-valuenow="${volume}"
              aria-label="${t('settings.notifications.volumeAria')}"
            />
            <span class="settings-volume-value" data-notif-volume-label>${volume}%</span>
          </div>
        </div>

        <div class="settings-sound-list${taskCompleteEnabled ? '' : ' is-disabled'}">
          ${sounds.map((sound) => `
            <div
              class="settings-sound-option${sound.id === taskCompleteSoundId ? ' active' : ''}"
              role="button"
              tabindex="0"
              data-sound-id="${sound.id}"
            >
              <div class="settings-sound-option-main">
                <span class="settings-sound-option-label">${escapeHtml(sound.label)}</span>
                <span class="settings-sound-option-desc">${escapeHtml(sound.description)}</span>
              </div>
              <button
                class="settings-sound-preview-btn"
                type="button"
                data-action="preview-sound"
                data-sound-id="${sound.id}"
              >${t('settings.notifications.preview')}</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderShortcutsContent() {
    const groups = [
      {
        labelKey: 'settings.shortcuts.group.general',
        shortcuts: [
          { keys: 'Ctrl+N', actionKey: 'menu.newChat' },
          { keys: 'Ctrl+O', actionKey: 'menu.openFolder' },
          { keys: 'Ctrl+K', actionKey: 'menu.searchChats' },
          { keys: 'Ctrl+B', actionKey: 'menu.toggleSidebar' },
          { keys: 'Ctrl+,', actionKey: 'menu.settings' },
        ],
      },
      {
        labelKey: 'settings.shortcuts.group.editing',
        shortcuts: [
          { keys: 'Ctrl+Z', actionKey: 'menu.undo' },
          { keys: 'Ctrl+Y', actionKey: 'menu.redo' },
          { keys: 'Ctrl+X', actionKey: 'menu.cut' },
          { keys: 'Ctrl+C', actionKey: 'menu.copy' },
          { keys: 'Ctrl+V', actionKey: 'menu.paste' },
          { keys: 'Ctrl+A', actionKey: 'menu.selectAll' },
        ],
      },
      {
        labelKey: 'settings.shortcuts.group.navigation',
        shortcuts: [
          { keys: 'Escape', actionKey: 'settings.shortcuts.closeMenus' },
        ],
      },
    ];

    return `
      <div class="settings-section">
        <div class="settings-section-header">
          <h2>${t('settings.shortcuts.title')}</h2>
          <p>${t('settings.shortcuts.subtitle')}</p>
        </div>
        ${groups.map((group) => `
          <div class="sett-shortcuts-group">
            <div class="sett-shortcuts-group-label">${t(group.labelKey)}</div>
            <div class="sett-shortcuts-list">
              ${group.shortcuts.map((s) => `
                <div class="sett-shortcut-row">
                  <span class="sett-shortcut-action">${t(s.actionKey)}</span>
                  <span class="sett-shortcut-keys">
                    ${s.keys.split('+').map((k) => `<kbd>${k}</kbd>`).join('<span class="sett-shortcut-plus">+</span>')}
                  </span>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderComingSoon(label) {
    const icon =
      `<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 16v-4M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;
    const navKey = `settings.nav.${label}`;
    const localized = t(navKey);
    const title = localized !== navKey ? localized : label.charAt(0).toUpperCase() + label.slice(1);
    return `
      <div class="settings-coming-soon">
        <div class="settings-coming-soon-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">${icon}</svg>
        </div>
        <h3>${title}</h3>
        <p>${t('settings.comingSoon.message')}</p>
      </div>
    `;
  }

  function renderAppearanceContent() {
    const currentThemeId = settings.appearance?.themeId || 'default';
    const currentFontSize = settings.appearance?.fontSize || 13;
    const currentLanguage = settings.appearance?.language || 'system';
    const resolvedFromOs = typeof I18n !== 'undefined'
      ? I18n.normalizeOsLocale(I18n.getOsLocale())
      : 'en';
    const languageHint = currentLanguage === 'system'
      ? t('settings.language.systemHint', {
          locale: typeof I18n !== 'undefined'
            ? I18n.getLocaleLabel(resolvedFromOs)
            : 'English',
        })
      : t('settings.language.manualHint');

    return `
      <div class="settings-section">
        <div class="settings-section-header">
          <h2>${t('settings.appearance.title')}</h2>
          <p>${t('settings.appearance.subtitle')}</p>
        </div>

        <div class="sett-appe-group">
          <div class="sett-appe-group-label">${t('settings.appearance.language')}</div>
          <select class="settings-select" data-appe-field="language" aria-label="${t('settings.appearance.language')}">
            <option value="system"${currentLanguage === 'system' ? ' selected' : ''}>${t('settings.language.system')}</option>
            <option value="en"${currentLanguage === 'en' ? ' selected' : ''}>English</option>
            <option value="hu"${currentLanguage === 'hu' ? ' selected' : ''}>Magyar</option>
          </select>
          <div class="settings-label-note">${languageHint}</div>
        </div>

        <div class="sett-appe-group">
          <div class="sett-appe-group-label">${t('settings.appearance.theme')}</div>
          <div class="sett-appe-grid">
            ${THEMES.map((theme) => {
              const isActive = theme.id === currentThemeId;
              return `
                <button
                  class="sett-appe-card${isActive ? ' active' : ''}"
                  type="button"
                  data-theme-id="${theme.id}"
                  title="${escapeHtml(theme.name)}"
                >
                  <div class="sett-appe-card-swatch" style="--swatch-accent: ${theme.accent}">
                    <div class="sett-appe-card-swatch-bar" style="background: ${theme.accent}"></div>
                    <div class="sett-appe-card-swatch-dots">
                      <span style="background: ${theme.vars['bg-elevated']}"></span>
                      <span style="background: ${theme.vars['bg-elevated']}"></span>
                      <span style="background: ${theme.vars['border-light']}"></span>
                    </div>
                  </div>
                  <div class="sett-appe-card-label">
                    <span>${escapeHtml(theme.name)}</span>
                    ${isActive ? '<svg class="sett-appe-card-check" width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}
                  </div>
                </button>
              `;
            }).join('')}
          </div>
        </div>

        <div class="sett-appe-group">
          <div class="sett-appe-group-label">${t('settings.appearance.textSize')}</div>
          <div class="sett-appe-size-row">
            <span class="sett-appe-size-label">A</span>
            <input
              type="range"
              class="sett-appe-size-slider"
              data-appe-field="fontSize"
              min="11"
              max="16"
              step="0.5"
              value="${currentFontSize}"
              aria-valuemin="11"
              aria-valuemax="16"
              aria-valuenow="${currentFontSize}"
              aria-label="${t('settings.appearance.textSizeAria')}"
            />
            <span class="sett-appe-size-label is-lg">A</span>
            <span class="sett-appe-size-value" data-appe-size-label>${currentFontSize}px</span>
          </div>
        </div>
      </div>
    `;
  }

  function bindAppearanceEvents(container) {
    container.querySelectorAll('.sett-appe-card').forEach((card) => {
      card.addEventListener('click', () => {
        const themeId = card.dataset.themeId;
        if (themeId === settings.appearance.themeId) return;

        settings.appearance.themeId = themeId;
        persistSettings();
        applyTheme(themeId);

        container.querySelectorAll('.sett-appe-card').forEach((c) => {
          c.classList.remove('active');
          const check = c.querySelector('.sett-appe-card-check');
          if (check) check.remove();
        });
        card.classList.add('active');
        const labelEl = card.querySelector('.sett-appe-card-label');
        const checkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        checkSvg.setAttribute('class', 'sett-appe-card-check');
        checkSvg.setAttribute('width', '12');
        checkSvg.setAttribute('height', '12');
        checkSvg.setAttribute('viewBox', '0 0 24 24');
        checkSvg.setAttribute('fill', 'none');
        checkSvg.innerHTML = '<path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>';
        labelEl.appendChild(checkSvg);
      });
    });

    const sizeSlider = container.querySelector('[data-appe-field="fontSize"]');
    const sizeLabel = container.querySelector('[data-appe-size-label]');
    sizeSlider?.addEventListener('input', () => {
      const val = parseFloat(sizeSlider.value);
      if (sizeLabel) sizeLabel.textContent = `${val}px`;
    });
    sizeSlider?.addEventListener('change', () => {
      const val = parseFloat(sizeSlider.value);
      settings.appearance.fontSize = val;
      persistSettings();
      document.documentElement.style.setProperty('--font-size', `${val}px`);
    });

    const langSelect = container.querySelector('[data-appe-field="language"]');
    langSelect?.addEventListener('change', () => {
      const next = langSelect.value;
      if (!I18n.isValidPreference(next) || next === settings.appearance.language) return;
      settings.appearance.language = next;
      persistSettings();
      if (isOpen && activeCategory === 'appearance') renderContent();
    });
  }

  const APP_LOGO_SVG = `
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>
  `;

  let cachedAppInfo = null;
  let cachedUpdateStatus = null;

  function formatUpdateStatusLabel(status) {
    if (!status || status.checking) return t('settings.update.checking');
    if (status.error) return t('settings.update.couldNotCheck');
    if (status.downloading) return t('settings.update.downloading', { version: status.latestVersion });
    if (status.upToDate) return t('settings.update.upToDate');
    const key = status.isPrerelease ? 'settings.update.availablePrerelease' : 'settings.update.available';
    return t(key, { version: status.latestVersion });
  }

  function applyUpdateStatusToAbout(container, status) {
    const el = container?.querySelector('[data-about-field="updateStatus"]');
    const installBtn = container?.querySelector('[data-action="install-update"]');
    if (!el) return;

    el.textContent = formatUpdateStatusLabel(status);
    el.classList.remove('is-current', 'is-available', 'is-error', 'is-checking');
    if (!status || status.checking || status.downloading) {
      el.classList.add('is-checking');
    } else if (status.error) {
      el.classList.add('is-error');
    } else if (status.upToDate) {
      el.classList.add('is-current');
    } else {
      el.classList.add('is-available');
    }

    if (installBtn) {
      const showInstall = status && status.upToDate === false && !status.downloading && !status.installPhase;
      installBtn.hidden = !showInstall;
      if (showInstall) {
        installBtn.textContent = status.isPrerelease
          ? t('settings.about.installPrerelease', { version: status.latestVersion })
          : t('settings.about.installVersion', { version: status.latestVersion });
      }
    }
  }

  function refreshAboutUpdateStatus(status) {
    cachedUpdateStatus = status;
    if (!pageEl || activeCategory !== 'about') return;
    applyUpdateStatusToAbout(pageEl.querySelector('.settings-page-content'), status);
  }

  async function loadAppInfo() {
    if (cachedAppInfo) return cachedAppInfo;

    if (window.electronAPI?.getAppInfo) {
      try {
        cachedAppInfo = await window.electronAPI.getAppInfo();
        return cachedAppInfo;
      } catch (_) { /* fall through */ }
    }

    cachedAppInfo = {
      name: 'Code app',
      version: '1.0.0',
      electron: '—',
      chrome: '—',
      node: '—',
      platform: navigator.platform || 'unknown',
      arch: 'unknown',
      osLabel: navigator.platform || 'Unknown',
      opencodeVersion: null,
    };
    return cachedAppInfo;
  }

  function buildDiagnosticsText(info) {
    return [
      `${info.name} ${info.version}`,
      `Electron ${info.electron}`,
      `Chrome ${info.chrome}`,
      `Node ${info.node}`,
      `OpenCode ${info.opencodeVersion || 'unknown'}`,
      `${info.osLabel || 'Unknown'} (${info.arch})`,
    ].join('\n');
  }

  function renderAboutSystemRow(label, field) {
    return `
      <div class="settings-about-system-row">
        <span class="settings-about-system-label">${escapeHtml(label)}</span>
        <span class="settings-about-system-value" data-about-field="${field}">…</span>
      </div>
    `;
  }

  let logsFilterLevel = 'all';

  function formatLogTimestamp(timestamp) {
    try {
      return new Date(timestamp).toLocaleString();
    } catch {
      return '';
    }
  }

  function extractLogStack(meta) {
    if (!meta || typeof meta !== 'object') return '';
    const stacks = [];
    const candidates = [
      meta.error,
      meta.backendError,
      meta.rawError,
      meta.error?.cause,
    ];
    for (const candidate of candidates) {
      if (candidate?.stack && !stacks.includes(candidate.stack)) {
        stacks.push(candidate.stack);
      }
    }
    return stacks.join('\n\n');
  }

  function renderLogEntry(entry) {
    const stack = extractLogStack(entry.meta);
    const stackBlock = stack
      ? `<pre class="settings-log-stack">${escapeHtml(stack)}</pre>`
      : '';
    const meta = entry.meta
      ? `<pre class="settings-log-meta">${escapeHtml(JSON.stringify(entry.meta, null, 2))}</pre>`
      : '';
    return `
      <div class="settings-log-entry settings-log-entry--${escapeHtml(entry.level)}">
        <div class="settings-log-entry-head">
          <span class="settings-log-level">${escapeHtml(entry.level)}</span>
          <span class="settings-log-source">${escapeHtml(entry.source)}</span>
          <span class="settings-log-time">${escapeHtml(formatLogTimestamp(entry.timestamp))}</span>
        </div>
        <div class="settings-log-message">${escapeHtml(entry.message)}</div>
        ${stackBlock}
        ${meta}
      </div>
    `;
  }

  async function refreshLogsList(container, level = logsFilterLevel) {
    const listEl = container.querySelector('[data-logs-list]');
    if (!listEl) return;

    if (!window.electronAPI?.getRecentLogs) {
      listEl.innerHTML = `<div class="settings-logs-empty">${t('settings.logs.unavailable')}</div>`;
      return;
    }

    listEl.innerHTML = `<div class="settings-logs-empty">${t('settings.logs.loading')}</div>`;

    try {
      const options = { limit: 200 };
      if (level !== 'all') options.level = level;
      const entries = await window.electronAPI.getRecentLogs(options);
      if (!entries.length) {
        listEl.innerHTML = `<div class="settings-logs-empty">${t('settings.logs.empty')}</div>`;
        return;
      }
      listEl.innerHTML = entries.map(renderLogEntry).join('');
    } catch (err) {
      Logger.error('settings', 'Failed to load logs', err);
      listEl.innerHTML = `<div class="settings-logs-empty">${t('settings.logs.loadFailed')}</div>`;
    }
  }

  function renderLogsContent() {
    return `
      <div class="settings-section settings-logs">
        <div class="settings-section-header">
          <h2>${t('settings.logs.title')}</h2>
          <p>${t('settings.logs.subtitle')}</p>
        </div>

        <div class="settings-logs-toolbar">
          <select class="settings-select" data-logs-field="level" aria-label="${t('settings.logs.filterLabel')}">
            <option value="all">${t('settings.logs.filterAll')}</option>
            <option value="error">${t('settings.logs.filterError')}</option>
            <option value="warn">${t('settings.logs.filterWarn')}</option>
            <option value="info">${t('settings.logs.filterInfo')}</option>
          </select>
          <button type="button" class="settings-about-btn settings-about-btn--secondary" data-action="refresh-logs">${t('settings.logs.refresh')}</button>
          <button type="button" class="settings-about-btn settings-about-btn--secondary" data-action="copy-logs">${t('settings.logs.copy')}</button>
          <button type="button" class="settings-about-btn settings-about-btn--secondary" data-action="open-log-folder">${t('settings.logs.openFolder')}</button>
          <button type="button" class="settings-about-btn settings-about-btn--danger" data-action="clear-logs">${t('settings.logs.clear')}</button>
        </div>

        <div class="prov-group">
          <div class="prov-group-label">${t('settings.logs.recent')}</div>
          <div class="prov-group-panel settings-logs-panel">
            <div class="settings-logs-list" data-logs-list>
              <div class="settings-logs-empty">${t('settings.logs.loading')}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function bindLogsEvents(container) {
    const levelSelect = container.querySelector('[data-logs-field="level"]');
    if (levelSelect) {
      levelSelect.value = logsFilterLevel;
      levelSelect.addEventListener('change', () => {
        logsFilterLevel = levelSelect.value;
        void refreshLogsList(container, logsFilterLevel);
      });
    }

    container.querySelector('[data-action="refresh-logs"]')?.addEventListener('click', () => {
      void refreshLogsList(container, logsFilterLevel);
    });

    container.querySelector('[data-action="copy-logs"]')?.addEventListener('click', async () => {
      try {
        const text = window.electronAPI?.exportLogsText
          ? await window.electronAPI.exportLogsText({ limit: 500 })
          : '';
        if (!text) {
          showToast(t('settings.logs.empty'));
          return;
        }
        await navigator.clipboard.writeText(text);
        showToast(t('toast.logsCopied'));
      } catch (err) {
        Logger.error('settings', 'Failed to copy logs', err);
        showToast(t('toast.couldNotCopyClipboard'));
      }
    });

    container.querySelector('[data-action="open-log-folder"]')?.addEventListener('click', async () => {
      try {
        await window.electronAPI?.openLogFolder?.();
      } catch (err) {
        Logger.error('settings', 'Failed to open log folder', err);
        showToast(t('toast.logsOpenFolderFailed'));
      }
    });

    container.querySelector('[data-action="clear-logs"]')?.addEventListener('click', () => {
      showActionToast({
        message: t('settings.logs.clearConfirm'),
        actionLabel: t('settings.logs.clearAction'),
        onAction: async () => {
          try {
            await window.electronAPI?.clearLogs?.();
            await refreshLogsList(container, logsFilterLevel);
            showToast(t('toast.logsCleared'));
          } catch (err) {
            Logger.error('settings', 'Failed to clear logs', err);
            showToast(t('toast.logsClearFailed'));
          }
        },
      });
    });

    void refreshLogsList(container, logsFilterLevel);
  }

  function renderAboutContent() {
    return `
      <div class="settings-section settings-about">
        <div class="settings-about-hero">
          <div class="settings-about-logo settings-about-logo--hero">
            ${APP_LOGO_SVG}
          </div>
          <h2 class="settings-about-name">${t('settings.about.appName')}</h2>
          <div class="settings-about-version" data-about-field="versionHeadline">${t('settings.about.versionHeadline', { version: '…' })}</div>
          <div class="settings-about-update-status is-checking" data-about-field="updateStatus">${t('settings.update.checking')}</div>
          <p class="settings-about-tagline">${t('settings.about.tagline')}</p>
        </div>

        <div class="settings-about-actions">
          <button class="settings-about-btn" type="button" data-action="install-update" hidden>${t('settings.about.installUpdate')}</button>
          <button class="settings-about-btn settings-about-btn--secondary" type="button" data-action="copy-diagnostics">${t('settings.about.copyDiagnostics')}</button>
        </div>

        <div class="prov-group">
          <div class="prov-group-label">${t('settings.about.system')}</div>
          <div class="prov-group-panel settings-about-system-panel">
            ${renderAboutSystemRow(t('settings.about.field.version'), 'version')}
            ${renderAboutSystemRow(t('settings.about.field.opencode'), 'opencodeVersion')}
            ${renderAboutSystemRow(t('settings.about.field.electron'), 'electron')}
            ${renderAboutSystemRow(t('settings.about.field.os'), 'osLabel')}
            ${renderAboutSystemRow(t('settings.about.field.arch'), 'arch')}
          </div>
        </div>

        <p class="settings-about-copyright">${t('settings.about.copyright', { year: new Date().getFullYear() })}</p>

        <div class="prov-group settings-reset-group">
          <div class="prov-group-label">${t('settings.about.reset')}</div>
          <div class="prov-group-panel settings-reset-panel">
            <p class="settings-reset-desc">${t('settings.about.resetDesc')}</p>
            <button class="settings-about-btn settings-about-btn--danger" type="button" data-action="reset-app">${t('settings.about.resetButton')}</button>
          </div>
        </div>
      </div>
    `;
  }

  async function initAboutSection(container) {
    const info = await loadAppInfo();
    const versionLabel = t('settings.about.versionHeadline', { version: info.version });

    container.querySelector('[data-about-field="versionHeadline"]').textContent = versionLabel;
    container.querySelector('[data-about-field="version"]').textContent = info.version;
    container.querySelector('[data-about-field="opencodeVersion"]').textContent = info.opencodeVersion || t('settings.about.unknown');
    container.querySelector('[data-about-field="electron"]').textContent = info.electron;
    container.querySelector('[data-about-field="osLabel"]').textContent = info.osLabel || t('settings.about.unknown');
    container.querySelector('[data-about-field="arch"]').textContent = info.arch;
    container.dataset.aboutVersion = info.version;

    if (cachedUpdateStatus) {
      applyUpdateStatusToAbout(container, cachedUpdateStatus);
      return;
    }

    if (window.electronAPI?.getUpdateStatus) {
      try {
        const status = await window.electronAPI.getUpdateStatus();
        refreshAboutUpdateStatus(status);
      } catch (_) {
        applyUpdateStatusToAbout(container, { error: true });
      }
    } else {
      applyUpdateStatusToAbout(container, { upToDate: true });
    }
  }

  function bindAboutEvents(container) {
    container.querySelector('[data-action="install-update"]')?.addEventListener('click', () => {
      if (typeof window.installAppUpdate === 'function') {
        window.installAppUpdate();
        return;
      }
      showToast(t('toast.couldNotStartUpdate'));
    });

    container.querySelector('[data-action="copy-diagnostics"]')?.addEventListener('click', async () => {
      const info = await loadAppInfo();
      const text = buildDiagnosticsText(info);
      try {
        await navigator.clipboard.writeText(text);
        showToast(t('toast.systemInfoCopied'));
      } catch (_) {
        showToast(t('toast.couldNotCopyClipboard'));
      }
    });

    container.querySelector('[data-action="reset-app"]')?.addEventListener('click', () => {
      showActionToast({
        message: t('toast.resetConfirm'),
        actionLabel: t('toast.actionReset'),
        onAction: () => {
          if (typeof window.resetApp === 'function') window.resetApp();
        },
      });
    });
  }

  const CATEGORIES = [
    {
      sectionKey: 'settings.section.configuration',
      items: [
        {
          id: "providers",
          labelKey: "settings.nav.providers",
          icon: `<path d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
        },
        {
          id: "notifications",
          labelKey: "settings.nav.notifications",
          icon: `<path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-5-5.9V4a2 2 0 10-4 0v1.1A6 6 0 004 11v3.2c0 .5-.2 1-.6 1.4L2 17h5m8 0a3 3 0 01-6 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
        },
        {
          id: "personalization",
          labelKey: "settings.nav.personalization",
          icon: `<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="2"/>`,
        },
        {
          id: "appearance",
          labelKey: "settings.nav.appearance",
          icon: `<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
        },
        {
          id: "shortcuts",
          labelKey: "settings.nav.shortcuts",
          icon: `<rect x="2" y="7" width="20" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 12h.01M12 12h.01M16 12h.01M8 16h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
        },
      ],
    },
    {
      sectionKey: 'settings.section.app',
      items: [
        {
          id: "logs",
          labelKey: "settings.nav.logs",
          icon: `<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
        },
        {
          id: "about",
          labelKey: "settings.nav.about",
          icon: `<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 16v-4M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
        },
      ],
    },
  ];

  function renderNav() {
    return CATEGORIES.map(
      (group) => `
      <div class="settings-nav-group">
        <div class="settings-nav-section-label">${t(group.sectionKey)}</div>
        ${group.items
          .map(
            (item) => `
          <button
            class="settings-nav-item${activeCategory === item.id ? " active" : ""}"
            type="button"
            data-category="${item.id}"
          >
            <svg class="settings-nav-icon" width="14" height="14" viewBox="0 0 24 24" fill="none">${item.icon}</svg>
            <span>${t(item.labelKey)}</span>
            ${item.soon ? `<span class="settings-nav-soon">${t('settings.nav.soon')}</span>` : ""}
          </button>
        `,
          )
          .join("")}
      </div>
    `,
    ).join("");
  }

  function renderCategoryContent() {
    switch (activeCategory) {
      case "providers":
        return renderProvidersContent();
      case "notifications":
        return renderNotificationsContent();
      case "personalization":
        return renderPersonalizationContent();
      case "appearance":
        return renderAppearanceContent();
      case "shortcuts":
        return renderShortcutsContent();
      case "logs":
        return renderLogsContent();
      case "about":
        return renderAboutContent();
      default:
        return renderComingSoon(activeCategory);
    }
  }

  function renderContent() {
    if (!pageEl) return;

    const contentEl = pageEl.querySelector(".settings-page-content");
    if (!contentEl) return;

    contentEl.innerHTML = renderCategoryContent();
    bindContentEvents(contentEl);

    if (activeCategory === "providers") {
      initProviderRows(contentEl);
      if (staggerProviders) {
        runProviderEnterAnimations(contentEl);
        staggerProviders = false;
      } else if (focusApiKeyId) {
        focusProviderInput(contentEl, focusApiKeyId);
      }
      Physics.bindPressTargets(contentEl);
      Physics.bindToggleTargets(contentEl);
    }

    if (activeCategory === "appearance") {
      bindAppearanceEvents(contentEl);
      Physics.bindPressTargets(contentEl);
    }

    if (activeCategory === "personalization") {
      bindPersonalizationEvents(contentEl);
      Physics.bindPressTargets(contentEl);
    }

    if (activeCategory === "logs") {
      bindLogsEvents(contentEl);
      Physics.bindPressTargets(contentEl);
    }

    if (activeCategory === "about") {
      bindAboutEvents(contentEl);
      void initAboutSection(contentEl);
      Physics.bindPressTargets(contentEl);
    }

    // Update nav active state
    pageEl.querySelectorAll(".settings-nav-item").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.category === activeCategory);
    });
  }

  function bindContentEvents(container) {
    container.querySelectorAll('.prov-row').forEach((row) => {
      const id = row.dataset.providerId;

      row.querySelectorAll('[data-action="toggle-expand"]').forEach((el) => {
        el.addEventListener('click', (e) => {
          if (e.target.closest('[data-action="stop-propagation"]')) return;
          toggleProviderExpanded(id);
        });
      });

      row.querySelectorAll('[data-field]').forEach((input) => {
        const field = input.dataset.field;
        const event = input.type === 'checkbox' ? 'change' : 'input';

        input.addEventListener(event, (e) => {
          e.stopPropagation();
          const value = input.type === 'checkbox' ? input.checked : input.value;
          if (field === 'name' && !value.trim()) return;
          Object.assign(getProvider(id), { [field]: value });
          persistSettings();
          if (field === 'enabled') {
            patchProviderRow(row, getProvider(id));
            syncProvidersToBackend();
          }
        });

        if (field === 'apiKey' || field === 'baseUrl') {
          input.addEventListener('blur', () => {
            patchProviderRow(row, getProvider(id));
            syncProvidersToBackend();
          });
        }

        if (field === 'name') {
          input.addEventListener('blur', () => {
            const nameEl = row.querySelector('.prov-row-name');
            if (nameEl) nameEl.textContent = getProvider(id)?.name || '';
          });
        }
      });

      row.querySelector('[data-action="stop-propagation"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
      });

      row.querySelector('[data-action="remove-provider"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (settings.providers.length <= 1) {
          showToast(t('toast.keepOneProvider'));
          return;
        }
        removeProvider(id);
        showToast(t('toast.providerRemoved'));
      });

      row.querySelector('[data-action="toggle-key"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const input = row.querySelector('.settings-api-key-input');
        input.type = input.type === 'password' ? 'text' : 'password';
      });

      row.querySelector('[data-action="test-provider"]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const provider = getProvider(id);
        if (!provider?.apiKey?.trim()) {
          showToast(t('toast.addApiKeyFirst'));
          return;
        }
        if (provider.type === 'custom' && !provider.baseUrl?.trim()) {
          showToast(t('toast.addBaseUrlFirst'));
          return;
        }
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = t('settings.providers.testing');
        try {
          const result = await Backend.testProvider(provider);
          providerSyncState[id] = {
            id,
            ok: result.ok,
            providerId: result.providerId,
          };
          patchProviderRow(row, provider);
          showToast(result.ok
            ? t('toast.providerConnected', { name: provider.name })
            : t('toast.providerConnectFailed', { name: provider.name }));
          if (!result.ok) {
            Logger.error('settings', `Provider test failed: ${provider.name}`, {
              providerType: provider.type,
              providerId: result.providerId,
              isOpenRouter: provider.type === 'openrouter',
              connectedProviders: result.connected,
            });
          }
          if (result.ok) await refreshModelsFromBackend();
        } catch (err) {
          Logger.error('settings', 'Provider test failed', err);
          showToast(t('toast.testFailed', { error: err.message || t('toast.unknownError') }));
        } finally {
          btn.disabled = false;
          btn.textContent = t('settings.providers.test');
        }
      });
    });

    container.querySelectorAll('[data-action="add-preset"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        if (settings.providers.some((p) => p.type === type)) {
          showToast(t('toast.providerAlreadyAdded'));
          return;
        }
        addProvider(type, { expand: true, focusKey: true });
        showToast(t('toast.providerAddedPasteKey'));
      });
    });

    container.querySelector('[data-action="add-custom"]')?.addEventListener('click', () => {
      addProvider('custom', { expand: true, focusBaseUrl: true });
      showToast(t('toast.customProviderAdded'));
    });

    container.querySelector('[data-action="sync-providers"]')?.addEventListener('click', () => {
      syncProvidersToBackend({ showFeedback: true });
    });

    container.querySelector('[data-image-processing-field="enabled"]')?.addEventListener('change', (e) => {
      settings.imageProcessing.enabled = e.target.checked;
      persistSettings();
    });

    bindNotificationsEvents(container);
  }

  function bindPersonalizationEvents(container) {
    const body = container.querySelector('.settings-pers-body');
    if (!body) return;

    const toggle = container.querySelector('[data-pers-field="enabled"]');
    toggle?.addEventListener('change', () => {
      settings.personalization.enabled = toggle.checked;
      body.classList.toggle('is-disabled', !toggle.checked);
      persistSettings();
    });

    body.querySelectorAll('[data-pers-field]').forEach((input) => {
      if (input.dataset.persField === 'enabled') return;
      input.addEventListener('input', () => {
        settings.personalization[input.dataset.persField] = input.value;
        persistSettings();
      });
    });

    body.querySelectorAll('[data-pers-style]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const styleId = btn.dataset.persStyle;
        if (!RESPONSE_STYLES[styleId] || styleId === settings.personalization.responseStyle) return;
        settings.personalization.responseStyle = styleId;
        persistSettings();
        body.querySelectorAll('[data-pers-style]').forEach((el) => {
          el.classList.toggle('active', el.dataset.persStyle === styleId);
        });
      });
    });
  }

  function bindNotificationsEvents(container) {
    const soundList = container.querySelector('.settings-sound-list');
    if (!soundList) return;

    const volumeRow = container.querySelector('.settings-notif-volume-row');
    const volumeSlider = container.querySelector('[data-notif-field="volume"]');
    const volumeLabel = container.querySelector('[data-notif-volume-label]');

    const toggle = container.querySelector('[data-notif-field="taskCompleteEnabled"]');
    toggle?.addEventListener('change', () => {
      settings.notifications.taskCompleteEnabled = toggle.checked;
      soundList.classList.toggle('is-disabled', !toggle.checked);
      volumeRow?.classList.toggle('is-disabled', !toggle.checked);
      persistSettings();
      if (toggle.checked) playNotificationSound();
    });

    volumeSlider?.addEventListener('input', () => {
      const nextVolume = normalizeNotificationVolume(volumeSlider.value);
      settings.notifications.volume = nextVolume;
      volumeSlider.setAttribute('aria-valuenow', String(nextVolume));
      if (volumeLabel) volumeLabel.textContent = `${nextVolume}%`;
    });

    volumeSlider?.addEventListener('change', () => {
      settings.notifications.volume = normalizeNotificationVolume(volumeSlider.value);
      persistSettings();
      if (settings.notifications.taskCompleteEnabled && settings.notifications.volume > 0) {
        playNotificationSound();
      }
    });

    container.querySelectorAll('.settings-sound-option').forEach((row) => {
      const selectSound = () => {
        const id = row.dataset.soundId;
        if (!id || id === settings.notifications.taskCompleteSoundId) {
          if (settings.notifications.taskCompleteEnabled) playNotificationSound(id);
          return;
        }
        settings.notifications.taskCompleteSoundId = id;
        persistSettings();
        container.querySelectorAll('.settings-sound-option').forEach((el) => {
          el.classList.toggle('active', el.dataset.soundId === id);
        });
        if (settings.notifications.taskCompleteEnabled) playNotificationSound(id);
      };

      row.addEventListener('click', (e) => {
        if (e.target.closest('[data-action="preview-sound"]')) return;
        selectSound();
      });

      row.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        selectSound();
      });
    });

    container.querySelectorAll('[data-action="preview-sound"]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        TaskSounds.play(btn.dataset.soundId, getNotificationVolume());
      });
    });
  }

  function render() {
    if (!pageEl) return;

    pageEl.innerHTML = `
      <div class="settings-page-header">
        <button class="settings-back-btn" id="settingsBackBtn" type="button">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
            <path d="M19 12H5M12 5l-7 7 7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          ${t('settings.back')}
        </button>
        <span class="settings-page-title">${t('settings.title')}</span>
        <div></div>
      </div>
      <div class="settings-page-layout">
        <nav class="settings-page-nav">${renderNav()}</nav>
        <div class="settings-page-content"></div>
      </div>
    `;

    pageEl.querySelector("#settingsBackBtn").addEventListener("click", close);

    pageEl.querySelectorAll(".settings-nav-item").forEach((btn) => {
      btn.addEventListener("click", () => {
        const category = btn.dataset.category;
        if (category === activeCategory) return;
        if (btn.querySelector(".settings-nav-soon")) {
          showToast(t('toast.comingSoon'));
          return;
        }
        activeCategory = category;
        if (category === 'providers') staggerProviders = true;
        renderContent();
      });
    });

    renderContent();
  }

  function open() {
    pageEl = document.getElementById('settingsScreen');
    if (!pageEl) return;

    if (isOpen) {
      showSettingsScreen();
      return;
    }

    settings = loadSettingsFromStorage();
    isOpen = true;
    staggerProviders = true;
    render();
    showSettingsScreen();
    syncProvidersToBackend();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    hideSettingsScreen();
  }

  /** Keep open flag in sync when another screen hides settings without close(). */
  function syncClosed() {
    isOpen = false;
  }

  function getIsOpen() { return isOpen; }

  function getNotificationSettings() {
    return {
      taskCompleteEnabled: settings.notifications?.taskCompleteEnabled !== false,
      taskCompleteSoundId: settings.notifications?.taskCompleteSoundId || 'chime',
      volume: getNotificationVolume(),
    };
  }

  function getPersonalizationSystemPrompt() {
    return buildPersonalizationSystemPrompt(settings.personalization);
  }

  function applyStartupAppearance() {
    settings = loadSettingsFromStorage();
    const appe = settings.appearance || {};
    applyTheme(appe.themeId || 'default');
    const fs = parseFloat(appe.fontSize);
    if (fs > 0) document.documentElement.style.setProperty('--font-size', `${fs}px`);
    document.documentElement.style.setProperty(
      '--sidebar-width',
      `${normalizeSidebarWidth(appe.sidebarWidth)}px`,
    );
  }

  window.addEventListener('language-changed', () => {
    if (!isOpen || !pageEl) return;
    render();
  });

  return {
    open,
    close,
    syncClosed,
    getIsOpen,
    getNotificationSettings,
    getPersonalizationSystemPrompt,
    getChatModels,
    getProviders,
    refreshModelsFromBackend,
    syncProvidersToBackend,
    isOpenRouterConnected,
    isImageProcessingEnabled,
    canProcessImages,
    getOpenRouterApiKey,
    refreshAboutUpdateStatus,
    getSidebarLayout,
    setSidebarLayout,
    applyStartupAppearance,
  };
})();

function openSettings()  { SettingsStore.open(); }
function closeSettings() { SettingsStore.close(); }

/* Apply saved appearance on startup */
SettingsStore.applyStartupAppearance();
