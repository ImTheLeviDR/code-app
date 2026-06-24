/* ============================================================
   Physics - damped-spring motion (F = -kx - cv)
   ============================================================ */

'use strict';

const Physics = (() => {
  const PRESETS = {
    default: { stiffness: 380, damping: 32, mass: 1 },
    gentle: { stiffness: 240, damping: 30, mass: 1 },
    snappy: { stiffness: 520, damping: 38, mass: 0.85 },
    bouncy: { stiffness: 420, damping: 14, mass: 1 },
    stiff: { stiffness: 680, damping: 44, mass: 1 },
    soft: { stiffness: 200, damping: 26, mass: 1.05 },
  };

  const active = new Map();

  function animId(el) {
    if (!el._physicsId) el._physicsId = `p-${Math.random().toString(36).slice(2, 9)}`;
    return el._physicsId;
  }

  function cancel(el) {
    const fn = active.get(animId(el));
    if (fn) {
      fn();
      active.delete(animId(el));
    }
  }

  function step(state, target, cfg, dt) {
    const force = -cfg.stiffness * (state.value - target) - cfg.damping * state.velocity;
    state.velocity += (force / cfg.mass) * dt;
    state.value += state.velocity * dt;
  }

  function isSettled(state, target) {
    return Math.abs(state.value - target) < 0.0005 && Math.abs(state.velocity) < 0.005;
  }

  function cfg(options) {
    const base = PRESETS[options.preset] || PRESETS.default;
    return { ...base, ...options };
  }

  function read(el, key) {
    const s = el._springState;
    if (s && s[key] !== undefined) return s[key];
    switch (key) {
      case 'opacity':
        return parseFloat(getComputedStyle(el).opacity) || 0;
      case 'height':
        return el.offsetHeight;
      case 'width':
        return el.offsetWidth;
      case 'scale':
      case 'scaleX':
      case 'scaleY':
        return 1;
      case 'rotate':
      case 'x':
      case 'y':
        return 0;
      case 'left':
      case 'top':
        return parseFloat(el.style[key]) || 0;
      default:
        return 0;
    }
  }

  function writeState(el, states) {
    const s = el._springState || {};
    for (const k of Object.keys(states)) s[k] = states[k].value;
    el._springState = s;
  }

  function apply(el, states, options = {}) {
    const parts = [];
    if (states.x !== undefined) {
      if (options.anchorX === 'center') {
        parts.push(`translateX(calc(-50% + ${states.x.value}px))`);
      } else {
        parts.push(`translateX(${states.x.value}px)`);
      }
    } else if (options.anchorX === 'center') {
      parts.push('translateX(-50%)');
    }
    if (states.y) parts.push(`translateY(${states.y.value}px)`);
    if (states.scale) parts.push(`scale(${states.scale.value})`);
    if (states.scaleX) parts.push(`scaleX(${states.scaleX.value})`);
    if (states.scaleY) parts.push(`scaleY(${states.scaleY.value})`);
    if (states.rotate) parts.push(`rotate(${states.rotate.value}deg)`);
    if (parts.length) el.style.transform = parts.join(' ');
    if (states.left) el.style.left = `${states.left.value}px`;
    if (states.top) el.style.top = `${states.top.value}px`;
    if (states.opacity) el.style.opacity = String(states.opacity.value);
    if (states.height) el.style.height = `${Math.max(0, states.height.value)}px`;
    if (states.width) el.style.width = `${Math.max(0, states.width.value)}px`;
    writeState(el, states);
  }

  function animate(el, props, options = {}) {
    if (!el) return { cancel: () => {} };
    cancel(el);

    const config = cfg(options);
    const from = options.from || {};
    const states = {};
    const targets = {};

    for (const [key, target] of Object.entries(props)) {
      const start = from[key] !== undefined ? from[key] : read(el, key);
      states[key] = { value: start, velocity: options.velocity?.[key] ?? 0 };
      targets[key] = target;
    }

    el.classList.add('spring-driven');
    let raf;
    let last = performance.now();
    let dead = false;

    function cleanup() {
      dead = true;
      active.delete(animId(el));
      if (raf) cancelAnimationFrame(raf);
    }

    function tick(now) {
      if (dead) return;
      const dt = Math.min((now - last) / 1000, 0.064);
      last = now;
      let done = true;

      for (const k of Object.keys(states)) {
        step(states[k], targets[k], config, dt);
        if (!isSettled(states[k], targets[k])) done = false;
      }

      apply(el, states, options);

      if (done) {
        for (const k of Object.keys(states)) states[k].value = targets[k];
        apply(el, states, options);
        cleanup();
        options.onComplete?.();
        return;
      }
      raf = requestAnimationFrame(tick);
    }

    apply(el, states, options);
    active.set(animId(el), cleanup);
    raf = requestAnimationFrame(tick);
    return { cancel: cleanup };
  }

  function animateScroll(el, targetY, options = {}) {
    if (!el) return { cancel: () => {} };
    const key = `scroll-${animId(el)}`;
    const prev = active.get(key);
    if (prev) prev();

    const config = cfg(options);
    const state = { value: el.scrollTop, velocity: 0 };
    let raf;
    let last = performance.now();
    let dead = false;

    function cleanup() {
      dead = true;
      active.delete(key);
      if (raf) cancelAnimationFrame(raf);
    }

    function tick(now) {
      if (dead) return;
      const dt = Math.min((now - last) / 1000, 0.064);
      last = now;
      step(state, targetY, config, dt);
      el.scrollTop = state.value;

      if (isSettled(state, targetY)) {
        el.scrollTop = targetY;
        cleanup();
        options.onComplete?.();
        return;
      }
      raf = requestAnimationFrame(tick);
    }

    active.set(key, cleanup);
    raf = requestAnimationFrame(tick);
    return { cancel: cleanup };
  }

  function stagger(parent, selector, fromProps, options = {}) {
    const items = parent ? Array.from(parent.querySelectorAll(selector)) : [];
    items.forEach((el, i) => {
      setTimeout(() => {
        animate(el, { opacity: 1, y: 0, scale: 1 }, {
          from: fromProps,
          preset: options.preset || 'gentle',
        });
      }, i * (options.delay || 45));
    });
  }

  function modalIn(overlay, panel) {
    animate(overlay, { opacity: 1 }, { from: { opacity: 0 }, preset: 'soft' });
    animate(panel, { opacity: 1, y: 0, scale: 1 }, {
      from: { opacity: 0, y: -18, scale: 0.96 },
      preset: 'snappy',
    });
  }

  function modalOut(overlay, panel, onComplete) {
    animate(panel, { opacity: 0, y: -12, scale: 0.97 }, { preset: 'stiff' });
    animate(overlay, { opacity: 0 }, {
      preset: 'stiff',
      onComplete,
    });
  }

  function diffModalIn(overlay, panel, content) {
    animate(overlay, { opacity: 1 }, { from: { opacity: 0 }, preset: 'soft' });
    animate(panel, { opacity: 1, y: 0, scale: 1 }, {
      from: { opacity: 0, y: 22, scale: 0.94 },
      preset: 'snappy',
    });

    if (!content) return;

    animate(content, { opacity: 1, y: 0 }, {
      from: { opacity: 0, y: 14 },
      preset: 'gentle',
    });

    const hunks = content.querySelectorAll('.diff-hunk');
    if (!hunks.length) return;

    hunks.forEach((hunk, i) => {
      setTimeout(() => {
        animate(hunk, { opacity: 1, y: 0, scale: 1 }, {
          from: { opacity: 0, y: 10, scale: 0.98 },
          preset: 'gentle',
        });
      }, 90 + i * 45);
    });
  }

  function diffModalOut(overlay, panel, content, onComplete) {
    if (content) {
      animate(content, { opacity: 0, y: 8, scale: 0.98 }, { preset: 'stiff' });
    }
    animate(panel, { opacity: 0, y: 14, scale: 0.96 }, { preset: 'stiff' });
    animate(overlay, { opacity: 0 }, {
      preset: 'stiff',
      onComplete,
    });
  }

  function messageIn(el, options = {}) {
    if (options.soft) {
      animate(el, { opacity: 1 }, { from: { opacity: 0 }, preset: 'gentle' });
      return;
    }
    animate(el, { opacity: 1, y: 0, scale: 1 }, {
      from: { opacity: 0, y: 22, scale: 0.97 },
      preset: 'bouncy',
    });
  }

  function lineIn(el) {
    resetMotion(el);
    animate(el, { opacity: 1 }, { from: { opacity: 0 }, preset: 'gentle' });
  }

  function lineOut(el, onComplete) {
    animate(el, { opacity: 0 }, {
      preset: 'stiff',
      onComplete: () => {
        resetMotion(el);
        onComplete?.();
      },
    });
  }

  function readToolPanelWidth(mode = 'detail') {
    const varName = mode === 'diff' ? '--tool-panel-diff-width' : '--tool-panel-width';
    const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
    return parseFloat(raw) || 440;
  }

  function toolPanelStaggerTargets(shell) {
    if (!shell) return [];
    const sequence = [];
    const header = shell.querySelector('.diff-header');
    if (header) sequence.push(header);
    shell.querySelectorAll('.tool-detail-section').forEach((section) => sequence.push(section));
    const diffBody = shell.querySelector('.diff-body:not(.tool-detail-body)');
    if (diffBody) sequence.push(diffBody);
    const footer = shell.querySelector('.diff-footer');
    if (footer) sequence.push(footer);
    shell.querySelectorAll('.diff-hunk').forEach((hunk) => sequence.push(hunk));
    return sequence;
  }

  function prepareToolPanelStagger(shell) {
    toolPanelStaggerTargets(shell).forEach((el) => {
      cancel(el);
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
    });
  }

  function toolPanelStaggerIn(shell) {
    const sequence = toolPanelStaggerTargets(shell).filter((el) =>
      !el.classList.contains('diff-hunk'),
    );
    const hunks = shell?.querySelectorAll('.diff-hunk') || [];

    sequence.forEach((el, i) => {
      cancel(el);
      setTimeout(() => {
        animate(el, { opacity: 1, y: 0 }, { from: { opacity: 0, y: 10 }, preset: 'gentle' });
      }, i * 45);
    });

    hunks.forEach((hunk, i) => {
      cancel(hunk);
      setTimeout(() => {
        animate(hunk, { opacity: 1, y: 0 }, { from: { opacity: 0, y: 8 }, preset: 'gentle' });
      }, 80 + i * 40);
    });
  }

  function toolPanelOpen(panel, inner, mode, onComplete) {
    if (!panel) {
      onComplete?.();
      return;
    }

    const target = readToolPanelWidth(mode);
    cancel(panel);
    panel.style.overflow = 'hidden';
    panel.style.width = '0px';

    animate(panel, { width: target }, {
      from: { width: 0 },
      preset: 'snappy',
      onComplete: () => {
        panel.style.width = `${target}px`;
        panel.style.overflow = '';
        resetMotion(panel);
        onComplete?.();
      },
    });
  }

  function toolPanelResize(panel, mode, onComplete) {
    if (!panel) {
      onComplete?.();
      return;
    }

    const target = readToolPanelWidth(mode);
    const start = panel.offsetWidth;
    if (Math.abs(start - target) < 2) {
      onComplete?.();
      return;
    }

    cancel(panel);
    panel.style.overflow = 'hidden';
    panel.style.width = `${start}px`;
    animate(panel, { width: target }, {
      preset: 'snappy',
      onComplete: () => {
        panel.style.width = '';
        panel.style.overflow = '';
        resetMotion(panel);
        onComplete?.();
      },
    });
  }

  function toolPanelSwap(inner, onSwap, onComplete) {
    if (!inner) {
      onSwap?.();
      onComplete?.();
      return;
    }

    cancel(inner);
    animate(inner, { opacity: 0, x: 8 }, {
      preset: 'stiff',
      onComplete: () => {
        onSwap?.();
        inner.style.opacity = '0';
        inner.style.transform = 'translateX(10px)';
        resetMotion(inner);
        animate(inner, { opacity: 1, x: 0 }, {
          from: { opacity: 0, x: 10 },
          preset: 'snappy',
          onComplete,
        });
      },
    });
  }

  function toolPanelClose(panel, inner, onComplete) {
    if (!panel) {
      onComplete?.();
      return;
    }

    cancel(panel);
    cancel(inner);

    const shell = inner?.querySelector('.tool-panel-shell');
    shell?.querySelectorAll('.diff-header, .tool-detail-section, .diff-body, .diff-footer, .diff-hunk')
      .forEach((el) => animate(el, { opacity: 0, y: 6 }, { preset: 'stiff' }));

    if (inner) {
      animate(inner, { opacity: 0, x: 14 }, { preset: 'stiff' });
    }

    const start = panel.offsetWidth || readToolPanelWidth('detail');
    panel.style.overflow = 'hidden';
    panel.style.width = `${start}px`;

    setTimeout(() => {
      animate(panel, { width: 0 }, {
        preset: 'stiff',
        onComplete: () => {
          panel.style.width = '0px';
          panel.style.overflow = 'hidden';
          resetMotion(panel);
          if (inner) resetMotion(inner);
          shell?.querySelectorAll('.diff-header, .tool-detail-section, .diff-body, .diff-footer, .diff-hunk')
            .forEach((el) => resetMotion(el));
          onComplete?.();
        },
      });
    }, 90);
  }

  function sidebarWidth() {
    const w = getComputedStyle(document.documentElement).getPropertyValue('--sidebar-width').trim();
    return parseFloat(w) || 240;
  }

  function sidebarToggle(el, open, onComplete) {
    if (!el) return;
    el.style.overflow = 'hidden';

    if (open) {
      const target = sidebarWidth();
      cancel(el);
      el.style.width = '0px';
      el.style.opacity = '0';
      animate(el, { width: target, opacity: 1 }, {
        from: { width: 0, opacity: 0 },
        preset: 'snappy',
        onComplete: () => {
          el.style.width = '';
          el.style.opacity = '';
          el.style.overflow = '';
          resetMotion(el);
          onComplete?.();
        },
      });
    } else {
      const start = el.offsetWidth || sidebarWidth();
      el.style.width = `${start}px`;
      animate(el, { width: 0, opacity: 0 }, {
        preset: 'stiff',
        onComplete: () => {
          el.style.overflow = '';
          resetMotion(el);
          onComplete?.();
        },
      });
    }
  }

  function expandVertical(el, open, onComplete) {
    if (!el) return;
    el.style.overflow = 'hidden';

    if (open) {
      el.style.display = '';
      const target = el.scrollHeight;
      animate(el, { height: target, opacity: 1 }, {
        from: { height: 0, opacity: 0 },
        preset: 'snappy',
        onComplete: () => {
          el.style.height = 'auto';
          el.style.overflow = '';
          onComplete?.();
        },
      });
    } else {
      const start = el.offsetHeight;
      el.style.height = `${start}px`;
      animate(el, { height: 0, opacity: 0 }, {
        preset: 'stiff',
        onComplete: () => {
          el.style.overflow = '';
          onComplete?.();
        },
      });
    }
  }

  function resetMotion(el) {
    if (!el) return;
    cancel(el);
    el.style.transform = '';
    el.style.opacity = '';
    el.style.height = '';
    delete el._springState;
    el.classList.remove('spring-driven');
  }

  function crossfade(showEl, hideEl, display = 'flex') {
    if (hideEl) {
      animate(hideEl, { opacity: 0 }, {
        preset: 'gentle',
        onComplete: () => {
          hideEl.style.display = 'none';
          resetMotion(hideEl);
        },
      });
    }
    showEl.style.display = display;
    resetMotion(showEl);
    animate(showEl, { opacity: 1 }, {
      from: { opacity: 0 },
      preset: 'gentle',
      onComplete: () => resetMotion(showEl),
    });
  }

  function switchScreens(showEl, hideEl, display = 'flex') {
    resetMotion(hideEl);
    resetMotion(showEl);
    if (hideEl) hideEl.style.display = 'none';
    showEl.style.display = display;

    [showEl, hideEl].forEach((screen) => {
      if (!screen) return;
      screen.querySelectorAll('.input-box, .welcome-input-area, .chat-input-area, .message-input').forEach(resetMotion);
    });
  }

  function pulse(el, options = {}) {
    animate(el, { scale: options.down ?? 0.9 }, { preset: 'stiff' });
    setTimeout(() => {
      animate(el, { scale: 1 }, { preset: options.preset || 'bouncy' });
    }, 60);
  }

  function press(el, down = 0.94) {
    animate(el, { scale: down }, { preset: 'stiff' });
  }

  function release(el) {
    animate(el, { scale: 1 }, { preset: 'bouncy' });
  }

  function rotate(el, degrees) {
    animate(el, { rotate: degrees }, { preset: 'snappy' });
  }

  function show(el, display = 'flex') {
    el.style.display = display;
    animate(el, { opacity: 1, scale: 1, y: 0 }, {
      from: { opacity: 0, scale: 0.85, y: 8 },
      preset: 'bouncy',
      anchorX: 'center',
    });
  }

  function hide(el, onComplete) {
    animate(el, { opacity: 0, scale: 0.9, y: 6 }, {
      preset: 'stiff',
      anchorX: 'center',
      onComplete: () => {
        el.style.display = 'none';
        onComplete?.();
      },
    });
  }

  function thinkingDots(container) {
    const dots = container.querySelectorAll('.thinking-dot');
    dots.forEach((dot, i) => {
      const loop = () => {
        if (!dot.isConnected) return;
        animate(dot, { y: -6, scale: 1.2 }, {
          preset: 'bouncy',
          onComplete: () => {
            if (!dot.isConnected) return;
            animate(dot, { y: 0, scale: 1 }, {
              preset: 'soft',
              onComplete: () => setTimeout(loop, 200 + i * 80),
            });
          },
        });
      };
      setTimeout(loop, i * 160);
    });
  }

  function bindPressTargets(root = document) {
    const selector = [
      'button',
      '.nav-item',
      '.chat-item',
      '.project-header',
      '.show-more-btn',
      '.search-result-item',
      '.model-option',
      '.settings-primary-btn',
      '.settings-add-btn',
      '.settings-icon-btn',
      '.prov-panel-action',
      '.prov-text-btn',
    ].join(',');

    root.querySelectorAll(selector).forEach((el) => {
      if (el.dataset.springPress) return;
      if (el.classList.contains('send-btn')) return;
      el.dataset.springPress = '1';

      el.addEventListener('pointerdown', (e) => {
        if (el.disabled) return;
        press(el);
      });
      el.addEventListener('pointerup', () => release(el));
      el.addEventListener('pointerleave', () => {
        if (el._springState?.scale !== 1) release(el);
      });
      el.addEventListener('pointercancel', () => release(el));
    });
  }

  function bindToggleTargets(root = document) {
    root.querySelectorAll('.settings-toggle').forEach((el) => {
      if (el.dataset.springToggle) return;
      el.dataset.springToggle = '1';
      const track = el.querySelector('.settings-toggle-track');
      if (!track) return;

      el.addEventListener('pointerenter', () => {
        animate(track, { scale: 1.07 }, { preset: 'snappy' });
      });
      el.addEventListener('pointerleave', () => {
        animate(track, { scale: 1 }, { preset: 'soft' });
      });
      el.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        press(track, 0.93);
      });
      el.addEventListener('pointerup', () => release(track));
      el.addEventListener('pointercancel', () => release(track));
    });
  }

  function init() {
    document.body.classList.add('physics-motion');
    bindPressTargets();
    bindToggleTargets();

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType === 1) {
            bindPressTargets(node);
            bindToggleTargets(node);
            if (node.matches?.('button, .nav-item, .chat-item')) bindPressTargets(node.parentElement || node);
            if (node.matches?.('.settings-toggle')) bindToggleTargets(node.parentElement || node);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  return {
    PRESETS,
    cancel,
    animate,
    animateScroll,
    stagger,
    modalIn,
    modalOut,
    diffModalIn,
    diffModalOut,
    toolPanelOpen,
    toolPanelClose,
    toolPanelSwap,
    toolPanelResize,
    toolPanelStaggerIn,
    prepareToolPanelStagger,
    messageIn,
    lineIn,
    lineOut,
    expandVertical,
    sidebarToggle,
    crossfade,
    pulse,
    press,
    release,
    rotate,
    show,
    hide,
    thinkingDots,
    bindPressTargets,
    bindToggleTargets,
    init,
    switchScreens,
    resetMotion,
  };
})();
