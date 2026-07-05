# PLAN — GOTY Phase 3: 게임필 (PlayStation-grade Traversal Feel)

## 목표

인섬니악(스파이더맨)급 "손맛": 무게 있는 가속·감속, 달리기 FOV 킥, 몸의
기울임, 카메라 뱅크, 부드러운 팔다리 전환, 숨쉬는 대기 자세. 전부
js/main.js 안에서 (+~90줄), 다른 파일 무변경.

관상적 게임이므로 **절제**가 원칙: 모든 효과는 "느껴지되 보이지 않게".
점프·전투 등 새 verb는 추가하지 않는다 — 걷기 자체를 좋게 만든다.

## 변경 명세 (전부 js/main.js)

### 1. 이동 관성 (momentum)
현재 (3739-3754): 입력 → 즉시 `spd * dt` 이동. 이를 속도 벡터로:
```js
// 3646 근처 상태 추가
const ACCEL = 26, DECEL = 18;      // m/s² — 시작은 민첩하게, 멈춤은 반 발짝 미끄러지듯
let velX = 0, velZ = 0;
```
이동 블록 재구성:
- 목표 속도 `tx = dirX * spd`, `tz = dirZ * spd` (입력 없으면 0).
- `velX += (tx - velX) * Math.min(1, dt * (moving > 0.01 ? ACCEL : DECEL) / spdMax)` 형태보다
  명시적 가속 클램프가 예측 가능: 프레임당 `dv = clamp(target - vel, ±rate*dt)`,
  rate = 입력 있으면 ACCEL, 없으면 DECEL. (spd 자체가 걷기 7.5/달리기 13.5로
  변하므로 target에 반영됨.)
- 위치 갱신은 기존 nx/nz·isWalkable·collide·keepAwayFromCross 체인을 그대로
  쓰되 `dirX * spd * dt` → `velX * dt`로 치환. **벽에 막혀 nx가 거부되면
  해당 축 vel을 0으로** (벽에 대고 미는 관성 잔류 방지).
- `moving`은 이제 입력 크기, `speedNow = Math.hypot(velX, velZ)`를 별도로 두고
  걷기 애니(walkPhase·bob·먼지·발소리)는 **speedNow 기준**으로 구동:
  `walkPhase += dt * (4 + (speedNow / SPEED) * 9) * …` — 멈추는 반 발짝에도
  다리가 따라오게. 발소리·bob 게이트는 `speedNow > 0.8`.
- player.rotation.y(3754)는 입력이 있을 때만 입력 방향으로, 없으면 유지.
- **컷신·모달 진입 시** (`state.modal || voyage || finale || sitting || paused` 게이트로
  이동 블록을 건너뛸 때) velX/velZ를 0으로 리셋 — 카드 닫자마자 미끄러지는 것 방지.
- 물 위 걷기 'walk' 페이즈: 관성 그대로 적용 (동일 코드 경로라 자동).

### 2. 달리기 FOV 킥
```js
// 카메라 lerp 직후 (≈3852 camera.lookAt 근처)
const fovGoal = 55 + (running && speedNow > SPEED ? 7 : 0) + (voyage ? 3 : 0);
if (Math.abs(camera.fov - fovGoal) > 0.05) {
  camera.fov += (fovGoal - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
}
```
resize 핸들러(4240)와 충돌 없음 (fov는 건드리지 않으므로).
finale/chartView 중에는 fovGoal 55 고정 (running이 이미 false).

### 3. 몸의 기울임 (body lean)
달릴 때 몸통이 진행 방향으로 살짝 숙는다:
```js
// 3765 팔다리 블록 뒤
const leanGoal = sitting ? 0 : Math.min(0.16, speedNow * 0.012);
playerLean += (leanGoal - playerLean) * Math.min(1, dt * 6);
player.rotation.x = playerLean;
```
`let playerLean = 0` 상태 추가. ※ player.rotation.x를 다른 데서 쓰는지 grep으로
확인 — 쓰면 몸통 메시(robe 등 상위 그룹)에만 적용하는 대안 선택.

### 4. 카메라 뱅크 (bank)
회전(yaw 변화율)에 따라 지평선이 아주 살짝 기운다:
```js
// camera.lookAt(lookTarget) 직후
const yawRate = angleDelta(cam.yaw, prevCamYaw) / Math.max(dt, 0.001); // rad/s
prevCamYaw = cam.yaw;
bankLerp += (THREE.MathUtils.clamp(-yawRate * 0.02, -0.035, 0.035) - bankLerp) * Math.min(1, dt * 5);
camera.rotateZ(bankLerp);
```
`angleDelta`는 기존 angleLerp 옆에 최단각 차 헬퍼로 추가 (없으면).
chartView·finale에서는 bank 목표 0. 0.035rad(2°) 상한 — 멀미 방지.

### 5. 팔다리 스윙 부드럽게 + 숨쉬는 대기
- 3756: `const swing = …` 즉시 0↔0.62 스냅 → `swingLerp += ((speedNow > 0.4 ? 0.62 : 0) - swingLerp) * Math.min(1, dt * 8)`.
- 대기(speedNow < 0.4, !sitting) 때 미세한 숨:
  ```js
  const breath = Math.sin(t * 1.6) * 0.02;
  armL.rotation.x = -Math.sin(walkPhase) * swingLerp * 0.8 + breath;
  armR.rotation.x = Math.sin(walkPhase) * swingLerp * 0.8 + breath;
  ```
  (다리엔 breath 없음 — 서 있는 발이 흔들리면 이상함.)
- bob(3790)도 speedNow 비율로: `Math.abs(Math.sin(walkPhase)) * 0.1 * Math.min(1, speedNow / SPEED)`.

### 6. 걷기 먼지 (가벼운 버전)
현재 달리기만 먼지(3767). 걷기에도 옅게: dustTimer 주기를
`running ? 0.16 : 0.5`로 통일하고 게이트를 `speedNow > 3`으로. dustAt에 세기
인자가 없으면 그대로(빈도 차이만으로 충분).

## 제약

- 수치는 명세값으로 시작하되, 구현자가 브라우저에서 직접 보고 ±30% 내
  조정 가능 (조정 시 progress 로그에 최종값 기록).
- 모든 효과는 `prefers-reduced-motion`과 무관 (3D 게임 본질) — 단 bank와
  FOV 킥은 파라미터 하나로 끌 수 있게 상수로 뽑아둔다 (`FEEL = { fovKick: 7, bankMax: 0.035 }`).
- 기존 컷신(voyage/finale/waterWalk stumble·rescue/netsRide/leapFx)의 각본된
  카메라·위치 코드는 절대 건드리지 않는다. 관성은 자유 보행 블록에만.
- 성능: 새 rAF 작업은 산술 연산뿐 — 오브젝트 생성 금지 (벡터 재사용).

## 검증 (구현자 셀프체크)

1. `npx serve` → 콘솔 오류 0.
2. W 홀드→릴리즈: 반 발짝 미끄러지며 정지, 다리가 따라 멈춤 (스냅 없음).
3. Shift 달리기: FOV 넓어지고, 해제 시 부드럽게 복귀.
4. 좌우 드래그로 급회전: 지평선 미세 기움(2° 이하), 정지 시 수평 복원.
5. 카드 열고 닫기: 닫은 직후 미끄러짐 없음 (vel 리셋).
6. 배 탑승(waterWalk boarding)·항해·피날레 진입/복귀 정상 (각본 카메라 무간섭).
7. 대기 10초: 팔이 미세하게 숨쉼, 다리 정지.
8. 모바일 조이스틱(devtools 터치 에뮬)에서 관성·먼지 정상.

## 산출물

- 코드: js/main.js
- 로그: tasks/progress-goty3.md
