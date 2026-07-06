# PROGRESS — GOTY Phase 2: 시작과 끝 (Title · Pause · Credits)

플랜: tasks/plan-goty2-title-end.md · 구현 완료 · 2026-07-05

## 변경 사항

### index.html (+20)
- `#pause-btn`(⚙) — HUD, mute-btn 바로 다음 (index.html:77)
- `#pause` 오버레이 — 계속 걷기 / 소리 / 화질 / 처음부터 다시(.danger) / 조작 안내 / 가이드 링크 (index.html:141–153)
- `#credits` 전용 풀스크린 레이어 + `#credits-scroll` + `#credits-skip` (index.html:155–159)

### styles.css (+156)
- `#intro` 반투명 스크림: linear-gradient rgba(236,226,196,.9→.62→rgba(199,179,138,.78)) + backdrop blur 2.5px (styles.css:42–50)
- `.intro-inner > *` 순차 페이드인 nth-child 5단계, `prefers-reduced-motion`이면 전부 생략 (styles.css:62–76)
- `#pause-btn` — mute-btn과 같은 양피지 버튼 언어 (styles.css:301–317)
- `.pause-inner` — card-inner와 같은 양피지 카드, 버튼 세로 스택, `.pause-opt` 양피지 보조 버튼, `.danger` 붉은 테두리 (styles.css:790–837)
- `#credits` (z-index 40, rgba(12,12,18,.94), opacity 트랜지션 1.2s) + `.cr-title/.cr-head`(금박 #d8b45a) `.cr-line`(상아 #efe6cf) `.cr-verse` `.cr-end`, Nanum Myeongjo (styles.css:839–901)
- 모바일 미디어쿼리: `#pause-btn` 우측 이동, `.pause-inner` 패딩 축소 (styles.css:964–965)

### js/main.js (+191/−12)
- **keydown** (main.js:1565–1573): 최상단 `if (credits) skipCredits()`, 그 다음 `Escape → togglePause()`, 그 다음 `if (paused) return`
- **pointerdown** (main.js:1590): `if (credits) return`; 게이트에 `|| paused` (main.js:1600)
- **save 스키마** (main.js:1663): `creditsShown: false, quality: 'auto'` 기본값 추가
- **start-btn** (main.js:1787): `cam.yaw = atan2(camera−player)` — 타이틀 궤도를 이어받아 홱 돌지 않음
- **일시정지 섹션** (main.js:1811–1888): `paused`, `canPause()`(started && !modal && !voyage && !finale && !eclipse && !sleepFx && !sitting && !waterWalk && !netsRide && !leapFx && !flowBusy — 전부 grep으로 실존 확인), `togglePause()`, `toggleMute()` 공용화(HUD mute-btn과 pause-sound 라벨 동기), 화질 3단 순환 `applyQuality()`(high→usePost=true+fpsGate.done, lite→usePost=false+fpsGate.done, auto→세션 중 유지) + 부팅 시 `applyQuality(save.quality)`, 처음부터 다시 2단 확인(3초, localStorage 삭제+reload)
- **epilogue-close** (main.js:2246–2252): 14곳 완주 && !save.creditsShown → creditsShown 저장 + `startCredits()`
- **크레딧 섹션** (main.js:2260–2343): SITES에서 DOM 생성(타이틀·열네 곳·말씀·길 위의 동행·지은 도구·`save.name || '이름 없는 순례자'`·요 21:22·"끝 — 그리고 시작."), rAF가 translateY를 H → H/2−콘텐츠높이로 45s 선형 구동, 끝 3s 홀드 후 페이드아웃, 클릭/아무 키 스킵, HUD 숨김·복원, reduced-motion이면 즉시 끝 화면+탭 닫기
- **musicMode** (main.js:3801–3802): `credits → 'finale'` (paused보다 위), `paused → 'silent'`
- **카메라 분기** (main.js:3915–3919): 최우선 `if (!state.started)` — 반경 24, 높이 7.5, 각속도 0.045로 플레이어 주위를 도는 타이틀 시선
- **게이트**: 이동(main.js:3833) `!paused && !credits`; boardOn(4014)·sailMode(4019)·sitSpot(4030) `!paused`; promptOn(4038–4040) `!paused && !credits`; rAF에 `if (credits) updateCredits(dt)` (3911)
- **오디오 덕킹** (main.js:4329): `(state.modal && !finale && !voyage) || paused`

## PLAN DEVIATION

1. **save.quality 부팅 적용 위치**: 플랜은 "fpsGate 선언부 근처"(main.js:190)를 지목했으나 `save`가 main.js:1656에야 선언되므로 일시정지 섹션의 `applyQuality(save.quality)`(main.js:1866)에서 적용. 동작 동일(첫 프레임 전 실행됨).
2. **keydown에 `if (paused) return` 추가**: 플랜엔 Escape 처리만 명시. 없으면 일시정지 중 E/M 키가 메뉴 뒤에서 방문·지도 전환을 일으키므로 최소 안전 가드로 추가.
3. **epilogue-close에서 크레딧 시작 시 기존 toast 생략**: z-40 크레딧 아래(토스트 z-25) 어차피 안 보임 — return으로 생략. 재방문 닫기 때는 기존 toast 그대로.
4. **pause-opt 클래스**: 플랜 HTML에 없던 스타일 훅(소리·화질 버튼 양피지 스타일용). 마크업 외 변화 없음.
5. **금박 색**: 어두운 배경 위 --gold(#b8902e)는 대비가 죽어 밝힌 톤 #d8b45a 사용 (플랜의 "--gold 계열" 허용 범위).

## 셀프체크 결과 (플랜 검증 목록)

1. ✅ 타이틀: 스크림 뒤로 세계가 보이고 천천히 회전(스크린샷 2장 비교로 확인), 텍스트 가독 유지, 콘솔 오류 0
2. ✅ 시작 클릭: cam.yaw 인계 코드 + 시작 직후 카메라가 플레이어 뒤에 안착한 스크린샷 확인 (홱 돌기는 정지화면으론 판정 불가 — 수식상 각도 연속)
3. ✅ Esc → 일시정지 열림·재입력 시 재개 (브라우저에서 확인); 덕킹·'silent'는 코드 경로 (audio.js MODE_GAIN.silent=0 기확인)
4. ✅ 카드 열림 + Esc → 안 열림: canPause()의 `!state.modal` 게이트 (코드 경로 — 헤드리스에서 카드 열기까지 도보 이동은 생략)
5. ✅ 화질 3단 순환 실측: 자동→풍성하게→가볍게→자동, localStorage `quality:'lite'` 저장 확인
6. ✅ 처음부터 다시: 1클릭 → '정말 처음부터? (한 번 더)', 3.4s 후 라벨 복원 실측 (실제 삭제·리로드는 저장 보존 위해 미실행 — reset-link와 동일 코드)
7. ✅ 크레딧: window.startCredits 임시 노출로 육안 확인(28줄 생성, 금박/상아 렌더, HUD 숨김), 클릭 스킵 → 페이드아웃·HUD 복원 실측. **임시 노출 제거 완료** (grep TEMP-DEBUG → 없음, 리로드 후 typeof window.startCredits === 'undefined' 확인)
8. ✅ 모바일 375×812: pause 메뉴 풀폭 스택·⚙ 우측 이동·크레딧 중앙 정렬 스크린샷 확인
- ✅ node --check: main.js OK, audio.js OK · curl /, /index.html(-L), /styles.css, /js/main.js 전부 200

## 참고

- 헤드리스 프리뷰 브라우저가 rAF를 2.5fps로 스로틀 → dt 캡(0.05) 때문에 크레딧이 실측상 느리게 굴렀음. 게임 전체가 같은 dt 누적 방식이므로 실브라우저 60fps에선 의도한 45초. 버그 아님.
- 미완 항목 없음.
