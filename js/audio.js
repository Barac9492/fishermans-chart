/* ============================================================
   Procedural soundscape for The Fisherman's Chart.
   Everything is synthesized with the Web Audio API — wind, lake-lap,
   gulls, footsteps, a fire's crackle, a rooster, a wind-rush for
   Pentecost, and the horns of the finale. No audio files are shipped.
   ============================================================ */

let ctx = null;
let master = null;   // final gain — mute lives here
let ambience = null; // continuous layers, ducked while a card is open
let sfx = null;      // one-shots
let noiseBuf = null; // one shared white-noise buffer for every noise voice

let waterDistGain = null; // lake-lap loudness by distance to the shoreline
let fireDistGain = null;  // crackle loudness by distance to the nearest fire
let muted = false;
let ducked = false;
let gullTimer = 8;
let crackleTimer = 3;

function makeNoise(seconds) {
  const buf = ctx.createBuffer(1, (ctx.sampleRate * seconds) | 0, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// a source over the shared noise buffer — looped for ambience, one-shot for FX
function noiseSource(loop = false) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = loop;
  return src;
}

// slow oscillator wired into an AudioParam — the breath in the ambience
function lfo(freq, depth, param) {
  const o = ctx.createOscillator();
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.value = depth;
  o.connect(g).connect(param);
  o.start();
}

function startAmbience() {
  // wind: filtered noise that swells and dies like weather, always on
  const wind = noiseSource(true);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 340;
  const wg = ctx.createGain();
  wg.gain.value = 0.04;
  wind.connect(lp).connect(wg).connect(ambience);
  wind.start(0, Math.random());
  lfo(0.07, 120, lp.frequency);
  lfo(0.19, 0.016, wg.gain);

  // lake-lap: a soft band of wash that rises as the walker nears the water
  const water = noiseSource(true);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 520;
  bp.Q.value = 0.7;
  const swell = ctx.createGain(); // the rhythm of the shore
  swell.gain.value = 0.55;
  lfo(0.09, 0.3, swell.gain);
  waterDistGain = ctx.createGain(); // the distance
  waterDistGain.gain.value = 0;
  water.connect(bp).connect(swell).connect(waterDistGain).connect(ambience);
  water.start(0, 0.7 + Math.random());

  // fire crackle: a hissing high band plus irregular pops, gated by distance
  const hiss = noiseSource(true);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 2200;
  const hg = ctx.createGain();
  hg.gain.value = 0.35;
  fireDistGain = ctx.createGain();
  fireDistGain.gain.value = 0;
  hiss.connect(hp).connect(hg).connect(fireDistGain).connect(ambience);
  hiss.start(0, 0.2 + Math.random());
}

// a single ember-pop inside a nearby fire
function firePop() {
  if (!fireDistGain || fireDistGain.gain.value < 0.02) return;
  const t0 = ctx.currentTime;
  const src = noiseSource();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 900 + Math.random() * 900;
  bp.Q.value = 3;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.12 * fireDistGain.gain.value / 0.4, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
  src.connect(bp).connect(g).connect(ambience);
  src.start(t0, Math.random(), 0.12);
}

// a struck bell: inharmonic partials with exponential decays
function bell(f, gain, dest, when = 0) {
  const t0 = ctx.currentTime + when;
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(dest);
  for (const [mult, amp] of [[1, 1], [2.42, 0.45], [3.01, 0.3], [4.27, 0.16]]) {
    const o = ctx.createOscillator();
    o.frequency.value = f * mult;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(amp, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.4 / mult);
    o.connect(g).connect(out);
    o.start(t0);
    o.stop(t0 + 2.6);
  }
}

// a gull: a cluster of fast downward cries
function gullCry(gain) {
  const t0 = ctx.currentTime;
  const n = 2 + ((Math.random() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const s = t0 + i * (0.2 + Math.random() * 0.14);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(1100 + Math.random() * 300, s);
    o.frequency.exponentialRampToValueAtTime(620 + Math.random() * 120, s + 0.17);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 1500;
    f.Q.value = 1.3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(gain, s + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, s + 0.2);
    o.connect(f).connect(g).connect(ambience);
    o.start(s);
    o.stop(s + 0.24);
  }
}

// a rooster: two or three rough, falling crows
function roosterCrow(gain = 0.14) {
  const t0 = ctx.currentTime;
  const notes = [1, 0.72, 0.9].slice(0, 2 + ((Math.random() * 2) | 0));
  let s = t0;
  for (const rel of notes) {
    const dur = 0.32 + Math.random() * 0.1;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(340 * rel, s);
    o.frequency.exponentialRampToValueAtTime(520 * rel, s + dur * 0.35);
    o.frequency.exponentialRampToValueAtTime(210 * rel, s + dur);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(gain, s + 0.03);
    g.gain.setValueAtTime(gain, s + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
    o.connect(f).connect(g).connect(sfx);
    o.start(s);
    o.stop(s + dur + 0.05);
    s += dur + 0.12 + Math.random() * 0.1;
  }
}

// one footfall: a short noise tick, boomier on planks than on ground
function step(wood) {
  const t0 = ctx.currentTime;
  const src = noiseSource();
  src.playbackRate.value = 0.85 + Math.random() * 0.3;
  const f = ctx.createBiquadFilter();
  if (wood) {
    f.type = 'bandpass';
    f.frequency.value = 230 + Math.random() * 70;
    f.Q.value = 1.2;
  } else {
    f.type = 'highpass';
    f.frequency.value = 1400;
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime((wood ? 0.17 : 0.05) * (0.8 + Math.random() * 0.4), t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + (wood ? 0.09 : 0.055));
  src.connect(f).connect(g).connect(sfx);
  src.start(t0, Math.random() * 1.5, 0.12);
}

// a rushing, mighty wind — Pentecost
function windRush(gain = 0.3) {
  const t0 = ctx.currentTime;
  const src = noiseSource();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(180, t0);
  bp.frequency.linearRampToValueAtTime(900, t0 + 1.1);
  bp.frequency.linearRampToValueAtTime(260, t0 + 2.6);
  bp.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.5);
  g.gain.setValueAtTime(gain, t0 + 1.8);
  g.gain.linearRampToValueAtTime(0, t0 + 2.8);
  src.connect(bp).connect(g).connect(sfx);
  src.start(t0, Math.random(), 3.0);
}

// a distant horn — a ship's or the finale's
function horn(freq, gain, when, dur) {
  const t0 = ctx.currentTime + when;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0, t0);
  out.gain.linearRampToValueAtTime(gain, t0 + 0.5);
  out.gain.setValueAtTime(gain, t0 + dur - 0.7);
  out.gain.linearRampToValueAtTime(0, t0 + dur);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 340;
  lp.connect(out).connect(sfx);
  for (const [type, mult, amp] of [['sawtooth', 1, 0.45], ['sine', 1, 0.6], ['sine', 2.01, 0.12]]) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq * mult;
    const g = ctx.createGain();
    g.gain.value = amp;
    o.connect(g).connect(lp);
    o.start(t0);
    o.stop(t0 + dur + 0.1);
  }
}

// the soft riffle of paper as a card opens
function pageTurn() {
  const t0 = ctx.currentTime;
  const src = noiseSource();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(700, t0);
  bp.frequency.exponentialRampToValueAtTime(2300, t0 + 0.2);
  bp.Q.value = 1.6;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.045, t0 + 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.26);
  src.connect(bp).connect(g).connect(sfx);
  src.start(t0, Math.random(), 0.3);
}

export const audio = {
  init() {
    if (ctx) {
      ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp).connect(ctx.destination);
    ambience = ctx.createGain();
    ambience.connect(master);
    sfx = ctx.createGain();
    sfx.connect(master);
    noiseBuf = makeNoise(2);
    startAmbience();
    ctx.resume();
    document.addEventListener('visibilitychange', () => {
      if (!ctx) return;
      if (document.hidden) ctx.suspend();
      else ctx.resume();
    });
    // iOS sometimes re-suspends; any later touch wakes it again
    window.addEventListener('pointerdown', () => {
      if (ctx && ctx.state === 'suspended') ctx.resume();
    });
  },

  // dt in seconds; o = { px, pz, shore, fireDist, ducked }
  update(dt, o) {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;

    const shoreK = Math.max(0, Math.min(1, 1 - o.shore / 30));
    waterDistGain.gain.setTargetAtTime(0.012 + shoreK * 0.1, t, 0.4);

    const fireK = Math.max(0, Math.min(1, 1 - (o.fireDist ?? 999) / 22));
    fireDistGain.gain.setTargetAtTime(fireK * 0.4, t, 0.35);

    if (o.ducked !== ducked) {
      ducked = o.ducked;
      ambience.gain.setTargetAtTime(ducked ? 0.35 : 1, t, 0.3);
    }

    crackleTimer -= dt;
    if (crackleTimer <= 0) {
      crackleTimer = 0.12 + Math.random() * 0.22;
      if (Math.random() < fireK * 0.9) firePop();
    }

    gullTimer -= dt;
    if (gullTimer <= 0) {
      gullTimer = 7 + Math.random() * 10;
      if (Math.random() < 0.5) gullCry(0.04);
    }
  },

  play(name, opts = {}) {
    if (!ctx || ctx.state !== 'running') return;
    switch (name) {
      case 'step': step(false); break;
      case 'stepWood': step(true); break;
      case 'chime': // a place is remembered
        bell(494, 0.16, sfx);
        bell(741, 0.07, sfx, 0.13);
        break;
      case 'bell': bell(330, 0.1, sfx); break;
      case 'pageTurn': pageTurn(); break;
      case 'horn': horn(opts.freq ?? 98, opts.gain ?? 0.35, opts.when ?? 0, opts.dur ?? 2.4); break;
      case 'gull': gullCry(0.05); break;
      case 'rooster': roosterCrow(opts.gain ?? 0.14); break;
      case 'windRush': windRush(opts.gain ?? 0.3); break;
    }
  },

  setMuted(b) {
    muted = b;
    if (ctx) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
  },
  get muted() { return muted; },
};
