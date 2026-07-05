# PROGRESS — GOTY Phase 1: 주제곡 (Peter's Leitmotif Score)

## 변경 요약

### js/audio.js (+152줄)
- **버스** (`init()`, ~line 500): `music`(모드 크로스페이드, 초기 0) → master,
  `musicDuck`(덕킹) → music. 체인: 보이스 → musicDuck → music → master. 계획대로.
- **모듈 상태** (line 17–24): `music`, `musicDuck`, `musicMode='off'`, `musicTimer=6`.
- **음계·소절 데이터** (line 74–96): `ROOT=293.66(D4)`, `SCALES.maj/min`,
  `THEME_A`/`THEME_B`/`LAMENT`, `MODE_GAIN`/`MODE_REST` — 계획의 테이블 그대로.
- **보이스** (line 98–162):
  - `breathNote(freq, gain, when, dur)`: sine, 어택 0.15s, dur 후 0.4s 릴리스,
    5Hz·±4cent(freq×0.0023) 비브라토 — 깊이를 0→풀로 0.5s 램프하여 어택 뒤에 깨어남,
    lowpass 1600Hz → musicDuck. `o.stop()`/`vib.stop()` 예약 완료.
  - `pluckNote(freq, gain, when)`: triangle + lowpass 1200Hz, 즉시 어택 →
    expRamp 0.0001@+1.6s, stop @+1.65s → musicDuck.
- **스케줄러** (line 164–210): `scheduleLine()`(절대시각 통째 예약, ±0.02s 타이밍·
  ±10% 게인 흔들림, 소절 길이 반환) + `schedulePhrase(mode)` — 6개 모드 전부 계획의
  명세대로 (galilee: breath+처음·끝 pluck 더블링 / road: 앞 3음 pluck 파편 /
  jerusalem: min, oct −1, ×0.8 / lament: beat 1.0s(=0.62×1.6 느림) breath 단독 /
  dawn: THEME_A maj +1oct breath, 2박 뒤 THEME_B pluck 겹침 / finale: THEME_A +
  THEME_B(+1oct) 연속, breath+pluck 전부, ×1.2).
- **update() 통합** (덕킹 블록 직후): 모드 전환 시 `music.gain.setTargetAtTime(MODE_GAIN, t, 2.0)`
  + `musicTimer=min(musicTimer, 3+rand*3)`; 타이머 만료 시 소절 예약 후
  `musicTimer = 소절길이 + rest(모드 범위 랜덤)`. 무음 모드에선 2초 간격 폴링.
- **덕킹**: 기존 `o.ducked` 분기에 `musicDuck.gain.setTargetAtTime(ducked ? 0.3 : 1, t, 0.4)`.
- **`play('themeCall')`**: THEME_A maj breathNote 1회, musicDuck 경유.
- **뮤트**: music → master이므로 기존 master 뮤트가 자동으로 덮음 (추가 작업 없음, 계획대로).

### js/main.js (+21줄)
- **`musicMode()`** (line 3715–3729, `animate()` 직전 모듈 레벨): 계획의 분기 그대로.
  sites.js 확인 결과 site 6/10의 실제 id는 `'first-fire'`(sites.js:118) /
  `'second-fire'`(sites.js:205) — 계획의 키와 일치. `markerById`는 main.js:1131에
  이미 존재하므로 그대로 사용. 저장된 게임도 `chartSite(m, {silent:true})`(1903행,
  `marker.visited=true`)로 복원되므로 리로드 후에도 lament/dawn 상태 유지됨.
- **`audio.update` 호출** (~4245): `music: musicMode(),` 필드 추가.
- **시작 버튼** (start-btn 핸들러, ~1785): `audio.init()`/`setMuted` 직후
  `setTimeout(() => audio.play('themeCall'), 150)`.

## PLAN DEVIATION

1. **themeCall의 버스 게이팅** — 계획 E는 "게인 0.09, musicDuck 경유,
   모드와 무관하게 재생"인데, 체인상 musicDuck → music이고 시작 시점의
   `music.gain`은 0이라 그대로는 무음이 됨. 최소 수정: themeCall에서
   `music.gain.setValueAtTime(max(현재, 0.09))`로 버스를 잠깐 열고, 소절이
   끝나는 시각에 `setTargetAtTime(MODE_GAIN[musicMode], +len, 2.0)`으로 제
   모드 레벨로 되돌리는 자동화를 함께 예약. (모드 전환은 변경 시에만 발동하므로
   이 복귀 예약이 없으면 게인이 0.09에 영구히 머무는 버그가 됨.)
2. **themeCall 호출 타이밍** — `audio.play()`는 `ctx.state !== 'running'`이면
   무음 리턴하는데, Safari 등에서 `ctx.resume()`이 비동기라 클릭 직후 동기
   호출은 씹힐 수 있음. `setTimeout(…, 150)`으로 컨텍스트가 깨어날 틈을 둠.
3. **finale 오실레이터 수 해석** — 제약 "소절당 ≤20개"는 소절(테마 한 진술)
   단위로 지킴: finale 한 발화가 THEME_A(18개)·THEME_B(18개) 두 소절을 연달아
   예약하므로 합계 36개이나 소절당 18개, 전부 stop 예약됨. 그 외 모드는
   galilee 14 / road 3 / jerusalem 12 / lament 8 / dawn 18.

## 셀프체크 결과 (계획의 검증 7항)

1. 정적 서버(`npx serve`, port 5173) → `curl` 200, 콘솔 오류/경고 **0** (로드 후 6초+ 관찰). ✓
2. 시작 버튼 클릭 → 게임 정상 기동(캔버스 렌더, HUD "1 / 14 곳 다녀감", 토스트 표시),
   themeCall 코드 경로 오류 없음. 헤드리스라 실청취는 불가 — 코드 경로 확인. ✓
3. 모드 전환: 시작 지점(갈릴리, warmth 0.85 > 0.6) → 'galilee'. 각 분기는 코드
   리딩으로 검증 — duskW 경계(0.6/0.3/0.45), first/second-fire visited, finale,
   eclipse·sleepFx·sitting → silent, 미시작 → off. ✓
4. 뮤트: music이 master 하위이므로 기존 `setMuted`가 음악 포함 전부 덮음. ✓ (코드 경로)
5. 덕킹: `o.ducked` 전환 시 musicDuck 0.3배 / 복귀 1.0, 시정수 0.4s. ✓ (코드 경로)
6. 소절 주기: 시작 3~6초 내 첫 소절, 이후 galilee 기준 소절길이+14~26s 침묵 반복
   (스케줄러 로직으로 보장). ✓
7. 오실레이터 수명: breathNote(o+vib 모두 stop), pluckNote(stop @+1.65s) —
   모든 보이스에 stop 예약 확인. 프레임별 예약 없음(소절 통째 절대시각 예약). ✓

## 미완/후속
- 없음. padDay/padNight 및 기존 SFX 무변경(diff로 확인 가능). 새 의존성·빌드 스텝 없음.
