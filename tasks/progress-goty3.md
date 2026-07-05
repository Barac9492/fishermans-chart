# PROGRESS — GOTY Phase 3: 게임필 (Traversal Feel)

## 결과: 완료 (js/main.js 단독, +61 / -18)

## 구현 내역

### 1. 이동 관성 (plan §1)
- 상태 추가 (`const SPEED` 옆): `ACCEL = 26, DECEL = 18`, `velX/velZ`,
  `playerLean`, `swingLerp`, `bankLerp`, `prevCamYaw`, `FEEL = { fovKick: 7, bankMax: 0.035 }`.
- 이동 블록: 목표 속도 `tx/tz = dir * spd`, 프레임당 `clamp(target - vel, ±rate*dt)`
  (입력 시 ACCEL, 무입력 시 DECEL). 위치 갱신은 기존
  isWalkable → collide → keepAwayFromCross 체인 유지, `dirX*spd*dt` → `velX*dt`.
- isWalkable 거부 시 해당 축 vel = 0 (벽에 대고 미는 관성 잔류 방지).
- `player.rotation.y`는 입력 있을 때만 갱신 (기존과 동일).
- **게이트 확장**: 이동 게이트가 false일 때(else 분기) `velX = velZ = 0` 리셋.
  게이트는 G2에서 이미 `!paused && !credits` 포함 —
  `state.started && !state.modal && !voyage && !finale && !sitting && !paused && !credits`.
- `speedNow = Math.hypot(velX, velZ)` — 걷기 애니·bob·먼지·발소리 전부 speedNow 기준.
- waterWalk의 각본 페이즈(boarding/stumble/rescue/return)는 `state.modal = true`로
  이동 게이트가 이미 꺼지므로 관성 개입 없음을 코드로 확인. 'walk' 페이즈는
  동일 경로라 관성 자동 적용 (계획 의도대로).

### 2. 달리기 FOV 킥 (plan §2)
- `camera.lookAt(lookTarget)` 직후: `freeCam = state.started && !finale && !chartView`.
  `fovGoal = freeCam ? 55 + (running && speedNow > SPEED ? FEEL.fovKick : 0) + (voyage ? 3 : 0) : 55`.
  타이틀 궤도(!state.started)·차트·피날레는 55 고정 — G2 타이틀 분기 무간섭.
- resize 핸들러(fov 불변)와 충돌 없음.

### 3. 몸의 기울임 (plan §3)
- `player.rotation.x` 전역 grep: player 루트에 쓰는 곳 없음 (ghostJohn·메시 로컬뿐)
  → 계획 1안대로 player 루트에 적용. `leanGoal = sitting ? 0 : min(0.16, speedNow * 0.012)`,
  dt*6 lerp.

### 4. 카메라 뱅크 (plan §4)
- `angleDelta(a, b)` 헬퍼를 angleLerp 옆에 추가 (최단각 차).
- yawRate = angleDelta(prevCamYaw, cam.yaw) / dt, bank 목표
  `clamp(-yawRate * 0.02, ±FEEL.bankMax)` — freeCam 아닐 때 0. `camera.rotateZ(bankLerp)`
  는 매 프레임 lookAt 뒤라 누적 없음.

### 5. 팔다리 스윙 + 숨 (plan §5)
- `swing` 즉시값 → `swingLerp` (목표 0.62/0, dt*8). 대기 숨 `sin(t*1.6)*0.02`는
  팔에만 (다리 제외, 계획대로).
- bob: `abs(sin(walkPhase)) * 0.1 * min(1, speedNow / SPEED)` 연속 스케일.
- 발소리 게이트 `speedNow > 0.8`.

### 6. 걷기 먼지 (plan §6)
- 게이트 `speedNow > 3`, 주기 `running ? 0.16 : 0.5`. 먼지 위치는 dirX(입력) 대신
  `velX/speedNow` (미끄러질 때도 진행 방향 뒤에 떨어짐, 나눗셈은 게이트로 안전).

## 최종 수치 (튜닝 없이 명세값 유지)
ACCEL 26 · DECEL 18 · fovKick 7 · bankMax 0.035 · lean max 0.16 (speedNow*0.012) ·
swing lerp dt*8 · breath 1.6Hz/0.02 · dust 0.16/0.5s @ speedNow>3 · step gate 0.8

## PLAN DEVIATION (경미)
- 먼지 위치 기준을 입력 방향(dirX)에서 속도 방향(velX/speedNow)으로 변경 —
  입력이 없어도 관성으로 미끄러지는 동안 dirX=0이라 제자리에 먼지가 찍히는
  버그를 피하기 위함. 할당 없음(스칼라 연산).
- 뱅크 적용 범위를 "chartView·finale에서 0"에서 "타이틀 궤도(!state.started) 포함
  중립"으로 확장 — G2 타이틀 궤도 카메라 무간섭 지시 반영.

## 검증
1. `node --check` (cp → .mjs): SYNTAX_OK.
2. :5173 라이브 브라우저(preview): 리로드 → 콘솔 오류 0.
3. 시작 후 W 2초 홀드→릴리즈, Shift 달리기 2초·3초, 드래그 급회전(포인터 이벤트),
   M 차트 토글 왕복 — 전 구간 콘솔 오류 0.
4. 스크린샷 2장 비교: 달리기로 큰 변위 확인(관성 이동 작동), 정지 시 지평선 수평
   (뱅크 복원)·캐릭터 직립(lean 감쇠) 확인.
5. 컷신 무간섭은 코드 확인: voyage/finale는 이동 게이트·freeCam에서 제외,
   waterWalk 각본 페이즈는 state.modal로 게이트 차단 + 카메라 코드 무변경.
6. FOV 수치의 픽셀 단위 확인은 모듈 스코프라 콘솔 접근 불가 — 코드 경로는
   달리기 시나리오로 실행되었고 오류·시각 이상 없음. (디버그 훅 미주입 원칙 준수)

## 남은 것
- 없음. 모바일 조이스틱은 moveInput() 동일 경로라 코드상 동등 — 실기 터치
  에뮬 정밀 확인은 리뷰어 재량.
