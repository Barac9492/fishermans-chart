# 어부의 지도 — 페이즈 체크포인트 로그

## Phase: goty2-title-end (2026-07-05) — ✅ 완료
- 목표(GOTY 스택 2/3): 게임의 액자 — 살아있는 타이틀(반투명 스크림 + 갈릴리
  새벽 궤도 카메라 + 순차 페이드인) · 일시정지(Esc/⚙: 소리·화질 3단·2단계
  재시작) · 완주 크레딧 롤(14곳 명단, rAF 스크롤, 스킵, reduced-motion 대응).
- 파이프라인: plan(Fable·high) → implementer(fable·medium, 145k, 이탈 5건 로그)
  → reviewer(sonnet·fresh, 70k, **FIX-THEN-SHIP**)
- 리뷰 MAJOR 1건(Esc가 컷신 스킵을 삼킴) → 오케스트레이터 수정: Esc는
  paused||canPause()일 때만 잡고 아니면 스킵 사슬로 흘려보냄.
- 오케스트레이터 검증: 타이틀 스크린샷(세계가 뒤에서 흐름, 가독성 유지),
  Esc 열림/닫힘·라벨(소리: 켬/화질: 자동) 확인, 콘솔 오류 0.
- 산출물: tasks/{plan-goty2-title-end,progress-goty2,review-goty2}.md

## Phase: goty1-score (2026-07-05) — ✅ 완료
- 목표(GOTY/PlayStation-grade 스택 1/3): 절차적 라이트모티프 음악 — 베드로
  주제가 지역·서사에 따라 갈릴리 장조 → 예루살렘 단조 → 부인 후 애가(거의
  침묵) → 새벽 장조 회귀 → 피날레 크레셴도. 시작 버튼에 themeCall.
- 파이프라인: scout(haiku·low, 90k) → plan(Fable·high) → implementer(fable·medium,
  100k, 이탈 3건 로그됨) → reviewer(sonnet·fresh, 53k, **FIX-THEN-SHIP**)
- 리뷰 MAJOR 1건(themeCall 게인 복원이 모드 자동화와 경합) → 오케스트레이터가
  직접 수정: 보이스에 dest 인자 스레딩, themeCall은 일회용 게인으로 master 직결
  (music.gain 자동화 무접촉) + ctx suspended 시 1회 재시도.
- 오케스트레이터 검증: 리로드→시작→12s 주행, 콘솔 오류/경고 0, HUD 정상.
- 산출물: tasks/{scout-goty,plan-goty1-score,progress-goty1,review-goty1}.md

## Phase: render-pass (2026-07-04) — ✅ 완료·배포
- 내용: 블룸(선택적 HDR 부스트 13종) · PMREM 물 반사+햇빛 반짝임 ·
  그림자 4096/노출 곡선/불빛 플리커 · 비네트+그레인 · FPS<45 자동 폴백
- 파이프라인: scout(haiku, 61k) → plan(Fable) → implementer(fable·medium,
  154k, 이탈 2건 경미) → reviewer(sonnet·fresh, 53k, **SHIP** 결함 0)
- 오케스트레이터 검증(스크린샷 3장): 새벽 바닷가 형상·숯불 발광 ✓,
  예루살렘 밤 등불이 골목을 데움+횃불 발광 ✓, 갈릴리 낮 무광 유지+수면 반짝임 ✓,
  콘솔 오류 0
- 커밋: 5343e2f · 프로덕션 반영 확인
- 산출물: tasks/{scout,plan,progress,review}-render.md

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
