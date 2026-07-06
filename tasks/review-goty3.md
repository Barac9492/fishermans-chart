# REVIEW — GOTY Phase 3: 게임필 (Traversal Feel)

Reviewed: `git diff` (js/main.js only, +61/-18) vs `tasks/plan-goty3-feel.md` and
`tasks/progress-goty3.md`. Fresh read, no reliance on implementer's claims —
traced every gate, every caller of the touched globals (`player.rotation.x`,
`player.position.y`, `cam.yaw`, `camera.fov`), and the full `waterWalk` /
`voyage` / `finale` / `sitting` / `leapFx` / `tombRun` state machines.

## Findings

### MINOR — bank spike risk on the game-Start transition (not neutralized)
`js/main.js:1789` (`start-btn` click handler, pre-existing code, untouched by
this diff) reassigns `cam.yaw` **instantaneously** (synchronous, outside the
RAF loop) to `atan2(camera.position.x - player.position.x, ...)`, matching
whatever angle the title-screen orbit camera happened to be at. Before this
diff, `cam.yaw` was cosmetic-only during title (only `_camPos`/`_lookGoal` used
it via the orbit formula, `cam.yaw` field itself was untouched during title).
Now `js/main.js:4078-4079` differentiates every frame: `prevCamYaw` was last
synced to the *old* `cam.yaw` on the frame before Start was clicked; on the
first `animate()` frame after Start, `freeCam` flips true and
`yawRate = angleDelta(prevCamYaw, cam.yaw) / dt` sees the full instantaneous
jump over one `dt` (~1/60s), producing a synthetic yaw-rate that saturates the
`bankGoal` clamp (`FEEL.bankMax = 0.035` rad ≈ 2°) for one frame right as
gameplay begins.
- **Failure scenario**: player waits 20s on the title screen (orbit angle has
  drifted far from 0), clicks Start — screen tilts up to 2° for a fraction of a
  second exactly as the world becomes controllable, then untilts over ~0.2s
  (`dt*5` lerp). Capped and smoothed so it's likely imperceptible, but it is an
  edge case neither the plan (§4, only chartView/finale called out) nor the
  progress log's self-check (item 8: joystick only) considered. Cheap fix:
  sync `prevCamYaw = cam.yaw` in the `start-btn` handler right after the
  `cam.yaw = atan2(...)` reassignment.

### MINOR — dust-while-walking now also fires during water-walk free phase
`js/main.js:3978-3984` (`speedNow > 3` dust gate) uses the same movement code
path as `waterWalk.phase === 'walk'` (state.modal is false during that phase,
confirmed at `js/main.js:2541`). Previously dust required `running`, so it
only fired on the water-walk light-path if the player also sprinted across it
(already a latent pre-diff oddity — dust puffs over water on Shift-sprint).
This diff drops the `running` requirement to `speedNow > 3`, and normal
walking speed (7.5 m/s target, ACCEL 26 m/s²) exceeds 3 m/s in ~0.12s from a
standstill — so now **ordinary walking** across the lightpath during Matthew
14 also spawns ground-dust puffs on the lake surface, not just sprinting.
- **Failure scenario**: player walks (no Shift) toward the figure during the
  water-walk scene; visible dust puffs (a "dry ground" VFX) appear on the
  water surface at `y=0.12`, breaking the "walking on water" illusion the
  scene is built around. Plan §6 only says "걷기에도 옅게" (light dust on
  land walking) — extending the same unconditional gate onto the one scripted
  surface where dust reads as wrong wasn't discussed by plan or progress log.
  Not a crash/regression in the mechanical sense, but a visible spec-adjacent
  gap the implementer should confirm live (a `!waterWalk` or `onHolyLand`
  guard on the dust block would fix it cheaply).

### NOTE — camera bank is live during `voyage` (undeclared, but plausibly fine)
Plan §4 only lists "chartView·finale에서는 bank 목표 0" — it doesn't mention
`voyage`. Since `voyage` auto-steers `cam.yaw` toward the boat's heading every
frame (`js/main.js:4047`, `angleLerp(cam.yaw, voyageBoat.rotation.y + Math.PI,
1 - Math.pow(0.5, dt))`), and `freeCam` (`js/main.js:4072`) does **not**
exclude `voyage`, the storm-rocking boat now also rolls the camera up to 2°.
This reads as a plausible feature (rocking boat → subtle roll) and is capped
identically to the free-walk case, but it is an undeclared deviation from the
literal plan text and worth a one-line confirmation, not a blocking issue.

### NOTE — dust "옅게" (light) claim relies entirely on frequency, not amplitude
`js/main.js:3979-3984`: at `speedNow > 3`, walking reaches the gate almost
immediately (~0.12s from standstill given ACCEL=26). The only difference
between walking and running dust is the timer period (0.5s vs 0.16s) — there
is no puff-size/opacity scaling by speed. This matches the plan's own text
("먼지 위치 기준을 … dustAt에 세기 인자가 없으면 그대로(빈도 차이만으로
충분)"), so it's plan-compliant, not a bug — flagged only so the "충분
(sufficient)" assumption gets a live sand vs. dirt look-check before ship,
per review brief §6.

## Verified clean (no findings)

- **Momentum/collision chain** (`js/main.js:3945-3960`): axis-wise
  `isWalkable` rejection correctly zeroes only the blocked axis's velocity
  component (`nx` check zeroes `velX`, independent `nz` check zeroes `velZ`);
  the accel/decel clamp is symmetric and self-corrects every frame when
  pushed into a wall — no runaway growth, no residual "sticking" drift.
- **Gated-frame reset** (`js/main.js:3958-3960`): the `else` branch resets
  `velX = velZ = 0` for every condition in the same gate list used pre-diff
  (`state.modal || voyage || finale || sitting || paused || credits`); traced
  `beginCard`/`startWaterWalk`/`startFinale`/`startVoyage`(-equivalent)/
  `startEclipse`/`startSleep`/`startNetsRide` — all set `state.modal = true`
  synchronously (outside the RAF loop) before the next `animate()` frame, so
  no residual-velocity teleport is possible on cutscene entry or card open.
  `flowBusy`/`leapFx`/`netsRide` are *not* in the gate list, but this is
  byte-identical to pre-diff code (`git show HEAD:js/main.js` confirms the
  gate condition is unchanged) and those flows never touch `player.position`
  via the free-move inertia path in a way that conflicts — not a regression.
- **Water-walk 'walk' phase inertia**: confirmed intentional per plan — the
  gust nudge (`updateWaterWalk`, `js/main.js:2559-2567`) runs *after* the
  free-move block in `animate()` (unchanged ordering), so gust and
  player-input inertia compose the same way they did before this diff.
- **walkPhase/bob/footstep/dust gating on speedNow**: footstep gate
  (`speedNow > 0.8`) and bob scale (`Math.min(1, speedNow/SPEED)`) correctly
  continue firing through the glide-to-stop (DECEL=18 m/s² from 7.5 m/s takes
  ~0.37s to cross the 0.8 threshold) and correctly stop once `speedNow`
  decays below the gates at a true standstill. No stationary false-fire.
- **FOV kick**: `camera.updateProjectionMatrix()` (`js/main.js:4076`) is only
  called inside the `Math.abs(camera.fov - fovGoal) > 0.05` branch — not
  every frame. `freeCam` correctly excludes chartView/finale/title-orbit
  (`!state.started`); resize handler (`js/main.js:4474`) is independent and
  doesn't fight this.
- **Camera bank accumulation**: `camera.rotateZ(bankLerp)` is applied once
  per frame, immediately after a fresh `camera.lookAt(lookTarget)`
  (`js/main.js:4070-4082`) which resets orientation from scratch every frame
  — `rotateZ` is relative but to a freshly-computed base, so no cross-frame
  accumulation. `angleDelta` wrap-around verified numerically correct at the
  ±π boundary (node-tested: `angleDelta(3.13,-3.13)` and inverse both return
  the expected short way around, magnitude ≈0.023 rad).
- **Body lean**: `player.rotation.x` confirmed (via grep) unused anywhere
  else in the file outside this new lean block; sitting forces `leanGoal=0`
  and `updateSitting` never touches `player.rotation`; `ghostJohn.rotation.x`
  (tomb-race NPC) is a fully separate object, unaffected. `player.position.y`
  water-walk sink and `leapFx`'s scripted y-arc are applied *after* the
  general position.y line in per-frame order (`js/main.js:4017-4021`),
  so scripted phases still win last-write, identical ordering to pre-diff.
- **Per-frame allocation**: diff introduces zero new `THREE.Vector3`/object
  literals inside `animate()`'s hot path; `FEEL = {...}` is module-scope,
  created once at load.
- **Syntax**: `node --check` on the working file passes clean.

## Verdict

**SHIP** (with the two MINOR items worth a quick live look before/soon after
ship — neither blocks correctness, both are cheap to fix if confirmed):
1. Sync `prevCamYaw = cam.yaw` in the `start-btn` click handler to kill the
   theoretical one-frame bank spike at game start.
2. Consider gating the dust block with `!waterWalk` (or reuse the existing
   `onHolyLand`/`onRome` check already computed a few lines below for
   footstep sound) so walking no longer puffs dust on the lake surface during
   Matthew 14.

No BLOCKER or MAJOR findings — momentum/collision/reset chain, camera FOV/bank
math, and body-lean interactions are all correct and match the plan.
