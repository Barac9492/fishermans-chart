# Scout Report: Three.js r160 Rendering Architecture

## 개요
정적 게임 엔진 (js/main.js ~4150줄). WebGLRenderer로 scene 직렬 렌더링. 
현재 기본 포스트프로세싱 없음(DOM 오버레이 사용). 
주요 발광 객체 60+개, 그림자 기반 조명 시스템. 
물(호수·바다) MeshStandardMaterial로 애니메이션 변위.

---

## 관련 파일

| 파일 | 역할 | 핵심 라인 |
|------|------|---------|
| js/main.js | 전체 렌더링 파이프라인 | 1-4150 |
| index.html | importmap (three/addons) | 13-20 |

---

## 렌더러 설정 (WebGLRenderer)

**생성 & 초기화:**
- js/main.js:79 — `new THREE.WebGLRenderer({ canvas, antialias: true })`
- js/main.js:80 — `renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))`
- js/main.js:81 — `renderer.setSize(window.innerWidth, window.innerHeight)`

**섀도우맵:**
- js/main.js:82 — `renderer.shadowMap.enabled = true`
- js/main.js:83 — `renderer.shadowMap.type = THREE.PCFSoftShadowMap`

**톤매핑:**
- js/main.js:84 — `renderer.toneMapping = THREE.ACESFilmicToneMapping`
- js/main.js:85 — `renderer.toneMappingExposure = 1.05`

**리사이즈 핸들러:**
- js/main.js:4128-4132 — `window.addEventListener('resize', ...)`
  - `camera.aspect`, `camera.updateProjectionMatrix()`, `renderer.setSize()`

---

## 메인 렌더 호출

**animate() 루프:**
- js/main.js:3624-4126 — `function animate()`
  - js/main.js:3625 — `requestAnimationFrame(animate)`
  - **js/main.js:4125 — `renderer.render(scene, camera)` — 루프 끝, 모든 상태 업데이트 후**
  
**구조:**
- 시작: dt 계산, 입력 처리, 플레이어 이동, 카메라 업데이트
- 중간: 특수 FX 업데이트(voyage, waterWalk, eclipse, etc.), 애니메이션
- 끝: 모든 오브젝트 최종 상태 설정 후 `renderer.render(scene, camera)` 호출

**호출 시점:**
- js/main.js:4149 — 초기화 후 `animate()` 호출로 시작

---

## 씬 환경 설정

**배경 & 스카이:**
- js/main.js:92-95 — Canvas 기반 동적 그래디언트 스카이 텍스처
  - `scene.background = skyTex` (CanvasTexture, SRGB)
  - js/main.js:105-111 — `setSky(warmth)` 함수 (시간대 보간)

**안개:**
- js/main.js:113 — `scene.fog = new THREE.Fog(0xcdbf9a, 130, 340)`
- js/main.js:3752-3754 — animate 루프에서 동적 near/far 조정 (street vs chart 뷰)

**조명 (고정 + 동적):**
- js/main.js:123-134 — HemisphereLight + DirectionalLight(sun)
  - `hemi = new THREE.HemisphereLight(0xdce6e0, 0xa89468, 1.1)`
  - `sun = new THREE.DirectionalLight(0xfff0c8, 2.4)` @ (70, 100, 45)
  - 섀도우 카메라 좌표: js/main.js:136-145 (frustum 모드별)
  - js/main.js:3755-3756 — animate에서 플레이어 위치 추적

**카메라:**
- js/main.js:116 — `new THREE.PerspectiveCamera(55, aspect, 0.4, 1600)`
- js/main.js:3748-3751 — 부드러운 렌즈 이동 (lerp)

---

## 물 재질 & 변위

**호수 (Sea of Galilee):**
- js/main.js:349-358 — `lakeWater`
  - 지오메트리: `PlaneGeometry(64, 62, 20, 20)` @ (0, -0.42, -129)
  - 재질: `MeshStandardMaterial({ color: COLORS.lake=0x5a9088, roughness: 0.35, metalness: 0.05, flatShading: true })`
  - receiveShadow: true

**바다:**
- js/main.js:338-347 — `seaWater`
  - 지오메트리: `PlaneGeometry(780, 460, 70, 60)` @ (-90, -0.6, -20)
  - 재질: `MeshStandardMaterial({ color: COLORS.sea=0x4f7a85, roughness: 0.4, metalness: 0.05, flatShading: true })`
  - receiveShadow: true

**변위 애니메이션 (animate 루프에서 매 프레임):**
- js/main.js:3952-3958 — 호수 리플 (Lake ripple)
  ```
  lPos.array[i * 3 + 1] = Math.sin(x*0.2 + t*1.1) * Math.cos(z*0.17 + t*0.9) * 0.12
  ```
- js/main.js:3959-3966 — 바다 물결 (Sea swell: 두 개 사인파 합)
  ```
  sPos.array[i * 3 + 1] = 
    Math.sin(x*0.07 + t*0.8)*Math.cos(z*0.06 + t*0.6)*0.3 + 
    Math.sin(x*0.2 - t*1.4)*Math.sin(z*0.16 + t*1.1)*0.12
  ```
- 기저 좌표 저장: js/main.js:340, 351 (`.slice()`)

---

## 발광 객체 전수조사

### 1. 빛의 형상 2개
- **함수:** `makeLightFigure()` js/main.js:2193-2209
- **재질:**
  - `MeshBasicMaterial({ color: 0xfff3d8, transparent: true, opacity: 0.92, fog: false })`
  - 물체: 원뿔(robe) + 구(head)
- **발광:** radialSprite 후광 (js/main.js:2200-2203)
  - `radialSprite([[0, 'rgba(255,244,214,0.7)'], [0.4, 'rgba(255,240,200,0.22)'], [1, 'rgba(255,240,200,0)']])`
  - opacity: 0.75, scale: 6.5
- **인스턴스:**
  - `wwFigure` (js/main.js:2210) — 물 위 말씀의 형상
  - `shoreFigure` (js/main.js:2211-2212) — 새벽 바닷가 형상 @ (28.5, 0, -143.5)

### 2. rescueBeam (붙잡으시는 손)
- js/main.js:2214-2219
- 재질: `MeshBasicMaterial({ color: 0xfff0c0, transparent: true, opacity: 0.85, fog: false })`
- 지오메트리: `CylinderGeometry(0.06, 0.06, 1, 6)`
- 가시성: 물 위 걷기 구원 순간에만 (js/main.js:2262, 2336, 2350)

### 3. 발의 등불 (Lamp of the Feet)
- **본체:**
  - js/main.js:1149-1156 — `lampFlame` Mesh
  - 재질: `MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.85 })`
  - 지오메트리: `ConeGeometry(0.22, 0.35, 5)`
  - 위치: 플레이어 추적, 예루살렘 밤길에서만 활성화
  
- **조명:** js/main.js:1161
  - `lampLight = PointLight(0xf5c878, intensity=0, range=14, decay=2)`
  - js/main.js:3777-3785 — animate에서 강도/가시성 조정
  - 일렁임 애니메이션: `scale.set(fk, 0.9+sin(...)*0.2, fk)` with fk=1+sin(t*11)*0.18

### 4. 모닥불 (Fires)
- **함수:** `fireProp(x, z)` js/main.js:1085-1099
- **재질:**
  - Mesh (반짝이): `MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.85 })`
  - 지오메트리: `PlaneGeometry(0.8, 1.2)`
- **조명:**
  - `PointLight(0xff9040, intensity=1.4, range=9, decay=2)`
  - 위치: y=0.5
- **인스턴스:**
  - `fires = firePositions.map(({ x, z }) => fireProp(x, z))` js/main.js:1101
- **애니메이션:** js/main.js:3945-3950
  ```
  f.glow.scale.set(k, 1, k) where k = 0.85 + sin(t*14 + f.g.position.x)*0.15
  f.light.intensity = 1.1 + sin(t*11)*0.3
  ```

### 5. 성벽 횃불 (Torches)
- js/main.js:1281-1294
- 재질: `MeshBasicMaterial({ color: 0xff8a3a, transparent: true, opacity: 0.9, fog: false })`
- 지오메트리: `ConeGeometry(0.2, 0.55, 5)`
- 배열: `torches`
- 애니메이션: js/main.js:4010-4014
  ```
  f.scale.set(k, 0.9+sin(t*17+z)*0.2, k) where k=0.8+sin(t*13+x)*0.2
  ```

### 6. 오순절 불의 혀 (Flame Falls)
- **함수:** `flameFallAt(x, z)` js/main.js:3288-3296
- 재질: `MeshBasicMaterial({ color: 0xff9a3a, transparent: true, opacity: 0.95, fog: false })`
- 지오메트리: `ConeGeometry(0.22, 0.65, 7)`
- 위치: (x, 9, z) 에서 시작, 떨어지며 흔들림 (js/main.js:3300-3313)
- 호출 위치: js/main.js:3326 (펜테코스트 이벤트)

### 7. 금빛 불꽃 (Spark Sprites)
- **텍스처:** js/main.js:3063-3076 (`sparkTex`)
  - Canvas 생성 (256x256), 방사형 그래디언트 금색
  - 색: rgba(238, 242, 255, 0.95) 쪽
  
- **스프라이트 사용:**
  - js/main.js:3077 — `SpriteMaterial({ map: sparkTex, transparent: true, depthWrite: false, opacity: 0.95 })`
  - 파티클 & 별똥별 효과 공유 텍스처
  
- **별똥별 (Shooting Stars):**
  - js/main.js:3136-3159
  - 배열: `shootingStars`
  - 재료: sparkTex 스프라이트, 속도 변수 (vx, vy, vz)
  - 애니메이션: js/main.js:3152-3159 업데이트 루프

### 8. 별 (Stars)
- js/main.js:1377-1396
- 재질: `PointsMaterial({ color: 0xe8ecf5, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false })`
- 위치: 380개 점, 반구 상방 (지평선 위, r=760)
- 애니메이션: js/main.js:3768-3770
  ```
  stars.position.copy(player.position)
  stars.rotation.y = t*0.004
  stars.material.opacity += ((chartUp ? 0 : 0.9*nightK) - opacity) * dt*2
  ```
- renderOrder: -11

### 9. 해/달/구름 스프라이트
- **radialSprite 함수:** js/main.js:1355-1371
  - Canvas 기반 방사형 그래디언트, 스프라이트로 렌더
  
- **sunSprite:** js/main.js:1365-1368
  ```
  [[0, 'rgba(255,248,224,1)'], [0.14, 'rgba(255,242,205,0.9)'], 
   [0.4, 'rgba(250,232,185,0.3)'], [1, 'rgba(250,232,185,0)']]
  ```
  - 크기: 256 (기본값)
  - 애니메이션: js/main.js:3764-3765, opacity 낮과 밤에 따라 변화
  
- **moonSprite:** js/main.js:1369
  ```
  [[0, 'rgba(235,240,250,1)'], [0.1, 'rgba(225,232,246,0.95)'],
   [0.16, 'rgba(215,224,242,0.25)'], [1, 'rgba(215,224,242,0)']]
  ```
  
- **구름 (Clouds):** js/main.js:1398-1425
  - 6개 스프라이트, Canvas 텍스처 (256x128)
  - 재질: `SpriteMaterial({ map, transparent: true, depthWrite: false, fog: false, opacity: 0 })`
  - 색: rgba(246, 241, 228, 0.5-0)
  - 애니메이션: js/main.js:3771-3775 (수평 이동, 낮 시간 opacity)

### 10. 가버나움 창문 (Capernaum House Windows)
- **함수:** `basaltHouse()` js/main.js:725-747
- **창:**
  - js/main.js:734-740
  - 재질: `MeshBasicMaterial({ color: 0xe8c988 })` (따뜻한 금색)
  - 지오메트리: `PlaneGeometry(0.42, 0.5)`
  - 위치: 벽면 부착 (w/2+0.03, h*0.55, 랜덤 z)
  - 인스턴스: 6개 가옥 (js/main.js:749-753)

### 11. 빛의 길 (Light Path)
- js/main.js:821-839
- 재질: `MeshBasicMaterial({ map: canvasTexture, transparent: true, depthWrite: false, opacity: 0 })`
- 텍스처: 선형 그래디언트 (가우시안 형태, rgba(255,240,200,0~0.55~0))
- 지오메트리: `PlaneGeometry(길이, 5)` 회전 X축
- 애니메이션: js/main.js:2259-2314 (물 위 걷기 동안 opacity 0~0.8)

---

## 태양 방향 & 시간 계산

**상수:**
- js/main.js:1373 — `SUN_DIR = Vector3(0.55, 0.5, 0.42).normalize()` 
- js/main.js:1374 — `MOON_DIR = Vector3(-0.4, 0.55, -0.5).normalize()`

**warmth 시스템 (duskW):**
- js/main.js:1452 — `let duskW = 0.35` (현재 시간대 스칼라)
- js/main.js:1459-1466 — `applyWarmth(w)` 함수
  - 스카이 색 업데이트 (`setSky(w)`)
  - 안개, 태양 색 보간 (FOG_NIGHT/DAY/DUSK, SUN_NIGHT/DAY/DUSK)
  - 태양 강도 & 반구 강도 조정
  
- js/main.js:1454-1455 — 색 상수
  ```
  FOG_DAY: 0xcdbf9a, FOG_NIGHT: 0x2a2c3a, FOG_DUSK: 0xd9a066
  SUN_DAY: 0xfff0c8, SUN_NIGHT: 0x39415c, SUN_DUSK: 0xffb070
  ```

- js/main.js:1471-1477 — `regionWarmth(x, z)` 함수 (지역별 시간대)
  - 갈릴리: 0.85 (아침 금색)
  - 예루살렘: 0.12 (밤)
  - 로마: 0.55 (오후)

- js/main.js:3758 — animate에서 호출
  ```
  applyWarmth(warmthOverride ?? regionWarmth(...))
  ```

- js/main.js:3762-3763 — dayK/nightK 계산
  ```
  dayK = max(0, min(1, (duskW - 0.35) / 0.4))
  nightK = max(0, min(1, (0.4 - duskW) / 0.3))
  ```

---

## importmap & 모듈 경로

**index.html:13-20**
```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
  }
}
</script>
```

**현재 사용 중인 addons:**
- js/main.js:2 — `BufferGeometryUtils` (mergeGeometries)

**포스트프로세싱 모듈 import 가능 여부:**
- Yes — `three/addons/` 경로 설정됨
- 사용 가능 모듈:
  - `EffectComposer` (three/addons/postprocessing/EffectComposer.js)
  - `RenderPass` (three/addons/postprocessing/RenderPass.js)
  - `ShaderPass` (three/addons/postprocessing/ShaderPass.js)
  - `UnrealBloomPass` (three/addons/postprocessing/UnrealBloomPass.js)
  - `FilmPass` (three/addons/postprocessing/FilmPass.js)
  - 기타 pass/effect들

---

## 성능 관련 정보

**모바일 판정:**
- js/main.js:1675 — `const IS_TOUCH = window.matchMedia('(pointer: coarse)').matches`

**픽셀 비율:**
- js/main.js:80 — 최대 2배로 제한 (모바일 성능 고려)

**매 프레임 무거운 작업:**
1. js/main.js:3953-3966 — 물 변위 (호수 20x20, 바다 70x60 버텍스)
2. js/main.js:3946-3950 — 불 스케일 업데이트 (fires 배열)
3. js/main.js:3768-3775 — 별/구름 위치 & opacity (animate에서 매 프레임)
4. js/main.js:3890-3923 — 표지 마커 스케일/회전/위치 (렌더 순서 설정)
5. js/main.js:3932-3943 — 지명 라벨 스케일 보간
6. js/main.js:4031-4040 — 군중/특수 FX 업데이트 (crowd, flameFalls, sheep, etc.)
7. js/main.js:4064-4070 — 낙타 경로 샘플링 보간

**섀도우맵:**
- 2048x2048 (js/main.js:128)
- PCFSoftShadowMap (js/main.js:83)
- Frustum 재설정 (거리 400) js/main.js:129

---

## 기존 sinkVeil/eclipse 구현

**sinkVeil (DOM 오버레이):**
- js/main.js:2241 — `const sinkVeil = document.getElementById('sink-veil')`
- index.html:90 — `<div id="sink-veil"></div>`
- 사용: js/main.js:3691 — opacity 애니메이션 (물 위 걷기 침몰 시 화면 가장자리 어둡게)
- **WebGL 아님, 순수 DOM**

**eclipse (DOM 오버레이):**
- js/main.js:2379-2380 — `const eclipseEl = document.getElementById('eclipse')`
- index.html:91 — `<div id="eclipse"></div>`
- 관리: js/main.js:2380-2412 (`updateEclipse()` 함수)
- js/main.js:2403 — `eclipseEl.style.opacity = String(0.93 * fadeIn * fadeOut)`
- 자막 표시: js/main.js:2404-2409 (eclipse.caps 배열)
- **WebGL 아님, 순수 DOM**

**결론:** 두 오버레이 모두 CSS z-index로 렌더 위에 표시. 포스트패스와 간섭 없음.

---

## 열린 질문

1. **물 반사 현재 미구현?** — MeshStandardMaterial의 기본 반사만 사용 중. 실시간 반사/굴절 효과 없음
2. **포스트프로세싱 인프라?** — 없음. EffectComposer 필요시 신규 구축
3. **블룸 대상 자동 필터링?** — 현재 음; 모든 발광 색상이 HDR/emissive 없이 직접 렌더
4. **섀도우 바이어스 조정 필요?** — 현재 bias=-0.0004, normalBias=0.03, radius=3 (고정값)
5. **토닝곡선 노출 조정 범위?** — 현재 toneMappingExposure=1.05 고정. applyWarmth는 sky/sun만 수정

