# PLAN — GOTY Phase 5: 탈-로우폴리 고품질 패스 (Fidelity Pack)

## 목표

사용자 지시: "로우폴리에 매일 필요 없다 — 아트를 바꾸고 업그레이드하라."
방향은 **손으로 칠한 성화(painterly icon)**: 부드러운 음영 + 물리 기반
하늘/반사 + 재질의 깊이. 포토리얼이 아니라, 지금의 파치먼트·모자이크
정체성을 더 높은 해상도로.

네 기둥: ① 물리 하늘(Sky addon)+시간대별 PMREM ② 호수 평면 반사(Water
addon, high 전용) ③ 베드로 V2(부드러운 조각 실루엣) ④ 땅·건물 재질 심화.

**퍼포먼스 게이트**: 기존 quality 시스템(main.js:2091 applyQuality)에 통합 —
- `lite`: G5 전부 OFF (현재 렌더 유지)
- `auto`: ①③④ ON, ② OFF (fpsGate 통과 시에도 반사는 high 전용)
- `high`: 전부 ON

## 현황 (path:line)

- PMREM: main.js:196-197 — `scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04)`
  고정 1회. importmap이 `three/addons/`를 제공하므로 Sky/Water addon 추가
  import 가능 (main.js:8 참조 패턴).
- 하늘: setSky 캔버스 그라디언트(111) + 해/달/별/구름/능선 스프라이트.
- 물: seaWater/lakeWater(391-411) — Standard, vertexColors(G4), 정점 파도.
- 캐릭터: player 그룹 1159+ — G4에서 디테일 추가됨. 애니 코드는 legL/legR/
  armL/armR/player.rotation 참조 → **메시 객체는 유지하고 geometry/material만
  교체**하면 애니 무손상.
- 품질: save.quality + applyQuality(2091), fpsGate(4151).

## 변경 명세 (전부 js/main.js — import 2줄 + ~300줄)

### ① 물리 하늘 + 시간대별 환경맵
1. `import { Sky } from 'three/addons/objects/Sky.js';`
2. Sky 메시 1개(scale 4000), 유니폼을 duskW로 구동하는 `applySkyState(w)`:
   - 해 고도: w 0.85→고도 18°(아침), 0.5→6°(어스름), 0.35→2°, w<0.3→Sky 숨김
   - turbidity 6, rayleigh w>0.5 ? 1.6 : 3.2(노을 붉게), mieCoefficient 0.004
   - **밤(w<0.3)**: Sky.visible=false, 기존 캔버스 하늘이 그대로 밤을 맡는다.
     낮/밤 전환은 기존 setSky 곡선과 같은 lerp 상수(듀레이션)로 자연 크로스.
   - 기존 setSky 캔버스는 유지하되 낮에는 Sky 뒤에 가려짐(캔버스 돔이 Sky보다
     안쪽 반경이면 z 충돌 — 구현자: 캔버스 하늘 반경/renderOrder 확인 후
     Sky를 그 바깥 or 캔버스 돔 opacity를 dayK로 낮추는 쪽 선택).
3. **시간대별 PMREM 3장 프리베이크**(로드 시 1회): applySkyState(0.85/0.5/0.15)
   상태의 Sky만 있는 임시 씬에서 `pmrem.fromScene(skyScene)` — day/dusk/night
   텍스처 3장 저장. animate에서 duskW 구간이 바뀔 때만 `scene.environment`
   교체(프레임당 아님, 히스테리시스 0.05). RoomEnvironment(197)는 폴백
   (lite 모드에서 유지).
4. 해 스프라이트/헤일로(G4)는 낮에 Sky의 해와 겹침 — dayK 높을 때 스프라이트
   opacity를 절반으로 (Sky 원반이 주인공).

### ② 호수 평면 반사 (high 전용)
1. `import { Water } from 'three/addons/objects/Water.js';`
2. 캔버스 노멀맵 생성 `makeWaterNormals()`: 256×256, 다층 사인/노이즈 높이장
   → 소벨로 노멀 인코딩(RGB), RepeatWrapping.
3. lakeWater만 교체 (sea는 유지 — 반사 2패스 비용): quality 'high'일 때
   기존 lakeWater.visible=false, Water 메시(같은 크기·위치, textureWidth 512)
   추가. sunDirection은 sun.position 정규화로 매 지역 전환 시 갱신,
   waterColor는 COLORS.lake, distortionScale 1.8.
4. applyQuality에 훅: high→반사 ON / auto·lite→기존 물. 전환은 리로드 없이
   visible 스왑.
5. 물 위 걷기(waterWalk) 씬과의 상호작용: Water 메시는 시각 전용, 판정 무관
   (기존 판정은 좌표 기반) — 회귀 확인만.

### ③ 베드로 V2 — 조각 실루엣
기존 메시 객체 유지, geometry/material만 in-place 교체:
1. **로브**: CylinderGeometry → **LatheGeometry** 프로필(어깨 0.42 → 허리 0.5
   → 밑단 0.85로 흐르는 곡선, 24세그먼트, smooth normals). 재질
   MeshStandardMaterial(robe색, roughness 0.85) — flatShading 제거.
2. **클록**: ConeGeometry → LatheGeometry(등이 부풀고 밑단이 살짝 벌어지는
   곡선), DoubleSide 유지. G4 트림/여밈선 위치 재정렬.
3. **머리**: 세그먼트 24×20으로 상향, 피부 재질 roughness 0.6. 수염:
   반구를 턱 곡선에 맞게 scale(1, 1.15, 0.9), smooth.
4. **팔다리**: Box → CapsuleGeometry(둥근 사지, 8세그). G4 손/샌들 child 유지
   (부모 메시 객체 불변이므로 자동).
5. **NPC 소폭 동반 상향**: 목자·요한 로브만 LatheGeometry 재사용(같은 빌더
   함수로 추출) — 얼굴 등 추가 디테일은 하지 않는다.
6. flatShading을 캐릭터에서만 제거 — 세계(건물 등)의 각진 맛은 유지하되…

### ④ 땅·영웅 건물 재질 심화
1. **땅**: extrudeLand topMat을 MeshStandardMaterial로 상향(map 유지,
   roughness 1, metalness 0) + `makeGroundNormal()` 캔버스 노멀맵(모래 결,
   sandTex와 같은 1/24 타일링). G4 틴트 오버레이는 무변경.
2. **영웅 건물만 smooth**: 바실리카 돔(1056)·드럼(1052) 세그먼트 상향
   (돔 32×20) + Standard 재질(석회암, roughness 0.7) — 금 십자가는
   metalness 0.9/roughness 0.25로 진짜 금속 반응(PMREM이 살려줌).
3. 가버나움 현무암 집들·기타 프롭은 불변 (스타일 대비 유지 + 예산).
4. 그림자: sun.shadow.radius = 4 (부드러운 가장자리, PCFSoft 확인 —
   renderer.shadowMap.type 확인 후 필요시 PCFSoftShadowMap).

## 제약

- import는 importmap 경유 addons만 (새 CDN/의존성 금지).
- 애니메이션 참조 메시 객체(legL 등)·player 그룹 구조 불변 — geometry/
  material 교체만.
- G4 산출물(틴트·포말·스카이라인·헤일로) 무변경. 단 ①-4의 해 스프라이트
  감쇠는 허용.
- walkable/충돌/파도 루프/렌더 패스(bloom 등) 불변.
- 프리베이크 PMREM은 로드 시 1회(3장) — 프레임당 fromScene 금지.
- 시작 로드 시간 +300ms 이내 목표 (PMREM 3장이 주 비용 — 128 해상도면 충분).
- 주석 한국어 문체.

## 검증 (구현자 셀프체크)

1. node --check + 콘솔 오류 0 (lite/auto/high 세 모드 각각 리로드).
2. 스크린샷: (a) 갈릴리 아침 — Sky의 해·하늘 그라데이션, (b) 어스름 길 —
   노을 rayleigh, (c) 예루살렘 밤 — 기존 밤하늘 유지 확인, (d) high 모드
   호수 반사(하늘·배가 물에 비침), (e) 베드로 클로즈업 — 곡선 로브·둥근
   사지, (f) 바실리카 — 금 십자가 반짝임.
3. 물 위 걷기 진입(3번 사이트) 회귀 — high 모드에서.
4. 품질 3단 전환 즉시 반영(리로드 없이) + 저장.
5. 로드 시간 체감 회귀 없음 (PMREM 128 확인).
6. 모바일 뷰포트(375px) + lite에서 이전과 동일 렌더 확인.

## 산출물

- 코드: js/main.js
- 로그: tasks/progress-goty5.md
