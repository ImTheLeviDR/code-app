/* ============================================================
   TASK SOUNDS - Web Audio notification tones
   ============================================================ */

'use strict';

const TaskSounds = (() => {
  const SOUNDS = [
    { id: 'chime', label: 'Chime', description: 'Light two-note ding' },
    { id: 'bell', label: 'Bell', description: 'Bright soft bell' },
    { id: 'pop', label: 'Pop', description: 'Quick bubbly blip' },
    { id: 'success', label: 'Success', description: 'Upward three-note arpeggio' },
    { id: 'soft', label: 'Soft', description: 'Quiet low tone' },
  ];

  const BASE_OUTPUT_GAIN = 3;

  let audioCtx = null;
  let masterGain = null;

  function getCtx() {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!audioCtx) audioCtx = new AudioCtx();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  }

  function getOutput(ctx) {
    if (!masterGain || masterGain.context !== ctx) {
      masterGain = ctx.createGain();
      masterGain.gain.value = BASE_OUTPUT_GAIN;
      masterGain.connect(ctx.destination);
    }
    return masterGain;
  }

  function clampVolume(volume) {
    const n = Number(volume);
    if (!Number.isFinite(n)) return 1;
    return Math.min(1, Math.max(0, n / 100));
  }

  function tone(ctx, {
    freq,
    start,
    duration = 0.2,
    type = 'sine',
    peak = 0.09,
    attack = 0.012,
    decay = 0.28,
    detune = 0,
    volume = 100,
  }) {
    const scaledPeak = peak * clampVolume(volume);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (detune) osc.detune.setValueAtTime(detune, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(scaledPeak, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + decay);
    osc.connect(gain);
    gain.connect(getOutput(ctx));
    osc.start(start);
    osc.stop(start + duration);
  }

  function playChime(ctx, now, volume = 100) {
    tone(ctx, { freq: 880, start: now, duration: 0.12, peak: 0.09, decay: 0.22, volume });
    tone(ctx, { freq: 1174.66, start: now + 0.09, duration: 0.24, peak: 0.085, decay: 0.34, volume });
  }

  function playBell(ctx, now, volume = 100) {
    tone(ctx, { freq: 1318.5, start: now, duration: 0.45, peak: 0.1, attack: 0.004, decay: 0.5, volume });
    tone(ctx, { freq: 2637, start: now, duration: 0.35, peak: 0.028, attack: 0.003, decay: 0.42, volume });
    tone(ctx, { freq: 659.25, start: now + 0.01, duration: 0.4, type: 'triangle', peak: 0.02, decay: 0.45, volume });
  }

  function playPop(ctx, now, volume = 100) {
    const scaledPeak = 0.11 * clampVolume(volume);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(1040, now + 0.045);
    osc.frequency.exponentialRampToValueAtTime(380, now + 0.1);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(scaledPeak, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.connect(gain);
    gain.connect(getOutput(ctx));
    osc.start(now);
    osc.stop(now + 0.14);
  }

  function playSuccess(ctx, now, volume = 100) {
    const notes = [1046.5, 1318.5, 1568];
    notes.forEach((freq, i) => {
      tone(ctx, {
        freq,
        start: now + i * 0.085,
        duration: 0.18,
        peak: 0.08 - i * 0.008,
        decay: 0.22 + i * 0.04,
        volume,
      });
    });
  }

  function playSoft(ctx, now, volume = 100) {
    tone(ctx, {
      freq: 440,
      start: now,
      duration: 0.55,
      peak: 0.055,
      attack: 0.03,
      decay: 0.58,
      volume,
    });
    tone(ctx, {
      freq: 880,
      start: now + 0.02,
      duration: 0.4,
      peak: 0.018,
      attack: 0.04,
      decay: 0.5,
      volume,
    });
  }

  const PLAYERS = {
    chime: playChime,
    bell: playBell,
    pop: playPop,
    success: playSuccess,
    soft: playSoft,
  };

  function play(soundId = 'chime', volume = 100) {
    try {
      const ctx = getCtx();
      if (!ctx) return;
      const player = PLAYERS[soundId] || PLAYERS.chime;
      player(ctx, ctx.currentTime, volume);
    } catch {
      /* audio unavailable */
    }
  }

  function list() {
    return SOUNDS.slice();
  }

  function isValid(soundId) {
    return SOUNDS.some((s) => s.id === soundId);
  }

  return { play, list, isValid };
})();
