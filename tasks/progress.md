# 어부의 지도 — 페이즈 체크포인트 로그

## Phase: adoption-pack (2026-07-04) — ✅ 완료·배포
- 내용: 무음 양 신호("매애…" 말풍선) · 목자 지역 힌트 · guide.html 인도자 가이드
- 파이프라인: plan(Fable·high, scout 생략 — 판단 조항) →
  implementer(fable·medium, 90k tk) → reviewer(sonnet·fresh, 44k tk, **SHIP**, findings 0)
- 오케스트레이터 검증: 매애 버블 opacity 0.9 페이드인, 수집 후 목자 상태
  'hint:갈릴리 물가', guide.html 200 + sites.js import, 콘솔 오류 0
- 커밋: 7d633fd · 프로덕션 반영 확인 (guide.html 200 라이브)
- 산출물: tasks/{plan,progress,review}-adoption.md

## Phase: sabbath-pack (2026-07-04) — ✅ 완료·배포
- 내용: 앉기(쉼, 시 46:10) · 발의 등불(시 119:105) · 들의 백합(마 6:28-30)
- 파이프라인: scout(haiku·low, 104k tk) → plan(Fable·high) →
  implementer(fable·medium, 137k tk, +215줄) → reviewer(sonnet·fresh, 87k tk, **SHIP**)
- 리뷰 findings 3건 전부 경미·비차단 (자막 경합 이론상 가능성, 데드 가드 노트,
  등불 점등 영역이 서사보다 넓음 — 계획 스펙과는 일치) → 수정 없이 출하
- 오케스트레이터 브라우저 검증: 앉기 타임라인(자세→카메라22→5s시편→20s별똥별→기립·복원),
  등불(예루살렘 1.4 / 갈릴리 0), 백합 렌더+탭 배선, 콘솔 오류 0
- 커밋: 2b959b6 · 프로덕션 반영 확인 (fishermans-chart.vercel.app)
- 산출물: tasks/{scout,plan,progress,review}-sabbath.md
