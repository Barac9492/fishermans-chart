# PLAN — GOTY Phase 2: 시작과 끝 (Title · Pause · Credits)

## 목표

게임의 "액자"를 완성한다: 살아있는 타이틀 화면, 일시정지 메뉴(설정 포함),
그리고 완주 후 크레딧 롤. 새 파일 없음 — index.html / styles.css / js/main.js.

## A. 살아있는 타이틀 (Title backdrop)

현재 `#intro`는 불투명(`background: var(--sand)`)이라 뒤의 3D 세계가 안 보인다.
`animate()`는 시작 전에도 돌고 있다 (main.js:3715, 무조건 rAF).

1. **styles.css**: `#intro` 배경을 반투명 스크림으로:
   ```css
   #intro { background: linear-gradient(165deg, rgba(214,197,161,.88), rgba(214,197,161,.55) 55%, rgba(180,158,120,.75)); backdrop-filter: blur(2.5px); }
   ```
   (정확한 색은 기존 `--sand` 변수에서 rgba로 파생 — 텍스트 가독성 유지가 우선,
   구현자가 실제로 보고 알파 조정 가능, 본문 대비 4.5:1 이상 유지.)
2. **styles.css**: `.intro-inner`의 자식들에 순차 페이드인 — `.intro-inner > *`에
   `opacity 0 → 1` keyframes, `animation-delay: calc(var(--i) * 0.12s)` 방식이
   아니라 간단히 nth-child 딜레이 4~5단계면 충분. `prefers-reduced-motion`이면
   생략.
3. **js/main.js 카메라**: `animate()`의 카메라 분기(≈3815, `if (finale) … else if
   (chartView) … else`)에 **최우선 분기** 추가:
   ```js
   if (!state.started) {  // 타이틀: 갈릴리 새벽 물가를 아주 천천히 도는 시선
     const a = t * 0.045;
     _camPos.set(player.position.x + Math.sin(a) * 24, 7.5, player.position.z + Math.cos(a) * 24);
     _lookGoal.set(player.position.x, 2.5, player.position.z);
   } else if (finale) { …
   ```
   시작 버튼을 누르면 기존 카메라 로직이 자연히 lerp로 이어받는다 (camK lerp가
   이미 부드럽게 처리). 시작 직후 `cam.yaw`를 현재 카메라 방위에 맞춰 세팅해
   화면이 홱 돌지 않게 한다: start 핸들러에서
   `cam.yaw = Math.atan2(camera.position.x - player.position.x, camera.position.z - player.position.z)`.
4. 시작 전에는 HUD·visit-btn 등이 이미 hidden이므로 추가 게이트 불필요 —
   단, 시작 전 `duskW`가 갈릴리 값(0.85)으로 적용되는지 확인 (플레이어 시작
   위치가 갈릴리면 자동).

## B. 일시정지 메뉴 (Pause)

1. **index.html**: HUD에 `⚙` 버튼(`#pause-btn`, mute-btn 옆), 그리고 오버레이:
   ```html
   <div id="pause" class="overlay hidden">
     <div class="pause-inner">
       <h2>잠시 쉬어가기</h2>
       <button id="pause-resume">계속 걷기</button>
       <button id="pause-sound">소리: 켬</button>
       <button id="pause-quality">화질: 자동</button>
       <button id="pause-restart" class="danger">처음부터 다시</button>
       <p class="pause-controls">W A S D 걷기 · Shift 달리기 · E 방문 · M 지도 · Esc 쉬기</p>
       <p class="guide-link"><a href="./guide.html" target="_blank">인도자용 나눔 가이드 →</a></p>
     </div>
   </div>
   ```
2. **styles.css**: `.pause-inner` — 카드(.card-inner)와 같은 양피지 언어로,
   버튼 세로 스택, `.danger`는 붉은 테두리. 기존 변수/폰트 재사용.
3. **js/main.js**:
   - `let paused = false;` + `togglePause()` — 허용 조건:
     `state.started && !state.modal && !voyage && !finale && !eclipse && !sleepFx && !sitting && !waterWalk && !netsRide && !leapFx && !flowBusy` (존재하는 플래그만 — grep으로 확인).
   - keydown 핸들러(1565): 컷신 skip 체인 **앞에** `if (e.code === 'Escape') { togglePause(); return; }`
     단 paused 상태에선 Escape가 resume. (INPUT 가드는 기존 첫 줄이 처리.)
   - 이동 게이트(3734)에 `&& !paused`, 방문/조이스틱 게이트류(3915/3931/3940 등
     `state.started && !state.modal …` 조건들)에는 **paused가 modal처럼 굴게**
     하는 게 안전 — 각 조건에 개별 추가 대신, `togglePause()`에서
     `state.modal = paused`로 세우는 방법은 카드 로직과 충돌 위험이 있으므로
     **개별 `!paused` 추가**를 원칙으로 한다 (이동 3734 · visit-btn 3915 ·
     board/sail 3920 · sit 3931 · nearOpen 3940 · pointerdown 1595 → `state.modal || paused`).
   - 오디오 덕킹(4229): `ducked: (state.modal && !finale && !voyage) || paused`.
   - 음악(4223 근처 musicMode — G1이 이미 넣음): paused면 `'silent'` 반환 추가.
   - **소리 버튼**: 기존 mute 로직 재사용 (`audio.setMuted`, save.muted, HUD
     mute-btn 라벨도 동기화). 라벨 '소리: 켬/끔'.
   - **화질 버튼**: 3단 순환 자동→풍성하게→가볍게. `save.quality`('auto'|'high'|'lite')
     저장. 적용: high → `usePost = true; fpsGate.done = true;` lite →
     `usePost = false; fpsGate.done = true;` auto → 재부팅 시 게이트에 맡김
     (세션 중 auto 선택 시엔 현재 상태 유지, 라벨만 '자동'). 부팅 시
     save.quality를 읽어 적용하는 코드도 추가 (fpsGate 선언부 근처).
   - **처음부터 다시**: 클릭 1회 → 라벨 '정말 처음부터? (한 번 더)'로 3초간
     확인 대기, 재클릭 시 localStorage 키 삭제 + `location.reload()`.
     (인트로의 기존 reset-link 1745와 같은 동작 — 그 코드 참조.)
   - pause-btn 표시: HUD와 함께 (게임 시작 후 항상). 컷신 중 togglePause가
     거부되면 무시 (토스트 불필요).

## C. 크레딧 롤 (Credits)

1. **index.html**:
   ```html
   <div id="credits" class="hidden">
     <div id="credits-scroll"></div>
     <p id="credits-skip">탭하여 건너뛰기</p>
   </div>
   ```
   `#credits`는 overlay가 아닌 전용 풀스크린 레이어 (z-index 40, 어두운 배경
   rgba(12,12,18,.94)).
2. **styles.css**: `#credits-scroll`은 `position:absolute; left:0; right:0;
   text-align:center;` — JS가 `transform: translateY()`를 rAF로 직접 구동
   (CSS 애니메이션 대신 — 스킵·길이 제어가 쉬움). 금박 제목(`--gold` 계열,
   기존 변수 확인) + 상아색 본문, Nanum Myeongjo. 섹션 스타일:
   `.cr-title`(크게), `.cr-head`(작은 금박 소제목), `.cr-line`(본문),
   `.cr-verse`(이탤릭 인용).
3. **js/main.js**:
   - 콘텐츠는 코드에서 생성 (SITES 재사용):
     1. 타이틀: "어부의 지도" + 부제 + 🐟
     2. "열네 곳의 참된 장소들" — `SITES.map(s => s.num + '. ' + s.title + ' — ' + s.dates)` (제목만, 간결하게)
     3. "말씀" — 누가복음 · 마태복음 · 마가복음 · 요한복음 · 사도행전 · 시편
     4. "길 위의 동행" — 잃은 양 열두 마리 · 목자 · 요나의 물고기 · 어린 양
     5. "지은 도구" — Three.js · Web Audio API · 그리고 종이 대신 빛
     6. "이 지도를 걸은 사람" — `save.name || '이름 없는 순례자'`
     7. 마지막 정지 화면(스크롤 끝에 3초 홀드): "너는 나를 따르라" — 요한복음 21:22, 그리고 "끝 — 그리고 시작."
   - `startCredits()`: `credits = { t: 0, dur: ~45 }` 플래그, DOM 생성, 페이드인.
     rAF 본루프에서 `if (credits) updateCredits(dt)` — translateY를
     화면높이 → -콘텐츠높이로 선형 이동, 끝나면 페이드아웃 후 정리.
   - 스킵: `#credits` 클릭 또는 아무 키 → 즉시 페이드아웃 (keydown 체인 최상단
     `if (credits) { skipCredits(); return; }` — Escape 처리보다 먼저).
   - **트리거**: `epilogue-close` 클릭 핸들러(2161)에서
     `if (state.visitedCount === SITES.length && !save.creditsShown) { save.creditsShown = true; persistSave(); startCredits(); }`
     — save 스키마에 `creditsShown:false` 기본값 추가 (1659).
   - 이동 게이트에 `&& !credits`, pointerdown 게이트에도 credits 시 조기 return
     (스킵 처리로 흡수됨).
   - **음악**: musicMode()에 `if (credits) return 'finale';` (paused보다 위).
     덕킹 조건은 credits가 modal이 아니므로 그대로.
   - 크레딧 중 HUD 숨김: `#hud`에 `.hidden` 토글 (끝나면 복원).

## 제약

- 기존 오버레이/카드의 시각 언어(양피지·금박·붉은 인장)를 재사용 — 새 미감 금지.
- 새 의존성·이미지 파일 금지. 전부 DOM+CSS.
- 인트로 텍스트/문안은 **바꾸지 않는다** (배경·모션만).
- `prefers-reduced-motion: reduce`면 인트로 스태거·크레딧 자동 스크롤 대신
  크레딧은 즉시 표시 후 탭으로 닫기 (updateCredits에서 dur 0 취급).
- 기존 플래그명이 플랜과 다르면 grep으로 실제 이름을 확인해 맞춘다.

## 검증 (구현자 셀프체크)

1. `npx serve` → 타이틀: 뒤에서 세계가 천천히 돌고, 텍스트 가독성 유지, 콘솔 오류 0.
2. 시작 클릭 → 카메라가 홱 돌지 않고 플레이어 뒤로 부드럽게 안착.
3. Esc → 일시정지 열림·이동 정지·앰비언스 덕킹, Esc 재입력 → 재개.
4. 카드 열린 상태에서 Esc → 일시정지 안 열림.
5. 화질 버튼 3단 순환 + 새로고침 후 유지 (localStorage 확인).
6. 처음부터 다시: 2단 확인 후 저장 삭제·리로드.
7. 크레딧: localStorage에서 `charted`를 14개로 채우는 것은 복잡하므로, 콘솔에서
   `startCredits()`를 임시 노출해 육안 확인하거나 코드 경로 검증 + 스킵 동작 확인.
   (임시 노출 코드는 검증 후 제거.)
8. 모바일 뷰포트(좁은 화면)에서 pause 메뉴·크레딧 레이아웃 확인.

## 산출물

- 코드: index.html, styles.css, js/main.js
- 로그: tasks/progress-goty2.md
