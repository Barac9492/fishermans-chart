import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { Water } from 'three/addons/objects/Water.js';
import { SITES, EPILOGUE } from './sites.js';
import { audio } from './audio.js';

/* ============================================================
   The Fisherman's Chart — Galilee, Jerusalem, and Rome
   A walkable chart of the true places of Simon Peter's life.
   North is -z. Two landmasses: the Holy Land, and (far to the
   west, across open water) Rome, reached only by a scripted crossing.
   ============================================================ */

const COLORS = {
  land: 0xcdbb8e,
  landSide: 0x9c8a63,
  romeLand: 0xc9b98f,
  romeLandSide: 0x998a66,
  basalt: 0x2e2c2a,
  basaltLight: 0x3d3a36,
  limestone: 0xe4d9b8,
  limestoneShadow: 0xcabb92,
  ink: 0x2b2620,
  red: 0xa8341f,
  gold: 0xb8902e,
  goldBright: 0xd4af37,
  sea: 0x4f7a85,
  lake: 0x5a9088,
  road: 0xb7a077,
  wood: 0x7a5c3e,
  woodDark: 0x5a4128,
  robe: 0x8a7050,
  cloak: 0x5b6e6a,
  mantle: 0x6b7e78,
  cross: 0x2a2420,
};

// ---- landmasses (world units; north is -z) ----
const MAIN_LAND = [
  [-25, -205], [25, -205], [50, -190], [58, -160],
  [58, -60], [58, 40], [58, 95], [52, 135], [35, 155],
  [0, 163], [-35, 155], [-52, 135], [-58, 95],
  [-58, 40], [-58, -60], [-58, -160], [-50, -190], [-25, -205],
];

// The Sea of Galilee: an inland lake, cut as a hole in the Holy Land shape.
const LAKE = [
  [0, -154], [16, -150], [25, -138], [26, -122], [16, -108],
  [0, -104], [-16, -108], [-26, -122], [-25, -138], [-16, -150],
];
const LAKE_BOUNDS = { x0: -27, x1: 27, z0: -155, z1: -103 };

// Rome, far across the water — reached only by the scripted crossing.
const ROME_LAND = [
  [-260, 60], [-215, 55], [-198, 80], [-205, 115],
  [-228, 133], [-255, 120], [-265, 90],
];

// Short walkable corridors over water that are not part of either landmass:
// a dock out to the night-fishing boat, and the strip of lake Peter is
// given to walk across when he is called out onto it.
const WALK_LINES = [
  // 폭은 실제 널빤지 폭(pier(-22, -111, -6, -118, 2.2)의 2.2)에 살짝만 여유를 둔다 —
  // 예전엔 6.5였는데, 널빤지 밖 물 위까지 걸을 수 있어서 "물 위를 걷는" 것처럼 보였다.
  { a: [-24, -110], b: [-6, -118], width: 2.6 },   // Capernaum dock (site 9)
];
// 물 위 걷기(3번): 배에서 내린 뒤에만 열리는 빛의 길. 배를 타고 나가야 밟을 수 있다.
const WW_BOARD = { x: -24, z: -116 };   // 배에 오르는 물가
const WW_DROP = { x: -9, z: -128 };     // 배가 멈추는 지점 (물 위 걷기 시작)
const WW_MARKER = { x: 2, z: -128 };    // 3번 표지 (물 한가운데)
let waterWalkPath = null;               // { a:[x,z], b:[x,z], width } — 열렸을 때만 밟힌다

const JOPPA_BOARD = { x: -46, z: 92 };     // where the voyage to Rome begins
const ROME_LANDING = { x: -207, z: 96 };   // where it ends
const BASILICA_POS = { x: -232, z: 92 };

/* ---------------- basic setup ---------------- */

const canvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const SKY_STOPS = [0, 0.5, 0.75, 1];
const SKY_DAY = ['#bcd3dd', '#d9dfc4', '#ecdfab', '#f3e8bf'];
const SKY_NIGHT = ['#141a2c', '#232a3f', '#3a3550', '#4a3f52'];
const SKY_DUSK = ['#7d6a8f', '#c98e5f', '#e8b56e', '#f0cf9a'];
const [skyCanvas, skyCtx] = canvas2d(16, 256);
const skyTex = new THREE.CanvasTexture(skyCanvas);
skyTex.colorSpace = THREE.SRGBColorSpace;
scene.background = skyTex;

function lerpHexCss(a, b, t) {
  const ca = parseInt(a.slice(1), 16), cb = parseInt(b.slice(1), 16);
  const ch = (sh) => Math.round(((ca >> sh) & 255) + (((cb >> sh) & 255) - ((ca >> sh) & 255)) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
function lerp3Css(a, b, c, t) {
  return t <= 0.5 ? lerpHexCss(a, b, t * 2) : lerpHexCss(b, c, (t - 0.5) * 2);
}
function setSky(warmth) {
  const g = skyCtx.createLinearGradient(0, 0, 0, 256);
  SKY_STOPS.forEach((s, i) => g.addColorStop(s, lerp3Css(SKY_NIGHT[i], SKY_DAY[i], SKY_DUSK[i], warmth)));
  skyCtx.fillStyle = g;
  skyCtx.fillRect(0, 0, 16, 256);
  skyTex.needsUpdate = true;
}
setSky(0.35);
scene.fog = new THREE.Fog(0xcdbf9a, 130, 340);
const FOG_VIEWS = { street: { near: 130, far: 340 }, chart: { near: 700, far: 1500 } };

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.4, 1600);
// 첫 시선은 인물·배·표지가 함께 읽히는 가까운 어깨너머 구도. 원경보다 디오라마의
// 재질과 생활 소품을 먼저 보이게 해 초기 인상을 바꾼다.
const cam = { yaw: 0, height: 4.25, dist: 9.25, smoothDist: 9.25, lastDrag: -10 };
const CHART_CAM_POS = new THREE.Vector3(0, 360, 105);
const CHART_LOOK_AT = new THREE.Vector3(0, 0, -25);
const lookTarget = new THREE.Vector3(0, 1.7, -110);
const occluders = [];

const hemi = new THREE.HemisphereLight(0xdce6e0, 0xa89468, 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0c8, 2.4);
sun.position.set(70, 100, 45);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.far = 400;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.03;
sun.shadow.radius = 4; // PCFSoft — 부드러운 그림자 가장자리
scene.add(sun);
scene.add(sun.target);

function applyShadowFrustum(view) {
  const c = sun.shadow.camera;
  if (view === 'chart') {
    c.left = -140; c.right = 140; c.top = 200; c.bottom = -200;
  } else {
    c.left = -55; c.right = 55; c.top = 75; c.bottom = -75;
  }
  c.updateProjectionMatrix();
}
applyShadowFrustum('street');

/* ---------------- 포스트프로세싱: 블룸 + 필름 마감 ----------------
   컴포저 버퍼는 톤매핑 전 리니어 HDR — 발광 재질만 색을 HDR로 부스트해
   임계값(2.2)을 넘긴다. 모바일 등 저사양은 FPS 게이트로 조용히 해제. */
const filmPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uTime;
    varying vec2 vUv;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }
    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      float d = distance(vUv, vec2(0.5));
      col.rgb *= 1.0 - smoothstep(0.55, 1.0, d) * 0.28;           // 비네트
      col.rgb += (hash(vUv * (97.0 + mod(uTime, 61.0))) - 0.5) * 0.035; // 그레인
      gl_FragColor = col;
    }`,
});
const composer = new EffectComposer(renderer); // r160 기본 HalfFloat — HDR OK
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2),
  0.55,  // strength — 은은하게
  0.35,  // radius
  2.2    // threshold — HDR 부스트된 발광체만 넘는다
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass()); // ACES 톤매핑 + sRGB
composer.addPass(filmPass);         // 비네트+그레인은 sRGB 공간에서
let usePost = true;
const fpsGate = { time: 0, frames: 0, done: false }; // 시작 후 4초 측정, 한 번만

/* ---------------- 물리 하늘 (Sky addon) + 시간대별 환경맵 ----------------
   낮과 어스름은 대기 산란 하늘이 맡고, 밤(duskW<0.3)은 기존 캔버스 하늘이
   그대로 맡는다. 캔버스 하늘은 배경 텍스처라 페이드가 없으므로, 같은
   텍스처를 입힌 얇은 돔을 Sky 위에 얹어 dayK로 크로스페이드한다. */

// duskW → 해의 고도(도): 아침 18° → 어스름 6° → 2°, 밤으로 갈수록 지평선 아래로
function skySunElevation(w) {
  if (w >= 0.5) return 6 + (Math.min(w, 0.85) - 0.5) * (12 / 0.35);
  if (w >= 0.35) return 2 + (w - 0.35) * (4 / 0.15);
  return 2 - (0.35 - w) * 30;
}
// 해의 방위각은 기존 SUN_DIR(0.55, ·, 0.42)의 수평 방향과 맞춘다 — 반짝임 길과 일치
const SKY_SUN_HX = 0.55 / Math.hypot(0.55, 0.42);
const SKY_SUN_HZ = 0.42 / Math.hypot(0.55, 0.42);
function setSkyUniforms(skyObj, w) {
  const u = skyObj.material.uniforms;
  u.turbidity.value = 6;
  // 어스름엔 산란을 키워 노을을 붉게 — 한낮(w>0.7)엔 다시 키워 ACES 백화(白化)를 막고
  // 하늘을 따뜻한 아침 파랑으로 되돌린다 (0.7→0.85에서 1.6→2.2 연속 보간, 팝 없음)
  u.rayleigh.value = w > 0.7 ? 1.6 + (Math.min(w, 0.85) - 0.7) * 4 : w > 0.5 ? 1.6 : 3.2;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.8;
  const el = THREE.MathUtils.degToRad(skySunElevation(w));
  u.sunPosition.value.set(Math.cos(el) * SKY_SUN_HX, Math.sin(el), Math.cos(el) * SKY_SUN_HZ);
}

let skyOn = false; // applyQuality가 켠다 (auto·high) — lite는 캔버스 하늘 그대로
const sky = new Sky();
sky.scale.setScalar(1200); // 카메라 far(1600) 안 — 플레이어를 따라다닌다
sky.renderOrder = -12;     // 별(-11)·해(-10)·능선(-9)보다 먼저 그려져 맨 뒤가 된다
sky.visible = false;
setSkyUniforms(sky, 0.35);
scene.add(sky);

// 캔버스 하늘 돔: 밤에는 불투명(기존 밤하늘), 낮이 밝아질수록 걷혀 Sky가 드러난다
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(590, 24, 12),
  new THREE.MeshBasicMaterial({
    map: skyTex, side: THREE.BackSide, transparent: true,
    fog: false, depthWrite: false,
  })
);
skyDome.renderOrder = -11.5; // Sky 위, 별 아래
skyDome.visible = false;
scene.add(skyDome);

// 물 환경반사: 실패해도 게임은 계속 간다.
// 시간대별(낮/어스름/밤) 하늘 환경맵 3장을 로드 시 1회만 프리베이크한다 — 프레임당 fromScene 금지.
let roomEnv = null;
let skyEnvs = null;
try {
  const pmrem = new THREE.PMREMGenerator(renderer);
  roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = roomEnv; // lite 폴백 — applyQuality가 하늘 환경맵으로 바꾼다
  const bakeSky = new Sky();
  bakeSky.scale.setScalar(50); // fromScene의 큐브 카메라 far(100) 안에 들어오게
  const bakeScene = new THREE.Scene();
  bakeScene.add(bakeSky);
  skyEnvs = {};
  for (const [k, w] of [['day', 0.85], ['dusk', 0.5], ['night', 0.15]]) {
    setSkyUniforms(bakeSky, w);
    skyEnvs[k] = pmrem.fromScene(bakeScene, 0.04).texture;
  }
  bakeSky.geometry.dispose();
  bakeSky.material.dispose();
  pmrem.dispose();
} catch { skyEnvs = null; /* 환경맵 없이 진행 */ }

// duskW 구간이 바뀔 때만 환경맵 교체 — 히스테리시스 0.05로 경계에서의 깜빡임 방지
let envBand = null;
function updateEnvironment(w) {
  if (!skyEnvs || !skyOn) return;
  let b = envBand;
  if (!b) b = w < 0.3 ? 'night' : w < 0.6 ? 'dusk' : 'day';
  else if (b === 'night') { if (w > 0.35) b = w < 0.6 ? 'dusk' : 'day'; }
  else if (b === 'day') { if (w < 0.55) b = w < 0.3 ? 'night' : 'dusk'; }
  else if (w < 0.25) b = 'night';
  else if (w > 0.65) b = 'day';
  if (b !== envBand) {
    envBand = b;
    scene.environment = skyEnvs[b];
  }
}

const colliders = []; // axis-aligned boxes {x0,x1,z0,z1}

/* ---------------- helpers ---------------- */

function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cz = az + t * dz;
  return Math.hypot(px - cx, pz - cz);
}

function onWalkLine(x, z) {
  for (const l of WALK_LINES) {
    if (distToSegment(x, z, l.a[0], l.a[1], l.b[0], l.b[1]) < l.width / 2) return true;
  }
  const w = waterWalkPath;
  if (w && distToSegment(x, z, w.a[0], w.a[1], w.b[0], w.b[1]) < w.width / 2) return true;
  return false;
}

function onHolyLand(x, z) {
  return pointInPoly(x, z, MAIN_LAND) && !pointInPoly(x, z, LAKE);
}
function onRome(x, z) {
  return pointInPoly(x, z, ROME_LAND);
}
function isWalkable(x, z) {
  return onHolyLand(x, z) || onRome(x, z) || onWalkLine(x, z);
}

// distance to the nearest shoreline (holy-land coast, lake edge, or Rome coast)
function shoreDistance(px, pz) {
  let d = Infinity;
  const polys = [MAIN_LAND, LAKE, ROME_LAND];
  for (const poly of polys) {
    for (let i = 0; i < poly.length; i++) {
      const [ax, az] = poly[i];
      const [bx, bz] = poly[(i + 1) % poly.length];
      d = Math.min(d, distToSegment(px, pz, ax, az, bx, bz));
    }
  }
  return d;
}

function rnd(a, b) { return a + Math.random() * (b - a); }

function canvas2d(w, h) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  return [cv, cv.getContext('2d')];
}

function addCollider(cx, cz, w, d, pad = 0.6) {
  colliders.push({ x0: cx - w / 2 - pad, x1: cx + w / 2 + pad, z0: cz - d / 2 - pad, z1: cz + d / 2 + pad });
}
// collide()는 회전을 모르는 축맞춤 상자만 다룬다 — rotY로 돌아간 벽·집은 그 회전을 감싸는
// 축맞춤 상자(AABB)로 등록해야, 실제 발자국과 다른 곳에 판정이 생기는(뚫고 지나가거나,
// 아무것도 없는데 막히는) 일이 없다.
function addRotatedCollider(cx, cz, w, d, rotY, pad = 0.6) {
  const c = Math.abs(Math.cos(rotY)), s = Math.abs(Math.sin(rotY));
  addCollider(cx, cz, w * c + d * s, w * s + d * c, pad);
}

function lambert(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

// 자주 보이는 현무암·석회암·목재는 단색 블록 대신 작은 절차 텍스처를 공유한다.
function makeMaterialTexture(size, paint) {
  const [cv, ctx] = canvas2d(size, size);
  paint(ctx, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

const basaltTex = makeMaterialTexture(256, (ctx, s) => {
  ctx.fillStyle = '#2f2e2b'; ctx.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 27) {
    const offset = (Math.floor(y / 27) % 2) * 18;
    for (let x = -offset; x < s; x += 48) {
      const w = 36 + Math.random() * 9, h = 20 + Math.random() * 5;
      ctx.fillStyle = Math.random() < 0.5 ? '#3b3934' : '#272622';
      ctx.fillRect(x + 2, y + 2, w, h);
      ctx.strokeStyle = 'rgba(12,10,8,0.52)'; ctx.lineWidth = 2;
      ctx.strokeRect(x + 2, y + 2, w, h);
      ctx.fillStyle = 'rgba(228,217,184,0.075)'; ctx.fillRect(x + 4, y + 4, w - 4, 2);
    }
  }
});
const limestoneTex = makeMaterialTexture(256, (ctx, s) => {
  ctx.fillStyle = '#dacda9'; ctx.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 34) {
    const offset = (Math.floor(y / 34) % 2) * 24;
    for (let x = -offset; x < s; x += 58) {
      const w = 50 + Math.random() * 10, h = 28 + Math.random() * 4;
      ctx.fillStyle = Math.random() < 0.48 ? '#e7dbb9' : '#d0bf94';
      ctx.fillRect(x + 2, y + 2, w, h);
      ctx.strokeStyle = 'rgba(116,96,66,0.18)'; ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 2, y + 2, w, h);
    }
  }
  for (let i = 0; i < 130; i++) {
    ctx.fillStyle = 'rgba(92,74,48,0.09)';
    ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
});
const woodTex = makeMaterialTexture(256, (ctx, s) => {
  ctx.fillStyle = '#745338'; ctx.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 30) {
    ctx.fillStyle = y % 60 ? '#815d3d' : '#66462e'; ctx.fillRect(0, y + 2, s, 26);
    ctx.fillStyle = 'rgba(37,24,15,0.42)'; ctx.fillRect(0, y, s, 2);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = 'rgba(236,194,123,0.12)';
      ctx.fillRect(Math.random() * s, y + 7 + Math.random() * 15, 20 + Math.random() * 58, 1);
    }
  }
});
// 나무껍질: 세로 섬유질 줄무늬 + 옹이 자국 (원기둥에 세로로 한 번 감긴다)
const barkTex = makeMaterialTexture(128, (ctx, s) => {
  ctx.fillStyle = '#3f3223'; ctx.fillRect(0, 0, s, s);
  for (let x = 0; x < s; x += 6) {
    const w = 3 + Math.random() * 4;
    ctx.fillStyle = Math.random() < 0.5 ? '#4c3d29' : '#332819';
    ctx.fillRect(x, 0, w, s);
  }
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = 'rgba(18,12,7,0.4)';
    ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random(), 3 + Math.random() * 7);
  }
});
// 잎사귀: 뭉친 잎 무더기의 명암 얼룩 (구체에 감긴다)
const leafTex = makeMaterialTexture(128, (ctx, s) => {
  ctx.fillStyle = '#5d6a42'; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 480; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(150,163,108,0.5)' : 'rgba(58,68,40,0.42)';
    const r = 1.4 + Math.random() * 2.2;
    ctx.beginPath(); ctx.arc(Math.random() * s, Math.random() * s, r, 0, Math.PI * 2); ctx.fill();
  }
});
const MAT = {
  basalt: new THREE.MeshStandardMaterial({ map: basaltTex, color: 0xffffff, roughness: 0.94, envMapIntensity: 0.25 }),
  basaltLight: new THREE.MeshStandardMaterial({ map: basaltTex, color: 0xc7c0af, roughness: 0.92, envMapIntensity: 0.22 }),
  limestone: new THREE.MeshStandardMaterial({ map: limestoneTex, color: 0xffffff, roughness: 0.89, envMapIntensity: 0.3 }),
  limestoneShadow: new THREE.MeshStandardMaterial({ map: limestoneTex, color: 0xb7a477, roughness: 0.94, envMapIntensity: 0.2 }),
  wood: new THREE.MeshStandardMaterial({ map: woodTex, color: 0xffffff, roughness: 0.76, envMapIntensity: 0.22 }),
  woodDark: new THREE.MeshStandardMaterial({ map: woodTex, color: 0x72503a, roughness: 0.83, envMapIntensity: 0.18 }),
  bark: new THREE.MeshStandardMaterial({ map: barkTex, color: 0xffffff, roughness: 0.95, envMapIntensity: 0.16 }),
  palmBark: new THREE.MeshStandardMaterial({ map: barkTex, color: 0xd4b483, roughness: 0.88, envMapIntensity: 0.18 }),
  leaf: new THREE.MeshStandardMaterial({ map: leafTex, color: 0xffffff, roughness: 0.8, envMapIntensity: 0.22 }),
};

function box(w, h, d, color, x, y, z, parent = scene, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), color && color.isMaterial ? color : lambert(color));
  m.position.set(x, y, z);
  if (shadow) { m.castShadow = true; m.receiveShadow = true; }
  parent.add(m);
  return m;
}

function cylBetween(p1, p2, r, color, parent = scene) {
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), lambert(color));
  mesh.position.copy(p1).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  parent.add(mesh);
  return mesh;
}

function makeTextTexture(text, { size = 68, color = 'rgba(43,38,32,0.82)', italic = true } = {}) {
  const [cv, ctx] = canvas2d(1024, 144);
  ctx.font = `${italic ? 'italic ' : ''}600 ${size}px 'Noto Serif KR', 'Apple SD Gothic Neo', 'Malgun Gothic', serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '10px';
  ctx.fillText(text, 512, 76);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const groundLabels = [];
function groundLabel(text, x, z, rotY = 0, width = 40) {
  const geo = new THREE.PlaneGeometry(width, (width * 144) / 1024);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: makeTextTexture(text), transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 0.22, z);
  mesh.rotation.y = rotY;
  scene.add(mesh);
  groundLabels.push(mesh); // 하늘에서 보기에서는 지도 지명답게 커진다
}

// 번호 원판 스프라이트 재질 — 유광 UI 배지가 아니라, 금박 테가 박힌 모자이크 인장.
function numberSpriteMat(n, bg) {
  const [cv, ctx] = canvas2d(128, 128);
  ctx.fillStyle = 'rgba(0,0,0,0)';
  ctx.fillRect(0, 0, 128, 128);
  ctx.beginPath();
  ctx.arc(64, 64, 54, 0, Math.PI * 2);
  ctx.fillStyle = '#caa64b';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(64, 64, 47, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  // 테세라의 작은 불규칙을 남겨, 화면 가까이에서도 벡터 원처럼 보이지 않게 한다.
  for (let i = 0; i < 42; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 7 + Math.random() * 34;
    const s = 1 + Math.random() * 2.4;
    ctx.fillStyle = i % 3 ? 'rgba(255,241,193,0.13)' : 'rgba(37,27,19,0.16)';
    ctx.fillRect(64 + Math.cos(a) * r - s / 2, 64 + Math.sin(a) * r - s / 2, s, s);
  }
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#f1df9d';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(64, 64, 57, 0, Math.PI * 2);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(45,35,21,0.72)';
  ctx.stroke();
  ctx.font = `600 60px 'Noto Serif KR', Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff4d2';
  ctx.shadowColor = 'rgba(41,29,16,0.65)';
  ctx.shadowBlur = 2;
  ctx.fillText(String(n), 64, 68);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.SpriteMaterial({ map: tex, depthTest: true });
}

// Tappable flavor landmarks — a lighter cousin of numbered sites: a label,
// a short blurb card, no chart credit.
const landmarkLabels = [];
const tapTargets = [];
function landmarkLabel(text, x, y, z, range = 30) {
  const cv = document.createElement('canvas');
  const font = `500 76px 'Noto Serif KR', 'Apple SD Gothic Neo', 'Malgun Gothic', serif`;
  let ctx = cv.getContext('2d');
  ctx.font = font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '10px';
  const w = Math.ceil(Math.max(380, (ctx.measureText(text).width || 900) + 90));
  cv.width = w;
  cv.height = 150;
  ctx = cv.getContext('2d');
  ctx.font = font;
  if ('letterSpacing' in ctx) ctx.letterSpacing = '10px';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 16;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(236,226,196,0.85)';
  ctx.strokeText(text, w / 2, 78);
  ctx.fillStyle = 'rgba(43,38,32,0.95)';
  ctx.fillText(text, w / 2, 78);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  sprite.renderOrder = 5;
  sprite.position.set(x, y, z);
  const sh = 1.9, sw = sh * (w / 150);
  sprite.scale.set(sw, sh, 1);
  scene.add(sprite);
  landmarkLabels.push({ sprite, x, z, w: sw, h: sh, range });
  return sprite;
}
function landmarkInfo(name, blurb, x, z, labelY, { range = 30, w = 8, h = 0, d = 8 } = {}) {
  const sprite = landmarkLabel(name, x, labelY, z, range);
  const info = { name, blurb };
  sprite.userData.landmark = info;
  tapTargets.push(sprite);
  const hitH = h || labelY;
  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(w, hitH, d),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  hit.position.set(x, hitH / 2, z);
  hit.userData.landmark = info;
  scene.add(hit);
  tapTargets.push(hit);
}

/* ---------------- water & land ---------------- */

const waterGeo = new THREE.PlaneGeometry(780, 460, 70, 60);
waterGeo.rotateX(-Math.PI / 2);
const waterBase = waterGeo.attributes.position.array.slice();
const seaWater = new THREE.Mesh(
  waterGeo,
  new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.3, metalness: 0.05, envMapIntensity: 1.15 })
);
seaWater.position.set(-90, -0.6, -20);
seaWater.receiveShadow = true;
scene.add(seaWater);

const lakeGeo = new THREE.PlaneGeometry(64, 62, 20, 20);
lakeGeo.rotateX(-Math.PI / 2);
const lakeBase = lakeGeo.attributes.position.array.slice();
const lakeWater = new THREE.Mesh(
  lakeGeo,
  new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.24, metalness: 0.05, envMapIntensity: 1.15 })
);
lakeWater.position.set(0, -0.42, -129);
lakeWater.receiveShadow = true;
scene.add(lakeWater);

// 물가의 깊이: 해안선까지의 거리로 정점색을 굽는다 — 물가 0~6유닛은 얕게 밝아진다.
// 재질 color는 흰색으로 두고 원래 물색을 정점에 굽는다 (이중 곱 방지). 빌드 타임 1회.
function distToPoly(px, pz, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
    const dx = bx - ax, dz = bz - az;
    const len2 = dx * dx + dz * dz;
    if (len2 < 1e-9) continue; // 닫는 점이 중복된 다각형(MAIN_LAND)의 0길이 선분
    const tt = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
    best = Math.min(best, Math.hypot(px - ax - dx * tt, pz - az - dz * tt));
  }
  return best;
}
function bakeShoreColors(geo, baseHex, offX, offZ, polys) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const base = new THREE.Color(baseHex);
  for (let i = 0; i < pos.count; i++) {
    let d = Infinity;
    for (const p of polys) d = Math.min(d, distToPoly(pos.array[i * 3] + offX, pos.array[i * 3 + 2] + offZ, p));
    const k = 1 + 0.2 * Math.max(0, 1 - d / 6); // 물가로 갈수록 +20%까지 밝게
    col[i * 3] = base.r * k;
    col[i * 3 + 1] = base.g * k;
    col[i * 3 + 2] = base.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
}
bakeShoreColors(lakeGeo, COLORS.lake, 0, -129, [LAKE]);
bakeShoreColors(waterGeo, COLORS.sea, -90, -20, [MAIN_LAND]);

/* ---------------- 호수 평면 반사 (Water addon · high 전용) ----------------
   호수만 진짜 거울이 된다 — 하늘과 배가 물에 비친다. 바다는 반사 2패스
   비용 때문에 기존 정점 파도를 유지한다. 리로드 없이 visible 스왑. */

// 캔버스 노멀맵: 다층 사인 높이장(정수 주기 → 이음매 없음) → 중앙차분으로 노멀 인코딩
function makeWaterNormals() {
  const N = 256;
  const h = new Float32Array(N * N);
  const waves = [];
  for (let i = 0; i < 7; i++) {
    waves.push({
      fx: 1 + Math.floor(Math.random() * 6), fy: 1 + Math.floor(Math.random() * 6),
      p1: Math.random() * Math.PI * 2, p2: Math.random() * Math.PI * 2, amp: 1 / (i + 1),
    });
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let v = (Math.random() - 0.5) * 0.2; // 잔물결 노이즈
      for (const w of waves) v += Math.sin((x / N) * Math.PI * 2 * w.fx + w.p1) * Math.sin((y / N) * Math.PI * 2 * w.fy + w.p2) * w.amp;
      h[y * N + x] = v;
    }
  }
  const [cv, ctx] = canvas2d(N, N);
  const img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const nx = (h[y * N + ((x - 1 + N) % N)] - h[y * N + ((x + 1) % N)]) * 1.1;
      const ny = (h[((y - 1 + N) % N) * N + x] - h[((y + 1) % N) * N + x]) * 1.1;
      const inv = 1 / Math.hypot(nx, ny, 1);
      const o = (y * N + x) * 4;
      img.data[o] = Math.round((nx * inv * 0.5 + 0.5) * 255);
      img.data[o + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255);
      img.data[o + 2] = Math.round(inv * 255);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

let reflWater = null; // high를 처음 고를 때 한 번만 만든다
function buildLakeReflection() {
  reflWater = new Water(new THREE.PlaneGeometry(64, 62), {
    textureWidth: 512,
    textureHeight: 512,
    waterNormals: makeWaterNormals(),
    sunDirection: new THREE.Vector3(70, 100, 45).normalize(), // sun의 고정 오프셋과 일치
    sunColor: 0xffffff,
    waterColor: COLORS.lake,
    distortionScale: 1.8,
    fog: scene.fog !== undefined,
  });
  reflWater.rotation.x = -Math.PI / 2;
  // 호수 아래로도 이어지는 바다 평면의 파도 마루(최대 y≈-0.18)가 거울면을 뚫지 않도록 살짝 위에
  reflWater.position.set(0, -0.14, -129); // 시각 전용, 판정 무관
  scene.add(reflWater);
}

// 흙바닥 질감: 모래 알갱이와 옅은 얼룩 — 단색 평면이던 땅에 살결을 준다
function makeGroundTexture(base) {
  const [cv, ctx] = canvas2d(256, 256);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '70,58,40' : '255,246,222'},${(0.03 + Math.random() * 0.07).toFixed(3)})`;
    const s = 1 + Math.random() * 2.5;
    ctx.fillRect(Math.random() * 256, Math.random() * 256, s, s);
  }
  for (let i = 0; i < 26; i++) { // 넓고 옅은 얼룩
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 22 + Math.random() * 30);
    g.addColorStop(0, `rgba(120,100,70,${(0.02 + Math.random() * 0.045).toFixed(3)})`);
    g.addColorStop(1, 'rgba(120,100,70,0)');
    ctx.save();
    ctx.translate(Math.random() * 256, Math.random() * 256);
    ctx.fillStyle = g;
    ctx.fillRect(-52, -52, 104, 104);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

// 모래 결 노멀맵: 낮은 사구 몇 겹 + 알갱이 — 빛이 스치면 땅의 살결이 드러난다
function makeGroundNormal() {
  const N = 128;
  const h = new Float32Array(N * N);
  const waves = [];
  for (let i = 0; i < 5; i++) {
    waves.push({
      fx: 1 + Math.floor(Math.random() * 5), fy: 1 + Math.floor(Math.random() * 5),
      p1: Math.random() * Math.PI * 2, p2: Math.random() * Math.PI * 2, amp: 0.5 / (i + 1),
    });
  }
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      let v = (Math.random() - 0.5) * 0.5; // 모래 알갱이
      for (const w of waves) v += Math.sin((x / N) * Math.PI * 2 * w.fx + w.p1) * Math.sin((y / N) * Math.PI * 2 * w.fy + w.p2) * w.amp;
      h[y * N + x] = v;
    }
  }
  const [cv, ctx] = canvas2d(N, N);
  const img = ctx.createImageData(N, N);
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const nx = (h[y * N + ((x - 1 + N) % N)] - h[y * N + ((x + 1) % N)]) * 0.9;
      const ny = (h[((y - 1 + N) % N) * N + x] - h[((y + 1) % N) * N + x]) * 0.9;
      const inv = 1 / Math.hypot(nx, ny, 1);
      const o = (y * N + x) * 4;
      img.data[o] = Math.round((nx * inv * 0.5 + 0.5) * 255);
      img.data[o + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255);
      img.data[o + 2] = Math.round(inv * 255);
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1 / 24, 1 / 24); // sandTex와 같은 타일링
  return tex;
}
const groundNormalTex = makeGroundNormal();

function extrudeLand(points, topColor, sideColor, { hole = null, depth = 2.2, topMap = null } = {}) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
  if (hole) shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, z))));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);
  const topMat = topMap
    ? new THREE.MeshStandardMaterial({
      map: topMap, color: 0xfff8ea, roughness: 1, metalness: 0,
      normalMap: groundNormalTex, normalScale: new THREE.Vector2(0.55, 0.55),
      envMapIntensity: 0.4, // 하늘 환경맵이 모래의 채도를 바래게 하지 않게
    })
    : lambert(topColor);
  const mesh = new THREE.Mesh(geo, [topMat, lambert(sideColor)]);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

// ExtrudeGeometry의 UV는 도형 좌표 그대로라, repeat로 월드 24유닛마다 타일링한다
const sandTex = makeGroundTexture('#cfc09a');
sandTex.repeat.set(1 / 24, 1 / 24);
const romeTex = makeGroundTexture('#c9bb9b');
romeTex.repeat.set(1 / 24, 1 / 24);
extrudeLand(MAIN_LAND, COLORS.land, COLORS.landSide, { hole: LAKE, topMap: sandTex });
extrudeLand(ROME_LAND, COLORS.romeLand, COLORS.romeLandSide, { topMap: romeTex });

/* ---------------- 지역 색 스크립팅 ----------------
   걷는 땅은 평평한 채로, 색만 지역을 따라 흐르게 하는 반투명 워시 한 장.
   갈릴리의 초록기 도는 물가, 요단 길의 붉은 황토, 예루살렘의 차가운 석회암. */
function makeRegionTint() {
  const W = 256, H = 768;
  const [cv, ctx] = canvas2d(W, H);
  const X = (x) => (x + 58) / 116 * W;   // 월드 x -58→0, 58→256
  const Y = (z) => (z + 205) / 368 * H;  // 월드 z -205(북)→0, 163(남)→768

  // 요단 길: 중앙 스파인(x±6)의 붉은 황토 띠 — 가장자리로 소멸 (먼저 깔고 위에 워시를 얹는다)
  let g = ctx.createLinearGradient(X(-14), 0, X(14), 0);
  g.addColorStop(0, 'rgba(152,82,44,0)');
  g.addColorStop(0.5, 'rgba(152,82,44,0.15)');
  g.addColorStop(1, 'rgba(152,82,44,0)');
  ctx.fillStyle = g;
  ctx.fillRect(X(-14), Y(-95), X(14) - X(-14), Y(88) - Y(-95));
  // 띠의 남북 끝을 부드럽게 지운다
  ctx.globalCompositeOperation = 'destination-out';
  g = ctx.createLinearGradient(0, Y(-95), 0, Y(-75));
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(X(-14), Y(-95), X(14) - X(-14), Y(-75) - Y(-95));
  g = ctx.createLinearGradient(0, Y(68), 0, Y(88));
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = g;
  ctx.fillRect(X(-14), Y(68), X(14) - X(-14), Y(88) - Y(68));
  ctx.globalCompositeOperation = 'source-over';

  // 갈릴리(z<-95): 따뜻한 모래 워시, 남쪽으로 스러진다
  g = ctx.createLinearGradient(0, 0, 0, Y(-80));
  g.addColorStop(0, 'rgba(214,186,128,0.16)');
  g.addColorStop(0.75, 'rgba(214,186,128,0.12)');
  g.addColorStop(1, 'rgba(214,186,128,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, Y(-80));

  // 호숫가 ~8유닛: 초록기 도는 모래 — 물이 기른 풀빛
  ctx.beginPath();
  LAKE.forEach(([x, z], i) => (i ? ctx.lineTo(X(x), Y(z)) : ctx.moveTo(X(x), Y(z))));
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(150,160,110,0.09)';
  ctx.lineWidth = 66; // 바깥쪽 부드러운 번짐
  ctx.stroke();
  ctx.strokeStyle = 'rgba(150,160,110,0.14)';
  ctx.lineWidth = 34; // ~8유닛 폭의 본 띠
  ctx.stroke();

  // 새벽 바닷가: 두 번째 불 언저리의 장밋빛 금 (요 21)
  g = ctx.createRadialGradient(X(27), Y(-141), 0, X(27), Y(-141), 40);
  g.addColorStop(0, 'rgba(232,176,118,0.16)');
  g.addColorStop(1, 'rgba(232,176,118,0)');
  ctx.fillStyle = g;
  ctx.fillRect(X(27) - 40, Y(-141) - 40, 80, 80);

  // 예루살렘(z>88): 차가운 석회암 워시
  g = ctx.createLinearGradient(0, Y(70), 0, Y(112));
  g.addColorStop(0, 'rgba(190,195,205,0)');
  g.addColorStop(1, 'rgba(190,195,205,0.16)');
  ctx.fillStyle = g;
  ctx.fillRect(0, Y(70), W, H - Y(70));

  // 큰 스케일의 명암 얼룩 — 단조로움을 깬다
  const blotches = [
    [-30, -66, 100, '255,244,214', 0.05], [22, -22, 116, '96,78,50', 0.05],
    [-18, 42, 96, '96,78,50', 0.045], [30, 118, 88, '255,244,214', 0.05],
    [4, -178, 108, '96,78,50', 0.04], [-42, 108, 84, '96,78,50', 0.045],
  ];
  for (const [bx, bz, br, col, a] of blotches) {
    g = ctx.createRadialGradient(X(bx), Y(bz), 0, X(bx), Y(bz), br);
    g.addColorStop(0, `rgba(${col},${a})`);
    g.addColorStop(1, `rgba(${col},0)`);
    ctx.fillStyle = g;
    ctx.fillRect(X(bx) - br, Y(bz) - br, br * 2, br * 2);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
{
  // MAIN_LAND와 같은 도형의 윗면 한 장 — y를 뒤집어 만들고 -90° 돌려 법선을 위로
  const shape = new THREE.Shape(MAIN_LAND.map(([x, z]) => new THREE.Vector2(x, -z)));
  shape.holes.push(new THREE.Path(LAKE.map(([x, z]) => new THREE.Vector2(x, -z))));
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  const tintTex = makeRegionTint();
  // ShapeGeometry의 UV는 도형 좌표 그대로 — repeat/offset으로 월드 범위에 맞춘다
  tintTex.repeat.set(1 / 116, 1 / 368);
  tintTex.offset.set(0.5, 163 / 368);
  const tint = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    map: tintTex, transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  }));
  tint.position.y = 0.02;
  tint.receiveShadow = true;
  scene.add(tint);
}

// 물가 거품 띠: 호수 가장자리를 따라 밝은 리본 — 뭍과 물의 경계가 살아난다
const lakeFoam = (() => {
  const geos = [];
  for (let i = 0; i < LAKE.length; i++) {
    const [ax, az] = LAKE[i];
    const [bx, bz] = LAKE[(i + 1) % LAKE.length];
    const len = Math.hypot(bx - ax, bz - az);
    const g = new THREE.PlaneGeometry(len + 0.6, 0.85);
    g.rotateX(-Math.PI / 2);
    g.rotateY(-Math.atan2(bz - az, bx - ax));
    g.translate((ax + bx) / 2, 0.07, (az + bz) / 2);
    geos.push(g);
  }
  const foam = new THREE.Mesh(
    mergeGeometries(geos, false),
    new THREE.MeshBasicMaterial({ color: 0xe6efe9, transparent: true, opacity: 0.4, depthWrite: false })
  );
  scene.add(foam);
  return foam;
})();

// 갈릴리 서안의 포말선: 새벽 바닷가 위도의 지중해 해안 세그먼트만 — 숨쉬는 흰 띠
const seaFoam = (() => {
  const g = new THREE.PlaneGeometry(0.7, 56); // 폭 0.7 × 남북 56 — 해안선을 따라 눕는다
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(
    g,
    new THREE.MeshBasicMaterial({ color: 0xfffaf0, transparent: true, opacity: 0.25, depthWrite: false })
  );
  m.position.set(-58, 0.03, -132); // MAIN_LAND 서쪽 변 x=-58, z -160~-104
  scene.add(m);
  return m;
})();


// 호숫가의 현무암: 네모난 상자 대신 불규칙하게 닳은 돌들로 수면의 가장자리를 잡는다.
{
  const geos = [];
  for (let i = 0; i < LAKE.length; i++) {
    const [ax, az] = LAKE[i];
    const [bx, bz] = LAKE[(i + 1) % LAKE.length];
    const n = 3;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      const x = ax + (bx - ax) * t + rnd(-1.5, 1.5);
      const z = az + (bz - az) * t + rnd(-1.5, 1.5);
      if (!onHolyLand(x, z)) continue;
      const s = rnd(0.35, 0.75);
      const g = new THREE.DodecahedronGeometry(s, 0);
      g.scale(1.15, 0.62 + Math.random() * 0.18, 0.8 + Math.random() * 0.35);
      g.rotateY(Math.random() * Math.PI);
      g.translate(x, s * 0.38, z);
      geos.push(g);
    }
  }
  if (geos.length) {
    const rocks = new THREE.Mesh(mergeGeometries(geos, false), MAT.basalt);
    rocks.castShadow = rocks.receiveShadow = true;
    scene.add(rocks);
  }
}

// 지도식 지명: 위치는 대략 맞게, 거리는 순례 지도답게 압축 — 하늘에서 보기(M)에서 특히 잘 읽힌다
groundLabel('갈릴리 바다', 0, -130, 0, 34);
groundLabel('가버나움', -10, -172, 0, 18);
groundLabel('가이사랴 빌립보', 14, -174, 0, 27);
groundLabel('요단 길', 13, -40, 0, 16);
groundLabel('감람산 · 겟세마네', 46, 110, 0, 27);
groundLabel('골고다', -40, 106, 0, 13);
groundLabel('예루살렘', 4, 122, 0, 24);
groundLabel('욥바 항', -44, 82, 0, 13);
groundLabel('큰 바다 (지중해)', -120, 55, 0, 38);
groundLabel('바티칸 언덕', -232, 108, 0, 19);
groundLabel('로마', -212, 70, 0, 14);

/* ---------------- roads ---------------- */

function makeDirtTexture() {
  const [cv, ctx] = canvas2d(128, 128);
  ctx.fillStyle = '#b7a077';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 340; i++) {
    const shade = 0.85 + Math.random() * 0.3;
    ctx.fillStyle = `rgba(${Math.round(150 * shade)},${Math.round(128 * shade)},${Math.round(88 * shade)},0.5)`;
    const s = 1 + Math.random() * 2.4;
    ctx.fillRect(Math.random() * 128, Math.random() * 128, s, s);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}
const dirtTex = makeDirtTexture();
const roadMat = new THREE.MeshLambertMaterial({ map: dirtTex, color: 0xffffff });

function drawPath(points, width) {
  for (let i = 0; i < points.length - 1; i++) {
    const [ax, az] = points[i], [bx, bz] = points[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const geo = new THREE.PlaneGeometry(len, width);
    const uv = geo.attributes.uv;
    for (let v = 0; v < uv.count; v++) uv.setXY(v, uv.getX(v) * (len / 6), uv.getY(v) * (width / 6));
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, roadMat);
    m.position.set((ax + bx) / 2, 0.05, (az + bz) / 2);
    m.rotation.y = -Math.atan2(bz - az, bx - ax);
    m.receiveShadow = true;
    scene.add(m);
  }
}

// The Jordan road, Galilee down to Jerusalem
const JORDAN_ROAD = [[0, -100], [6, -60], [-4, -20], [4, 20], [-4, 60], [0, 96]];
drawPath(JORDAN_ROAD, 3.2);
// streets within Jerusalem
drawPath([[0, 96], [0, 108], [2, 122], [0, 140]], 2.6);
drawPath([[-20, 112], [0, 112], [10, 118]], 2.4);
drawPath([[0, 108], [30, 100]], 2.4);   // toward Gethsemane
drawPath([[-20, 115], [-36, 122]], 2.2); // toward Golgotha & the tomb
// path from the Jordan road up to Caesarea Philippi
drawPath([[0, -154], [10, -168], [16, -183]], 2.4);
// path from Capernaum down to the Joppa road (a long walk along the coast)
drawPath([[-10, -156], [-30, -100], [-46, 60], [-46, 92]], 2.6);

// 남행길이 곧 이야기다 — 고백(4번) 직후 시작된 죽음 예고와,
// 앞서 걸으시는 예수. 빈 길 두 구간에 이정표 돌무더기와 카드를 놓는다.
function cairn(x, z) {
  const g = new THREE.Group();
  const stone = (w, h, y) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), lambert(0x9a8d6e));
    m.position.y = y;
    m.rotation.y = Math.random();
    m.castShadow = true;
    g.add(m);
  };
  stone(1.1, 0.5, 0.25);
  stone(0.8, 0.45, 0.7);
  stone(0.5, 0.4, 1.05);
  g.position.set(x, 0, z);
  scene.add(g);
  addCollider(x, z, 1.2, 1.2, 0.2);
}
cairn(9.5, -58);
cairn(8, 22);
landmarkInfo(
  '죽음을 처음 말씀하신 곳',
  `"너는 그리스도"라는 고백을 들으신 바로 그때부터, 예수께서는 예루살렘에
   올라가 죽임을 당하고 사흘 만에 살아나야 할 것을 제자들에게 말씀하시기
   시작했다. 베드로가 붙들고 막아섰다. "주님, 안 됩니다. 절대로 그런 일은
   없을 것입니다." 방금 반석이라 불린 그가 곧바로 들은 말은 이것이었다.
   "사탄아, 내 뒤로 물러가라. 너는 하나님의 일을 생각하지 않고 사람의 일을
   생각한다." (마 16:21–23) 이 길은 그 말씀 그대로 — 남쪽으로, 십자가를
   향해 — 내려간다.`,
  9.5, -58, 6, { range: 28, w: 3, h: 5, d: 3 }
);
landmarkInfo(
  '앞서 걸으시는 분',
  `예루살렘으로 올라가는 길, 예수께서 앞장서서 걸으셨다. 제자들은 놀랐고,
   따르는 사람들은 두려워했다. (막 10:32) 이 길 끝에 무엇이 기다리는지 아는
   사람은 앞서 걷는 그분뿐이었다. "보라, 우리가 예루살렘으로 올라간다.
   인자가 넘겨져 죽임을 당하고 — 사흘 만에 살아날 것이다." 그 말은 이 길
   끝의 도성에서 하나도 빠짐없이 이루어진다.`,
  8, 22, 6, { range: 28, w: 3, h: 5, d: 3 }
);

// 길가의 풀 무더기: 작은 십자 판 — 수백 개를 하나의 메시로 합친다
{
  const geos = [];
  const tuft = (x, z) => {
    const s = 0.5 + Math.random() * 0.5;
    for (const ry of [0, Math.PI / 2]) {
      const g = new THREE.PlaneGeometry(1.1 * s, 0.75 * s);
      g.rotateY(ry + Math.random() * 0.6);
      g.translate(x, 0.32 * s, z);
      geos.push(g);
    }
  };
  // 요단 길가와 호숫가, 갈릴리 들판에 흩뿌린다
  for (let i = 0; i < JORDAN_ROAD.length - 1; i++) {
    const [ax, az] = JORDAN_ROAD[i], [bx, bz] = JORDAN_ROAD[i + 1];
    for (let k = 0; k < 14; k++) {
      const f = Math.random();
      const side = (Math.random() < 0.5 ? -1 : 1) * (2.6 + Math.random() * 4);
      tuft(ax + (bx - ax) * f + side, az + (bz - az) * f + (Math.random() - 0.5) * 3);
    }
  }
  for (let i = 0; i < LAKE.length; i++) {
    const [ax, az] = LAKE[i];
    const cx = ax * 1.16, cz = -129 + (az + 129) * 1.16; // 호수 바깥쪽으로
    if (Math.random() < 0.75) tuft(cx + (Math.random() - 0.5) * 3, cz + (Math.random() - 0.5) * 3);
  }
  for (let k = 0; k < 60; k++) tuft(-40 + Math.random() * 85, -200 + Math.random() * 110);
  const grass = new THREE.Mesh(
    mergeGeometries(geos, false),
    new THREE.MeshLambertMaterial({ color: 0x8a9a68, side: THREE.DoubleSide })
  );
  scene.add(grass);
}

// 들의 백합 (마 6:28): 갈릴리 들판의 꽃 무더기 — 탭하면 말씀 한 줄, 수집도 저장도 없다
const LILY_LINES = [
  '🌸 “들의 백합화가 어떻게 자라는가 생각하여 보라 — 수고도 아니하고 길쌈도 아니하느니라.” (마 6:28)',
  '🌸 “솔로몬의 모든 영광으로도 입은 것이 이 꽃 하나만 같지 못하였느니라.” (마 6:29)',
  '🌸 “오늘 있다가 내일 아궁이에 던져지는 들풀도 이렇게 입히시거든, 하물며 너희일까 보냐.” (마 6:30)',
];
let lilyIdx = 0;
{
  const HEAD_COLORS = [0xf3f0e4, 0xe8c95a, 0xb87ac8, 0xe08a9b];
  // 갈릴리의 길 중심선들 — 꽃은 길을 비켜서 핀다 (대략이면 충분)
  const LILY_ROADS = [
    [[0, -100], [6, -60]],
    [[0, -154], [10, -168]], [[10, -168], [16, -183]],
    [[-10, -156], [-30, -100]],
  ];
  const lakeDist = (x, z) => {
    let d = Infinity;
    for (let i = 0; i < LAKE.length; i++) {
      const [ax, az] = LAKE[i], [bx, bz] = LAKE[(i + 1) % LAKE.length];
      d = Math.min(d, distToSegment(x, z, ax, az, bx, bz));
    }
    return d;
  };
  const paint = (g, hex) => { // geometry 전체를 한 색의 vertex color로 칠한다
    const c = new THREE.Color(hex);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  };
  const geos = [];
  for (let k = 0; k < 14; k++) {
    const cx = rnd(-50, 55), cz = rnd(-200, -95);
    if (!onHolyLand(cx, cz) || lakeDist(cx, cz) < 8) continue;
    if (LILY_ROADS.some(([a, b]) => distToSegment(cx, cz, a[0], a[1], b[0], b[1]) < 3)) continue;
    const n = 5 + Math.floor(Math.random() * 5);
    for (let f = 0; f < n; f++) {
      const x = cx + rnd(-1.1, 1.1), z = cz + rnd(-1.1, 1.1);
      const h = rnd(0.4, 0.6);
      for (const ry of [0, Math.PI / 2]) { // 줄기: 가는 초록 십자 쿼드
        const g = new THREE.PlaneGeometry(0.035, h);
        g.rotateY(ry + Math.random() * 0.5);
        g.translate(x, h / 2, z);
        geos.push(paint(g, 0x7c8f56));
      }
      const head = new THREE.CircleGeometry(0.09, 8); // 꽃머리: 작은 팔각 원판
      head.rotateX(-Math.PI / 2 + rnd(-0.3, 0.3));
      head.translate(x, h, z);
      geos.push(paint(head, HEAD_COLORS[Math.floor(Math.random() * HEAD_COLORS.length)]));
    }
    // 무더기마다 투명 히트박스 하나 — 탭하면 말씀
    const hit = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 2, 2.4),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    hit.position.set(cx, 1, cz);
    hit.userData.lilyToy = true;
    scene.add(hit);
    tapTargets.push(hit);
  }
  if (geos.length) {
    scene.add(new THREE.Mesh(
      mergeGeometries(geos, false),
      new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide })
    ));
  }
}

/* ---------------- trees & vegetation ---------------- */

const swayers = []; // 바람에 흔들리는 나무들
function tree(x, z, s = 1, kind = 'olive') {
  const g = new THREE.Group();
  swayers.push({ g, ph: Math.random() * 6 });
  const barkMat = kind === 'palm' ? MAT.palmBark : MAT.bark;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * s, 0.22 * s, 1.3 * s, 12), barkMat);
  trunk.position.y = 0.65 * s;
  trunk.castShadow = true;
  g.add(trunk);
  if (kind === 'palm') {
    for (let i = 0; i < 6; i++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.16 * s, 1.7 * s, 10), MAT.leaf);
      frond.position.y = 1.3 * s;
      frond.rotation.z = Math.PI / 2.3;
      frond.rotation.y = (i / 6) * Math.PI * 2;
      frond.castShadow = true;
      g.add(frond);
    }
  } else {
    const fol = new THREE.Mesh(new THREE.SphereGeometry(0.85 * s, 18, 14), MAT.leaf);
    fol.position.y = 1.55 * s;
    fol.scale.y = 0.85;
    fol.castShadow = true;
    g.add(fol);
  }
  g.position.set(x, 0, z);
  scene.add(g);
  addCollider(x, z, 0.6 * s, 0.6 * s, 0.1);
}

// Gethsemane's olive grove
const GETHSEMANE = { x: 44, z: 100 };
for (let i = 0; i < 20; i++) {
  const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 11;
  tree(GETHSEMANE.x + Math.cos(a) * r, GETHSEMANE.z + Math.sin(a) * r, 0.8 + Math.random() * 0.6);
}
{
  // an olive press: a broad stone basin and a standing millstone
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.7, 0.5, 16), lambert(COLORS.limestoneShadow));
  basin.position.set(GETHSEMANE.x, 0.25, GETHSEMANE.z);
  basin.castShadow = basin.receiveShadow = true;
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.35, 14), lambert(COLORS.limestone));
  stone.position.set(GETHSEMANE.x + 0.3, 0.65, GETHSEMANE.z);
  stone.rotation.z = Math.PI / 2.1;
  stone.castShadow = true;
  scene.add(basin, stone);
  addCollider(GETHSEMANE.x, GETHSEMANE.z, 3.4, 3.4);
}

// scattered vegetation along the Jordan road and the lakeshore
for (const [x, z] of JORDAN_ROAD) {
  for (let i = 0; i < 3; i++) {
    const ox = x + rnd(-8, 8), oz = z + rnd(-8, 8);
    if (isWalkable(ox, oz) && Math.hypot(ox - x, oz - z) > 3.5) tree(ox, oz, 0.5 + Math.random() * 0.4);
  }
}
for (let i = 0; i < 14; i++) {
  const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 3;
  const x = Math.cos(a) * 30, z = -129 + Math.sin(a) * 26;
  if (onHolyLand(x, z)) tree(x, z, 0.5 + Math.random() * 0.4, Math.random() < 0.4 ? 'palm' : 'olive');
}

/* ---------------- Capernaum ---------------- */

function basaltHouse(x, z, w = 3, d = 3, h = 2.4, rotY = 0) {
  const g = new THREE.Group();
  const wallMat = Math.random() < 0.5 ? MAT.basalt : MAT.basaltLight;
  const body = box(w, h, d, wallMat, 0, h / 2, 0, g);
  body.castShadow = true;
  // 층층이 쌓인 현무암 테와 갈대 덮개로 평평한 지붕의 두께를 만든다.
  box(w + 0.34, 0.18, d + 0.34, MAT.basaltLight, 0, h + 0.09, 0, g);
  box(w + 0.16, 0.12, d + 0.16, MAT.woodDark, 0, h + 0.24, 0, g, false);
  for (let i = 0; i < 3; i++) box(w + 0.45 - i * 0.08, 0.07, d + 0.45 - i * 0.08, MAT.basalt, 0, h + 0.34 + i * 0.07, 0, g, false);
  box(0.7, 1.3, 0.15, 0x1c1a18, 0, 0.65, d / 2 + 0.06, g, false); // 문
  box(0.92, 0.13, 0.2, MAT.limestone, 0, 1.38, d / 2 + 0.08, g, false);
  for (const sx of [-0.48, 0.48]) box(0.13, 1.48, 0.18, MAT.limestoneShadow, sx, 0.74, d / 2 + 0.07, g, false);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), new THREE.MeshBasicMaterial({ color: 0xf3bf67 }));
  lamp.material.color.multiplyScalar(2.2);
  lamp.position.set(-w * 0.28, h * 0.62, d / 2 + 0.08);
  g.add(lamp);
  // 창: 따뜻한 불빛 한 점 — 마을에 사람이 산다
  const winMat = new THREE.MeshBasicMaterial({ color: 0xe8c988 });
  winMat.color.multiplyScalar(2); // HDR 부스트 — 블룸용 (생성 시 1회)
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.5), winMat);
  win.position.set(w / 2 + 0.03, h * 0.55, (Math.random() - 0.5) * (d * 0.4));
  win.rotation.y = Math.PI / 2;
  g.add(win);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  scene.add(g);
  addRotatedCollider(x, z, w, d, rotY);
  occluders.push(body);
  return g;
}

const CAPERNAUM_HOUSES = [
  [-14, -158, 3, 3.4], [-8, -161, 2.6, 3], [-4, -156, 3.2, 2.8],
  [-16, -152, 2.8, 2.6], [-2, -163, 2.6, 3], [-11, -166, 3, 2.6],
];
for (const [x, z, w, d] of CAPERNAUM_HOUSES) basaltHouse(x, z, w, d, 2.2 + Math.random() * 0.6, Math.random() * Math.PI);

// the synagogue: white limestone hall with a colonnaded porch
{
  const sx = -6, sz = -150;
  const hall = box(7, 4.2, 9, MAT.limestone, sx, 2.1, sz);
  hall.castShadow = true;
  box(7.5, 0.4, 9.5, MAT.limestoneShadow, sx, 4.35, sz);
  for (let i = -2; i <= 2; i++) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 3.8, 16), MAT.limestone);
    col.position.set(sx + i * 1.4, 1.9, sz - 4.6);
    col.castShadow = true;
    scene.add(col);
  }
  addCollider(sx, sz, 7, 10);
  occluders.push(hall);
  landmarkInfo(
    '가버나움 회당',
    `예수께서 안식일에 "서기관들과 같지 않고 권위 있는 이처럼" 가르치신 곳 —
     그리고 더러운 귀신 들린 사람이 온 동네에서 가장 먼저 그를 알아보고 소리친
     곳이다. 오늘날 가버나움에 남은 흰 석회암 폐허는, 베드로가 알던 검은 현무암
     기초 위에 서 있다.`,
    sx, sz, 8.5, { w: 8, h: 5, d: 10 }
  );
}

// Capernaum dock, out to the night-fishing boat (site 9)
function pier(cx, cz, tx, tz, wide = 2.4) {
  const dx = tx - cx, dz = tz - cz, len = Math.hypot(dx, dz);
  const g = new THREE.Group();
  g.position.set((cx + tx) / 2, -0.05, (cz + tz) / 2);
  g.rotation.y = -Math.atan2(dz, dx);
  for (let i = 0; i < 7; i++) {
    const plank = box(len, 0.17, wide / 7 - 0.045, MAT.wood, 0, 0, -wide / 2 + (i + 0.5) * wide / 7, g);
    plank.rotation.z = (Math.random() - 0.5) * 0.012;
  }
  for (const px of [-len * 0.38, len * 0.38]) for (const pz of [-wide * 0.38, wide * 0.38]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 1.25, 10), MAT.woodDark);
    post.position.set(px, -0.5, pz); post.castShadow = true; g.add(post);
  }
  scene.add(g);
  return g;
}
pier(-22, -111, -6, -118, 2.2);

function fishingBoat(x, z, rotY = 0) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.82, 2.85, 6, 16), MAT.wood);
  hull.rotation.x = Math.PI / 2;
  hull.scale.y = 0.52;
  hull.position.y = 0.28;
  hull.castShadow = true;
  const well = new THREE.Mesh(new THREE.CapsuleGeometry(0.62, 2.48, 6, 16), MAT.woodDark);
  well.rotation.x = Math.PI / 2; well.scale.y = 0.13; well.position.y = 0.72;
  for (const sx of [-0.74, 0.74]) {
    const rail = box(0.1, 0.16, 3.4, MAT.woodDark, sx, 0.77, 0, g);
    rail.rotation.z = sx * 0.06;
  }
  for (const bz of [-0.82, 0, 0.82]) box(1.38, 0.09, 0.25, MAT.woodDark, 0, 0.86, bz, g, false);
  const bow = new THREE.Mesh(new THREE.DodecahedronGeometry(0.5, 0), MAT.woodDark);
  bow.scale.set(1, 0.6, 1.3); bow.position.set(0, 0.36, 2.22);
  const stern = bow.clone(); stern.position.z = -2.22;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.095, 3.45, 8), MAT.woodDark);
  mast.position.y = 2.18;
  const sailShape = new THREE.Shape();
  sailShape.moveTo(0.12, 0); sailShape.lineTo(1.18, 0.16); sailShape.lineTo(0.12, 2.5); sailShape.closePath();
  const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), new THREE.MeshStandardMaterial({ color: 0xe7dcc1, roughness: 0.94, side: THREE.DoubleSide, envMapIntensity: 0.14 }));
  sail.position.set(0.02, 1.28, -0.04); sail.rotation.y = 0.1;
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.035, 6, 12), MAT.woodDark);
  rope.rotation.x = Math.PI / 2; rope.position.set(-0.36, 0.9, -0.82);
  g.add(hull, well, bow, stern, mast, sail, rope);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  scene.add(g);
  return g;
}
const nightBoat = fishingBoat(-6, -118, 0.3);
const shoreBoat = fishingBoat(-33, -122, -0.6); // moored where the nets were first let down
// 물 위 걷기용 배 (3번): 물가에 대어져 있다가, 타면 호수 한가운데로 나간다
const wwBoat = fishingBoat(WW_BOARD.x, WW_BOARD.z, Math.PI * 0.75);
// 3번이 남아 있는 동안 돛대에 붉은 깃발이 펄럭인다 — 멀리서도 "저 배구나" 하게
const wwFlag = new THREE.Mesh(
  new THREE.PlaneGeometry(1.5, 0.75).translate(0.75, 0, 0),
  new THREE.MeshBasicMaterial({ color: COLORS.red, side: THREE.DoubleSide })
);
wwFlag.position.set(0, 3.4, 0);
wwBoat.add(wwFlag);

// 그물을 고치고 생선을 말리는 작은 작업장. 시작 순간부터 "빈 모래밭"이 아니라
// 베드로가 막 떠나온 삶의 자리로 읽히게 한다. 전부 정적 메시라 프레임 비용은 없다.
function fishingShoreSet(cx, cz, rotY = 0) {
  const g = new THREE.Group();
  g.position.set(cx, 0, cz);
  g.rotation.y = rotY;

  const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.62, 12, 1, true), MAT.wood);
  basket.position.set(-0.8, 0.31, 0.24);
  basket.castShadow = true;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.035, 6, 12, Math.PI), MAT.woodDark);
  handle.rotation.x = Math.PI / 2;
  handle.position.set(-0.8, 0.62, 0.24);

  const rack = new THREE.Group();
  for (const rx of [-0.84, 0.84]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 1.55, 7), MAT.woodDark);
    post.position.set(rx, 0.78, 0);
    post.rotation.z = rx * 0.1;
    post.castShadow = true;
    rack.add(post);
  }
  rack.add(box(2.05, 0.08, 0.08, MAT.woodDark, 0, 1.32, 0, rack, false));
  for (const rx of [-0.55, -0.18, 0.2, 0.57]) {
    const fish = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), lambert(0xb0b8ab));
    fish.scale.set(0.65, 1.3, 1.6);
    fish.position.set(rx, 1.02 + Math.random() * 0.08, 0.02);
    rack.add(fish);
  }
  rack.position.set(0.55, 0, -0.68);

  // 한 장의 그물에 매듭을 그려 얹는다. 가까이서도 실선이 보이지만 먼 거리에서는 투명하게 녹는다.
  const [netCanvas, netCtx] = canvas2d(192, 192);
  netCtx.clearRect(0, 0, 192, 192);
  netCtx.strokeStyle = 'rgba(63,54,39,0.72)';
  netCtx.lineWidth = 1.8;
  for (let i = -192; i < 384; i += 18) {
    netCtx.beginPath(); netCtx.moveTo(i, 0); netCtx.lineTo(i - 192, 192); netCtx.stroke();
    netCtx.beginPath(); netCtx.moveTo(i, 0); netCtx.lineTo(i + 192, 192); netCtx.stroke();
  }
  const netTex = new THREE.CanvasTexture(netCanvas);
  netTex.colorSpace = THREE.SRGBColorSpace;
  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(2.8, 2.2),
    new THREE.MeshBasicMaterial({ map: netTex, transparent: true, opacity: 0.76, depthWrite: false, side: THREE.DoubleSide })
  );
  net.rotation.x = -Math.PI / 2.18;
  net.rotation.z = -0.16;
  net.position.set(1.15, 0.25, 0.52);

  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.055, 6, 20), MAT.woodDark);
  coil.rotation.x = Math.PI / 2;
  coil.position.set(-0.1, 0.1, 0.9);
  g.add(basket, handle, rack, net, coil);
  scene.add(g);
  return g;
}
fishingShoreSet(-35.5, -114.6, -0.3);
fishingShoreSet(-20.4, -108.6, 0.65);

// 얕은 물가의 갈대는 낮은 십자 쿼드 하나로 묶는다. 바람 애니메이션을 더하지 않아도
// 호수와 육지의 실루엣 사이에 필요한 중간 밀도를 준다.
function reedBed(cx, cz, count = 18) {
  const geos = [];
  for (let i = 0; i < count; i++) {
    const x = cx + rnd(-2.2, 2.2), z = cz + rnd(-1.2, 1.2);
    if (!onHolyLand(x, z)) continue;
    const h = rnd(0.5, 1.15);
    for (const ry of [0, Math.PI / 2]) {
      const blade = new THREE.PlaneGeometry(0.08, h);
      blade.rotateY(ry + rnd(-0.28, 0.28));
      blade.rotateZ(rnd(-0.16, 0.16));
      blade.translate(x, h / 2, z);
      geos.push(blade);
    }
  }
  if (geos.length) scene.add(new THREE.Mesh(
    mergeGeometries(geos, false),
    new THREE.MeshLambertMaterial({ color: 0x667b54, side: THREE.DoubleSide })
  ));
}
reedBed(-27, -113, 24);
reedBed(-24, -145, 22);

// 빛의 길: 배에서 내려 표지까지, 물 위에 떠오르는 반투명 띠 (열렸을 때만 보인다)
const lightPath = (() => {
  const len = Math.hypot(WW_MARKER.x - WW_DROP.x, WW_MARKER.z - WW_DROP.z);
  const geo = new THREE.PlaneGeometry(len, 5);
  geo.rotateX(-Math.PI / 2);
  const [cv, ctx] = canvas2d(256, 64);
  const grad = ctx.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(255,240,200,0)');
  grad.addColorStop(0.5, 'rgba(255,240,200,0.55)');
  grad.addColorStop(1, 'rgba(255,240,200,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 64);
  const tex = new THREE.CanvasTexture(cv);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0 }));
  m.material.color.multiplyScalar(2.5); // HDR 부스트 — 블룸용 (생성 시 1회)
  m.position.set((WW_DROP.x + WW_MARKER.x) / 2, 0.12, (WW_DROP.z + WW_MARKER.z) / 2);
  m.rotation.y = -Math.atan2(WW_MARKER.z - WW_DROP.z, WW_MARKER.x - WW_DROP.x);
  m.visible = false;
  scene.add(m);
  return m;
})();

/* ---------------- Caesarea Philippi ---------------- */
{
  const cx = 16, cz = -183;
  const cliff = box(16, 11, 7, 0x8f8267, cx, 5.5, cz - 4);
  cliff.castShadow = cliff.receiveShadow = true;
  const cave = box(2.4, 3, 3, 0x100e0c, cx, 1.5, cz - 0.6, scene, false);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(2.2, 16), new THREE.MeshStandardMaterial({ color: COLORS.lake, roughness: 0.3 }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(cx, 0.05, cz + 3);
  scene.add(pool);
  addCollider(cx, cz - 3, 16, 8);
  occluders.push(cliff);
  landmarkInfo(
    '판 신의 동굴',
    `이 절벽 아래 동굴에서 샘이 쏟아졌고, 여기 세워진 이방 도성 — 가이사랴
     빌립보 — 은 그 동굴의 신을 수호신으로 삼았다. 사람들은 그 동굴 어귀를
     "하데스의 문"이라 불렀다. 하필 이곳에서 예수께서 베드로에게 그를 누구라
     여기는지 물으셨다.`,
    cx, cz - 4, 14, { w: 16, h: 11, d: 10 }
  );
}

/* ---------------- Jerusalem ---------------- */

function wallSegment(ax, az, bx, bz, h = 7) {
  const len = Math.hypot(bx - ax, bz - az);
  const rotY = -Math.atan2(bz - az, bx - ax);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(len, h, 1.4), MAT.limestoneShadow);
  wall.position.set((ax + bx) / 2, h / 2, (az + bz) / 2);
  wall.rotation.y = rotY;
  wall.castShadow = wall.receiveShadow = true;
  scene.add(wall);
  addRotatedCollider((ax + bx) / 2, (az + bz) / 2, len, 1.4, rotY, 0.3);
  occluders.push(wall);
  return wall;
}
function tower(x, z, h = 9) {
  const t = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.2, h, 10), MAT.limestone);
  t.position.set(x, h / 2, z);
  t.castShadow = t.receiveShadow = true;
  scene.add(t);
  addCollider(x, z, 4, 4);
  occluders.push(t);
}

const WALL_CORNERS = [[-42, 90], [42, 90], [42, 138], [-42, 138]];
// north wall, with a gate for the Jordan road; west wall, with a gate toward
// Golgotha; east wall, with a gate toward Gethsemane; south wall solid.
wallSegment(-42, 90, -6, 90);
wallSegment(6, 90, 42, 90);
wallSegment(-42, 90, -42, 138);
wallSegment(42, 90, 42, 138);
wallSegment(-42, 138, -6, 138);
wallSegment(6, 138, 42, 138);
for (const [x, z] of WALL_CORNERS) tower(x, z);
tower(0, 90, 8);

// the high priest's courtyard (site 6, "the first fire")
{
  const cx = 10, cz = 120;
  wallSegment(cx - 6, cz - 6, cx + 6, cz - 6, 3.4);
  wallSegment(cx - 6, cz - 6, cx - 6, cz + 6, 3.4);
  wallSegment(cx + 6, cz - 6, cx + 6, cz + 6, 3.4);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), lambert(COLORS.limestoneShadow));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, 0.05, cz);
  floor.receiveShadow = true;
  scene.add(floor);
}

// the upper room (site 12, "Pentecost") — a modest house with outside stairs
{
  const ux = 2, uz = 110;
  const house = box(5, 3.4, 5, COLORS.limestone, ux, 1.7, uz);
  house.castShadow = true;
  box(4.6, 0.3, 4.6, COLORS.limestoneShadow, ux, 3.55, uz); // flat roof
  for (let i = 0; i < 5; i++) {
    box(1.4, 0.25, 0.9, COLORS.limestoneShadow, ux - 3.2, 0.3 + i * 0.6, uz - 2.6 + i * 0.75, scene, false);
  }
  addCollider(ux, uz, 5, 5);
  occluders.push(house);
}

// Golgotha, outside the west wall — a landmark, not a numbered site
{
  const gx = -40, gz = 116;
  // 성벽(20유닛 밖)에서도 또렷이 읽히도록 — 언덕도 십자가도 크게, 가운데가 가장 높게
  const mound = new THREE.Mesh(new THREE.ConeGeometry(8, 4.6, 12), lambert(0xa89572));
  mound.position.set(gx, 2.3, gz);
  mound.castShadow = mound.receiveShadow = true;
  scene.add(mound);
  for (const [ox, hgt] of [[-2.4, 3.4], [0, 4.6], [2.4, 3.4]]) {
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.3, hgt, 0.3), lambert(COLORS.cross));
    upright.position.set(gx + ox, 4.4 + hgt / 2, gz);
    upright.castShadow = true;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2, 0.26, 0.26), lambert(COLORS.cross));
    beam.position.set(gx + ox, 4.4 + hgt * 0.76, gz);
    beam.castShadow = true;
    scene.add(upright, beam);
  }
  addCollider(gx, gz, 8, 8);
  landmarkInfo(
    '골고다, "해골"',
    `성벽 바로 바깥의 낮은 바위 언덕으로, 길 위의 무리가 볼 수 있도록 공개 처형에
     쓰였다. 베드로의 사람들은 이천 년의 기억을 통해 이 언덕을 붙들었고, 오늘날
     그 위에는 성묘 교회가 서 있다 — 도성이 오래전에 감싸 안은 성벽 안에.`,
    gx, gz, 11, { w: 11, h: 10, d: 11 }
  );
}

// the garden tomb (site 8) — a rock-cut facade with the stone rolled aside
// kept well north of Golgotha (gx=-40, gz=116) so it's out of sight while
// standing near the crosses, preserving the "멀찍이서" distance of the crucifixion scene
{
  const tx = -38, tz = 148;
  const rock = box(5, 3.2, 3, 0x9a8d6e, tx, 1.6, tz);
  rock.castShadow = rock.receiveShadow = true;
  const doorway = box(1.1, 1.6, 0.3, 0x110f0d, tx, 0.8, tz + 1.55, scene, false);
  const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.35, 16), lambert(0xb7a988));
  stone.rotation.z = Math.PI / 2;
  stone.position.set(tx + 2.2, 0.9, tz + 1.9);
  stone.castShadow = true;
  scene.add(stone);
  for (let i = 0; i < 6; i++) tree(tx + rnd(-4, 5), tz + rnd(-4, 5), 0.5 + Math.random() * 0.3);
  addCollider(tx, tz, 5, 3);
  occluders.push(rock);
}

/* ---------------- Joppa, and the road's end ---------------- */
{
  const jx = JOPPA_BOARD.x, jz = JOPPA_BOARD.z;
  const dockShore = { x: jx + 8, z: jz };
  pier(dockShore.x, dockShore.z, jx - 6, jz, 3);
  const office = box(3, 2.6, 2.6, COLORS.limestone, jx + 9, 1.3, jz + 3);
  office.castShadow = true;
  addCollider(jx + 9, jz + 3, 3, 2.6);
  const ship = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.3, 9), lambert(0x5a4a38));
  hull.position.y = 0.65;
  hull.castShadow = true;
  const mast1 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 12), lambert(COLORS.woodDark));
  mast1.position.set(0, 4, 1);
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(3, 4), new THREE.MeshLambertMaterial({ color: 0xe8dfc4, side: THREE.DoubleSide }));
  sail.position.set(0, 4.6, 1);
  ship.add(hull, mast1, sail);
  ship.position.set(jx - 8, 0, jz);
  ship.rotation.y = Math.PI / 2;
  scene.add(ship);
}

/* ---------------- Rome ---------------- */
{
  const bx = BASILICA_POS.x, bz = BASILICA_POS.z;
  const facade = box(20, 9, 4, COLORS.limestone, bx, 4.5, bz + 8);
  facade.castShadow = true;
  for (let i = -4; i <= 4; i++) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.55, 8.6, 12), lambert(COLORS.limestone));
    col.position.set(bx + i * 2.1, 4.3, bz + 10.4);
    col.castShadow = true;
    scene.add(col);
  }
  // 영웅 건물만 부드럽게 — 돔·드럼 세그먼트 상향 + PMREM에 반응하는 재질
  const drum = new THREE.Mesh(
    new THREE.CylinderGeometry(6.5, 7, 6, 32),
    new THREE.MeshStandardMaterial({ color: COLORS.limestoneShadow, roughness: 0.7, envMapIntensity: 0.6 })
  );
  drum.position.set(bx, 12, bz);
  drum.castShadow = true;
  const domeMat = new THREE.MeshStandardMaterial({
    color: COLORS.goldBright, metalness: 0.85, roughness: 0.3, emissive: 0x4a3a0c,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(6.8, 32, 20, 0, Math.PI * 2, 0, Math.PI / 1.9), domeMat);
  dome.position.set(bx, 15, bz);
  dome.castShadow = true;
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 2.4, 10), lambert(COLORS.limestone));
  lantern.position.set(bx, 21.5, bz);
  // 금 십자가: 진짜 금속 반응 — 환경맵이 반짝임을 살린다
  const crossMat = new THREE.MeshStandardMaterial({ color: COLORS.goldBright, metalness: 0.9, roughness: 0.25 });
  const crossBeamV = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.2, 0.28), crossMat);
  crossBeamV.position.set(bx, 24, bz);
  const crossBeamH = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.28, 0.28), crossMat);
  crossBeamH.position.set(bx, 24.6, bz);
  scene.add(facade, drum, dome, lantern, crossBeamV, crossBeamH);
  addCollider(bx, bz + 8, 20, 5);
  addCollider(bx, bz, 13, 13, 0.2);
  occluders.push(facade, drum);
  window.__basilica = { dome: new THREE.Vector3(bx, 15, bz), lantern: new THREE.Vector3(bx, 24, bz) };

  const obelisk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.9, 12, 4), lambert(0xc9b48a));
  obelisk.position.set(bx - 4, 6, bz + 20);
  obelisk.rotation.y = Math.PI / 4;
  obelisk.castShadow = true;
  scene.add(obelisk);
  landmarkInfo(
    '네로의 오벨리스크',
    `칼리굴라가 이집트에서 가져온 이 오벨리스크는 네로의 원형경기장 한복판에
     서서, 주후 64년의 박해를 그 자리에서 지켜보았다. 그리고 한 번도 움직이지
     않은 유일한 증인으로, 오늘날 언제나 있던 그 자리에서 몇백 걸음 떨어진 성
     베드로 광장에 서 있다.`,
    bx - 4, bz + 20, 13, { w: 3, h: 12, d: 3 }
  );

  // the rough oval trace of Nero's circus in the turf
  const ringPts = [];
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    ringPts.push(new THREE.Vector3(bx - 4 + Math.cos(a) * 22, 0.06, bz + 20 + Math.sin(a) * 11));
  }
  const ringGeo = new THREE.BufferGeometry().setFromPoints(ringPts);
  scene.add(new THREE.Line(ringGeo, new THREE.LineBasicMaterial({ color: 0x8a7a5a })));
}

/* ---------------- site markers ---------------- */

const markers = SITES.map((site, i) => {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.5, 2.45, 32),
    new THREE.MeshBasicMaterial({ color: COLORS.goldBright, transparent: true, opacity: 0.72, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.18;
  const pinMat = new THREE.MeshStandardMaterial({
    color: COLORS.red, emissive: 0x3a0e08, emissiveIntensity: 0.55,
    roughness: 0.38, metalness: 0.14, envMapIntensity: 0.75,
  });
  const brass = new THREE.MeshStandardMaterial({ color: COLORS.goldBright, roughness: 0.3, metalness: 0.82, envMapIntensity: 1.1 });
  // 지도 핀 대신, 발밑의 금 테와 위의 보석 등불로 이루어진 순례 표지.
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.98, 0.34, 10), MAT.basalt);
  plinth.position.y = 0.17;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, 2.35, 10), brass);
  shaft.position.y = 1.35;
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.07, 7, 14), brass);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = 2.12;
  const lantern = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7, 2), pinMat);
  lantern.position.y = 2.75;
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.88, 0.055, 6, 18), brass);
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 2.75;
  halo.rotation.z = Math.PI / 6;
  lantern.castShadow = shaft.castShadow = plinth.castShadow = true;
  const spriteMats = {
    red: numberSpriteMat(site.num, '#a8341f'),
    gray: numberSpriteMat(site.num, '#8b8478'),
    ink: numberSpriteMat(site.num, '#3b352c'),
  };
  const sprite = new THREE.Sprite(spriteMats.gray);
  sprite.scale.set(2.75, 2.75, 1);
  sprite.position.y = 4.65;
  const pin = new THREE.Group();
  pin.add(plinth, shaft, collar, lantern, halo);
  g.add(ring, pin, sprite);
  g.position.set(site.pos.x, 0, site.pos.z);
  scene.add(g);
  return {
    site,
    shortTitle: site.title.split('—')[0].trim(),
    g, pin, ring, sprite, spriteMats, pinMat, phase: i * 0.9, visited: false, styleState: null,
  };
});
const markerById = {};
markers.forEach((m) => { markerById[m.site.id] = m; });
const firePositions = ['first-fire', 'second-fire'].map(
  (id) => markers.find((m) => m.site.id === id).site.pos
);

// a small glowing fire prop, reused at the first and second fires
function fireProp(x, z) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 0.2, 10), lambert(0x2a2620));
  ring.position.y = 0.1;
  const glow = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 0.7, 8),
    new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.85 })
  );
  glow.material.color.multiplyScalar(3.5); // HDR 부스트 — 블룸용 (생성 시 1회)
  glow.position.y = 0.5;
  const light = new THREE.PointLight(0xff9040, 1.4, 9, 2);
  light.position.y = 0.6;
  g.add(ring, glow, light);
  g.position.set(x, 0, z);
  scene.add(g);
  return { g, glow, light };
}
const fires = firePositions.map(({ x, z }) => fireProp(x, z));

/* ---------------- the man himself ---------------- */

// 로브 회전 곡면: 어깨에서 허리로 좁아졌다 밑단으로 흘러 퍼지는 조각 실루엣.
// 목둘레는 캡으로 닫는다 (위에서 내려다볼 때 빈 통이 아니게).
function robeLatheGeo(shoulderR, waistR, hemR, height) {
  const h2 = height / 2;
  // 프로필은 y 오름차순 — 내림차순이면 와인딩이 뒤집혀 겉면이 컬링된다
  const pts = new THREE.SplineCurve([
    new THREE.Vector2(hemR, -h2),
    new THREE.Vector2((waistR + hemR) / 2, -h2 * 0.55),
    new THREE.Vector2(waistR, h2 * 0.05),
    new THREE.Vector2(shoulderR * 1.04, h2 * 0.55),
    new THREE.Vector2(shoulderR, h2),
  ]).getPoints(14);
  pts.push(new THREE.Vector2(0.02, h2));
  return new THREE.LatheGeometry(pts, 24);
}

const player = new THREE.Group();
{
  // 성인 어부의 실루엣: 어깨가 가장 넓고 천이 곧게 떨어지다 밑단만 살짝 퍼진다.
  // (V2의 hem 0.85는 데스크톱에서 원피스 입은 아이처럼 읽혀 0.68로 좁혔다)
  const robe = new THREE.Mesh(
    robeLatheGeo(0.42, 0.44, 0.68, 2.05),
    // envMapIntensity를 낮춰 파치먼트 팔레트를 지킨다 — 밝은 하늘 환경맵이 색을 바래게 하지 않게
    new THREE.MeshStandardMaterial({ color: COLORS.robe, roughness: 0.85, envMapIntensity: 0.5 })
  );
  robe.position.y = 1.52;
  robe.castShadow = true;
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.07, 12, 28), lambert(COLORS.woodDark));
  sash.rotation.x = Math.PI / 2;
  sash.position.y = 1.35;
  // 클록: 로브 겉에 걸친 덧옷 — 등은 부풀리고 앞은 눌러 로브 속으로 가라앉혀
  // 앞에서는 어깨·옆선의 청록 띠로, 뒤에서는 통짜 망토로 읽힌다
  const cloakGeo = (() => {
    const pts = new THREE.SplineCurve([
      new THREE.Vector2(0.66, -0.65),
      new THREE.Vector2(0.58, -0.42),
      new THREE.Vector2(0.53, -0.05),
      new THREE.Vector2(0.47, 0.36),
      new THREE.Vector2(0.1, 0.66),
    ]).getPoints(14);
    pts.push(new THREE.Vector2(0.02, 0.66));
    const g = new THREE.LatheGeometry(pts, 24);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getZ(i);
      p.setZ(i, z < 0 ? z * 1.22 : z * 0.78); // 등의 볼륨 / 앞섶은 로브 안으로
    }
    g.computeVertexNormals();
    return g;
  })();
  const cloak = new THREE.Mesh(cloakGeo, new THREE.MeshStandardMaterial({ color: COLORS.cloak, roughness: 0.85, side: THREE.DoubleSide, envMapIntensity: 0.5 }));
  cloak.position.y = 1.9;
  cloak.position.z = -0.05;
  cloak.castShadow = true;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.415, 24, 20), // -10%: 얼굴이 몸을 잡아먹지 않게
    new THREE.MeshStandardMaterial({ color: 0xc99a72, roughness: 0.6, envMapIntensity: 0.5 })
  );
  head.position.y = 2.9;
  head.castShadow = true;
  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.29, 16, 12), lambert(0x4a4038)); // -15%
  beard.position.set(0, 2.66, 0.22);
  beard.scale.set(1, 1.15, 0.9); // 턱의 곡선을 따라 아래로 길게
  // 두건: 머리 뒤에서 어깨로 흘러내리는 반구 셸 — 뒷모습의 윤곽을 만든다
  const mantle = new THREE.Mesh(
    new THREE.SphereGeometry(0.46, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), // 작아진 머리에 맞춤
    new THREE.MeshLambertMaterial({ color: COLORS.mantle, side: THREE.DoubleSide })
  );
  mantle.position.set(0, 2.62, -0.15);
  mantle.rotation.x = -0.45; // 살짝 뒤로 기울여 목덜미를 덮는다
  mantle.scale.set(0.9, 1, 1); // 정면에서 귀처럼 삐져나오지 않게 좌우만 좁힌다
  mantle.castShadow = true;
  // 클록 밑단 트림 + 등의 세로 여밈선 — 같은 색이라 한 메시로 합친다 (V3 곡면에 맞춰 재정렬)
  const trimGeo = new THREE.TorusGeometry(0.6, 0.03, 6, 24);
  trimGeo.rotateX(Math.PI / 2);
  trimGeo.translate(0, 1.28, -0.08);
  const seamGeo = new THREE.BoxGeometry(0.035, 1.05, 0.1); // 도톰해야 곡면 위로 읽힌다
  seamGeo.rotateX(0.26); // 부풀린 등(z×1.22)의 완만한 경사를 따라 눕힌다
  seamGeo.translate(0, 1.78, -0.7);
  const trim = new THREE.Mesh(mergeGeometries([trimGeo, seamGeo], false), lambert(COLORS.woodDark));
  trim.castShadow = true;
  // 머리채: 뒤통수의 어두운 캡 — 뒤에서 봐도 맨들한 공이 아니게
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.435, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), // 머리 -10%에 맞춤
    lambert(0x4a4038)
  );
  hair.position.set(0, 2.92, -0.03);
  hair.rotation.x = -Math.PI / 2 + 0.5; // 돔이 뒤통수와 정수리를 함께 덮도록
  // 눈: 얼굴이 돌 때의 생기 — 카드와 컷신을 위해 (두 알을 한 메시로)
  const eyeGeoL = new THREE.SphereGeometry(0.045, 6, 5);
  eyeGeoL.translate(-0.15, 2.97, 0.4); // 작아진 머리의 곡면 위로
  const eyeGeoR = eyeGeoL.clone();
  eyeGeoR.translate(0.3, 0, 0);
  const eyes = new THREE.Mesh(mergeGeometries([eyeGeoL, eyeGeoR], false), lambert(COLORS.ink));
  player.add(robe, sash, cloak, head, beard, mantle, trim, hair, eyes);
}
const legGeo = new THREE.CapsuleGeometry(0.15, 0.65, 4, 8); // 둥근 사지 — 박스에서 조각으로
legGeo.translate(0, -0.45, 0);
const legL = new THREE.Mesh(legGeo, lambert(0xc99a72));
const legR = legL.clone();
legL.position.set(-0.24, 0.95, 0);
legR.position.set(0.24, 0.95, 0);
legL.castShadow = legR.castShadow = true;
player.add(legL, legR);
// 샌들: 다리 박스 발치의 나무색 판 — legL/legR의 자식이라 걸음의 스윙을 자동 추종
const sandalL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.06, 0.3), lambert(COLORS.woodDark));
sandalL.position.set(0, -0.93, 0.03);
const sandalR = sandalL.clone();
legL.add(sandalL);
legR.add(sandalR);
// 팔: 어깨에서 걸음에 맞춰 다리와 반대로 흔들린다
const armGeo = new THREE.CapsuleGeometry(0.11, 0.73, 4, 8);
armGeo.translate(0, -0.42, 0);
const armL = new THREE.Mesh(armGeo, lambert(COLORS.robe));
const armR = armL.clone();
armL.position.set(-0.52, 2.38, 0); // V3 로브의 곧은 어깨선에 붙인다
armR.position.set(0.52, 2.38, 0);
armL.castShadow = armR.castShadow = true;
player.add(armL, armR);
// 손: 팔 끝의 살구색 구 — armL/armR의 자식이라 팔의 회전을 자동 추종
const handL = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12), lambert(0xc99a72));
handL.position.y = -0.92;
const handR = handL.clone();
armL.add(handL);
armR.add(handR);
player.scale.setScalar(0.58);
player.position.set(-30, 0, -112);
player.rotation.y = 0;
scene.add(player);

// 발의 등불 (시 119:105): 예루살렘의 밤길에서만 손에 들려 켜진다
const lampG = new THREE.Group();
const lampFlame = new THREE.Mesh(
  new THREE.ConeGeometry(0.09, 0.18, 6),
  new THREE.MeshBasicMaterial({ color: 0xffc860 })
);
lampFlame.material.color.multiplyScalar(4); // HDR 부스트 — 블룸용 (생성 시 1회)
{
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.16), lambert(0x4a3a28));
  lampFlame.position.y = 0.19;
  lampG.add(body, lampFlame);
  lampG.position.set(0.55, 1.62, 0.28);
  lampG.visible = false;
  player.add(lampG);
}
const lampLight = new THREE.PointLight(0xf5c878, 0, 14, 2);
lampLight.position.y = 2;
player.add(lampLight);
let lampLerp = 0;     // 목표 강도 lerp 상태 — 플리커는 이 결과에 곱해서만
let lampSeen = false; // 첫 점등의 자막은 한 세션에 한 번

camera.position.set(
  player.position.x + Math.sin(cam.yaw) * cam.dist,
  cam.height,
  player.position.z + Math.cos(cam.yaw) * cam.dist
);
camera.lookAt(player.position);

const beacon = new THREE.Group();
const beaconMat = new THREE.MeshBasicMaterial({ color: 0xc9a227 });
const beaconCone = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.6, 4), beaconMat);
beaconCone.geometry.rotateX(Math.PI);
beaconCone.position.y = 7;
const beaconRing = new THREE.Mesh(
  new THREE.RingGeometry(2.2, 3, 24),
  new THREE.MeshBasicMaterial({ color: 0xc9a227, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
);
beaconRing.rotation.x = -Math.PI / 2;
beaconRing.position.y = 0.3;
beacon.add(beaconCone, beaconRing);
beacon.visible = false;
scene.add(beacon);

// the voyage boat (visible only during the scripted Rome crossing)
const voyageBoat = fishingBoat(0, 0, 0);
{
  const bigger = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1, 6.5), lambert(COLORS.wood));
  bigger.position.y = 0.5;
  voyageBoat.add(bigger);
}
voyageBoat.visible = false;

// 요한(사랑하시던 제자)의 반투명 형상 — 빈 무덤 달음질(요 20:4)에서 앞질러 달린다
const ghostJohn = new THREE.Group();
{
  const gm = () => new THREE.MeshBasicMaterial({ color: 0xdfeaf2, transparent: true, opacity: 0.5, depthWrite: false });
  const robe = new THREE.Mesh(robeLatheGeo(0.27, 0.36, 0.64, 2), gm());
  robe.position.y = 1;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), gm());
  head.position.y = 2.5;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.9, 0.26), gm());
  const legR = legL.clone();
  legL.position.set(-0.2, 0.45, 0);
  legR.position.set(0.2, 0.45, 0);
  ghostJohn.add(robe, head, legL, legR);
  ghostJohn.userData.legL = legL;
  ghostJohn.userData.legR = legR;
  ghostJohn.scale.setScalar(0.58);
  ghostJohn.visible = false;
  scene.add(ghostJohn);
}
const TOMB_MOUTH = { x: -37, z: 151 };

/* ---------------- 길 위의 생명: 양 떼·목자·낙타·호수의 배·성벽 횃불 ---------------- */

// 양 한 마리
function makeSheep(x, z) {
  const g = new THREE.Group();
  const wool = new THREE.MeshLambertMaterial({ color: 0xe8e2d2 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 22, 16), wool);
  body.scale.set(1.3, 0.9, 1);
  body.position.y = 0.7;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.34, 0.36), lambert(0x4a4038));
  head.position.set(0, 0.75, 0.62);
  for (const [lx, lz] of [[-0.28, -0.3], [0.28, -0.3], [-0.28, 0.3], [0.28, 0.3]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.12), lambert(0x3a3229));
    leg.position.set(lx, 0.25, lz);
    g.add(leg);
  }
  g.add(body, head);
  g.position.set(x, 0, z);
  g.scale.setScalar(0.7);
  scene.add(g);
  return g;
}
// 요단 길 가에서 풀 뜯는 양 떼와 목자
const sheep = [];
let shepherdG = null;
{
  const cx = 4, cz = 30; // 남쪽 요단 길가
  for (let i = 0; i < 7; i++) {
    const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 5;
    const sx = cx + Math.cos(a) * r, sz = cz + Math.sin(a) * r;
    if (!onHolyLand(sx, sz)) continue;
    sheep.push({ g: makeSheep(sx, sz), hx: sx, hz: sz, ph: Math.random() * 6, dir: Math.random() * Math.PI * 2, t: Math.random() * 3 });
  }
  // 목자: 지팡이를 든 형상
  const shep = new THREE.Group();
  const robe = new THREE.Mesh(robeLatheGeo(0.26, 0.34, 0.62, 2), lambert(0x6a5a44));
  robe.position.y = 1;
  robe.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), lambert(0xc99a72));
  head.position.y = 2.35;
  const crook = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 12), lambert(0x5a4128));
  crook.position.set(0.5, 1.3, 0);
  crook.rotation.z = 0.12;
  shep.add(robe, head, crook);
  shep.position.set(cx - 6, 0, cz - 2);
  shep.scale.setScalar(0.62);
  scene.add(shep);
  shepherdG = shep; // 잃은 양 퀘스트의 말풍선이 여기 걸린다
}

// 호수를 가로지르는 작은 돛단배 (밤낮 없이 잔잔히 오간다)
const lakeBoats = [];
{
  const mk = (x, z, dir) => {
    const b = fishingBoat(x, z, dir > 0 ? 0 : Math.PI);
    lakeBoats.push({ g: b, z0: -150, z1: -108, x, dir, speed: 1.4 + Math.random() * 0.8, ph: Math.random() * 6 });
  };
  mk(-14, -120, 1);
  mk(18, -140, -1);
}

// 예루살렘 성벽 위의 횃불 (밤이라 은은히 빛난다)
const torches = [];
{
  const spots = [
    [-42, 100], [-42, 128], [42, 100], [42, 128],
    [-20, 90], [20, 90], [0, 138], [-30, 138],
  ];
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.9, fog: false });
  flameMat.color.multiplyScalar(3.5); // HDR 부스트 — 블룸용 (clone들이 색을 물려받는다)
  for (const [x, z] of spots) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.2, 10), lambert(0x2a2018));
    post.position.set(x, 7.6, z);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.7, 7), flameMat.clone());
    flame.position.set(x, 8.5, z);
    scene.add(post, flame);
    torches.push(flame);
  }
}

// 남쪽 길을 느릿느릿 오가는 낙타 대상 행렬
function makeCamel() {
  const g = new THREE.Group();
  const hide = lambert(0xb08a5a);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 1.7), hide);
  body.position.y = 1.5;
  body.castShadow = true;
  for (const hx of [-0.25, 0.35]) {
    const hump = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 12), hide);
    hump.position.set(0, 2, hx);
    g.add(hump);
  }
  const neck = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1, 0.34), hide);
  neck.position.set(0, 2, 0.95);
  neck.rotation.x = -0.5;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.36, 0.5), hide);
  head.position.set(0, 2.55, 1.3);
  for (const [lx, lz] of [[-0.25, -0.6], [0.25, -0.6], [-0.25, 0.6], [0.25, 0.6]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.5, 0.14), hide);
    leg.position.set(lx, 0.75, lz);
    g.add(leg);
  }
  g.add(body, neck, head);
  scene.add(g);
  return g;
}
const caravan = { camels: [], u: 0, path: [[6, -60], [-4, -20], [4, 20], [-4, 60]] };
for (let i = 0; i < 3; i++) caravan.camels.push({ g: makeCamel(), lag: i * 0.05 });

/* ---------------- gulls ---------------- */

const gulls = [];
{
  const gullMat = new THREE.MeshBasicMaterial({ color: 0x3a352e, side: THREE.DoubleSide });
  for (let i = 0; i < 5; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.55), gullMat);
    const w1 = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.28).translate(-0.5, 0, 0).rotateX(-Math.PI / 2), gullMat);
    const w2 = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.28).translate(0.5, 0, 0).rotateX(-Math.PI / 2), gullMat);
    g.add(body, w1, w2);
    scene.add(g);
    const h = 8 + Math.random() * 5;
    gulls.push({
      g, w1, w2, h, y: h,
      cx: 0, cz: -129,
      r: 10 + Math.random() * 16,
      a: Math.random() * Math.PI * 2,
      s: 0.22 + Math.random() * 0.22,
      flap: 0, gliding: Math.random() < 0.5, st: 1 + Math.random() * 3,
    });
  }
}

/* ---------------- 하늘: 해 · 달 · 별 · 구름 ----------------
   지역의 시간(warmth)에 따라 해와 구름은 낮에, 달과 별은 예루살렘의
   밤에 떠오른다. 전부 프로시저럴 — 파일 에셋 없음. */

function radialSprite(stops, size = 256) {
  const [cv, c] = canvas2d(size, size);
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [k, col] of stops) g.addColorStop(k, col);
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false, opacity: 0 }));
}
const sunSprite = radialSprite([[0, 'rgba(255,248,224,1)'], [0.14, 'rgba(255,242,205,0.9)'], [0.4, 'rgba(250,232,185,0.3)'], [1, 'rgba(250,232,185,0)']]);
sunSprite.material.color.multiplyScalar(1.6); // HDR 부스트 — 면적이 커서 은은하게
sunSprite.scale.setScalar(120);
sunSprite.renderOrder = -10;
scene.add(sunSprite);
const moonSprite = radialSprite([[0, 'rgba(235,240,250,1)'], [0.1, 'rgba(225,232,246,0.95)'], [0.16, 'rgba(215,224,242,0.25)'], [1, 'rgba(215,224,242,0)']]);
moonSprite.material.color.multiplyScalar(1.6); // HDR 부스트 — 면적이 커서 은은하게
moonSprite.scale.setScalar(60);
moonSprite.renderOrder = -10;
scene.add(moonSprite);
const SUN_DIR = new THREE.Vector3(0.55, 0.5, 0.42).normalize();
const MOON_DIR = new THREE.Vector3(-0.4, 0.55, -0.5).normalize();

// 지평선 능선: 먼 산들의 실루엣 — 안개 밖(fog:false)에서 플레이어를 따라다닌다.
// 캔버스 한 장을 네 방위가 나눠 쓴다 (거울상·스케일로 변주) — 텍스처 예산.
const ridgeTex = (() => {
  const [cv, c] = canvas2d(512, 128);
  c.fillStyle = '#ffffff';
  c.beginPath();
  c.moveTo(0, 128);
  let y = 78;
  for (let x = 0; x <= 512; x += 8) {
    y += (Math.random() - 0.5) * 14 + (58 - y) * 0.04; // 랜덤워크 봉우리
    c.lineTo(x, Math.max(18, Math.min(112, y)));
  }
  c.lineTo(512, 128);
  c.closePath();
  c.fill();
  // 좌우 끝을 투명으로 흘려보낸다 — 물리 하늘(G5) 위에서 스프라이트의 수직 절단선이 드러나지 않게
  c.globalCompositeOperation = 'destination-out';
  for (const [x0, x1] of [[0, 40], [512, 472]]) {
    const g = c.createLinearGradient(x0, 0, x1, 0);
    g.addColorStop(0, 'rgba(0,0,0,1)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(Math.min(x0, x1), 0, 40, 128);
  }
  c.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
})();
const ridgeMat = new THREE.SpriteMaterial({ map: ridgeTex, transparent: true, depthWrite: false, fog: false, opacity: 0 });
const RIDGE_NIGHT = new THREE.Color(0x252c42); // 밤: 진한 남색 실루엣
const RIDGE_DAY = new THREE.Color(0xa39781);   // 낮: 옅은 흙빛 헤이즈
const ridges = [
  { dir: new THREE.Vector3(0, 0, -1), sx: 950, sy: 170 },   // 북: 골란 고원 — 높다
  { dir: new THREE.Vector3(1, 0, 0), sx: -880, sy: 140 },   // 동: 모압 산지 (거울상)
  { dir: new THREE.Vector3(-1, 0, 0), sx: 900, sy: 95 },    // 서: 지중해 쪽 낮은 언덕
  { dir: new THREE.Vector3(-0.66, 0, 0.75).normalize(), sx: -860, sy: 110 }, // 남서
].map((r) => {
  const sp = new THREE.Sprite(ridgeMat);
  sp.center.set(0.5, 0); // 하단 기준 — 능선 밑동이 지평선에 온다
  sp.scale.set(r.sx, r.sy, 1);
  sp.renderOrder = -9; // 해·달(-10)보다 뒤에 그려져 앞을 가린다
  sp.userData.dir = r.dir;
  scene.add(sp);
  return sp;
});

// 해 무리: 해 스프라이트 뒤의 큰 additive 광륜 — 낮의 하늘에 깊이를 준다
const sunHalo = radialSprite([[0, 'rgba(255,228,170,0.55)'], [0.4, 'rgba(255,214,150,0.2)'], [1, 'rgba(255,214,150,0)']]);
sunHalo.material.blending = THREE.AdditiveBlending;
sunHalo.scale.setScalar(360);
sunHalo.renderOrder = -10;
scene.add(sunHalo);

// 햇빛 반짝임 길: 호수 수면 위, 해 쪽으로 길게 눕는 additive 띠 — 낮에만
const sunGlint = (() => {
  const geo = new THREE.PlaneGeometry(34, 5);
  geo.rotateX(-Math.PI / 2);
  const [cv, c] = canvas2d(128, 128);
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,244,206,0.9)');
  g.addColorStop(0.5, 'rgba(255,238,190,0.35)');
  g.addColorStop(1, 'rgba(255,238,190,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0,
  }));
  m.position.set(0, 0.1, -129); // 호수 한가운데
  m.rotation.y = -Math.atan2(SUN_DIR.z, SUN_DIR.x); // 해의 방위각 방향으로
  scene.add(m);
  return m;
})();

// 별밭: 위쪽 반구에 뿌린 점들 — 밤에만 배어 나온다
const stars = (() => {
  const N = 380;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2;
    const alt = 0.12 + Math.random() * 0.85; // 지평선 위
    const r = 760;
    pos[i * 3] = Math.cos(a) * Math.cos(alt * Math.PI / 2) * r;
    pos[i * 3 + 1] = Math.sin(alt * Math.PI / 2) * r;
    pos[i * 3 + 2] = Math.sin(a) * Math.cos(alt * Math.PI / 2) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(geo, new THREE.PointsMaterial({
    color: 0xe8ecf5, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false,
  }));
  p.material.color.multiplyScalar(2.5); // HDR 부스트 — 블룸용 (생성 시 1회)
  p.renderOrder = -11;
  scene.add(p);
  return p;
})();

// 구름: 낮 하늘을 흐르는 반투명 무리
const clouds = [];
{
  const cloudTex = () => {
    const [cv, c] = canvas2d(256, 128);
    for (let i = 0; i < 9; i++) {
      const x = 40 + Math.random() * 176, y = 46 + Math.random() * 40, r = 20 + Math.random() * 30;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(246,241,228,0.5)');
      g.addColorStop(1, 'rgba(246,241,228,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 256, 128);
    }
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  const texes = [cloudTex(), cloudTex(), cloudTex()];
  for (let i = 0; i < 6; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: texes[i % 3], transparent: true, depthWrite: false, fog: false, opacity: 0 }));
    const w = 80 + Math.random() * 70;
    sp.scale.set(w, w * 0.4, 1);
    sp.position.set(-300 + Math.random() * 600, 150 + Math.random() * 50, -260 + Math.random() * 520);
    sp.renderOrder = -9;
    scene.add(sp);
    clouds.push({ sp, speed: 0.8 + Math.random() * 0.9, peak: 0.35 + Math.random() * 0.2 });
  }
}

// 원경 산맥: 지평선을 채우는 실루엣 — 안개가 깊이를 만들어 준다
{
  const mtn = (x, z, r, h, col) => {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 28), new THREE.MeshLambertMaterial({ color: col }));
    m.position.set(x, h / 2 - 2, z);
    m.rotation.y = Math.random();
    scene.add(m);
  };
  // 동편 산줄기 (요단 건너) — 멀리, 낮게, 안개에 잠기도록
  for (let i = 0; i < 9; i++) {
    const z = -260 + i * 62 + Math.random() * 24;
    mtn(190 + Math.random() * 60, z, 30 + Math.random() * 20, 16 + Math.random() * 14, 0xbdb197);
  }
  // 북쪽 헤르몬 산 — 가이사랴 빌립보 뒤 지평선에
  mtn(60, -340, 46, 30, 0xc4bcac);
  mtn(-20, -330, 36, 20, 0xbdb197);
  // 남쪽 유대 광야
  for (let i = 0; i < 4; i++) mtn(-50 + i * 52, 300 + Math.random() * 30, 34, 13 + Math.random() * 10, 0xb5a888);
  // 로마 뒤편 언덕
  mtn(-330, 30, 40, 18, 0xbdb197);
  mtn(-360, 120, 44, 22, 0xb5ab93);
}

/* ---------------- day/night by region, and the finale's gold ---------------- */

let duskW = 0.35;
let lastSkyW = 0.35;
const FOG_DAY = new THREE.Color(0xcdbf9a), FOG_NIGHT = new THREE.Color(0x2a2c3a), FOG_DUSK = new THREE.Color(0xd9a066);
const SUN_DAY = new THREE.Color(0xfff0c8), SUN_NIGHT = new THREE.Color(0x39415c), SUN_DUSK = new THREE.Color(0xffb070);
function lerp3(out, a, b, c, t) {
  return t <= 0.5 ? out.lerpColors(a, b, t * 2) : out.lerpColors(b, c, (t - 0.5) * 2);
}
function applyWarmth(w) {
  duskW = w;
  renderer.toneMappingExposure = 1.0 + 0.12 * w; // 밤은 차분하게, 낮은 환하게
  if (Math.abs(w - lastSkyW) > 0.015) { setSky(w); lastSkyW = w; }
  lerp3(scene.fog.color, FOG_NIGHT, FOG_DAY, FOG_DUSK, w);
  lerp3(sun.color, SUN_NIGHT, SUN_DAY, SUN_DUSK, w);
  sun.intensity = 1.1 + 1.5 * Math.sin(Math.min(1, w) * Math.PI * 0.85);
  hemi.intensity = 0.55 + 0.7 * w;
  // 물리 하늘: 밤(w<0.3)엔 숨고 캔버스 하늘이 밤을 맡는다 — 그 경계는 돔이 크로스페이드
  if (skyOn) {
    sky.visible = w >= 0.3;
    if (sky.visible) setSkyUniforms(sky, w);
    updateEnvironment(w);
  }
  if (reflWater) reflWater.material.uniforms.sunColor.value.copy(sun.color);
}
applyWarmth(0.35);

// Each region of the journey has its own light: Galilee in morning gold,
// the road south dimming, Jerusalem at night, Rome in a settled afternoon.
function regionWarmth(x, z) {
  if (onRome(x, z) || x < -150) return 0.55;
  if (z < -95) return 0.85;               // Galilee: morning
  if (z > 88) return 0.12;                // Jerusalem: night
  const t = Math.min(1, Math.max(0, (z - (-95)) / (88 - (-95))));
  return 0.85 - t * 0.73;                  // the road south, dimming
}

/* ---------------- input ---------------- */

const keys = {};
window.addEventListener('keydown', (e) => {
  // 이름 입력·말씀 옮겨 적기 중엔 게임 키를 먹지 않는다
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  keys[e.code] = true;
  if (credits) { skipCredits(); return; } // 크레딧: 아무 키나 눌러 건너뛴다
  // 쉬어가기 — 쉬는 중이면 다시 걷기. 쉴 수 없는 자리(컷신)에선 삼키지 않고
  // 아래의 건너뛰기 사슬로 흘려보낸다 (Esc로도 컷신을 넘길 수 있게).
  if (e.code === 'Escape' && (paused || canPause())) { togglePause(); return; }
  if (paused) return; // 쉬는 동안 다른 키는 조용히 잠든다
  if (finale) { skipFinale(); return; }
  if (voyage) { skipVoyage(); return; }
  if (eclipse) { skipEclipse(); return; }
  if (sleepFx) { resistSleep(); return; } // 겟세마네: 아무 키나 눌러 버틴다
  if (sitting) { standUp(); return; } // 앉아 쉬는 중: 아무 키나 눌러 일어난다
  if (waterWalk && waterWalk.phase !== 'walk') { skipWaterWalk(); return; } // 승선/귀환 컷신은 건너뛰기, 물 위 걷기 중엔 정상 조작
  if ((e.code === 'KeyE' || e.code === 'Enter') && state.started) tryVisit();
  if (e.code === 'KeyM' && state.started) toggleView();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
// 창을 떠나면(Alt-Tab, 다른 앱) keyup을 놓친다 — 돌아왔을 때 혼자 걷지 않도록 비운다
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

const joy = { id: null, ox: 0, oy: 0, dx: 0, dy: 0, mag: 0 };
const look = { id: null, lx: 0, ly: 0, sx: 0, sy: 0 };
const joyEl = document.getElementById('joystick');
const stickEl = document.getElementById('stick');

function onUi(e) {
  return e.target.closest && e.target.closest('button, #chart-key, .overlay, #compass');
}

window.addEventListener('pointerdown', (e) => {
  if (credits) return; // 크레딧: 탭 스킵은 #credits 자신의 클릭이 처리한다
  if (finale) { skipFinale(); return; }
  if (voyage) { skipVoyage(); return; }
  if (eclipse) { skipEclipse(); return; }
  if (sleepFx) { resistSleep(); return; } // 겟세마네: 화면 어디든 탭해서 버틴다
  if (sitting) { standUp(); return; } // 앉아 쉬는 중: 화면 어디든 탭하면 일어난다
  if (waterWalk && waterWalk.phase === 'boarding') { skipWaterWalk(); return; }
  if (!state.started || state.modal || paused || onUi(e)) return;
  const wantsJoy = e.pointerType === 'touch' && e.clientX < window.innerWidth * 0.45;
  if (wantsJoy && joy.id === null) {
    if (touchHintHide) touchHintHide();
    joy.id = e.pointerId;
    joy.ox = e.clientX;
    joy.oy = e.clientY;
    joy.dx = joy.dy = 0;
    joy.mag = 0;
    joyEl.classList.remove('hidden');
    joyEl.style.left = `${e.clientX - 55}px`;
    joyEl.style.top = `${e.clientY - 55}px`;
    stickEl.style.transform = 'translate(0,0)';
  } else if (look.id === null) {
    look.id = e.pointerId;
    look.lx = e.clientX;
    look.ly = e.clientY;
    look.sx = e.clientX;
    look.sy = e.clientY;
  }
});
window.addEventListener('pointermove', (e) => {
  if (e.pointerId === joy.id) {
    const dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
    const len = Math.hypot(dx, dy) || 1;
    const cl = Math.min(len, 42);
    joy.dx = (dx / len) * (cl / 42);
    joy.dy = (dy / len) * (cl / 42);
    joy.mag = len; // 링 바깥까지 밀었는지(달리기)는 원본 드래그 거리로 판정
    stickEl.style.transform = `translate(${(dx / len) * cl}px, ${(dy / len) * cl}px)`;
    stickEl.classList.toggle('sprint', len > 64);
  } else if (e.pointerId === look.id && state.view === 'street') {
    cam.yaw -= (e.clientX - look.lx) * 0.0055;
    cam.height = Math.min(13, Math.max(1.5, cam.height + (e.clientY - look.ly) * 0.035));
    look.lx = e.clientX;
    look.ly = e.clientY;
    cam.lastDrag = clock.elapsedTime;
  }
});
function endPointer(e) {
  if (e.pointerId === joy.id) {
    joy.id = null;
    joy.dx = joy.dy = 0;
    joy.mag = 0;
    stickEl.classList.remove('sprint');
    joyEl.classList.add('hidden');
    if (Math.hypot(e.clientX - joy.ox, e.clientY - joy.oy) < 8) handleTap(e.clientX, e.clientY);
  }
  if (e.pointerId === look.id) {
    look.id = null;
    if (Math.hypot(e.clientX - look.sx, e.clientY - look.sy) < 8) handleTap(e.clientX, e.clientY);
  }
}
window.addEventListener('pointerup', endPointer);
window.addEventListener('pointercancel', endPointer);

/* ---------------- UI ---------------- */

const state = { started: false, modal: false, visitedCount: 0, nearSite: null, epilogueShown: false, view: 'street' };

const SAVE_KEY = 'fisherman-chart-v1';
const save = (() => {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') || {}; } catch { /* private mode */ }
  return Object.assign({ charted: [], epilogueShown: false, muted: false, sheep: [], sheepHint: false, name: '', creditsShown: false, quality: 'auto', startedAt: null, finishedAt: null }, s);
})();
function persistSave() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* private mode */ }
}

const introEl = document.getElementById('intro');
const hudEl = document.getElementById('hud');
const visitBtn = document.getElementById('visit-btn');
const visitLabel = document.getElementById('visit-label');
const toastEl = document.getElementById('toast');
const cardEl = document.getElementById('card');
const cardNum = document.getElementById('card-num');
const cardTitle = document.getElementById('card-title');
const cardDates = document.getElementById('card-dates');
const cardMedia = document.getElementById('card-media');
const cardVerse = document.getElementById('card-verse');
const cardBody = document.getElementById('card-body');
const cardArtifact = document.getElementById('card-artifact');
const cardDiscuss = document.getElementById('card-discuss');
const cardQuestion = document.getElementById('card-question');
const epilogueEl = document.getElementById('epilogue');
const recordEl = document.getElementById('record');
const recordWrapEl = document.getElementById('record-wrap');
const cardCloseBtn = document.getElementById('card-close');
const cardSealBox = document.getElementById('card-seal-box');
const sealVerse = document.getElementById('seal-verse');
const sealInput = document.getElementById('seal-input');
const sealSubmit = document.getElementById('seal-submit');
const sealMsg = document.getElementById('seal-msg');
const progressEl = document.getElementById('progress');
const compassEl = document.getElementById('compass');
const compassArrow = document.getElementById('compass-arrow');
const voyageCaptionEl = document.getElementById('voyage-caption');

const viewBtn = document.getElementById('view-btn');
function toggleView() {
  if (state.view === 'street' && player.position.x < -150) {
    toast('이 지도는 성지만 보여줘요 — 로마는 바다 건너에 있어요.');
    return;
  }
  state.view = state.view === 'street' ? 'chart' : 'street';
  viewBtn.textContent = state.view === 'street' ? '지도 보기' : '거리 보기';
  applyShadowFrustum(state.view);
}
viewBtn.addEventListener('click', toggleView);

const keyList = document.getElementById('key-list');
const orderedSites = [...SITES].sort((a, b) => a.num - b.num);
orderedSites.forEach((s) => {
  const li = document.createElement('li');
  li.id = `key-${s.id}`;
  li.innerHTML = `<span class="knum">${s.num}</span><span>${s.title.replace('—', '·')}</span>`;
  keyList.appendChild(li);
});

// 유물 보따리 — 번호순 14칸, id로 채운다
const satchelEl = document.getElementById('satchel');
const relicSlots = {};
orderedSites.forEach((s) => {
  const slot = document.createElement('span');
  slot.className = 'relic-slot';
  slot.title = s.title.replace('—', '·');
  slot.textContent = s.relic || '·';
  relicSlots[s.id] = slot;
  satchelEl.appendChild(slot);
});
function fillRelic(siteId, { pop = false } = {}) {
  const slot = relicSlots[siteId];
  if (!slot || slot.classList.contains('filled')) return;
  slot.classList.add('filled');
  if (pop) {
    slot.classList.add('pop');
    setTimeout(() => slot.classList.remove('pop'), 650);
  }
}

let toastTimer = null;
function toast(msg, ms = 4200) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  toastEl.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.style.opacity = '0';
    setTimeout(() => toastEl.classList.add('hidden'), 500);
  }, ms);
}

if (save.charted.length > 0) {
  document.getElementById('start-btn').textContent = '지도로 돌아가기';
  const note = document.createElement('p');
  note.className = 'save-note';
  note.textContent = `${save.charted.length} / ${SITES.length} 곳 다녀감 · `;
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'reset-link';
  reset.textContent = '처음부터 다시';
  reset.addEventListener('click', () => {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* private mode */ }
    location.reload();
  });
  note.appendChild(reset);
  document.getElementById('start-btn').after(note);
}

// 터치 기기 감지: 폰/태블릿 브라우저마다 신호가 달라 셋 중 하나라도 참이면 터치로 본다
const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches
  || navigator.maxTouchPoints > 0
  || 'ontouchstart' in window;
// 데스크톱은 그림자를 더 곱게 (첫 렌더 전이라 재할당 비용 없음)
if (!IS_TOUCH) sun.shadow.mapSize.set(4096, 4096);

let touchHintHide = null;
function showTouchHint() {
  // 처음 온 사람에게는 매번, 이미 해 본 사람에게도 조작을 잊지 않도록 터치 기기면 보여 준다
  if (!IS_TOUCH) return;
  const hint = document.getElementById('touch-hint');
  hint.classList.remove('hidden');
  touchHintHide = () => {
    touchHintHide = null;
    hint.style.opacity = '0';
    setTimeout(() => hint.classList.add('hidden'), 600);
  };
  setTimeout(() => { if (touchHintHide) touchHintHide(); }, 6500);
}

document.getElementById('start-btn').addEventListener('click', () => {
  introEl.classList.add('hidden');
  hudEl.classList.remove('hidden');
  state.started = true;
  // 완주 기록의 시작 시각 — 이미 있으면 그대로 둔다 (재접속해도 같은 시도의 시계가 이어진다)
  if (!save.startedAt) { save.startedAt = Date.now(); persistSave(); }
  // 타이틀에서 물가를 돌던 시선을 그대로 이어받아 화면이 홱 돌지 않게 한다
  cam.yaw = Math.atan2(camera.position.x - player.position.x, camera.position.z - player.position.z);
  prevCamYaw = cam.yaw; // 뱅크 계산이 첫 프레임에 가짜 회전을 보지 않도록
  audio.init();
  audio.setMuted(save.muted);
  // 출항의 부름: 주제가 처음으로 지나간다 (컨텍스트가 깨어날 짧은 틈을 두고)
  setTimeout(() => audio.play('themeCall'), 150);
  if (window.innerWidth < 700) document.getElementById('chart-key').removeAttribute('open');
  toast(save.charted.length > 0
    ? '다시 바닷가예요. 이미 찾은 곳은 지도가 기억하고 있어요.'
    : '갈릴리 바닷가에 섰어요. 붉게 빛나는 표지가 다음 이야기예요 — 나침반과 위의 「다음」 안내를 따라가요.');
  showTouchHint();
});

const muteBtn = document.getElementById('mute-btn');
function reflectMute() {
  muteBtn.classList.toggle('muted', save.muted);
  muteBtn.title = save.muted ? '소리가 꺼져 있어요 — 탭하여 켜기' : '소리가 켜져 있어요 — 탭하여 끄기';
}
function toggleMute() {
  save.muted = !save.muted;
  persistSave();
  audio.setMuted(save.muted);
  reflectMute();
  reflectPauseLabels(); // 일시정지 메뉴의 '소리' 라벨도 함께
}
muteBtn.addEventListener('click', toggleMute);
audio.setMuted(save.muted);
reflectMute();

/* ---------------- 일시정지 — 잠시 쉬어가기 ---------------- */

let paused = false;
let restartArmedAt = 0; // '처음부터 다시' 2단 확인의 팔림 시각
const pauseEl = document.getElementById('pause');
const pauseBtn = document.getElementById('pause-btn');
const pauseSoundBtn = document.getElementById('pause-sound');
const pauseQualityBtn = document.getElementById('pause-quality');
const pauseRestartBtn = document.getElementById('pause-restart');
const pauseRecordBtn = document.getElementById('pause-record');
const QUALITY_LABELS = { auto: '화질: 자동', high: '화질: 풍성하게', lite: '화질: 가볍게' };

function reflectPauseLabels() {
  pauseSoundBtn.textContent = save.muted ? '소리: 끔' : '소리: 켬';
  pauseQualityBtn.textContent = QUALITY_LABELS[save.quality] || QUALITY_LABELS.auto;
  pauseRecordBtn.classList.toggle('hidden', !save.finishedAt);
}

// 컷신·연출이 흐르는 동안에는 쉼표를 찍을 수 없다
function canPause() {
  return state.started && !state.modal && !voyage && !finale && !eclipse
    && !sleepFx && !sitting && !waterWalk && !netsRide && !leapFx && !flowBusy;
}

function togglePause() {
  if (!paused && !canPause()) return;
  paused = !paused;
  pauseEl.classList.toggle('hidden', !paused);
  // 쉼표를 찍거나 걷어낼 때 키 상태를 비운다 — 쉬는 동안 쌓인 유령 키가
  // 재개 직후의 걸음을 훔치지 못하게. (꾹 누른 키는 자동 반복이 곧 되살린다)
  for (const k in keys) keys[k] = false;
  // 메뉴 버튼에 남은 포커스도 걷는다 — Space/Enter가 버튼을 다시 누르지 않게
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  if (paused) {
    restartArmedAt = 0;
    pauseRestartBtn.textContent = '처음부터 다시';
    reflectPauseLabels();
  }
}

document.getElementById('pause-resume').addEventListener('click', togglePause);
pauseBtn.addEventListener('click', () => { if (!paused) togglePause(); });
pauseSoundBtn.addEventListener('click', toggleMute);

// 화질: 자동(측정에 맡김) → 풍성하게(포스트+반사 켬) → 가볍게(전부 끔)
function applyQuality(q) {
  if (q === 'high') { usePost = true; fpsGate.done = true; }
  else if (q === 'lite') { usePost = false; fpsGate.done = true; }
  // 'auto'의 포스트는 세션 중엔 현재 상태 유지 — 재부팅하면 FPS 게이트가 다시 판단한다
  // 물리 하늘 + 시간대별 환경맵: auto·high — lite는 캔버스 하늘 + RoomEnvironment 그대로
  skyOn = q !== 'lite' && !!skyEnvs;
  skyDome.visible = skyOn;
  if (skyOn) {
    sky.visible = duskW >= 0.3;
    setSkyUniforms(sky, duskW);
    envBand = null; // 현재 시간대로 즉시 재선택
    updateEnvironment(duskW);
  } else {
    sky.visible = false;
    if (roomEnv) scene.environment = roomEnv;
    envBand = null;
  }
  // 호수 평면 반사: high 전용 — 리로드 없이 visible 스왑
  const refl = q === 'high';
  if (refl && !reflWater) { try { buildLakeReflection(); } catch { /* 반사 없이 진행 */ } }
  if (reflWater) reflWater.visible = refl;
  lakeWater.visible = !(refl && reflWater);
}
applyQuality(save.quality); // 지난 세션의 선택을 이어받는다
pauseQualityBtn.addEventListener('click', () => {
  const order = ['auto', 'high', 'lite'];
  save.quality = order[(order.indexOf(save.quality) + 1) % order.length];
  persistSave();
  applyQuality(save.quality);
  reflectPauseLabels();
});

// 완주 기록 카드 — 언제든 다시 열 수 있다 (사이트 완주와 양 완주 중 나중 것이 끝난 뒤라도).
// 열 때마다 새로 그려서 최신 이름/시간을 반영한다.
pauseRecordBtn.addEventListener('click', () => {
  if (!save.finishedAt) return;
  togglePause();
  modalOpenedAt = performance.now();
  buildSouvenir(recordWrapEl, { forceRebuild: true });
  recordEl.classList.remove('hidden');
  state.modal = true;
});
document.getElementById('record-close').addEventListener('click', () => {
  if (ghostClick()) return;
  recordEl.classList.add('hidden');
  state.modal = false;
});

// 처음부터 다시: 두 번 물어 확인한다 (인트로의 reset-link와 같은 동작)
pauseRestartBtn.addEventListener('click', () => {
  const now = Date.now();
  if (restartArmedAt && now - restartArmedAt < 3000) {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* private mode */ }
    location.reload();
    return;
  }
  restartArmedAt = now;
  pauseRestartBtn.textContent = '정말 처음부터? (한 번 더)';
  setTimeout(() => {
    if (Date.now() - restartArmedAt >= 3000) pauseRestartBtn.textContent = '처음부터 다시';
  }, 3200);
});

function tryVisit() {
  if (state.modal || voyage || finale || flowBusy) return;
  if (state.boardMode) { startWaterWalk(); return; }
  if (state.sailMode) { startVoyage(state.sailMode === 'back'); return; }
  if (state.sitMode) { sitDown(state.sitMode); return; } // 쉼터: 앉아서 쉰다
  if (!state.nearSite) return;
  const m = state.nearSite;
  if (!unlocked(m)) { lockedToast(); return; } // E키로 눌러도 순서는 지킨다
  const flow = !m.visited && flows[m.site.id];
  if (flow) { flow.advance(m); return; }
  openCard(m);
}
visitBtn.addEventListener('click', tryVisit);

const tapRay = new THREE.Raycaster();
function handleTap(cx, cy) {
  if (!state.started || state.modal) return;
  tapRay.setFromCamera(
    new THREE.Vector2((cx / window.innerWidth) * 2 - 1, -(cy / window.innerHeight) * 2 + 1),
    camera
  );
  for (const m of markers) {
    if (tapRay.intersectObject(m.g, true).length) {
      // 아직 차례가 아닌 곳은 열리지 않는다 — 이야기는 순서대로
      if (!unlocked(m)) { lockedToast(); return; }
      // 장면이 있는 곳은 멀리서 탭해도 미리 열리지 않는다 — 직접 가서 겪어야 한다
      const flow = !m.visited && flows[m.site.id];
      if (flow) {
        const d = Math.hypot(player.position.x - m.site.pos.x, player.position.z - m.site.pos.z);
        if (d < 8 && !flowBusy) flow.advance(m);
        else toast(flow.remoteHint || '그곳에 직접 가면 이야기를 겪을 수 있어요.');
        return;
      }
      openCard(m);
      return;
    }
  }
  const hits = tapRay.intersectObjects(tapTargets, false);
  if (hits.length) {
    const ud = hits[0].object.userData;
    if (ud.roosterToy) { // 뜰의 수탉: 탭하면 운다 — 몇 번이고
      audio.play('rooster', { gain: 0.18 });
      buzz(12);
      roosterHopT = 0;
      return;
    }
    if (ud.lilyToy) { // 들의 백합: 탭할 때마다 말씀 한 줄 (마 6:28–30)
      toast(LILY_LINES[lilyIdx++ % LILY_LINES.length], 5500);
      return;
    }
    openLandmarkCard(ud.landmark);
  }
}

let modalOpenedAt = 0;
function ghostClick() {
  return performance.now() - modalOpenedAt < 350;
}

function beginCard(num, title, dates) {
  state.modal = true;
  modalOpenedAt = performance.now();
  audio.play('pageTurn');
  cardNum.textContent = num;
  cardTitle.textContent = title;
  cardDates.textContent = dates;
  cardMedia.innerHTML = '';
  // 이름난 장소(별표)에는 구절/나눔 질문이 없으니 기본은 숨김; openCard가 다시 켠다
  cardVerse.classList.add('hidden');
  cardDiscuss.classList.add('hidden');
  cardDiscuss.removeAttribute('open');
}

function openLandmarkCard(info) {
  if (!info) return;
  beginCard('★', info.name, '가는 길에 있는 곳');
  cardBody.innerHTML = `<p>${info.blurb}</p>`;
  cardArtifact.style.display = 'none';
  cardEl.classList.remove('hidden');
}

function settlePin(m) {
  m.pinMat.color.set(COLORS.ink);
  m.pinMat.emissive.set(0x000000);
  m.ring.material.color.set(COLORS.ink);
  m.ring.material.opacity = 0.4;
  m.ring.scale.setScalar(1);
  m.sprite.material = m.spriteMats.ink;
  m.fxScale = 1;
}

let pendingPinFx = null;
const pinFx = [];
const PIN_RED = new THREE.Color(COLORS.red);
const PIN_INK = new THREE.Color(COLORS.ink);
const PIN_EMBER = new THREE.Color(0x3a0e08);
const PIN_BLACK = new THREE.Color(0x000000);
function chartSite(marker, { silent = false } = {}) {
  if (marker.visited) return;
  marker.visited = true;
  state.visitedCount++;
  document.getElementById(`key-${marker.site.id}`).classList.add('done');
  progressEl.textContent = `${state.visitedCount} / ${SITES.length} 곳 다녀감`;
  if (!save.charted.includes(marker.site.id)) {
    save.charted.push(marker.site.id);
    persistSave();
  }
  fillRelic(marker.site.id, { pop: !silent });
  updateNextHint();
  checkRecordComplete();
  if (silent) {
    settlePin(marker);
  } else {
    pendingPinFx = marker;
    audio.play('chime');
    buzz([25, 30, 60]);
  }
}

// 완주 기록 — 14곳 + 잃은 양 12마리를 모두 채운 순간(둘 중 나중 것)에 시간을 새긴다.
// 자동 리더보드는 없다 — 카드를 직접 캡처·공유하는 매뉴얼 인증이라 이 함수는 시각만 기록한다.
function formatElapsed(ms) {
  const totalSec = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(totalSec / 3600), m = Math.floor((totalSec % 3600) / 60), s = totalSec % 60;
  if (h > 0) return `${h}시간 ${String(m).padStart(2, '0')}분`;
  return `${m}분 ${String(s).padStart(2, '0')}초`;
}
function checkRecordComplete() {
  if (save.finishedAt) return;
  if (state.visitedCount !== SITES.length || save.sheep.length !== 12) return;
  if (!save.startedAt) save.startedAt = save.finishedAt || Date.now(); // 배포 전부터 진행 중이던 세이브 방어
  save.finishedAt = Date.now();
  persistSave();
  audio.play('chime');
  toast('🏁 완주 기록이 새겨졌어요 — 잠시 쉬어가기(⚙) 메뉴에서 기록 카드를 확인해요.', 8000);
  reflectPauseLabels();
}

// HUD의 「다음 →」 안내와 범례의 붉은 하이라이트를 이야기 순서에 맞춘다
let nextNum = 1; // 이야기 순서상 지금 갈 차례의 번호 — 순서 잠금의 기준
function updateNextHint() {
  let nxt = null;
  for (const m of markers) {
    if (!m.visited && (!nxt || m.site.num < nxt.site.num)) nxt = m;
  }
  nextNum = nxt ? nxt.site.num : 999;
  keyList.querySelectorAll('li.next').forEach((li) => li.classList.remove('next'));
  const el = document.getElementById('next-hint');
  if (!nxt) {
    el.textContent = '열네 곳을 모두 걸었어요!';
    return;
  }
  document.getElementById(`key-${nxt.site.id}`).classList.add('next');
  el.textContent = `다음 → ${nxt.site.num}. ${nxt.shortTitle}`
    + (nxt.site.id === 'fourth-watch' ? ' (물가의 배를 타요)' : '');
}
// 앞의 이야기를 모두 마쳐야 열린다 — 다녀온 곳은 언제든 다시 읽을 수 있다
function unlocked(m) {
  return m.visited || m.site.num === nextNum;
}
function lockedToast() {
  toast(`아직 순서가 아니에요 — 다음은 ${nextNum}번이에요. 위의 「다음」 안내를 따라가요.`);
}

let activeSeal = null; // { marker, attempts }
let imePendingSubmit = false; // 한글 IME: 엔터로 조합을 확정하는 중이면 확정 후에 제출한다

function normalizeAnswer(s) {
  return s.replace(/\s+/g, '').replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, '').trim();
}

// 레벤슈타인 거리 — 약간의 오타(한 글자 대치/추가/누락)를 허용하기 위함
function editDistance(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d = Array.from({ length: rows }, (_, i) => [i, ...Array(cols - 1).fill(0)]);
  for (let j = 0; j < cols; j++) d[0][j] = j;
  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[rows - 1][cols - 1];
}

// 정답 글자 수에 비례해 허용 오타 수를 정한다 (짧은 답은 1글자, 긴 답은 최대 2글자)
function allowedTypos(target) {
  return target.length <= 6 ? 1 : 2;
}

function openCard(marker) {
  const s = marker.site;
  beginCard(s.num, s.title, s.dates);
  if (s.image) {
    const fig = document.createElement('figure');
    fig.className = 'card-figure';
    const img = document.createElement('img');
    img.src = s.image.src;
    img.alt = s.image.alt;
    img.loading = 'lazy';
    img.onerror = () => fig.remove();
    const cap = document.createElement('figcaption');
    cap.textContent = s.image.caption.replace(/\s+/g, ' ').trim();
    fig.append(img, cap);
    cardMedia.appendChild(fig);
  }
  if (s.verse) {
    cardVerse.textContent = s.verse;
    cardVerse.classList.remove('hidden');
  }
  cardBody.innerHTML = s.body.map((p) => `<p>${p}</p>`).join('');
  cardArtifact.style.display = '';
  
  const firstVisit = !marker.visited;
  cardArtifact.innerHTML = firstVisit
    ? `<b>보따리에 담았다</b> · ${s.artifact} &nbsp;${s.relic || ''}`
    : `<b>이미 보따리에 있다</b> · ${s.artifact} &nbsp;${s.relic || ''}`;
  cardArtifact.classList.toggle('stamped', firstVisit);
  
  if (s.question) {
    cardQuestion.textContent = s.question.replace(/\s+/g, ' ').trim();
    cardDiscuss.classList.remove('hidden');
  }
  cardEl.classList.remove('hidden');

  if (firstVisit) {
    // 말씀 새기기 UI 활성화 (아직 지도에 기록하지 않음)
    activeSeal = { marker, attempts: 0 };
    imePendingSubmit = false;
    cardSealBox.classList.remove('hidden');
    
    const seal = s.seal;
    sealVerse.innerHTML = `${seal.before}<span id="seal-blank" class="seal-blank">＿＿＿</span>${seal.after}`;
    sealInput.value = '';
    sealInput.disabled = false;
    sealSubmit.disabled = false;
    sealMsg.textContent = '';
    sealMsg.className = 'seal-msg';
    
    cardCloseBtn.disabled = true;
    cardCloseBtn.textContent = '말씀을 새겨야 완료됩니다';
  } else {
    // 재방문인 경우 말씀 새기기 상자 숨김 및 바로 닫기 버튼 활성화
    activeSeal = null;
    cardSealBox.classList.add('hidden');
    cardCloseBtn.disabled = false;
    cardCloseBtn.textContent = '계속 걷기';
  }
}

// 말씀 새기기 정답 제출 및 검사
function submitSeal() {
  if (!activeSeal) return;
  const seal = activeSeal.marker.site.seal;
  const typed = normalizeAnswer(sealInput.value);
  const target = normalizeAnswer(seal.answer);

  if (typed === target || (typed.length > 0 && editDistance(typed, target) <= allowedTypos(target))) {
    audio.play('chime');
    
    // 말씀 빈칸 채우기 완료 연출
    const blankEl = document.getElementById('seal-blank');
    if (blankEl) {
      blankEl.textContent = seal.answer;
      blankEl.classList.add('solved');
    }
    
    sealInput.disabled = true;
    sealSubmit.disabled = true;
    
    sealMsg.textContent = '말씀이 마음에 새겨졌습니다.';
    sealMsg.className = 'seal-msg success';
    
    // 정답을 맞춘 시점에 비로소 차팅(지도 및 유물 기록) 반영
    chartSite(activeSeal.marker);
    
    if (activeSeal.marker.site.id === 'voyage-to-rome') pendingVoyage = true;
    
    cardCloseBtn.disabled = false;
    cardCloseBtn.textContent = '계속 걷기';
  } else {
    activeSeal.attempts++;
    sealInput.classList.remove('shake');
    void sealInput.offsetWidth; // 쉐이크 애니메이션을 위한 리플로우
    sealInput.classList.add('shake');
    
    const ansLen = normalizeAnswer(seal.answer).length;
    if (activeSeal.attempts >= 3) {
      sealMsg.textContent = `글자가 조금 다른 것 같아요. 상단 구절을 읽고 알맞은 단어를 넣어 보세요. (정답 ${ansLen}글자)`;
    } else {
      sealMsg.textContent = `글자가 조금 달라요. 단어와 띄어쓰기를 다시 확인해 보세요.`;
    }
    sealMsg.className = 'seal-msg';
  }
}

sealSubmit.addEventListener('click', submitSeal);
sealInput.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  // 한글 IME(특히 모바일 키보드): 엔터/확인 키는 조합 중인 마지막 글자를 확정한다.
  // 이때 keydown의 값에는 아직 그 글자가 없어(isComposing/keyCode 229), 그대로 검사하면
  // 정답도 오답 처리된다. 조합 확정을 기다렸다가 compositionend에서 제출한다 — 한 번에 통과.
  if (e.isComposing || e.keyCode === 229) {
    imePendingSubmit = true;
    return; // preventDefault 하지 않는다 — IME가 마지막 글자를 확정하게 둔다
  }
  e.preventDefault();
  submitSeal();
});
sealInput.addEventListener('compositionend', () => {
  if (imePendingSubmit) {
    imePendingSubmit = false;
    submitSeal();
  }
});

// 복사 / 붙여넣기 및 드래그 방지
['paste', 'copy', 'cut', 'drop'].forEach((evt) => {
  sealInput.addEventListener(evt, (e) => e.preventDefault());
});
sealInput.addEventListener('contextmenu', (e) => e.preventDefault());

document.getElementById('card-close').addEventListener('click', () => {
  if (ghostClick()) return;
  
  // 말씀이 안 새겨졌으면 닫기 차단
  if (activeSeal && cardCloseBtn.disabled) return;
  
  cardEl.classList.add('hidden');
  const charted = pendingPinFx; // 방금 처음 기록한 표지 (재방문이면 null)
  if (pendingPinFx) {
    pinFx.push({
      m: pendingPinFx, t: 0,
      from: pendingPinFx.pinMat.color.clone(),
      fromE: pendingPinFx.pinMat.emissive.clone(),
    });
    audio.play('bell');
    goldBurst(pendingPinFx.site.pos.x, pendingPinFx.site.pos.z, 4); // 기록의 불꽃
    pendingPinFx = null;
  }
  
  activeSeal = null;
  finishCardClose(charted);
});

function finishCardClose(charted) {
  state.modal = false;
  if (waterWalk && (waterWalk.phase === 'walk' || waterWalk.phase === 'arrived')) {
    // 물 위 걷기 중 3번 카드를 닫으면 배가 물가로 데려다 준다
    startWaterWalkReturn();
  } else if (pendingVoyage) {
    pendingVoyage = false;
    startVoyage();
  } else if (state.visitedCount === SITES.length && !state.epilogueShown) {
    state.epilogueShown = true;
    finaleQueued = true;
  }
  // 십자가: 카드가 닫히는 순간 온 땅에 어둠이 내린다
  if (charted && charted.site.id === 'at-a-distance') startEclipse();
  // 빈 무덤: 천사의 말이 다음 걸음의 방향이 된다
  if (charted && charted.site.id === 'empty-tomb') {
    toast('"갈릴리로 가라. 전에 말씀하신 대로, 거기서 그를 보리라." (막 16:7)', 7000);
  }
  // 긴 밤이 끝나면 아침 빛으로 돌아온다
  if (charted && charted.site.id === 'long-night') warmthOverride = null;
}

function showEpilogue() {
  modalOpenedAt = performance.now();
  save.epilogueShown = true;
  persistSave();
  document.getElementById('epilogue-body').innerHTML = EPILOGUE.map((p) => `<p>${p}</p>`).join('');
  buildSouvenir(document.getElementById('souvenir-wrap'));
  epilogueEl.classList.remove('hidden');
  state.modal = true;
}

// 완주 기념 카드: 유물 14개가 박힌 세로 카드 이미지를 만들어 저장/공유
function makeSouvenirCanvas() {
  const W = 600, H = 840, s = 2;
  const [cv, ctx] = canvas2d(W * s, H * s);
  ctx.scale(s, s);
  ctx.fillStyle = '#ece2c4';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#2b2620';
  ctx.lineWidth = 3;
  ctx.strokeRect(16, 16, W - 32, H - 32);
  ctx.strokeStyle = '#a8341f';
  ctx.lineWidth = 1;
  ctx.strokeRect(24, 24, W - 48, H - 48);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#2b2620';
  const kFont = "'Nanum Myeongjo', 'Apple SD Gothic Neo', 'Malgun Gothic', serif";
  const bFont = "'Noto Serif KR', 'Apple SD Gothic Neo', serif";
  ctx.font = `800 44px ${kFont}`;
  ctx.fillText('어부의 지도', W / 2, 96);
  ctx.font = `italic 18px ${bFont}`;
  ctx.fillStyle = '#5a5142';
  ctx.fillText('시몬, 베드로라 불린 이', W / 2, 130);
  ctx.fillText('갈릴리에서 로마까지', W / 2, 156);
  // 유물 7×2 격자
  const cols = 7, gx = W / (cols + 1), gy0 = 250, gyStep = 118;
  ctx.font = '46px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  orderedSites.forEach((site, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const cx = gx * (col + 1), cy = gy0 + row * gyStep;
    ctx.beginPath();
    ctx.arc(cx, cy, 34, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(184,144,46,0.16)';
    ctx.fill();
    ctx.strokeStyle = '#b8902e';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = '40px "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
    ctx.fillText(site.relic || '·', cx, cy + 14);
    ctx.font = `600 13px ${bFont}`;
    ctx.fillStyle = '#2b2620';
    ctx.fillText(String(site.num), cx, cy + 52);
  });
  // 트로피가 아니라 받는 편지 — 성취의 기록이 아니라 이름이 불린 증서 (눅 10:20)
  const name = (save.name || '').trim();
  ctx.fillStyle = '#a8341f';
  ctx.font = `700 22px ${kFont}`;
  ctx.fillText(name ? `${name}에게 —` : '열네 곳을 모두 걸었습니다', W / 2, 560);
  ctx.fillStyle = '#5a5142';
  ctx.font = `italic 16px ${bFont}`;
  ctx.fillText('빈 그물에서 새벽 숯불까지 —', W / 2, 600);
  ctx.fillText('열네 곳 모두에 같은 분이 계셨습니다.', W / 2, 626);
  if (save.sheep.length >= 12) {
    ctx.fillText('잃은 양 열두 마리도 집으로 돌아왔습니다.', W / 2, 652);
  }
  if (save.finishedAt) {
    ctx.fillStyle = '#a8341f';
    ctx.font = `700 17px ${bFont}`;
    ctx.fillText(`완주 기록 — 26곳 모두, ${formatElapsed(save.finishedAt - (save.startedAt || save.finishedAt))}`, W / 2, 676);
  }
  ctx.font = `18px ${bFont}`;
  ctx.fillStyle = '#2b2620';
  if (name) {
    ctx.fillText('“내가 너를 지명하여 불렀나니, 너는 내 것이라.”', W / 2, 700);
    ctx.font = `15px ${bFont}`;
    ctx.fillStyle = '#5a5142';
    ctx.fillText('— 이사야 43:1', W / 2, 726);
  } else {
    ctx.fillText('“내 양을 먹여라”  — 요한복음 21:17', W / 2, 700);
  }
  ctx.font = `14px ${bFont}`;
  ctx.fillStyle = '#8a7f6a';
  ctx.fillText('fishermans-chart.vercel.app', W / 2, H - 48);
  return cv;
}
// wrap: 카드를 그려 넣을 컨테이너(에필로그의 #souvenir-wrap 또는 일시정지의 #record-wrap).
// forceRebuild: true면 캐시를 무시하고 매번 새로 그린다 — 기록 카드는 열 때마다 최신 시간/양
// 상태를 반영해야 하므로 사용한다. 에필로그 쪽은 기존처럼 최초 1회만 그려 캐시한다.
function buildSouvenir(wrap, { forceRebuild = false } = {}) {
  if (!forceRebuild && wrap.dataset.built) return;
  wrap.dataset.built = '1';
  wrap.innerHTML = '';
  let cv = makeSouvenirCanvas();
  let imgURL = null;
  const img = document.createElement('img');
  img.className = 'souvenir-img';
  img.alt = '어부의 지도 완주 기념 카드';
  const refreshImg = () => {
    cv.toBlob((blob) => {
      if (imgURL) URL.revokeObjectURL(imgURL);
      imgURL = URL.createObjectURL(blob);
      img.src = imgURL;
    }, 'image/png');
  };
  refreshImg();
  // 이름 새기기 — 카드가 아이에게 보내는 편지가 된다
  const nameRow = document.createElement('div');
  nameRow.className = 'souvenir-name-row';
  const nameInput = document.createElement('input');
  nameInput.className = 'souvenir-name';
  nameInput.maxLength = 10;
  nameInput.placeholder = '카드에 새길 이름';
  nameInput.value = save.name || '';
  const nameBtn = document.createElement('button');
  nameBtn.className = 'souvenir-name-btn';
  nameBtn.type = 'button';
  nameBtn.textContent = '이름 새기기';
  const engrave = () => {
    const v = nameInput.value.trim();
    if (!v || v === save.name) return;
    save.name = v;
    persistSave();
    cv = makeSouvenirCanvas();
    refreshImg();
  };
  nameBtn.addEventListener('click', engrave);
  // 한글 IME: 조합 중인(엔터로 확정하는) 이름이 잘리지 않도록 확정 후에 새긴다
  let namePendingEngrave = false;
  nameInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (e.isComposing || e.keyCode === 229) { namePendingEngrave = true; return; }
    e.preventDefault();
    engrave();
  });
  nameInput.addEventListener('compositionend', () => {
    if (namePendingEngrave) { namePendingEngrave = false; engrave(); }
  });
  nameRow.append(nameInput, nameBtn);
  const btn = document.createElement('button');
  btn.className = 'souvenir-btn';
  btn.type = 'button';
  btn.textContent = '기념 카드 저장 · 공유';
  btn.addEventListener('click', async () => {
    if (ghostClick()) return;
    cv.toBlob(async (blob) => {
      const file = new File([blob], 'fishermans-chart.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: '어부의 지도' }); return; } catch { /* 취소/실패 시 다운로드로 */ }
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'fishermans-chart.png';
      a.click();
    }, 'image/png');
  });
  wrap.append(nameRow, img, btn);
}
document.getElementById('epilogue-close').addEventListener('click', () => {
  if (ghostClick()) return;
  epilogueEl.classList.add('hidden');
  state.modal = false;
  // 열네 곳을 모두 새긴 첫 완주 — 크레딧이 한 번 흐른다
  if (state.visitedCount === SITES.length && !save.creditsShown) {
    save.creditsShown = true;
    persistSave();
    startCredits();
    return;
  }
  toast('이제 지도를 자유롭게 걸어요 — 선착장의 배를 타면 성지로 돌아갈 수 있어요. 어느 표지든 다시 찾으면 이야기를 또 읽을 수 있어요.', 7000);
});

/* ---------------- 크레딧 롤 — 완주의 끝에 이름들이 흐른다 ---------------- */

let credits = null;
const creditsEl = document.getElementById('credits');
const creditsScrollEl = document.getElementById('credits-scroll');
const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function buildCreditsDom() {
  creditsScrollEl.innerHTML = '';
  const add = (cls, text) => {
    const p = document.createElement('p');
    p.className = cls;
    p.textContent = text;
    creditsScrollEl.appendChild(p);
  };
  add('cr-title', '어부의 지도');
  add('cr-line cr-sub', '시몬, 베드로라 불린 이 · 갈릴리에서 로마까지');
  add('cr-line', '🐟');
  add('cr-head', '열네 곳의 참된 장소들');
  for (const s of [...SITES].sort((a, b) => a.num - b.num)) {
    add('cr-line', `${s.num}. ${s.title} — ${s.dates}`);
  }
  add('cr-head', '말씀');
  add('cr-line', '누가복음 · 마태복음 · 마가복음 · 요한복음 · 사도행전 · 시편');
  add('cr-head', '길 위의 동행');
  add('cr-line', '잃은 양 열두 마리 · 목자 · 요나의 물고기 · 어린 양');
  add('cr-head', '지은 도구');
  add('cr-line', 'Three.js · Web Audio API · 그리고 종이 대신 빛');
  add('cr-head', '이 지도를 걸은 사람');
  add('cr-line', save.name || '이름 없는 순례자');
  add('cr-verse', '"너는 나를 따르라" — 요한복음 21:22');
  add('cr-line cr-end', '끝 — 그리고 시작.');
}

function startCredits() {
  if (credits) return;
  buildCreditsDom();
  hudEl.classList.add('hidden');
  creditsEl.classList.remove('hidden');
  requestAnimationFrame(() => { creditsEl.style.opacity = '1'; });
  const H = window.innerHeight;
  credits = {
    t: 0,
    from: H,                                       // 첫 줄이 화면 아래에서 올라와
    to: H * 0.5 - creditsScrollEl.offsetHeight,    // 마지막 줄이 가운데서 멈춘다
    dur: REDUCED_MOTION ? 0 : 45,
    hold: 3, // 끝 화면 정지
    done: false,
  };
  // 움직임을 줄인 환경: 즉시 끝 화면을 보이고, 탭으로 닫는다
  creditsScrollEl.style.transform = `translateY(${REDUCED_MOTION ? credits.to : credits.from}px)`;
}

function updateCredits(dt) {
  credits.t += dt;
  if (credits.dur > 0) {
    const k = Math.min(1, credits.t / credits.dur);
    creditsScrollEl.style.transform = `translateY(${credits.from + (credits.to - credits.from) * k}px)`;
    if (credits.t >= credits.dur + credits.hold) endCredits();
  }
}

function skipCredits() { endCredits(); }

function endCredits() {
  if (!credits || credits.done) return;
  credits.done = true;
  creditsEl.style.opacity = '0';
  setTimeout(() => {
    creditsEl.classList.add('hidden');
    creditsScrollEl.innerHTML = '';
    if (state.started && !finale) hudEl.classList.remove('hidden');
    credits = null;
  }, 1300);
}

creditsEl.addEventListener('click', skipCredits);

/* ---------------- the voyage to Rome ---------------- */

let pendingVoyage = false;
let voyage = null;
function startVoyage(back = false) {
  if (state.view === 'chart') toggleView();
  state.modal = true;
  player.visible = false;
  voyageBoat.visible = true;
  voyageCaptionEl.textContent = back ? '큰 바다를 건너, 다시 성지로…' : '큰 바다를 건너, 로마를 향하여…';
  voyageCaptionEl.classList.remove('hidden');
  voyageCaptionEl.style.opacity = '1';
  const start = new THREE.Vector3(player.position.x, 0, player.position.z);
  const destPt = back ? JOPPA_BOARD : ROME_LANDING;
  const end = new THREE.Vector3(destPt.x, 0, destPt.z);
  const mids = back
    ? [new THREE.Vector3(-170, 0, 105), new THREE.Vector3(-110, 0, 40)]
    : [new THREE.Vector3(-110, 0, 40), new THREE.Vector3(-170, 0, 105)];
  voyage = {
    t: 0,
    dur: 11,
    curve: new THREE.CatmullRomCurve3([start, mids[0], mids[1], end]),
    dest: destPt,
    landToast: back ? '성지로 돌아왔어요 — 갈릴리와 예루살렘이 기다려요.' : '바다를 건넜어요 — 로마가 눈앞이에요.',
  };
}
function skipVoyage() {
  if (!voyage || voyage.t < 1) return;
  voyage.t = voyage.dur;
}
function updateVoyage(dt) {
  voyage.t += dt;
  const u = Math.min(1, voyage.t / voyage.dur);
  const eased = u * u * (3 - 2 * u);
  const pos = voyage.curve.getPoint(eased);
  const ahead = voyage.curve.getPoint(Math.min(1, eased + 0.01));
  // 항해 중간, 큰 바다의 풍랑 — 배가 크게 흔들린다
  const stormK = Math.max(0, 1 - Math.abs(u - 0.5) / 0.22);
  if (stormK > 0.5 && !voyage.stormed) {
    voyage.stormed = true;
    audio.play('windRush', { gain: 0.35 });
  }
  voyageBoat.position.set(pos.x, Math.sin(voyage.t * 1.4) * (0.15 + stormK * 0.5), pos.z);
  voyageBoat.rotation.y = Math.atan2(ahead.x - pos.x, ahead.z - pos.z);
  voyageBoat.rotation.z = Math.sin(voyage.t * 2.6) * 0.16 * stormK;
  player.position.set(pos.x, 0, pos.z);
  if (voyage.t >= voyage.dur) {
    const v = voyage;
    voyage = null;
    voyageBoat.visible = false;
    voyageBoat.rotation.z = 0;
    player.visible = true;
    player.position.set(v.dest.x, 0, v.dest.z);
    state.modal = false;
    voyageCaptionEl.style.opacity = '0';
    setTimeout(() => voyageCaptionEl.classList.add('hidden'), 900);
    toast(v.landToast);
  }
}

/* ---------------- 빈 무덤 달음질 (요 20:3–8) ---------------- */
// 무덤에 다가가면 요한이 앞질러 달려 어귀에 멈춰 서고, 베드로(플레이어)가 먼저 들어간다.
let tombRun = null;
let tombRunDone = false;
const _tombFrom = new THREE.Vector3();
function updateTombRace(dt, distTomb) {
  const site8 = markerById['empty-tomb'];
  // 발동: 무덤 18유닛 안, 8번의 차례일 때, 한 번만
  if (!tombRun && !tombRunDone && site8 && !site8.visited && unlocked(site8) && distTomb < 18 && distTomb > 7) {
    tombRun = { t: 0, phase: 'run' };
    tombRunDone = true;
    _tombFrom.set(player.position.x, 0, player.position.z);
    ghostJohn.position.copy(_tombFrom);
    ghostJohn.visible = true;
    toast('다른 제자가 너를 앞질러 달린다!');
  }
  if (!tombRun) return;
  tombRun.t += dt;
  if (tombRun.phase === 'run') {
    const u = Math.min(1, tombRun.t / 1.6);
    const e = u * u * (3 - 2 * u);
    ghostJohn.position.set(
      _tombFrom.x + (TOMB_MOUTH.x - _tombFrom.x) * e,
      Math.abs(Math.sin(tombRun.t * 16)) * 0.18,
      _tombFrom.z + (TOMB_MOUTH.z - _tombFrom.z) * e
    );
    ghostJohn.rotation.y = Math.atan2(TOMB_MOUTH.x - _tombFrom.x, TOMB_MOUTH.z - _tombFrom.z);
    const sw = Math.sin(tombRun.t * 16) * 0.7;
    ghostJohn.userData.legL.rotation.x = sw;
    ghostJohn.userData.legR.rotation.x = -sw;
    if (u >= 1) {
      tombRun.phase = 'wait';
      ghostJohn.userData.legL.rotation.x = ghostJohn.userData.legR.rotation.x = 0;
      ghostJohn.rotation.x = 0.35; // 어귀에서 몸을 굽혀 들여다봄
      toast('그가 어귀에서 멈춰 섰다 — 네가 먼저 들어가라.');
    }
  } else if (tombRun.phase === 'wait') {
    ghostJohn.position.y = Math.sin(tombRun.t * 2) * 0.03;
    if (site8.visited) { tombRun.phase = 'fade'; tombRun.t = 0; }
  } else if (tombRun.phase === 'fade') {
    const k = Math.min(1, tombRun.t / 1.2);
    ghostJohn.traverse((o) => { if (o.material) o.material.opacity = 0.5 * (1 - k); });
    if (k >= 1) { ghostJohn.visible = false; tombRun = null; }
  }
}

/* ---------------- 빛의 형상 ----------------
   예수님은 이목구비 없이, 사람 크기의 빛으로만 선다 —
   "너희가 그를 보지 못하였으나 사랑하는도다" (벧전 1:8).
   임재가 장면의 핵심인 두 곳: 물 위(3번)와 새벽 바닷가(10·11번). */
function makeLightFigure() {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xfff3d8, transparent: true, opacity: 0.92, fog: false });
  mat.color.multiplyScalar(4.5); // HDR 부스트 — 블룸용 (생성 시 1회)
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.1, 10), mat);
  robe.position.y = 1.05;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), mat);
  head.position.y = 2.32;
  const glow = radialSprite([[0, 'rgba(255,244,214,0.7)'], [0.4, 'rgba(255,240,200,0.22)'], [1, 'rgba(255,240,200,0)']]);
  glow.material.color.multiplyScalar(3.5); // HDR 부스트 — 블룸용 (생성 시 1회)
  glow.material.opacity = 0.75;
  glow.scale.setScalar(6.5);
  glow.position.y = 1.4;
  g.add(robe, head, glow);
  g.userData.glow = glow;
  g.visible = false;
  scene.add(g);
  return g;
}
const wwFigure = makeLightFigure();    // 물 위 — 빛의 길 끝에 서 계신다
const shoreFigure = makeLightFigure(); // 새벽 바닷가 — 숯불 곁에 서 계신다 (동쪽 물가)
shoreFigure.position.set(28.5, 0, -143.5);
// 붙잡으시는 손: 구원의 순간에만 보이는 빛줄기
const rescueBeam = new THREE.Mesh(
  new THREE.CylinderGeometry(0.06, 0.06, 1, 12),
  new THREE.MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.85, fog: false })
);
rescueBeam.material.color.multiplyScalar(3.5); // HDR 부스트 — 블룸용 (생성 시 1회)
rescueBeam.visible = false;
scene.add(rescueBeam);
const _beamDir = new THREE.Vector3();
function aimBeam(ax, ay, az, bx, by, bz) {
  _beamDir.set(bx - ax, by - ay, bz - az);
  const len = _beamDir.length();
  rescueBeam.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
  rescueBeam.scale.set(1, len, 1);
  rescueBeam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _beamDir.normalize());
}
function showCaption(text) {
  voyageCaptionEl.textContent = text;
  voyageCaptionEl.classList.remove('hidden');
  voyageCaptionEl.style.opacity = '1';
}
function hideCaption() {
  voyageCaptionEl.style.opacity = '0';
  setTimeout(() => voyageCaptionEl.classList.add('hidden'), 800);
}

/* ---------------- 물 위 걷기 (마 14:22–33) — 배를 타고 나가 물 위를 걷는다 ----------------
   그분을 향해 걷는다. 돌풍이 옆으로 밀고 빛의 길이 흔들리다가,
   베드로가 실제로 그랬듯 반드시 가라앉는다 — 그리고 반드시 붙잡힌다. */
const sinkVeil = document.getElementById('sink-veil');
let waterWalk = null;
const WW_BOARD_DUR = 5.5, WW_RETURN_DUR = 4;
function startWaterWalk() {
  if (state.view === 'chart') toggleView();
  state.modal = true;
  state.boardMode = false;
  player.visible = false;
  wwBoat.position.set(WW_BOARD.x, 0, WW_BOARD.z);
  waterWalk = { phase: 'boarding', t: 0, from: { x: WW_BOARD.x, z: WW_BOARD.z } };
  audio.play('windRush', { gain: 0.3 });
  toast('배가 어둠 속으로 나아간다 — 새벽 네 시.');
}
function skipWaterWalk() {
  if (waterWalk && waterWalk.phase === 'boarding' && waterWalk.t > 0.6) waterWalk.t = WW_BOARD_DUR;
}
function startWaterWalkReturn() {
  waterWalkPath = null;
  lightPath.visible = false;
  lightPath.material.opacity = 0;
  wwFigure.visible = false;
  rescueBeam.visible = false;
  player.visible = false;
  state.modal = true;
  waterWalk.phase = 'return';
  waterWalk.t = 0;
}
function updateWaterWalk(dt) {
  const w = waterWalk;
  w.t += dt;
  if (w.phase === 'boarding') {
    const u = Math.min(1, w.t / WW_BOARD_DUR);
    const e = u * u * (3 - 2 * u);
    const bx = w.from.x + (WW_DROP.x - w.from.x) * e;
    const bz = w.from.z + (WW_DROP.z - w.from.z) * e;
    wwBoat.position.set(bx, Math.sin(w.t * 1.4) * 0.12, bz);
    wwBoat.rotation.y = Math.atan2(WW_DROP.x - w.from.x, WW_DROP.z - w.from.z);
    player.position.set(bx, 0, bz);
    applyWarmth(0.85 - 0.78 * e); // 아침 → 새벽 어스름
    if (u >= 1) {
      w.phase = 'walk';
      waterWalkPath = { a: [WW_DROP.x, WW_DROP.z], b: [WW_MARKER.x, WW_MARKER.z], width: 6 };
      lightPath.visible = true;
      waterWalkSink = 0;
      player.visible = true;
      player.position.set(WW_DROP.x, 0, WW_DROP.z);
      player.rotation.y = Math.atan2(WW_MARKER.x - WW_DROP.x, WW_MARKER.z - WW_DROP.z);
      cam.yaw = Math.atan2(WW_DROP.x - WW_MARKER.x, WW_DROP.z - WW_MARKER.z); // 그분을 바라보게
      state.modal = false;
      // 빛의 길 끝에 그분이 서 계신다
      wwFigure.position.set(WW_MARKER.x, 0, WW_MARKER.z);
      wwFigure.visible = true;
      showCaption('"오라." (마 14:29)');
      setTimeout(hideCaption, 3000);
      toast('그분을 향해 걸어라 — 멈추면 가라앉는다.');
    }
  } else if (w.phase === 'walk') {
    lightPath.material.opacity = Math.min(0.8, lightPath.material.opacity + dt * 0.9);
    // 돌풍: 옆으로 밀어붙이고, 빛의 길이 흔들린다
    w.gustT = (w.gustT ?? 2.4) - dt;
    if (w.gustT <= 0) {
      w.gustT = 2.4 + Math.random() * 2.2;
      w.gustDur = 1.15;
      w.gustDir = Math.random() < 0.5 ? -1 : 1;
      audio.play('windRush', { gain: 0.15 });
    }
    if (w.gustDur > 0) {
      w.gustDur -= dt;
      const ddx = WW_MARKER.x - WW_DROP.x, ddz = WW_MARKER.z - WW_DROP.z;
      const L = Math.hypot(ddx, ddz);
      const nx = player.position.x + (-ddz / L) * w.gustDir * 1.7 * dt;
      const nz = player.position.z + (ddx / L) * w.gustDir * 1.7 * dt;
      if (onWalkLine(nx, nz)) { player.position.x = nx; player.position.z = nz; }
      lightPath.material.opacity = Math.max(0.32, lightPath.material.opacity - dt * 1.3);
    }
    // 각본된 비틀거림: 베드로는 실제로 가라앉았다 (마 14:30)
    const total = Math.hypot(WW_MARKER.x - WW_DROP.x, WW_MARKER.z - WW_DROP.z);
    const prog = 1 - Math.hypot(player.position.x - WW_MARKER.x, player.position.z - WW_MARKER.z) / total;
    if (prog > 0.55) {
      w.phase = 'stumble';
      w.t = 0;
      state.modal = true;
      audio.play('windRush', { gain: 0.4 });
      audio.play('splash', { gain: 0.35 });
      showCaption('바람을 보고, 무서워졌다 — 가라앉기 시작한다!');
    }
  } else if (w.phase === 'stumble') {
    waterWalkSink = Math.min(1.15, waterWalkSink + dt * 0.85);
    if (w.t > 1.7 && !w.cried) {
      w.cried = true;
      showCaption('"주님, 살려 주십시오!" (마 14:30)');
    }
    if (w.t > 3.1) {
      w.phase = 'rescue';
      w.t = 0;
      rescueBeam.visible = true;
      showCaption('예수께서 곧 손을 내밀어 붙잡으셨다 — "믿음이 작은 사람아, 왜 의심하였느냐."');
    }
  } else if (w.phase === 'rescue') {
    // 빛의 손에 붙들려, 그분 곁까지
    waterWalkSink = Math.max(0, waterWalkSink - dt * 1.1);
    aimBeam(wwFigure.position.x, 1.5, wwFigure.position.z, player.position.x, 0.9 - waterWalkSink, player.position.z);
    const dx = WW_MARKER.x - player.position.x, dz = WW_MARKER.z - player.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 2.2) {
      player.position.x += (dx / d) * 5.5 * dt;
      player.position.z += (dz / d) * 5.5 * dt;
    } else if (w.t > 0.8) {
      w.phase = 'arrived';
      rescueBeam.visible = false;
      hideCaption();
      openCard(markerById['fourth-watch']);
    }
  } else if (w.phase === 'return') {
    const u = Math.min(1, w.t / WW_RETURN_DUR);
    const e = u * u * (3 - 2 * u);
    const bx = WW_DROP.x + (WW_BOARD.x - WW_DROP.x) * e;
    const bz = WW_DROP.z + (WW_BOARD.z - WW_DROP.z) * e;
    wwBoat.position.set(bx, Math.sin(w.t * 1.4) * 0.12, bz);
    wwBoat.rotation.y = Math.atan2(WW_BOARD.x - WW_DROP.x, WW_BOARD.z - WW_DROP.z);
    player.position.set(bx, 0, bz);
    applyWarmth(0.07 + 0.78 * e);
    if (u >= 1) {
      waterWalk = null;
      player.visible = true;
      player.position.set(WW_BOARD.x, 0, WW_BOARD.z);
      wwBoat.position.set(WW_BOARD.x, 0, WW_BOARD.z);
      wwBoat.rotation.y = Math.PI * 0.75;
      sinkVeil.style.opacity = '0';
      state.modal = false;
      toast('다시 물가로 돌아왔어요.');
    }
  }
}

/* ---------------- 십자가의 어둠 (눅 23:44 · 요 19:30) ----------------
   7번 카드를 닫는 순간, 온 세계가 어두워진다. 복음의 중심 사건은
   멀리서 보더라도 세계 전체를 덮는 것으로 겪어야 한다. */
const eclipseEl = document.getElementById('eclipse');
const veilTearEl = document.getElementById('veil-tear');
let eclipse = null;
function startEclipse() {
  if (state.view === 'chart') toggleView();
  state.modal = true;
  veilTearEl.classList.remove('torn');
  // 복음의 중심 사건이니 서두르지 않는다 — 각 대사 사이에 충분히 머무른다
  eclipse = {
    t: 0, dur: 26,
    caps: [
      { at: 1.2, text: '정오였다. 그런데 온 땅에 어둠이 내렸다. (눅 23:44)' },
      { at: 7.0, text: '세 시간이 지났을 때, 크게 외치는 소리가 들렸다.', cry: true },
      { at: 13.5, text: '"다 이루었다." (요 19:30)' },
      { at: 20.0, text: '그 순간, 성전 휘장이 위에서 아래까지 찢어졌다.', veil: true },
    ],
  };
  voyageCaptionEl.textContent = '';
  voyageCaptionEl.classList.remove('hidden');
}
function skipEclipse() {
  if (eclipse && eclipse.t > 1.5) eclipse.t = Math.max(eclipse.t, eclipse.dur - 1.2);
}
function updateEclipse(dt) {
  eclipse.t += dt;
  const fadeIn = Math.min(1, eclipse.t / 4);
  const fadeOut = Math.max(0, 1 - Math.max(0, eclipse.t - (eclipse.dur - 2.2)) / 2.2);
  eclipseEl.style.opacity = String(0.93 * fadeIn * fadeOut);
  while (eclipse.caps.length && eclipse.t >= eclipse.caps[0].at) {
    const c = eclipse.caps.shift();
    voyageCaptionEl.textContent = c.text;
    voyageCaptionEl.style.opacity = '1';
    if (c.cry) audio.play('horn', { freq: 49, gain: 0.42, dur: 3.4 });
    if (c.veil) veilTearEl.classList.add('torn');
  }
  if (eclipse.t >= eclipse.dur) {
    eclipse = null;
    eclipseEl.style.opacity = '0';
    voyageCaptionEl.style.opacity = '0';
    veilTearEl.classList.remove('torn');
    setTimeout(() => voyageCaptionEl.classList.add('hidden'), 800);
    state.modal = false;
  }
}

/* ---------------- 장면 상호작용: 그물 · 고백 · 부인 · 회복 ----------------
   첫 방문에는 카드를 바로 열지 않고 장면을 먼저 겪는다.
   각 흐름의 끝에서 openCard()가 불려 기록과 카드로 이어진다. */

const dialogEl = document.getElementById('dialog');
const dialogSpeaker = document.getElementById('dialog-speaker');
const dialogLine = document.getElementById('dialog-line');
const dialogActions = document.getElementById('dialog-actions');

function showDialog(speaker, line) {
  state.modal = true;
  dialogSpeaker.textContent = speaker;
  dialogLine.textContent = line;
  dialogActions.innerHTML = '';
  dialogEl.classList.remove('hidden');
}
function closeDialog() {
  dialogEl.classList.add('hidden');
  dialogActions.innerHTML = '';
}
function dialogButton(label, onTap) {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.addEventListener('click', onTap);
  dialogActions.appendChild(b);
  return b;
}
// 길게 눌러야 완성되는 버튼 — 고백에는 손끝에 무게가 있다
function dialogHoldButton(label, ms, onDone) {
  const b = document.createElement('button');
  b.type = 'button';
  const fill = document.createElement('span');
  fill.className = 'hold-fill';
  b.append(document.createTextNode(label), fill);
  let start = null, timer = null, fired = false;
  const cancel = () => { start = null; clearInterval(timer); fill.style.width = '0%'; };
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { b.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
    start = performance.now();
    timer = setInterval(() => {
      if (start === null || fired) return;
      const k = Math.min(1, (performance.now() - start) / ms);
      fill.style.width = `${k * 100}%`;
      if (k >= 1) { fired = true; clearInterval(timer); buzz(18); onDone(); }
    }, 30);
  });
  b.addEventListener('pointerup', cancel);
  b.addEventListener('pointercancel', cancel);
  dialogActions.appendChild(b);
  return b;
}

// ---- 그물 던지기 연출 (1번에서 쓰고, 9·10번이 재사용한다) ----
const netGroup = new THREE.Group();
{
  const mat = new THREE.LineBasicMaterial({ color: 0x5a4a38 });
  const rim = [];
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    rim.push(new THREE.Vector3(Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4));
  }
  netGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rim), mat));
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    netGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4)]),
      mat
    ));
  }
  netGroup.visible = false;
  scene.add(netGroup);
}
const splashRings = [];
function splashAt(x, z, big = false) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.3, 0.5, 20),
    new THREE.MeshBasicMaterial({ color: 0xe8f0ee, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.05, z);
  scene.add(ring);
  splashRings.push({ m: ring, t: 0, s: big ? 3.4 : 1.8 });
  audio.play('splash', { gain: big ? 0.4 : 0.24 });
}
// 달릴 때 이는 흙먼지
const dustPuffs = [];
let dustTimer = 0;
let ambientFishTimer = 6;
const dustMat = new THREE.MeshBasicMaterial({ color: 0xcbb98e, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide });
function dustAt(x, z) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.28, 8), dustMat.clone());
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.12, z);
  scene.add(m);
  dustPuffs.push({ m, t: 0 });
}

const fishJumps = [];
const fishMat = new THREE.MeshLambertMaterial({ color: 0xc7d2d6 });
function fishBurst(x, z, n = 14) {
  for (let i = 0; i < n; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.5, 10), fishMat);
    f.position.set(x, 0, z);
    scene.add(f);
    const a = Math.random() * Math.PI * 2;
    fishJumps.push({
      m: f, t: -Math.random() * 1.4, dur: 0.9 + Math.random() * 0.4,
      x, z, dx: Math.cos(a) * (0.6 + Math.random()), dz: Math.sin(a) * (0.6 + Math.random()),
      h: 1.3 + Math.random() * 1.3,
    });
  }
}
let netCast = null; // { t, fromX, fromZ, toX, toZ, empty, fishN, onDone }
let flowBusy = false;
function castNet(toX, toZ, { empty, fishN, onDone }) {
  flowBusy = true;
  netCast = { t: 0, fromX: player.position.x, fromZ: player.position.z, toX, toZ, empty, fishN, onDone };
}
function updateNetFx(dt) {
  if (netCast) {
    const c = netCast;
    c.t += dt;
    if (c.t < 0.8) { // 그물이 날아간다
      const k = c.t / 0.8;
      netGroup.visible = true;
      netGroup.position.set(
        c.fromX + (c.toX - c.fromX) * k,
        1.6 + Math.sin(k * Math.PI) * 1.6,
        c.fromZ + (c.toZ - c.fromZ) * k
      );
      netGroup.scale.setScalar(0.4 + k);
    } else if (!c.splashed) {
      c.splashed = true;
      splashAt(c.toX, c.toZ);
      netGroup.position.y = 0.05;
    } else if (c.t < 1.9) { // 가라앉아 기다린다
      netGroup.position.y = Math.max(-0.3, netGroup.position.y - dt * 0.5);
    } else if (c.t < 2.9) { // 끌어올린다
      const k = (c.t - 1.9) / 1;
      netGroup.position.set(c.toX + (c.fromX - c.toX) * k, 0.2 + k * 0.8, c.toZ + (c.fromZ - c.toZ) * k);
      netGroup.scale.setScalar(1.4 - k * 0.9);
      if (!c.empty && !c.burst) {
        c.burst = true;
        fishBurst(c.toX, c.toZ, c.fishN || 14);
        splashAt(c.toX, c.toZ, true);
      }
    } else {
      netGroup.visible = false;
      netCast = null;
      flowBusy = false;
      if (c.onDone) c.onDone();
    }
  }
  for (let i = splashRings.length - 1; i >= 0; i--) {
    const s = splashRings[i];
    s.t += dt;
    const k = s.t / 0.8;
    if (k >= 1) { scene.remove(s.m); splashRings.splice(i, 1); continue; }
    s.m.scale.setScalar(1 + k * s.s);
    s.m.material.opacity = 0.8 * (1 - k);
  }
  for (let i = dustPuffs.length - 1; i >= 0; i--) {
    const p = dustPuffs[i];
    p.t += dt;
    const k = p.t / 0.55;
    if (k >= 1) { scene.remove(p.m); dustPuffs.splice(i, 1); continue; }
    p.m.scale.setScalar(1 + k * 2.2);
    p.m.position.y = 0.12 + k * 0.3;
    p.m.material.opacity = 0.5 * (1 - k);
  }
  for (let i = fishJumps.length - 1; i >= 0; i--) {
    const f = fishJumps[i];
    f.t += dt;
    if (f.t < 0) continue;
    const k = f.t / f.dur;
    if (k >= 1) {
      const lx = f.m.position.x, lz = f.m.position.z;
      scene.remove(f.m);
      fishJumps.splice(i, 1);
      if (Math.random() < 0.5) splashAt(lx, lz);
      continue;
    }
    f.m.position.set(f.x + f.dx * k, Math.sin(k * Math.PI) * f.h, f.z + f.dz * k);
    f.m.rotation.z = Math.PI * (0.5 - k);
  }
}

// ---- 흐름 정의: id → { label(), advance(marker) } ----
const flows = {};

// 1번 마지막 던지기: 말씀 그대로 "깊은 데로 가서" — 물가의 배에 올라
// 깊은 물로 저어 나가, 거기서 그물을 내리고, 만선으로 돌아온다 (눅 5:4)
let netsRide = null;
const NETS_MOOR = { x: -33, z: -122, rot: -0.6 }; // shoreBoat의 정박 자리
const NETS_DEEP = { x: -16, z: -130 };
function startNetsRide(marker) {
  flowBusy = true;
  state.modal = true;
  player.visible = false;
  netsRide = { marker, phase: 'out', t: 0 };
}
function updateNetsRide(dt) {
  const r = netsRide;
  r.t += dt;
  if (r.phase === 'out') {
    const u = Math.min(1, r.t / 3.2);
    const e = u * u * (3 - 2 * u);
    const bx = NETS_MOOR.x + (NETS_DEEP.x - NETS_MOOR.x) * e;
    const bz = NETS_MOOR.z + (NETS_DEEP.z - NETS_MOOR.z) * e;
    shoreBoat.position.set(bx, Math.sin(r.t * 1.3) * 0.08, bz);
    shoreBoat.rotation.y = Math.atan2(NETS_DEEP.x - NETS_MOOR.x, NETS_DEEP.z - NETS_MOOR.z);
    player.position.set(bx, 0, bz);
    if (u >= 1) {
      r.phase = 'cast';
      r.t = 0;
      toast('여기가 깊은 데다 — 그물을 내린다.');
      const dir = Math.atan2(0 - bx, -129 - bz);
      castNet(bx + Math.sin(dir) * 6, bz + Math.cos(dir) * 6, {
        empty: false,
        fishN: 22,
        onDone: () => {
          toast('그물이 찢어질 만큼 — 배가 잠길 만큼!', 5000);
          netsRide.phase = 'back';
          netsRide.t = 0;
        },
      });
    }
  } else if (r.phase === 'cast') {
    // 만선의 무게로 배가 기우뚱거린다
    shoreBoat.rotation.z = Math.sin(r.t * 3.5) * 0.07 * Math.min(1, r.t / 2);
    shoreBoat.position.y = Math.sin(r.t * 1.3) * 0.08 - Math.min(0.14, r.t * 0.03);
  } else if (r.phase === 'back') {
    const u = Math.min(1, r.t / 3);
    const e = u * u * (3 - 2 * u);
    const bx = NETS_DEEP.x + (NETS_MOOR.x - NETS_DEEP.x) * e;
    const bz = NETS_DEEP.z + (NETS_MOOR.z - NETS_DEEP.z) * e;
    shoreBoat.position.set(bx, Math.sin(r.t * 1.3) * 0.08 - 0.14 * (1 - u), bz);
    shoreBoat.rotation.y = Math.atan2(NETS_MOOR.x - NETS_DEEP.x, NETS_MOOR.z - NETS_DEEP.z);
    shoreBoat.rotation.z = Math.sin(r.t * 3.5) * 0.05 * (1 - u);
    player.position.set(bx, 0, bz);
    if (u >= 1) {
      const m = r.marker;
      netsRide = null;
      shoreBoat.position.set(NETS_MOOR.x, 0, NETS_MOOR.z);
      shoreBoat.rotation.set(0, NETS_MOOR.rot, 0);
      player.visible = true;
      player.position.set(NETS_MOOR.x + 2, 0, NETS_MOOR.z - 2); // 뭍으로 내려선다
      flowBusy = false;
      state.modal = false;
      openCard(m);
    }
  }
}

flows.nets = {
  step: 0,
  labels: ['🕸 그물 던지기', '🕸 그물 다시 던지기', '🕸 한 번 더 던지기', '⚓ 말씀대로 깊은 데로 저어 가기'],
  label() { return this.labels[this.step]; },
  advance(marker) {
    if (this.step === 3) { startNetsRide(marker); return; }
    const dir = Math.atan2(0 - player.position.x, -129 - player.position.z); // 호수 한가운데 쪽
    const step = this.step;
    castNet(player.position.x + Math.sin(dir) * 5, player.position.z + Math.cos(dir) * 5, {
      empty: true,
      onDone: () => {
        if (step === 0) toast('…아무것도 걸리지 않았다.');
        else if (step === 1) toast('또 빈 그물이다. 밤새도록 이랬다.');
        else toast('"깊은 데로 가서 그물을 내려 고기를 잡아라." (눅 5:4)', 6000);
      },
    });
    this.step++;
  },
};

flows['long-night'] = {
  step: 0,
  label() { return '🕸 그물 던지기'; },
  advance(marker) {
    this.throw(marker);
  },
  throw(marker) {
    let lineText = '';
    if (this.step === 0) {
      lineText = '밤새 애써도 아무것도 잡지 못한 어둠 속에, 다시 그물을 던질 준비를 한다.';
    } else if (this.step === 1) {
      lineText = '아무것도 없다.';
    } else {
      lineText = '밤이 깊어간다. 여전히 아무것도.';
    }
    showDialog('', lineText);
    
    const btnLabel = this.step === 0 ? '그물을 던진다' : (this.step === 1 ? '그물을 다시 던진다' : '그물을 한 번 더 던진다');
    dialogButton(btnLabel, () => {
      audio.play('splash', { gain: 0.35 });
      dialogActions.innerHTML = ''; // 중복 클릭 방지
      dialogLine.textContent = '그물을 끌어 올리는 중…';
      setTimeout(() => {
        this.step++;
        if (this.step === 1) {
          this.throw(marker);
        } else if (this.step === 2) {
          this.throw(marker);
        } else {
          showDialog('', '동이 트는데도, 그물은 비어 있다.');
          setTimeout(() => {
            closeDialog();
            openCard(marker);
          }, 1500);
        }
      }, 2200);
    });
  }
};

flows['caesarea-philippi'] = {
  label() { return '🗣 물음에 대답하기'; },
  advance(marker) {
    showDialog('예수께서 물으셨다', '"사람들이 나를 누구라 하느냐?"');
    ['세례 요한이라 합니다', '엘리야라 합니다', '예언자 중 하나라 합니다'].forEach((a) => {
      dialogButton(a, () => {
        showDialog('예수께서 다시 물으셨다', '"그러면 너희는 — 나를 누구라 하느냐?"');
        dialogHoldButton('길게 눌러 고백하기 · "주는 그리스도시요, 살아 계신 하나님의 아들이십니다"', 1400, () => {
          closeDialog();
          openCard(marker);
        });
      });
    });
  },
};

flows['first-fire'] = {
  round: 0,
  qs: [
    ['불빛 곁의 여종이 말했다', '"당신도 그 갈릴리 사람, 예수와 함께 있었지요?"'],
    ['조금 뒤, 다른 사람이 말했다', '"이 사람도 그들과 한패요."'],
    ['한 시간쯤 지나, 또 누군가', '"틀림없이 한패요. 말씨가 갈릴리 사람이오."'],
  ],
  label() { return '🔥 불 곁에 서다'; },
  advance(marker) { this.ask(marker); },
  ask(marker) {
    const [sp, q] = this.qs[this.round];
    showDialog(sp, q);
    // 옳은 대답은 손끝에서 도망간다 — 부인의 심리를 조작으로
    const know = dialogButton('…나는 그를 압니다', () => {});
    know.classList.add('ghost-btn');
    let dodges = 0;
    const dodge = (e) => {
      e.preventDefault();
      dodges++;
      know.style.transform = `translate(${(Math.random() - 0.5) * 140}px, ${(Math.random() - 0.5) * 56}px)`;
      if (dodges >= 2) know.style.opacity = '0.35';
    };
    know.addEventListener('pointerdown', dodge);
    know.addEventListener('pointerenter', dodge);
    dialogButton('나는 그를 모릅니다', () => {
      this.round++;
      if (this.round < 3) { this.ask(marker); return; }
      closeDialog();
      audio.play('rooster', { gain: 0.22 });
      voyageCaptionEl.textContent = '주께서 돌이켜 베드로를 보시니라. (눅 22:61)';
      voyageCaptionEl.classList.remove('hidden');
      voyageCaptionEl.style.opacity = '1';
      setTimeout(() => {
        voyageCaptionEl.style.opacity = '0';
        setTimeout(() => voyageCaptionEl.classList.add('hidden'), 800);
        openCard(marker);
      }, 3400);
    });
  },
};

flows['three-questions'] = {
  round: 0,
  label() { return '🔥 조반 뒤, 그분 곁에 앉다'; },
  advance(marker) { this.ask(marker); },
  ask(marker) {
    const third = this.round === 2;
    showDialog(
      third ? '세 번째 물음 — 베드로는 근심했다' : '예수께서 물으셨다',
      '"요한의 아들 시몬아, 네가 나를 사랑하느냐?"'
    );
    const btn = dialogHoldButton(
      '길게 눌러 대답하기 · "주님, 제가 주님을 사랑하는 줄을 주님이 아십니다"',
      third ? 2000 : 1100,
      () => {
        const replies = ['"내 어린 양을 먹여라."', '"내 양을 쳐라."', '"내 양을 먹여라 — 나를 따르라."'];
        dialogSpeaker.textContent = '예수께서 말씀하셨다';
        dialogLine.textContent = replies[this.round];
        dialogActions.innerHTML = '';
        this.round++;
        setTimeout(() => {
          if (this.round < 3) this.ask(marker);
          else { closeDialog(); openCard(marker); }
        }, 1900);
      }
    );
    if (third) btn.classList.add('tremble');
  },
};

// 3번은 흐름이 아니라 배가 관문 — 멀리서 탭했을 때의 안내만 담당한다
flows['fourth-watch'] = {
  label() { return '새벽 네 시 · 이야기 읽기'; },
  advance(marker) { openCard(marker); },
  remoteHint: '물가의 붉은 깃발이 걸린 배에 올라야 갈 수 있어요.',
};

// ---- 마을 사람들: 가버나움(2번)과 오순절(12번)에서 모여드는 무리 ----
function villager(x, z) {
  const g = new THREE.Group();
  const robe = new THREE.Mesh(
    new THREE.ConeGeometry(0.55, 1.9, 16),
    lambert([0x8a7458, 0x6e5f49, 0x7d6a52, 0x5d5142][Math.floor(Math.random() * 4)])
  );
  robe.position.y = 0.95;
  robe.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 12), lambert(0xc99a72));
  head.position.y = 2.2;
  g.add(robe, head);
  g.scale.setScalar(0.55);
  g.position.set(x, 0, z);
  scene.add(g);
  return g;
}
function makeCrowd(spots) {
  return spots.map(([x, z]) => ({ g: villager(x, z), x, z, tx: x, tz: z, ph: Math.random() * 6 }));
}
function sendCrowd(crowd, cx, cz, rMin, rMax) {
  crowd.forEach((p, i) => {
    const a = (i / crowd.length) * Math.PI * 2 + Math.random() * 0.5;
    const r = rMin + Math.random() * (rMax - rMin);
    p.tx = cx + Math.cos(a) * r;
    p.tz = cz + Math.sin(a) * r;
  });
}
function updateCrowd(crowd, dt, t) {
  for (const p of crowd) {
    const dx = p.tx - p.g.position.x, dz = p.tz - p.g.position.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.15) {
      p.g.position.x += (dx / d) * Math.min(d, 2.2 * dt);
      p.g.position.z += (dz / d) * Math.min(d, 2.2 * dt);
      p.g.rotation.y = Math.atan2(dx, dz);
      p.g.position.y = Math.abs(Math.sin(t * 7 + p.ph)) * 0.05;
    } else {
      p.g.position.y = 0;
    }
  }
}
// 가버나움: 마을에 흩어져 있다가, 다가가면 "온 동네가 문 앞에" 모여든다 (막 1:33)
const capernaumCrowd = makeCrowd([
  [-18, -160], [-14, -164], [-6, -166], [-1, -160], [-3, -152], [-17, -149], [-8, -147], [-13, -155],
]);
let crowdCalled = false;
// 오순절: 외침에 모여드는 무리
const pentecostCrowd = makeCrowd([
  [-10, 100], [14, 102], [12, 122], [-8, 124], [-14, 112], [16, 112], [-4, 96], [8, 96], [0, 126], [-16, 122],
]);

/* ---------------- 잃은 양 (눅 15) — 숨은 수집 ----------------
   맵 곳곳에 잃은 양 열두 마리가 숨어 있다. 가까이 가면 매애 하고 울고,
   곁에 서면 찾은 것으로 — 한 마리마다 목자의 말씀 한 줄이 따라온다. */
const LOST_SHEEP_SPOTS = [
  [-44, -134], [22, -166], [38, -132], [-34, -92],   // 갈릴리 물가 안팎
  [26, -192],                                          // 가이사랴 절벽 뒤
  [16, -54], [-14, 2], [12, 48],                       // 요단 길가
  [52, 108], [-44, 142], [18, 140],                    // 예루살렘 언저리
  [-222, 112],                                         // 로마, 경기장 곁
];
const LOST_SHEEP_LINES = [
  '"너희 중에 누가 양 백 마리가 있는데 하나를 잃으면…" (눅 15:4)',
  '"아흔아홉 마리를 들에 두고, 잃은 것을 찾아 나서지 않겠느냐." (눅 15:4)',
  '"찾아내면 기뻐서 어깨에 메고 돌아온다." (눅 15:5)',
  '"나와 함께 기뻐하자. 잃은 양을 찾았다!" (눅 15:6)',
  '"나는 선한 목자라. 선한 목자는 양들을 위하여 목숨을 버린다." (요 10:11)',
  '"내 양은 내 음성을 들으며, 나는 그들을 안다." (요 10:27)',
  '"우리는 다 양 같아서 각기 제 길로 갔거늘…" (사 53:6)',
  '"여호와는 나의 목자시니 내게 부족함이 없으리로다." (시 23:1)',
  '"그가 나를 푸른 풀밭에 누이시며 쉴 만한 물가로 인도하시는도다." (시 23:2)',
  '"내가 사망의 음침한 골짜기로 다닐지라도 해를 두려워하지 않을 것은…" (시 23:4)',
  '"너희가 전에는 양과 같이 길을 잃었더니, 이제는 목자에게 돌아왔느니라." (벧전 2:25)',
  '"인자가 온 것은 잃어버린 자를 찾아 구원하려 함이니라." (눅 19:10)',
];
const lostSheep = LOST_SHEEP_SPOTS.map(([x, z], i) => {
  const g = makeSheep(x, z);
  // 목의 붉은 끈 — 잃은 양의 표식
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.56), lambert(0xa8341f));
  band.position.set(0, 0.82, 0.34);
  g.add(band);
  return { g, x, z, i, found: false, bleatT: Math.random() * 4, fadeT: -1, baa: null };
});
// 무음 양 신호 — 소리를 못 듣는 플레이어를 위한 "매애…" 말풍선 (텍스처는 하나만 공유)
let baaBubble = null;
const sheepChipEl = document.getElementById('sheep-chip');
function updateSheepChip() {
  const n = save.sheep.length;
  sheepChipEl.textContent = `🐑 ${n}/12`;
  sheepChipEl.classList.toggle('hidden', n === 0);
  sheepChipEl.classList.toggle('gold', n === 12);
}
function collectSheep(s) {
  s.found = true;
  s.fadeT = 0;
  audio.play('bleat', { gain: 0.22 });
  goldBurst(s.x, s.z, 1);
  buzz(30);
  if (!save.sheep.includes(s.i)) {
    save.sheep.push(s.i);
    persistSave();
  }
  updateSheepChip();
  const n = save.sheep.length;
  toast(`🐑 ${LOST_SHEEP_LINES[s.i]} — 찾은 양 ${n} / 12`, 6500);
  if (n === 12) {
    setTimeout(() => {
      toast('🐑 잃은 양 열두 마리를 모두 찾았어요 — 목자의 마음을 걸어서 배웠어요!', 8000);
      spawnPetLamb();
      checkRecordComplete(); // 이 시점에 14곳도 이미 끝나 있었다면 여기서 완주 시간이 새겨진다
    }, 6800);
  }
}
function updateLostSheep(dt, t) {
  for (const s of lostSheep) {
    if (s.fadeT >= 0) {
      // 찾은 양은 폴짝폴짝 뛰다 무리에게로 사라진다
      s.fadeT += dt;
      const k = Math.min(1, s.fadeT / 1.1);
      s.g.position.y = Math.abs(Math.sin(s.fadeT * 12)) * 0.5 * (1 - k);
      s.g.scale.setScalar(0.7 * (1 - k));
      if (k >= 1) { s.g.visible = false; s.fadeT = -1; }
      continue;
    }
    if (s.found) continue;
    const d = Math.hypot(player.position.x - s.x, player.position.z - s.z);
    if (d < 15) {
      s.bleatT -= dt;
      if (s.bleatT <= 0) {
        s.bleatT = 2.4 + Math.random() * 3;
        audio.play('bleat', { gain: Math.max(0.05, 0.19 - d * 0.011) });
        // 처음 듣는 매애: 이게 뭔지 한 번은 알려 준다
        if (!save.sheepHint) {
          save.sheepHint = true;
          persistSave();
          toast('🐑 어디선가 양 우는 소리가… 무리에서 떨어진 잃은 양이 근처에 있어요!', 6000);
        }
      }
      s.g.position.y = Math.abs(Math.sin(t * 4 + s.i)) * 0.08; // 안절부절
      if (!s.baa) {
        // 처음 가까이 왔을 때에야 스프라이트를 만든다 (재질만 양마다, 텍스처는 공유)
        if (!baaBubble) baaBubble = makeBubbleTexture('매애…');
        s.baa = new THREE.Sprite(new THREE.SpriteMaterial({ map: baaBubble.tex, transparent: true, depthTest: false, opacity: 0 }));
        s.baa.position.set(0, 4.0, 0); // 양 g.scale 0.7 감안한 로컬 높이
        s.baa.renderOrder = 6;
        s.baa.scale.set((baaBubble.w / 96) * 1.15, 1.15, 1);
        s.g.add(s.baa);
      }
    }
    if (s.baa) {
      const target = !s.found && d < 15 ? 0.9 : 0;
      s.baa.material.opacity += (target - s.baa.material.opacity) * Math.min(1, dt * 4);
      s.baa.position.y = 4.0 + Math.sin(t * 2 + s.i) * 0.15; // 살짝 둥실
    }
    if (d < 2.8 && !state.modal && !flowBusy) collectSheep(s);
  }
}

/* ---------------- 반응하는 세계: 이야기 진행에 따라 바뀌는 말풍선 ---------------- */
function makeBubbleTexture(text) {
  const [cv, ctx2] = canvas2d(16, 16); // 측정용
  ctx2.font = `500 34px 'Noto Serif KR', 'Apple SD Gothic Neo', serif`;
  const tw = Math.ceil(ctx2.measureText(text).width) + 56;
  const [bv, btx] = canvas2d(tw, 96);
  btx.font = `500 34px 'Noto Serif KR', 'Apple SD Gothic Neo', serif`;
  btx.fillStyle = 'rgba(236,226,196,0.94)';
  btx.strokeStyle = 'rgba(59,53,44,0.9)';
  btx.lineWidth = 3;
  btx.beginPath();
  if (btx.roundRect) btx.roundRect(4, 8, tw - 8, 72, 26);
  else btx.rect(4, 8, tw - 8, 72); // 구형 브라우저
  btx.fill();
  btx.stroke();
  btx.fillStyle = '#3b352c';
  btx.textAlign = 'center';
  btx.textBaseline = 'middle';
  btx.fillText(text, tw / 2, 46);
  const tex = new THREE.CanvasTexture(bv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { tex, w: tw };
}
const TALK_LINES = [
  ['밤새 그물이 텅 비었다는군.', '회당에 새 선생님이 오셨대.', '시몬네 장모가 앓아누웠다던데.', '오늘은 호수가 잔잔하네.'],
  ['그 나사렛 선생 이야기 들었어?', '병자들이 낫고 있대!', '오천 명이 배불리 먹었다더군.', '그분이 예루살렘으로 가신대.'],
  ['도성이 술렁이고 있어.', '한밤중에 그 선생이 잡혀갔대.', '대제사장 뜰에 끌려갔다던데.', '오늘 밤 무슨 일이 벌어질지 아무도 몰라.'],
  ['정오였는데 온 땅이 어두웠잖아…', '성전 휘장이 찢어졌다더군.', '백부장이 그가 진실로 의인이었다고 했대.', '갈릴리에서 온 여인들이 끝까지 지켜봤다더군.'],
  ['무덤이 비었다던데!', '그를 봤다는 사람들이 있어.', '갈릴리로 가라 하셨다던데.', '정말일까… 살아나신 걸까?'],
  ['삼천 명이 세례를 받았대!', '그들은 가진 것을 서로 나눈다더군.', '그 어부가 무리 앞에서 외쳤다지.', '이 이야기가 어디까지 갈까?'],
  ['그 어부, 로마까지 갔다지.', '반석 위에 교회를 세운다더니.', '우리도 그 길을 걸을 수 있을까.', '이야기는 아직 끝나지 않았어.'],
];
// stage 2: 체포~부인(십자가 전) — 휘장 이야기는 아직 나오면 안 됨
// stage 3: 십자가 사건(7번) 이후~빈 무덤(8번) 전 — 휘장 찢어짐은 여기서부터
function storyStage() {
  return nextNum <= 2 ? 0
    : nextNum <= 5 ? 1
    : nextNum <= 7 ? 2
    : nextNum <= 8 ? 3
    : nextNum <= 11 ? 4
    : nextNum <= 14 ? 5
    : 6;
}
const talkers = [];
function addTalker(person, idx) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, opacity: 0 }));
  sprite.position.set(0, 4.9, 0);
  sprite.renderOrder = 6;
  person.g.add(sprite);
  talkers.push({ sprite, g: person.g, idx, stage: -1 });
}
[0, 2, 4, 6].forEach((k, j) => { if (capernaumCrowd[k]) addTalker(capernaumCrowd[k], j); });
[1, 3, 5, 8].forEach((k, j) => { if (pentecostCrowd[k]) addTalker(pentecostCrowd[k], j); });
function updateTalkers(dt) {
  const st = storyStage();
  for (const tk of talkers) {
    if (tk.stage !== st) {
      tk.stage = st;
      const { tex, w } = makeBubbleTexture(TALK_LINES[st][tk.idx % 4]);
      if (tk.sprite.material.map) tk.sprite.material.map.dispose();
      tk.sprite.material.map = tex;
      tk.sprite.material.needsUpdate = true;
      const h = 1.7; // 그룹 스케일(0.55)을 감안한 로컬 크기
      tk.sprite.scale.set((w / 96) * h, h, 1);
    }
    const d = Math.hypot(player.position.x - tk.g.position.x, player.position.z - tk.g.position.z);
    const target = d < 11 && !state.modal ? 0.95 : 0;
    tk.sprite.material.opacity += (target - tk.sprite.material.opacity) * Math.min(1, dt * 4);
  }
}

// 목자의 부탁 — 잃은 양 퀘스트를 세계 안에서 알려 주는 사람 (요단 길 한복판)
// 양 인덱스 → 지역 이름 (LOST_SHEEP_SPOTS 순서 그대로) — 남은 양의 방향 힌트용
const SHEEP_REGIONS = ['갈릴리 물가', '갈릴리 물가', '갈릴리 물가', '갈릴리 물가',
  '가이사랴 절벽', '요단 길가', '요단 길가', '요단 길가',
  '예루살렘 언저리', '예루살렘 언저리', '예루살렘 언저리', '로마'];
let shepherdBubble = null;
let shepherdBubbleState = -1;
function updateShepherdBubble(dt) {
  if (!shepherdG) return;
  if (!shepherdBubble) {
    shepherdBubble = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, opacity: 0 }));
    shepherdBubble.position.set(0, 5.4, 0);
    shepherdBubble.renderOrder = 6;
    shepherdG.add(shepherdBubble);
  }
  const n = save.sheep.length;
  let key, text;
  if (n >= 12) {
    key = 'done';
    text = '고맙네! 열두 마리가 다 돌아왔어 — 자네, 목자가 다 됐군.';
  } else if (n === 0) {
    key = 'ask';
    text = '양들이 흩어졌어… 매애 소리를 따라가 열두 마리를 찾아 주게!';
  } else {
    // 아직 못 찾은 첫 양의 지역으로 힌트 — 11/12에서 막히지 않게
    let region = '';
    for (let i = 0; i < SHEEP_REGIONS.length; i++) {
      if (!save.sheep.includes(i)) { region = SHEEP_REGIONS[i]; break; }
    }
    key = 'hint:' + region;
    text = `고맙네! 그런데 아직 ${region} 쪽에서 우는 소리가 들린다는군…`;
  }
  if (shepherdBubbleState !== key) {
    shepherdBubbleState = key;
    const { tex, w } = makeBubbleTexture(text);
    if (shepherdBubble.material.map) shepherdBubble.material.map.dispose();
    shepherdBubble.material.map = tex;
    shepherdBubble.material.needsUpdate = true;
    const h = 1.5;
    shepherdBubble.scale.set((w / 96) * h, h, 1);
  }
  const d = Math.hypot(player.position.x - shepherdG.position.x, player.position.z - shepherdG.position.z);
  const target = d < 15 && !state.modal ? 0.95 : 0;
  shepherdBubble.material.opacity += (target - shepherdBubble.material.opacity) * Math.min(1, dt * 4);
}

/* ---------------- 작은 기쁨들: 새끼 양 · 요나의 물고기 · 수탉 · 불꽃 · 진동 ---------------- */

// 손끝의 반응 (안드로이드 크롬 등에서만; 없으면 조용히 무시)
function buzz(pattern) {
  try { if (navigator.vibrate) navigator.vibrate(pattern); } catch { /* 미지원 */ }
}

// 금빛 불꽃: 기록·수집의 순간이 손에 잡히게
const sparks = [];
const sparkTex = (() => {
  const [cv, c] = canvas2d(32, 32);
  const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,224,130,1)');
  g.addColorStop(0.5, 'rgba(230,180,60,0.6)');
  g.addColorStop(1, 'rgba(230,180,60,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 32, 32);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
})();
function goldBurst(x, z, y = 3) {
  for (let i = 0; i < 12; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false, opacity: 0.95 }));
    sp.material.color.multiplyScalar(3); // HDR 부스트 — 블룸용 (생성 시 1회)
    sp.scale.setScalar(0.5 + Math.random() * 0.5);
    sp.position.set(x, y, z);
    scene.add(sp);
    const a = Math.random() * Math.PI * 2;
    sparks.push({ sp, t: -i * 0.02, vx: Math.cos(a) * (0.8 + Math.random()), vz: Math.sin(a) * (0.8 + Math.random()), vy: 2.2 + Math.random() * 2 });
  }
}
function updateSparks(dt) {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i];
    s.t += dt;
    if (s.t < 0) continue;
    const k = s.t / 1.1;
    if (k >= 1) { scene.remove(s.sp); sparks.splice(i, 1); continue; }
    s.sp.position.x += s.vx * dt;
    s.sp.position.z += s.vz * dt;
    s.sp.position.y += (s.vy - s.t * 4.5) * dt;
    s.sp.material.opacity = 0.95 * (1 - k);
  }
}

/* ---------------- 앉기 (쉼) — 이야기를 겪은 자리에서만 앉아 쉴 수 있다 ---------------- */

const REST_SPOTS = [
  { x: 10, z: 120, gate: 'first-fire', label: '🔥 불가에 앉기' },
  { x: 27, z: -141, gate: 'second-fire', label: '🔥 불가에 앉기' },
  { x: 44, z: 100, gate: 'gethsemane', label: '🌿 감람나무 아래 앉기' },
];
const REST_VERSES = [
  '“여호와는 나의 목자시니 내게 부족함이 없으리로다.” (시 23:1)',
  '“가만히 있어 내가 하나님 됨을 알지어다.” (시 46:10)',
  '“나의 영혼아 잠잠히 하나님만 바라라.” (시 62:5)',
  '“여호와께서 그의 사랑하시는 자에게는 잠을 주시는도다.” (시 127:2)',
];
let sitting = null; // { t, spot, versed, starred }
function sitDown(spot) {
  sitting = { t: 0, spot, versed: false, starred: false };
  cam.dist = 22; // smoothDist가 알아서 서서히 물러난다
}
function standUp() {
  sitting = null;
  cam.dist = 11;
  hideCaption();
}
function updateSitting(dt) {
  sitting.t += dt;
  if (sitting.t >= 5 && !sitting.versed) {
    sitting.versed = true;
    showCaption(REST_VERSES[Math.floor(Math.random() * REST_VERSES.length)]);
    setTimeout(() => { if (sitting) hideCaption(); }, 4500);
  }
  if (sitting.t >= 20 && !sitting.starred) {
    sitting.starred = true;
    spawnShootingStar();
  }
}

// 별똥별: 오래 앉아 쉬는 사람만 보는 하늘의 선물
const shootingStars = [];
function spawnShootingStar() {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: sparkTex, color: 0xeef2ff, transparent: true, depthWrite: false, opacity: 0.95,
  }));
  sp.material.color.multiplyScalar(4); // HDR 부스트 — 블룸용 (생성 시 1회)
  sp.scale.set(7, 0.5, 1); // 가로로 길게 — 흐르는 획
  sp.position.set(
    player.position.x + rnd(-60, 60),
    90 + rnd(0, 30),
    player.position.z + rnd(-80, -20)
  );
  scene.add(sp);
  const side = Math.random() < 0.5 ? 1 : -1; // 좌우 어느 쪽으로든 흐른다
  shootingStars.push({ sp, t: 0, vx: rnd(-65, -45) * side, vy: -18, vz: 15 });
}
function updateShootingStars(dt) {
  for (let i = shootingStars.length - 1; i >= 0; i--) {
    const s = shootingStars[i];
    s.t += dt;
    if (s.t >= 1.3) { scene.remove(s.sp); shootingStars.splice(i, 1); continue; }
    s.sp.position.x += s.vx * dt;
    s.sp.position.y += s.vy * dt;
    s.sp.position.z += s.vz * dt;
    s.sp.material.opacity = 0.95 * (1 - s.t / 1.3);
  }
}

// 뜰의 수탉: 몇 번을 탭해도 성실하게 울어 주는 장난감 (6번 곁)
let roosterHopT = 1;
const roosterG = (() => {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.8, 8), lambert(0x6e4a35));
  body.position.y = 0.5;
  body.rotation.x = -0.4;
  body.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 12), lambert(0x7e5540));
  head.position.set(0, 0.95, 0.22);
  const comb = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.2), lambert(0xb0301f));
  comb.position.set(0, 1.13, 0.2);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.55, 12), lambert(0x2e4034));
  tail.position.set(0, 0.78, -0.34);
  tail.rotation.x = 0.9;
  g.add(body, head, comb, tail);
  g.position.set(13, 0, 116.5);
  g.rotation.y = -0.7;
  scene.add(g);
  const hit = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2, 1.6), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  hit.position.set(13, 1, 116.5);
  hit.userData.roosterToy = true;
  scene.add(hit);
  tapTargets.push(hit);
  return g;
})();

// 요나의 큰 물고기: 지중해를 떠돌다 이따금 떠오른다 — 발견한 사람만 아는 비밀
const jonahG = (() => {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0x3d4c58 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), mat);
  body.scale.set(4.2, 1.4, 1.7);
  const tail = new THREE.Mesh(new THREE.ConeGeometry(1, 1.8, 14), mat);
  tail.position.set(-4.6, 0.3, 0);
  tail.rotation.z = Math.PI / 2;
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 12), mat);
  fin.position.set(0.4, 1.2, 0);
  g.add(body, tail, fin);
  body.userData.landmark = {
    name: '큰 물고기…?',
    blurb: `요나를 사흘 동안 품었던 그 물고기일 리는… 없겠지만, 갈릴리 어부들은
      이런 농담을 즐겼을 것이다. 예수께서 시몬을 부르실 때 "시몬 바요나야"라
      하셨다 — <em>요나의 아들 시몬</em>이라는 뜻이다. (마 16:17) 물고기 배 속에서
      사흘을 보내고 살아 나온 요나처럼, 예수께서도 사흘 만에 — 그 이야기의
      끝은, 이미 걸어서 알고 있을 것이다. 이 물고기를 찾아낸 것은 비밀로 해도
      좋다.`,
  };
  tapTargets.push(body);
  g.position.set(-120, -4, 70);
  scene.add(g);
  return g;
})();
const jonah = { state: 'under', t: 0, x: -120, z: 70, tx: -90, tz: 80 };
const JONAH_HAUNTS = [[-90, 80], [-140, 60], [-110, 110], [-75, 75], [-160, 95]];
function updateJonah(dt, t) {
  jonah.t -= dt;
  if (jonah.state === 'under') {
    // 물밑에서 다음 자리로 헤엄쳐 간다
    const dx = jonah.tx - jonah.x, dz = jonah.tz - jonah.z;
    const d = Math.hypot(dx, dz);
    if (d > 1) {
      jonah.x += (dx / d) * 3 * dt;
      jonah.z += (dz / d) * 3 * dt;
      jonahG.rotation.y = Math.atan2(dx, dz) - Math.PI / 2; // 머리가 진행 방향을 향하게
    } else if (jonah.t <= 0) {
      jonah.state = 'up';
      jonah.t = 7; // 7초 동안 수면에
      splashAt(jonah.x, jonah.z, true);
    }
  } else {
    if (jonah.t <= 0) {
      jonah.state = 'under';
      jonah.t = 14 + Math.random() * 14;
      const [nx, nz] = JONAH_HAUNTS[Math.floor(Math.random() * JONAH_HAUNTS.length)];
      jonah.tx = nx; jonah.tz = nz;
      splashAt(jonah.x, jonah.z, true);
    }
  }
  const targetY = jonah.state === 'up' ? -0.4 : -4.2;
  jonahG.position.x = jonah.x;
  jonahG.position.z = jonah.z;
  jonahG.position.y += (targetY - jonahG.position.y) * Math.min(1, dt * 1.6);
  if (jonah.state === 'up') jonahG.position.y += Math.sin(t * 1.1) * 0.02;
}

// 새끼 양: 잃은 양 열두 마리를 다 찾은 사람에게, 평생의 동행
let petLamb = null;
function spawnPetLamb(quiet = false) {
  if (petLamb) return;
  const g = makeSheep(player.position.x - 1.6, player.position.z - 1.6);
  g.scale.setScalar(0.42); // 새끼
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.14, 0.56), lambert(0xb8902e)); // 금색 끈
  band.position.set(0, 0.82, 0.34);
  g.add(band);
  petLamb = { g, hop: 0 };
  if (!quiet) {
    toast('🐑 새끼 양 한 마리가 곁을 떠나지 않기로 했어요 — 목자의 상.', 6500);
    goldBurst(g.position.x, g.position.z, 1.2);
    buzz([30, 40, 80]);
  }
}
function updatePetLamb(dt, t) {
  if (!petLamb) return;
  const g = petLamb.g;
  const dx = player.position.x - g.position.x, dz = player.position.z - g.position.z;
  const d = Math.hypot(dx, dz);
  if (d > 40) { // 항해·순간이동을 놓치면 곁으로 폴짝
    g.position.set(player.position.x - 1.5, 0, player.position.z - 1.5);
    return;
  }
  if (d > 2.1) {
    const sp = Math.min(9, 3 + d);
    g.position.x += (dx / d) * sp * dt;
    g.position.z += (dz / d) * sp * dt;
    g.rotation.y = Math.atan2(dx, dz);
    petLamb.hop += dt * 11;
    g.position.y = Math.abs(Math.sin(petLamb.hop)) * 0.25;
  } else {
    g.position.y = Math.abs(Math.sin(t * 1.6)) * 0.03; // 곁에서 숨쉬기
  }
}

// ---- 오순절(12번): 바람 · 불의 혀 · 일어서서 외치다 ----
const flameFalls = [];
function flameFallAt(x, z) {
  const m = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.65, 7),
    new THREE.MeshBasicMaterial({ color: 0xff9a3a, transparent: true, opacity: 0.95, fog: false })
  );
  m.material.color.multiplyScalar(3.5); // HDR 부스트 — 블룸용 (생성 시 1회)
  m.position.set(x, 9, z);
  scene.add(m);
  flameFalls.push({ m, t: 0, x, z });
}
function updateFlameFalls(dt, t) {
  for (let i = flameFalls.length - 1; i >= 0; i--) {
    const f = flameFalls[i];
    f.t += dt;
    if (f.t < 1.6) {
      const k = f.t / 1.6;
      f.m.position.y = 9 - (9 - 1.6) * (k * k * (3 - 2 * k));
      f.m.position.x = f.x + Math.sin(t * 6 + i) * 0.15;
    } else if (f.t < 4.6) {
      f.m.position.y = 1.6 + Math.sin(t * 9 + i) * 0.08;
      const s = 0.9 + Math.sin(t * 12 + i) * 0.15;
      f.m.scale.set(s, s, s);
    } else {
      f.m.material.opacity = Math.max(0, 0.95 - (f.t - 4.6) * 1.4);
      if (f.m.material.opacity <= 0) { scene.remove(f.m); flameFalls.splice(i, 1); }
    }
  }
}
flows.pentecost = {
  step: 0,
  label() { return this.step === 0 ? '🕊 한곳에 모이다' : '📣 일어서서 외치다'; },
  advance(marker) {
    if (this.step === 0) {
      this.step = 1;
      flowBusy = true;
      audio.play('windRush', { gain: 0.4 });
      voyageCaptionEl.textContent = '급하고 강한 바람 같은 소리가 하늘로부터 — 불의 혀처럼 갈라지는 것들이 각 사람 위에 내려앉았다.';
      voyageCaptionEl.classList.remove('hidden');
      voyageCaptionEl.style.opacity = '1';
      flameFallAt(player.position.x, player.position.z);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        flameFallAt(player.position.x + Math.cos(a) * (1.5 + Math.random() * 2), player.position.z + Math.sin(a) * (1.5 + Math.random() * 2));
      }
      setTimeout(() => {
        voyageCaptionEl.style.opacity = '0';
        setTimeout(() => voyageCaptionEl.classList.add('hidden'), 800);
        flowBusy = false;
      }, 4600);
    } else {
      showDialog('한때 여종 앞에서 떨던 사람이, 무리 앞에 일어섰다', '"이스라엘 사람들아, 이 말을 들으라 —"');
      dialogHoldButton('길게 눌러 외치기 · "이 예수를 하나님이 살리셨다. 우리가 다 그 증인이다!"', 1600, () => {
        closeDialog();
        sendCrowd(pentecostCrowd, marker.site.pos.x, marker.site.pos.z, 3, 6.5);
        toast('그 말을 받아들인 사람이 — 그날에 삼천 명이나 더해졌다. (행 2:41)', 6000);
        setTimeout(() => openCard(marker), 2600);
      });
    }
  },
};

// ---- 바티칸 언덕(14번): 게임화하지 않는다 — 조용히 서는 것이 전부 ----
flows.basilica = {
  label() { return '🕯 무덤 앞에 서다'; },
  advance(marker) {
    showDialog('바티칸 언덕', '어부는 여기 묻혔다.');
    dialogHoldButton('길게 눌러 잠시 머물기', 2200, () => {
      closeDialog();
      openCard(marker);
    });
  },
};

// ---- 겟세마네: 깨어 있으려 해도 감기는 눈 (막 14:37) ----
// 탭하면 눈꺼풀을 밀어 올리지만, 잠은 갈수록 무거워져 반드시 진다 — 각본된 실패.
const lidTop = document.getElementById('lid-top');
const lidBottom = document.getElementById('lid-bottom');
let sleepFx = null;
const SLEEP_WAKE_TEXTS = [
  '"시몬아, 자느냐? 한 시간도 깨어 있을 수 없더냐?"',
  '다시 오셔서 보시니 그들이 또 잔다 — 눈이 심히 피곤하였더라.',
  '"이제는 자고 쉬어라… 그만 되었다. 때가 왔다."',
];
function startSleep(marker) {
  state.modal = true;
  sleepFx = { marker, round: 0, close: 0, t: 0, phase: 'closing' };
  toast('한 시간만 깨어 있어라 — 눈이 감기면 화면을 탭해요!', 5000);
}
function resistSleep() {
  if (sleepFx && sleepFx.phase === 'closing') sleepFx.close = Math.max(0, sleepFx.close - 0.15);
}
function updateSleep(dt) {
  const s = sleepFx;
  s.t += dt;
  if (s.phase === 'closing') {
    const rate = 0.1 + s.round * 0.1 + s.t * 0.035; // 잠은 갈수록 무거워진다
    s.close = Math.min(1, s.close + rate * dt);
    if (s.close >= 1) {
      s.phase = 'asleep';
      s.t = 0;
      voyageCaptionEl.textContent = SLEEP_WAKE_TEXTS[s.round];
      voyageCaptionEl.classList.remove('hidden');
      voyageCaptionEl.style.opacity = '1';
    }
  } else if (s.phase === 'asleep') {
    if (s.t >= 3) {
      s.round++;
      if (s.round < 3) {
        s.phase = 'closing';
        s.close = 0;
        s.t = 0;
        voyageCaptionEl.style.opacity = '0';
      } else {
        const m = s.marker;
        sleepFx = null;
        lidTop.style.height = lidBottom.style.height = '0';
        voyageCaptionEl.style.opacity = '0';
        setTimeout(() => voyageCaptionEl.classList.add('hidden'), 800);
        openCard(m);
      }
    }
  }
  if (sleepFx) {
    const h = sleepFx.phase === 'asleep' ? 51 : sleepFx.close * 51;
    lidTop.style.height = `${h}vh`;
    lidBottom.style.height = `${h}vh`;
  }
}
flows.gethsemane = {
  label() { return '🌿 깨어 기도하기'; },
  advance(marker) { startSleep(marker); },
};

// ---- 긴 밤 (9번): 몇 번을 던져도 비어 있는 그물 — 던질 때마다 하늘이 밝아 온다 ----
let warmthOverride = null;
flows['long-night'] = {
  step: 0,
  labels: ['🕸 밤 그물 던지기', '🕸 다시 던지기', '🕸 다시… 또 다시', '🕸 마지막으로 한 번'],
  label() { return this.labels[this.step]; },
  advance(marker) {
    const step = this.step;
    warmthOverride = 0.1 + step * 0.1; // 밤 → 어스름
    const dir = Math.atan2(0 - player.position.x, -129 - player.position.z);
    castNet(player.position.x + Math.sin(dir) * 6, player.position.z + Math.cos(dir) * 6, {
      empty: true,
      onDone: () => {
        if (step === 0) toast('…아무것도 없다.');
        else if (step === 1) toast('…비었다. 또.');
        else if (step === 2) toast('밤이 깊어 간다. 그물은 계속 비어 있다.');
        else {
          warmthOverride = 0.5; // 동틀 무렵
          toast('동틀 무렵 — 바닷가에 누군가 서 있다…', 6000);
          setTimeout(() => openCard(marker), 2400);
        }
      },
    });
    if (this.step < 3) this.step++;
  },
};

// ---- 두 번째 불 (10번): 물가의 소리 → 오른편 그물 → 153마리 → 바다로 ----
let leapFx = null;
function updateLeapFx(dt) {
  const l = leapFx;
  l.t += dt;
  const k = Math.min(1, l.t / 0.9);
  player.position.x = l.x0 + (l.x1 - l.x0) * k;
  player.position.z = l.z0 + (l.z1 - l.z0) * k;
  player.position.y = Math.sin(k * Math.PI) * 1.7;
  if (k >= 0.55 && !l.spl) {
    l.spl = true;
    splashAt(player.position.x, player.position.z, true);
  }
  if (k >= 1) {
    leapFx = null;
    flowBusy = false;
    player.position.y = 0;
    l.onDone();
  }
}
flows['second-fire'] = {
  step: 0,
  label() { return ['🔥 새벽 바닷가에 서다', '🕸 오른편에 던지기', '🌊 바다로 뛰어들기'][this.step]; },
  advance(marker) {
    if (this.step === 0) {
      this.step = 1;
      flowBusy = true;
      voyageCaptionEl.textContent = '"얘들아, 무얼 좀 잡았느냐?" — 물가에서 소리가 들렸다.';
      voyageCaptionEl.classList.remove('hidden');
      voyageCaptionEl.style.opacity = '1';
      setTimeout(() => {
        voyageCaptionEl.textContent = '"그물을 배 오른편에 던져라. 그러면 잡으리라."';
        setTimeout(() => {
          voyageCaptionEl.style.opacity = '0';
          setTimeout(() => voyageCaptionEl.classList.add('hidden'), 800);
          flowBusy = false;
        }, 3000);
      }, 3200);
    } else if (this.step === 1) {
      this.step = 2;
      const dir = Math.atan2(0 - player.position.x, -129 - player.position.z);
      castNet(player.position.x + Math.sin(dir) * 8, player.position.z + Math.cos(dir) * 8, {
        empty: false,
        fishN: 26,
        onDone: () => toast('백쉰세 마리! — 그런데도 그물이 찢어지지 않았다. (요 21:11)', 6000),
      });
    } else {
      flowBusy = true;
      const dx = marker.site.pos.x - player.position.x;
      const dz = marker.site.pos.z - player.position.z;
      const d = Math.hypot(dx, dz) || 1;
      leapFx = {
        t: 0,
        x0: player.position.x, z0: player.position.z,
        x1: marker.site.pos.x - (dx / d) * 1.5, z1: marker.site.pos.z - (dz / d) * 1.5,
        onDone: () => openCard(marker),
      };
    }
  },
};

/* ---------------- finale: the confession, circling the dome ---------------- */

let finale = null;
let finaleQueued = false;
function startFinale() {
  if (state.view === 'chart') toggleView();
  state.modal = true;
  hudEl.classList.add('hidden');
  const dome = window.__basilica.dome;
  finale = {
    t: 0,
    dur: 15,
    curve: new THREE.CatmullRomCurve3([
      camera.position.clone(),
      new THREE.Vector3(dome.x + 20, dome.y + 14, dome.z + 30),
      new THREE.Vector3(dome.x, dome.y + 22, dome.z + 14),
      new THREE.Vector3(dome.x - 16, dome.y + 10, dome.z - 4),
    ]),
    horns: [
      { at: 2.2, freq: 88, gain: 0.36 },
      { at: 6, freq: 110, gain: 0.26 },
      { at: 9.4, freq: 98, gain: 0.3 },
    ],
  };
}
function skipFinale() {
  if (!finale || finale.t < 1) return;
  finale.t = finale.dur;
  finale.horns = [];
}
function smoothstep01(x) { return x * x * (3 - 2 * x); }
function updateFinale(dt) {
  finale.t += dt;
  applyWarmth(0.35 + 0.4 * Math.min(1, finale.t / 9));
  while (finale.horns.length && finale.t >= finale.horns[0].at) {
    const { freq, gain } = finale.horns.shift();
    audio.play('horn', { freq, gain });
  }
  if (finale.t >= finale.dur) {
    finale = null;
    hudEl.classList.remove('hidden');
    showEpilogue();
  }
}

/* ---------------- movement & loop ---------------- */

const SPEED = 7.5;
const ACCEL = 26, DECEL = 18; // m/s² — 시작은 민첩하게, 멈춤은 반 발짝 미끄러지듯
const FEEL = { fovKick: 7, bankMax: 0.035 }; // 달리기 화각 킥(°) · 카메라 뱅크 상한(rad) — 0이면 끔
let runTipTime = 0, runTipDone = false; // 달리기를 모른 채 걷기만 6초면 한 번 귀띔한다
let velX = 0, velZ = 0;   // 이동 관성: 입력은 목표일 뿐, 실제 속도는 이 벡터
let playerLean = 0;       // 달릴 때 몸의 앞기울임
let swingLerp = 0;        // 팔다리 스윙 세기 (스냅 없이 배어들게)
let bankLerp = 0;         // 카메라 뱅크 현재값
let prevCamYaw = 0;
let needleAngle = 0;
let walkPhase = 0;
let lastStepSign = true;
let visitPulsed = false;
let shoreTimer = 0;
let shoreCached = 50;
let roosterTimer = 5;
let windTriggered = false;
let windTriggeredSink = false;
let waterWalkSink = 0;

const clock = new THREE.Clock();
const camRay = new THREE.Raycaster();
const _camPos = new THREE.Vector3();
const _lookGoal = new THREE.Vector3();
const _head = new THREE.Vector3();
const _toCam = new THREE.Vector3();

function moveInput() {
  let mx = 0, mz = 0;
  if (keys.KeyW || keys.ArrowUp) mz -= 1;
  if (keys.KeyS || keys.ArrowDown) mz += 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  mx += joy.dx;
  mz += joy.dy;
  const len = Math.hypot(mx, mz);
  if (len > 1) { mx /= len; mz /= len; }
  return [mx, mz];
}

function collide(px, pz) {
  for (const c of colliders) {
    if (px > c.x0 && px < c.x1 && pz > c.z0 && pz < c.z1) {
      const dxl = px - c.x0, dxr = c.x1 - px, dzl = pz - c.z0, dzr = c.z1 - pz;
      const m = Math.min(dxl, dxr, dzl, dzr);
      if (m === dxl) px = c.x0;
      else if (m === dxr) px = c.x1;
      else if (m === dzl) pz = c.z0;
      else pz = c.z1;
    }
  }
  return [px, pz];
}

// 골고다는 "멀찍이서" 봐야 한다 (눅 23:49) — 십자가에 다가가면 밀려나고 토스트가 뜬다.
// 7번 표지(성벽 위 -20,115)는 이 원 바깥이라 거기서만 기록된다.
const CROSS = { x: -40, z: 116, r: 10 };
let crossToastAt = -99;
function keepAwayFromCross(x, z) {
  if (markerById['at-a-distance'] && markerById['at-a-distance'].visited) return [x, z];
  const dx = x - CROSS.x, dz = z - CROSS.z;
  const d = Math.hypot(dx, dz);
  if (d >= CROSS.r || d < 0.001) return [x, z];
  if (clock.elapsedTime - crossToastAt > 5) {
    crossToastAt = clock.elapsedTime;
    toast('그는 멀찍이서 보았다 — 더 가까이 갈 수 없다. 성벽에서 지켜보라.');
  }
  return [CROSS.x + (dx / d) * CROSS.r, CROSS.z + (dz / d) * CROSS.r];
}

function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function angleDelta(a, b) { // a → b 최단각 차
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// 주제곡의 모드: 지역의 빛(duskW)과 서사의 진행이 음악의 색을 정한다.
// 부인(첫 불)과 회복(두 번째 불) 사이는 거의 침묵 — 슬픔은 부재로 말한다.
function musicMode() {
  if (!state.started) return 'off';
  if (credits) return 'finale'; // 크레딧: 주제의 전체 진술이 이름들을 배웅한다
  if (paused) return 'silent';  // 쉬는 동안엔 음악도 함께 쉰다
  if (eclipse || sleepFx || sitting) return 'silent'; // 연출이 말할 때 음악은 물러선다
  if (finale) return 'finale';
  const denied = markerById['first-fire'].visited;
  const restored = markerById['second-fire'].visited;
  if (denied && !restored) return 'lament';
  if (restored && duskW > 0.45) return 'dawn'; // 주제가 한 옥타브 위에서 돌아온다
  if (duskW > 0.6) return 'galilee';
  if (duskW < 0.3) return 'jerusalem';
  return 'road';
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  // FPS 게이트: 시작 후 4초간 평균 FPS < 45면 포스트프로세싱을 조용히 끈다 (1회)
  if (usePost && !fpsGate.done && state.started) {
    fpsGate.time += dt;
    fpsGate.frames++;
    if (fpsGate.time >= 4) {
      fpsGate.done = true;
      if (fpsGate.frames / fpsGate.time < 45) {
        usePost = false;
        // 약한 기기: 물리 하늘도 함께 내려놓는다 — 캔버스 하늘 + RoomEnvironment로
        skyOn = false;
        skyDome.visible = false;
        sky.visible = false;
        if (roomEnv) scene.environment = roomEnv;
        envBand = null;
      }
    }
  }

  const effYaw = state.view === 'chart' ? 0 : cam.yaw;
  const fwdX = -Math.sin(effYaw), fwdZ = -Math.cos(effYaw);
  const rightX = Math.cos(effYaw), rightZ = -Math.sin(effYaw);
  let moving = 0, dirX = 0, dirZ = 0, running = false;
  if (state.started && !state.modal && !voyage && !finale && !sitting && !paused && !credits) {
    const [mx, mz] = moveInput();
    moving = Math.hypot(mx, mz);
    // 달리기: Shift(키보드), 또는 엄지를 조이스틱 링 "바깥"까지 일부러 밀었을 때만 1.8배.
    // 링 가장자리(42px)에 대면 걷기 — 안 그러면 모바일이 상시 질주가 된다.
    running = moving > 0.01 && (keys.ShiftLeft || keys.ShiftRight
      || (joy.id !== null && joy.mag > 64));
    // 달리기를 아직 모르는 걸음에게 한 번만 귀띔 — 걷기만 6초 지나면
    if (!runTipDone) {
      if (running) runTipDone = true;
      else if (moving > 0.01 && joy.id === null) {
        runTipTime += dt;
        if (runTipTime > 6) {
          runTipDone = true;
          toast('갈 길이 멀 때는 Shift를 누른 채 걸으라 — 달음질이 된다.', 5000);
        }
      }
    }
    const spd = SPEED * (running ? 1.8 : 1);
    // 이동 관성: 목표 속도를 향해 프레임당 가속/감속 한도만큼만 따라간다
    let tx = 0, tz = 0;
    if (moving > 0.01) {
      dirX = rightX * mx + fwdX * -mz;
      dirZ = rightZ * mx + fwdZ * -mz;
      tx = dirX * spd;
      tz = dirZ * spd;
    }
    const rate = (moving > 0.01 ? ACCEL : DECEL) * dt;
    velX += Math.max(-rate, Math.min(rate, tx - velX));
    velZ += Math.max(-rate, Math.min(rate, tz - velZ));
    if (velX !== 0 || velZ !== 0) {
      let nx = player.position.x + velX * dt;
      let nz = player.position.z + velZ * dt;
      if (!isWalkable(nx, player.position.z)) { nx = player.position.x; velX = 0; } // 벽에 대고 미는 관성 잔류 방지
      if (!isWalkable(nx, nz)) { nz = player.position.z; velZ = 0; }
      [nx, nz] = collide(nx, nz);
      [nx, nz] = keepAwayFromCross(nx, nz);
      if (isWalkable(nx, nz)) player.position.set(nx, player.position.y, nz);
    }
    if (moving > 0.01) player.rotation.y = angleLerp(player.rotation.y, Math.atan2(dirX, dirZ), 0.2);
  } else {
    velX = 0; velZ = 0; // 컷신·카드·크레딧에서 돌아온 직후 미끄러지지 않게
  }
  const speedNow = Math.hypot(velX, velZ); // 애니메이션은 입력이 아니라 실제 속도를 따른다
  walkPhase += dt * (4 + (speedNow / SPEED) * 9) * (running ? 1.5 : 1);
  swingLerp += ((speedNow > 0.4 ? 0.62 : 0) - swingLerp) * Math.min(1, dt * 8);
  if (sitting) { // 앉은 자세: 다리는 앞으로 접고 팔은 무릎 위에
    legL.rotation.x = legR.rotation.x = 1.4;
    armL.rotation.x = armR.rotation.x = 0.55;
  } else {
    const breath = Math.sin(t * 1.6) * 0.02; // 대기 자세의 미세한 숨 — 다리는 흔들지 않는다
    legL.rotation.x = Math.sin(walkPhase) * swingLerp;
    legR.rotation.x = -Math.sin(walkPhase) * swingLerp;
    armL.rotation.x = -Math.sin(walkPhase) * swingLerp * 0.8 + breath;
    armR.rotation.x = Math.sin(walkPhase) * swingLerp * 0.8 + breath;
  }
  // 달릴 때 몸이 진행 방향으로 살짝 숙는다 (player.rotation.x는 여기서만 만진다)
  const leanGoal = sitting ? 0 : Math.min(0.16, speedNow * 0.012);
  playerLean += (leanGoal - playerLean) * Math.min(1, dt * 6);
  player.rotation.x = playerLean;
  // 발밑 흙먼지: 달리면 자주, 걸어도 옅게 — 물 위를 걸을 때는 먼지가 없다
  if (speedNow > 3 && !waterWalk) {
    dustTimer -= dt;
    if (dustTimer <= 0) {
      dustTimer = running ? 0.16 : 0.5;
      dustAt(player.position.x - (velX / speedNow) * 0.5, player.position.z - (velZ / speedNow) * 0.5);
    }
  }

  // 물 위 걷기(3번): 빛의 길 위에서만 발동. 멈추면 바람을 무서워하듯 가라앉는다.
  // 카드가 열려 있을 때(모달)는 가라앉지 않는다.
  const overLake = waterWalk && waterWalk.phase === 'walk' && !state.modal;
  if (overLake) {
    const sinkGoal = moving > 0.01 ? 0 : 0.5;
    waterWalkSink += (sinkGoal - waterWalkSink) * Math.min(1, dt * 1.6);
    if (sinkGoal > 0 && waterWalkSink > 0.15 && !windTriggeredSink) {
      windTriggeredSink = true;
      toast('바람을 보고 무서워 가라앉기 시작한다 — 멈추지 말고 걸어라!');
    }
    if (sinkGoal === 0) windTriggeredSink = false;
  } else if (!(waterWalk && (waterWalk.phase === 'stumble' || waterWalk.phase === 'rescue'))) {
    // 각본된 침몰·구원 중에는 updateWaterWalk가 직접 깊이를 다룬다
    waterWalkSink += (0 - waterWalkSink) * Math.min(1, dt * 2);
  }
  player.position.y = sitting ? -0.38 : Math.abs(Math.sin(walkPhase)) * 0.1 * Math.min(1, speedNow / SPEED) - waterWalkSink;
  // 가라앉을수록 화면 가장자리가 어두워진다
  if (sinkVeil) sinkVeil.style.opacity = String(Math.min(0.72, waterWalkSink * 1.4));

  const stepSign = Math.sin(walkPhase) >= 0;
  if (speedNow > 0.8 && stepSign !== lastStepSign) {
    audio.play(onHolyLand(player.position.x, player.position.z) || onRome(player.position.x, player.position.z) ? 'step' : 'stepWood');
  }
  lastStepSign = stepSign;

  const chartView = state.view === 'chart';
  if (finaleQueued && pinFx.length === 0 && !state.modal) {
    finaleQueued = false;
    startFinale();
  }
  if (voyage) updateVoyage(dt);
  if (waterWalk) updateWaterWalk(dt);
  if (eclipse) updateEclipse(dt);
  if (sleepFx) updateSleep(dt);
  if (leapFx) updateLeapFx(dt);
  if (netsRide) updateNetsRide(dt);
  if (finale) updateFinale(dt);
  if (sitting) updateSitting(dt);
  if (credits) updateCredits(dt);
  updateNetFx(dt);

  if (!state.started) {
    // 타이틀 뒤: 갈릴리 새벽 물가를 아주 천천히 도는 시선
    const a = t * 0.045;
    _camPos.set(player.position.x + Math.sin(a) * 24, 7.5, player.position.z + Math.cos(a) * 24);
    _lookGoal.set(player.position.x, 2.5, player.position.z);
  } else if (finale) {
    const u = smoothstep01(Math.min(1, finale.t / (finale.dur - 3)));
    finale.curve.getPoint(u, _camPos);
    const dome = window.__basilica.dome;
    _lookGoal.set(player.position.x, 1.9, player.position.z).lerp(dome, smoothstep01(Math.min(1, finale.t / 5)));
  } else if (chartView) {
    _camPos.copy(CHART_CAM_POS);
    _lookGoal.copy(CHART_LOOK_AT);
  } else {
    if (moving > 0.01 && t - cam.lastDrag > 2.2) {
      cam.yaw = angleLerp(cam.yaw, Math.atan2(dirX, dirZ) + Math.PI, 1 - Math.pow(0.55, dt));
    }
    if (voyage) {
      // a gentle following camera for the crossing, independent of input
      cam.yaw = angleLerp(cam.yaw, voyageBoat.rotation.y + Math.PI, 1 - Math.pow(0.5, dt));
    }
    _head.set(player.position.x, 1.9, player.position.z);
    _toCam.set(
      player.position.x + Math.sin(cam.yaw) * cam.dist,
      cam.height,
      player.position.z + Math.cos(cam.yaw) * cam.dist
    ).sub(_head);
    const fullDist = _toCam.length();
    _toCam.normalize();
    camRay.set(_head, _toCam);
    camRay.far = fullDist;
    const blocked = camRay.intersectObjects(occluders, false);
    const targetDist = blocked.length ? Math.max(2.2, blocked[0].distance - 0.5) : fullDist;
    const k = targetDist < cam.smoothDist ? Math.min(1, dt * 14) : Math.min(1, dt * 3);
    cam.smoothDist += (targetDist - cam.smoothDist) * k;
    _camPos.copy(_head).addScaledVector(_toCam, cam.smoothDist);
    const lowness = Math.max(0, 2.8 - cam.height);
    _lookGoal.set(player.position.x, player.position.y + 1.7 + lowness * lowness * 4, player.position.z);
  }
  const camK = 1 - Math.pow(0.0008, dt);
  camera.position.lerp(_camPos, camK);
  lookTarget.lerp(_lookGoal, camK);
  camera.lookAt(lookTarget);
  // 달리기 FOV 킥 + 회전 뱅크: 자유 보행 카메라에서만 (타이틀 궤도·차트·피날레는 중립)
  const freeCam = state.started && !finale && !chartView;
  const fovGoal = freeCam ? 55 + (running && speedNow > SPEED ? FEEL.fovKick : 0) + (voyage ? 3 : 0) : 55;
  if (Math.abs(camera.fov - fovGoal) > 0.05) {
    camera.fov += (fovGoal - camera.fov) * Math.min(1, dt * 4);
    camera.updateProjectionMatrix();
  }
  const yawRate = angleDelta(prevCamYaw, cam.yaw) / Math.max(dt, 0.001); // rad/s
  prevCamYaw = cam.yaw;
  const bankGoal = freeCam ? Math.max(-FEEL.bankMax, Math.min(FEEL.bankMax, -yawRate * 0.02)) : 0;
  bankLerp += (bankGoal - bankLerp) * Math.min(1, dt * 5);
  camera.rotateZ(bankLerp); // 지평선이 아주 살짝 기운다 — 2° 상한, 멀미 방지
  const fv = FOG_VIEWS[state.view];
  scene.fog.near += (fv.near - scene.fog.near) * Math.min(1, dt * 2);
  scene.fog.far += (fv.far - scene.fog.far) * Math.min(1, dt * 2);
  sun.position.set(player.position.x + 70, 100, player.position.z + 45);
  sun.target.position.set(player.position.x, 0, player.position.z);

  if (!finale && !waterWalk) applyWarmth(warmthOverride ?? regionWarmth(player.position.x, player.position.z));

  // --- 하늘: 시간에 따라 해·달·별·구름이 배어 나오고 스러진다 ---
  const chartUp = state.view === 'chart';
  const dayK = Math.max(0, Math.min(1, (duskW - 0.35) / 0.4));   // 낮의 정도
  const nightK = Math.max(0, Math.min(1, (0.4 - duskW) / 0.3));  // 밤의 정도
  // 물리 하늘과 캔버스 돔은 하늘 요소처럼 플레이어를 따라다닌다.
  // 돔은 낮이 밝을수록 걷힌다 — Sky가 숨는 경계(0.3)에선 완전 불투명이라 전환이 튀지 않는다.
  const skyLive = skyOn && sky.visible;
  sky.position.copy(player.position);
  skyDome.position.copy(player.position);
  const domeGoal = skyOn ? Math.max(0, Math.min(1, (0.45 - duskW) / 0.15)) : 0;
  skyDome.material.opacity += (domeGoal - skyDome.material.opacity) * Math.min(1, dt * 3);
  if (reflWater && reflWater.visible) reflWater.material.uniforms.time.value += dt * 0.5;
  const skyDiscK = skyLive ? 0.5 : 1; // 낮에는 Sky의 해 원반이 주인공 — 스프라이트는 절반으로
  sunSprite.position.copy(player.position).addScaledVector(SUN_DIR, 820);
  sunSprite.material.opacity += ((chartUp ? 0 : 0.95 * dayK * skyDiscK) - sunSprite.material.opacity) * Math.min(1, dt * 3);
  moonSprite.position.copy(player.position).addScaledVector(MOON_DIR, 780);
  moonSprite.material.opacity += ((chartUp ? 0 : 0.9 * nightK) - moonSprite.material.opacity) * Math.min(1, dt * 3);
  stars.position.copy(player.position);
  stars.rotation.y = t * 0.004;
  stars.material.opacity += ((chartUp ? 0 : 0.9 * nightK) - stars.material.opacity) * Math.min(1, dt * 2);
  for (const cl of clouds) {
    cl.sp.position.x += cl.speed * dt;
    if (cl.sp.position.x > 320) cl.sp.position.x = -320;
    cl.sp.material.opacity += ((chartUp ? 0 : cl.peak * (0.35 + 0.65 * dayK)) - cl.sp.material.opacity) * Math.min(1, dt * 2);
  }
  // 호수의 햇빛 반짝임 길: 낮에만, 은은하게 숨쉰다
  sunGlint.material.opacity = chartUp ? 0 : 0.22 * dayK * (0.8 + 0.2 * Math.sin(t * 1.7));
  sunGlint.visible = sunGlint.material.opacity > 0.01;
  // 지평선 능선과 해 무리: 하늘 요소처럼 플레이어를 따라다닌다 — 차트 뷰에선 숨는다
  for (const rg of ridges) {
    rg.position.copy(player.position).addScaledVector(rg.userData.dir, 700);
    rg.position.y = -20; // 능선 밑동이 시야 지평선 아래에 잠긴다
  }
  ridgeMat.opacity += ((chartUp ? 0 : 0.5 - 0.25 * dayK) - ridgeMat.opacity) * Math.min(1, dt * 2);
  ridgeMat.color.lerpColors(RIDGE_NIGHT, RIDGE_DAY, dayK);
  sunHalo.position.copy(player.position).addScaledVector(SUN_DIR, 860);
  sunHalo.material.opacity += ((chartUp ? 0 : 0.35 * dayK * skyDiscK) - sunHalo.material.opacity) * Math.min(1, dt * 3);

  // 발의 등불: 예루살렘의 밤길(z > 60)에서만 — 갈릴리의 긴 밤과 로마는 켜지 않는다
  const lampTarget = (duskW < 0.35 && player.position.z > 60
    && onHolyLand(player.position.x, player.position.z)) ? 1.4 : 0;
  lampLerp += (lampTarget - lampLerp) * Math.min(1, dt * 2);
  lampLight.intensity = lampLerp * (0.86 + 0.14 * Math.sin(t * 9.3) * Math.sin(t * 23.7));
  lampG.visible = lampLerp > 0.05;
  if (lampG.visible) { // 불꽃 일렁임
    const fk = 1 + Math.sin(t * 11) * 0.18;
    lampFlame.scale.set(fk, 0.9 + Math.sin(t * 11) * 0.2, fk);
  }
  if (lampTarget > 0 && !lampSeen) {
    lampSeen = true; // 컷신·카드 중이면 자막은 생략하고 플래그만 세운다
    if (!state.modal && !finale && !voyage && !eclipse && !sleepFx) {
      showCaption('“주의 말씀은 내 발에 등이요 내 길에 빛이니이다.” (시 119:105)');
      setTimeout(hideCaption, 4000);
    }
  }

  // near = 방문 프롬프트용 가장 가까운 표지 / target = 나침반용, 이야기 순서(번호) 다음 미방문지
  let near = null, nearD = 8, target = null, targetNum = Infinity;
  for (const m of markers) {
    const d = Math.hypot(player.position.x - m.site.pos.x, player.position.z - m.site.pos.z);
    if (d < nearD) { near = m; nearD = d; }
    if (!m.visited && m.site.num < targetNum) { target = m; targetNum = m.site.num; }
  }
  state.nearSite = near;

  if (state.started && !finale && !voyage) {
    const dt8 = Math.hypot(player.position.x - markerById['empty-tomb'].site.pos.x, player.position.z - markerById['empty-tomb'].site.pos.z);
    updateTombRace(dt, dt8);
  }

  // 배에 오르기 프롬프트: 물 위 걷기 배 근처 — 단, 3번의 차례가 되어야 배가 열린다
  const distBoard = Math.hypot(player.position.x - WW_BOARD.x, player.position.z - WW_BOARD.z);
  const boardOn = state.started && !state.modal && !paused && !voyage && !finale && !waterWalk
    && distBoard < 6.5 && unlocked(markerById['fourth-watch']);
  state.boardMode = boardOn;
  // 로마 ↔ 성지 왕복 배: 13번을 다녀온 뒤에는 양쪽 선착장에서 언제든 오갈 수 있다
  let sailMode = null;
  if (state.started && !state.modal && !paused && !voyage && !finale && !waterWalk && markerById['voyage-to-rome'].visited) {
    const dRome = Math.hypot(player.position.x - ROME_LANDING.x, player.position.z - ROME_LANDING.z);
    const dJoppa = Math.hypot(player.position.x - JOPPA_BOARD.x, player.position.z - JOPPA_BOARD.z);
    if (dRome < 7) sailMode = 'back';
    else if (dJoppa < 6) sailMode = 'go';
  }
  state.sailMode = sailMode;
  // 표지 프롬프트는 앞의 이야기를 모두 마친 곳에서만 뜬다
  const nearOpen = !!near && unlocked(near);
  // 쉼터 프롬프트: 그 자리의 이야기를 이미 겪은 뒤에만 — 미방문 표지 프롬프트를 가리지 않는다
  let sitSpot = null;
  if (!sitting && state.started && !state.modal && !paused && !voyage && !finale && !waterWalk && !flowBusy
    && !(nearOpen && !near.visited)) {
    for (const s of REST_SPOTS) {
      if (markerById[s.gate].visited
        && Math.hypot(player.position.x - s.x, player.position.z - s.z) < 5) { sitSpot = s; break; }
    }
  }
  state.sitMode = sitSpot;
  const promptOn = (boardOn || sailMode || sitSpot
    || (nearOpen && state.started && !state.modal && !voyage && !finale)) && !flowBusy && !sitting
    && !paused && !credits;
  visitBtn.classList.toggle('hidden', !promptOn);
  if (promptOn) {
    const flowNear = near && !near.visited && flows[near.site.id];
    const label = boardOn
      ? (markerById['fourth-watch'].visited ? '⚓ 다시 배로 나가기' : '⚓ 배에 오르기')
      : sailMode
        ? (sailMode === 'back' ? '⚓ 성지로 돌아가는 배' : '⚓ 로마로 가는 배')
        : flowNear
          ? flowNear.label()
          : (nearOpen && !near.visited)
            ? `${near.shortTitle} · 이야기 읽기`
            : sitSpot
              ? sitSpot.label
              : `${near.shortTitle} · 다시 읽기`;
    if (visitLabel.textContent !== label) visitLabel.textContent = label;
    if (!visitPulsed) {
      visitPulsed = true;
      visitBtn.classList.add('pulse');
      setTimeout(() => visitBtn.classList.remove('pulse'), 4400);
    }
  }
  if (target) {
    // 3번(물 위)은 표지가 아니라 "배"로 이끈다 — 배를 타야 갈 수 있는 곳이니까
    const guide = (target.site.id === 'fourth-watch' && !waterWalk) ? WW_BOARD : target.site.pos;
    const dx = guide.x - player.position.x;
    const dz = guide.z - player.position.z;
    const rel = Math.atan2(dx * rightX + dz * rightZ, dx * fwdX + dz * fwdZ);
    needleAngle = angleLerp(needleAngle, rel, Math.min(1, dt * 9));
    compassArrow.style.transform = `rotate(${(needleAngle * 180) / Math.PI}deg)`;
    compassArrow.style.opacity = '1';
  } else if (!compassEl.classList.contains('compass-done')) {
    compassEl.classList.add('compass-done');
    compassEl.title = '열네 곳을 모두 걸었어요';
    compassArrow.style.opacity = '';
    compassArrow.style.transform = '';
  }

  for (let i = pinFx.length - 1; i >= 0; i--) {
    const fx = pinFx[i];
    fx.t += dt;
    const k = Math.min(1, fx.t / 1.2);
    fx.m.fxScale = 1 + Math.sin(Math.min(1, fx.t / 0.5) * Math.PI) * 0.5;
    fx.m.ring.scale.setScalar(1 + k * 2.2);
    fx.m.ring.material.opacity = 0.85 * (1 - k);
    fx.m.pinMat.color.lerpColors(fx.from || PIN_RED, PIN_INK, k);
    fx.m.pinMat.emissive.lerpColors(fx.fromE || PIN_EMBER, PIN_BLACK, k);
    if (k >= 1) {
      settlePin(fx.m);
      pinFx.splice(i, 1);
    }
  }

  const spriteScale = chartView ? 10.5 : 2.9;
  const spriteY = chartView ? 13 : 4.75;
  for (const m of markers) {
    // 다음 목적지만 붉게 살아 있고, 나머지 미방문지는 무채색으로 기다린다
    const desired = m.visited ? 'done' : (target === m ? 'target' : 'wait');
    if (m.styleState !== desired) {
      m.styleState = desired;
      if (desired === 'target') {
        m.pinMat.color.set(COLORS.red);
        m.pinMat.emissive.set(0x3a0e08);
        m.ring.material.color.set(COLORS.red);
        m.ring.material.opacity = 0.85;
        m.sprite.material = m.spriteMats.red;
      } else if (desired === 'wait') {
        m.pinMat.color.set(0x8b8478);
        m.pinMat.emissive.set(0x000000);
        m.ring.material.color.set(0x8b8478);
        m.ring.material.opacity = 0.35;
        m.sprite.material = m.spriteMats.gray;
      }
      // 'done'의 색은 settlePin / 기록 FX가 관리한다
    }
    const waiting = m.styleState === 'wait';
    // 가까이 다가서면 표지가 몸을 낮춘다 — 발치의 고리·이름표·방문 버튼이 그 몫을 잇는다
    // (다 큰 핀이 코앞에서 화면을 가리는 것 방지; 새의 눈 지도에선 늘 온몸)
    const dPin = Math.hypot(player.position.x - m.g.position.x, player.position.z - m.g.position.z);
    const closeK = chartView ? 1 : THREE.MathUtils.smoothstep(dPin, 5, 14);
    const sScale = spriteScale * (waiting ? 0.78 : 1) * Math.max(chartView ? 1 : 0.0001, closeK);
    m.sprite.scale.set(sScale, sScale, 1);
    m.pin.scale.setScalar((chartView ? 2.8 : 1) * (m.fxScale || 1) * Math.max(0.0001, closeK));
    if (m.styleState === 'target') {
      const bob = Math.sin(t * 2 + m.phase) * 0.4;
      m.pin.position.y = bob + 0.2;
      m.pin.rotation.y = t * 0.8;
      m.sprite.position.y = spriteY + bob;
    } else {
      m.pin.position.y = m.visited ? 0 : 0.2;
      m.sprite.position.y = spriteY;
    }
  }

  beacon.visible = chartView && state.started;
  if (beacon.visible) {
    beacon.position.set(player.position.x, 0, player.position.z);
    beaconCone.position.y = 7 + Math.sin(t * 2.4) * 0.7;
    beaconCone.rotation.y = t;
  }

  for (const L of landmarkLabels) {
    let o, s;
    if (chartView) { o = 0.95; s = 2.6; } else {
      const d = Math.hypot(player.position.x - L.x, player.position.z - L.z);
      const fadeIn = L.range - 14;
      o = d < fadeIn ? 1 : d > L.range ? 0 : 1 - (d - fadeIn) / 14;
      s = 1;
    }
    L.sprite.material.opacity = o;
    L.sprite.visible = o > 0.02;
    if (L.sprite.visible) L.sprite.scale.set(L.w * s, L.h * s, 1);
  }

  // fires: flicker, and light the two moments that rhyme
  for (let i = 0; i < fires.length; i++) {
    const f = fires[i];
    const k = 0.85 + Math.sin(t * 14 + f.g.position.x) * 0.15;
    f.glow.scale.set(k, 1, k);
    f.light.intensity = (1.1 + Math.sin(t * 11) * 0.3)
      * (0.86 + 0.14 * Math.sin(t * 9.3 + i) * Math.sin(t * 23.7 + i * 2));
  }

  // water: a lake ripple and a heavier sea swell
  if (lakeWater.visible) { // high 모드에선 반사 수면이 대신하므로 잔물결 계산을 쉰다
    const lPos = lakeGeo.attributes.position;
    for (let i = 0; i < lPos.count; i++) {
      const x = lakeBase[i * 3], z = lakeBase[i * 3 + 2];
      lPos.array[i * 3 + 1] = Math.sin(x * 0.2 + t * 1.1) * Math.cos(z * 0.17 + t * 0.9) * 0.12;
    }
    lPos.needsUpdate = true;
    // 매끈한 수면은 정점 법선으로 빛을 받으므로 물결이 움직일 때마다 법선을 다시 굽는다.
    lakeGeo.computeVertexNormals();
  }
  const sPos = waterGeo.attributes.position;
  for (let i = 0; i < sPos.count; i++) {
    const x = waterBase[i * 3], z = waterBase[i * 3 + 2];
    sPos.array[i * 3 + 1] =
      Math.sin(x * 0.07 + t * 0.8) * Math.cos(z * 0.06 + t * 0.6) * 0.3 +
      Math.sin(x * 0.2 - t * 1.4) * Math.sin(z * 0.16 + t * 1.1) * 0.12;
  }
  sPos.needsUpdate = true;
  waterGeo.computeVertexNormals();
  // 포말선 숨쉬기: 물가의 흰 띠가 은은하게 밝아졌다 스러진다
  lakeFoam.material.opacity = 0.28 + 0.1 * Math.sin(t * 0.9);
  seaFoam.material.opacity = 0.16 + 0.1 * Math.sin(t * 0.9 + 1.3);
  nightBoat.position.y = Math.sin(t * 0.9) * 0.05;
  if (!netsRide) shoreBoat.position.y = Math.sin(t * 0.9 + 2) * 0.05;
  if (!waterWalk) wwBoat.position.y = Math.sin(t * 0.9 + 1) * 0.05;
  // 붉은 깃발은 3번이 "지금 갈 차례"일 때만 걸린다 — 빨강은 늘 다음 목적지 하나만 가리킨다
  wwFlag.visible = target === markerById['fourth-watch'];
  if (wwFlag.visible) wwFlag.rotation.y = Math.sin(t * 2.2) * 0.5; // 펄럭임

  // 지명 라벨: 하늘에서 보기에서는 지도의 활자처럼 커진다
  const glScale = chartView ? 2.3 : 1;
  for (const gl2 of groundLabels) {
    gl2.scale.x += (glScale - gl2.scale.x) * Math.min(1, dt * 5);
    gl2.scale.z = gl2.scale.x;
  }

  // 새벽 바닷가의 형상: 긴 밤(9번)이 끝나면 숯불 곁에 서 계시고, 세 번의 물음(11번)까지 머문다
  shoreFigure.visible = markerById['long-night'].visited && !markerById['three-questions'].visited;
  for (const fig of [wwFigure, shoreFigure]) {
    if (!fig.visible) continue;
    fig.userData.glow.material.opacity = 0.62 + Math.sin(t * 1.7) * 0.14; // 숨쉬는 빛
    fig.position.y = Math.sin(t * 1.1) * 0.06;
  }

  // 양 떼: 제자리에서 살랑살랑 풀을 뜯고, 이따금 몇 걸음 옮긴다
  for (const s of sheep) {
    s.t -= dt;
    if (s.t <= 0) { s.t = 2 + Math.random() * 4; s.dir = Math.random() * Math.PI * 2; }
    const nx = s.g.position.x + Math.cos(s.dir) * dt * 0.4;
    const nz = s.g.position.z + Math.sin(s.dir) * dt * 0.4;
    if (onHolyLand(nx, nz) && Math.hypot(nx - s.hx, nz - s.hz) < 6) {
      s.g.position.x = nx; s.g.position.z = nz;
      s.g.rotation.y = -s.dir + Math.PI / 2;
    }
    s.g.position.y = Math.abs(Math.sin(t * 1.5 + s.ph)) * 0.03;
  }

  // 호수의 배: 남북으로 오가며 끝에서 방향을 튼다
  for (const b of lakeBoats) {
    b.g.position.z += b.dir * b.speed * dt;
    if (b.g.position.z < b.z0) { b.g.position.z = b.z0; b.dir = 1; b.g.rotation.y = 0; }
    if (b.g.position.z > b.z1) { b.g.position.z = b.z1; b.dir = -1; b.g.rotation.y = Math.PI; }
    b.g.position.y = Math.sin(t * 0.8 + b.ph) * 0.06;
  }

  // 성벽 횃불: 불꽃이 흔들린다
  for (const f of torches) {
    const k = 0.8 + Math.sin(t * 13 + f.position.x) * 0.2;
    f.scale.set(k, 0.9 + Math.sin(t * 17 + f.position.z) * 0.2, k);
  }

  // 나무는 바람에 살랑인다
  for (let i = 0; i < swayers.length; i++) {
    const s = swayers[i];
    s.g.rotation.z = Math.sin(t * 1.2 + s.ph) * 0.035;
  }

  // 마을 사람들: 가버나움의 무리는 2번의 차례에 다가가면 문 앞으로 모여든다 (막 1:33)
  if (state.started && !crowdCalled && !markerById['capernaum-house'].visited && unlocked(markerById['capernaum-house'])) {
    const dHouse = Math.hypot(player.position.x - markerById['capernaum-house'].site.pos.x, player.position.z - markerById['capernaum-house'].site.pos.z);
    if (dHouse < 22) {
      crowdCalled = true;
      sendCrowd(capernaumCrowd, -10, -155.4, 2.4, 4.4);
      toast('해가 저물자 — 온 동네가 문 앞에 모여들었다. (막 1:33)', 5500);
    }
  }
  updateCrowd(capernaumCrowd, dt, t);
  updateCrowd(pentecostCrowd, dt, t);
  updateFlameFalls(dt, t);
  updateLostSheep(dt, t);
  updateTalkers(dt);
  updateShepherdBubble(dt);
  updateSparks(dt);
  updateShootingStars(dt);
  updateJonah(dt, t);
  updatePetLamb(dt, t);
  roosterHopT += dt;
  roosterG.position.y = roosterHopT < 0.45 ? Math.abs(Math.sin(roosterHopT * 16)) * 0.3 : 0;

  // 호수의 물고기가 이따금 뛴다 (호수 근처에 있을 때만)
  ambientFishTimer -= dt;
  if (ambientFishTimer <= 0) {
    ambientFishTimer = 5 + Math.random() * 8;
    const dLake = Math.hypot(player.position.x - 0, player.position.z + 129);
    if (dLake < 70) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 16;
      fishBurst(Math.cos(a) * r, -129 + Math.sin(a) * r * 0.85, 1);
    }
  }

  // 낙타 대상: 남쪽 요단 길을 느릿느릿 순회
  caravan.u = (caravan.u + dt * 0.012) % 1;
  const cp = caravan.path;
  const sampleCaravan = (u) => {
    const seg = u * (cp.length - 1);
    const i = Math.min(cp.length - 2, Math.floor(seg));
    const f = seg - i;
    return [cp[i][0] + (cp[i + 1][0] - cp[i][0]) * f, cp[i][1] + (cp[i + 1][1] - cp[i][1]) * f];
  };
  for (const c of caravan.camels) {
    const cu = Math.max(0, caravan.u - c.lag);
    const [px, pz] = sampleCaravan(cu);
    const [ax, az] = sampleCaravan(Math.min(1, cu + 0.01));
    c.g.position.set(px, Math.abs(Math.sin(t * 3 + c.lag * 20)) * 0.04, pz);
    c.g.rotation.y = Math.atan2(ax - px, az - pz);
  }

  for (const gl of gulls) {
    gl.a += dt * gl.s;
    gl.st -= dt;
    if (gl.st <= 0) {
      gl.gliding = !gl.gliding;
      gl.st = gl.gliding ? 1.6 + Math.random() * 2.6 : 0.9 + Math.random() * 1.6;
      if (!gl.gliding && Math.random() < 0.3) audio.play('gull');
    }
    const flapGoal = gl.gliding ? -0.16 : Math.sin(t * 10) * 0.85;
    gl.flap += (flapGoal - gl.flap) * Math.min(1, dt * 12);
    gl.w1.rotation.z = gl.flap;
    gl.w2.rotation.z = -gl.flap;
    gl.y = Math.max(gl.h - 1.5, Math.min(gl.h + 2, gl.y + (gl.gliding ? -0.35 : 0.55) * dt));
    const r = gl.r + Math.sin(t * 0.13 + gl.r) * 2;
    gl.g.position.set(gl.cx + Math.cos(gl.a) * r, gl.y, gl.cz + Math.sin(gl.a) * r);
    gl.g.rotation.y = -gl.a;
    gl.g.rotation.z = -0.24;
  }

  // rooster, near the first fire; the wind rushing, near Pentecost
  const distFirstFire = Math.hypot(player.position.x - firePositions[0].x, player.position.z - firePositions[0].z);
  roosterTimer -= dt;
  if (roosterTimer <= 0) {
    roosterTimer = 7 + Math.random() * 9;
    if (distFirstFire < 24) audio.play('rooster');
  }
  const pentecost = markers.find((m) => m.site.id === 'pentecost');
  const distPentecost = Math.hypot(player.position.x - pentecost.site.pos.x, player.position.z - pentecost.site.pos.z);
  if (distPentecost < 16 && !windTriggered) {
    windTriggered = true;
    audio.play('windRush', { gain: 0.32 });
  } else if (distPentecost > 24) {
    windTriggered = false;
  }

  shoreTimer -= dt;
  if (shoreTimer <= 0) {
    shoreTimer = 0.25;
    shoreCached = isWalkable(player.position.x, player.position.z) ? shoreDistance(player.position.x, player.position.z) : 0;
  }
  const fireDist = Math.min(
    Math.hypot(player.position.x - firePositions[0].x, player.position.z - firePositions[0].z),
    Math.hypot(player.position.x - firePositions[1].x, player.position.z - firePositions[1].z)
  );
  audio.update(dt, {
    px: player.position.x,
    pz: player.position.z,
    shore: shoreCached,
    fireDist,
    warmth: duskW,
    ducked: (state.modal && !finale && !voyage) || paused,
    music: musicMode(),
  });

  if (usePost) {
    filmPass.uniforms.uTime.value = t;
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.resolution.set(window.innerWidth / 2, window.innerHeight / 2);
});

for (const id of save.charted) {
  const m = markers.find((mk) => mk.site.id === id);
  if (m) chartSite(m, { silent: true });
}
if (save.epilogueShown) {
  state.epilogueShown = true;
}
// 지난 세션에 찾은 양들은 이미 무리로 돌아갔다
for (const i of save.sheep) {
  if (lostSheep[i]) { lostSheep[i].found = true; lostSheep[i].g.visible = false; }
}
if (save.sheep.length >= 12) spawnPetLamb(true); // 목자의 상은 세션을 건너 이어진다
updateSheepChip();
updateNextHint();

// QA 훅: 자동화 테스트가 위치·상태를 읽을 수 있게 한다 (게임 로직은 손대지 않는다)
window.__qa = {
  get pos() { return { x: player.position.x, z: player.position.z }; },
  get flags() {
    return {
      started: state.started, modal: !!state.modal, paused, view: state.view,
      voyage: !!voyage, finale: !!finale, sitting: !!sitting, credits: !!credits,
    };
  },
  get keys() { return keys; },
  get colliders() { return colliders.map((c) => ({ ...c })); },
  isWalkable(x, z) { return isWalkable(x, z); },
  // 테스트 전용: 사전 연출(그물 던지기·대화)을 건너뛰고 카드를 바로 연다.
  // openCard() 자체는 실제 플레이와 같은 경로이므로 카드 이후 로직(말씀 새기기 등) 검증에 쓴다.
  openMarker(id, autoChart = false) {
    const m = markerById[id];
    if (m) {
      openCard(m);
      if (autoChart) {
        chartSite(m);
        activeSeal = null;
        cardSealBox.classList.add('hidden');
        cardCloseBtn.disabled = false;
        cardCloseBtn.textContent = '계속 걷기';
      }
    }
    return !!m;
  },
  // 테스트 전용: 양 12마리를 즉시 채운다. collectSheep()의 3D 연출은 건너뛰지만,
  // checkRecordComplete()는 실제 코드 경로 그대로 호출한다.
  fillSheep() {
    save.sheep = Array.from({ length: 12 }, (_, i) => i);
    persistSave();
    updateSheepChip();
    checkRecordComplete();
  },
  get record() { return { startedAt: save.startedAt, finishedAt: save.finishedAt, sheep: save.sheep.length, sites: state.visitedCount }; },
  // 테스트 전용: openMarker()로 연 카드를 뒷이야기(십자가 어둠·에필로그·크레딧 등) 없이 닫는다.
  // 실제 card-close 버튼은 finishCardClose()의 여러 사이드이펙트를 함께 부르므로, 기록 카드
  // 흐름처럼 그 사이드이펙트와 무관한 로직만 검증할 때 modal 상태만 되돌리는 용도다.
  closeModal() { cardEl.classList.add('hidden'); state.modal = false; },
};

animate();
