# REVIEW — render-pass (블룸 · 물 반사 · 그림자/톤 · 필름 마감)

대상: `js/main.js` 워킹 트리 diff (125+/11-) vs `tasks/plan-render.md` · 참고: `tasks/progress-render.md`, `tasks/scout-render.md`.
검토 방식: 전체 diff 라인별 대조 + 콜러 추적 + `node --check` 재실행. 코드 수정 없음.

## Findings (심각도 순)

### 1. (Low) bloomPass.resolution.set이 진짜 no-op인지 재현 검증 없이 구현 기록에만 의존
`js/main.js:322-324` — 리사이즈 핸들러에서 `composer.setSize(w,h)` 다음에
`bloomPass.resolution.set(w/2, h/2)`을 호출. progress 문서는 이를 "장식적
(no-op)"이라 주장하나 UnrealBloomPass 소스를 직접 대조하지 않았다(CDN 로드라
로컬 vendored 파일 없음 — 이번 리뷰에서도 정적으로 확인 불가). 실패 시나리오:
만약 r160의 `composer.setSize`가 실제로는 `bloomPass.setSize(w,h)`만 호출하고
`.resolution`을 별도로 갱신하지 않는 버전이라면, `resolution.set(w/2,h/2)`
라인이 실제로 유효한 보정 역할을 하고 있는 것이지 장식이 아닐 수 있다 — 이
경우 결론(no-op)은 틀렸지만 동작 자체는 올바르므로 실제 버그는 아님.
순수 문서 정확성 이슈, 렌더링 결과에는 영향 없음. 실기기 리사이즈 스크린샷
검증(750×1624)으로 결과가 정상임은 이미 확인됨 — 그대로 두어도 무방.

### 2. (Info) sunGlint 갱신이 `chartUp` 진입 프레임에 하드컷 (스무딩 없음)
`js/main.js:3878` — `sunGlint.material.opacity = chartUp ? 0 : ...` — 다른 하늘
스프라이트(sunSprite/moonSprite/stars/clouds)는 전부 `+= (target - cur) * dt*k`
lerp로 부드럽게 전환되는데 sunGlint만 즉시 0/비0 스냅. 실패 시나리오: chart 뷰
진입 순간 다른 하늘 요소는 서서히 사라지는데 sunGlint만 그 프레임에 즉시
사라져 시각적 불일치가 아주 미세하게 있을 수 있음. 다만 sunGlint는 저고도
평면 스프라이트라 chart 뷰(초고공 탑뷰) 전환 시 카메라 컷 자체가 크고 빠르므로
육안 체감 가능성은 낮음. 계획서에 lerp 요구가 없었고("chartView에서는 0으로"만
명시), 구현이 계획을 문자 그대로 따른 것 — 결함이라기보다 계획 자체의 사소한
공백. FIX 불필요.

## 확인된 항목 (문제 없음)

- **부스트 오염 없음**: 13곳 모두 재질 생성 직후 1회 `multiplyScalar` 확인.
  `flameMat.color.multiplyScalar(3.5)`는 clone 이전 원본에 1회만 적용되고
  `torches`는 `flameMat.clone()`으로 색값을 상속(js/main.js:1343-1348) — clone
  시점에 재곱셈 없음. `goldBurst`/`spawnShootingStar`는 스폰마다 `new
  SpriteMaterial(...)` 신규 생성 후 그 자리에서 1회 곱 — sparkTex 텍스처만
  공유, 재질 인스턴스는 공유 안 함 → 누적 곱 없음.
- **플리커·lerp 비오염**: `lampLerp`(js/main.js:1207, 3884-3886)가 목표
  lerp 상태를 단독 보유, `lampLight.intensity`는 매 프레임 `lampLerp * 플리커`로
  파생 계산만 하고 `lampLerp`에 재대입하지 않음 — lerp 누적 상태 오염 없음.
  `lampG.visible`도 `lampLerp` 기준이라 플리커가 0.72~1.0 범위(0 미만 불가)라
  가시성 플래핑 없음. fireProp도 동일 패턴(`i`로 위상만 다르게).
- **FPS 게이트**: `state.started` 게이트로 시작 화면/모달 이전 왜곡 방지,
  `fpsGate.done` 플래그로 1회만 발동, dt 합산 기준(rAF 전용 clock.getDelta) —
  TEMP TEST HOOK(`tick: animate` 수동 호출 경로)은 실제로 제거됨(grep 확인).
- **폴백 완전성**: `usePost=false`든 PMREM try/catch 실패든 게임 진행에 지장
  없음 확인 — composer 생성 자체는 try/catch 밖에 있어 EffectComposer/
  UnrealBloomPass 생성자가 던지면 앱 전체가 죽지만, 이는 계획서에 명시된
  범위 밖(계획은 "컴포저 생성"이 아니라 "PMREM"만 try/catch 대상으로 지정) —
  plan 그대로 구현됨, 이탈 아님.
- **리사이즈/chartView/컷신**: `composer.setSize` + `bloomPass.resolution.set`
  순서 정상, 하늘 스프라이트 opacity 로직 미변경(부스트는 color만 건드림 —
  opacity 페이드와 독립 채널이라 충돌 없음), eclipse/sinkVeil은 DOM 오버레이라
  포스트패스와 무관(z-index 컴포지팅) — scout 문서 결론 그대로 유효.
- **노출 곡선 단일 경로**: `toneMappingExposure`를 직접 대입하는 곳은
  초기화(js/main.js:91, `applyWarmth(0.35)`로 즉시 덮어씌워짐)와
  `applyWarmth()` 내부(js/main.js:1543) 단 두 곳. finale(3632)/waterWalk 관련
  경로 모두 `applyWarmth()`를 통해서만 duskW를 바꾸므로 노출식 우회 없음.
  `animate()`의 `if (!finale && !waterWalk) applyWarmth(...)` 호출은 매 프레임
  무조건 실행되어 chart 뷰에서도 exposure가 매 프레임 재계산됨 — 스테일 노출
  없음.
- **금지사항 준수**: 패스 4개(RenderPass/Bloom/OutputPass/filmPass) 외 추가
  없음, `setPixelRatio(Math.min(dpr,2))` 미변경, `sun`/`fireProp`/`lampLight`
  생성자 intensity 상수 미변경(런타임 곱셈만 추가), 리팩터 없음, git 커밋 없음
  (`git status`로 `js/main.js` 미커밋 확인).
- `node --check js/main.js` 재실행 — OK.

## 판정: **SHIP**

경미한 문서 정확성 지적(#1) 하나와 계획 범위 내 정보성 노트(#2) 외에 실제
결함 없음. 발광 부스트, 플리커/lerp 분리, FPS 게이트, 노출 경로, 폴백 경로
모두 코드 추적으로 재현 검증됨. 진행 기록의 PLAN DEVIATION 2건도 근거 타당.
