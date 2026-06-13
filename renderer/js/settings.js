/* ============================================================
   SETTINGS — Providers, API keys, models, image models
   ============================================================ */

'use strict';

const SETTINGS_STORAGE_KEY = 'code-app-settings';

const SettingsStore = (() => {
  let settings = loadSettingsFromStorage();
  let overlayEl = null;
  let isOpen = false;

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

  function getProviders() {
    return settings.providers;
  }

  function getProvider(id) {
    return settings.providers.find((p) => p.id === id);
  }

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
    if (rerender && isOpen) render();
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
    if (isOpen) render();
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
    if (isOpen) render();
  }

  function addModelToProvider(id, modelName, kind) {
    const provider = getProvider(id);
    if (!provider || !modelName.trim()) return;
    const key = kind === 'image' ? 'imageModels' : 'models';
    const name = modelName.trim();
    if (!provider[key].includes(name)) {
      provider[key].push(name);
      save();
      if (isOpen) render();
    }
  }

  function removeModelFromProvider(id, modelName, kind) {
    const provider = getProvider(id);
    if (!provider) return;
    const key = kind === 'image' ? 'imageModels' : 'models';
    provider[key] = provider[key].filter((m) => m !== modelName);
    save();
    if (isOpen) render();
  }

  function maskApiKey(key) {
    if (!key) return '';
    if (key.length <= 8) return '••••••••';
    return key.slice(0, 3) + '••••••••' + key.slice(-4);
  }

  function renderProviderCard(provider) {
    const enabledClass = provider.enabled ? 'enabled' : 'disabled';
    return `
      <article class="settings-provider-card ${enabledClass}" data-provider-id="${provider.id}">
        <div class="settings-provider-header">
          <div class="settings-provider-title">
            <label class="settings-toggle" title="${provider.enabled ? 'Disable' : 'Enable'} provider">
              <input type="checkbox" class="settings-toggle-input" data-field="enabled" ${provider.enabled ? 'checked' : ''} />
              <span class="settings-toggle-track"></span>
            </label>
            <div>
              <input
                class="settings-provider-name"
                type="text"
                value="${escapeHtml(provider.name)}"
                data-field="name"
                placeholder="Provider name"
              />
              <span class="settings-provider-type">${escapeHtml(provider.type)}</span>
            </div>
          </div>
          <button class="settings-icon-btn settings-remove-btn" type="button" data-action="remove-provider" title="Remove provider">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <div class="settings-field">
          <label class="settings-label">Base URL</label>
          <input
            class="settings-input"
            type="url"
            value="${escapeHtml(provider.baseUrl)}"
            data-field="baseUrl"
            placeholder="https://api.example.com/v1"
          />
        </div>

        <div class="settings-field">
          <label class="settings-label">API key</label>
          <div class="settings-api-key-row">
            <input
              class="settings-input settings-api-key-input"
              type="password"
              value="${escapeHtml(provider.apiKey)}"
              data-field="apiKey"
              placeholder="sk-..."
              autocomplete="off"
            />
            <button class="settings-icon-btn" type="button" data-action="toggle-key" title="Show/hide key">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" stroke-width="2"/>
                <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
              </svg>
            </button>
          </div>
          ${provider.apiKey ? `<span class="settings-key-hint">Saved as ${escapeHtml(maskApiKey(provider.apiKey))}</span>` : ''}
        </div>

        <div class="settings-field">
          <label class="settings-label">Models</label>
          <div class="settings-tags" data-kind="models">
            ${provider.models.map((m) => `
              <span class="settings-tag">
                ${escapeHtml(m)}
                <button type="button" class="settings-tag-remove" data-action="remove-model" data-model="${escapeHtml(m)}" data-kind="models">&times;</button>
              </span>
            `).join('')}
            ${provider.models.length === 0 ? '<span class="settings-empty-hint">No models yet</span>' : ''}
          </div>
          <div class="settings-add-row">
            <input class="settings-input settings-add-input" type="text" placeholder="Add model..." data-kind="models" />
            <button class="settings-add-btn" type="button" data-action="add-model" data-kind="models">Add</button>
          </div>
        </div>

        <div class="settings-field">
          <label class="settings-label">Image models</label>
          <p class="settings-note">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
              <path d="M12 16v-4M12 8h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            Images are converted to text descriptions in the background before being sent to the model.
          </p>
          <div class="settings-tags" data-kind="imageModels">
            ${provider.imageModels.map((m) => `
              <span class="settings-tag settings-tag-image">
                ${escapeHtml(m)}
                <button type="button" class="settings-tag-remove" data-action="remove-model" data-model="${escapeHtml(m)}" data-kind="imageModels">&times;</button>
              </span>
            `).join('')}
            ${provider.imageModels.length === 0 ? '<span class="settings-empty-hint">No image models</span>' : ''}
          </div>
          <div class="settings-add-row">
            <input class="settings-input settings-add-input" type="text" placeholder="Add image model..." data-kind="imageModels" />
            <button class="settings-add-btn" type="button" data-action="add-model" data-kind="imageModels">Add</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderAddProviderForm() {
    return `
      <div class="settings-add-provider">
        <select class="settings-select" id="settingsProviderType">
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="google">Google</option>
          <option value="custom">Custom</option>
        </select>
        <button class="settings-primary-btn" type="button" id="settingsAddProviderBtn">Add provider</button>
      </div>
    `;
  }

  function render() {
    if (!overlayEl) return;
    const body = overlayEl.querySelector('.settings-body');
    if (!body) return;

    body.innerHTML = `
      <div class="settings-intro">
        <p>Manage AI providers, API keys, chat models, and image models. Settings are saved locally on this device.</p>
      </div>
      <div class="settings-providers-list">
        ${settings.providers.map(renderProviderCard).join('')}
      </div>
      ${renderAddProviderForm()}
    `;

    bindProviderEvents(body);
    Physics.stagger(body.querySelector('.settings-providers-list'), '.settings-provider-card', {
      opacity: 0,
      y: 10,
      scale: 0.98,
    }, { preset: 'gentle', delay: 35 });
  }

  function bindProviderEvents(container) {
    container.querySelectorAll('.settings-provider-card').forEach((card) => {
      const id = card.dataset.providerId;

      card.querySelectorAll('[data-field]').forEach((input) => {
        const field = input.dataset.field;
        const event = input.type === 'checkbox' ? 'change' : 'input';

        input.addEventListener(event, () => {
          let value = input.type === 'checkbox' ? input.checked : input.value;
          if (field === 'name' && !value.trim()) return;
          updateProvider(id, { [field]: value }, field === 'enabled');
        });

        if (field === 'apiKey') {
          input.addEventListener('blur', () => render());
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

    overlayEl = document.createElement('div');
    overlayEl.className = 'settings-overlay';
    overlayEl.id = 'settingsOverlay';
    overlayEl.innerHTML = `
      <div class="settings-modal">
        <div class="settings-header">
          <div class="settings-header-left">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="2"/>
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" stroke-width="2"/>
            </svg>
            <h2>Settings</h2>
          </div>
          <button class="settings-close-btn" type="button" id="settingsCloseBtn" title="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
        <div class="settings-body"></div>
      </div>
    `;

    overlayEl.addEventListener('click', (e) => {
      if (e.target === overlayEl) close();
    });

    document.body.appendChild(overlayEl);
    overlayEl.querySelector('#settingsCloseBtn').addEventListener('click', close);

    const panel = overlayEl.querySelector('.settings-modal');
    Physics.modalIn(overlayEl, panel);

    isOpen = true;
    render();
  }

  function close() {
    if (!overlayEl) return;
    const panel = overlayEl.querySelector('.settings-modal');
    isOpen = false;
    Physics.modalOut(overlayEl, panel, () => {
      overlayEl?.remove();
      overlayEl = null;
    });
  }

  function getIsOpen() {
    return isOpen;
  }

  return {
    open,
    close,
    getIsOpen,
    getChatModels,
    getProviders,
  };
})();

function openSettings() {
  SettingsStore.open();
}

function closeSettings() {
  SettingsStore.close();
}
