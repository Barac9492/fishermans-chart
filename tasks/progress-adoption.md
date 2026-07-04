# PROGRESS — adoption-pack (무음 양 신호 · 목자 지역 힌트 · 인도자 가이드)

계획서: tasks/plan-adoption.md — 전 항목 구현 완료, 이탈 없음.

## 구현

### A. 무음 양 신호 (js/main.js)
- `lostSheep` 항목에 `baa: null` 필드 추가, 공유 텍스처 `let baaBubble = null`
  (첫 필요 시 `makeBubbleTexture('매애…')` 한 번만 생성).
- `updateLostSheep` 내: 플레이어가 15유닛 안에 처음 들어올 때 스프라이트 지연
  생성 (재질은 양마다, 텍스처 공유; 로컬 y=4.0, scale=(w/96)*1.15, renderOrder 6).
- 매 프레임: `target = (!s.found && d < 15) ? 0.9 : 0`, lerp(dt*4),
  y = 4.0 + sin(t*2+s.i)*0.15 둥실. found 시 양 전체 페이드에 함께 사라짐.

### B. 목자 지역 힌트 (js/main.js)
- `SHEEP_REGIONS` 12칸 매핑 추가 (LOST_SHEEP_SPOTS 순서).
- `updateShepherdBubble`: 상태를 문자열 키로 확장 —
  `done`(12마리, 기존 감사) / `ask`(0마리, 기존 부탁) /
  `hint:<region>`(1~11마리, 첫 미발견 양의 지역:
  "고맙네! 그런데 아직 ${region} 쪽에서 우는 소리가 들린다는군…").
- 키가 바뀔 때만 `makeBubbleTexture` 재생성 (기존 dispose 로직 재사용).

### C. 인도자 가이드
- `guide.html` 신규: `./js/sites.js`에서 SITES import(데이터 중복 없음),
  14개 카드(번호·제목 / dates / verse / question 공백 정규화) 동적 렌더.
  부록 "목자의 열두 말씀" 12줄 정적 복사(주석으로 main.js 출처 표기).
  하단 게임 링크 + 돌아가기. 인라인 스타일: 게임 팔레트·구글 폰트 재사용,
  `@media print` 배경 제거·`break-inside: avoid`.
- `index.html`: start-btn 아래(rule-bottom 위) `.guide-link` 한 줄 추가.
- `styles.css`: `.guide-link` 2줄 (14px, ink-soft, 점선 밑줄).

### TEMP TEST HOOK
- js/main.js 파일 끝 `window.__t = { tick, s, save, player, sheep, go, shepText }`
  — 계획서 명세 그대로. **오케스트레이터가 제거할 것.**

## 검증 (전부 통과)
1. `node --check js/main.js` — OK.
2. 브라우저 (serve, localhost:5173, preview 도구):
   - 양 12유닛 접근 시 "매애…" 버블 opacity 0 → 0.9 페이드인 (스크린샷 확인),
     15유닛 밖으로 나가면 0.002까지 페이드아웃, 수집 시 양과 함께 사라짐
     (`g.visible=false`).
   - 양 1마리 수집 후 `shepText()` == `'hint:갈릴리 물가'`, 목자 곁에서
     "고맙네! 그런데 아직 갈릴리 물가 쪽에서…" 버블 렌더 (스크린샷 확인).
   - guide.html: 카드 14개 + 부록 12줄 렌더, 콘솔 오류 0, 인쇄형 레이아웃 확인.
   - index.html 인트로의 `.guide-link` 스타일 computed로 확인
     (14px, rgb(90,81,66), dotted underline).
3. 검증 중 만들어진 localStorage 저장(양 1마리)은 `localStorage.clear()`로 원복.

## 이탈 / 미완
- 이탈 없음. 미완 없음.
- save 스키마·기존 기능 변경 없음, 커밋 안 함 (계획서 준수).
