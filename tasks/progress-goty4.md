# PROGRESS — GOTY Phase 4: 화가의 붓 (Art-Direction Pack)

## 결과: 완료 (플랜 4기둥 전부 구현, js/main.js만 수정, +251/-5줄)

## 변경 내역 (전부 js/main.js)

### ① 지역 색 스크립팅
- `makeRegionTint()` main.js:495-573 — 256×768 캔버스. 요단 붉은 황토 스파인
  (destination-out으로 남북 끝 소멸) → 갈릴리 따뜻한 모래 워시 → 호숫가
  초록기 스트로크(66px 소프트 + 34px 본띠 ≈ 8유닛) → 새벽 바닷가 장밋빛 금
  → 예루살렘 석회암 워시 → 명암 얼룩 6개.
- 오버레이 메시 main.js:574-591 — MAIN_LAND/LAKE 도형을 **y 반전**으로 만들고
  `rotateX(-π/2)`로 법선을 위로. ShapeGeometry UV(도형 좌표 그대로)에
  `repeat(1/116, 1/368)` + `offset(0.5, 163/368)`. y=0.02, Lambert transparent,
  depthWrite:false + polygonOffset(-2,-2), receiveShadow.
- 로마 땅 무변경.

### ② 베드로 실루엣 (player 그룹, 기존 메시 재구성 없음)
- 두건(mantle) main.js:1231-1238 — 반구 셸 0x6b7e78(COLORS.mantle 신설,
  main.js:42), rotation.x -0.45, **scale.x 0.9** (정면에서 귀처럼 삐져나오던
  것 수정), castShadow.
- 클록 밑단 트림 토러스 + 등 세로 여밈선 박스 — 같은 woodDark라 **한 메시로
  머지** main.js:1239-1247, castShadow.
- 머리채 반구 캡(0x4a4038) main.js:1248-1254, 눈 2알 **한 메시로 머지**
  (COLORS.ink) main.js:1255-1261.
- 샌들 2개 — legL/legR의 child main.js:1272-1277 (스윙 자동 추종).
- 손 스피어 2개 — armL/armR의 child main.js:1285-1290 (회전 자동 추종).
- castShadow는 두건·트림만 (플랜대로).

### ③ 물가 — 깊이 그라디언트 + 포말선
- seaWater/lakeWater 재질: `color: 0xffffff, vertexColors: true`
  main.js:397/408 — 원래 색은 정점에 굽는다 (이중 곱 방지).
- `distToPoly` + `bakeShoreColors` main.js:414-441 — 빌드 타임 1회, 물가
  0~6유닛 +20% 밝게. lake←LAKE, sea←MAIN_LAND.
- 기존 호수 거품 띠(main.js:593)를 `lakeFoam`으로 참조화하고, 갈릴리 서안
  (x=-58, z -160~-104) 포말선 `seaFoam` 추가 main.js:614-626.
- 숨쉬기: animate에서 opacity = 0.28+0.1sin / 0.16+0.1sin main.js:4381-4383.
- 파도 루프(4370-4380) 무변경.

### ④ 지평선 — 스카이라인 링 + 해 무리
- `ridgeTex` 캔버스 1장(랜덤워크 능선, 흰 실루엣) main.js:1487-1503 — 4방위
  스프라이트가 **공유** (거울상은 scale.x 음수, 높이는 scale.y 변주).
- `ridgeMat`(fog:false, 공유) + RIDGE_NIGHT 0x252c42 / RIDGE_DAY 0xa39781,
  sprite center (0.5,0) 하단 기준, renderOrder -9 main.js:1504-1521.
- `sunHalo` — radialSprite 재사용, additive, scale 360, renderOrder -10
  main.js:1523-1528.
- animate 합류 main.js:4185-4193: 매 프레임 player 기준 재배치(dir*700,
  y=-20 / 해무리 SUN_DIR*860), opacity는 chartUp이면 0으로, 색은
  lerpColors(밤↔낮, dayK) — 프레임당 신규 할당 0.

## PLAN DEVIATION
1. **포말선 재사용**: 호수 거품 띠가 이미 존재(이전 페이즈 산물, 플랜 미인지)
   — 새 리본을 겹치지 않고 기존 메시에 숨쉬기만 부여 (기본 0.28±0.1로, 기존
   0.4 고정 대비 급락 방지; 플랜 명세 0.16±0.1은 신규 seaFoam에 적용).
2. **새벽 워시 좌표**: 플랜의 "z≈-120 서안"이 아니라 실제 두 번째 불 위치
   (27,-141)에 장밋빛 금을 깔았다 — sites.js 실측 기준.
3. **능선 캔버스 1장 공유**: 플랜은 seed별 4장을 시사하나 텍스처 예산(≤3장)에
   맞춰 1장을 거울상·스케일로 변주.
4. **버그 수정 (구현 중 발견)**: MAIN_LAND는 첫 점이 마지막에 중복되는 닫힌
   폴리곤 → distToPoly의 0길이 선분에서 0나눗셈 → NaN이 정점색 전체 오염
   → 바다 검정 + 블룸 NaN 전파(전화면 흑화). len2<1e-9 스킵으로 해결
   (main.js:420-421).
5. **seaFoam 방향 버그 수정**: PlaneGeometry(56,0.7)이 동서로 누워 해변을
   가로지르는 흰 사선이 됨 → (0.7,56)으로 남북 방향 수정 (main.js:616).

## 셀프체크 (헤드리스 브라우저, :5173)
- `node --check` (mjs 복사) 통과, 콘솔 오류 0 (title→start→플레이 전 구간).
- **스크린샷 (a) 갈릴리 물가**: 호수 얕은 물 밝은 림 + 포말선 + 물가 초록기
  확인. 북쪽 지평선에 능선 스카이라인이 겹겹이 보임 — 최고의 컷.
- **스크린샷 (b) 베드로 앞/뒤 클로즈업**: 앞 — 눈·수염·두건 테두리 확인,
  뒤 — 머리채 캡·두건 셸·클록 확인. (첫 컷에서 두건이 귀처럼 보여
  scale.x 0.9 + 기울기 조정, 여밈선이 콘 표면에 묻혀 두께 0.07로 조정.)
- **스크린샷 (c) 지평선 + 해 무리**: 동쪽 모압 능선 + 해 주위 광륜 + 물가
  형상 블룸(quality high 강제로 포스트 파이프라인 정상 확인).
- **스크린샷 (d) 예루살렘 밤**: 능선이 진한 남색 실루엣으로 전환 ✓, 별 ✓,
  발의 등불 점등 + 자막 회귀 없음 ✓.
- **차트 뷰(M)**: 능선·해무리 소멸 ✓, 오버레이가 지도에서 지역감 부여 ✓,
  z-fight 없음 ✓, 호수/해안 얕은 림이 지도에서도 읽힘 ✓.
- **이동 회귀**: W 걷기 정상(-46.0→-46.7 이동, 먼지·카메라 추종 ✓), 걷기
  판정/충돌 코드 무변경(diff로 확인).
- **FPS 게이트**: 헤드리스 프리뷰는 rAF가 온디맨드(측정 ~0.4fps)라 게이트를
  의미 있게 측정 불가. 코드상 신규 비용은 프레임당 스프라이트 5개 재배치 +
  불투명도/색 lerp + 포말 2개 opacity뿐(할당 0), 정점색·캔버스는 전부 빌드
  타임 1회. quality='high' 강제로 블룸 경로 정상 동작 확인 후 'auto' 원복.
- 검증용 임시 window.__dbg는 제거 완료 (grep 0건).

## 예산
- 신규 메시/스프라이트 15/15 (오버레이 1, seaFoam 1, 인물 8, 능선 4, 해무리 1)
- 신규 캔버스 3/3 (tint, ridge, halo) · 프레임당 신규 할당 0

## 남은 것
- 없음. (능선 봉우리가 다소 뾰족해 피라미드처럼 읽히는 각도가 있음 — 로우폴리
  화풍과는 일관, 원하면 랜덤워크 스텝을 부드럽게 조정 가능.)
