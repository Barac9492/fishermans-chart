# REVIEW — GOTY Phase 5: 탈-로우폴리 고품질 패스 (Fidelity Pack)

리뷰 대상: `git diff` (js/main.js, +302/-30), tasks/plan-goty5-fidelity.md,
tasks/progress-goty5.md (6개 편차 로그). `node --check` 통과 확인, `__g5dbg` 잔존
없음 확인.

## findings (severity 내림차순)

### MAJOR — js/main.js:643-657, 1512-1608, 1377-1397 (편차 5) — "lite: G5 전부 OFF" 계획 위반, 미검증 주장
`applyQuality`의 `lite` 분기는 Sky/skyDome/reflWater만 끄고, ③(캐릭터 lathe/capsule)
④(땅 Standard+노멀맵, 바실리카 Standard/32×20)는 **모드에 관계없이 항상 적용**되어
있다(편차 5에 스스로 명시). 그러나:
- 계획 13-16행은 명시적으로 "lite: G5 전부 OFF (현재 렌더 유지)"라 못박았고,
  검증 항목 6번도 "모바일 뷰포트 + lite에서 **이전과 동일 렌더** 확인"을 요구한다.
- 실제로는 `extrudeLand`의 topMat이 Lambert→**MeshStandardMaterial**(643-657)로
  영구 교체되어 `groundNormalTex`(647, 128² 캔버스, quality 게이트 없음)를 매
  타일 지형에 물린다. lite에서도 `scene.environment = roomEnv`(RoomEnvironment
  PMREM)가 여전히 켜져 있으므로(2349), Lambert였다면 받지 않았을 환경맵 반사가
  Standard 재질엔 실제로 걸린다 — "이전과 동일 렌더"가 아니라 **화질·비용 모두
  달라진 렌더**다.
- 진행 로그(item 6)는 "기존 캔버스 하늘 경로 그대로 렌더"만 확인했을 뿐, 땅/
  캐릭터/건물 재질이 lite에서도 Standard로 바뀐 사실은 검증표에 없다 —
  검증이 자신의 편차(5)를 실제로 커버하지 못했다.
- 실패 시나리오: 계획이 "lite=완전 이전 렌더"를 신뢰해 저사양 기기 정책을
  세우면, 실제로는 lite에서도 PBR 셰이딩(Standard) + 노멀맵 샘플링 +
  LatheGeometry(24seg)·CapsuleGeometry가 상시 적용되어 있어 기대한 만큼의
  여유가 나지 않는다. 개별 비용은 작지만 "lite=구형 렌더"라는 계약 자체가
  깨졌다는 점이 문제.
- 편차 자체(성능 손 안 댐)는 합리적 트레이드오프일 수 있으나, 계획 문구와
  검증 체크리스트 6번은 고쳐지거나 명시적으로 재승인받았어야 한다.

### MAJOR — js/main.js:2334-2358, 4414-4419 — fpsGate가 Sky/환경맵을 게이트하지 않음(자진 신고, 미해결)
`fpsGate`는 `usePost`(포스트프로세싱)만 끈다(4419). `auto` 모드에서 저사양
기기가 45fps 미달로 판정돼도 `skyOn`은 그대로 유지되어 Sky 풀스크린 셰이더
패스와 밴드 환경맵은 계속 돈다. 진행 로그의 "미완/주의"에 본인이 명시했듯
"fpsGate 실패 시 skyOn=false 폴백"은 **미적용** 상태로 남았다.
- 실패 시나리오: 구형 모바일에서 `auto`로 시작 → fpsGate가 4초 뒤 저사양
  판정 → 포스트만 꺼지고 Sky 패스는 계속 매 프레임 대기 산란 셰이더를 그린다
  → 계획이 의도한 "auto는 안전하게 성능을 낮춘다"는 안전망이 Sky 비용에
  대해서는 작동하지 않는다.
- 계획 자체가 "auto: ①③④ ON"이라 명시했으니 코드가 계획을 어긴 건 아니지만,
  실기기 성능 리스크가 실측 없이(프리뷰 rAF 스로틀로 측정 불가, 로그에도 명시)
  넘어갔다 — 라이브 기기 QA 전엔 SHIP 리스크로 남겨야 한다.

### MINOR — js/main.js:483-489, 4806-4820 — high 모드에서도 lakeWater 정점파도 루프가 매 프레임 계속 돈다
`applyQuality('high')`는 `lakeWater.visible = false`로 숨기지만, animate()의
정점 파도 갱신 루프(4806-4812, 21×21=441 정점 sin/cos 계산 + `needsUpdate`)는
가시성과 무관하게 매 프레임 무조건 실행된다. high 모드에서 리플렉션(Water)이
화면에 이미 그려지는 와중에, 화면에 안 보이는 lakeWater geometry도 계속
CPU에서 재계산되고 GPU 버퍼 업로드(`needsUpdate=true`)까지 발생한다.
- 실패 시나리오: high 모드로 장시간 플레이 시, 보이지도 않는 lakeWater의
  버텍스 441개 sin/cos 갱신 + attribute 재업로드가 매 프레임 낭비된다 —
  "per-frame cost / disposal on repeated quality cycling" 항목에서 요구한
  가시성 게이팅이 정점 애니메이션 루프에는 반영되지 않았다. 큰 임팩트는
  아니지만 리뷰가 명시적으로 물은 항목이라 표기.

### MINOR — js/main.js:570 — reflWater sunDirection 고정, 계획 문구("지역 전환 시 갱신") 미이행 + 미신고 편차
계획 56-57행은 "sunDirection은 sun.position 정규화로 **매 지역 전환 시 갱신**"을
요구했다. 실제 구현은 생성 시 1회 `(70,100,45).normalize()`로 하드코딩하고
갱신 코드가 없다. 결과적으로 버그는 아니다 — `sun.position`은 게임 전체에서
방향 오프셋이 절대 안 바뀌고(4584에서 `player.position + (70,100,45)`로 매 프레임
재설정되지만 방향 자체는 상수), 값도 정확히 같다. 하지만:
- 이 사실을 논리로 도출한 것이 아니라 우연히 맞아떨어진 것으로 보이고,
  progress.md의 "PLAN DEVIATION 목록" 6개 항목 중 **어디에도 이 편차가
  기록돼 있지 않다** — 리뷰 규칙상 "미신고 편차"는 그 자체로 지적 대상.
- 추가로 sunSprite/halo/Sky 방위각에 쓰는 `SUN_DIR`(0.55,0.5,0.42 정규화)과
  `sun.position`/`reflWater.sunDirection`(70,100,45 정규화)은 서로 다른
  방향(수평 성분 기준 약 10~15° 차이, 기존부터 존재하던 불일치)이다. 호수
  거울 반사의 스펙큘러 글린트 위치가 하늘의 해 원반·기존 sunGlint 스프라이트
  글린트 경로와 완전히 일치하지 않을 수 있다 — "high 모드 호수 반사"
  스크린샷 판정에서는 통과했다고 하니 육안 임팩트는 작다고 보이나, 원인은
  기록돼야 한다.

### NOTE — js/main.js:562-579 — Water 리플렉션 거리 컬링 없음(리뷰 요청 항목, 계획 미요구)
`reflWater`는 64×62 평면 하나로 프러스텀 컬링(Object3D 기본)에는 걸리지만
거리 기반 컬링/LOD는 없다. 플레이어가 호수에서 멀리 있어도 화면 안에
평면이 걸치면 Water의 리플렉션 FBO 렌더(추가 씬 패스)가 매 프레임 실행된다.
계획은 이를 요구하지 않았으므로 결함은 아니나, 리뷰 포커스가 명시적으로
요청한 항목이라 기록.

### NOTE — js/main.js:246 (기존 코드, 회귀 아님) — RoomEnvironment 임시 씬 미해제
`new RoomEnvironment()`(임시 Scene 서브클래스, 자체 geometry/material 보유)를
`pmrem.fromScene`에 넘긴 뒤 dispose 없이 버린다. `bakeSky`(248-258)는
`geometry.dispose()`/`material.dispose()`로 정리했지만 RoomEnvironment는 예전부터
(diff 이전 코드) 정리되지 않았다 — **이번 diff가 만든 회귀는 아님**(pre-existing),
플랜의 "temp scene/generator disposed?" 요구사항이 완전히는 충족되지 않았다는
사실만 기록. PMREMGenerator 자체(`pmrem.dispose()`, 259)는 올바르게 1회 처리됐다.

## 통과한 항목 (짚었으나 결함 없음)
- PMREM 히스테리시스 밴드 스왑: day/dusk/night 경계값이 방향별로 다르나(관대함
  0.05~0.1) 모두 유효한 이력현상이며 프레임당 `fromScene` 없음 — 확인됨.
- Sky 재질은 addons 기본값(`side:BackSide, depthWrite:false`)을 그대로 사용,
  renderOrder는 opaque/transparent 두 렌더 패스 사이에서 무의미하지만(Sky는
  opaque, skyDome/stars/sprite는 transparent) 실행 순서상 opaque→transparent라
  올바른 결과를 만든다. z-fight/오클루전 이상 없음.
- Water addon 가시성 스왑(`visible`)은 재질 재생성/리로드 없이 정상 동작,
  중복 인스턴스 생성 방지(`if (refl && !reflWater)`) 확인.
- 캐릭터 지오메트리 교체(Box→Capsule, Cone→Lathe): 다리/팔의 바운딩 스팬이
  translate 상수까지 동일하게 유지되어(y span [-0.925,0.025] 동일) 샌들/손
  child 위치, 눈 위치 전부 무손상 확인. 앉기 자세(legL/R.rotation.x=1.4)의
  로브 관통은 신 구 지오메트리에서 동일한 근사(허벅지 각도만큼 다리 메시가
  정적 로브를 뚫는 기존 문제)이며 신규 회귀 아님(신형 hem 반경 0.85 > 구형
  0.78이라 오히려 덜 파고든다).
- boot 순서: `lakeWater`/`sky`/`skyDome` 등 메시는 전부 top-level에서
  `applyQuality(save.quality)`(2358) 호출보다 먼저 생성됨 — 존재하지 않는
  메시를 만지는 경로 없음.
- save.quality 스키마 불변, applyQuality 반복 호출 멱등성 확인(같은 모드
  재호출 시 부작용 없음).
- eclipse는 CSS 오버레이(`eclipseEl.style.opacity`)로만 어둡게 하며 duskW/
  Sky 경로와 무관 — "eclipse near-0 warmthOverride"는 실제 코드에 존재하지
  않는 경로였음(warmthOverride는 long-night과 finale 랩만 사용, eclipse는
  `applyWarmth`를 호출하지 않는다). 리뷰 전제와 실제 코드가 다르다는 점만
  기록, 결함 아님.
- finale 골드 램프(0.35→0.75)·waterWalk(0.85→0.07 왕복) 구간 모두 Sky
  visible/uniform이 매 프레임 갱신되어 급격한 램프에도 안전.

## 검증 정직성
진행 로그의 라이브 브라우저 검증(스크린샷 a~f, 물 위 걷기 회귀, 품질 3단
전환, 로드 시간, 모바일 375px)은 실행됐다고 기술돼 있고 각 항목이 계획의
검증 리스트와 대응된다. 다만 "모바일+lite 이전과 동일 렌더" 확인은 하늘
경로만 짚었을 뿐 땅/캐릭터/건물 재질이 lite에서도 바뀐 사실은 검증표에서
누락(위 MAJOR #1과 동일 사안) — 검증이 자신의 편차 5를 실제로 커버하지
못했다.

## 결론

**FIX (아래 항목, SHIP 전 처리 권장)**
1. progress.md와 plan의 "lite: G5 전부 OFF" 문구 사이의 모순을 해소 —
   사용자/오너에게 편차 5(③④ 상시 적용)를 명시적으로 재승인받거나, 계획
   문구를 사실에 맞게 고치거나(권장: 후자, 비용이 실제로 미미하다면 계획을
   업데이트), lite 전용 폴백 재질 분기를 최소한으로 추가.
2. fpsGate 실패 시 `skyOn=false` 폴백 한 줄 추가(본인이 이미 제안한 해법) —
   최소한 실기기 QA 전까지 auto 모드의 저사양 안전망을 완성.
3. (선택, 낮은 우선순위) lakeWater 정점파도 루프를 `lakeWater.visible` 조건으로
   감싸 낭비 계산 제거.
4. progress.md의 PLAN DEVIATION 목록에 `sunDirection` 고정 편차를 추가 기록.

나머지(MINOR/NOTE)는 결함이라기보단 기록 누락·경미한 낭비이며 머지를 막을
정도는 아니다.
