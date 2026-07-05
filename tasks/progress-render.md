# PROGRESS — render-pass (블룸 · 물 반사 · 그림자/톤 · 필름 마감)

계획: `tasks/plan-render.md` · 대상: `js/main.js` 단독 · 커밋 안 함.

## 구현 내역

### 1. 포스트프로세싱 체인
- **import** (main.js:3-8): EffectComposer / RenderPass / UnrealBloomPass / ShaderPass / OutputPass / RoomEnvironment.
- **컴포저** (applyShadowFrustum 직후, ~main.js:153-198): RenderPass → UnrealBloomPass(res w/2·h/2, strength 0.55, radius 0.35, threshold 2.2) → OutputPass(ACES+sRGB) → filmPass. `let usePost = true`.
- **filmPass**: 인라인 ShaderPass — 비네트 `smoothstep(0.55,1.0,d)*0.28`, 그레인 `(hash(uv*(97+mod(t,61)))-0.5)*0.035`. animate 끝에서 `uTime = t` 갱신 (usePost일 때만).
- **메인 렌더 교체** (animate 끝): `if (usePost) { filmPass.uniforms.uTime.value = t; composer.render(); } else renderer.render(scene, camera);`
- **리사이즈**: `composer.setSize(w,h)` + `bloomPass.resolution.set(w/2,h/2)` 추가.
- **FPS 게이트** (animate 초입): `state.started` 이후 dt 합산 4초, 평균 FPS < 45면 `usePost = false` 조용히 1회. `fpsGate = { time, frames, done }`.

### 2. 선택적 HDR 발광 부스트 — 전부 재질 생성 시점 1회
| 대상 | k | 위치 |
|---|---|---|
| makeLightFigure robe/head mat | ×4.5 | makeLightFigure 내 |
| 형상 glow 스프라이트 | ×3.5 | makeLightFigure 내 |
| rescueBeam | ×3.5 | 생성 직후 |
| 등불 lampFlame (0xffc860) | ×4 | 생성 직후 |
| fireProp glow | ×3.5 | fireProp 내 |
| 성벽 횃불 flameMat | ×3.5 | 원본에 — clone들이 색 상속 |
| flameFallAt | ×3.5 | 생성 직후 |
| goldBurst 스파크 스프라이트 | ×3 | 스프라이트 재질 생성 직후 |
| 별똥별 스프라이트 | ×4 | spawnShootingStar 내 |
| stars PointsMaterial | ×2.5 | 생성 직후 |
| 가버나움 창 win (0xe8c988) | ×2 | basaltHouse 내 (winMat) |
| lightPath | ×2.5 | 생성 직후 |
| 해/달 스프라이트 | ×1.6 | 생성 직후 |
- 마커 핀·모래·의상 등 무광 물체는 손대지 않음.

### 3. 물 환경반사 + 햇빛 반짝임
- PMREM + RoomEnvironment → `scene.environment` (try/catch — 실패해도 게임 진행).
- 호수 roughness 0.35→0.24, 바다 0.4→0.3, 둘 다 `envMapIntensity: 1.15` (생성자 옵션).
- **sunGlint** (SUN_DIR 정의 직후): 34×5 additive 평면 + 방사형 그라데이션 텍스처, (0, 0.1, -129) 호수 중앙, `rotation.y = -atan2(SUN_DIR.z, SUN_DIR.x)`. animate: `opacity = chartUp ? 0 : 0.22*dayK*(0.8+0.2sin(t*1.7))`, visible 토글.

### 4. 그림자·노출·불빛
- `if (!IS_TOUCH) sun.shadow.mapSize.set(4096,4096)` — IS_TOUCH 선언 직후 (아래 DEVIATION 참고).
- `applyWarmth(w)` 안에 `renderer.toneMappingExposure = 1.0 + 0.12*w`.
- fireProp 라이트: 기존 식 × `(0.86 + 0.14 sin(t*9.3+i) sin(t*23.7+i*2))` (인덱스 루프로 전환).
- 등불: 새 상태변수 `lampLerp`로 목표 lerp 유지, `lampLight.intensity = lampLerp * 플리커` — lerp 상태가 플리커에 오염되지 않음. `lampG.visible`도 lampLerp 기준.

## PLAN DEVIATION
1. **4096 그림자 설정 위치**: 계획은 "렌더러 설정 직후, 라이트 생성 뒤"이나 `IS_TOUCH`가 main.js:1740 부근에서야 선언됨 — 첫 렌더 전인 IS_TOUCH 선언 직후로 이동 (섀도맵은 lazy 할당이라 동작 동일).
2. **bloom 해상도 semantics**: r160의 `composer.setSize(w,h)`가 내부에서 bloomPass.setSize(w,h)→½로 리사이즈함. 계획대로 `resolution.set(w/2,h/2)`도 두었으나 이는 장식적(no-op) — 실효 블룸 버퍼는 리사이즈 후 w/2 (계획 의도와 결과 동일).

## 검증 결과 (npx serve + 브라우저)
1. `node --check js/main.js` — OK (부스트 추가 시점 / 훅 제거 후 2회).
2. TEMP TEST HOOK으로 (검증 후 **제거 완료**, 재확인 OK):
   - (a) 9곳 chart 후 (27,-141) 새벽 바닷가: 빛의 형상 블룸 확인 (스크린샷 — 밝은 후광).
   - (b) 갈릴리 낮 모래·의상·마커: 블룸 없음 (육안).
   - (c) 예루살렘 밤 (10,118): 하늘 어두움, exposure 1.014(=1.0+0.12×0.12), 불꽃 콘 발광 + 등불 점등·자막 확인.
   - (d) `setPost(false)` 폴백: 정상 렌더 (스크린샷), 오류 0. 재활성화도 정상.
   - (e) 리사이즈 (모바일 375×812): composer RT 750×1624로 캔버스와 일치, 왜곡 없음.
   - (f) 콘솔 warning/error 0 (전 과정).
   - sunGlint: opacity 0.141 실측 — 공식 범위 [0.132, 0.22] 내에서 호흡. chart 뷰 0.
   - FPS 게이트: 데스크톱 4초 경과 후에도 usePost=true 유지 (60fps 통과), 게이트 코드 매 프레임 무오류 실행.
3. 훅 제거 후 리로드: 게임 정상 시작, `window.__t` 부재 확인, 콘솔 오류 0.

## 남은 것
- 없음. 실제 저사양 모바일 기기에서의 FPS 게이트 발동은 실기기 확인 권장 (로직은 dt 합산 기준으로 검증됨).
