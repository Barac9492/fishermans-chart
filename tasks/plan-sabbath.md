# PLAN — sabbath-pack: 앉기 · 발의 등불 · 들의 백합

참고: `tasks/scout-sabbath.md` (path:line 근거). 대상 파일: `js/main.js` 단독 (CSS/HTML 변경 없음).
스타일: 기존 코드의 한국어 주석·명명 관행을 따를 것. save 객체 변경 없음. 커밋 금지 (오케스트레이터가 한다).

## A. 앉기 (쉼)

### 쉼터 정의
```js
const REST_SPOTS = [
  { x: 10, z: 120, gate: 'first-fire',  label: '🔥 불가에 앉기' },
  { x: 27, z: -141, gate: 'second-fire', label: '🔥 불가에 앉기' },
  { x: 44, z: 100, gate: 'gethsemane',  label: '🌿 감람나무 아래 앉기' },
];
```
- `gate`: 해당 표지가 **visited일 때만** 앉기 프롬프트가 뜬다 (이야기 먼저, 쉼은 그 후).
- 근접 판정 반경 5.

### 시편 구절 (앉을 때마다 무작위 1개)
```js
const REST_VERSES = [
  '“여호와는 나의 목자시니 내게 부족함이 없으리로다.” (시 23:1)',
  '“가만히 있어 내가 하나님 됨을 알지어다.” (시 46:10)',
  '“나의 영혼아 잠잠히 하나님만 바라라.” (시 62:5)',
  '“여호와께서 그의 사랑하시는 자에게는 잠을 주시는도다.” (시 127:2)',
];
```

### 상태 머신
- `let sitting = null; // { t, spot, versed, starred }`
- `sitDown(spot)`: sitting 생성, `cam.dist = 22` (기존 11 — smoothDist가 알아서 서서히 멀어짐).
- `standUp()`: sitting=null, `cam.dist = 11`, `hideCaption()` (자막이 떠 있으면).
- `updateSitting(dt)` (animate에서 `if (sitting)`):
  - t += dt
  - t ≥ 5 && !versed: versed=true, `showCaption(무작위 REST_VERSES)` — 4.5초 뒤 hideCaption (setTimeout)
  - t ≥ 20 && !starred: starred=true, `spawnShootingStar()`

### 앉은 자세 (기존 프레임별 덮어쓰기 지점에 통합 — 중요)
- 다리: walk 블록의 `legL.rotation.x = ...` 라인들을 `sitting`이면 `legL.rotation.x = legR.rotation.x = 1.4`로.
- 팔: 같은 방식으로 `sitting`이면 `armL.rotation.x = armR.rotation.x = 0.55`.
- 몸 낮추기: `player.position.y = (moving...) - waterWalkSink` 라인을 sitting이면 `-0.38`로.
- 이동 차단: 움직임 블록 조건에 `&& !sitting` 추가.

### 프롬프트 통합 (boardOn/sailMode 블록과 같은 자리)
- `sitMode` 계산: `!sitting && !state.modal && !voyage && !finale && !waterWalk && !flowBusy` 이고, REST_SPOTS 중 dist<5 && markerById[gate].visited 인 스팟.
- 우선순위: boardOn > sailMode > (미방문 flow/near 프롬프트) > **sitMode** > 재방문 프롬프트.
  즉 near가 있고 `!near.visited`면 기존 로직 우선, 그 외에 sitMode가 있으면 sit 라벨 표시.
- `tryVisit()`에서 `state.sitMode`면 `sitDown(spot)` 후 return (boardMode/sailMode 뒤, near 처리 앞).
- 앉는 순간 visit-btn 숨김: promptOn 조건에 `&& !sitting`.

### 일어나기 (입력 가드 체인)
- keydown: `if (sitting) { standUp(); return; }` — sleepFx 체크 **다음**, waterWalk 스킵 체크 앞.
- pointerdown: 동일 위치에 추가. (onUi 체크보다 앞 — 화면 아무 곳이나 탭하면 일어남. 단, 버튼 UI 탭은 일어나기만 하고 버튼도 동작해도 무방.)

### 별똥별
```js
function spawnShootingStar() { ... }
```
- sparkTex 재사용, 흰빛(SpriteMaterial color 0xeef2ff), scale (7, 0.5) 스트릭.
- 시작점: player 기준 하늘 (player + (rnd(-60,60), 90+rnd(0,30), rnd(-80,-20))), 속도 (−45~−65, −18, 15) 방향 임의 좌/우.
- 수명 1.3s, 페이드아웃. sparks 배열 재사용 말고 전용 `shootingStars` 배열 + updateShootingStars(dt) (animate 훅).

## B. 발의 등불 (시 119:105)

- 램프 메시: player 그룹에 부착 — 손 위치 (0.55, 1.62, 0.28) local: 작은 상자(0.16, 0.2, 0.16, 색 0x4a3a28) + 그 위 불꽃 콘(0.09, 0.18, 색 0xffc860, MeshBasicMaterial).
- 광원: `new THREE.PointLight(0xf5c878, 0, 14, 2)` player에 부착 y=2.
- 판정(매 프레임): `lampTarget = (duskW < 0.35 && player.position.z > 60 && onHolyLand(x,z)) ? 1.4 : 0`
  - z > 60 조건이 갈릴리의 밤(긴 밤 warmthOverride)과 로마를 배제한다.
- `light.intensity += (lampTarget - intensity) * min(1, dt*2)`; 램프 메시 visible = intensity > 0.05; 불꽃 스케일 일렁임 (sin(t*11)).
- 첫 점등 시 1회(세션 플래그 `lampSeen`): `showCaption('“주의 말씀은 내 발에 등이요 내 길에 빛이니이다.” (시 119:105)')` + 4초 뒤 hideCaption. 단 state.modal/컷신 중이면 자막 생략(플래그만 세움).

## C. 들의 백합 (마 6:28)

- 생성 (풀 무더기 블록 461-483 관행을 따라, 그 근처에 새 블록):
  - 갈릴리 들판 산포: 중심 후보 ~14곳을 임의 산포 (x -50..55, z -200..-95), `onHolyLand` && 호수에서 거리 >8 && 길 중심선에서 대충 떨어짐(정확할 필요 없음).
  - 각 중심에 꽃 5~9송이: 줄기(가는 초록 십자 쿼드 h~0.5) + 꽃머리(작은 팔각 원판 CircleGeometry 0.09, 색은 [0xf3f0e4, 0xe8c95a, 0xb87ac8, 0xe08a9b] 중 임의).
  - 전부 geometry 병합이되 **색은 vertex color**(geometry별 setAttribute color 후 merge, material vertexColors:true) 또는 색별로 4개 메시로 병합 — 구현 단순한 쪽 선택.
- 탭: 각 중심에 투명 히트박스(2.4×2×2.4) → `tapTargets.push`, `userData.lilyToy = true`.
- handleTap의 roosterToy 케이스 옆에:
  ```js
  if (ud.lilyToy) {
    toast(LILY_LINES[lilyIdx++ % LILY_LINES.length], 5500);
    return;
  }
  ```
  ```js
  const LILY_LINES = [
    '🌸 “들의 백합화가 어떻게 자라는가 생각하여 보라 — 수고도 아니하고 길쌈도 아니하느니라.” (마 6:28)',
    '🌸 “솔로몬의 모든 영광으로도 입은 것이 이 꽃 하나만 같지 못하였느니라.” (마 6:29)',
    '🌸 “오늘 있다가 내일 아궁이에 던져지는 들풀도 이렇게 입히시거든, 하물며 너희일까 보냐.” (마 6:30)',
  ];
  ```
- **카운터·저장·수집 없음.** 볼 때마다 그냥 말씀 한 줄.

## 검증 (implementer가 할 것)
1. `node --check js/main.js` 통과.
2. 코드 트레이스 셀프 체크: (a) 앉는 중 이동 차단 확인 경로, (b) 긴 밤(warmthOverride) 중 갈릴리에서 램프 안 켜지는 조건 확인, (c) sit 프롬프트가 미방문 표지 프롬프트를 가리지 않는지 우선순위 로직 재확인.
3. 파일 끝에 TEMP TEST HOOK 추가(오케스트레이터가 브라우저 검증 후 제거한다):
   ```js
   // TEMP TEST HOOK — 검증 후 제거
   window.__t = {
     tick: animate, s: state, markers, player,
     go: (x, z) => player.position.set(x, 0, z),
     visit: tryVisit, sit: () => sitting, cam,
     chart: (id) => chartSite(markerById[id], { silent: true }),
     lamp: () => lampLight.intensity, stars: () => shootingStars.length,
   };
   ```
4. `tasks/progress-sabbath.md` 작성: 구현 내역, 통합 지점(라인), 검증 결과, PLAN DEVIATION(있다면).

## 금지
- save 객체·localStorage 변경, 기존 기능 리팩터, CSS/HTML 수정, 커밋/푸시.
