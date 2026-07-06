# REVIEW — GOTY Phase 4: 화가의 붓 (Art-Direction Pack)

Reviewed: `git diff` (js/main.js only, +251/-5) vs tasks/plan-goty4-art.md and
tasks/progress-goty4.md. All claims below independently re-derived from code
(UV math worked out numerically, not taken on the implementer's word).

## Findings

### NOTE — Tint overlay relies on incidental fog-range headroom, not an explicit guarantee
`js/main.js:586-589` (tint material has no `fog:false`); chart camera at
`CHART_CAM_POS (0,360,105)` (main.js:125) gives max camera→ground distance
≈ sqrt(360² + 205²) ≈ 414, and `FOG_VIEWS.chart.near = 700` (main.js:121) —
so fog never actually reaches the map in chart view today. This is correct
behavior (overlay fades in sync with the ground it sits on in street view,
which is the right call), but it is not defensive: if chart camera height or
`FOG_VIEWS.chart.near` is ever tuned down in a future phase, the overlay would
silently start fading out top-down without anyone touching this file. Not a
regression now — flagging so it isn't rediscovered as a mystery bug later.

### NOTE — Shore-color shallow band (0–6 units) is coarse on the open-sea grid
`js/main.js:392` `waterGeo = PlaneGeometry(780, 460, 70, 60)` → cell size
≈ 11 × 7.6 units per quad, vs. the 0–6 unit brightening band computed in
`bakeShoreColors` (main.js:428-441). Only the single row of vertices nearest
MAIN_LAND's coastline will show the brightened color; the gradient will read
as a hard-ish band rather than a smooth 6-unit falloff on the sea mesh (the
20×20 lake grid, 64/62 units → ~3.2×3.1 cell, fares much better). This is a
resolution limit inherent to the plan's own grid choice (plan explicitly
specified "71×61 + 21×21 정점" and 0-6 unit falloff), so it's spec-compliant,
just worth knowing before someone expects a creamy gradient on the sea side.

### NOTE — `ridgeMat`/`ridgeTex` shared across all 4 compass sprites
`js/main.js:1644-1657`: one `SpriteMaterial` and one canvas texture instanced
across N/E/W/SW ridges (`ridges.map(...)` reuses `ridgeMat` directly). Opacity
and color lerp are therefore identical for all four at every frame — intended
per the plan's texture-budget deviation (1 canvas instead of 4), and visual
variety still comes from per-sprite scale/mirroring (`sx`/`sy`), so this is
not a defect, just confirming the "1장 공유" claim is accurate and consistent.

## Verified correct (no defect found, contradicts nothing in plan)

- **Tint UV math** (main.js:577-589): independently re-derived the transform
  chain (ShapeGeometry UV = shape coords verbatim → `repeat(1/116,1/368)` +
  `offset(0.5, 163/368)`) — x∈[-58,58]→u∈[0,1], z∈[-205,163]→v∈[1,0], and with
  CanvasTexture's default `flipY=true`, v=1 (world z=-205, north) samples the
  canvas's top row (drawn via `Y(-205)=0`) — Galilee's green wash (drawn near
  canvas top since LAKE z is very negative) lands north as required. No v-flip
  bug, no x-mirror bug.
- **Z-fight mitigation**: tint sits at `y=0.02` (a real position offset, not
  just polygonOffset) above the y=0 ground, is `transparent:true` so three.js
  buckets it into the post-opaque render queue regardless of scene-add order,
  and stacks `polygonOffset(-2,-2)` + `depthWrite:false` on top. Layered
  defenses, not a single fragile trick — low residual z-fight risk even at
  grazing street-level angles.
- **`distToPoly` NaN fix is general, not a band-aid** (main.js:416-427): the
  `len2 < 1e-9` guard applies to any degenerate edge, not hard-coded to
  MAIN_LAND's specific duplicate-closing-point index. Confirmed MAIN_LAND's
  point[0]===point[17] (verified via direct list inspection) produces exactly
  one zero-length edge that is now skipped; confirmed LAKE has no duplicate
  point and is unaffected either way. A polygon where every edge is
  degenerate would leave `d=Infinity`→`k=1` (safe fallback), not NaN.
- **flatShading + vertexColors**: in three r160 (confirmed via importmap),
  `flatShading` only affects derivative-computed normals in the fragment
  shader, not color interpolation — vertex colors still interpolate smoothly
  across a flat-shaded triangle. No double-shading artifact.
- **No double color multiply**: both water materials set `color: 0xffffff`
  with the true color baked per-vertex (main.js:397/408, 428-441) — confirmed
  no other code path re-applies `COLORS.sea`/`COLORS.lake` to the material.
- **Wave loop doesn't clobber vertex colors**: animate's wave update
  (main.js:4536-4548) only touches `position.array[i*3+1]` and sets
  `sPos.needsUpdate=true` on the position attribute; `color` attribute is
  baked once at build time and never touched again.
- **seaFoam rotation fix verified by direct geometry-math derivation**:
  `PlaneGeometry(0.7,56)` + `rotateX(-π/2)` → 0.7 extent in world X, 56 extent
  in world Z — correctly a north-south strip, matches the west coastline
  segment `[-58,-160]→[-58,-60]` in MAIN_LAND. Independently reproduces the
  "before" bug description (56×0.7 would have cut east-west across the beach).
- **Character additions are pure children, zero group rebuild**: grepped for
  any `player.remove`/`legL.remove`/`.clear()` — none exist. `sitting` block
  (main.js:4199-4201) only mutates `legL/legR/armL/armR.rotation.x`; new
  sandals/hands are children of those exact meshes, confirmed added via
  `legL.add(sandalL)` / `armL.add(handL)` (main.js:1369-1370, 1384-1385) after
  the leg/arm clone step, not relying on `.clone()` to propagate children.
  `player.rotation.x` (lean, main.js:4210-4212) is a whole-group rotation —
  mantle/trim/hair/eyes are direct player children, rotate correctly with it.
- **castShadow scope matches plan exactly**: mantle + trim `castShadow=true`;
  hair, eyes, sandals, hands have no castShadow set (grepped to confirm).
- **Merged-geometry material consistency**: `trim` merges torus+seam box,
  both textured with a single `lambert(COLORS.woodDark)` call; `eyes` merges
  two spheres with a single `lambert(COLORS.ink)` call — one material per
  merged mesh in both cases, no mismatch.
- **Perf budget arithmetic checks out**: 15 new meshes/sprites (tint 1 +
  seaFoam 1 + character 8 [mantle, trim, hair, eyes, sandalL, sandalR, handL,
  handR] + ridges 4 + sunHalo 1 = 15) and 3 new canvases (tint, ridge,
  `radialSprite()`'s own fresh canvas for sunHalo) — both match plan ceilings
  exactly.
- **Zero per-frame allocation in the ridge/halo block** (main.js:4346-4353):
  all mutations are in-place (`Vector3.copy/addScaledVector`, `Color.lerpColors`,
  scalar opacity `+=`) — no `new THREE.*` or object literals in the loop.
- **`fog:false` correctly applied** to ridge material (main.js:1644) and
  inherited by sunHalo via the shared `radialSprite()` helper (main.js:1610,
  already used for sun/moon) — both bypass fog as required for
  beyond-fog-draw-distance sky elements; tint intentionally omits `fog:false`
  (see NOTE above — correct for a ground-level decal, not an oversight).
- **Neither tint, ridges, sunHalo, nor seaFoam are pushed to `tapTargets`** —
  no interference with tap/click raycasting.
- **Drive-by fixes are minimal and in-scope**: NaN guard is a 1-line skip
  inside the exact function it's needed in; seaFoam rotation fix is a 2-value
  constructor-argument swap. Neither touches unrelated code.
- **Scope discipline**: `git diff --stat` confirms only `js/main.js` changed
  (+251/-5), matching the plan's "js/main.js만 수정" constraint and the
  progress log's line-count claim exactly. `node --check` passes clean.
- **Second-fire coordinate deviation is justified**: plan said "z≈-120 서안"
  (an approximation); implementer used the actual site coordinate
  `{x:27, z:-141}` from `js/sites.js:209` — verified this is the real
  "두 번째 불" position, so the deviation is a correction, not a drift.

## Verdict: SHIP

No BLOCKER, MAJOR, or MINOR findings. All items are NOTEs about design
tradeoffs already implied by the plan (grid resolution, shared ridge texture,
fog headroom) rather than defects. Every claim in progress-goty4.md that was
checked (NaN fix generality, seaFoam fix, UV math, budget counts, shadow
scope, zero-allocation animate block, scope discipline) reproduced correctly
under independent verification.
