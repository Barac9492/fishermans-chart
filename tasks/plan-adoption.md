# PLAN — adoption-pack: 무음 양 신호 · 목자 지역 힌트 · 인도자 가이드

목적: 실제 교회 현장 채택을 막는 세 격차 해소 — 무음 폰(청각 의존 제거),
11/12 막힘(완주 힌트), 교사용 인쇄 자료.
대상 파일: `js/main.js` (A·B), `guide.html` 신규 (C), `index.html` 링크 1줄 (C).
save 객체 변경 없음. 커밋 금지 (오케스트레이터가 한다).

## A. 무음 양 신호 — "매애…" 말풍선

배경: 잃은 양 시스템은 `js/main.js`의 `lostSheep` 배열 (`LOST_SHEEP_SPOTS` 근처,
`updateLostSheep(dt, t)`가 매 프레임 실행, 15유닛 내 bleat 재생). 말풍선 인프라는
`makeBubbleTexture(text)` (반투명 양피지 버블 텍스처 반환 `{tex, w}`) — talkers/
shepherdBubble 참고.

- 텍스처는 **하나만** 만들어 공유: `const baaBubble = makeBubbleTexture('매애…')`
  (지연 생성 가능 — 첫 필요 시).
- 각 lost sheep에 지연 생성 스프라이트: 플레이어가 15유닛 안에 처음 들어올 때
  `SpriteMaterial({ map: baaBubble.tex, transparent, depthTest:false, opacity:0 })`
  (재질은 양마다 clone — opacity 개별 제어), `s.g`에 부착, 로컬 y≈4.0
  (양 g.scale 0.7 감안), 로컬 scale ≈ ((w/96)*1.15, 1.15).
- `updateLostSheep` 안에서: `opacity 목표 = (!s.found && d < 15) ? 0.9 : 0`,
  talkers처럼 lerp(dt*4). 살짝 위아래 둥실(y = 4.0 + sin(t*2+s.i)*0.15).
- found 시 별도 처리 불필요 (양 전체가 페이드/숨김되므로 함께 사라짐).
- 성능: 스프라이트 최대 12개, 텍스처 1장 — 무시 가능.

## B. 목자 지역 힌트

배경: `shepherdBubble` + `shepherdBubbleState` (현재 0=부탁/1=감사 두 상태,
`updateShepherdBubble(dt)`에서 상태 바뀔 때만 `makeBubbleTexture` 재생성).

- 양 인덱스→지역 매핑 (LOST_SHEEP_SPOTS 순서 그대로):
  ```js
  const SHEEP_REGIONS = ['갈릴리 물가', '갈릴리 물가', '갈릴리 물가', '갈릴리 물가',
    '가이사랴 절벽', '요단 길가', '요단 길가', '요단 길가',
    '예루살렘 언저리', '예루살렘 언저리', '예루살렘 언저리', '로마'];
  ```
- 말풍선 텍스트 로직 (`shepherdBubbleState`를 문자열 키로 확장):
  - 0마리: 기존 부탁 문구 유지.
  - 1~11마리: 남은 것 중 **첫 미발견 양**의 지역으로
    `"고맙네! 그런데 아직 ${region} 쪽에서 우는 소리가 들린다는군…"`
  - 12마리: 기존 감사 문구 유지.
- 상태 키 = `done ? 'done' : (n === 0 ? 'ask' : 'hint:' + region)` — 키가 바뀔 때만
  텍스처 재생성 (매 프레임 재생성 금지).

## C. 인도자 가이드 — guide.html (신규)

- 신규 파일 `guide.html`: `<script type="module">`로 `./js/sites.js`의 SITES를
  import해 렌더 (데이터 중복 없음).
- 구성 (인쇄 친화, 한 컬럼):
  1. 헤더: "어부의 지도 — 인도자용 나눔 가이드" + 한 줄 설명
     ("각 장소의 핵심 구절과 나눔 질문입니다. 함께 걷고, 함께 나누세요.")
  2. 14개 장소 카드: `번호. 제목` / `dates`(성구 범위) / **핵심 구절**(verse) /
     **함께 나눠요**(question — 공백 정규화해서).
  3. 부록: "목자의 열두 말씀 (잃은 양)" — 아래 12줄을 **정적으로 복사**해 나열
     (main.js의 LOST_SHEEP_LINES와 동일 내용; 주석으로 출처 표기):
     눅 15:4(×2)·15:5·15:6, 요 10:11·10:27, 사 53:6, 시 23:1·23:2·23:4,
     벧전 2:25, 눅 19:10 — 정확한 문구는 js/main.js `LOST_SHEEP_LINES`에서 복사.
  4. 하단: 게임 링크(fishermans-chart.vercel.app) + 「돌아가기」(index.html).
- 스타일: 인라인 `<style>` — 게임과 같은 팔레트(양피지 #ece2c4, 먹색 #2b2620,
  붉은 포인트 #a8341f), 'Noto Serif KR' + 'Nanum Myeongjo' (구글 폰트 링크 재사용),
  `@media print`에서 배경 제거·페이지 나눔(`break-inside: avoid`) 처리.
- `index.html` 인트로 하단(rule-bottom 위)에 작은 링크 한 줄:
  `<p class="guide-link"><a href="./guide.html" target="_blank">인도자용 나눔 가이드 →</a></p>`
  스타일은 `styles.css`에 `.guide-link` 3-4줄 (ink-soft, 밑줄 점선, 14px).

## 검증 (implementer)
1. `node --check js/main.js` 통과.
2. 브라우저: (a) 무음 상태 가정 — 양 12유닛 접근 시 "매애…" 버블 페이드인,
   수집 시 함께 사라짐. (b) 양 1마리 수집 후 목자에게 가면 지역 힌트 문구.
   (c) guide.html 열어 14개 항목 + 부록 12줄 렌더, 콘솔 오류 0.
3. TEMP TEST HOOK (파일 끝, 오케스트레이터가 제거):
   ```js
   // TEMP TEST HOOK — 검증 후 제거
   window.__t = {
     tick: animate, s: state, save, player, sheep: lostSheep,
     go: (x, z) => player.position.set(x, 0, z),
     shepText: () => shepherdBubbleState,
   };
   ```
4. `tasks/progress-adoption.md` 작성 (구현/검증/이탈).

## 금지
- save·localStorage 스키마 변경, 기존 기능 리팩터, 커밋/푸시.
- guide.html에 SITES 데이터 복제 금지 (import 사용) — 단 목자의 열두 말씀 12줄은 예외.
