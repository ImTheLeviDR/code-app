/* ============================================================
   SETTINGS — Full-page settings with category navigation
   ============================================================ */

'use strict';

const SETTINGS_STORAGE_KEY = 'code-app-settings';

const PROVIDER_COLORS = {
  openai:    '#10a37f',
  anthropic: '#d4763b',
  google:    '#4285f4',
  custom:    '#8b5cf6',
};

const SettingsStore = (() => {
  let settings = loadSettingsFromStorage();
  let pageEl = null;
  let isOpen = false;
  let activeCategory = 'providers';

  function loadSettingsFromStorage() {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed?.providers?.length) return parsed;
      }
    } catch (_) { /* use defaults */ }
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }

  function save() {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new CustomEvent('settings-changed'));
  }

  function getProviders()  { return settings.providers; }
  function getProvider(id) { return settings.providers.find((p) => p.id === id); }

  function getChatModels() {
    const seen = new Set();
    const models = [];
    settings.providers
      .filter((p) => p.enabled)
      .forEach((p) => {
        p.models.forEach((name) => {
          if (!seen.has(name)) {
            seen.add(name);
            models.push({ id: name, label: name });
          }
        });
      });
    return models.length ? models : MODELS;
  }

  function updateProvider(id, patch, rerender = false) {
    const provider = getProvider(id);
    if (!provider) return;
    Object.assign(provider, patch);
    save();
    if (rerender && isOpen) renderContent();
  }

  function addProvider(type) {
    const preset = PROVIDER_PRESETS[type] || PROVIDER_PRESETS.custom;
    const provider = {
      id: `prov-${Date.now()}`,
      type,
      name: preset.name,
      baseUrl: preset.baseUrl,
      apiKey: '',
      enabled: true,
      models: [...preset.models],
      imageModels: [...preset.imageModels],
    };
    settings.providers.push(provider);
    save();
    if (isOpen) renderContent();
    return provider.id;
  }

  function removeProvider(id) {
    settings.providers = settings.providers.filter((p) => p.id !== id);
    if (!settings.providers.length) {
      settings.providers.push({
        id: `prov-${Date.now()}`,
        type: 'custom',
        name: 'Custom',
        baseUrl: '',
        apiKey: '',
        enabled: true,
        models: [],
        imageModels: [],
      });
    }
    save();
    if (isOpen) renderContent();
  }

  function addModelToProvider(id, modelName, kind) {
    const provider = getProvider(id);
    if (!provider || !modelName.trim()) return;
    const key = kind === 'image' ? 'imageModels' : 'models';
    const name = modelName.trim();
    if (!provider[key].includes(name)) {
      provider[key].push(name);
      save();
      if (isOpen) renderContent();
    }
  }

  function removeModelFromProvider(id, modelName, kind) {
    const provider = getProvider(id);
    if (!provider) return;
    const key = kind === 'image' ? 'imageModels' : 'models';
    provider[key] = provider[key].filter((m) => m !== modelName);
    save();
    if (isOpen) renderContent();
  }

  function maskApiKey(key) {
    if (!key) return '';
    if (key.length <= 8) return '••••••••';
    return key.slice(0, 3) + '••••••••' + key.slice(-4);
  }

  /* ---- Rendering ---- */

  function providerColor(type) {
    return PROVIDER_COLORS[type] || PROVIDER_COLORS.custom;
  }

  function renderProviderCard(provider) {
    const color = providerColor(provider.type);
    const initial = (provider.name || provider.type || '?')[0].toUpperCase();
    const enabledClass = provider.enabled ? 'enabled' : 'disabled';
    return `
      <article class="settings-provider-card ${enabledClass}" data-provider-id="${provider.id}">
        <div class="settings-provider-header">
          <div class="settings-provider-identity">
            <div class="settings-provider-avatar" style="background: linear-gradient(135deg, ${color}cc, ${color})">${initial}</div>
            <div class="settings-provider-info">
              <input
                class="settings-provider-name"
                type="text"
                value="${escapeHtml(provider.name)}"
                data-field="name"
                placeholder="Provider name"
                spellcheck="false"
              />
              <div class="settings-provider-meta">
                <span class="settings-provider-type-badge" style="--badge-color: ${color}">${escapeHtml(provider.type)}</span>
                <span class="settings-provider-status ${provider.enabled ? 'status-on' : 'status-off'}">
                  ${provider.enabled ? 'Active' : 'Disabled'}
                </span>
              </div>
            </div>
          </div>
          <div class="settings-provider-actions">
            <label class="settings-toggle" title="${provider.enabled ? 'Disable' : 'Enable'} provider">
              <input type="checkbox" class="settings-toggle-input" data-field="enabled" ${provider.enabled ? 'checked' : ''} />
              <span class="settings-toggle-track"></span>
            </label>
            <button class="settings-icon-btn settings-remove-btn" type="button" data-action="remove-provider" title="Remove provider">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="settings-provider-fields">
          <div class="settings-field">
            <label class="settings-label">Base URL</label>
            <input
              class="settings-input"
              type="url"
              value="${escapeHtml(provider.baseUrl)}"
              data-field="baseUrl"
              placeholder="https://api.example.com/v1"
              spellcheck="false"
            />
          </div>

          <div class="settings-field">
            <label class="settings-label">API Key</label>
            <div class="settings-api-key-row">
              <input
                class="settings-input settings-api-key-input"
                type="password"
                value="${escapeHtml(provider.apiKey)}"
                data-field="apiKey"
                placeholder="sk-..."
                autocomplete="off"
                spellcheck="false"
              />
              <button class="settings-icon-btn" type="button" data-action="toggle-key" title="Show/hide key">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2"/>
                  <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
                </svg>
              </button>
            </div>
            ${provider.apiKey ? `<span class="settings-key-hint">${escapeHtml(maskApiKey(provider.apiKey))}</span>` : ''}
          </div>

          <div class="settings-field-row">
            <div class="settings-field">
              <label class="settings-label">Chat models</label>
              <div class="settings-tags" data-kind="models">
                ${provider.models.map((m) => `
                  <span class="settings-tag">
                    ${escapeHtml(m)}
                    <button type="button" class="settings-tag-remove" data-action="remove-model" data-model="${escapeHtml(m)}" data-kind="models" title="Remove">&times;</button>
                  </span>
                `).join('')}
                ${provider.models.length === 0 ? '<span class="settings-empty-hint">None added</span>' : ''}
              </div>
              <div class="settings-add-row">
                <input class="settings-input settings-add-input" type="text" placeholder="model-name  ↵" data-kind="models" spellcheck="false" />
                <button class="settings-add-btn" type="button" data-action="add-model" data-kind="models">Add</button>
              </div>
            </div>

            <div class="settings-field">
              <label class="settings-label">
                Image models
                <span class="settings-label-note" title="Images are converted to text descriptions before being sent to the model">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                    <path d="M12 16v-4M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  </svg>
                </span>
              </label>
              <div class="settings-tags" data-kind="imageModels">
                ${provider.imageModels.map((m) => `
                  <span class="settings-tag settings-tag-image">
                    ${escapeHtml(m)}
                    <button type="button" class="settings-tag-remove" data-action="remove-model" data-model="${escapeHtml(m)}" data-kind="imageModels" title="Remove">&times;</button>
                  </span>
                `).join('')}
                ${provider.imageModels.length === 0 ? '<span class="settings-empty-hint">None added</span>' : ''}
              </div>
              <div class="settings-add-row">
                <input class="settings-input settings-add-input" type="text" placeholder="model-name  ↵" data-kind="imageModels" spellcheck="false" />
                <button class="settings-add-btn" type="button" data-action="add-model" data-kind="imageModels">Add</button>
              </div>
            </div>
          </div>
        </div>
      </article>
    `;
  }

  function renderProvidersContent() {
    const enabledCount = settings.providers.filter((p) => p.enabled).length;
    return `
      <div class="settings-section">
        <div class="settings-section-header">
          <h2>AI Providers</h2>
          <p>Connect your AI providers by adding API keys and configuring available models. Settings are stored locally on this device.</p>
          <div class="settings-section-stats">
            <span class="settings-stat">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              ${settings.providers.length} provider${settings.providers.length !== 1 ? 's' : ''}
            </span>
            <span class="settings-stat settings-stat-active">
              <span class="settings-stat-dot"></span>
              ${enabledCount} active
            </span>
          </div>
        </div>
        <div class="settings-providers-list" id="settingsProvidersList">
          ${settings.providers.map(renderProviderCard).join('')}
        </div>
        <div class="settings-add-provider-bar">
          <select class="settings-select" id="settingsProviderType">
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="google">Google</option>
            <option value="custom">Custom</option>
          </select>
          <button class="settings-primary-btn" type="button" id="settingsAddProviderBtn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            Add provider
          </button>
        </div>
      </div>
    `;
  }

  function renderComingSoon(label) {
    const icons = {
      appearance: `<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>`,
      shortcuts:  `<rect x="2" y="7" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2"/><path d="M16 2l-4 5-4-5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
    };
    const icon = icons[label] || `<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 16v-4M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`;
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
            <span class="settings-about-row-label">Storage</span>
            <span class="settings-about-row-value">Local — data never leaves your device</span>
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
      section: 'Configuration',
      items: [
        {
          id: 'providers',
          label: 'Providers',
          icon: `<path d="M5 12.55a11 11 0 0114.08 0M1.42 9a16 16 0 0121.16 0M8.53 16.11a6 6 0 016.95 0M12 20h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
        },
        {
          id: 'appearance',
          label: 'Appearance',
          soon: true,
          icon: `<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 8v4M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
        },
        {
          id: 'shortcuts',
          label: 'Shortcuts',
          soon: true,
          icon: `<rect x="2" y="7" width="20" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M8 12h.01M12 12h.01M16 12h.01M8 16h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
        },
      ],
    },
    {
      section: 'App',
      items: [
        {
          id: 'about',
          label: 'About',
          icon: `<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/><path d="M12 16v-4M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
        },
      ],
    },
  ];

  function renderNav() {
    return CATEGORIES.map((group) => `
      <div class="settings-nav-group">
        <div class="settings-nav-section-label">${group.section}</div>
        ${group.items.map((item) => `
          <button
            class="settings-nav-item${activeCategory === item.id ? ' active' : ''}"
            type="button"
            data-category="${item.id}"
          >
            <svg class="settings-nav-icon" width="14" height="14" viewBox="0 0 24 24" fill="none">${item.icon}</svg>
            <span>${item.label}</span>
            ${item.soon ? '<span class="settings-nav-soon">Soon</span>' : ''}
          </button>
        `).join('')}
      </div>
    `).join('');
  }

  function renderCategoryContent() {
    switch (activeCategory) {
      case 'providers':   return renderProvidersContent();
      case 'about':       return renderAboutContent();
      default:            return renderComingSoon(activeCategory);
    }
  }

  function renderContent() {
    if (!pageEl) return;

    const contentEl = pageEl.querySelector('.settings-page-content');
    if (!contentEl) return;

    contentEl.innerHTML = renderCategoryContent();
    bindContentEvents(contentEl);

    if (activeCategory === 'providers') {
      const list = contentEl.querySelector('.settings-providers-list');
      if (list) {
        Physics.stagger(list, '.settings-provider-card', {
          opacity: 0, y: 8, scale: 0.99,
        }, { preset: 'gentle', delay: 40 });
      }
    }

    // Update nav active state
    pageEl.querySelectorAll('.settings-nav-item').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.category === activeCategory);
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

    pageEl.querySelector('#settingsBackBtn').addEventListener('click', close);

    pageEl.querySelectorAll('.settings-nav-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        const category = btn.dataset.category;
        if (category === activeCategory) return;
        if (btn.querySelector('.settings-nav-soon')) {
          showToast('Coming soon');
          return;
        }
        activeCategory = category;
        renderContent();
      });
    });

    renderContent();
  }

  function bindContentEvents(container) {
    container.querySelectorAll('.settings-provider-card').forEach((card) => {
      const id = card.dataset.providerId;

      card.querySelectorAll('[data-field]').forEach((input) => {
        const field = input.dataset.field;
        const event = input.type === 'checkbox' ? 'change' : 'input';

        input.addEventListener(event, () => {
          const value = input.type === 'checkbox' ? input.checked : input.value;
          if (field === 'name' && !value.trim()) return;
          updateProvider(id, { [field]: value }, field === 'enabled');
        });

        if (field === 'apiKey') {
          input.addEventListener('blur', () => renderContent());
        }
      });

      card.querySelector('[data-action="remove-provider"]')?.addEventListener('click', () => {
        if (settings.providers.length <= 1) {
          showToast('Keep at least one provider');
          return;
        }
        removeProvider(id);
        showToast('Provider removed');
      });

      card.querySelector('[data-action="toggle-key"]')?.addEventListener('click', () => {
        const input = card.querySelector('.settings-api-key-input');
        input.type = input.type === 'password' ? 'text' : 'password';
      });

      card.querySelectorAll('[data-action="add-model"]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const kind = btn.dataset.kind;
          const input = card.querySelector(`.settings-add-input[data-kind="${kind}"]`);
          addModelToProvider(id, input.value, kind === 'imageModels' ? 'image' : 'text');
          input.value = '';
        });
      });

      card.querySelectorAll('.settings-add-input').forEach((input) => {
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const kind = input.dataset.kind;
            addModelToProvider(id, input.value, kind === 'imageModels' ? 'image' : 'text');
            input.value = '';
          }
        });
      });

      card.querySelectorAll('[data-action="remove-model"]').forEach((btn) => {
        btn.addEventListener('click', () => {
          removeModelFromProvider(id, btn.dataset.model, btn.dataset.kind === 'imageModels' ? 'image' : 'text');
        });
      });
    });

    container.querySelector('#settingsAddProviderBtn')?.addEventListener('click', () => {
      const type = container.querySelector('#settingsProviderType').value;
      addProvider(type);
      showToast('Provider added');
    });
  }

  function open() {
    if (isOpen) return;
    settings = loadSettingsFromStorage();
    pageEl = document.getElementById('settingsScreen');
    if (!pageEl) return;
    isOpen = true;
    render();
    showSettingsScreen();
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    hideSettingsScreen();
  }

  function getIsOpen() { return isOpen; }

  return {
    open,
    close,
    getIsOpen,
    getChatModels,
    getProviders,
  };
})();

function openSettings()  { SettingsStore.open(); }
function closeSettings() { SettingsStore.close(); }
