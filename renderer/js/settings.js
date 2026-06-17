/* ============================================================
   SETTINGS - Full-page settings with category navigation
   ============================================================ */

'use strict';

const SETTINGS_STORAGE_KEY = 'code-app-settings';

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
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.providers?.length) {
          parsed.providers = parsed.providers.map(({ models, imageModels, ...provider }) => provider);
          return migrateSettings(parsed);
        }
      }
    } catch (_) { /* use defaults */ }
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }

  function migrateSettings(settings) {
    const next = { ...settings, providers: [...settings.providers] };
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
    return next;
  }

  function normalizeNotificationVolume(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return 75;
    return Math.min(100, Math.max(0, Math.round(n)));
  }

  function getNotificationVolume() {
    return normalizeNotificationVolume(settings.notifications?.volume);
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

  function getChatModels() {
    const cached = typeof Backend !== 'undefined' ? Backend.getCachedModels() : null;
    if (cached?.length) return cached;
    return MODELS;
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
      console.error('Failed to load models from backend:', err);
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
        showToast(ready?.error || 'AI backend is not running');
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
        }
        const keyed = results.filter((r) => {
          if (r.skipped) return false;
          const provider = settings.providers.find((p) => p.id === r.id);
          return Boolean(provider?.apiKey?.trim());
        });
        if (showFeedback && keyed.length > 0) {
          const connected = keyed.filter((r) => r.ok).length;
          showToast(`Synced ${connected}/${keyed.length} provider${keyed.length === 1 ? '' : 's'}`);
        }
      }

      await refreshModelsFromBackend();
      if (isOpen && activeCategory === 'providers') renderContent();
    } catch (err) {
      console.error('Failed to sync providers:', err);
      showToast('Failed to sync providers');
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
      return '<span class="prov-row-status">Disabled</span>';
    }
    if (!provider.apiKey?.trim()) {
      return '<span class="prov-row-status is-missing">No key</span>';
    }

    const sync = providerSyncState[provider.id];
    if (sync?.ok) {
      return '<span class="prov-row-status is-set">Connected</span>';
    }
    if (sync && !sync.ok && !sync.skipped) {
      return '<span class="prov-row-status is-error">Not connected</span>';
    }
    return '<span class="prov-row-status is-missing">Not synced</span>';
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
          <label class="settings-toggle prov-row-toggle" title="${provider.enabled ? 'Disable' : 'Enable'} provider" data-action="stop-propagation">
            <input type="checkbox" class="settings-toggle-input" data-field="enabled" ${provider.enabled ? 'checked' : ''} />
            <span class="settings-toggle-track"></span>
          </label>
        </button>

        <div class="prov-row-body ${detailsClass}">
          <div class="prov-row-fields">
            <div class="prov-form-row">
              <span class="prov-form-label">Name</span>
              <div class="prov-form-control">
                <input
                  class="settings-input"
                  type="text"
                  value="${escapeHtml(provider.name)}"
                  data-field="name"
                  placeholder="Provider name"
                  spellcheck="false"
                />
              </div>
            </div>

            <div class="prov-form-row">
              <span class="prov-form-label">API key</span>
              <div class="prov-form-control">
                <input
                  class="settings-input settings-api-key-input"
                  type="password"
                  value="${escapeHtml(provider.apiKey)}"
                  data-field="apiKey"
                  placeholder="Paste API key"
                  autocomplete="off"
                  spellcheck="false"
                />
                <button class="settings-icon-btn" type="button" data-action="toggle-key" title="Show/hide key">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2"/>
                    <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
                  </svg>
                </button>
                <button class="prov-text-btn prov-test-btn" type="button" data-action="test-provider">Test</button>
              </div>
            </div>

            ${provider.type === 'custom' ? `
            <div class="prov-form-row">
              <span class="prov-form-label">Base URL</span>
              <div class="prov-form-control">
                <input
                  class="settings-input"
                  type="url"
                  value="${escapeHtml(provider.baseUrl)}"
                  data-field="baseUrl"
                  placeholder="https://api.example.com/v1"
                  spellcheck="false"
                />
              </div>
            </div>
            ` : ''}
          </div>

          <div class="prov-row-actions">
            <button class="prov-text-btn" type="button" data-action="remove-provider">Remove</button>
          </div>
        </div>
      </article>
    `;
  }

  const POPULAR_PROVIDERS = [
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
          ${isAdded ? 'Added' : 'Add'}
        </button>
      </div>
    `;
  }

  function renderProvidersContent() {
    const connectedCount = Object.values(providerSyncState).filter((s) => s.ok).length;
    return `
      <div class="settings-section">
        <div class="settings-section-header">
          <h2>Providers</h2>
          <p>Add your API keys below. Keys stay on this device and are sent to the local OpenCode agent when you sync. Get an <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">OpenRouter API key</a> for hundreds of models through one key.</p>
          <div class="prov-sync-row">
            <button class="prov-sync-btn" type="button" data-action="sync-providers">Sync providers</button>
            <span class="prov-sync-meta">${connectedCount} connected · Free OpenCode models work without a key</span>
          </div>
        </div>

        <div class="prov-group">
          <div class="prov-group-label">Configured</div>
          <div class="prov-group-panel" id="settingsProvidersList">
            ${settings.providers.map(renderProviderRow).join('')}
          </div>
        </div>

        <div class="prov-group">
          <div class="prov-group-label">Add</div>
          <div class="prov-group-panel prov-add-panel">
            ${POPULAR_PROVIDERS.map(renderPresetRow).join('')}
          </div>
        </div>

        <div class="prov-group">
          <div class="prov-group-label">Custom</div>
          <div class="prov-group-panel prov-custom-panel">
            <div class="prov-panel-row">
              <span class="prov-panel-row-label">Custom endpoint</span>
              <button class="prov-panel-action" type="button" data-action="add-custom">Add</button>
            </div>
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
          <h2>Notifications</h2>
          <p>Choose how you're alerted when a chat task finishes.</p>
        </div>

        <div class="settings-notif-toggle-row">
          <div class="settings-notif-toggle-copy">
            <div class="settings-label">Task complete sound</div>
            <div class="settings-label-note">Play a sound when any chat finishes running</div>
          </div>
          <label class="settings-toggle" title="${taskCompleteEnabled ? 'Disable' : 'Enable'} task complete sound">
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
            <div class="settings-label">Volume</div>
            <div class="settings-label-note">How loud notification sounds play</div>
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
              aria-label="Notification volume"
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
              >Preview</button>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  function renderComingSoon(label) {
    const icons = {
      appearance: `<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
      shortcuts: `<rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2"/><path d="M16 2l-4 5-4-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
    };
    const icon =
      icons[label] ||
      `<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 16v-4M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;
    const title = label.charAt(0).toUpperCase() + label.slice(1);
    return `
      <div class="settings-coming-soon">
        <div class="settings-coming-soon-icon">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">${icon}</svg>
        </div>
        <h3>${title}</h3>
        <p>This section is under construction and will be available in a future update.</p>
      </div>
    `;
  }

  function renderAboutContent() {
    return `
      <div class="settings-section">
        <div class="settings-section-header">
          <h2>About</h2>
          <p>Information about this application.</p>
        </div>
        <div class="settings-about-card">
          <div class="settings-about-logo">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="#8b5cf6" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="settings-about-info">
            <div class="settings-about-name">Code app</div>
            <div class="settings-about-version">Version 0.1.0</div>
          </div>
        </div>
        <div class="settings-about-rows">
          <div class="settings-about-row">
            <span class="settings-about-row-label">AI Agent</span>
            <span class="settings-about-row-value">OpenCode - 75+ providers</span>
          </div>
          <div class="settings-about-row">
            <span class="settings-about-row-label">Storage</span>
            <span class="settings-about-row-value">Local - API keys stored on device</span>
          </div>
          <div class="settings-about-row">
            <span class="settings-about-row-label">Runtime</span>
            <span class="settings-about-row-value">Electron</span>
          </div>
          <div class="settings-about-row">
            <span class="settings-about-row-label">Renderer</span>
            <span class="settings-about-row-value">Vanilla JS, no framework</span>
          </div>
        </div>
      </div>
    `;
  }

  const CATEGORIES = [
    {
      section: "Configuration",
      items: [
        {
          id: "providers",
          label: "Providers",
          icon: `<path d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
        },
        {
          id: "notifications",
          label: "Notifications",
          icon: `<path d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 00-5-5.9V4a2 2 0 10-4 0v1.1A6 6 0 004 11v3.2c0 .5-.2 1-.6 1.4L2 17h5m8 0a3 3 0 01-6 0" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
        },
        {
          id: "appearance",
          label: "Appearance",
          soon: true,
          icon: `<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 8v4M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
        },
        {
          id: "shortcuts",
          label: "Shortcuts",
          soon: true,
          icon: `<rect x="2" y="7" width="20" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 12h.01M12 12h.01M16 12h.01M8 16h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
        },
      ],
    },
    {
      section: "App",
      items: [
        {
          id: "about",
          label: "About",
          icon: `<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 16v-4M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
        },
      ],
    },
  ];

  function renderNav() {
    return CATEGORIES.map(
      (group) => `
      <div class="settings-nav-group">
        <div class="settings-nav-section-label">${group.section}</div>
        ${group.items
          .map(
            (item) => `
          <button
            class="settings-nav-item${activeCategory === item.id ? " active" : ""}"
            type="button"
            data-category="${item.id}"
          >
            <svg class="settings-nav-icon" width="14" height="14" viewBox="0 0 24 24" fill="none">${item.icon}</svg>
            <span>${item.label}</span>
            ${item.soon ? '<span class="settings-nav-soon">Soon</span>' : ""}
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
          showToast('Keep at least one provider');
          return;
        }
        removeProvider(id);
        showToast('Provider removed');
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
          showToast('Add an API key first');
          return;
        }
        if (provider.type === 'custom' && !provider.baseUrl?.trim()) {
          showToast('Add a base URL first');
          return;
        }
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = 'Testing…';
        try {
          const result = await Backend.testProvider(provider);
          providerSyncState[id] = {
            id,
            ok: result.ok,
            providerId: result.providerId,
          };
          patchProviderRow(row, provider);
          showToast(result.ok ? `${provider.name} connected` : `Could not connect to ${provider.name}`);
          if (result.ok) await refreshModelsFromBackend();
        } catch (err) {
          showToast(`Test failed: ${err.message || 'Unknown error'}`);
        } finally {
          btn.disabled = false;
          btn.textContent = 'Test';
        }
      });
    });

    container.querySelectorAll('[data-action="add-preset"]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        if (settings.providers.some((p) => p.type === type)) {
          showToast('Provider already added');
          return;
        }
        addProvider(type, { expand: true, focusKey: true });
        showToast('Provider added - paste your API key');
      });
    });

    container.querySelector('[data-action="add-custom"]')?.addEventListener('click', () => {
      addProvider('custom', { expand: true, focusBaseUrl: true });
      showToast('Custom provider added');
    });

    container.querySelector('[data-action="sync-providers"]')?.addEventListener('click', () => {
      syncProvidersToBackend({ showFeedback: true });
    });

    bindNotificationsEvents(container);
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
          Back
        </button>
        <span class="settings-page-title">Settings</span>
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
          showToast("Coming soon");
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
    if (isOpen) return;
    settings = loadSettingsFromStorage();
    pageEl = document.getElementById('settingsScreen');
    if (!pageEl) return;
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

  function getIsOpen() { return isOpen; }

  function getNotificationSettings() {
    return {
      taskCompleteEnabled: settings.notifications?.taskCompleteEnabled !== false,
      taskCompleteSoundId: settings.notifications?.taskCompleteSoundId || 'chime',
      volume: getNotificationVolume(),
    };
  }

  return {
    open,
    close,
    getIsOpen,
    getNotificationSettings,
    getChatModels,
    getProviders,
    refreshModelsFromBackend,
    syncProvidersToBackend,
  };
})();

function openSettings()  { SettingsStore.open(); }
function closeSettings() { SettingsStore.close(); }
