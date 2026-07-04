# REVIEW — sabbath-pack (앉기 · 발의 등불 · 들의 백합)

대상: `js/main.js` 워킹트리 diff (+215/-8, unstaged). 계획: `tasks/plan-sabbath.md`. 구현 기록: `tasks/progress-sabbath.md`.

`node --check js/main.js` 통과 확인. 커밋 없음, CSS/HTML 무변경, save/localStorage 신규 기록 없음 — 계획서 금지사항 위반 없음 확인. TEMP TEST HOOK(js/main.js:4115-4122)은 계획서 스펙과 정확히 일치.

## Findings (심각도 순)

### 1 (Minor/Cosmetic) — 앉기 자막과 등불 첫점등 자막이 동일 엘리먼트를 공유, 드문 레이스로 서로 잘릴 수 있음
`js/main.js:3092` (`updateSitting` t≥5 시편 자막) vs `js/main.js:3752-3757` (등불 첫점등 자막) — 둘 다 `voyageCaptionEl`을 직접 쓰고 각자 독립된 `setTimeout(hideCaption, …)`을 건다. `hideCaption()`은 전역 함수라 "누가 띄운 자막인지" 구분하지 않는다.
- 실패 시나리오: 게토세마네에서 앉아 쉬며(감람나무 아래 앉기, gate 이미 방문 후) t=5s에 시편 자막이 뜬 그 순간, 마침 그 프레임에 등불이 처음 켜지는 조건(`lampTarget>0 && !lampSeen`)이 동시에 만족되면 등불 자막이 시편 자막 텍스트를 덮어쓰고 자신만의 4000ms 후 `hideCaption`을 또 예약 — 두 개의 `hideCaption` 타이머가 경쟁하며 자막이 예정보다 일찍 잘리거나 내용이 바뀐다.
- 실제 플레이에서는 `lampSeen`이 첫 방문 스토리 컷신(예: `first-fire`/`gethsemane` flow, 둘 다 `state.modal=true`) 중에 이미 소비될 공산이 커서(등불 로직 자체는 `state.modal`과 무관하게 매 프레임 돌고 `lampSeen` 플래그도 모달 중에 세팅됨, `js/main.js:3752-3753`) 재현 빈도는 낮음. 크래시/조작 불가 없음 — 자막 텍스트가 잠깐 어긋나는 수준.
- 권고: `sitting`/`lampSeen` 캡션에 각각 소유권 토큰(예: 마지막으로 캡션을 띄운 소스 id)을 두거나, `hideCaption`이 "누가 요청했는지"를 확인하도록 최소 가드 추가. 출시를 막을 이슈는 아님.

### 2 (Note, no fix needed) — `sitSpot` 계산의 `!(nearOpen && !near.visited)` 가드는 현재 지오메트리상 항상 참이라 사실상 죽은 코드
`js/main.js:3790-3796`. REST_SPOTS 세 곳(첫/두 번째 불, 겟세마네)의 5유닛 반경 안에서는 `near`(8유닛 이내 최근접 표지) 스캔 결과가 항상 그 쉼터의 `gate` 표지 자신으로 수렴한다 — 실측: `first-fire`(10,120)에서 다음으로 가까운 표지는 `pentecost`(2,110)로 거리 12.8, `second-fire`(27,-141)에서 `three-questions`(31,-152)로 11.7, 둘 다 `near`가 5유닛 sit 반경 안에서 역전될 수 없는 거리. 즉 `sitSpot`이 세팅될 때 `near === markerById[gate]`이고 `gate`는 정의상 이미 `visited`이므로 `nearOpen && !near.visited`는 항상 거짓. 버그는 아니고 실패 시나리오도 없음(가드가 무해하게 항상 통과) — 다만 구현자가 "미방문 표지 프롬프트를 가리지 않는다"는 계획 조건을 만족시키려 방어적으로 추가했다는 설명(PLAN DEVIATION 섹션)과 달리 그 조건은 마커 배치상 애초에 발생 불가능한 케이스였다는 점만 기록해 둔다. 장래에 표지 좌표를 REST_SPOTS 반경(5) + 8 이내로 재배치하면 이 가드가 실제로 필요해진다.

### 3 (Note) — 등불이 예루살렘행 도로 초입(z 60–88 구간)에서도 켜짐, "예루살렘 성벽 안"이 아니라 "다가가는 길"부터 켜지는 넓은 판정
`js/main.js:3744-3745`, `regionWarmth()` (`js/main.js:1471-1477`). z=60~88 구간은 `regionWarmth`의 도로 블렌드 구간이라 dusk 값이 이미 0.35 밑으로 내려갈 수 있음(z=60에서 duskW≈0.23) — 계획 문구("z > 60 조건이 갈릴리의 밤과 로마를 배제한다")는 만족하지만, "예루살렘의 밤길"이라는 의도보다 판정 범위가 넓어 성벽 진입 전 개활지에서도 등불이 켜진다. 게임적으로 이상하지 않고(어두워지며 다가가는 연출), 계획서가 명시적으로 금지한 범위도 아니라서 결함으로 채점하지 않음 — 의도 확인 차 기록.

## 검증한 것 (구현자 progress.md 주장 재확인)
- 이동 차단: `js/main.js:3599` `!sitting` 조건, keydown/pointerdown 모두 `sitting`이면 최상단에서 `standUp()` 후 return(`1489`, `1510`) — 이 두 경로가 유일한 입력 진입점이라 앉아있는 동안 `tryVisit`/`handleTap`/조이스틱/룩드래그 전부 도달 불가. 즉 컷신(voyage/waterWalk/eclipse/sleepFx/finale) 시작 경로(`startVoyage`/`startWaterWalk`/`startEclipse`/`startSleep`/`startFinale`)는 전부 `tryVisit()` 또는 카드-닫기 버튼(모달 필요) 경유라 앉은 상태에서 진입 불가 — 확인됨, 우려했던 "앉은 채 컷신 시작" 경로 없음.
- `cam.dist` 복원: `standUp()`이 유일한 세팅 해제 지점(`sitting=null; cam.dist=11`)이고 위 이유로 다른 경로로 세션이 끊길 수 없어 복원 누락 시나리오 없음.
- 등불 z>60/onHolyLand 판정: 갈릴리 긴 밤(z≈-118, `warmthOverride` 0.1~0.5)에서 z>60 실패로 항상 꺼짐, 로마(`ROME_LAND` x -260~-198, `onHolyLand`와 별개 폴리곤)에서 `onHolyLand` 실패로 항상 꺼짐 — 좌표 계산으로 직접 검증 완료.
- 백합: `mergeGeometries` 대상 지오메트리 전부 `paint()`로 동일하게 `color` 속성 부여 후 병합 — 속성 불일치로 인한 병합 실패 없음. 히트박스(2.4×2×2.4)는 갈릴리 들판(z -95~-200)에만 생성되어 뜰의 수탉 히트박스(13,116.5, 6번 곁)와 좌표상 절대 겹치지 않음 — `tapTargets` 순서 문제 없음. 메시 수: 병합 1개 드로우콜 + 최대 14개 투명 히트박스 — 성능 영향 미미.
- 프롬프트 우선순위: `promptOn`/라벨 코드가 `boardOn > sailMode > 미방문 near > sitSpot > 다시읽기` 순서를 그대로 구현, `tryVisit()`의 조건문 순서와 일치 — 미방문 표지 프롬프트를 가리는 경로 없음.

## 판정: SHIP

