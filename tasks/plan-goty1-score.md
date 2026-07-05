# PLAN — GOTY Phase 1: 주제곡 (Peter's Leitmotif Score)

## 목표

절차적(WebAudio, 파일 0개) 라이트모티프 음악 시스템. 하나의 "베드로 주제"가
지역과 서사 진행에 따라 색을 바꾼다:

| 상태(mode) | 언제 | 음악 성격 |
|---|---|---|
| `galilee` | 갈릴리 낮 (warmth 높음), 부인 전 | 장조 펜타토닉, 따뜻하고 드문드문 |
| `road` | 요단 길 (중간 warmth) | 주제의 파편만, 긴 침묵 |
| `jerusalem` | 예루살렘 밤 (warmth 낮음), 부인 전 | 단조 변주, 낮고 긴장감 |
| `lament` | **첫 번째 불(부인) 방문 후 ~ 두 번째 불 방문 전** | 거의 침묵. 아주 드물게 홀로 하강하는 애가 한 소절. 슬픔 = 부재 |
| `dawn` | 두 번째 불 방문 후 | 주제가 장조로, 한 옥타브 위에서, 더 풍성하게 돌아온다 |
| `finale` | 피날레(돔 선회) 중 | 주제 전체 진술, 크레셴도 — 기존 혼과 겹침 |
| `silent` | eclipse · sleepFx · sitting 중 | 음악 정지 (분위기 연출 존중) |

미학 원칙: **관상적(contemplative)**. 절대 시끄럽지 않게 — 게인 0.03~0.1,
소절 사이 침묵 10~75초. 음악은 풍경처럼 "가끔 지나간다".

## 파일별 변경

### 1. `js/audio.js` (+~180줄)

**A. 음악 버스** — `init()`에서 `ambience`/`sfx`와 나란히:
```js
music = ctx.createGain();      // 모드 크로스페이드가 사는 곳
music.connect(master);
```
덕킹: `update()`의 기존 `o.ducked` 분기에서 music도 함께
`setTargetAtTime(ducked ? 0.3 : 1, t, 0.4)` — 단 music 버스 자체가 아니라
**별도 `musicDuck` 게인을 직렬로** 두어 모드 페이드와 곱이 되게 한다.
(체인: 보이스 → musicDuck → music → master. music.gain = 모드 레벨,
musicDuck.gain = 덕킹.)

**B. 음계·소절 데이터** (D 중심, 멜로디 음역 D4~D6):
```js
const ROOT = 293.66; // D4
const SCALES = {
  maj: [0, 2, 4, 7, 9, 12, 14, 16],   // 장조 펜타토닉 확장
  min: [0, 3, 5, 7, 10, 12, 15, 17],  // 단조 펜타토닉 확장
};
// 베드로 주제: "부름" (도약해 오르고, 되묻듯 내려온다) — 음계 인덱스
const THEME_A = [ [0,1], [2,1], [4,2], [3,1], [2,1], [0,3] ];     // [degree, beats]
const THEME_B = [ [4,1], [5,1], [7,2], [5,1], [4,1], [2,3] ];     // 응답구 (dawn/finale용)
const LAMENT  = [ [5,2], [4,2], [2,2], [0,5] ];                    // 애가: 느린 하강
```
`degToFreq(scale, deg, octShift)`: `ROOT * 2**(SCALES[scale][deg]/12) * 2**octShift`.

**C. 보이스 두 개**:
- `breathNote(freq, gain, when, dur)` — "숨결" 리드: sine, 어택 0.15s로 부풀고
  dur 후 0.4s 릴리스. 5Hz·±4cent 비브라토 LFO(어택 후 시작). lowpass 1600Hz.
  → musicDuck.
- `pluckNote(freq, gain, when)` — 하프/수금 느낌: triangle + lowpass 1200Hz,
  게인 즉시 어택 → `exponentialRampToValueAtTime(0.0001, +1.6s)`. → musicDuck.

**D. 소절 스케줄러** — 모듈 상태 `musicMode='off'`, `musicTimer=6`,
`musicLevel` 목표치 테이블:
```js
const MODE_GAIN = { galilee:.055, road:.04, jerusalem:.045, lament:.04, dawn:.075, finale:.11, silent:0, off:0 };
const MODE_REST = { galilee:[14,26], road:[26,45], jerusalem:[20,35], lament:[45,75], dawn:[10,20], finale:[2,4] };
```
`update()` 안에서 (기존 crackleTimer 블록과 같은 수준에):
1. `o.music`(문자열)이 `musicMode`와 다르면: `musicMode = o.music`,
   `music.gain.setTargetAtTime(MODE_GAIN[mode], t, 2.0)`,
   `musicTimer = Math.min(musicTimer, 3 + Math.random()*3)`.
2. `musicTimer -= dt`; 0 이하이고 mode가 소리 있는 모드면 소절 하나 예약:
   - `galilee`: THEME_A를 maj로, breathNote 리드 + 첫 음과 마지막 음에 pluck 더블링.
   - `road`: THEME_A의 **앞 3음만** maj로, pluck만 (파편).
   - `jerusalem`: THEME_A를 min으로, breathNote, 옥타브 -1, 게인 0.8배.
   - `lament`: LAMENT를 min으로, breathNote 단독, 템포 1.6배 느리게.
   - `dawn`: THEME_A maj 옥타브 +1 breathNote, 2박 뒤 THEME_B를 pluck으로 겹침.
   - `finale`: THEME_A maj + THEME_B(+1 oct) 연속, breath+pluck 전부, 게인 1.2배.
   - 박자: 1 beat = 0.62s (lament는 1.0s). 노트별 ±0.02s 타이밍·±10% 게인 흔들림.
   - `musicTimer = 소절길이 + rest(모드 범위에서 랜덤)`.
3. **주의**: 노트 예약은 전부 `ctx.currentTime` 기준 절대시각 예약(when 인자)로
   한 번에 — per-frame 스케줄링 금지.

**E. 시작 신호** — `play()` switch에 추가:
```js
case 'themeCall': // 출항의 부름 — 시작 버튼과 타이틀에서
```
THEME_A maj를 breathNote로 1회, 게인 0.09, musicDuck 경유. (모드와 무관하게 재생.)

**F. 뮤트**: 기존 master 뮤트가 자동으로 덮는다 — 추가 작업 없음.

### 2. `js/main.js` (+~25줄)

**A. `musicMode()` 함수** — `audio.update` 호출부(≈4223) 근처에 정의:
```js
function musicMode() {
  if (!state.started) return 'off';
  if (eclipse || sleepFx || sitting) return 'silent';
  if (finale) return 'finale';
  const denied = markerById['first-fire']?.visited;
  const restored = markerById['second-fire']?.visited;
  if (denied && !restored) return 'lament';
  if (restored && duskW > 0.45) return 'dawn';
  if (duskW > 0.6) return 'galilee';
  if (duskW < 0.3) return 'jerusalem';
  return 'road';
}
```
※ **구현자 확인 사항**: sites.js에서 site 6/10의 실제 `id` 문자열을 grep으로
확인해 위 키를 맞출 것 (설계상 'first-fire'/'second-fire'). `markerById`가
없다면 `markers.find()` 패턴 사용 (기존 4205행 참조).

**B. `audio.update` 호출에 필드 추가**: `music: musicMode(),`

**C. 시작 버튼**: 기존 시작 흐름(인트로 → 게임 시작, `audio.init()`이 불리는 곳)
직후 `audio.play('themeCall')` 1회. (grep으로 시작 핸들러 위치 확인.)

**D. 보이지(voyage) 중**: musicMode()에 분기 추가하지 않는다 — 로마 항해는
지역 warmth를 따라가면 됨 (restored 상태라 'dawn' 계열이 자연스럽게 깔림).

## 제약

- 파일 오디오 금지 — 전부 신스. 새 의존성 금지. 빌드 스텝 금지.
- 기존 패드(padDay/padNight)는 **건드리지 않는다** — 화성 바탕으로 공존.
- 주석은 기존 스타일(한국어, 시적이되 기술적으로 정확)을 따른다.
- CPU: 소절당 오실레이터 ≤ 20개, 재생 후 반드시 `o.stop()` 예약 — 누수 금지.
- 어떤 모드에서도 음악이 앰비언스를 압도하면 안 됨 (마스터에서 컴프레서가
  이미 있으니 게인 테이블만 지키면 됨).

## 검증 (구현자 셀프체크)

1. `npx serve` → 콘솔 오류 0.
2. 시작 버튼 → themeCall 1회 들림(또는 코드 경로 확인).
3. 콘솔에서 `duskW` 값 조작이 어려우므로: musicMode 전환은 갈릴리(시작 지점,
   'galilee')에서 확인 + 코드 리딩으로 각 분기 검증.
4. 뮤트 토글 → 음악 포함 전부 침묵.
5. 카드 열기 → 음악 덕킹(0.3배) 확인 (코드 경로).
6. 60초 방치 → 소절이 최소 1회 이상 재생되고, 소절 사이 침묵 존재.
7. 오실레이터 수명: 소절 재생 후 `o.stop()` 예약이 모든 보이스에 있는지 코드 확인.

## 산출물

- 코드: js/audio.js, js/main.js
- 로그: tasks/progress-goty1.md (변경 요약, 이탈 사항, 셀프체크 결과)
