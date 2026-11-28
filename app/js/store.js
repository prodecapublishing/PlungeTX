/** localStorage with the existing ptx_* keys, plus JSON backup. */

export const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem('ptx_' + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem('ptx_' + key, JSON.stringify(value));
    } catch (e) { /* private mode or a full disk */ }
  },
  remove(key) {
    try { localStorage.removeItem('ptx_' + key); } catch (e) {}
  }
};

export function exportBackup() {
  return {
    app: 'PlungeTX',
    version: 1,
    exportedAt: new Date().toISOString(),
    history: store.get('history', []),
    badges: store.get('badges', {}),
    settings: store.get('settings', {})
  };
}

/** Accept a backup object, or a bare history array from a hand-edited file. */
export function normalizeBackup(data) {
  if (Array.isArray(data)) return { history: data, badges: null, settings: null };
  if (!data || typeof data !== 'object') throw new Error('That file is not a PlungeTX backup.');
  const history = data.history == null ? [] : data.history;
  if (!Array.isArray(history)) throw new Error('The backup has no session list.');
  const clean = [];
  history.forEach((entry, i) => {
    if (!entry || typeof entry !== 'object' || typeof entry.type !== 'string') return;
    const copy = Object.assign({}, entry);
    if (typeof copy.t !== 'number') copy.t = Date.now() - i;
    clean.push(copy);
  });
  clean.sort((a, b) => b.t - a.t);
  const badges = data.badges && typeof data.badges === 'object' && !Array.isArray(data.badges)
    ? data.badges : null;
  const settings = data.settings && typeof data.settings === 'object' ? data.settings : null;
  return { history: clean.slice(0, 2000), badges, settings };
}
