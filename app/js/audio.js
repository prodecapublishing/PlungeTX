/** Procedural music, gongs, and whooshes, plus the iOS audio unlock. */

const TRACKS = {
  tidal: { name: 'Tidal Pulse', chords: [[45, 52, 60, 67], [41, 48, 57, 64], [48, 55, 64, 71], [43, 50, 59, 67]], len: 8, wave: ['triangle', 'sine'], cut: 1500, water: 0.035, bells: 0.3, pulse: 62 },
  drift: { name: 'Gulf Drift', chords: [[50, 57, 66, 73], [47, 54, 62, 69], [43, 50, 59, 66], [45, 52, 61, 64]], len: 9, wave: ['sine', 'triangle'], cut: 1900, water: 0.05, bells: 0.35 },
  freeze: { name: 'Deep Freeze', chords: [[38, 45, 53, 64], [34, 41, 50, 57], [36, 43, 52, 62]], len: 11, wave: ['sawtooth', 'sine'], cut: 650, wind: 0.08, bells: 0.15 },
  aurora: { name: 'Aurora', chords: [[52, 59, 64, 71, 76], [48, 55, 64, 67, 74], [55, 62, 67, 71, 78], [50, 57, 62, 69, 73]], len: 7, wave: ['sine', 'triangle'], cut: 2800, bells: 0.5 },
  cedar: { name: 'Cedar Room', chords: [[41, 48, 57, 64], [46, 53, 62, 69], [43, 50, 58, 65], [48, 55, 64, 67]], len: 10, wave: ['triangle', 'sine'], cut: 1200, bells: 0.25 },
  still: { name: 'Still Water', chords: [[38, 45, 57], [38, 45, 55]], len: 14, wave: ['sine', 'sine'], cut: 900, water: 0.03, bells: 0.12 }
};

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

function silentWav() {
  const n = 4000;
  const buf = new Uint8Array(44 + n);
  const dv = new DataView(buf.buffer);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i); };
  w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
  dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, 8000, true); dv.setUint32(28, 8000, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true);
  w(36, 'data'); dv.setUint32(40, n, true); buf.fill(128, 44);
  let s = '';
  for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
  return 'data:audio/wav;base64,' + btoa(s);
}

export function createAudio({ musicVol }) {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let fxGain = null;
  let reverb = null;
  let noiseBuf = null;
  let amb = null;
  let prevAmb = null;
  let ducked = false;
  const keep = new Audio(silentWav());
  keep.loop = true;
  keep.preload = 'auto';
  let keeping = false;

  function impulse(sec, decay) {
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * sec);
    const buffer = ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buffer;
  }

  function noise() {
    if (!noiseBuf) {
      const len = ctx.sampleRate * 3;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuf;
  }

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);
    reverb = ctx.createConvolver();
    reverb.buffer = impulse(4.5, 2.4);
    const reverbGain = ctx.createGain();
    reverbGain.gain.value = 0.5;
    reverb.connect(reverbGain);
    reverbGain.connect(master);
    musicGain = ctx.createGain();
    musicGain.gain.value = musicVol();
    musicGain.connect(master);
    fxGain = ctx.createGain();
    fxGain.gain.value = 1;
    fxGain.connect(master);
    return ctx;
  }

  function unlock() {
    const audio = ensure();
    if (audio && audio.state !== 'running') audio.resume();
    if (!audio) return;
    const buffer = audio.createBuffer(1, 1, audio.sampleRate);
    const src = audio.createBufferSource();
    src.buffer = buffer;
    src.connect(audio.destination);
    src.start();
  }

  function applyMusic(vol) {
    if (!musicGain || !ctx) return;
    const now = ctx.currentTime;
    const target = Math.max(0, vol) * (ducked ? 0.35 : 1);
    musicGain.gain.cancelScheduledValues(now);
    musicGain.gain.setTargetAtTime(target, now, 0.2);
  }

  function duck(on) {
    ducked = !!on;
    applyMusic(musicVol());
  }

  function keepAlive(on) {
    keeping = !!on;
    if (on) {
      const pending = keep.play();
      if (pending && pending.catch) pending.catch(() => {});
    } else {
      keep.pause();
    }
  }

  function suspend() {
    if (ctx && ctx.state === 'running') ctx.suspend();
  }

  function resume() {
    if (ctx && ctx.state !== 'running') ctx.resume();
    if (keeping) {
      const pending = keep.play();
      if (pending && pending.catch) pending.catch(() => {});
    }
  }

  class Ambient {
    constructor(key) {
      this.t = TRACKS[key] || TRACKS.drift;
      this.timers = [];
      this.nodes = [];
      this.i = 0;
    }
    start(fade = 3) {
      const t = this.t;
      const now = ctx.currentTime;
      this.out = ctx.createGain();
      this.out.gain.setValueAtTime(0.0001, now);
      this.out.gain.exponentialRampToValueAtTime(0.9, now + fade);
      this.out.connect(musicGain);
      const send = ctx.createGain();
      send.gain.value = 0.7;
      this.out.connect(send);
      send.connect(reverb);
      this.nodes.push(send);
      this.filt = ctx.createBiquadFilter();
      this.filt.type = 'lowpass';
      this.filt.frequency.value = t.cut;
      this.filt.Q.value = 0.5;
      this.filt.connect(this.out);
      if (t.water || t.wind) this.texture();
      this.chord();
      this.timers.push(setInterval(() => this.chord(), t.len * 1000));
      if (t.bells) this.timers.push(setInterval(() => { if (Math.random() < t.bells) this.bell(); }, 2300));
      if (t.pulse) this.timers.push(setInterval(() => this.thump(), 60000 / t.pulse));
      return this;
    }
    live() { return ctx && ctx.state === 'running'; }
    chord() {
      if (!this.live()) return;
      const t = this.t;
      const chord = t.chords[this.i++ % t.chords.length];
      const now = ctx.currentTime;
      const length = t.len;
      const attack = length * 0.35;
      const release = length * 0.6;
      chord.forEach((midi) => t.wave.forEach((wave, j) => {
        const osc = ctx.createOscillator();
        osc.type = wave;
        osc.frequency.value = mtof(midi);
        osc.detune.value = (j ? 7 : -5) + Math.random() * 4 - 2;
        const gain = ctx.createGain();
        const peak = (wave === 'sawtooth' ? 0.03 : 0.07) / (chord.length * 0.6);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(peak, now + attack);
        gain.gain.setValueAtTime(peak, now + length);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + length + release);
        osc.connect(gain);
        gain.connect(this.filt);
        osc.start(now);
        osc.stop(now + length + release + 0.1);
      }));
    }
    bell() {
      if (!this.live()) return;
      const chords = this.t.chords;
      const chord = chords[(this.i + chords.length - 1) % chords.length];
      const midi = chord[Math.floor(Math.random() * chord.length)] + 12 * (1 + Math.floor(Math.random() * 2));
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = mtof(midi);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.035, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 3.5);
      osc.connect(gain);
      gain.connect(this.out);
      osc.start(now);
      osc.stop(now + 3.6);
    }
    thump() {
      if (!this.live()) return;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(95, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.25);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.2, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      osc.connect(gain);
      gain.connect(this.out);
      osc.start(now);
      osc.stop(now + 0.55);
    }
    texture() {
      const t = this.t;
      const amount = t.water || t.wind;
      const src = ctx.createBufferSource();
      src.buffer = noise();
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = t.wind ? 'bandpass' : 'lowpass';
      filter.frequency.value = t.wind ? 520 : 850;
      filter.Q.value = t.wind ? 0.8 : 0.3;
      const gain = ctx.createGain();
      gain.gain.value = amount;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = amount * 0.8;
      lfo.connect(lfoGain);
      lfoGain.connect(gain.gain);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.out);
      src.start();
      lfo.start();
      this.nodes.push(src, lfo);
    }
    stop(fade = 2) {
      this.timers.forEach(clearInterval);
      this.timers = [];
      if (!this.out || !ctx) return;
      const now = ctx.currentTime;
      const out = this.out;
      const nodes = this.nodes;
      try {
        out.gain.cancelScheduledValues(now);
        out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), now);
        out.gain.exponentialRampToValueAtTime(0.0001, now + fade);
      } catch (e) {}
      setTimeout(() => {
        nodes.forEach((node) => { try { if (node.stop) node.stop(); } catch (e) {} });
        try { out.disconnect(); } catch (e) {}
      }, fade * 1000 + 300);
    }
  }

  function playTrack(key, fade = 4) {
    if (amb) { amb.stop(fade); amb = null; }
    if (key && ensure()) amb = new Ambient(key).start(fade);
  }

  function preview(key) {
    stopPreview();
    if (!key || !ensure()) return null;
    prevAmb = new Ambient(key).start(1.5);
    return prevAmb;
  }

  function stopPreview() {
    if (prevAmb) { prevAmb.stop(1); prevAmb = null; }
  }

  function whoosh(dur, up) {
    if (!ctx) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise();
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.1;
    filter.frequency.setValueAtTime(up ? 380 : 1300, now);
    filter.frequency.exponentialRampToValueAtTime(up ? 1400 : 340, now + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(up ? 0.22 : 0.16, now + dur * (up ? 0.7 : 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(fxGain);
    src.start(now, Math.random() * 1.5);
    src.stop(now + dur + 0.05);
  }

  function gong(base = 55, vol = 0.12) {
    if (!ensure()) return;
    const now = ctx.currentTime;
    [1, 2.76, 5.4].forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = mtof(base) * ratio;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(vol / (i + 1), now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 4 - i);
      osc.connect(gain);
      gain.connect(fxGain);
      gain.connect(reverb);
      osc.start(now);
      osc.stop(now + 4.1);
    });
  }

  function buzz(pattern) {
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
  }

  return {
    tracks: TRACKS,
    ensure,
    unlock,
    duck,
    applyMusic,
    keepAlive,
    suspend,
    resume,
    playTrack,
    preview,
    stopPreview,
    whoosh,
    gong,
    buzz
  };
}
