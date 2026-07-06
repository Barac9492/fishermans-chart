/* ============================================================
   Procedural soundscape for The Fisherman's Chart.
   Everything is synthesized with the Web Audio API — wind, lake-lap,
   gulls, footsteps, a fire's crackle, a rooster, a wind-rush for
   Pentecost, the horns of the finale — and a leitmotif score that
   follows the story's regions and turns. No audio files are shipped.
   ============================================================ */

let ctx = null;
let master = null;   // final gain — mute lives here
let ambience = null; // continuous layers, ducked while a card is open
let sfx = null;      // one-shots
let noiseBuf = null; // one shared white-noise buffer for every noise voice

let waterDistGain = null; // lake-lap loudness by distance to the shoreline
let fireDistGain = null;  // crackle loudness by distance to the nearest fire
let music = null;     // 주제곡 버스 — 모드 크로스페이드가 사는 곳
let musicDuck = null; // 카드가 열리면 음악도 한 걸음 물러선다 (모드 페이드와 곱)
let muted = false;
let ducked = false;
let gullTimer = 8;
let crackleTimer = 3;
let musicMode = 'off'; // 지역과 서사가 정해 주는 음악의 색
let musicTimer = 6;    // 다음 소절까지 남은 침묵

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

// 화음 패드: 살짝 어긋난 사인파 쌍들이 느리게 맥놀이하는 조용한 드론.
// 겉 게인(반환값)은 시간대 크로스페이드용, 속 게인은 스스로 숨쉬는 몫.
function chordPad(freqs) {
  const outer = ctx.createGain();
  outer.gain.value = 0;
  const breath = ctx.createGain();
  breath.gain.value = 0.8;
  lfo(0.045, 0.16, breath.gain);
  const warmthLp = ctx.createBiquadFilter(); // 고역을 눌러 오르간 티를 빼고 아련하게
  warmthLp.type = 'lowpass';
  warmthLp.frequency.value = 900;
  for (const f of freqs) {
    for (const det of [-0.6, 0.6]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f + det;
      const g = ctx.createGain();
      g.gain.value = 0.42 / freqs.length;
      o.connect(g).connect(warmthLp);
      o.start();
    }
  }
  warmthLp.connect(breath).connect(outer).connect(ambience);
  return outer;
}
let padDay = null;   // 갈릴리의 낮 — 따뜻한 열린 5도 (D–A–D)
let padNight = null; // 예루살렘의 밤 — 낮게 가라앉은 단조 빛깔 (A–E–C)

/* ---------------- 주제곡: 베드로의 라이트모티프 ----------------
   하나의 "부름" 주제가 지역과 서사를 따라 색을 바꾼다. 갈릴리에선 장조로
   드문드문, 예루살렘에선 낮은 단조로, 부인 뒤에는 거의 침묵(슬픔은 부재),
   회복 뒤에는 한 옥타브 위에서 돌아온다. 파일 없이 전부 신스. */

const ROOT = 293.66; // D4 — 패드(D–A–D)와 같은 뿌리
const SCALES = {
  maj: [0, 2, 4, 7, 9, 12, 14, 16],   // 장조 펜타토닉 확장
  min: [0, 3, 5, 7, 10, 12, 15, 17],  // 단조 펜타토닉 확장
};
// 베드로 주제: "부름" — 도약해 오르고, 되묻듯 내려온다. [음계 인덱스, 박]
const THEME_A = [[0, 1], [2, 1], [4, 2], [3, 1], [2, 1], [0, 3]];
const THEME_B = [[4, 1], [5, 1], [7, 2], [5, 1], [4, 1], [2, 3]]; // 응답구 (dawn/finale)
const LAMENT = [[5, 2], [4, 2], [2, 2], [0, 5]];                  // 애가: 느린 하강

// 모드별 목표 게인과, 소절 사이 침묵의 길이 [최소, 최대] (초)
const MODE_GAIN = { galilee: 0.055, road: 0.04, jerusalem: 0.045, lament: 0.04, dawn: 0.075, finale: 0.11, silent: 0, off: 0 };
const MODE_REST = { galilee: [14, 26], road: [26, 45], jerusalem: [20, 35], lament: [45, 75], dawn: [10, 20], finale: [2, 4] };

function degToFreq(scale, deg, octShift) {
  return ROOT * 2 ** (SCALES[scale][deg] / 12) * 2 ** octShift;
}

// "숨결" 리드: 사인파가 천천히 부풀었다 스러지고, 어택이 끝난 뒤에야 비브라토가 깨어난다
function breathNote(freq, gain, when, dur, dest = musicDuck) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = freq;
  const vib = ctx.createOscillator(); // 5Hz, ±4센트의 미세한 떨림
  vib.frequency.value = 5;
  const vd = ctx.createGain();
  vd.gain.setValueAtTime(0, when);
  vd.gain.linearRampToValueAtTime(freq * 0.0023, when + 0.5);
  vib.connect(vd).connect(o.frequency);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1600;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, when);
  g.gain.linearRampToValueAtTime(gain, when + 0.15);
  g.gain.setValueAtTime(gain, when + dur);
  g.gain.linearRampToValueAtTime(0, when + dur + 0.4);
  o.connect(lp).connect(g).connect(dest);
  o.start(when);
  o.stop(when + dur + 0.45);
  vib.start(when);
  vib.stop(when + dur + 0.45);
}

// 수금 한 줄을 뜯는 소리: 즉시 일어나 1.6초에 걸쳐 잦아든다
function pluckNote(freq, gain, when, dest = musicDuck) {
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = freq;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1200;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 1.6);
  o.connect(lp).connect(g).connect(dest);
  o.start(when);
  o.stop(when + 1.65);
}

// 소절 한 줄을 절대시각으로 통째 예약한다 (프레임별 예약 금지).
// voices: 'breath' | 'pluck' | 'both' | 'ends'(숨결 리드에 처음·끝 음만 수금 더블링)
// 반환값은 소절의 길이(초).
function scheduleLine(notes, scale, oct, when, beat, gMul, voices, dest = musicDuck) {
  let tt = when;
  notes.forEach(([deg, beats], i) => {
    const f = degToFreq(scale, deg, oct);
    const at = tt + (Math.random() - 0.5) * 0.04;        // ±0.02s의 사람 손 떨림
    const gj = gMul * (0.9 + Math.random() * 0.2);       // ±10% 게인 흔들림
    if (voices !== 'pluck') breathNote(f, 0.9 * gj, at, beats * beat * 0.9, dest);
    const endPluck = voices === 'ends' && (i === 0 || i === notes.length - 1);
    if (voices === 'pluck' || voices === 'both' || endPluck) pluckNote(f, 0.5 * gj, at, dest);
    tt += beats * beat;
  });
  return tt - when;
}

// 모드에 맞는 소절 하나를 예약하고 그 길이(초)를 돌려준다
function schedulePhrase(mode) {
  const t0 = ctx.currentTime + 0.08;
  const BEAT = 0.62;
  if (mode === 'galilee') return scheduleLine(THEME_A, 'maj', 0, t0, BEAT, 1, 'ends');
  if (mode === 'road') return scheduleLine(THEME_A.slice(0, 3), 'maj', 0, t0, BEAT, 1, 'pluck'); // 주제의 파편만
  if (mode === 'jerusalem') return scheduleLine(THEME_A, 'min', -1, t0, BEAT, 0.8, 'breath');
  if (mode === 'lament') return scheduleLine(LAMENT, 'min', 0, t0, 1.0, 1, 'breath'); // 홀로, 느리게 하강
  if (mode === 'dawn') { // 주제가 한 옥타브 위에서 돌아오고, 두 박 뒤 응답구가 겹친다
    const a = scheduleLine(THEME_A, 'maj', 1, t0, BEAT, 1, 'breath');
    const b = 2 * BEAT + scheduleLine(THEME_B, 'maj', 0, t0 + 2 * BEAT, BEAT, 1, 'pluck');
    return Math.max(a, b);
  }
  if (mode === 'finale') { // 주제 전체 진술: 부름과 응답이 잇달아, 모든 목소리로
    const a = scheduleLine(THEME_A, 'maj', 0, t0, BEAT, 1.2, 'both');
    return a + scheduleLine(THEME_B, 'maj', 1, t0 + a, BEAT, 1.2, 'both');
  }
  return 0;
}

function startAmbience() {
  // 바람: 로우패스 두 장을 겹쳐(24dB/oct) 히스를 걷어낸 낮은 웅웅거림.
  // 일정한 소리가 아니라, 돌풍처럼 부풀었다 잦아든다.
  const wind = noiseSource(true);
  const lp1 = ctx.createBiquadFilter();
  lp1.type = 'lowpass';
  lp1.frequency.value = 320;
  const lp2 = ctx.createBiquadFilter();
  lp2.type = 'lowpass';
  lp2.frequency.value = 230;
  const wg = ctx.createGain();
  wg.gain.value = 0.055;
  wind.connect(lp1).connect(lp2).connect(wg).connect(ambience);
  wind.start(0, Math.random());
  lfo(0.06, 80, lp2.frequency);   // 바람결의 색이 천천히 변하고
  lfo(0.05, 0.032, wg.gain);      // 돌풍처럼 크게 숨쉰다

  // 물결: 좁힌 대역(250–900Hz) + 파도 주기의 깊은 출렁임 — 히스가 아니라 철썩임
  const water = noiseSource(true);
  const whp = ctx.createBiquadFilter();
  whp.type = 'highpass';
  whp.frequency.value = 250;
  const wlp = ctx.createBiquadFilter();
  wlp.type = 'lowpass';
  wlp.frequency.value = 900;
  const swell = ctx.createGain();
  swell.gain.value = 0.34;
  lfo(0.13, 0.26, swell.gain);    // 파도 한 번의 호흡
  lfo(0.031, 0.12, swell.gain);   // 먼 너울
  waterDistGain = ctx.createGain();
  waterDistGain.gain.value = 0;
  water.connect(whp).connect(wlp).connect(swell).connect(waterDistGain).connect(ambience);
  water.start(0, 0.7 + Math.random());

  // 모닥불: 상시 고역 히스는 낮게 깔기만 하고, 소리의 몸은 불규칙한 탁탁(pop)이 맡는다
  const hiss = noiseSource(true);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3200;
  const hg = ctx.createGain();
  hg.gain.value = 0.09;
  lfo(0.9, 0.04, hg.gain); // 불길이 일렁이는 만큼만
  fireDistGain = ctx.createGain();
  fireDistGain.gain.value = 0;
  hiss.connect(hp).connect(hg).connect(fireDistGain).connect(ambience);
  hiss.start(0, 0.2 + Math.random());

  // 배경 화음: 지역의 시간을 따라 낮 화음과 밤 화음이 서로 자리를 내어 준다
  padDay = chordPad([146.83, 220, 293.66]);  // D3 · A3 · D4
  padNight = chordPad([110, 164.81, 261.63]); // A2 · E3 · C4
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
  g.gain.setValueAtTime((wood ? 0.11 : 0.045) * (0.8 + Math.random() * 0.4), t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + (wood ? 0.09 : 0.055));
  src.connect(f).connect(g).connect(sfx);
  src.start(t0, Math.random() * 1.5, 0.12);
}

// 양 울음: 떨리는 매애 — 잃은 양이 근처에서 부른다
function bleat(gain = 0.15) {
  const t0 = ctx.currentTime;
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(560, t0);
  o.frequency.exponentialRampToValueAtTime(420, t0 + 0.34);
  const vib = ctx.createOscillator();
  vib.frequency.value = 22;
  const vg = ctx.createGain();
  vg.gain.value = 26;
  vib.connect(vg).connect(o.frequency);
  vib.start(t0);
  vib.stop(t0 + 0.42);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 820;
  f.Q.value = 1.1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.04);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.42);
  o.connect(f).connect(g).connect(sfx);
  o.start(t0);
  o.stop(t0 + 0.46);
}

// 물보라: 그물이 수면을 치는 소리
function splash(gain = 0.3) {
  const t0 = ctx.currentTime;
  const src = noiseSource();
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(420, t0);
  bp.frequency.exponentialRampToValueAtTime(950, t0 + 0.22);
  bp.Q.value = 0.9;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
  src.connect(bp).connect(g).connect(sfx);
  src.start(t0, Math.random(), 0.55);
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
    // 주제곡 버스: 보이스 → musicDuck(덕킹) → music(모드 레벨) → master — 두 페이드가 곱이 된다
    music = ctx.createGain();
    music.gain.value = 0;
    music.connect(master);
    musicDuck = ctx.createGain();
    musicDuck.connect(music);
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

  // dt in seconds; o = { px, pz, shore, fireDist, warmth, ducked, music }
  update(dt, o) {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;

    const shoreK = Math.max(0, Math.min(1, 1 - o.shore / 30));
    waterDistGain.gain.setTargetAtTime(0.01 + shoreK * 0.085, t, 0.4);

    const fireK = Math.max(0, Math.min(1, 1 - (o.fireDist ?? 999) / 22));
    fireDistGain.gain.setTargetAtTime(fireK * 0.4, t, 0.35);

    // 배경 화음: 하늘과 같은 곡선으로 낮·밤 패드를 섞는다 (길 위의 어스름엔 둘 다 잦아든다)
    const w = o.warmth ?? 0.5;
    const dayK = Math.max(0, Math.min(1, (w - 0.35) / 0.4));
    const nightK = Math.max(0, Math.min(1, (0.4 - w) / 0.3));
    if (padDay) padDay.gain.setTargetAtTime(0.05 * dayK, t, 1.2);
    if (padNight) padNight.gain.setTargetAtTime(0.045 * nightK, t, 1.2);

    if (o.ducked !== ducked) {
      ducked = o.ducked;
      ambience.gain.setTargetAtTime(ducked ? 0.35 : 1, t, 0.3);
      musicDuck.gain.setTargetAtTime(ducked ? 0.3 : 1, t, 0.4);
    }

    // 주제곡: 서사가 정한 모드로 천천히 건너가고, 침묵이 다하면 소절 하나를 통째로 예약한다
    if (o.music && o.music !== musicMode) {
      musicMode = o.music;
      music.gain.setTargetAtTime(MODE_GAIN[musicMode] ?? 0, t, 2.0);
      musicTimer = Math.min(musicTimer, 3 + Math.random() * 3);
    }
    musicTimer -= dt;
    if (musicTimer <= 0) {
      if ((MODE_GAIN[musicMode] ?? 0) > 0) {
        const len = schedulePhrase(musicMode);
        const [rMin, rMax] = MODE_REST[musicMode];
        musicTimer = len + rMin + Math.random() * (rMax - rMin);
      } else {
        musicTimer = 2; // 침묵 속에서도 가끔 깨어나 때를 살핀다
      }
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
    if (name === 'themeCall' && ctx && ctx.state === 'suspended' && !opts.retried) {
      // 시작 클릭 직후엔 컨텍스트가 아직 깨어나는 중일 수 있다 — 깨어난 뒤 한 번만 다시 부른다
      ctx.resume().then(() => this.play('themeCall', { retried: true }));
      return;
    }
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
      case 'splash': splash(opts.gain ?? 0.3); break;
      case 'bleat': bleat(opts.gain ?? 0.15); break;
      case 'themeCall': { // 출항의 부름 — 시작의 문턱에서 주제가 한 번 지나간다
        // 모드 버스의 자동화를 건드리지 않도록, 제 몫의 일회용 게인으로 마스터에 직접 닿는다
        const t0 = ctx.currentTime;
        const g = ctx.createGain();
        g.gain.value = 0.09;
        g.connect(master);
        const len = scheduleLine(THEME_A, 'maj', 0, t0 + 0.05, 0.62, 1, 'breath', g);
        setTimeout(() => g.disconnect(), (len + 3) * 1000);
        break;
      }
    }
  },

  setMuted(b) {
    muted = b;
    if (ctx) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.05);
  },
  get muted() { return muted; },
};
