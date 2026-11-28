import { store, exportBackup, normalizeBackup } from './store.js';
import { createAudio } from './audio.js';
import { createVoice, CLIP_IDS } from './voice.js';
import {
  C, CALM, HARD_COLD, SCAN, HARD_HEAT, SAVAGE_COLD, SAVAGE_HEAT,
  breathIntro, letGoRound, holdCue, minutesIn, roundOf, awardClips, coachLine
} from './cues.js';

const $ = (id) => document.getElementById(id);

const DEF = {
  b: { pace: 'standard', rounds: 3, breaths: 30, voice: true, whoosh: true, music: true, trackA: 'tidal', trackB: 'still' },
  i: { preset: 'intermediate', custom: 3, prep: 2, voice: true, tempOn: true, tempF: 50, music: true, track: 'drift' },
  s: { preset: 'classic', custom: 15, voice: true, tempF: 175, music: true, track: 'firstlight' },
  c: { rounds: 3, hot: 12, cold: 2, trans: 1, order: 'hc', hotF: 175, coldF: 50, voice: true, music: true, trackHot: 'cedar', trackCold: 'drift' },
  g: { voice: 'harper_32', musicVol: 0.7, coach: 'calm' }
};

const saved = store.get('settings', {});
const S = {};
for (const key of Object.keys(DEF)) S[key] = Object.assign({}, DEF[key], saved[key] || {});
if (!['harper_32', 'george', 'john-rhys-davies'].includes(S.g.voice)) S.g.voice = 'harper_32';
if (S.s.track === 'cedar') S.s.track = 'firstlight';
if (!['off', 'firstlight', 'hearth', 'stillness'].includes(S.s.track)) S.s.track = 'firstlight';

const PACE = { slow: 4.6, standard: 3.4, fast: 2.4 };
const PRESETS = { beginner: 60, intermediate: 120, advanced: 240 };
const SAUNA_PRESETS = { short: 600, classic: 900, deep: 1200 };
const hard = () => S.g.coach === 'hard' || S.g.coach === 'savage';
const VOICE_IDS = ['harper_32', 'george', 'john-rhys-davies'];
const fmt = (sec) => {
  sec = Math.max(0, Math.round(sec));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
};
const fToC = (f) => Math.round((f - 32) * 5 / 9);
const humanDur = (sec) => {
  sec = Math.round(sec);
  const m = Math.floor(sec / 60);
  const r = sec % 60;
  return m ? `${m} min${r ? ` ${r} sec` : ''}` : `${r} sec`;
};
const totalWords = (sec) => {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  if (h <= 0) return `${m} min`;
  if (!m) return `${h} hour${h === 1 ? '' : 's'}`;
  return `${h} h ${m} m`;
};

const audio = createAudio({ musicVol: () => S.g.musicVol });
const voice = createVoice({
  voiceId: () => S.g.voice,
  onDuck: (on) => audio.duck(on)
});

let voiceOn = true;
function speak(ids, interrupt) {
  if (!voiceOn) return;
  voice.say(ids, { interrupt: !!interrupt });
}

/* ---------- navigation ---------- */
const NAV = { home: 'navHome', results: 'navResults', settings: 'navSettings' };
const theme = document.querySelector('meta[name="theme-color"]');

function show(id) {
  document.querySelectorAll('.view').forEach((view) => { view.hidden = view.id !== 'v-' + id; });
  document.body.dataset.view = id;
  $('nav').hidden = !(id in NAV);
  Object.entries(NAV).forEach(([key, nid]) => {
    $(nid).setAttribute('aria-current', key === id ? 'page' : 'false');
  });
  if (theme) theme.content = (id === 'breath' || id === 'bath') ? '#06161f' : '#f4fafb';
  window.scrollTo(0, 0);
  audio.stopPreview();
  clearPreviewBtn();
  if (id === 'home') renderHome();
  if (id === 'results') renderResults();
  if (id === 'done') resetFeel();
  if (id !== 'breath' && id !== 'bath') voiceOn = true;
}

document.addEventListener('click', (event) => {
  const go = event.target.closest('[data-go]');
  if (!go) return;
  if (sess && !sess.over) return;
  show(go.dataset.go);
});

/* ---------- settings ---------- */
const getK = (key) => {
  const [a, b] = key.split('.');
  return S[a][b];
};
function setK(key, value) {
  const [a, b] = key.split('.');
  S[a][b] = value;
  if (key === 'g.voice' && !VOICE_IDS.includes(value)) S.g.voice = 'harper_32';
  if (key === 'g.coach' && !['calm', 'hard', 'savage'].includes(value)) S.g.coach = 'calm';
  store.set('settings', S);
  if (key === 'g.musicVol') audio.applyMusic(value);
  if (key === 'g.voice') warmVoice(S.g.voice);
  refresh();
}

const HEAT_TRACKS = [
  { id: 'off', name: 'Off', line: 'Quiet. The gong and the voice stay.' },
  { id: 'firstlight', name: 'First Light', line: 'Soft piano and slow ambient pads.' },
  { id: 'hearth', name: 'Soft Rain', line: 'Rain over a slow, warm ambient bed.' },
  { id: 'stillness', name: 'Stillness', line: 'Ethereal, tape-soft meditation.' }
];

function fillTracks() {
  const html = Object.entries(audio.tracks)
    .filter(([, track]) => !track.file)
    .map(([key, track]) => `<option value="${key}">${track.name}</option>`).join('');
  document.querySelectorAll('select.trk').forEach((sel) => { sel.innerHTML = html; });
  const heat = HEAT_TRACKS.map((track) => `<option value="${track.id}">${track.name}</option>`).join('');
  document.querySelectorAll('select.heat').forEach((sel) => { sel.innerHTML = heat; });
}

function bindControls() {
  document.querySelectorAll('[data-key]').forEach((el) => {
    const key = el.dataset.key;
    if (el.classList.contains('stepper')) {
      const [minus, , plus] = el.children;
      const min = +el.dataset.min;
      const max = +el.dataset.max;
      const step = +el.dataset.step;
      minus.onclick = () => setK(key, Math.max(min, +(getK(key) - step).toFixed(2)));
      plus.onclick = () => setK(key, Math.min(max, +(getK(key) + step).toFixed(2)));
    } else if (el.classList.contains('seg')) {
      el.querySelectorAll('button').forEach((button) => {
        button.onclick = () => setK(key, el.dataset.key === 'g.voice' || el.dataset.key === 'g.coach' || isNaN(+button.dataset.v) ? button.dataset.v : button.dataset.v);
      });
    } else if (el.type === 'checkbox') {
      el.checked = !!getK(key);
      el.onchange = () => setK(key, el.checked);
    } else {
      el.value = getK(key);
      el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
        setK(key, el.type === 'range' ? +el.value : el.value);
      });
    }
  });
}

function iDuration() { return S.i.preset === 'custom' ? Math.round(S.i.custom * 60) : PRESETS[S.i.preset]; }
function sDuration() { return S.s.preset === 'custom' ? Math.round(S.s.custom * 60) : SAUNA_PRESETS[S.s.preset]; }
function cxSteps() {
  const c = S.c;
  const steps = [];
  const hot = { k: 'h', d: c.hot * 60 };
  const cold = { k: 'c', d: Math.round(c.cold * 60) };
  const sw = Math.round(c.trans * 60);
  const [first, second] = c.order === 'hc' ? [hot, cold] : [cold, hot];
  for (let r = 1; r <= c.rounds; r++) {
    steps.push({ ...first, r }, { k: 's', d: sw, to: second.k, r });
    steps.push({ ...second, r });
    if (r < c.rounds) steps.push({ k: 's', d: sw, to: first.k, r: r + 1 });
  }
  return steps;
}
function cxTotal() { return cxSteps().reduce((sum, step) => sum + step.d, 0); }

function refresh() {
  document.querySelectorAll('.seg[data-key]').forEach((seg) => {
    const value = getK(seg.dataset.key);
    seg.querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.v === String(value))));
  });
  document.querySelectorAll('.stepper').forEach((stepper) => {
    const value = getK(stepper.dataset.key);
    const mode = stepper.dataset.fmt;
    stepper.querySelector('output').textContent = mode === 'mmss' ? fmt(value * 60) : mode === 'min' ? value + ' min' : value;
  });
  const c = S.c;
  $('cDur').textContent = fmt(cxTotal());
  $('cHint').textContent = `${c.rounds} round${c.rounds > 1 ? 's' : ''} · ${c.hot} min hot · ${fmt(c.cold * 60)} cold · ${fmt(c.trans * 60)} to switch`;
  $('cHotV').textContent = `${c.hotF}°F / ${fToC(c.hotF)}°C`;
  $('cColdV').textContent = `${c.coldF}°F / ${fToC(c.coldF)}°C`;
  $('cMusicOpts').hidden = !c.music;
  const b = S.b;
  const pace = PACE[b.pace];
  const est = Math.round((b.rounds * (b.breaths * pace + 95 + 22) + 12) / 60);
  $('bBadge').textContent = (est < 1 ? '<1' : String(est)) + 'm';
  $('bHint').textContent = `${b.rounds} round${b.rounds > 1 ? 's' : ''} · ${pace.toFixed(1)} s per breath · about ${est || 1} min`;
  $('bMusicOpts').hidden = !b.music;
  $('iDur').textContent = fmt(iDuration());
  $('iCustomRow').hidden = S.i.preset !== 'custom';
  $('iPrepV').textContent = S.i.prep < 1 ? '30s' : (S.i.prep % 1 ? fmt(S.i.prep * 60) : S.i.prep + ' min');
  $('iTempRow').hidden = !S.i.tempOn;
  $('iTempV').textContent = `${S.i.tempF}°F / ${fToC(S.i.tempF)}°C`;
  $('iMusicOpts').hidden = !S.i.music;
  $('sDur').textContent = fmt(sDuration());
  $('sCustomRow').hidden = S.s.preset !== 'custom';
  $('sTempV').textContent = `${S.s.tempF}°F / ${fToC(S.s.tempF)}°C`;
  $('sMusicOpts').hidden = !S.s.music;
  const heat = HEAT_TRACKS.find((track) => track.id === S.s.track) || HEAT_TRACKS[0];
  $('sTrackLine').textContent = heat.line;
  $('cTrackLine').textContent = heat.line;
  document.querySelectorAll('select.heat').forEach((sel) => { sel.value = heat.id; });
  $('gCoachHint').textContent = S.g.coach === 'savage'
    ? 'Brutal language. Not for kids.'
    : hard()
      ? 'Blunter lines. The safety cues stay in.'
      : 'Calm, steady guidance.';
  $('gCoachHint').classList.toggle('brutal', S.g.coach === 'savage');
  $('gMusicVolV').textContent = Math.round(S.g.musicVol * 100) + '%';
}

const PLAY = '<svg viewBox="0 0 16 16" width="16" height="16"><path d="M4 2l10 6-10 6z" fill="currentColor"/></svg>';
const STOP = '<svg viewBox="0 0 16 16" width="16" height="16"><rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor"/></svg>';
let prevBtn = null;
let prevTimer = null;
function clearPreviewBtn() {
  clearTimeout(prevTimer);
  if (prevBtn) {
    prevBtn.classList.remove('on');
    prevBtn.innerHTML = PLAY;
    prevBtn = null;
  }
}
document.querySelectorAll('.prev').forEach((button) => {
  button.innerHTML = PLAY;
  button.onclick = () => {
    const was = prevBtn === button;
    audio.stopPreview();
    clearPreviewBtn();
    if (was) return;
    audio.unlock();
    audio.preview($(button.dataset.prev).value);
    prevBtn = button;
    button.classList.add('on');
    button.innerHTML = STOP;
    prevTimer = setTimeout(() => { audio.stopPreview(); clearPreviewBtn(); }, 15000);
  };
});

$('gPreview').onclick = () => {
  audio.unlock();
  voice.unlock();
  voice.say(C.preview, { interrupt: true });
  $('gPreview').textContent = 'Playing…';
  setTimeout(() => { $('gPreview').textContent = 'Preview voice'; }, 3600);
};
$('gTest').onclick = () => {
  audio.unlock();
  voice.unlock();
  audio.gong();
  voice.say(C.welcome, { interrupt: true });
};
$('gSafety').onclick = () => openSafety('settings');

/* ---------- clock, wake lock, visibility ---------- */
let sess = null;
let loopId = null;
let wakeLock = null;

function nowMs() { return sess.paused ? sess.pauseStart : Date.now(); }
function active() { return (nowMs() - sess.t0 - sess.pausedTotal) / 1000; }
function phaseT() { return active() - sess.ps; }
function setPhase(name) {
  sess.phase = name;
  sess.ps = active();
  sess.cues = {};
  sess.sub = null;
  sess.savageKind = null;
  sess.savageBag = [];
  sess.nextSavage = null;
  const enter = sess.enter[name];
  if (enter) enter();
}
function shuffleIds(list) {
  const bag = list.slice();
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = bag[i];
    bag[i] = bag[j];
    bag[j] = swap;
  }
  return bag;
}
function tickSavage(kind) {
  if (!sess || S.g.coach !== 'savage' || !voiceOn) return;
  if (sess.savageKind !== kind) {
    sess.savageKind = kind;
    sess.savageBag = shuffleIds(kind === 'heat' ? SAVAGE_HEAT : SAVAGE_COLD);
    sess.nextSavage = phaseT() + 25 + Math.random() * 10;
    return;
  }
  if (phaseT() < sess.nextSavage) return;
  sess.nextSavage = phaseT() + 25 + Math.random() * 10;
  if (voice.busy()) return;
  if (!sess.savageBag.length) sess.savageBag = shuffleIds(kind === 'heat' ? SAVAGE_HEAT : SAVAGE_COLD);
  speak(sess.savageBag.pop());
}
function cueOnce(key, at, ids) {
  if (!sess || sess.cues[key] || at == null) return;
  const t = phaseT();
  if (t < at) return;
  sess.cues[key] = 1;
  const win = Math.min(10, Math.max(3.2, sess.tickGap || 0));
  if (t < at + win) speak(ids);
}
function startLoop(fn) {
  stopLoop();
  let last = Date.now();
  const step = () => {
    if (!sess || sess.over) return;
    const n = Date.now();
    sess.tickGap = (n - last) / 1000;
    last = n;
    fn();
  };
  sess._step = step;
  loopId = setInterval(step, 200);
}
function stopLoop() {
  if (loopId) clearInterval(loopId);
  loopId = null;
}
async function wake() {
  try {
    if (!navigator.wakeLock || wakeLock) return;
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (e) {}
}
function unwake() {
  try { if (wakeLock) wakeLock.release(); } catch (e) {}
  wakeLock = null;
}
function pauseSession(btn, auto) {
  if (!sess || sess.paused || sess.over) return;
  sess.paused = true;
  sess.autoPaused = !!auto;
  sess.pauseStart = Date.now();
  voice.cancel();
  audio.suspend();
  if (btn) btn.textContent = 'Resume';
  setPlaying(false);
}
function resumeSession(btn) {
  if (!sess || !sess.paused || sess.over) return;
  sess.pausedTotal += Date.now() - sess.pauseStart;
  sess.paused = false;
  sess.autoPaused = false;
  audio.resume();
  if (btn) btn.textContent = 'Pause';
  setPlaying(true);
}
function pauseToggle(btn) {
  if (!sess || sess.over) return;
  if (!sess.paused) pauseSession(btn, false);
  else resumeSession(btn);
}
function pauseButton() {
  if (!sess) return null;
  return sess.type === 'breath' ? $('brPause') : $('baPause');
}
function armStop(btn, fn) {
  if (btn.classList.contains('armed')) {
    btn.classList.remove('armed');
    fn();
    return;
  }
  const label = btn.textContent;
  btn.classList.add('armed');
  btn.textContent = 'Tap again to end';
  setTimeout(() => {
    if (!btn.isConnected) return;
    btn.classList.remove('armed');
    btn.textContent = label;
  }, 3000);
}
function endSession() {
  if (sess) sess.over = true;
  stopLoop();
  unwake();
  audio.keepAlive(false);
  audio.resume();
  setPlaying(false);
}
function beginAudio() {
  audio.unlock();
  voice.unlock();
  audio.ensure();
  audio.keepAlive(true);
  wake();
  audio.stopPreview();
  clearPreviewBtn();
}

function onBackground() {
  if (!sess || sess.over || sess.paused) return;
  if (sess.type === 'breath') pauseSession($('brPause'), true);
}
function onForeground() {
  audio.resume();
  voice.nudge();
  if (!sess || sess.over) return;
  wake();
  if (sess.autoPaused && Date.now() - sess.pauseStart < 4000) resumeSession($('brPause'));
  if (sess._step) sess._step();
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') onBackground();
  else onForeground();
});
window.addEventListener('pageshow', onForeground);
document.addEventListener('freeze', onBackground);
document.addEventListener('resume', onForeground);

function setPlaying(on) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.playbackState = on ? 'playing' : 'paused';
}
function setMedia(title) {
  if (!('mediaSession' in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({ title, artist: 'PlungeTX', album: 'Breathe. Plunge. Recover.' });
  setPlaying(true);
}
if ('mediaSession' in navigator) {
  try {
    navigator.mediaSession.setActionHandler('pause', () => pauseToggle(pauseButton()));
    navigator.mediaSession.setActionHandler('play', () => pauseToggle(pauseButton()));
  } catch (e) {}
}

/* ---------- guided breathing ---------- */
const br = {
  orb: $('brOrb'), big: $('brBig'), label: $('brLabel'), sub: $('brSub'), wrap: $('brWrap'), tap: $('brTap')
};
function scaleOrb(el, scale, dur, cls) {
  el.style.transitionDuration = dur + 's';
  el.style.transform = `scale(${scale})`;
  if (cls !== undefined) {
    el.classList.toggle('hold', cls === 'hold');
    el.classList.toggle('recover', cls === 'recover');
  }
}
function updRound() { $('brRound').textContent = `Round ${sess.round} of ${sess.R}`; }

function startBreath() {
  beginAudio();
  voiceOn = !!S.b.voice;
  const b = S.b;
  sess = {
    type: 'breath', t0: Date.now(), pausedTotal: 0, paused: false, round: 1, holds: [],
    P: PACE[b.pace], N: b.breaths, R: b.rounds, cues: {},
    enter: {
      intro() {
        br.label.textContent = 'Get ready';
        br.sub.textContent = 'Breathe in fully through the belly, then let it go';
        br.big.textContent = '';
        scaleOrb(br.orb, 0.55, 1.5, '');
        speak(breathIntro(b.rounds, b.breaths), true);
      },
      breathing() {
        br.sub.textContent = '';
        br.wrap.classList.remove('holding');
      },
      hold() {
        br.wrap.classList.add('holding');
        scaleOrb(br.orb, 0.42, 2.2, 'hold');
        br.label.textContent = 'Hold';
        br.sub.textContent = 'Breath out, lungs relaxed. Tap when you need to breathe.';
        br.tap.hidden = false;
        audio.gong(50, 0.08);
        audio.buzz(60);
        speak(C.letGoHold, true);
        if (S.b.music) audio.playTrack(S.b.trackB, 5);
      },
      recover() {
        br.tap.hidden = true;
        br.wrap.classList.remove('holding');
        scaleOrb(br.orb, 1.05, 2.6, 'recover');
        br.label.textContent = 'Breathe all the way in';
        br.sub.textContent = 'Recovery breath, hold for 15 seconds';
        br.big.textContent = '';
        if (S.b.whoosh) audio.whoosh(2.6, true);
        audio.buzz(60);
        speak(C.breatheInHold, true);
      },
      release() {
        scaleOrb(br.orb, 0.55, 2.5, '');
        br.label.textContent = 'Let go';
        audio.gong(57, 0.1);
        if (S.b.whoosh) audio.whoosh(2.5, false);
        audio.buzz([40, 60, 40]);
        if (sess.round < sess.R) {
          br.sub.textContent = `Round ${sess.round + 1} is next`;
          speak(letGoRound(sess.round + 1), true);
          if (S.b.music) audio.playTrack(S.b.trackA, 5);
        } else {
          br.sub.textContent = '';
          speak(C.letGo, true);
        }
      },
      done() { finishBreath(); }
    }
  };
  $('brPause').textContent = 'Pause';
  $('brPace').textContent = b.pace[0].toUpperCase() + b.pace.slice(1);
  br.tap.hidden = true;
  updRound();
  show('breath');
  sess.introLen = voiceOn ? 11 : 3;
  setPhase('intro');
  if (b.music) audio.playTrack(b.trackA, 5);
  setMedia('Breathing');
  startLoop(tickBreath);
}
function breathStep(i, inhale) {
  const s = sess;
  const half = s.P * 0.5;
  br.big.textContent = i + 1;
  scaleOrb(br.orb, inhale ? 1 : 0.5, half * 0.95);
  br.label.textContent = inhale ? 'Breathe in' : 'Let go';
  if (S.b.whoosh) audio.whoosh(half * 0.95, inhale);
  if (!inhale) return;
  if (i === 1 && s.round === 1) speak(C.belly);
  else if (i === s.N - 1) speak(C.lastOne);
  else if (i === s.N - 5 && s.N >= 20) speak(C.fiveMore);
  else if (i === Math.floor(s.N / 2)) speak(C.halfway);
}
function tickBreath() {
  const s = sess;
  if (!s || s.paused || s.over) return;
  const t = phaseT();
  switch (s.phase) {
    case 'intro':
      if (t >= s.introLen) setPhase('breathing');
      break;
    case 'breathing': {
      const i = Math.floor(t / s.P);
      if (i >= s.N) { setPhase('hold'); return; }
      const inhale = (t - i * s.P) < s.P * 0.5;
      const sub = i + (inhale ? 'i' : 'o');
      if (sub !== s.sub) { s.sub = sub; breathStep(i, inhale); }
      break;
    }
    case 'hold': {
      const sec = Math.floor(t);
      br.big.textContent = fmt(t);
      const ids = holdCue(sec);
      if (ids) cueOnce('h' + sec, sec, ids);
      break;
    }
    case 'recover':
      if (t >= 2.8) {
        br.big.textContent = Math.max(0, Math.ceil(17.8 - t));
        if (!s.cues.l) { s.cues.l = 1; br.label.textContent = 'Hold'; }
      }
      cueOnce('c', 14.6, C.threeTwoOne);
      if (t >= 17.8) setPhase('release');
      break;
    case 'release':
      if (t >= 4) {
        if (s.round < s.R) { s.round++; updRound(); setPhase('breathing'); }
        else setPhase('done');
      }
      break;
    default: break;
  }
}
function endHold() {
  if (sess && sess.phase === 'hold' && !sess.paused) {
    sess.holds.push(Math.round(phaseT()));
    setPhase('recover');
  }
}
$('brStage').addEventListener('click', endHold);
$('brPause').onclick = (e) => pauseToggle(e.currentTarget);
$('brStop').onclick = (e) => armStop(e.currentTarget, abort);
$('bStart').onclick = startBreath;

function finishBreath() {
  const s = sess;
  endSession();
  audio.playTrack(null, 8);
  audio.gong(50, 0.1);
  speak(C.finalRound);
  const fresh = save({ type: 'breath', holds: s.holds, pace: S.b.pace, breaths: S.b.breaths });
  speak(C.finishOhYeah);
  voiceOn = true;
  const best = s.holds.length ? Math.max(...s.holds) : 0;
  const avg = s.holds.length ? s.holds.reduce((a, b) => a + b, 0) / s.holds.length : 0;
  const nr = s.holds.length;
  const pace = S.b.pace[0].toUpperCase() + S.b.pace.slice(1);
  lastShare = {
    kind: 'breath', eyebrow: 'Breathwork', big: fmt(best), seconds: best, unit: 'best breath hold',
    title: `${nr} round${nr === 1 ? '' : 's'} · ${pace} pace`,
    lines: ['Holds  ' + s.holds.map(fmt).join('  ·  ')],
    text: `Held my breath for ${humanDur(best)} after ${nr} round${nr === 1 ? '' : 's'} of breathwork`
  };
  $('dTitle').textContent = 'Breathing complete';
  $('dSub').textContent = `Best hold ${fmt(best)} · Average ${fmt(avg)}`;
  const width = best || 1;
  $('dBody').innerHTML = awardsHTML(fresh) + '<div class="bars">' + s.holds.map((h, i) =>
    `<div class="barrow"><span>Round ${i + 1}</span><div class="t"><i style="width:${Math.max(4, h / width * 100)}%"></i></div><b>${fmt(h)}</b></div>`
  ).join('') + '</div>';
  offerShare();
  show('done');
}

/* ---------- ice bath + shared bath view ---------- */
const ba = {
  orb: $('baOrb'), time: $('baTime'), small: $('baSmall'), label: $('baLabel'),
  sub: $('baSub'), prog: $('baProg'), phase: $('baPhase')
};
const CIRC = 2 * Math.PI * 124;
ba.prog.style.strokeDasharray = String(CIRC);
function ring(f) { ba.prog.style.strokeDashoffset = String(CIRC * (1 - Math.min(1, Math.max(0, f)))); }
function slowBreath(t) {
  const cycle = t % 10;
  const inhale = cycle < 4;
  const sub = Math.floor(t / 10) + (inhale ? 'i' : 'o');
  if (sub === sess.sub) return null;
  sess.sub = sub;
  const coldish = sess.phase === 'cold' || (sess.steps && sess.steps[sess.idx] && sess.steps[sess.idx].k === 'c');
  scaleOrb(ba.orb, inhale ? 1 : 0.62, inhale ? 3.8 : 5.8, '');
  ba.label.textContent = coldish ? (inhale ? 'Breathe in' : 'Long exhale') : (inhale ? 'Breathe in' : 'Breathe out');
  return inhale;
}

function startBath() {
  beginAudio();
  voiceOn = !!S.i.voice;
  const dur = iDuration();
  const prep = Math.round(S.i.prep * 60);
  sess = {
    type: 'bath', t0: Date.now(), pausedTotal: 0, paused: false, dur, prep, planned: dur, cues: {},
    enter: {
      prep() {
        ba.phase.textContent = 'Prepare';
        ba.small.textContent = 'until plunge';
        ring(0);
        speak(C.prep, true);
      },
      enter() {
        ba.phase.textContent = 'Step in';
        ba.label.textContent = 'Step in slowly';
        ba.sub.textContent = 'Long exhale as the cold reaches you';
        ba.small.textContent = 'timer starts';
        ring(1);
        audio.gong(55, 0.1);
        audio.buzz(80);
        speak(C.stepIn, true);
      },
      cold() {
        ba.phase.textContent = 'Plunge';
        ba.small.textContent = 'remaining';
        ba.sub.textContent = '';
        audio.gong(50, 0.12);
        audio.buzz([60, 80, 60]);
        speak(coachLine(hard(), C.timerStarted, C.clockRunning), true);
      },
      done() { finishBath(false); }
    }
  };
  $('v-bath').classList.remove('sauna');
  const chip = $('baTemp');
  chip.hidden = !S.i.tempOn;
  chip.textContent = `${S.i.tempF}°F · ${fToC(S.i.tempF)}°C`;
  $('baPause').textContent = 'Pause';
  show('bath');
  setPhase('prep');
  if (S.i.music) audio.playTrack(S.i.track, 5);
  setMedia('Ice bath');
  startLoop(tickBath);
}
function tickBath() {
  const s = sess;
  if (!s || s.paused || s.over) return;
  const t = phaseT();
  if (s.phase === 'prep') {
    const rem = s.prep - t;
    ba.time.textContent = fmt(Math.ceil(rem));
    ring(t / s.prep);
    const inhale = slowBreath(t);
    if (inhale !== null && t > 8 && t < 32) speak(inhale ? C.breatheIn : C.andOut);
    if (s.prep >= 120) {
      cueOnce('half', s.prep / 2, C.relaxJaw);
      cueOnce('r60', s.prep - 60, C.oneMinuteLeftSteady);
    }
    if (s.prep > 40) cueOnce('r30', s.prep - 30, C.thirtyHeadToTub);
    cueOnce('r10', s.prep - 10, C.tenSeconds);
    if (rem <= 0) setPhase('enter');
  } else if (s.phase === 'enter') {
    const rem = 12 - t;
    ba.time.textContent = String(Math.max(0, Math.ceil(rem)));
    scaleOrb(ba.orb, 0.8, 2, '');
    if (rem <= 0) setPhase('cold');
  } else if (s.phase === 'cold') {
    const d = s.dur;
    const rem = d - t;
    ba.time.textContent = fmt(Math.ceil(rem));
    ring(1 - t / d);
    slowBreath(t);
    const marks = [];
    for (let k = 1; k * 60 < d - 12; k++) marks.push(k * 60);
    if (d >= 120) marks.push(d / 2);
    if (d >= 60) marks.push(d - 30);
    marks.push(d - 10);
    for (let k = 1; k * 60 < d - 12; k++) {
      const at = k * 60;
      if (Math.abs(at - (d - 30)) < 6 || Math.abs(at - (d - 10)) < 6) continue;
      cueOnce('m' + k, at, minutesIn(k, at === d / 2 ? C.halfwayThere : null));
    }
    if (d >= 120 && (d / 2) % 60 !== 0) cueOnce('half' + d, d / 2, C.halfwayThere);
    if (d >= 60) cueOnce('r30_' + d, d - 30, C.thirtyLeft);
    cueOnce('r10_' + d, d - 10, C.tenSeconds);
    cueOnce('go', 12, C.shouldersDrop);
    if (t >= 20) {
      const k = Math.floor((t - 20) / 25);
      const ts = 20 + 25 * k;
      if (ts < d - 14 && !marks.some((m) => Math.abs(m - ts) < 8)) {
        cueOnce('c' + k, ts, (hard() ? HARD_COLD : CALM)[k % 8]);
      }
    }
    if (rem > 12) tickSavage('cold');
    if (rem <= 0) {
      s.logged = Math.round(Math.min(Math.max(t, 0), d));
      setPhase('done');
    }
  }
}
function heldSeconds(s, phaseName, cap) {
  if (typeof s.logged === 'number') return s.logged;
  if (!phaseName || s.phase === phaseName) return Math.round(Math.min(Math.max(phaseT(), 0), cap));
  return 0;
}
function finishBath(early) {
  const s = sess;
  const actual = heldSeconds(s, 'cold', s.dur);
  endSession();
  audio.playTrack(null, 6);
  if (!early) {
    audio.gong(50, 0.12);
    setTimeout(() => audio.gong(57, 0.1), 900);
    audio.buzz([100, 80, 100]);
    speak(coachLine(hard(), C.timeStepOut, C.timeYouDid), true);
  } else voice.cancel();
  const fresh = save({ type: 'bath', planned: s.dur, actual, tempF: S.i.tempOn ? S.i.tempF : null });
  if (!early) speak(C.finishOhYeah);
  voiceOn = true;
  const n = last30().pl.length;
  lastShare = {
    kind: 'ice', eyebrow: 'Cold plunge', big: fmt(actual), seconds: actual,
    unit: S.i.tempOn ? `in ${S.i.tempF}°F water` : 'in the cold',
    title: `${n} plunge${n === 1 ? '' : 's'} in the last 30 days`, lines: [],
    text: `Just did ${humanDur(actual)} in a ${S.i.tempOn ? S.i.tempF + '°F ' : ''}cold plunge. That's ${n} plunge${n === 1 ? '' : 's'} in the last 30 days.`
  };
  $('dTitle').textContent = early ? 'Plunge logged' : 'Plunge complete';
  $('dSub').textContent = `${fmt(actual)} in the water` + (S.i.tempOn ? ` at ${S.i.tempF}°F` : '');
  $('dBody').innerHTML = awardsHTML(fresh) + '<p class="fine" style="text-align:center">Warm up on your own: move around, get dressed, and give it a few minutes before a hot shower.</p>';
  offerShare();
  show('done');
}
$('baPause').onclick = (e) => pauseToggle(e.currentTarget);
$('baStop').onclick = (e) => armStop(e.currentTarget, abort);
$('baPlus').onclick = () => {
  if (!sess || sess.over) return;
  if (sess.type === 'contrast') {
    const step = cxStep();
    if (step.k === 's') return;
    step.d += 30;
    speak(C.thirtyAdded);
    return;
  }
  if (sess.phase === 'cold' || sess.phase === 'heat') sess.dur += 30;
  else if (sess.phase === 'prep') sess.prep += 30;
  else return;
  speak(C.thirtyAdded);
};
$('iStart').onclick = startBath;

/* ---------- sauna ---------- */
function startSauna() {
  beginAudio();
  voiceOn = !!S.s.voice;
  const dur = sDuration();
  sess = {
    type: 'sauna', t0: Date.now(), pausedTotal: 0, paused: false, dur, cues: {},
    enter: {
      heat() {
        ba.phase.textContent = 'Sauna';
        ba.small.textContent = 'remaining';
        ba.sub.textContent = '';
        ring(1);
        audio.gong(52, 0.1);
        audio.buzz(80);
        speak(coachLine(hard(), C.welcomeHeat, C.intoHeatHard), true);
      },
      done() { finishSauna(false); }
    }
  };
  $('v-bath').classList.add('sauna');
  const chip = $('baTemp');
  chip.hidden = false;
  chip.textContent = `${S.s.tempF}°F · ${fToC(S.s.tempF)}°C`;
  $('baPause').textContent = 'Pause';
  show('bath');
  setPhase('heat');
  if (S.s.music && S.s.track !== 'off') audio.playTrack(S.s.track, 6);
  setMedia('Sauna');
  startLoop(tickSauna);
}
function tickSauna() {
  const s = sess;
  if (!s || s.paused || s.over) return;
  const t = phaseT();
  const d = s.dur;
  const rem = d - t;
  ba.time.textContent = fmt(Math.ceil(rem));
  ring(1 - t / d);
  slowBreath(t);
  cueOnce('pace', 16, C.breathFourSix);
  const marks = [d - 60, d - 10];
  for (let k = 5; k * 60 < d - 30; k += 5) marks.push(k * 60);
  if (d >= 600) marks.push(d / 2);
  for (let k = 5; k * 60 < d - 30; k += 5) {
    const at = k * 60;
    cueOnce('m' + k, at, minutesIn(k, at === d / 2 ? C.halfwayCheck : null));
  }
  if (d >= 600 && (d / 2) % 300 !== 0) cueOnce('half' + d, d / 2, C.halfwayCheckStep);
  if (d >= 180) cueOnce('r60_' + d, d - 60, C.oneMinuteLeftHeat);
  cueOnce('r10_' + d, d - 10, C.tenSeconds);
  if (t >= 50) {
    const k = Math.floor((t - 50) / 50);
    const ts = 50 + 50 * k;
    if (ts < d - 20 && !marks.some((m) => Math.abs(m - ts) < 10)) {
      cueOnce('s' + k, ts, hard() ? HARD_HEAT[k % 8] : SCAN[k % SCAN.length]);
    }
  }
  if (rem > 12) tickSavage('heat');
  if (rem <= 0) {
    s.logged = Math.round(Math.min(Math.max(t, 0), d));
    setPhase('done');
  }
}
function finishSauna(early) {
  const s = sess;
  const actual = heldSeconds(s, 'heat', s.dur);
  endSession();
  audio.playTrack(null, 8);
  if (!early) {
    audio.gong(52, 0.12);
    setTimeout(() => audio.gong(57, 0.1), 900);
    audio.buzz([100, 80, 100]);
    speak(coachLine(hard(), C.timeSitUp, C.timeYouEarned), true);
  } else voice.cancel();
  const fresh = save({ type: 'sauna', planned: s.dur, actual, tempF: S.s.tempF });
  if (!early) speak(C.finishOhYeah);
  voiceOn = true;
  const n = last30().sa.length;
  lastShare = {
    kind: 'heat', eyebrow: 'Sauna', big: fmt(actual), seconds: actual, unit: `at ${S.s.tempF}°F`,
    title: `${n} sauna${n === 1 ? '' : 's'} in the last 30 days`, lines: [],
    text: `${humanDur(actual)} in a ${S.s.tempF}°F sauna. That's ${n} sauna session${n === 1 ? '' : 's'} in the last 30 days.`
  };
  $('dTitle').textContent = early ? 'Sauna logged' : 'Sauna complete';
  $('dSub').textContent = `${fmt(actual)} at ${S.s.tempF}°F`;
  $('dBody').innerHTML = awardsHTML(fresh) + '<p class="fine" style="text-align:center">Drink water and cool down gradually. Doing contrast? Head to the plunge once your breathing has settled.</p>';
  offerShare();
  show('done');
}
$('sStart').onclick = startSauna;

/* ---------- contrast ---------- */
function cxStep() { return sess.steps[sess.idx]; }
function startContrast() {
  beginAudio();
  voiceOn = !!S.c.voice;
  sess = {
    type: 'contrast', t0: Date.now(), pausedTotal: 0, paused: false,
    steps: cxSteps(), idx: 0, done: [], rounds: S.c.rounds, cues: {},
    enter: { step() { cxEnter(); }, done() { finishContrast(false); } }
  };
  $('baPause').textContent = 'Pause';
  show('bath');
  setPhase('step');
  setMedia('Contrast');
  startLoop(tickContrast);
}
function cxEnter() {
  const s = sess;
  const step = cxStep();
  const total = s.rounds;
  const chip = $('baTemp');
  const first = !s.steps.slice(0, s.idx).some((item) => item.r === step.r && item.k !== 's');
  const prefix = first && step.k !== 's' ? [roundOf(step.r, total)] : [];
  $('v-bath').classList.toggle('sauna', step.k === 'h' || (step.k === 's' && step.to === 'h'));
  chip.hidden = false;
  if (step.k === 'h') {
    ba.phase.textContent = `Round ${step.r} of ${total} · Heat`;
    chip.textContent = `${S.c.hotF}°F sauna`;
    ba.small.textContent = 'in the heat';
    ba.sub.textContent = '';
    audio.gong(52, 0.1);
    audio.buzz(80);
    const line = coachLine(hard(), s.idx === 0 ? C.intoHeatSettle : C.backIntoHeat, C.intoHeatOwn);
    speak(prefix.concat(line), true);
    if (S.c.music && S.s.track !== 'off') audio.playTrack(S.s.track, 5);
  } else if (step.k === 'c') {
    ba.phase.textContent = `Round ${step.r} of ${total} · Cold`;
    chip.textContent = `${S.c.coldF}°F plunge`;
    ba.small.textContent = 'in the cold';
    ba.sub.textContent = '';
    audio.gong(50, 0.12);
    audio.buzz([60, 80, 60]);
    speak(prefix.concat(coachLine(hard(), C.intoTheCold, C.getIn)), true);
    if (S.c.music) audio.playTrack(S.c.trackCold, 4);
  } else {
    const toCold = step.to === 'c';
    ba.phase.textContent = toCold ? 'Switch to cold' : 'Switch to heat';
    chip.textContent = toCold ? `${S.c.coldF}°F plunge next` : `${S.c.hotF}°F sauna next`;
    ba.small.textContent = 'to switch';
    ring(1);
    ba.label.textContent = toCold ? 'Head to the plunge' : 'Back to the sauna';
    ba.sub.textContent = toCold ? 'Step in slowly when you get there' : 'Dry off on the way';
    scaleOrb(ba.orb, 0.8, 2, '');
    audio.buzz(60);
    speak(toCold ? coachLine(hard(), C.switchPlungeCalm, C.switchPlungeHard) : C.outOfCold, true);
  }
}
function tickContrast() {
  const s = sess;
  if (!s || s.paused || s.over) return;
  const step = cxStep();
  const t = phaseT();
  const d = step.d;
  const rem = d - t;
  ba.time.textContent = fmt(Math.ceil(rem));
  ring(1 - t / d);
  if (step.k === 's') {
    if (d > 15) cueOnce('r10', d - 10, C.tenSeconds);
  } else {
    slowBreath(t);
    if (step.k === 'h') {
      if (d >= 180) cueOnce('r60', d - 60, C.oneMinuteLeftInHeat);
      cueOnce('r10', d - 10, C.tenGetReady);
      if (t >= 45) {
        const k = Math.floor((t - 45) / 60);
        const ts = 45 + 60 * k;
        if (ts < d - 75) cueOnce('s' + k, ts, hard() ? HARD_HEAT[(k + step.r * 3) % 8] : SCAN[(k + step.r * 3) % SCAN.length]);
      }
    } else {
      if (d >= 40) cueOnce('go', 12, C.shouldersDown);
      if (d >= 75) cueOnce('r30', d - 30, C.thirtyLeft);
      cueOnce('r10', d - 10, C.tenSeconds);
      if (t >= 30) {
        const k = Math.floor((t - 30) / 25);
        const ts = 30 + 25 * k;
        if (ts < d - 35) cueOnce('c' + k, ts, (hard() ? HARD_COLD : CALM)[(k + step.r) % 8]);
      }
    }
    if (rem > 12) tickSavage(step.k === 'h' ? 'heat' : 'cold');
  }
  if (rem <= 0) {
    if (step.k !== 's') s.done.push({ k: step.k, s: d, r: step.r });
    if (s.idx < s.steps.length - 1) { s.idx++; setPhase('step'); }
    else setPhase('done');
  }
}
function finishContrast(early) {
  const s = sess;
  const c = S.c;
  endSession();
  audio.playTrack(null, 8);
  const heatParts = s.done.filter((x) => x.k === 'h');
  const coldParts = s.done.filter((x) => x.k === 'c');
  const heat = heatParts.reduce((a, x) => a + x.s, 0);
  const cold = coldParts.reduce((a, x) => a + x.s, 0);
  const rounds = new Set(s.done.map((x) => x.r)).size;
  const endedCold = s.done.length && s.done[s.done.length - 1].k === 'c';
  if (!early) {
    audio.gong(50, 0.12);
    setTimeout(() => audio.gong(57, 0.1), 900);
    audio.buzz([100, 80, 100]);
    speak(hard() ? C.contrastEndHard : (endedCold ? C.contrastEndCold : C.contrastEndHeat), true);
  } else voice.cancel();
  const fresh = save({
    type: 'contrast', rounds, heat, cold, hotF: c.hotF, coldF: c.coldF,
    hotMax: Math.max(0, ...heatParts.map((x) => x.s)),
    coldMax: Math.max(0, ...coldParts.map((x) => x.s)),
    steps: s.done
  });
  if (!early) speak(C.finishOhYeah);
  voiceOn = true;
  lastShare = {
    kind: 'contrast', eyebrow: 'Hot and cold contrast', big: `${rounds}×`, seconds: heat + cold,
    unit: `round${rounds === 1 ? '' : 's'} of hot and cold`,
    title: `${humanDur(heat)} heat · ${humanDur(cold)} cold`,
    lines: [`${c.hotF}°F sauna · ${c.coldF}°F plunge`],
    text: `Just did ${rounds} round${rounds === 1 ? '' : 's'} of contrast: ${humanDur(heat)} in a ${c.hotF}°F sauna and ${humanDur(cold)} in a ${c.coldF}°F plunge`
  };
  $('v-bath').classList.remove('sauna');
  $('dTitle').textContent = early ? 'Contrast logged' : 'Contrast complete';
  $('dSub').textContent = `${rounds} round${rounds === 1 ? '' : 's'} · ${fmt(heat)} hot · ${fmt(cold)} cold`;
  const byRound = {};
  s.done.forEach((x) => { (byRound[x.r] = byRound[x.r] || { h: 0, c: 0 })[x.k] += x.s; });
  $('dBody').innerHTML = awardsHTML(fresh) + '<div class="bars">' + Object.entries(byRound).map(([r, v]) =>
    `<div class="barrow" style="grid-template-columns:72px 1fr 1fr"><span>Round ${r}</span><b style="text-align:left;color:var(--ember)">${fmt(v.h)} hot</b><b style="color:var(--glacier)">${fmt(v.c)} cold</b></div>`
  ).join('') + '</div><p class="fine" style="text-align:center">Drink water, and let your body rewarm on its own.</p>';
  offerShare();
  show('done');
}
$('cStart').onclick = startContrast;

function abort() {
  if (!sess) return;
  const s = sess;
  if (s.type === 'bath' && s.phase === 'cold' && phaseT() > 5) { finishBath(true); return; }
  if (s.type === 'sauna' && phaseT() > 30) { finishSauna(true); return; }
  if (s.type === 'contrast') {
    const step = cxStep();
    const part = step.k !== 's' ? Math.round(phaseT()) : 0;
    if (part > 0) s.done.push({ k: step.k, s: part, r: step.r });
    if (s.done.reduce((a, x) => a + x.s, 0) > 30) { finishContrast(true); return; }
  }
  endSession();
  voice.cancel();
  audio.playTrack(null, 1.5);
  if (s.type === 'breath' && s.holds.length) save({ type: 'breath', holds: s.holds, pace: S.b.pace, breaths: S.b.breaths });
  voiceOn = true;
  $('v-bath').classList.remove('sauna');
  show('home');
}

/* ---------- history, awards, results ---------- */
const dayNum = (ts) => Math.floor((ts - new Date(ts).getTimezoneOffset() * 6e4) / 864e5);
const coldSec = (e) => e.type === 'bath' ? (e.actual || 0) : e.type === 'contrast' ? (e.cold || 0) : 0;
const heatSec = (e) => e.type === 'sauna' ? (e.actual || 0) : e.type === 'contrast' ? (e.heat || 0) : 0;
const coldTemp = (e) => e.type === 'contrast' ? e.coldF : e.tempF;
const heatTemp = (e) => e.type === 'contrast' ? e.hotF : e.tempF;
const isPl = (e) => coldSec(e) > 0;
const isSa = (e) => heatSec(e) > 0;
const holdsOf = (h) => h.filter((e) => e.type === 'breath').flatMap((e) => e.holds || []);

function last30(h = store.get('history', [])) {
  const since = dayNum(Date.now()) - 29;
  const rows = h.filter((e) => dayNum(e.t) >= since);
  return { since, rows, pl: rows.filter(isPl), sa: rows.filter(isSa) };
}
function contrastDays(h) {
  const coldDays = new Set(h.filter(isPl).map((e) => dayNum(e.t)));
  return new Set(h.filter(isSa).map((e) => dayNum(e.t)).filter((d) => coldDays.has(d))).size;
}
function bestStreak(h) {
  const days = [...new Set(h.map((e) => dayNum(e.t)))].sort((a, b) => a - b);
  let best = 0; let run = 0; let prev = null;
  for (const day of days) {
    run = prev !== null && day === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = day;
  }
  return best;
}
function curStreak(h) {
  const days = new Set(h.map((e) => dayNum(e.t)));
  let d = dayNum(Date.now());
  if (!days.has(d)) d--;
  let n = 0;
  while (days.has(d)) { n++; d--; }
  return n;
}

const BADGES = [
  ['first_plunge', 'First Dip', 'Finish your first cold plunge', 'ice', (h) => h.some(isPl)],
  ['first_sauna', 'First Sweat', 'Finish your first sauna session', 'heat', (h) => h.some(isSa)],
  ['first_breath', 'First Breath', 'Complete a breathing session', 'breath', (h) => h.some((e) => e.type === 'breath')],
  ['contrast', 'Contrast', 'Sauna and plunge on the same day', 'both', (h) => contrastDays(h) >= 1],
  ['contrast10', 'Hot & Cold', '10 contrast days', 'both', (h) => contrastDays(h) >= 10],
  ['cx_session', 'Fire & Ice', 'Finish a guided contrast session', 'both', (h) => h.some((e) => e.type === 'contrast' && e.rounds >= 1)],
  ['cx3', 'Triple Contrast', '3 rounds of hot and cold in one session', 'both', (h) => h.some((e) => e.type === 'contrast' && e.rounds >= 3)],
  ['hard', 'Hard Mode', 'Finish a session with the Hard mode coach', 'streak', (h) => h.some((e) => e.coach === 'hard')],
  ['streak3', 'Three Straight', 'A 3-day streak', 'streak', (h) => bestStreak(h) >= 3],
  ['streak7', 'Full Week', 'A 7-day streak', 'streak', (h) => bestStreak(h) >= 7],
  ['streak30', 'Iron Month', 'A 30-day streak', 'streak', (h) => bestStreak(h) >= 30],
  ['plunge10', 'Regular', '10 cold plunges', 'ice', (h) => h.filter(isPl).length >= 10],
  ['plunge50', 'Ice Veteran', '50 cold plunges', 'ice', (h) => h.filter(isPl).length >= 50],
  ['polar', 'Polar', 'One plunge of 4 minutes or more', 'ice', (h) => h.some((e) => (e.type === 'bath' ? e.actual : e.coldMax || 0) >= 240)],
  ['ice40', 'Ice Water', 'Plunge in water 40°F or colder', 'ice', (h) => h.some((e) => isPl(e) && coldTemp(e) != null && coldTemp(e) <= 40)],
  ['cold60', 'Cold Hour', '60 cold minutes in 30 days', 'ice', (h) => Math.round(last30(h).pl.reduce((s, e) => s + coldSec(e), 0) / 60) >= 60],
  ['sauna10', 'Bench Warmer', '10 sauna sessions', 'heat', (h) => h.filter(isSa).length >= 10],
  ['sauna50', 'Steam Veteran', '50 sauna sessions', 'heat', (h) => h.filter(isSa).length >= 50],
  ['hot190', 'Hot Box', 'Sauna at 190°F or hotter', 'heat', (h) => h.some((e) => isSa(e) && heatTemp(e) >= 190)],
  ['long20', 'Long Sit', 'A 20-minute sauna session', 'heat', (h) => h.some((e) => (e.type === 'sauna' ? e.actual : e.hotMax || 0) >= 1200)],
  ['hold2', 'Two-Minute Hold', 'Hold your breath for 2:00', 'breath', (h) => holdsOf(h).some((x) => x >= 120)],
  ['hold3', 'Deep Diver', 'Hold your breath for 3:00', 'breath', (h) => holdsOf(h).some((x) => x >= 180)],
  ['early', 'Early Riser', 'Finish a session before 7 a.m.', 'clock', (h) => h.some((e) => new Date(e.t).getHours() < 7)]
].map(([id, name, desc, ic, test]) => ({ id, name, desc, ic, test }));

function checkBadges(h, announce) {
  const got = store.get('badges', {});
  const fresh = [];
  BADGES.forEach((badge) => {
    if (!got[badge.id] && badge.test(h)) {
      got[badge.id] = Date.now();
      fresh.push(badge);
    }
  });
  if (fresh.length) store.set('badges', got);
  if (fresh.length && announce) speak(awardClips(fresh.map((b) => b.id)));
  return fresh;
}

const MED = {
  ice: ['#128fa3', '#0f3a49'], heat: ['#e08a3c', '#4a2414'], breath: ['#e7f5f7', '#1d4556'],
  both: ['#e08a3c', '#0f3a49'], streak: ['#e0b15a', '#4a3410'], clock: ['#e0b15a', '#1d4556']
};
const GLY = {
  ice: '<path d="M32 18v28M20 25l24 14M44 25L20 39M27 20l5 4 5-4M27 44l5-4 5 4"/>',
  heat: '<path d="M24 44c-4-5 4-8 0-14s2-8 2-8M32 44c-4-5 4-8 0-14s2-8 2-8M40 44c-4-5 4-8 0-14s2-8 2-8"/>',
  breath: '<path d="M18 28h17a5 5 0 1 0-5-5M18 34h23a5 5 0 1 1-5 5M18 40h10"/>',
  both: '<circle cx="32" cy="32" r="11"/><path d="M32 21a11 11 0 0 0 0 22z" fill="#6dd3e0" stroke="none"/>',
  streak: '<path d="M32 45c-7 0-10-5-10-10 0-6 6-8 6-14 4 3 9 7 9 13 1-2 2-4 2-6 3 3 3 6 3 8 0 5-4 9-10 9z"/>',
  clock: '<circle cx="32" cy="32" r="12"/><path d="M32 25v7l5 3"/>'
};
function medal(ic) {
  const [color, bg] = MED[ic];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><path d="M32 4l24 14v28L32 60 8 46V18z" fill="${bg}" stroke="${color}" stroke-width="3" stroke-linejoin="round"/><g fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${GLY[ic]}</g></svg>`;
}
function awardsHTML(fresh) {
  if (!fresh.length) return '';
  return `<div class="newaw"><h3>New award${fresh.length > 1 ? 's' : ''}</h3>${fresh.map((b) =>
    `<button class="it" type="button" data-award="${b.id}">${medal(b.ic)}<span><b>${b.name}</b><br><small>${b.desc} · tap to share</small></span></button>`
  ).join('')}</div>`;
}
function renderBadges() {
  const got = store.get('badges', {});
  $('awCount').textContent = `${Object.keys(got).length} of ${BADGES.length} earned · tap an earned award to share it`;
  $('awGrid').innerHTML = BADGES.map((b) => got[b.id]
    ? `<button class="bdg" type="button" data-award="${b.id}">${medal(b.ic)}<b>${b.name}</b><small>${b.desc}</small><em>${new Date(got[b.id]).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</em></button>`
    : `<div class="bdg locked">${medal(b.ic)}<b>${b.name}</b><small>${b.desc}</small></div>`
  ).join('');
}

const IC = {
  breath: '<svg viewBox="0 0 24 24" fill="none" stroke="#0e3c4c" stroke-width="1.8" stroke-linecap="round"><path d="M3 8h11a3 3 0 1 0-3-3M3 12h15a3 3 0 1 1-3 3M3 16h8"/></svg>',
  bath: '<svg viewBox="0 0 24 24" fill="none" stroke="#0e3c4c" stroke-width="1.8" stroke-linecap="round"><path d="M12 2v20M4.5 6.5l15 11M19.5 6.5l-15 11"/></svg>',
  sauna: '<svg viewBox="0 0 24 24" fill="none" stroke="#6d3814" stroke-width="1.8" stroke-linecap="round"><path d="M7 20c-2-3 2-5 0-9s1-6 1-6M12 20c-2-3 2-5 0-9s1-6 1-6M17 20c-2-3 2-5 0-9s1-6 1-6"/></svg>',
  contrast: '<svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round"><path d="M5 20c-2-3 2-5 0-9s1-6 1-6M10 20c-2-3 2-5 0-9s1-6 1-6" stroke="#6d3814"/><path d="M17 4v16M13 8l8 8M21 8l-8 8" stroke="#0e3c4c"/></svg>'
};
const CHARTS = [
  { id: 'breath', name: 'Breathing', noun: 'breathing' },
  { id: 'bath', name: 'Ice bath', noun: 'ice baths' },
  { id: 'sauna', name: 'Sauna', noun: 'saunas' },
  { id: 'contrast', name: 'Contrast', noun: 'contrast' }
];
let chartType = store.get('chart', 'breath');
if (!CHARTS.some((c) => c.id === chartType)) chartType = 'breath';

function ofType(h, type) { return h.filter((e) => e.type === type); }
function secondsOf(e) {
  if (e.type === 'breath') return Math.max(0, ...(e.holds || [0]));
  if (e.type === 'contrast') return (e.heat || 0) + (e.cold || 0);
  return e.actual || 0;
}
function sumSeconds(list) {
  return list.reduce((sum, e) => {
    if (e.type === 'breath') return sum + (e.holds || []).reduce((a, b) => a + b, 0);
    if (e.type === 'contrast') return sum + (e.heat || 0) + (e.cold || 0);
    return sum + (e.actual || 0);
  }, 0);
}

function renderHome() {
  const h = store.get('history', []);
  checkBadges(h);
  const holds = holdsOf(h);
  $('stStreak').textContent = String(curStreak(h));
  $('stBest').textContent = holds.length ? fmt(Math.max(...holds)) : '–';
  $('stAw').textContent = String(Object.keys(store.get('badges', {})).length);
}
function renderCounts(h) {
  const cells = [
    ['breath', 'Breathing', ofType(h, 'breath').length],
    ['bath', 'Ice baths', ofType(h, 'bath').length],
    ['sauna', 'Saunas', ofType(h, 'sauna').length],
    ['contrast', 'Contrast', ofType(h, 'contrast').length]
  ];
  $('counts').innerHTML = cells.map(([id, label, n]) =>
    `<div class="count">${IC[id]}<b class="num">${n}</b><small>${label}</small></div>`
  ).join('');
  const cards = [
    ['breath', 'Breathing', false],
    ['bath', 'Ice baths', false],
    ['sauna', 'Sauna', true],
    ['contrast', 'Contrast', true]
  ];
  $('times').innerHTML = cards.map(([id, label, heat]) =>
    `<div class="time${heat ? ' heat' : ''}"><small>${label}</small><b class="num">${totalWords(sumSeconds(ofType(h, id)))}</b></div>`
  ).join('');
}
function renderChart() {
  const h = store.get('history', []);
  const meta = CHARTS.find((c) => c.id === chartType);
  $('chartName').textContent = meta.name;
  $('chartPick').innerHTML = CHARTS.map((c) =>
    `<button type="button" data-chart="${c.id}" aria-pressed="${c.id === chartType}">${c.name}</button>`
  ).join('');
  const rows = ofType(h, chartType).slice(0, 10).reverse();
  const chart = $('chart');
  chart.classList.toggle('heat', chartType === 'sauna' || chartType === 'contrast');
  if (!rows.length) {
    $('chartMax').textContent = '';
    chart.innerHTML = '<p class="empty">Nothing logged for this exercise yet.</p>';
    return;
  }
  const max = Math.max(...rows.map(secondsOf), 1);
  $('chartMax').textContent = chartType === 'breath' ? `Best hold in view ${fmt(max)}` : `Longest in view ${fmt(max)}`;
  chart.innerHTML = rows.map((e) => {
    const sec = secondsOf(e);
    const day = new Date(e.t);
    const label = day.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return `<div class="col" title="${fmt(sec)}"><i style="height:${Math.max(6, sec / max * 100)}%"></i><small>${label}</small></div>`;
  }).join('');
}
$('chartChange').onclick = () => { $('chartPick').hidden = !$('chartPick').hidden; };
$('chartPick').onclick = (event) => {
  const button = event.target.closest('[data-chart]');
  if (!button) return;
  chartType = button.dataset.chart;
  store.set('chart', chartType);
  $('chartPick').hidden = true;
  renderChart();
};

let calCursor = new Date();
function renderCalendar() {
  const h = store.get('history', []);
  const year = calCursor.getFullYear();
  const month = calCursor.getMonth();
  $('calTitle').textContent = calCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const now = new Date();
  $('calNext').disabled = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth());
  const inMonth = h.filter((e) => {
    const d = new Date(e.t);
    return d.getFullYear() === year && d.getMonth() === month;
  });
  $('calTotals').innerHTML = [
    ['Plunges', inMonth.filter((e) => e.type === 'bath').length, false],
    ['Sauna', inMonth.filter((e) => e.type === 'sauna').length, true],
    ['Breathing', inMonth.filter((e) => e.type === 'breath').length, false],
    ['Contrast', inMonth.filter((e) => e.type === 'contrast').length, true]
  ].map(([label, n, heat]) => `<div class="time${heat ? ' heat' : ''}"><small>${label}</small><b class="num">${n}</b></div>`).join('');
  const coldDays = new Set(inMonth.filter(isPl).map((e) => new Date(e.t).getDate()));
  const heatDays = new Set(inMonth.filter(isSa).map((e) => new Date(e.t).getDate()));
  const breathDays = new Set(inMonth.filter((e) => e.type === 'breath').map((e) => new Date(e.t).getDate()));
  const firstDow = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const today = now.getFullYear() === year && now.getMonth() === month ? now.getDate() : 0;
  let html = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => `<span class="dow">${d}</span>`).join('');
  for (let i = 0; i < firstDow; i++) html += '<i style="visibility:hidden"></i>';
  for (let day = 1; day <= days; day++) {
    const c = coldDays.has(day);
    const k = heatDays.has(day);
    const r = breathDays.has(day);
    const cls = (c && k ? 'b' : c ? 'c' : k ? 'h' : r ? 'r' : '') + (day === today ? ' today' : '');
    html += `<i class="${cls}">${day}</i>`;
  }
  $('mCal').innerHTML = html;
  const recent = last30(h);
  $('cal30').textContent = `Last 30 days: ${recent.pl.length} plunge${recent.pl.length === 1 ? '' : 's'} · ${recent.sa.length} sauna${recent.sa.length === 1 ? '' : 's'}.`;
}
$('calPrev').onclick = () => { calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1); renderCalendar(); };
$('calNext').onclick = () => {
  if ($('calNext').disabled) return;
  calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1);
  renderCalendar();
};

const FEEL = ['', 'Drained', 'Flat', 'Good', 'Great', 'Electric'];
function renderHistory() {
  const h = store.get('history', []);
  const ul = $('hList');
  $('hClear').hidden = !h.length && !Object.keys(store.get('badges', {})).length;
  if (!h.length) {
    ul.innerHTML = '<li class="empty" style="border:0;display:block">No sessions yet.</li>';
    return;
  }
  const row = (e, ic, title, sub, right) => `<li><span class="ic">${ic}</span><span class="m"><b>${title}</b><small>${sub}${e.feel ? ` · <span class="feelt">felt ${FEEL[e.feel].toLowerCase()}</span>` : ''}${e.manual ? ' · logged by hand' : ''}</small></span><span class="r">${right}</span><button class="del" type="button" data-del="${e.t}" aria-label="Delete entry">×</button></li>`;
  ul.innerHTML = h.map((e) => {
    const d = new Date(e.t);
    const when = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) + (e.manual ? '' : ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }));
    if (e.type === 'breath') return row(e, IC.breath, `Breathing · ${(e.holds || []).length} round${(e.holds || []).length === 1 ? '' : 's'}`, `${when} · holds ${(e.holds || []).map(fmt).join(', ')}`, fmt(Math.max(0, ...(e.holds || [0]))));
    if (e.type === 'sauna') return row(e, IC.sauna, `Sauna${e.tempF != null ? ' · ' + e.tempF + '°F' : ''}`, when, fmt(e.actual || 0));
    if (e.type === 'contrast') return row(e, IC.contrast, `Contrast · ${e.rounds || 1} round${e.rounds === 1 ? '' : 's'}`, `${when} · ${fmt(e.heat || 0)} hot · ${fmt(e.cold || 0)} cold`, (e.rounds || 1) + '×');
    return row(e, IC.bath, `Ice bath${e.tempF != null ? ' · ' + e.tempF + '°F' : ''}`, when, fmt(e.actual || 0));
  }).join('');
}
$('hList').addEventListener('click', (event) => {
  const button = event.target.closest('.del');
  if (!button) return;
  if (button.classList.contains('armed')) {
    const t = +button.dataset.del;
    store.set('history', store.get('history', []).filter((x) => x.t !== t));
    renderResults();
    return;
  }
  button.classList.add('armed');
  button.textContent = 'Delete';
  setTimeout(() => {
    if (!button.isConnected) return;
    button.classList.remove('armed');
    button.textContent = '×';
  }, 3000);
});

let resultTab = 'chart';
function setTab(tab) {
  resultTab = tab;
  $('resultTabs').querySelectorAll('button').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.tab === tab)));
  $('tabChart').hidden = tab !== 'chart';
  $('tabCal').hidden = tab !== 'cal';
  $('tabBadges').hidden = tab !== 'badges';
}
$('resultTabs').addEventListener('click', (event) => {
  const button = event.target.closest('[data-tab]');
  if (button) setTab(button.dataset.tab);
});
function renderResults() {
  const h = store.get('history', []);
  checkBadges(h);
  renderCounts(h);
  renderChart();
  renderHistory();
  renderCalendar();
  renderBadges();
  $('mShare').hidden = last30(h).rows.length === 0;
  setTab(resultTab);
}

let lastSavedT = 0;
function save(entry) {
  const h = store.get('history', []);
  entry.t = entry.t || Date.now();
  if (!entry.manual) entry.coach = S.g.coach;
  h.unshift(entry);
  h.sort((a, b) => b.t - a.t);
  store.set('history', h.slice(0, 2000));
  if (!entry.manual) lastSavedT = entry.t;
  return checkBadges(h, true);
}

/* manual log */
let lType = 'bath';
const todayISO = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
function syncLog() {
  const contrast = lType === 'contrast';
  const breath = lType === 'breath';
  $('lMinLabel').hidden = contrast;
  $('lTempLabel').hidden = breath;
  $('lContrast').hidden = !contrast;
  $('lColdFLabel').hidden = !contrast;
  $('lTempName').textContent = contrast ? 'Sauna °F' : 'Temp °F';
  $('lMinLabel').firstChild.nodeValue = breath ? 'Best hold (minutes)' : 'Minutes';
  if (!contrast) $('lTemp').value = lType === 'sauna' ? S.s.tempF : S.i.tempF;
  if (contrast) { $('lTemp').value = S.c.hotF; $('lColdF').value = S.c.coldF; }
  $('lType').querySelectorAll('button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.v === lType)));
}
$('hAdd').onclick = () => {
  const form = $('hForm');
  form.hidden = !form.hidden;
  $('hMsg').innerHTML = '';
  if (!form.hidden) {
    $('lDate').value = todayISO();
    $('lDate').max = todayISO();
    syncLog();
  }
};
$('lType').querySelectorAll('button').forEach((button) => {
  button.onclick = () => { lType = button.dataset.v; syncLog(); };
});
$('hForm').onsubmit = (event) => {
  event.preventDefault();
  let t = Date.now();
  const dv = $('lDate').value;
  if (dv && dv !== todayISO()) {
    const [y, mo, d] = dv.split('-').map(Number);
    t = new Date(y, mo - 1, d, 12, 0).getTime();
  }
  let entry;
  if (lType === 'contrast') {
    const hot = parseFloat($('lHot').value) || 0;
    const cold = parseFloat($('lCold').value) || 0;
    if (hot <= 0 && cold <= 0) { $('hMsg').innerHTML = '<p class="fine">Enter the hot or cold minutes.</p>'; return; }
    const heat = Math.round(hot * 60);
    const coldS = Math.round(cold * 60);
    const hotF = parseInt($('lTemp').value, 10);
    const coldF = parseInt($('lColdF').value, 10);
    entry = { type: 'contrast', rounds: 1, heat, cold: coldS, hotF: Number.isNaN(hotF) ? null : hotF, coldF: Number.isNaN(coldF) ? null : coldF, hotMax: heat, coldMax: coldS, manual: true, t };
  } else if (lType === 'breath') {
    const m = parseFloat($('lMin').value);
    if (!(m > 0)) { $('hMsg').innerHTML = '<p class="fine">Enter the length of the hold.</p>'; return; }
    entry = { type: 'breath', holds: [Math.round(m * 60)], pace: 'standard', breaths: 30, manual: true, t };
  } else {
    const m = parseFloat($('lMin').value);
    if (!(m > 0)) { $('hMsg').innerHTML = '<p class="fine">Enter how many minutes the session lasted.</p>'; return; }
    const sec = Math.round(m * 60);
    const tp = parseInt($('lTemp').value, 10);
    entry = { type: lType, planned: sec, actual: sec, tempF: Number.isNaN(tp) ? null : tp, manual: true, t };
  }
  const fresh = save(entry);
  $('hForm').hidden = true;
  renderResults();
  $('hMsg').innerHTML = awardsHTML(fresh) || '<p class="fine">Saved to your log.</p>';
};

$('feelSeg').addEventListener('click', (event) => {
  const button = event.target.closest('[data-f]');
  if (!button || !lastSavedT) return;
  const h = store.get('history', []);
  const item = h.find((x) => x.t === lastSavedT);
  if (!item) return;
  item.feel = +button.dataset.f;
  store.set('history', h);
  $('feelSeg').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === button)));
});
function resetFeel() {
  $('feelSeg').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false'));
}

$('hClear').onclick = (event) => {
  const button = event.currentTarget;
  if (button.dataset.armed) {
    store.set('history', []);
    store.set('badges', {});
    delete button.dataset.armed;
    button.textContent = 'Clear history and awards';
    renderResults();
    renderHome();
    return;
  }
  button.dataset.armed = '1';
  button.textContent = 'Tap again to delete all';
  setTimeout(() => {
    delete button.dataset.armed;
    button.textContent = 'Clear history and awards';
  }, 3000);
};

$('hExport').onclick = () => {
  const blob = new Blob([JSON.stringify(exportBackup(), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'plungetx-backup-' + todayISO() + '.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
};
$('hImport').onclick = () => $('hFile').click();
$('hFile').onchange = async () => {
  const file = $('hFile').files && $('hFile').files[0];
  $('hFile').value = '';
  if (!file) return;
  try {
    const data = normalizeBackup(JSON.parse(await file.text()));
    const prevH = store.get('history', []);
    const prevB = store.get('badges', {});
    const prevS = store.get('settings', {});
    store.set('history', data.history);
    if (data.badges) store.set('badges', data.badges);
    if (data.settings) {
      for (const key of Object.keys(DEF)) S[key] = Object.assign({}, DEF[key], data.settings[key] || {});
      if (!VOICE_IDS.includes(S.g.voice)) S.g.voice = 'harper_32';
      store.set('settings', S);
      document.querySelectorAll('[data-key]').forEach((el) => {
        const value = getK(el.dataset.key);
        if (el.type === 'checkbox') el.checked = !!value;
        else if (el.type === 'range' || el.tagName === 'SELECT') el.value = value;
      });
      refresh();
    }
    checkBadges(store.get('history', []));
    renderResults();
    toast(`Imported ${data.history.length} session${data.history.length === 1 ? '' : 's'}.`, 'Undo', () => {
      store.set('history', prevH);
      store.set('badges', prevB);
      store.set('settings', prevS);
      for (const key of Object.keys(DEF)) S[key] = Object.assign({}, DEF[key], prevS[key] || {});
      refresh();
      renderResults();
    });
  } catch (e) {
    $('hMsg').innerHTML = '<p class="fine">That file could not be read as a PlungeTX backup.</p>';
  }
};

let toastT = 0;
function toast(msg, label, fn) {
  const el = $('toast');
  $('toastTxt').textContent = msg;
  const button = $('toastBtn');
  button.hidden = !label;
  button.textContent = label || '';
  button.onclick = () => { if (fn) fn(); el.hidden = true; };
  el.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { el.hidden = true; }, 9000);
}

/* ---------- share ---------- */
let lastShare = null;
let shareText = '';
let shareURL = '';
let shareFile = null;

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}
function fitText(g, text, x, y, size, weight, family, maxW) {
  let s = size;
  do { g.font = `${weight} ${s}px ${family}`; s -= 2; } while (g.measureText(text).width > maxW && s > 20);
  g.fillText(text, x, y);
}
async function makeCard(card, withMedal = true) {
  try { await document.fonts.ready; } catch (e) {}
  const W = 1080; const H = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const pal = {
    ice: ['#0f4a5a', '#05121a', '#6dd3e0'],
    heat: ['#6a3418', '#140a06', '#f3a25e'],
    breath: ['#1f4b5c', '#05121a', '#e7f5f7'],
    month: ['#173f4e', '#120b08', '#6dd3e0'],
    contrast: ['#173f4e', '#120b08', '#ffd08a'],
    award: ['#3f2c12', '#05121a', '#ffd08a']
  }[card.kind];
  const bg = g.createRadialGradient(W / 2, H * 0.4, 40, W / 2, H * 0.5, H * 0.85);
  bg.addColorStop(0, pal[0]); bg.addColorStop(1, pal[1]);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.strokeStyle = pal[2]; g.lineWidth = 3;
  [250, 350, 450].forEach((r, i) => { g.globalAlpha = 0.14 - i * 0.035; g.beginPath(); g.arc(W / 2, H * 0.42, r, 0, Math.PI * 2); g.stroke(); });
  g.globalAlpha = 1;
  g.textBaseline = 'alphabetic'; g.textAlign = 'left';
  g.font = '700 56px Sora, sans-serif'; g.fillStyle = '#e7f5f7';
  g.fillText('Plunge', 80, 140);
  const w = g.measureText('Plunge').width;
  g.fillStyle = '#6dd3e0'; g.fillText('TX', 80 + w, 140);
  g.textAlign = 'right'; g.font = '500 32px Inter, sans-serif'; g.fillStyle = 'rgba(231,245,247,.6)';
  g.fillText(new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }), W - 80, 136);
  g.textAlign = 'center'; g.fillStyle = pal[2]; g.font = '600 38px Inter, sans-serif';
  try { g.letterSpacing = '8px'; } catch (e) {}
  g.fillText(card.eyebrow.toUpperCase(), W / 2, 390);
  try { g.letterSpacing = '0px'; } catch (e) {}
  if (card.medal && withMedal) {
    const img = await loadImg('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(medal(card.medal)));
    g.drawImage(img, W / 2 - 190, 430, 380, 380);
  } else if (card.medal) {
    g.fillStyle = pal[2]; g.font = '700 300px Sora, sans-serif'; g.fillText('★', W / 2, 740);
  } else {
    g.fillStyle = '#ffffff';
    fitText(g, card.big, W / 2, 650, 240, 700, 'Sora, sans-serif', W - 160);
    g.font = '500 46px Inter, sans-serif'; g.fillStyle = 'rgba(231,245,247,.85)';
    g.fillText(card.unit || '', W / 2, 735);
  }
  g.fillStyle = '#e7f5f7';
  fitText(g, card.title, W / 2, 900, 64, 600, 'Sora, sans-serif', W - 160);
  g.fillStyle = 'rgba(231,245,247,.75)';
  (card.lines || []).forEach((line, i) => fitText(g, line, W / 2, 980 + i * 60, 40, 400, 'Inter, sans-serif', W - 160));
  g.fillStyle = pal[2]; g.font = '600 34px Inter, sans-serif';
  g.fillText('plungetx.com', W / 2, H - 90);
  return canvas.toDataURL('image/png');
}
function smsHref(text) {
  const body = encodeURIComponent(text);
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return ios ? `sms:&body=${body}` : `sms:?body=${body}`;
}
function pngBlob() {
  const bin = atob(shareURL.split(',')[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: 'image/png' });
}
function offerShare() {
  if (!lastShare || !(lastShare.seconds > 0)) lastShare = null;
  $('dShare').hidden = !lastShare;
}
function closeShare() {
  $('share').hidden = true;
  document.body.classList.remove('sharing');
}
async function openShare(card) {
  if (!card || card.seconds === 0) return;
  shareText = card.text + ' #PlungeTX plungetx.com';
  $('shTxt').textContent = shareText;
  $('shSms').href = smsHref(shareText);
  const img = $('shImg');
  img.removeAttribute('src');
  document.body.classList.add('sharing');
  $('share').hidden = false;
  try { shareURL = await makeCard(card); }
  catch (e) { try { shareURL = await makeCard(card, false); } catch (e2) { shareURL = ''; } }
  if (shareURL) img.src = shareURL;
  shareFile = null;
  try { if (shareURL) shareFile = new File([pngBlob()], 'plungetx.png', { type: 'image/png' }); } catch (e) {}
  let canFiles = false;
  try { canFiles = !!(navigator.share && navigator.canShare && shareFile && navigator.canShare({ files: [shareFile] })); } catch (e) {}
  const canText = typeof navigator.share === 'function';
  $('shSend').hidden = !canText;
  $('shSend').classList.toggle('pri', canText);
  $('shHint').textContent = canFiles
    ? 'Tap Send to share the card, or press and hold it to save the picture.'
    : 'Press and hold the card to save it, or send the words.';
}
$('shSend').onclick = () => {
  const payload = { text: shareText };
  if (shareFile && navigator.canShare && navigator.canShare({ files: [shareFile] })) payload.files = [shareFile];
  navigator.share(payload).catch((e) => { if (e && e.name !== 'AbortError') $('shSend').hidden = true; });
};
$('dShare').onclick = () => { if (lastShare && lastShare.seconds > 0) openShare(lastShare); };
$('shClose').onclick = closeShare;
$('mShare').onclick = () => {
  const h = store.get('history', []);
  const { pl, sa } = last30(h);
  const st = curStreak(h);
  const coldMin = Math.round(pl.reduce((s, e) => s + coldSec(e), 0) / 60);
  const heatMin = Math.round(sa.reduce((s, e) => s + heatSec(e), 0) / 60);
  openShare({
    kind: 'month', eyebrow: 'Last 30 days', big: String(pl.length + sa.length), unit: 'hot and cold sessions',
    title: `${pl.length} plunge${pl.length === 1 ? '' : 's'} · ${sa.length} sauna${sa.length === 1 ? '' : 's'}`,
    lines: [`${coldMin} cold min · ${heatMin} sauna min`, st > 1 ? `${st}-day streak` : ''].filter(Boolean),
    text: `My last 30 days: ${pl.length} cold plunge${pl.length === 1 ? '' : 's'} (${coldMin} min) and ${sa.length} sauna session${sa.length === 1 ? '' : 's'} (${heatMin} min)${st > 1 ? `, on a ${st}-day streak` : ''}`
  });
};
function selectTxt() {
  const range = document.createRange();
  range.selectNodeContents($('shTxt'));
  const sel = getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
$('shCopy').onclick = (event) => {
  const button = event.currentTarget;
  const ok = () => { button.textContent = 'Copied'; setTimeout(() => { button.textContent = 'Copy text'; }, 1800); };
  try { navigator.clipboard.writeText(shareText).then(ok, selectTxt); }
  catch (e) { selectTxt(); }
};
$('shSave').onclick = () => {
  if (!shareURL) return;
  const a = document.createElement('a');
  a.href = shareURL;
  a.download = 'plungetx.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
};
document.addEventListener('click', (event) => {
  const award = event.target.closest('[data-award]');
  if (!award) return;
  const badge = BADGES.find((item) => item.id === award.dataset.award);
  if (!badge) return;
  openShare({
    kind: 'award', eyebrow: 'Award unlocked', medal: badge.ic, title: badge.name, lines: [badge.desc],
    text: `Just unlocked the "${badge.name}" award on PlungeTX: ${badge.desc.charAt(0).toLowerCase() + badge.desc.slice(1)}`
  });
});

/* ---------- safety ---------- */
function openSafety(from) {
  $('v-safety').dataset.from = from || '';
  $('safetyBack').hidden = !from;
  show('safety');
}
$('safetyOk').onclick = () => {
  store.set('safetyOk', true);
  show($('v-safety').dataset.from || 'home');
};
$('safetyBack').onclick = () => show($('v-safety').dataset.from || 'settings');

/* ---------- boot ---------- */
function unlockAll() {
  audio.unlock();
  voice.unlock();
}
document.addEventListener('pointerdown', unlockAll, { capture: true, passive: true });
document.addEventListener('keydown', unlockAll, { capture: true });

fillTracks();
bindControls();
refresh();
renderHome();
if (!store.get('safetyOk')) {
  $('v-home').hidden = true;
  $('v-safety').hidden = false;
  $('nav').hidden = true;
  document.body.dataset.view = 'safety';
} else {
  show('home');
}

function warmVoice(name) {
  if (!('serviceWorker' in navigator) || !VOICE_IDS.includes(name)) return;
  const urls = [];
  CLIP_IDS.forEach((id) => urls.push(new URL(`audio/${name}/${id}.mp3`, document.baseURI).href));
  const send = (worker) => { if (worker) worker.postMessage({ type: 'warm', urls }); };
  navigator.serviceWorker.getRegistration().then((reg) => {
    if (reg) send(reg.active || reg.waiting || reg.installing);
  }).catch(() => {});
  navigator.serviceWorker.ready.then((ready) => send(ready.active)).catch(() => {});
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Scope is this directory, whether the site is /app/ or /plungetx-app/.
    const base = new URL(document.baseURI);
    if (!base.pathname.endsWith('/')) base.pathname = base.pathname.replace(/[^/]*$/, '');
    navigator.serviceWorker.register(new URL('sw.js', base).href, { scope: base.href }).then(() => {
      warmVoice(S.g.voice);
    }).catch(() => {});
  });
}
