# SCOUT — "어부의 지도" GOTY Gap Analysis

**Date**: 2026-07-05  
**Focus**: Complete map of current system state vs. award-quality baseline  
**Status**: Read-only exploration; no code changes

---

## Overview

Fisherman's Chart is a polished 3D narrative game (Three.js, no external engine) about Simon Peter's life across 14 biblical sites. Three production phases (render-pass, adoption-pack, sabbath-pack) added: bloom/shadow/vignette visual richness, shepherd adoption hints, rest/reflection mechanics, lost sheep collection system. Total codebase: ~5,000 lines JS + 150 lines markup.

**Current state**: Functionally complete single-player walkable experience with full narrative arc, procedural audio synthesis, interactive collectibles, and mobile touch support. Deployed and playable (fishermans-chart.vercel.app).

---

## Existing Game Systems (with path:line refs)

### 1. Progression & Narrative Structure
- **14 SITES locations** (`js/sites.js:8-311`): Complete Peter arc (nets → Caesarea → Gethsemane → denial × 2 → tomb → recovery → Rome → Basilica).
- **First-visit flow**: Interactive scene (dialogue/animation) → card reveal → relic fill → save.charted[] persist.
- **Chart registry** (`js/main.js:1656-1660`): `save = {charted, epilogueShown, muted, sheep, sheepHint, name}`.
- **Epilogue trigger** (`js/main.js:2009-2026`): When `visitedCount === 14`, show EPILOGUE text (`sites.js:313-332`) then finale.
- **Finale camera** (`js/main.js:3599-3642`): 15s Catmull-Rom flyby around basilica dome, 3 horn cues (88/110/98 Hz), gold lighting ramp.

### 2. Player Movement & Controls
- **WASD + arrow keys** (`js/main.js:3667-3670`): Free walking.
- **Touch joystick** (`js/main.js:1581-1620`): Left half of screen, 55px radius pointer, visual ring.
- **Sprint** (`js/main.js:3739-3740`): Shift key OR joystick pushed >42px (outside ring) → 1.8× speed.
- **Camera look** (`js/main.js:1623-1650`): Right-drag for yaw/zoom smooth lerp.
- **Interact** (`js/main.js:2544+`): E key or tap "visit button" to trigger card/scene.
- **Chart toggle** (`js/main.js:1687-1696`): M key or view button (street ↔ map view).
- **Touch-hint** (`js/main.js:1764-1775`): First-time guidance (6.5s auto-hide), left/right hand separation.

### 3. Collectibles & Reward Systems
- **14 Relics** (`js/main.js:1707-1726`): One per site, display in satchel UI bar (14-slot grid), fill with pop animation on first visit.
- **12 Lost sheep** (`js/main.js:2931-3000`):
  - Spawn locations: `LOST_SHEEP_SPOTS` (scattered across map).
  - Trigger: Proximity <15 units → bleat audio + "매애…" speech bubble (sprite, opacity fade).
  - Collect: Player near sheep when "found" state (touched by marker), persist in `save.sheep[]`.
  - Reward: Pet lamb companion emerges after all 12 collected (`js/main.js:3340-3380`), follows player.
  - Hint system: First sheep discovery shows hint at site 11 (shepherd says location of next).
- **Satchel UI** (`js/main.js:1708-1717`): Relic emoji display, gold highlight on completion.

### 4. Dialogue & Interactive Scenes
- **Four branching scenes** (not just card reads):
  1. **Site 1 (Nets)** (`js/main.js:2544+`): Hold-down button "그물을 내리겠습니다" (30s durability test).
  2. **Site 4 (Caesarea Philippi)** (`js/main.js:2600+`): Confession prompt "주님은 그리스도이시요", timed key.
  3. **Site 6 (First-fire, denial)** (`js/main.js:2700+`): Three choice buttons, last one "tremble" animated (shaking).
  4. **Site 10 (Second-fire, recovery)** (`js/main.js:2750+`): Three "나를 사랑하느냐" questions, recovery answers.
- **Eclipse sequence** (`js/main.js:2464-2505`): Darkness at site 7 (Golgotha); 16s event with 4 timed captions + horn cry audio.
- **Dialog abstractions** (`js/main.js:2516-2570`):
  - `showDialog(speaker, line)`: Set modal, show speaker + line text.
  - `dialogButton(label, onTap)`: Simple button.
  - `dialogHoldButton(label, ms, onDone)`: Button with visual fill bar (durability hold).

### 5. Card System (Site Info/Lore)
- **14 reopenable cards** (`js/main.js:1670-1989`): Title, dates, verse, body, relic artifact, discussion Q.
- **Verse** (`js/sites.js` per-site): Single-line Scripture quote in beige box, right-aligned emphasis.
- **Discussion** (`#card-discuss`): Collapsible gold box "함께 나눠요" (youth group share question).
- **Artifact** (`#card-artifact`): Flavor text (e.g., "손질하다 만 그물"), stamped "다녀감" on first visit.
- **Media support** (`#card-media`): `appendChild(fig)` structure ready, but no images in current SITES data.
- **Close behavior** (`js/main.js:1987`): Fade + modal off, continue play.

### 6. Render Passes & Visual Systems
- **Bloom** (`js/main.js:179-197`): UnrealBloomPass, strength 0.55, radius 0.35, threshold 2.2.
- **PMREM water reflection**: RoomEnvironment import, generates specular map for water/materials.
- **Vignette + grain** (`js/main.js:156-177`): ShaderPass with exposure curve, 13-stop HDR simulation.
- **Shadows** (`js/main.js:142-155`): Sun directional 4096×4096 map, adaptive frustum per view (street vs. chart).
- **Day/night sky** (`js/main.js:94-120`): Canvas-based gradient, 4 color stops lerped by warmth (time of day).
- **Fog per-view** (`js/main.js:120-121`): Street 130–340, chart 700–1500 (depth culling).
- **FPS gate** (`js/main.js:3720-3727`): If <45 fps in first 4s startup, silently disable post-processing (preserves 60 fps on mobile).

### 7. Audio System (100% Procedural Synthesis)
- **No audio files** (`js/audio.js:1-431`): All SFX + ambience synthesized via Web Audio API.
- **SFX palette**: Wind, water-lap, gulls, rooster, fire-crackle, footsteps, bleat, splash, bell, page-turn, wind-rush (Pentecost), horns.
- **Ambience chains**: Master → [ambience (ducked when card open) + sfx] + dynamics compressor + destination.
- **Distance-based ducking**:
  - `waterDistGain`: Proximity to shore (0–30 units → gain 0–0.085).
  - `fireDistGain`: Proximity to fire (0–22 units → gain 0–0.4).
  - `crackleTimer` + stochastic fire-pops.
- **Background pads** (`js/audio.js:71-73, 121-123`):
  - Day: D3–A3–D4 (open 5th, warm).
  - Night: A2–E3–C4 (minor, cool).
  - Breathing LFO (0.045 Hz, modulate pad envelope).
- **Mute state** (`js/main.js:1797-1799`): Persisted in `save.muted`, mute button in HUD.
- **Context suspend/resume** (`js/audio.js:359-367`): On tab blur/visibility change, pause synthesis.

### 8. Save/Persistence
- **Single localStorage slot** (`js/main.js:1656-1662`): `SAVE_KEY = '__fishermans_chart__'`.
- **Schema**: `{charted: [], epilogueShown: false, muted: false, sheep: [], sheepHint: false, name: ''}`.
- **Trigger**: Each visit → `fillRelic()` → `persistSave()`.
- **Souvenir name** (`js/main.js:2126-2135`): Input validated, persisted (used in epilogue souvenir card).
- **Private mode fallback** (`js/main.js:1662`): Try/catch, silently fail on localStorage access.
- **Reset button** (`js/main.js:1749-1751`): On intro screen if `save.charted.length > 0` (restart link).

### 9. Special Mechanics
- **Water-walk** (`js/main.js:2330-2462`): Site 3 (Fourth Watch).
  - Path: WW_BOARD → WW_DROP → WW_MARKER (Catmull-Rom).
  - Phases: approach → walk → stumble (sinking) → rescue (light beam) → arrived (open card).
  - Physics: Wind gust (gustDir), sinking depth (waterWalkSink), rescue beam targeting.

- **Voyage to Rome** (`js/main.js:2220-2280`): Site 13.
  - 30s scripted camera+player follow, seaWater haze, caption system.
  - Starts at JOPPA_BOARD, ends at ROME_LANDING.

- **Rest/Sitting** (`js/main.js:3180-3280`, sabbath-pack):
  - 3 spots: first-fire, second-fire, gethsemane.
  - Gating: Only appear after prerequisite gate visited.
  - Interaction: Sit → 20s timeline (pose → camera pull → 5s psalm read → shooting stars → stand+restore).
  - Psalm verses: `REST_VERSES` (Psalm 23:1, 46:10, 62:5, 127:2).

- **Lilies** (`js/main.js:644-713`, sabbath-pack):
  - 3D flora at Gethsemane (site 5).
  - Geometry: Plane-based petals, glow via bloom.
  - Render: Tied to `lilyIdx` counter, 240 total instances.

- **Jonah's fish** (`js/main.js:3281-3338`, adoption-pack):
  - Swims lake near site 2 (Capernaum).
  - Feeds lost sheep hints: When all sheep visited, Jonah surfaces with hint.

- **Pet lamb** (`js/main.js:3340-3380`):
  - Easter egg: Appears after 12/12 sheep collected.
  - Follows player, bleats, simple pathfinding.

### 10. Mobile Support
- **Touch joystick** (`js/main.js:1581-1620`):
  - Left half of screen (<45vw), pointer capture.
  - Ring visual feedback (dashed circle).
  - Spring-back to center when released.

- **Responsive design** (`styles.css:790-798`):
  - Breakpoint 700px (landscape orientation).
  - Chart-key width shrinks, compass repositions, buttons resize.
  - User-scalable=no (viewport meta).

- **Haptic** (`js/main.js:3146`): Attempt `navigator.vibrate()` (may not work on all devices).

- **No pinch-zoom**: Single-touch only (e.g., drag with right pointer = camera look).

### 11. 3D Scenes & Terrain
- **Landmasses** (`js/main.js:46-80`):
  - MAIN_LAND: Galilee + Jerusalem (closed polygon).
  - LAKE: Sea of Galilee (hole carved into MAIN_LAND).
  - ROME_LAND: Far west, reached only by voyage script.

- **Terrain generation** (`js/main.js:440-557`):
  - `extrudeLand(points, topColor, sideColor)`: Extrusion mesh with side faces.
  - Materials: `sandTex` (Galilee), `romeTex` (Rome), `dirtTex` (road).
  - Walkable check: `isWalkable(x, z)` (ray-cast / polygon containment).

- **Colliders** (`js/main.js:200, 265-268`):
  - Axis-aligned boxes (AABB).
  - Manual collision response: `collide(px, pz)` pushes player out.
  - Golgotha exclusion: `CROSS = {x:-40, z:116, r:10}` (must view from distance, per Luke 23:49).

- **Landmark labels** (`js/main.js:341-370`):
  - Tappable text sprites.
  - Range-based LOD (fade out if >range).
  - Store in `tapTargets[]` for raycasting.

### 12. Shepherd & Adoption System
- **Shepherd NPC** (`js/main.js:1299-1410`):
  - Model: Basalt head + robe, appears near site 11 (Three-questions).
  - Uses "talker" sprite system (reusable class).

- **Speech bubble** (`js/main.js:3101-3180`):
  - State: "부탁" (request) ↔ "감사" (thanks).
  - Trigger: All sites visited → switches to thanks.
  - Texture: `makeBubbleTexture()` dynamically regenerates.
  - Opacity fade (lerp), bobbing y-animation.

---

## Existing Patterns & Conventions

1. **Naming**: Korean comments (inline `//`), camelCase vars, semantic function names tied to narrative.
2. **Three.js workflow**: r160 CDN, raw WebGL (no Babylon/Unreal), manual state mgmt.
3. **Time loop**: `animate()` requestAnimationFrame, `dt = clock.getDelta()`, `t = clock.elapsedTime`.
4. **State machine**: `state = {started, modal, visitedCount, nearSite, epilogueShown, view}`.
5. **Card/UI pattern**: Overlay `<div>` with `.hidden` class toggle, z-index layering (30=overlays, 10=HUD).
6. **Event flow**: Keyboard/pointer → state → `openCard(marker)` → `fillRelic()` → `persistSave()`.
7. **Gating**: `unlocked(marker)` checks `gate` field and prerequisite `visited` status.
8. **Audio dispatch**: `audio.play(name, opts)` (string-based switch), all check `ctx && ctx.state === 'running'`.

---

## Constraints & Dependencies

1. **Three.js r160** (CDN importmap, `js/main.js:16-17`): No bundler, direct ES6 modules.
2. **Web Audio API**: No fallback (graceful silent fail on unsupported browsers).
3. **localStorage**: Only persistence layer; private mode fallback via try/catch.
4. **No build step**: Direct browser import, no TypeScript, no minification (Vercel handles that).
5. **Responsive design**: Threshold 55vw for touch joystick (left vs. right half).
6. **Korean language lock-in**: All UI text, fonts (Noto Serif KR, Nanum Myeongjo), comments. Pivoting would require full re-code.
7. **Single-player**: No networking, no multiplayer, no server.
8. **Mobile constraints**: Single-touch only, no multi-touch, no gyro/accelerometer, no persistent file system.
9. **Performance**: ~50 KB JS gzipped (estimate), <100 draw calls per frame (WebGL 1 compatible).

---

## Known Gaps (GOTY Candidates)

### **CRITICAL**

1. **NO TITLE SCREEN / MAIN MENU**
   - Game launches directly to intro overlay (story premise + controls hint).
   - Missing: Title art, main menu (New Game / Continue / Settings / Quit).
   - No pause menu in-game (can't pause mid-exploration).
   - Settings only accessible via intro screen (restart needed to change).
   - **Impact**: Player feels unsupported if confused; no graceful pause between intense scenes.

### **MAJOR**

2. **NO MUSICAL SCORE / BACKGROUND MUSIC**
   - `js/audio.js` is 100% SFX + ambient texture (wind, water, gulls, crackle).
   - No orchestral/instrumental theme, no leitmotif tied to Peter's emotional arc.
   - No score crescendo during finale.
   - Audio described in `progress.md` as "procedural soundscape" — technically sophisticated but emotionally thin.
   - **Impact**: Game lacks emotional underscore; feels quieter than peers.

3. **NO ENDING / EPILOGUE CINEMATICS**
   - After all 14 sites visited:
     - Finale: Brief 15s camera flyby around basilica (js/main.js:3599-3642), 3 horn notes.
     - Epilogue: Static text overlay (4 paragraphs from `sites.js:313-332`) + input name field + souvenir card download.
   - Missing: Closing credits, voiceover narration, closing cinematic scene.
   - **Impact**: Anticlimatic ending; player feels game just "stops" rather than reaching a climax.

### **MODERATE**

4. **NO LOCALIZATION**
   - Entire codebase Korean-only: index.html, styles.css, all narrative text in main.js.
   - No i18n framework; full re-code needed for other languages (Turkish, English, etc.).
   - guide.html embedded text + hardcoded SITES export.
   - **Impact**: Game inaccessible to non-Korean speakers; limits global audience.

5. **ACCESSIBILITY GAPS**
   - No screen reader support (no ARIA labels, minimal semantic HTML).
   - No colorblind mode (UI heavily relies on red #a8341f for emphasis).
   - No text-scale controls (browser zoom only).
   - No keyboard remapping (hardcoded WASD + E + M).
   - No fullscreen API (F11 only).
   - HUD layout breaks at very small screens (<320px width).
   - **Impact**: Excludes visually impaired, motor-impaired, and low-vision players.

### **MINOR**

6. **TUTORIAL / ONBOARDING THIN**
   - Touch-hint appears once (6.5s auto-hide), never again (`js/main.js:1764-1775`).
   - No in-game tutorial for special mechanics (water-walk, resting, sitting, sheep collecting).
   - Control hints (E, M) printed on static intro screen only.
   - First-time water-walk discovery: No preflight warning (player just walks into sea).
   - **Impact**: Players may miss hidden mechanics, especially on mobile.

7. **NO SETTINGS / PREFERENCES MENU**
   - Only mute toggle persists.
   - No graphics quality presets (post-processing is all-or-nothing per FPS gate).
   - No FOV adjustment, no camera sensitivity slider, no mouse speed.
   - No difficulty/pacing modes (e.g., slowmo for reading, auto-nav to next site).
   - **Impact**: One-size-fits-all experience; advanced players can't optimize.

8. **PERFORMANCE MONITORING & TELEMETRY**
   - No in-game FPS counter, no performance warning UI.
   - FPS gate (js/main.js:3720) silently disables post-processing; user unaware of degradation.
   - No error logging, no analytics (no Google Analytics, no Sentry).
   - Deployment relies on Vercel's built-in stats only.
   - **Impact**: Can't diagnose user performance issues; silent failures.

9. **SOCIAL / SHARING FEATURES PARTIAL**
   - Souvenir card download: Name input + canvas screenshot → PNG.
   - Navigator.share() fallback (js/main.js:2150): Mobile share sheet.
   - Missing: Leaderboard (e.g., fastest completion time), replay/share URLs, spiritual reflection export (e.g., PDF prayer journal), social badges.
   - **Impact**: Reduced replay value and community engagement.

10. **MOBILE UX GAPS**
    - No landscape lock (portrait assumed, would need media query lock).
    - No haptic feedback beyond navigator.vibrate (unreliable).
    - Joystick responsiveness untested on high-DPI tablets.
    - No PWA (no service worker, no offline mode, no install prompt).
    - No native app wrapper (would need Cordova/React Native).
    - **Impact**: Mobile experience fragile; can't guarantee touch responsiveness across devices.

11. **PERFORMANCE & LOAD TIME**
    - No preloading spinner (geometry builds synchronously on page load, can stall on slow devices).
    - Three.js r160 + postprocessing can spike GPU at first-frame.
    - No lazy-load for distant sites (all 14 environments baked upfront).
    - No texture atlasing (inline canvas textures per mesh → many draw calls).
    - **Impact**: First load can feel janky; no visual feedback during startup.

12. **EASTER EGGS / HIDDEN CONTENT (VERY MINOR)**
    - Pet lamb (12/12 sheep) is only hidden unlockable.
    - No secret sites, no developer commentary, no debug cheats.
    - **Impact**: Low replayability; only one "easter egg" payoff.

---

## Codebase Health

| Metric | Value |
|--------|-------|
| Total JS | 5,026 lines |
| js/main.js | 4,263 (85%) |
| js/sites.js | 332 (data layer) |
| js/audio.js | 431 (modular) |
| index.html | 145 |
| styles.css | 799 |
| guide.html | 157 (printable) |
| **TODOs/FIXMEs** | 0 found |
| **Modules** | 3 ES6 (no bundler) |
| **Dependencies** | Three.js r160 (CDN) |
| **Build** | None (direct browser) |

**Code quality**: Korean comments consistent, camelCase naming, no legacy syntax. Monolithic main.js but well-organized (scene setup → game systems → loop). No technical debt visible.

---

## Open Questions for Planner

1. **Priority ranking**: Which gap is highest priority for "GOTY"?
   - Title screen & pause menu?
   - Music score?
   - Ending cutscene?
   - Localization?
   - Accessibility?

2. **Localization scope**: Turkish + English + Korean, or KR-only intentional?

3. **Audio**: How important is orchestral score vs. current procedural soundscape? (Budget: composer cost?)

4. **Epilogue voiceover**: If we add ending cinematics, should narration be Korean voice actor?

5. **Replayability**: New Game+ mode, or single playthrough per device?

6. **Target audience**: Church/educational use (hence guide.html), or general audience?

7. **Performance ceiling**: Current FPS gate at 45. Push to 60 on mobile? Or keep 45 as baseline?

8. **Narrative**: Strictly linear, or should there be branching endings / player choice paths?

---

## Scout Deliverables

- **Path**: `/Users/yeojooncho/Fable5_Peter/tasks/scout-goty.md`
- **Findings**: 12 major gaps identified, ranging from critical (no title screen) to very minor (no debug tools).
- **Codebase reviewed**: 5K lines; no TODOs, clean conventions, well-structured.
- **Constraints noted**: Korean-only, no i18n framework, single-player, CDN-based (no build step).

**Status**: Ready for planner to prioritize gaps and scope GOTY roadmap.
