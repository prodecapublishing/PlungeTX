/** Queues recorded clips so a line made of several ids plays as one thought. */

import { CLIP_IDS } from './clip-ids.js';

const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=';

export function createVoice({ voiceId, onDuck }) {
  const el = new Audio();
  el.preload = 'auto';
  el.playsInline = true;
  const unlockEl = new Audio(SILENT);
  unlockEl.preload = 'auto';

  let queue = [];
  let current = null;
  let token = 0;
  let unlocked = false;
  const missing = new Set();

  function noteMissing(id) {
    if (missing.has(id)) return;
    missing.add(id);
    console.warn('PlungeTX has no recording for “' + id + '”.');
  }

  function clipUrl(id) {
    const voice = voiceId() === 'harper_32' ? 'harper_32' : 'george';
    return new URL(`audio/${voice}/${id}.mp3`, document.baseURI).href;
  }

  function say(ids, opts = {}) {
    const list = (Array.isArray(ids) ? ids : [ids]).filter(Boolean);
    const playable = [];
    list.forEach((id) => {
      if (CLIP_IDS.has(id)) playable.push(id);
      else noteMissing(id);
    });
    if (opts.interrupt) cancel(false);
    if (!playable.length) {
      if (!current && !queue.length) onDuck(false);
      return;
    }
    queue.push(...playable);
    onDuck(true);
    pump();
  }

  function pump() {
    if (current) return;
    const id = queue.shift();
    if (!id) { onDuck(false); return; }
    current = id;
    const my = ++token;
    const advance = () => {
      if (my !== token) return;
      current = null;
      pump();
    };
    el.onended = advance;
    el.onerror = advance;
    el.src = clipUrl(id);
    const pending = el.play();
    if (pending && pending.catch) pending.catch(() => advance());
  }

  function cancel(unduck = true) {
    token++;
    queue = [];
    current = null;
    el.onended = null;
    el.onerror = null;
    el.pause();
    el.removeAttribute('src');
    try { el.load(); } catch (e) {}
    if (unduck) onDuck(false);
  }

  function unlock() {
    if (unlocked) return;
    unlocked = true;
    const pending = unlockEl.play();
    if (pending && pending.then) pending.then(() => unlockEl.pause()).catch(() => {});
  }

  function nudge() {
    if (current && el.paused && !el.ended) el.play().catch(() => {});
    else if (!current && queue.length) pump();
  }

  return {
    say,
    cancel,
    unlock,
    nudge,
    missing: () => [...missing],
    has: (id) => CLIP_IDS.has(id)
  };
}

export { CLIP_IDS };
