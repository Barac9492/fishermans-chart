# REVIEW — adoption-pack (무음 양 신호 · 목자 지역 힌트 · 인도자 가이드)

리뷰 대상: 워킹 트리 미커밋 diff (index.html, js/main.js, styles.css, guide.html 신규)
계획: tasks/plan-adoption.md / 구현 기록: tasks/progress-adoption.md

## 검증 방법
- `node --check js/main.js` 직접 재실행 → OK.
- `js/sites.js`를 Node ESM으로 직접 import해 SITES 14개 전 항목에 num/title/dates/verse/question 필드 누락 없음 확인.
- guide.html의 부록 12줄을 js/main.js LOST_SHEEP_LINES와 육안 대조 (완전 일치).
- js/main.js의 updateLostSheep/updateShepherdBubble 전체 블록 라인 단위로 재독해 (기존 코드와 스코프 확인).
- grep으로 save 스키마 변경 여부, 커밋 여부, --ink-soft 변수 존재 여부 확인.

## Findings

없음 — 심각도 상/중 findings 없음. plan의 모든 항목이 명세대로 구현되었고, 아래 리스크 후보들은 실제 검증 결과 문제 없음으로 확인됨:

1. **(기각) A — s.baa 페이드 블록이 `if (d<15)` 밖에 있어 매 프레임 재생성되는 것처럼 보임**
   `js/main.js:2937` `if (s.baa) { ... }` 블록은 `if (d<15)` 블록 밖에 있지만 for-loop 안(양당 1회/프레임)이며, 생성은 `s.baa`가 null일 때만(`!s.baa`, line 2927) 일어나므로 재생성이 아니라 opacity lerp만 매 프레임 수행. 15유닛 밖으로 나가면 이 블록이 target=0으로 정상 페이드아웃시킴 — plan 의도(멀어지면 사라짐)와 일치. 실패 시나리오 없음.

2. **(기각) B — `shepherdBubbleState`가 최초 숫자(-1)에서 문자열 키로 바뀌는 타입 불일치**
   `let shepherdBubbleState = -1` → 이후 `'ask'`/`'done'`/`'hint:...'`와 비교. `!==` 느슨한 비교가 아닌 엄격 비교라 `-1 !== 'ask'`는 항상 true이므로 최초 1회는 반드시 텍스처가 생성됨. 이후 키가 실제로 바뀔 때만 재생성 — 매 프레임 재생성 없음. 문제 없음.

3. **(기각) B — SHEEP_REGIONS 순서가 LOST_SHEEP_SPOTS 실제 그룹핑과 어긋날 가능성**
   `LOST_SHEEP_SPOTS`의 주석(갈릴리 물가 0-3 / 가이사랴 4 / 요단 5-7 / 예루살렘 8-10 / 로마 11)과 `SHEEP_REGIONS` 배열이 인덱스별로 정확히 일치. `save.sheep.includes(i)`로 첫 미발견 인덱스를 찾는 루프도 `save.sheep`가 `collectSheep`에서 `push(s.i)`로 채워지는 실제 인덱스 배열임을 확인했으므로 로직 정확.

4. **(기각) C — guide.html의 sites.js import 시 정적 서버 MIME/경로 이슈**
   index.html이 이미 동일 패턴(`<script type="module" src="./js/main.js">`)으로 배포 중이므로 서버 설정 문제 없음. Node ESM 직접 import로도 SITES 14개, 필드 5종 모두 정상 로드 확인. `question` 필드의 멀티라인 템플릿 리터럴도 `norm()`의 `\s+→' '` 정규화로 올바르게 처리됨(텍스트 노드로 안전하게 append).

## 계획서 준수 확인
- save/localStorage 스키마 변경 없음 (grep 결과 0건).
- 기존 기능 리팩터 없음 — diff는 순수 추가(insertion)만, 기존 로직 삭제/변경은 shepherdBubbleState 조건문 확장(계획서 명시 허용 범위) 뿐.
- 커밋 없음 (`git status`상 전부 modified/untracked, 커밋 없음).
- guide.html에 SITES 데이터 복제 없음 (import 사용), 목자의 열두 말씀만 예외적으로 정적 복사 — 계획서 예외 조항과 일치.
- TEMP TEST HOOK: `window.__t = { tick: animate, s: state, save, player, sheep: lostSheep, go, shepText }` — 계획서 스펙과 완전히 동일. 오케스트레이터 제거 필요 항목으로 progress 파일에 명시됨.
- `.guide-link` 배치(start-btn 아래, rule-bottom 위)와 스타일(14px, ink-soft, dotted underline) 계획서와 일치.

## 판정
**SHIP**
