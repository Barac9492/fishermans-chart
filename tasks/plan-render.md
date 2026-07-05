# PLAN — render-pass: 블룸 · 물 반사 · 그림자/톤 · 필름 마감

참고: `tasks/scout-render.md` (렌더러 :79-85, 발광 후보 전수조사, 물 재질 등).
대상: `js/main.js` 단독. save 변경 없음. 커밋 금지.
핵심 제약: **모바일 보호** — FPS 게이트로 포스트프로세싱 자동 해제 경로 필수.

## 1. 포스트프로세싱 체인 (A+D)

### import (파일 상단, 기존 import 옆)
```js
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
```

### 컴포저 구성 (렌더러 설정 블록 근처)
```js
const composer = new EffectComposer(renderer);           // r160 기본 HalfFloat — HDR OK
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth / 2, window.innerHeight / 2),
  0.55,  // strength — 은은하게
  0.35,  // radius
  2.2    // threshold — 아래 '선택적 발광' 참고
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass()); // ACES 톤매핑+sRGB는 여기서
composer.addPass(filmPass);         // 비네트+그레인 — sRGB 공간에서 (아래 정의)
let usePost = true;
```
- 메인 렌더 호출 교체: `if (usePost) composer.render(); else renderer.render(scene, camera);`
- 리사이즈 핸들러에 `composer.setSize(w, h)` + `bloomPass.resolution.set(w/2, h/2)` 추가.

### 선택적 발광 전략 (중요 — 근거)
컴포저 버퍼는 톤매핑 **전 리니어 HDR**이다. 태양광 2.6 아래 밝은 모래의 리니어 값이
~2.0–2.5까지 올라가므로, 임계값 2.2 + **발광체 색을 HDR로 부스트**해 그것만 넘긴다.
방법: 해당 재질 생성부에서 `material.color.multiplyScalar(k)` (MeshBasic/Sprite/Points는
unlit이라 색값 = 리니어 출력값).

| 대상 (scout 참조) | k |
|---|---|
| 빛의 형상 robe/head 재질 (makeLightFigure, 0xfff3d8) | ×4.5 |
| 형상 glow 스프라이트, rescueBeam | ×3.5 |
| 등불 불꽃 콘 (0xffc860) | ×4 |
| fireProp 불꽃 메시 · 성벽 횃불 flame · flameFalls | ×3.5 |
| sparkTex 골드버스트 스프라이트 (clone 원본 재질에) | ×3 |
| stars PointsMaterial | ×2.5 |
| 별똥별 스프라이트 | ×4 |
| 가버나움 창문 win (0xe8c988) | ×2 |
| lightPath (물 위 빛의 길) | ×2.5 |
| 해·달 스프라이트 | ×1.6 (면적이 커서 은은하게) |
- **금지**: 마커 핀·모래·의상 등 무광 물체 부스트. 톤매핑(ACES)이 과다 노출을 눌러준다.
- 주의: 부스트는 **재질 생성 시점 1회** (매 프레임 곱하기 금지).

### 필름 패스 (D)
```js
const filmPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 } },
  vertexShader: /* 표준 fullscreen quad */,
  fragmentShader: /*
    비네트: uv 중심거리 기반 smoothstep(0.55, 1.0, d) * 0.28 어둡게
    그레인: hash(uv * time) * 0.035 가감
  */
});
```
- animate에서 `filmPass.uniforms.uTime.value = t;`

### FPS 게이트 (모바일 보호)
- `state.started` 이후 4초간 프레임 수 집계 → 평균 FPS < 45면 `usePost = false`
  (조용히 폴백 — 토스트 없음). 한 번만 측정.
- rAF 루프에서만 측정 (수동 tick 테스트와 간섭 없도록 dt 합산 기준).

## 2. 물 반사 (B)
- 시작 시 (try/catch로 감싸 실패해도 게임 진행):
  ```js
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  ```
- 물 재질(Standard) 조정: 호수 roughness 0.35→0.24, 바다 0.4→0.3, 둘 다
  `envMapIntensity = 1.15` (scene.environment 자동 반영).
- **햇빛 반짝임 길**: 가늘고 긴 additive 평면 스프라이트(radialSprite 재활용 또는
  전용 그라데이션 텍스처)를 호수 수면(y 0.1)에 눕혀 SUN_DIR 방위각 방향으로 회전
  배치, scale ≈ (34, 5). 매 프레임 `opacity = 0.22 * dayK * (0.8 + 0.2 sin(t*1.7))`.
  chartView에서는 0으로.

## 3. 그림자·톤·불빛 (C)
- `if (!IS_TOUCH) sun.shadow.mapSize.set(4096, 4096);` (렌더러 설정 직후, 라이트 생성 뒤).
- 노출 곡선: `applyWarmth(w)` 안에 `renderer.toneMappingExposure = 1.0 + 0.12 * w;`
  (현재 상수 1.05 대체 — 밤은 차분하게, 낮은 환하게).
- 불빛 일렁임: animate에서 fireProp 포인트라이트들과 등불 lampLight의 intensity에
  `* (0.86 + 0.14 * Math.sin(t * 9.3 + i) * Math.sin(t * 23.7 + i * 2))` 류의 저비용
  플리커. (기존 목표 intensity 로직을 깨지 말 것 — 등불은 lampTarget lerp 결과에
  플리커 계수를 곱하는 방식으로.)

## 검증 (implementer)
1. `node --check js/main.js`.
2. 브라우저: (a) 새벽 바닷가(27,-141 부근, 9번까지 chart 후)에서 빛의 형상·숯불이
   실제 발광(블룸)하는지, (b) 갈릴리 한낮 모래·의상은 블룸 없는지(전수 확인 아님,
   화면 육안), (c) 예루살렘 밤 등불+횃불 발광, (d) `usePost=false` 강제 시 폴백
   렌더 정상, (e) 리사이즈 후 컴포저 정상, (f) 콘솔 오류 0.
3. TEMP TEST HOOK:
   ```js
   // TEMP TEST HOOK — 검증 후 제거
   window.__t = {
     tick: animate, s: state, player, markers,
     go: (x, z) => player.position.set(x, 0, z),
     chart: (id) => chartSite(markerById[id], { silent: true }),
     post: () => usePost, setPost: (v) => { usePost = v; },
     bloom: bloomPass, exposure: () => renderer.toneMappingExposure,
   };
   ```
4. `tasks/progress-render.md` 작성.

## 금지
- SSAO·DOF 등 추가 패스, 픽셀비 상한 변경, 라이트 intensity 자체 변경(플리커 제외),
  기존 기능 리팩터, 커밋.
