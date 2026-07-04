# Scout: Sabbath Features (Sit, Lamp, Lilies)

## Overview
Preparing implementation specs for three new features: A) "앉기" (sitting), B) "발의 등불" (foot lamp), C) "들의 백합" (wildflowers). All mods to `js/main.js` core, with minimal changes elsewhere.

---

## 1. 방문 프롬프트(visit-btn) 시스템

**What exists:**
- `visitBtn` element: `/Users/yeojooncho/Fable5_Peter/js/main.js:1494`
- `visitLabel` element: `/Users/yeojooncho/Fable5_Peter/js/main.js:1495`
- `state` object with flags: `/Users/yeojooncho/Fable5_Peter/js/main.js:1480`
  - `state.started`, `state.modal`, `state.visitedCount`, `state.nearSite`, `state.boardMode`, `state.sailMode`, `state.view`
- `tryVisit()` function: `/Users/yeojooncho/Fable5_Peter/js/main.js:1630-1641` — guards against modals, voyage, finale, flowBusy; checks `boardMode`, `sailMode`, then calls `openCard()` or flow's `advance()`
- Label assignment in animate loop: `/Users/yeojooncho/Fable5_Peter/js/main.js:3610-3625` — builds label from `flowNear`, `boardOn`, `sailMode`, or `near.shortTitle`
- Key binding: `/Users/yeojooncho/Fable5_Peter/js/main.js:1402` — E/Enter calls `tryVisit()`
- Tap binding: `/Users/yeojooncho/Fable5_Peter/js/main.js:1468,1472` — small drag/look becomes `handleTap()` which calls `openCard()` or flows

**Pattern for sitting:**
- Add new mode flag `state.sittingMode = false` alongside `boardMode`, `sailMode`
- In animate loop (~3610), check sitting candidate + set label (e.g., "🔥 앉아 쉬기" if near fire/well)
- `tryVisit()` checks `if (state.sittingMode) { startSitting(); return; }`
- Start sitting as a new flow or a state machine like `waterWalk`, `netsRide`

---

## 2. 자막 시스템

**What exists:**
- `voyageCaptionEl`: `/Users/yeojooncho/Fable5_Peter/js/main.js:1511` — `<div id="voyage-caption">`
- `showCaption(text)`: `/Users/yeojooncho/Fable5_Peter/js/main.js:2133-2137` — removes 'hidden', sets opacity='1', textContent
- `hideCaption()`: `/Users/yeojooncho/Fable5_Peter/js/main.js:2138-2141` — opacity='0', auto-remove 'hidden' after 800ms
- Used by voyage, eclipse, water-walk, nets-ride, pentecost, long-night, second-fire flows

**Pattern for sitting:**
- Use same `voyageCaptionEl` to show psalm verse at 5s
- Call `showCaption(psalmText)` at sit-start + 5000ms
- Call `hideCaption()` to fade out after display duration

---

## 3. 카메라 시스템

**What exists:**
- `cam` object: `/Users/yeojooncho/Fable5_Peter/js/main.js:117` — `{ yaw, height, dist, smoothDist, lastDrag }`
- Camera setup: `/Users/yeojooncho/Fable5_Peter/js/main.js:1078-1083` — initial position from `cam.yaw`, `cam.dist`, `cam.height`
- In animate, camera follows player via `_head` + `_toCam` + occlusion: `/Users/yeojooncho/Fable5_Peter/js/main.js:3531-3547`
  - Computes `fullDist` from player head to camera position
  - Raycasts `camRay` to occluders to find blocking distance → `targetDist`
  - Smooths toward target via `cam.smoothDist`
  - Final pos: `_camPos.copy(_head).addScaledVector(_toCam, cam.smoothDist)`
- Chart view ignores player camera, uses fixed `CHART_CAM_POS/LOOK_AT`: `/Users/yeojooncho/Fable5_Peter/js/main.js:3521-3522`

**Pattern for sitting (camera pull-back):**
- Create sitting state object (like `waterWalk`): `{ t, phase, fromDist, ... }`
- In sitting phase, set `cam.dist` to larger value (e.g., 20 instead of 11)
- `cam.smoothDist` will naturally lerp to it via existing animate logic
- Restore `cam.dist` to 11 on stand-up
- Or: temp override in animate: `if (sitting) { const tempDist = ...; cam.smoothDist += (tempDist - cam.smoothDist) * ... }`

---

## 4. 플레이어 모델 구조

**What exists:**
- `player` group: `/Users/yeojooncho/Fable5_Peter/js/main.js:1036-1076`
  - Robe (cylinder): `1036-1040`
  - Sash (torus): `1041-1043`
  - Cloak (cone): `1044-1047`
  - Head (sphere): `1048-1050`
  - Beard (sphere): `1051-1053`
  - `legL`, `legR` (box geo, rotated -0.45 on y): `1056-1063`
  - `armL`, `armR` (box geo, rotated -0.42 on y): `1065-1072`
  - Scaled 0.58, positioned at (-30, 0, -112)

**For sitting pose:**
- Access `player.children` or named refs: `legL.position.set(-0.24, y, 0)` → move up closer to body
- Rotate legs: `legL.rotation.x = Math.PI / 4` (bent forward)
- Rotate arms: `armL.rotation.z = Math.PI / 6` (folded down/inward)
- Optional: tilt body forward: `player.rotation.x = -0.15`
- Store original rotations/positions, restore on stand

---

## 5. 별/밤 시스템

**What exists:**
- `stars` (Points): `/Users/yeojooncho/Fable5_Peter/js/main.js:1289-1308` — 380 points, opacity=0 by default
- `duskW`: `/Users/yeojooncho/Fable5_Peter/js/main.js:1364` — global warmth (0=night, 1=day, 0.5=dusk)
- `regionWarmth(x,z)`: `/Users/yeojooncho/Fable5_Peter/js/main.js:1383-1389`
  - Returns 0.12 if z > 88 (Jerusalem: night)
  - Returns 0.85 if z < -95 (Galilee: morning)
  - Returns 0.55 for Rome or x < -150
  - Blends road south
- `applyWarmth(w)`: `/Users/yeojooncho/Fable5_Peter/js/main.js:1371-1379` — sets `duskW`, calls `setSky()`, lerps fog/sun colors, adjusts sun intensity + hemi
- Stars opacity updated in animate: `/Users/yeojooncho/Fable5_Peter/js/main.js:3571` — `stars.material.opacity += ((chartUp ? 0 : 0.9 * nightK) - ...) * dt * 2`
  - `nightK = Math.max(0, Math.min(1, (0.4 - duskW) / 0.3))` — nonzero only if duskW <= 0.4

**For sitting in Jerusalem night:**
- `applyWarmth()` already darkens sky when z > 88
- Stars are already procedurally visible (no files)
- During sit, fade in stars: already works if sitting in Jerusalem (z > 88)
- For shooting stars: create new sprite/mesh, animate across sky

---

## 6. 조명 및 점광원

**What exists:**
- `hemi` (HemisphereLight): `/Users/yeojooncho/Fable5_Peter/js/main.js:123-124` — intensity 1.1, modulated by `applyWarmth()`
- `sun` (DirectionalLight): `/Users/yeojooncho/Fable5_Peter/js/main.js:125-134` — position follows player, shadows enabled
- Fire props (PointLight): `/Users/yeojooncho/Fable5_Peter/js/main.js:1015-1031`
  - `PointLight(0xff9040, intensity=1.4, distance=9, decay=2)`
  - Reused at two fire sites via `fireProp()` return `{ g, glow, light }`

**For foot lamp (Jerusalem night):**
- Create PointLight at player position during night (z > 88, or when regionWarmth < 0.3)
- Color: 0xf5d090 (warm amber), intensity ~1.2, distance ~12
- Parent to player or update position each frame
- Fade in/out on region entry/exit

---

## 7. 모닥불 위치 및 쉼터 후보

**What exists:**
- `firePositions` array: `/Users/yeojooncho/Fable5_Peter/js/main.js:1011-1013` — extracted from marker sites 'first-fire' (6번) and 'second-fire' (10번)
  - 6번: 예루살렘 성벽 안 화단 (대사관 뜨락)
  - 10번: 갈릴리 물가, 새벽 바닷가
- Fire props created at these positions: `/Users/yeojooncho/Fable5_Peter/js/main.js:1032`

**Other shelter candidates (from code inspection):**
- 9번 (long-night): 갈릴리 호수가 (-129)
- 12번 (pentecost): 예루살렘 성벽 안 (높은 제사장 뜨락?)
- Well: Not explicitly built; could place one at Caesarea Philippi (pool exists at 16,-183 + 3)
- Gethsemane olive press: center at (44, 100)

**For sitting feature:**
- Check proximity to fire (~8 units) or well/shelter landmark
- Trigger sitting prompt only at these locations

---

## 8. 탭 시스템 & tapTargets

**What exists:**
- `tapTargets` array: `/Users/yeojooncho/Fable5_Peter/js/main.js:287`
- `landmarkInfo()`: `/Users/yeojooncho/Fable5_Peter/js/main.js:320-334` — creates sprite + invisible hitbox, adds both to `tapTargets`
- `handleTap(cx, cy)`: `/Users/yeojooncho/Fable5_Peter/js/main.js:1644-1677`
  - Raycasts from camera through screen coordinates
  - Checks markers first → flow or openCard
  - Then checks `tapTargets` → landmark blurb or special `.userData.roosterToy`
  - Rooster toy: `/Users/yeojooncho/Fable5_Peter/js/main.js:1669-1673` — plays sound, buzzes, resets hop timer
- Rooster hitbox example: `/Users/yeojooncho/Fable5_Peter/js/main.js:2989-2993` — transparent box, `.userData.roosterToy = true`

**For wildflowers (들의 백합):**
- Create flower mesh/sprite groups scattered in Galilee plains
- Add hitbox with `.userData.landmark = { name, blurb }` for tap hint
- Or add `.userData.wildflower = { verse }` for special handling
- In `handleTap()`, check for wildflower → show toast with Matthew 6:28 verse

---

## 9. 풀(grass tufts) 생성 블록

**What exists:**
- Grass generation: `/Users/yeojooncho/Fable5_Peter/js/main.js:557-588`
  - Creates array of geometries via `tuft()` helper (PlaneGeometry, rotated, translated)
  - Spawns along JORDAN_ROAD, LAKE perimeter, and random in Galilee (z=-200...-90, x=-40..45)
  - Merges all into one mesh via `mergeGeometries()`, single MeshLambertMaterial
  - Color: 0x8a9a68 (grass green), DoubleSide

**For wildflowers (들의 백합):**
- Similar pattern: create array of flower geometries (cone or quad for simplicity)
- Colors: mix of 0xd75a8c (pink), 0xf5a844 (orange), 0xa8d944 (yellow), 0x7d6fd4 (purple)
- Scatter in Galilee plains (~z=-200...-90, x=-60..60)
- Merge into one mesh OR keep separate groups per flower type for better organization
- Don't merge if individual taps needed → keep as separate meshes with hitboxes

---

## 10. 토스트/버즈/골드버스트 헬퍼

**What exists:**
- `toast(msg, ms=4200)`: `/Users/yeojooncho/Fable5_Peter/js/main.js:1556-1565` — sets `.textContent`, opacity fade, auto-hide
- `buzz(pattern)`: `/Users/yeojooncho/Fable5_Peter/js/main.js:2928-2930` — calls `navigator.vibrate()` if supported
- `goldBurst(x, z, y=3)`: `/Users/yeojooncho/Fable5_Peter/js/main.js:2946-2955` — spawns 12 spark sprites, adds to `sparks[]` with trajectory
- `updateSparks(dt)`: `/Users/yeojooncho/Fable5_Peter/js/main.js:2956-2968` — updates positions, fades out
- `sparkTex`: `/Users/yeojooncho/Fable5_Peter/js/main.js:2934-2945` — radial gradient canvas texture, reused across multiple effects

**Usage in features:**
- **Sitting**: `toast("여기가 소중한 자리다 — 쉼표를 누린다.", 5000)` after settling
- **Lamp**: No toast for entry; could show on first time: `toast("발에 등불을 얻었다 (시 119:105)", 4000)`
- **Wildflower**: `toast("마 6:28 한 줄")` on tap; use `buzz()` for haptic feedback

---

## 11. 입력 처리 가드 체인

**What exists:**
- `keydown`: `/Users/yeojooncho/Fable5_Peter/js/main.js:1394-1404`
  - Skip if target is INPUT
  - Guards: `if (finale)`, `if (voyage)`, `if (eclipse)`, `if (sleepFx)`, `if (waterWalk...)` → each returns early
  - Then checks E/Enter for `tryVisit()`, M for toggle view
- `pointerdown`: `/Users/yeojooncho/Fable5_Peter/js/main.js:1416-1441`
  - Same skip guards at top
  - Then joystick setup or look-drag
- `endPointer`: `/Users/yeojooncho/Fable5_Peter/js/main.js:1461-1476` — releases joystick/look, calls `handleTap()` if small motion

**For sitting (stand-up input):**
- Add guard in `keydown` and `pointerdown`: `if (sitting) { standUp(); return; }`
- Insert AFTER `waterWalk` guard, BEFORE normal input processing
- This allows any input to interrupt sitting

---

## 12. 별똥별 (shooting stars)

**What exists:**
- No shooting star system currently
- Could reuse `sparkTex` or create new radial gradient sprite
- Meteor idea: fast-moving sprite across sky, fade trail

**For sitting scene (shooting stars at 20s):**
- Create sprite with radial gradient (white-ish center, yellow glow edge)
- Animation: linear across sky from random edge position, 2-3s duration, fade trail
- Spawn near zenith, arc downward
- Trigger at `sittingPhase.t >= 20`

---

## 관련 파일 위치

| File | Role | Key Lines |
|------|------|-----------|
| `/Users/yeojooncho/Fable5_Peter/js/main.js` | Game loop, camera, input, UI, world state | 1-3918 |
| `/Users/yeojooncho/Fable5_Peter/js/audio.js` | Procedural sound synthesis | 1-300+ |
| `/Users/yeojooncho/Fable5_Peter/styles.css` | Visit button, toast, modal styles | n/a |
| `/Users/yeojooncho/Fable5_Peter/index.html` | voyage-caption, lid-top/bottom, UI structure | n/a |

---

## 기존 패턴

1. **Flow mechanics** (`flows[id]`): labeled button, `advance(marker)` method. Example: `flows.nets`, `flows['first-fire']`. Each flow manages its own state and calls helpers like `castNet()`, `openCard()`, `toast()`.

2. **State machines** (like `waterWalk`, `netsRide`, `eclipse`, `finale`): global `let` with `{ t, phase, ... }`, updated in animate loop via `updateWaterWalk(dt)`, etc. Checked in input guards to block normal movement.

3. **Camera control**: stored in `cam` object, updated in animate via raycast + occlusion. No direct set; instead modify `cam.dist` and let `cam.smoothDist` interpolate.

4. **Prompt label generation** (line 3610): reads multiple flags (`boardOn`, `sailMode`, `flowNear`, `near`) to decide text. Built in animate, not in `tryVisit()`.

5. **Tap targets**: invisible boxes with `.userData` for special handling. Raycast checks all `tapTargets`, not just markers.

6. **Asset-free visuals**: stars, clouds, sun/moon are procedural sprites. Wildflowers should follow same pattern.

---

## 제약

- `js/main.js` 크기 (~3918 lines): Very large. Adding 200-300 lines for sitting + lamp + wildflowers is acceptable.
- No new files required; all in main.js.
- Three.js version: modern (addons/utils/BufferGeometryUtils imported).
- Touch + keyboard input: must handle both.
- Saving/persistence: `save` object saved to localStorage; sitting/lamp features don't need persistence (stateless).

---

## 지뢰밭

1. **Camera occlusion**: If sitting near buildings, camera might clip through walls. Test with `cam.smoothDist` smoothing at different distances.

2. **Modal state conflict**: Sitting is a modal (like voyage). Must ensure `state.modal = true` during sit, and all input checks `if (state.modal)` early.

3. **regionWarmth vs warmthOverride**: Long-night and other flows set `warmthOverride` to control lighting. Sitting in Jerusalem should NOT override; let regionWarmth naturally be dark. Contrast: long-night DOES override (0.1→0.5) to show progression.

4. **Flower tap targets**: If using merged geometry, can't tap individual flowers. If keeping separate, need many meshes = performance concern. Consider hitbox-per-flower approach (like rooster toy) rather than visual merge.

5. **Shooting star timing**: 20s is a long time; player might move away or close card. Need robust update loop that doesn't depend on player position or state.

6. **Lamp light bleeding**: PointLight on player during night might illuminate buildings unnaturally. Consider distance=8 (short range) or intensity=0.8 (dimmer).

7. **Input interrupt during sitting**: Current guards check `waterWalk` before normal input. Sitting guard must go BEFORE `waterWalk` to take precedence, or AFTER to allow water-walk skip to work (low priority if water-walk exclusive to lake).

---

## 열린 질문

1. **Sitting pose rotation**: Should body tilt forward? Legs bend at hips or knees? Reference pose from any existing interaction?
2. **Camera speed during sit**: How fast should camera pull back? Instant or 1-2s ease?
3. **Sitting cancellation**: Can player move during sit, or is sit frozen until input? (Current assumption: frozen, any input stands up.)
4. **Wildflower density**: How many flowers? Sparse (10-20) or lush (50-100)? Affects performance + visual clutter.
5. **Lamp light parenting**: Parent to camera, player, or placed at player feet every frame? Parenting to player simplest.
6. **Psalm selection**: Which psalm verse for sitting? 시편 23 (Psalm 23) or 119편 (119)? Currently unspecified in design.

---

## 최종 체크리스트

- [ ] Sitting: state machine (`sitting: { t, phase, fromDist, ... }`) + UI label
- [ ] Lamp: PointLight creation/destruction based on regionWarmth
- [ ] Wildflowers: mesh/hitbox setup in Galilee plains, tap → toast
- [ ] All input guards updated (sitting before/after waterWalk)
- [ ] Camera smoothing test (occlusion + pull-back)
- [ ] Audio: any new sounds for sitting/lamp/flower? (Currently N/A; assume silent or reuse existing)
- [ ] Performance: flower count, star rendering (already fine)
- [ ] Persistence: none needed (stateless features)

