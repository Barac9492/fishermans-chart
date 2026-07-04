# PROGRESS — sabbath-pack: 앉기 · 발의 등불 · 들의 백합

계획서: `tasks/plan-sabbath.md` · 대상: `js/main.js` 단독 (+8/−215줄 순증 215). 커밋 안 함.

## 구현 내역 (파일: js/main.js, 라인은 구현 후 기준)

### A. 앉기 (쉼)
- `REST_SPOTS`(3067) / `REST_VERSES`(3072) / `let sitting`(3077) / `sitDown`(3079, cam.dist=22) / `standUp`(3083, cam.dist=11 + hideCaption) / `updateSitting`(3088: t≥5 시편 자막 4.5s, t≥20 별똥별) — updateSparks 뒤 새 섹션.
- 별똥별: `shootingStars` 배열 + `spawnShootingStar`(3103, sparkTex 재사용, 흰빛 0xeef2ff, scale 7×0.5, 수명 1.3s 페이드) + `updateShootingStars`(3117), animate 훅 4004.
- 앉은 자세: walk 블록 프레임별 덮어쓰기에 통합 — 다리/팔 1.4/0.55 (3622), `player.position.y = -0.38` (3643), 이동 차단 `&& !sitting` (3599).
- 프롬프트: `sitSpot` 계산(3791–3799, gate visited && dist<5 && !sitting && !modal && !voyage && !finale && !waterWalk && !flowBusy) → `state.sitMode`. promptOn에 `|| sitSpot`와 `&& !sitting` 추가(3800). 라벨 우선순위: boardOn > sailMode > 미방문 flow/near > sitSpot.label > 다시 읽기 (3805–3815).
- `tryVisit()`: boardMode/sailMode 뒤, near 처리 앞에 `if (state.sitMode) { sitDown(...); return; }` (1724).
- 일어나기: keydown 가드(1489, sleepFx 다음·waterWalk 앞), pointerdown 가드(1510, 동일 위치·onUi 앞).

### B. 발의 등불 (시 119:105)
- 램프 메시 `lampG`(1148–1159, player 부착, 상자 0x4a3a28 + 불꽃 콘 0xffc860) + `lampLight` PointLight(0xf5c878, 0, 14, 2, y=2)(1161–1163) + `lampSeen`(1164).
- 매 프레임(3743–3757, 하늘 블록 뒤): `lampTarget = (duskW<0.35 && z>60 && onHolyLand) ? 1.4 : 0`, dt*2 lerp, visible>0.05, 불꽃 sin(t*11) 일렁임, 첫 점등 자막 1회(모달/컷신 중엔 플래그만).

### C. 들의 백합 (마 6:28)
- `LILY_LINES`(591) + `lilyIdx`(596) + 생성 블록(597–655, 풀 무더기 블록 바로 뒤): 중심 후보 14곳 산포(x −50..55, z −200..−95), onHolyLand && 호수 변까지 >8 && 갈릴리 길 중심선 >3 필터. 중심마다 꽃 5–9송이(십자 줄기 h 0.4–0.6 + 팔각 원판 0.09, 4색 팔레트) — vertex color로 단일 메시 병합(vertexColors:true).
- 중심마다 투명 히트박스 2.4×2×2.4 → tapTargets, `userData.lilyToy`(647). `handleTap` 케이스(1766): toast 순환, 카운터/저장 없음.
- TEMP TEST HOOK: 4115–4122 (오케스트레이터가 브라우저 검증 후 제거).

## 검증 결과
1. `node --check js/main.js` → 통과.
2. 코드 트레이스: (a) 이동 블록 `!sitting` + 앉은 중 keydown/pointerdown은 standUp 후 return → 이동 차단 확인. (b) 긴 밤 warmthOverride로 duskW<0.35이어도 갈릴리는 z<−95 → `z>60` 실패, 로마는 onHolyLand 실패 → 램프 안 켜짐. (c) sitSpot 계산에 `!(nearOpen && !near.visited)` 게이트 → 미방문 표지 프롬프트를 가리지 않고, tryVisit의 sitMode 체크와 표시 라벨이 일치.
3. 브라우저 스모크(serve :5173, 콘솔 에러 0):
   - 시작 → chart('first-fire') → go(10,121): 라벨 "🔥 불가에 앉기", state.sitMode 세팅, 램프 intensity 1.4 도달.
   - visit(): sitting 생성, cam.dist 22, y=−0.38, visit-btn 숨김, 5s 뒤 시편 자막 표시·페이드, smoothDist 22로 수렴 중 확인.
   - sit().t를 19.6으로 fast-forward: starred=true, shootingStars=1 확인 (실시간 t≥20 경로도 동일 코드).
   - keydown(W): 즉시 기립, cam.dist 11, y=0.
   - go(−6,−118) 갈릴리: 램프 0으로 감쇠, sitMode null (미방문 long-night 근처).
   - 테스트로 생긴 localStorage save는 프리뷰에서 제거함.

## PLAN DEVIATION
- 없음. (사소한 해석 1건: 계획 47행의 우선순위 "미방문 near 우선"을 라벨뿐 아니라 `state.sitMode` 계산에도 반영 — 미방문 near가 있으면 sitMode를 null로 두어 tryVisit(계획 48행 순서)과 표시가 항상 일치하게 함. 검증 항목 (c)를 만족시키기 위한 최소 구현.)

## 남은 것
- TEMP TEST HOOK 제거(오케스트레이터 몫). 그 외 미완 없음.
