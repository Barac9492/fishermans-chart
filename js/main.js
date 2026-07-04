import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
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
  oliveLeaf: 0x7c8a5a,
  oliveTrunk: 0x5c4a36,
  palmTrunk: 0x8a6f4d,
  wood: 0x7a5c3e,
  woodDark: 0x5a4128,
  robe: 0x8a7050,
  cloak: 0x5b6e6a,
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
  { a: [-24, -110], b: [-6, -118], width: 6.5 },   // Capernaum dock (site 9)
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
const cam = { yaw: 0, height: 5, dist: 11, smoothDist: 11, lastDrag: -10 };
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
sun.shadow.radius = 3;
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

function lambert(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, ...opts });
}

function box(w, h, d, color, x, y, z, parent = scene, shadow = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), lambert(color));
  m.position.set(x, y, z);
  if (shadow) { m.castShadow = true; m.receiveShadow = true; }
  parent.add(m);
  return m;
}

function cylBetween(p1, p2, r, color, parent = scene) {
  const dir = new THREE.Vector3().subVectors(p2, p1);
  const len = dir.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 6), lambert(color));
  mesh.position.copy(p1).addScaledVector(dir, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  parent.add(mesh);
  return mesh;
}

function makeTextTexture(text, { size = 68, color = 'rgba(43,38,32,0.55)', italic = true } = {}) {
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

function groundLabel(text, x, z, rotY = 0, width = 40) {
  const geo = new THREE.PlaneGeometry(width, (width * 144) / 1024);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({ map: makeTextTexture(text), transparent: true, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, 0.22, z);
  mesh.rotation.y = rotY;
  scene.add(mesh);
}

// 번호 원판 스프라이트 재질 — 다음 목적지(빨강)·대기(회색)·다녀간 곳(먹색) 세 벌
function numberSpriteMat(n, bg) {
  const [cv, ctx] = canvas2d(128, 128);
  ctx.beginPath();
  ctx.arc(64, 64, 52, 0, Math.PI * 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = '#ece2c4';
  ctx.stroke();
  ctx.font = `600 60px 'Noto Serif KR', Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ece2c4';
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
  new THREE.MeshStandardMaterial({ color: COLORS.sea, roughness: 0.4, metalness: 0.05, flatShading: true })
);
seaWater.position.set(-90, -0.6, -20);
seaWater.receiveShadow = true;
scene.add(seaWater);

const lakeGeo = new THREE.PlaneGeometry(64, 62, 20, 20);
lakeGeo.rotateX(-Math.PI / 2);
const lakeBase = lakeGeo.attributes.position.array.slice();
const lakeWater = new THREE.Mesh(
  lakeGeo,
  new THREE.MeshStandardMaterial({ color: COLORS.lake, roughness: 0.35, metalness: 0.05, flatShading: true })
);
lakeWater.position.set(0, -0.42, -129);
lakeWater.receiveShadow = true;
scene.add(lakeWater);

function extrudeLand(points, topColor, sideColor, { hole = null, depth = 2.2 } = {}) {
  const shape = new THREE.Shape(points.map(([x, z]) => new THREE.Vector2(x, z)));
  if (hole) shape.holes.push(new THREE.Path(hole.map(([x, z]) => new THREE.Vector2(x, z))));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.rotateX(Math.PI / 2);
  const mesh = new THREE.Mesh(geo, [lambert(topColor), lambert(sideColor)]);
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

extrudeLand(MAIN_LAND, COLORS.land, COLORS.landSide, { hole: LAKE });
extrudeLand(ROME_LAND, COLORS.romeLand, COLORS.romeLandSide);

// a scattering of dark basalt boulders around the lake shore
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
      const g = new THREE.BoxGeometry(s, s * 0.7, s);
      g.rotateY(Math.random() * Math.PI);
      g.translate(x, s * 0.3, z);
      geos.push(g);
    }
  }
  if (geos.length) scene.add(new THREE.Mesh(mergeGeometries(geos, false), lambert(COLORS.basalt)));
}

groundLabel('갈릴리 바다', 0, -130, 0, 34);
groundLabel('예루살렘', 4, 112, 0, 22);
groundLabel('로마', -232, 70, 0, 13);

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

/* ---------------- trees & vegetation ---------------- */

function tree(x, z, s = 1, kind = 'olive') {
  const g = new THREE.Group();
  const trunkColor = kind === 'palm' ? COLORS.palmTrunk : COLORS.oliveTrunk;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.13 * s, 0.22 * s, 1.3 * s, 5), lambert(trunkColor));
  trunk.position.y = 0.65 * s;
  trunk.castShadow = true;
  g.add(trunk);
  if (kind === 'palm') {
    for (let i = 0; i < 6; i++) {
      const frond = new THREE.Mesh(new THREE.ConeGeometry(0.16 * s, 1.7 * s, 4), lambert(COLORS.oliveLeaf));
      frond.position.y = 1.3 * s;
      frond.rotation.z = Math.PI / 2.3;
      frond.rotation.y = (i / 6) * Math.PI * 2;
      frond.castShadow = true;
      g.add(frond);
    }
  } else {
    const fol = new THREE.Mesh(new THREE.SphereGeometry(0.85 * s, 7, 6), new THREE.MeshLambertMaterial({ color: COLORS.oliveLeaf, flatShading: true }));
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
  const wallColor = Math.random() < 0.5 ? COLORS.basalt : COLORS.basaltLight;
  const body = box(w, h, d, wallColor, 0, h / 2, 0, g);
  body.castShadow = true;
  box(w + 0.3, 0.3, d + 0.3, 0x252321, 0, h + 0.15, 0, g); // flat roof lip
  const door = box(0.7, 1.3, 0.15, 0x1c1a18, 0, 0.65, d / 2 + 0.06, g, false);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  scene.add(g);
  addCollider(x, z, w, d);
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
  const hall = box(7, 4.2, 9, COLORS.limestone, sx, 2.1, sz);
  hall.castShadow = true;
  box(7.5, 0.4, 9.5, COLORS.limestoneShadow, sx, 4.35, sz);
  for (let i = -2; i <= 2; i++) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 3.8, 10), lambert(COLORS.limestone));
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
  const deck = new THREE.Mesh(new THREE.BoxGeometry(len, 0.25, wide), lambert(COLORS.wood));
  deck.position.set((cx + tx) / 2, -0.05, (cz + tz) / 2);
  deck.rotation.y = -Math.atan2(dz, dx);
  deck.castShadow = true;
  scene.add(deck);
  return deck;
}
pier(-22, -111, -6, -118, 2.2);

function fishingBoat(x, z, rotY = 0) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.7, 4.2), lambert(COLORS.wood));
  hull.position.y = 0.35;
  hull.castShadow = true;
  const bow = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.4, 4), lambert(COLORS.woodDark));
  bow.rotation.x = -Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.position.set(0, 0.35, 2.4);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 6), lambert(COLORS.woodDark));
  mast.position.y = 2.1;
  g.add(hull, bow, mast);
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
  const wall = new THREE.Mesh(new THREE.BoxGeometry(len, h, 1.4), lambert(COLORS.limestoneShadow));
  wall.position.set((ax + bx) / 2, h / 2, (az + bz) / 2);
  wall.rotation.y = -Math.atan2(bz - az, bx - ax);
  wall.castShadow = wall.receiveShadow = true;
  scene.add(wall);
  addCollider((ax + bx) / 2, (az + bz) / 2, len, 1.4, 0.3);
  occluders.push(wall);
  return wall;
}
function tower(x, z, h = 9) {
  const t = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.2, h, 10), lambert(COLORS.limestone));
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
  const mound = new THREE.Mesh(new THREE.ConeGeometry(6.5, 3.2, 12), lambert(0xa89572));
  mound.position.set(gx, 1.6, gz);
  mound.castShadow = mound.receiveShadow = true;
  scene.add(mound);
  for (const ox of [-1.6, 0, 1.6]) {
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.6, 0.22), lambert(COLORS.cross));
    upright.position.set(gx + ox, 4.6, gz);
    upright.castShadow = true;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.2, 0.2), lambert(COLORS.cross));
    beam.position.set(gx + ox, 5.5, gz);
    beam.castShadow = true;
    scene.add(upright, beam);
  }
  addCollider(gx, gz, 8, 8);
  landmarkInfo(
    '골고다, "해골"',
    `성벽 바로 바깥의 낮은 바위 언덕으로, 길 위의 무리가 볼 수 있도록 공개 처형에
     쓰였다. 베드로의 사람들은 이천 년의 기억을 통해 이 언덕을 붙들었고, 오늘날
     그 위에는 성묘 교회가 서 있다 — 도성이 오래전에 감싸 안은 성벽 안에.`,
    gx, gz, 7.5, { w: 9, h: 8, d: 9 }
  );
}

// the garden tomb (site 8) — a rock-cut facade with the stone rolled aside
{
  const tx = -38, tz = 128;
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
  const mast1 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 7, 6), lambert(COLORS.woodDark));
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
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(6.5, 7, 6, 20), lambert(COLORS.limestoneShadow));
  drum.position.set(bx, 12, bz);
  drum.castShadow = true;
  const domeMat = new THREE.MeshPhongMaterial({ color: COLORS.goldBright, emissive: 0x4a3a0c, shininess: 80 });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(6.8, 20, 14, 0, Math.PI * 2, 0, Math.PI / 1.9), domeMat);
  dome.position.set(bx, 15, bz);
  dome.castShadow = true;
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1, 1.2, 2.4, 10), lambert(COLORS.limestone));
  lantern.position.set(bx, 21.5, bz);
  const crossBeamV = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.2, 0.28), new THREE.MeshLambertMaterial({ color: COLORS.goldBright }));
  crossBeamV.position.set(bx, 24, bz);
  const crossBeamH = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.28, 0.28), new THREE.MeshLambertMaterial({ color: COLORS.goldBright }));
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
    new THREE.RingGeometry(1.7, 2.3, 28),
    new THREE.MeshBasicMaterial({ color: COLORS.red, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.18;
  const pinMat = new THREE.MeshPhongMaterial({ color: COLORS.red, emissive: 0x3a0e08, shininess: 60 });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.85, 2.2, 12), pinMat);
  cone.rotation.x = Math.PI;
  cone.position.y = 2.5;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1.05, 14, 12), pinMat);
  ball.position.y = 4.05;
  ball.castShadow = true;
  const spriteMats = {
    red: numberSpriteMat(site.num, '#a8341f'),
    gray: numberSpriteMat(site.num, '#8b8478'),
    ink: numberSpriteMat(site.num, '#3b352c'),
  };
  const sprite = new THREE.Sprite(spriteMats.gray);
  sprite.scale.set(3.6, 3.6, 1);
  sprite.position.y = 6.6;
  const pin = new THREE.Group();
  pin.add(cone, ball);
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

const player = new THREE.Group();
{
  const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.78, 1.9, 10), lambert(COLORS.robe));
  robe.position.y = 1.55;
  robe.castShadow = true;
  const sash = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.07, 6, 14), lambert(COLORS.woodDark));
  sash.rotation.x = Math.PI / 2;
  sash.position.y = 1.35;
  const cloak = new THREE.Mesh(new THREE.ConeGeometry(0.62, 1.3, 10, 1, true), new THREE.MeshLambertMaterial({ color: COLORS.cloak, side: THREE.DoubleSide }));
  cloak.position.y = 1.85;
  cloak.position.z = -0.05;
  cloak.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.46, 12, 10), lambert(0xc99a72));
  head.position.y = 2.9;
  head.castShadow = true;
  const beard = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), lambert(0x4a4038));
  beard.position.set(0, 2.62, 0.24);
  beard.scale.set(1, 1.05, 0.75);
  player.add(robe, sash, cloak, head, beard);
}
const legGeo = new THREE.BoxGeometry(0.3, 0.95, 0.3);
legGeo.translate(0, -0.45, 0);
const legL = new THREE.Mesh(legGeo, lambert(0xc99a72));
const legR = legL.clone();
legL.position.set(-0.24, 0.95, 0);
legR.position.set(0.24, 0.95, 0);
legL.castShadow = legR.castShadow = true;
player.add(legL, legR);
player.scale.setScalar(0.58);
player.position.set(-30, 0, -112);
player.rotation.y = 0;
scene.add(player);

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
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.62, 2, 10), gm());
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
const TOMB_MOUTH = { x: -37, z: 131 };

/* ---------------- 길 위의 생명: 양 떼·목자·낙타·호수의 배·성벽 횃불 ---------------- */

// 양 한 마리
function makeSheep(x, z) {
  const g = new THREE.Group();
  const wool = new THREE.MeshLambertMaterial({ color: 0xe8e2d2, flatShading: true });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), wool);
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
  const robe = new THREE.Mesh(new THREE.ConeGeometry(0.6, 2, 9), lambert(0x6a5a44));
  robe.position.y = 1;
  robe.castShadow = true;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 10, 8), lambert(0xc99a72));
  head.position.y = 2.35;
  const crook = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), lambert(0x5a4128));
  crook.position.set(0.5, 1.3, 0);
  crook.rotation.z = 0.12;
  shep.add(robe, head, crook);
  shep.position.set(cx - 6, 0, cz - 2);
  shep.scale.setScalar(0.62);
  scene.add(shep);
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
  for (const [x, z] of spots) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 1.2, 5), lambert(0x2a2018));
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
    const hump = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6), hide);
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
  if (Math.abs(w - lastSkyW) > 0.015) { setSky(w); lastSkyW = w; }
  lerp3(scene.fog.color, FOG_NIGHT, FOG_DAY, FOG_DUSK, w);
  lerp3(sun.color, SUN_NIGHT, SUN_DAY, SUN_DUSK, w);
  sun.intensity = 1.1 + 1.5 * Math.sin(Math.min(1, w) * Math.PI * 0.85);
  hemi.intensity = 0.55 + 0.7 * w;
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
  keys[e.code] = true;
  if (finale) { skipFinale(); return; }
  if (voyage) { skipVoyage(); return; }
  if (waterWalk && waterWalk.phase !== 'walk') { skipWaterWalk(); return; } // 승선/귀환 컷신은 건너뛰기, 물 위 걷기 중엔 정상 조작
  if ((e.code === 'KeyE' || e.code === 'Enter') && state.started) tryVisit();
  if (e.code === 'KeyM' && state.started) toggleView();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

const joy = { id: null, ox: 0, oy: 0, dx: 0, dy: 0, mag: 0 };
const look = { id: null, lx: 0, ly: 0, sx: 0, sy: 0 };
const joyEl = document.getElementById('joystick');
const stickEl = document.getElementById('stick');

function onUi(e) {
  return e.target.closest && e.target.closest('button, #chart-key, .overlay, #compass');
}

window.addEventListener('pointerdown', (e) => {
  if (finale) { skipFinale(); return; }
  if (voyage) { skipVoyage(); return; }
  if (waterWalk && waterWalk.phase === 'boarding') { skipWaterWalk(); return; }
  if (!state.started || state.modal || onUi(e)) return;
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
  return Object.assign({ charted: [], epilogueShown: false, muted: false }, s);
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
  audio.init();
  audio.setMuted(save.muted);
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
muteBtn.addEventListener('click', () => {
  save.muted = !save.muted;
  persistSave();
  audio.setMuted(save.muted);
  reflectMute();
});
audio.setMuted(save.muted);
reflectMute();

function tryVisit() {
  if (state.modal || voyage || finale) return;
  if (state.boardMode) { startWaterWalk(); return; }
  if (!state.nearSite) return;
  openCard(state.nearSite);
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
      openCard(m);
      return;
    }
  }
  const hits = tapRay.intersectObjects(tapTargets, false);
  if (hits.length) openLandmarkCard(hits[0].object.userData.landmark);
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
  if (silent) {
    settlePin(marker);
  } else {
    pendingPinFx = marker;
    audio.play('chime');
  }
}

// HUD의 「다음 →」 안내와 범례의 붉은 하이라이트를 이야기 순서에 맞춘다
function updateNextHint() {
  let nxt = null;
  for (const m of markers) {
    if (!m.visited && (!nxt || m.site.num < nxt.site.num)) nxt = m;
  }
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
    chartSite(marker);
    if (marker.site.id === 'voyage-to-rome') pendingVoyage = true;
  }
}

document.getElementById('card-close').addEventListener('click', () => {
  if (ghostClick()) return;
  cardEl.classList.add('hidden');
  state.modal = false;
  if (pendingPinFx) {
    // 표지가 회색(대기) 상태에서 기록될 수도 있으니, 지금 색에서 먹색으로 저물게 한다
    pinFx.push({
      m: pendingPinFx, t: 0,
      from: pendingPinFx.pinMat.color.clone(),
      fromE: pendingPinFx.pinMat.emissive.clone(),
    });
    audio.play('bell');
    pendingPinFx = null;
  }
  if (waterWalk && waterWalk.phase === 'walk') {
    // 물 위 걷기 중 3번 카드를 닫으면 배가 물가로 데려다 준다
    startWaterWalkReturn();
  } else if (pendingVoyage) {
    pendingVoyage = false;
    startVoyage();
  } else if (state.visitedCount === SITES.length && !state.epilogueShown) {
    state.epilogueShown = true;
    finaleQueued = true;
  }
});

function showEpilogue() {
  modalOpenedAt = performance.now();
  save.epilogueShown = true;
  persistSave();
  document.getElementById('epilogue-body').innerHTML = EPILOGUE.map((p) => `<p>${p}</p>`).join('');
  buildSouvenir();
  epilogueEl.classList.remove('hidden');
  state.modal = true;
}

// 완주 기념 카드: 유물 14개가 박힌 세로 카드 이미지를 만들어 저장/공유
let souvenirURL = null;
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
  ctx.fillStyle = '#a8341f';
  ctx.font = `700 22px ${kFont}`;
  ctx.fillText('열네 곳을 모두 걸었습니다', W / 2, 560);
  ctx.fillStyle = '#5a5142';
  ctx.font = `italic 16px ${bFont}`;
  const line = '그가 원하지 않는 곳으로 끌려간 언덕까지,';
  const line2 = '베드로의 참된 길을 끝까지 따라갔습니다.';
  ctx.fillText(line, W / 2, 600);
  ctx.fillText(line2, W / 2, 626);
  ctx.font = `18px ${bFont}`;
  ctx.fillStyle = '#2b2620';
  ctx.fillText('“내 양을 먹여라”  — 요한복음 21:17', W / 2, 700);
  ctx.font = `14px ${bFont}`;
  ctx.fillStyle = '#8a7f6a';
  ctx.fillText('fishermans-chart.vercel.app', W / 2, H - 48);
  return cv;
}
function buildSouvenir() {
  const wrap = document.getElementById('souvenir-wrap');
  if (wrap.dataset.built) return;
  wrap.dataset.built = '1';
  const cv = makeSouvenirCanvas();
  const img = document.createElement('img');
  img.id = 'souvenir-img';
  img.alt = '어부의 지도 완주 기념 카드';
  cv.toBlob((blob) => {
    souvenirURL = URL.createObjectURL(blob);
    img.src = souvenirURL;
  }, 'image/png');
  const btn = document.createElement('button');
  btn.id = 'souvenir-btn';
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
  wrap.append(img, btn);
}
document.getElementById('epilogue-close').addEventListener('click', () => {
  if (ghostClick()) return;
  epilogueEl.classList.add('hidden');
  state.modal = false;
  toast('이제 지도를 자유롭게 걸어요. 어느 표지든 다시 찾으면 이야기를 또 읽을 수 있어요.');
});

/* ---------------- the voyage to Rome ---------------- */

let pendingVoyage = false;
let voyage = null;
function startVoyage() {
  if (state.view === 'chart') toggleView();
  state.modal = true;
  player.visible = false;
  voyageBoat.visible = true;
  voyageCaptionEl.textContent = '큰 바다를 건너, 로마를 향하여…';
  voyageCaptionEl.classList.remove('hidden');
  voyageCaptionEl.style.opacity = '1';
  const start = new THREE.Vector3(player.position.x, 0, player.position.z);
  const end = new THREE.Vector3(ROME_LANDING.x, 0, ROME_LANDING.z);
  const mid1 = new THREE.Vector3(-110, 0, 40);
  const mid2 = new THREE.Vector3(-170, 0, 105);
  voyage = {
    t: 0,
    dur: 11,
    curve: new THREE.CatmullRomCurve3([start, mid1, mid2, end]),
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
  voyageBoat.position.set(pos.x, Math.sin(voyage.t * 1.4) * 0.15, pos.z);
  voyageBoat.rotation.y = Math.atan2(ahead.x - pos.x, ahead.z - pos.z);
  player.position.set(pos.x, 0, pos.z);
  if (voyage.t >= voyage.dur) {
    voyage = null;
    voyageBoat.visible = false;
    player.visible = true;
    player.position.set(ROME_LANDING.x, 0, ROME_LANDING.z);
    state.modal = false;
    voyageCaptionEl.style.opacity = '0';
    setTimeout(() => voyageCaptionEl.classList.add('hidden'), 900);
    toast('바다를 건넜어요 — 로마가 눈앞이에요.');
  }
}

/* ---------------- 빈 무덤 달음질 (요 20:3–8) ---------------- */
// 무덤에 다가가면 요한이 앞질러 달려 어귀에 멈춰 서고, 베드로(플레이어)가 먼저 들어간다.
let tombRun = null;
let tombRunDone = false;
const _tombFrom = new THREE.Vector3();
function updateTombRace(dt, distTomb) {
  const site8 = markerById['empty-tomb'];
  // 발동: 무덤 18유닛 안, 아직 기록 전, 한 번만
  if (!tombRun && !tombRunDone && site8 && !site8.visited && distTomb < 18 && distTomb > 7) {
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

/* ---------------- 물 위 걷기 (마 14:22–33) — 배를 타고 나가 물 위를 걷는다 ---------------- */
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
      cam.yaw = Math.atan2(WW_DROP.x - WW_MARKER.x, WW_DROP.z - WW_MARKER.z); // 표지를 바라보게
      state.modal = false;
      toast('물 위로 걸어오라 — 빛의 길에서 눈을 떼지 말고, 멈추지 마라.');
    }
  } else if (w.phase === 'walk') {
    lightPath.material.opacity = Math.min(0.8, lightPath.material.opacity + dt * 0.9);
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

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  const effYaw = state.view === 'chart' ? 0 : cam.yaw;
  const fwdX = -Math.sin(effYaw), fwdZ = -Math.cos(effYaw);
  const rightX = Math.cos(effYaw), rightZ = -Math.sin(effYaw);
  let moving = 0, dirX = 0, dirZ = 0, running = false;
  if (state.started && !state.modal && !voyage && !finale) {
    const [mx, mz] = moveInput();
    moving = Math.hypot(mx, mz);
    // 달리기: Shift(키보드), 또는 엄지를 조이스틱 링 "바깥"까지 일부러 밀었을 때만 1.8배.
    // 링 가장자리(42px)에 대면 걷기 — 안 그러면 모바일이 상시 질주가 된다.
    running = moving > 0.01 && (keys.ShiftLeft || keys.ShiftRight
      || (joy.id !== null && joy.mag > 64));
    const spd = SPEED * (running ? 1.8 : 1);
    if (moving > 0.01) {
      dirX = rightX * mx + fwdX * -mz;
      dirZ = rightZ * mx + fwdZ * -mz;
      let nx = player.position.x + dirX * spd * dt;
      let nz = player.position.z + dirZ * spd * dt;
      if (!isWalkable(nx, player.position.z)) nx = player.position.x;
      if (!isWalkable(nx, nz)) nz = player.position.z;
      [nx, nz] = collide(nx, nz);
      [nx, nz] = keepAwayFromCross(nx, nz);
      if (isWalkable(nx, nz)) player.position.set(nx, player.position.y, nz);
      player.rotation.y = angleLerp(player.rotation.y, Math.atan2(dirX, dirZ), 0.2);
    }
  }
  walkPhase += dt * (4 + moving * 9) * (running ? 1.5 : 1);
  const swing = moving > 0.01 ? 0.62 : 0;
  legL.rotation.x = Math.sin(walkPhase) * swing;
  legR.rotation.x = -Math.sin(walkPhase) * swing;

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
  } else {
    waterWalkSink += (0 - waterWalkSink) * Math.min(1, dt * 2);
  }
  player.position.y = (moving > 0.01 ? Math.abs(Math.sin(walkPhase)) * 0.1 : 0) - waterWalkSink;
  // 가라앉을수록 화면 가장자리가 어두워진다
  if (sinkVeil) sinkVeil.style.opacity = String(Math.min(0.72, waterWalkSink * 1.4));

  const stepSign = Math.sin(walkPhase) >= 0;
  if (moving > 0.01 && stepSign !== lastStepSign) {
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
  if (finale) updateFinale(dt);

  if (finale) {
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
  const fv = FOG_VIEWS[state.view];
  scene.fog.near += (fv.near - scene.fog.near) * Math.min(1, dt * 2);
  scene.fog.far += (fv.far - scene.fog.far) * Math.min(1, dt * 2);
  sun.position.set(player.position.x + 70, 100, player.position.z + 45);
  sun.target.position.set(player.position.x, 0, player.position.z);

  if (!finale && !waterWalk) applyWarmth(regionWarmth(player.position.x, player.position.z));

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

  // 배에 오르기 프롬프트: 물 위 걷기 배 근처, 물 위 걷기 중이 아닐 때
  const distBoard = Math.hypot(player.position.x - WW_BOARD.x, player.position.z - WW_BOARD.z);
  const boardOn = state.started && !state.modal && !voyage && !finale && !waterWalk && distBoard < 6.5;
  state.boardMode = boardOn;
  const promptOn = boardOn || (!!near && state.started && !state.modal && !voyage && !finale);
  visitBtn.classList.toggle('hidden', !promptOn);
  if (promptOn) {
    const label = boardOn
      ? (markerById['fourth-watch'].visited ? '⚓ 다시 배로 나가기' : '⚓ 배에 오르기')
      : `${near.shortTitle} · ${near.visited ? '다시 읽기' : '이야기 읽기'}`;
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

  const spriteScale = chartView ? 12 : 3.6;
  const spriteY = chartView ? 16 : 6.6;
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
    const sScale = spriteScale * (waiting ? 0.78 : 1);
    m.sprite.scale.set(sScale, sScale, 1);
    m.pin.scale.setScalar((chartView ? 2.8 : 1) * (m.fxScale || 1));
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
  for (const f of fires) {
    const k = 0.85 + Math.sin(t * 14 + f.g.position.x) * 0.15;
    f.glow.scale.set(k, 1, k);
    f.light.intensity = 1.1 + Math.sin(t * 11) * 0.3;
  }

  // water: a lake ripple and a heavier sea swell
  const lPos = lakeGeo.attributes.position;
  for (let i = 0; i < lPos.count; i++) {
    const x = lakeBase[i * 3], z = lakeBase[i * 3 + 2];
    lPos.array[i * 3 + 1] = Math.sin(x * 0.2 + t * 1.1) * Math.cos(z * 0.17 + t * 0.9) * 0.12;
  }
  lPos.needsUpdate = true;
  const sPos = waterGeo.attributes.position;
  for (let i = 0; i < sPos.count; i++) {
    const x = waterBase[i * 3], z = waterBase[i * 3 + 2];
    sPos.array[i * 3 + 1] =
      Math.sin(x * 0.07 + t * 0.8) * Math.cos(z * 0.06 + t * 0.6) * 0.3 +
      Math.sin(x * 0.2 - t * 1.4) * Math.sin(z * 0.16 + t * 1.1) * 0.12;
  }
  sPos.needsUpdate = true;
  nightBoat.position.y = Math.sin(t * 0.9) * 0.05;
  shoreBoat.position.y = Math.sin(t * 0.9 + 2) * 0.05;
  if (!waterWalk) wwBoat.position.y = Math.sin(t * 0.9 + 1) * 0.05;
  wwFlag.visible = !markerById['fourth-watch'].visited;
  if (wwFlag.visible) wwFlag.rotation.y = Math.sin(t * 2.2) * 0.5; // 펄럭임

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
    ducked: (state.modal && !finale && !voyage),
  });

  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

for (const id of save.charted) {
  const m = markers.find((mk) => mk.site.id === id);
  if (m) chartSite(m, { silent: true });
}
if (save.epilogueShown) {
  state.epilogueShown = true;
}
updateNextHint();

animate();
