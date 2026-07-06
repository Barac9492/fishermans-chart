# REVIEW — GOTY Phase 2: 시작과 끝 (Title · Pause · Credits)

리뷰 대상: 현재 uncommitted working-tree diff (index.html / styles.css / js/main.js)
대조: tasks/plan-goty2-title-end.md, tasks/progress-goty2.md

## 검증 방법
- `git diff` 전체 라인 단위로 읽고 플랜 대조
- `node --check js/main.js` / `js/audio.js` 재실행 (implementer 클레임 재확인) — 통과
- 새/기존 플래그(`voyage/finale/eclipse/sleepFx/sitting/waterWalk/netsRide/leapFx/flowBusy`) grep으로 실존 확인 — 전부 존재
- `chartSite`/`finale`→`showEpilogue`→`epilogue-close`→`startCredits` 호출 순서를 추적해 상태 겹침 여부 확인
- z-index, `MODE_GAIN.silent`, `applyQuality`/`fpsGate` 부팅 순서, `credits`/`paused` 상호배제 조건 추적

## findings

### MAJOR — Escape가 컷신 스킵 체인을 가로채 무력화한다 (finale/voyage/eclipse 중 Esc가 더 이상 스킵되지 않음)
`js/main.js:1568-1570`
```js
if (credits) { skipCredits(); return; }
if (e.code === 'Escape') { togglePause(); return; }
if (paused) return;
if (finale) { skipFinale(); return; }
if (voyage) { skipVoyage(); return; }
if (eclipse) { skipEclipse(); return; }
...
```
변경 전(HEAD)에는 Escape를 포함해 어떤 키를 눌러도 `finale`/`voyage`/`eclipse`/`sleepFx`/`sitting`/`waterWalk` 컷신이 스킵됐다(1565-1576, 브랜치 순서상 Escape는 그냥 "아무 키"로 취급됨). 이제는 Escape가 컷신 플래그 체크보다 **먼저** 처리되어 `togglePause()`를 호출하는데, `togglePause()`는 `canPause()`가 `!voyage && !finale && !eclipse && ...`를 요구하므로 컷신 중엔 아무 것도 하지 않고 조용히 `return`한다. 이어서 `return`이 실행되므로 라인 1571 이하의 스킵 체인에는 **절대 도달하지 못한다**.

**실패 시나리오**: 플레이어가 `voyage`(로마행 항해 컷신) 또는 `finale`(완주 후 로마 컷신) 중 Esc를 눌러 건너뛰려 시도 → 이전엔 즉시 스킵됐지만 지금은 아무 반응 없음 (게임이 멈춘 것처럼 느껴짐, 다른 키(Space 등)를 눌러야만 스킵됨). 플랜(61행)이 이 순서를 그대로 지시했으므로 구현 이탈은 아니지만, 플랜 자체의 설계 결함이며 실제 동작 회귀다. "컷신 중 togglePause가 거부되면 무시(토스트 불필요)"라는 플랜 문구는 pause 메뉴가 안 열리는 것만 다뤘고, Escape가 기존 스킵 체인을 잡아먹는 부작용은 언급/검증되지 않았다.

**권장**: Escape 분기에서 `canPause()`가 false이고 `paused`도 false인 경우(즉 아무 것도 안 하는 경우)엔 `return`하지 말고 기존 스킵 체인으로 흘려보내거나, `if (e.code === 'Escape' && !canPause() && !paused) { /* fallthrough */ }` 형태로 처리해 최소한 컷신 스킵 기능을 보존해야 한다.

### MINOR — 인트로 스크림 대비가 3D 장면 밝기에 의존 (untestable at review time, 실측 필요)
`styles.css:42-50`, `js/main.js:4044` (`applyWarmth` unconditional in `animate()`)
`#intro` 배경은 `rgba(236,226,196,.9→.62→.78)` + blur이며, 살아있는 3D 배경(하늘/물/안개)이 `duskW`(플레이어 스폰 지역 warmth)에 따라 어두워질 수 있다(`FOG_NIGHT`/`SUN_NIGHT` 등). 중간 그라디언트 지점(alpha .62)에서 배경이 어두운 값일 경우 본문 텍스트 대비가 요구치(4.5:1) 밑으로 떨어질 가능성이 있다. 구현자는 스크린샷 확인으로 셀프체크를 통과시켰으나(플레이어 스폰이 갈릴리라 duskW 기본값이 높다고 가정), 코드 레벨에서 강제되는 값이 아니라 위치 종속적 값이라 회귀 가능성이 있다. 실기기/야간 재확인 권장. 블로킹 아님.

### NOTE — `boardOn`/`sailMode`/`sitSpot` 내부 불리언은 `!credits` 없이 계산되지만 결과적으로 무해함
`js/main.js:4100,4105,4116` vs `4126`
세 변수 계산에는 `!paused`만 추가되고 `!credits`는 빠져 있다. 다만 이를 소비하는 `visitBtn` 노출 게이트(`promptOn`, 4124-4126)에는 `!paused && !credits`가 있어 화면상 프롬프트는 크레딧 중 절대 뜨지 않는다. 또 `E`/`Enter` 키 입력은 키다운 체인 최상단에서 `credits` 체크로 이미 흡수되므로(`skipCredits()`가 먼저 실행) `tryVisit()`엔 도달하지 않는다. 실사용상 버그 없음 — 코드 일관성만 아쉬움 (사소한 실효 없는 상태 계산 중복).

### NOTE — `pauseBtn` 클릭 핸들러의 `if (!paused)` 가드는 사실상 도달 불가능한 방어 코드
`js/main.js:1841` 부근 `pauseBtn.addEventListener('click', () => { if (!paused) togglePause(); });`
`#pause` 오버레이(z-index 30, `position:fixed; inset:0`)가 열려 있으면 `#pause-btn`(z-index 10, `#hud` 내부)을 완전히 뒤덮으므로 오버레이가 열린 상태에서 pauseBtn 자체가 클릭될 일이 없다. 방어 코드는 무해하지만 불필요 — 버그 아님, 참고만.

## 확인된 정상 동작 (구현자 클레임 재검증 완료)
- `chartSite(m, {silent:true})` 세이브 복원(main.js:4435-4437)은 모듈 로드 시점에 실행되며 `state.started`와 무관 — 타이틀 카메라 분기(`!state.started`, main.js:3995)와 간섭 없음, `cam.yaw`도 건드리지 않음.
- `applyQuality(save.quality)`는 top-level 스크립트 순서상 `animate()`가 처음 호출되기 전에 실행되므로 `usePost`/`fpsGate.done`이 첫 프레임 전에 확정됨 — 플랜이 지목한 위치와 다르지만(save가 1656행에야 선언되어 불가피) 타이밍상 동일 효과, PLAN DEVIATION 로그의 설명이 정확함.
- `finale`는 `showEpilogue()` 호출 전에 `null`로 세팅되고, `epilogue-close`가 크레딧을 트리거하므로 `finale`와 `credits`는 시간적으로 절대 겹치지 않음 — `musicMode()`의 `credits` > `paused` 순서, `ducked` 조건의 `finale` 배제 로직 모두 실질적으로 안전.
- `MODE_GAIN.silent = 0` 존재 확인(audio.js:95) — `paused` 뮤직모드 'silent' 정상 동작.
- z-index: `.overlay`(pause 포함)=30, `#credits`=40, `#hud`=10, toast=25 — 레이어 충돌 없음.
- `node --check` 양쪽 통과, `togglePause`/`applyQuality`/`credits` 등 모두 함수 선언/최상위 let으로 키다운 핸들러보다 늦게 선언돼도 런타임 TDZ 문제 없음.
- 처음부터 다시: `SAVE_KEY` 상수 재사용, 기존 reset-link와 동일 삭제 키 확인.
- `endCredits()`의 `credits.done` 가드로 Esc/키/클릭 중복 트리거 안전.
- reduced-motion 경로: `dur=0`이면 자동 종료 로직이 스킵되고 탭/키로만 닫히는 것이 의도된 동작(플랜 130행과 일치).

## 검증 안 된 항목 (구현자 로그에서도 실측 생략, 리뷰에서도 코드로만 추적)
- 실제 브라우저 60fps에서 크레딧 45초 타이밍 체감 (implementer가 헤드리스 dt 스로틀 이슈로 실측 skip, 코드상 로직은 맞음).
- 모바일 실기기 pause-btn/크레딧 레이아웃 (스크린샷 기반, 실기기 미검증이나 리스크 낮음).

## 검증 목록의 항목 4 관련 참고
구현자 셀프체크 4번("카드 열린 상태에서 Esc → 일시정지 안 열림")은 `canPause()`의 `!state.modal` 게이트로 코드상 확실히 맞다 — 이 항목 자체는 문제 없음. 이번 리뷰의 MAJOR 항목은 "카드"가 아니라 "컷신 플래그"(voyage/finale/eclipse) 중 Escape 스킵 회귀에 관한 것으로 별개 이슈다.

## verdict

**FIX-THEN-SHIP**

- FIX 1 (필수): Escape가 voyage/finale/eclipse 등 컷신 스킵 체인을 가로채 무력화하는 문제 (main.js:1568-1573) — Escape로 컷신을 못 건너뛰게 된 회귀를 고칠 것. canPause()==false && !paused인 경우 스킵 체인으로 폴스루하거나, 최소한 Escape도 "아무 키" 스킵으로 동작하도록 조정.
- 나머지는 MINOR/NOTE로 블로킹 아님 — 인트로 대비는 실기기 재확인 권장이나 머지를 막을 사유는 아님.
