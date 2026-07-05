# REVIEW — GOTY Phase 1: 주제곡 (Peter's Leitmotif Score)

Reviewed: `git diff` (js/audio.js +143/-2, js/main.js +18) against
tasks/plan-goty1-score.md and tasks/progress-goty1.md. `node --check` clean on
both files.

## Findings (most severe first)

### MAJOR — themeCall's gain-restoration event can capture a stale `musicMode`, reverting the bus to the wrong target if the mode changes again inside the ~5.8s themeCall window
`js/audio.js:557-559`
```js
music.gain.setValueAtTime(Math.max(music.gain.value, 0.09), t0);
const len = scheduleLine(THEME_A, 'maj', 0, t0 + 0.05, 0.62, 1, 'breath');
music.gain.setTargetAtTime(MODE_GAIN[musicMode] ?? 0, t0 + 0.05 + len, 2.0);
```
`MODE_GAIN[musicMode]` is evaluated **synchronously at call time** (when
`play('themeCall')` runs, ~150ms after start), not at the scheduled
restoration time (`t0+0.05+len`, ~5.8s later for THEME_A at BEAT=0.62).
Meanwhile `update()` (js/audio.js:508-512) schedules its own
`setTargetAtTime` on the *same* `music.gain` param every time `musicMode`
actually changes. Per the WebAudioAPI automation model, later-scheduled
events at earlier times do not get superseded by earlier-scheduled events at
later times — both remain queued and fire in time order. So: if the real
mode changes twice within the themeCall window (e.g. `galilee` →
`jerusalem` at t=3s because `duskW` crosses 0.6 while the player is standing
near the boundary, or, more robustly, `finale`/`silent` triggered by
fast-forwarding save-state restore before 5.8s elapses), the legitimate
mode-change event at t=3s (targeting jerusalem's 0.045) is later overridden
at t=5.8s by themeCall's captured stale target (`MODE_GAIN['galilee']=0.055`,
the mode active when the *button was clicked*), audibly popping the bus
back to the wrong loudness for a getting-quieter-then-louder-again 2s
glide, until the *next* real mode-change event (if any) corrects it. In the
worst case (mode never changes again until much later), the bus sits at the
stale gain until the next actual `o.music !== musicMode` transition, which
given `MODE_REST.galilee=[14,26]`s could be tens of seconds of wrong volume.
**Failure scenario**: start game in `galilee` at duskW=0.61 (just above the
0.6 threshold) with duskW ticking down each frame; if it crosses 0.6 within
~5.8s of clicking start (plausible during dusk cycling, or a save
restored near a threshold), `update()` schedules jerusalem's 0.045 target
at t≈4s, then themeCall's leftover `setTargetAtTime(0.055, 5.8, 2.0)` fires
1.8s later and pulls the bus back up to `galilee`'s louder level while the
narrative context is already `jerusalem` — an audible, unmotivated
loudness swell with no corresponding phrase change, until the next mode
transition. Not a crash, but a real, user-audible defect within the plan's
"관상적/절대 시끄럽지 않게" aesthetic goal.
**Not caught by self-check**: progress-goty1.md item 5 confirms ducking's
`setTargetAtTime` but the themeCall-vs-mode-change race was never traced
through with two mode changes in sequence — only single-transition code
reading was done.
Fix options: capture `MODE_GAIN[musicMode]` value *at the scheduled
restoration time* isn't possible synchronously; instead, either (a) have
`update()`'s mode-change branch always win by re-issuing its own
`setTargetAtTime` unconditionally once at every mode change (already true)
but additionally **skip themeCall's restoration entirely if a real mode
change happened after themeCall was scheduled and before it resolves**, or
(b) read `MODE_GAIN[musicMode]` lazily via a `setValueCurveAtTime`-free
polling in `update()` rather than a one-shot event fired inside `play()`.
Simplest: don't schedule an explicit restoration in `themeCall` at all —
instead special-case: on `themeCall`, only bump `music.gain` if
`musicMode==='off'` transiently and let the *next* natural mode-change
event (which will fire within a frame or two of start, since `galilee`
supersedes `off` almost immediately) supply the real target — i.e. rely on
the existing update() mode-change path instead of a second competing
automation source on the same param.

### MINOR — themeCall can be silently dropped if `ctx.resume()` hasn't completed within 150ms (no retry, no fallback)
`js/audio.js:538` (`if (!ctx || ctx.state !== 'running') return;`), `js/main.js:1785` (`setTimeout(() => audio.play('themeCall'), 150)`)
`ctx.resume()` (js/audio.js:471) is async; on iOS Safari / throttled devices
resume can take longer than 150ms after a fresh `AudioContext` is
constructed synchronously in the click handler. If so, `play('themeCall')`
returns early and the intro theme never sounds for that session — no error,
no retry, node graph untouched (no leak), just a silently missed one-shot.
Progress log already discloses this as a known risk (deviation #2) and
picked a heuristic delay; flagging because the mitigation is unverified
(no listener/retry on `statechange`) and the self-check item 2 could not
actually confirm real-device timing (headless, "코드 경로 확인" only).
Low impact (cosmetic miss of an intro sting) — does not affect the main
mode-driven score, which is independently driven by every animate() frame
once ctx is running.

### MINOR — plan's "≤20 oscillators per phrase" ceiling is interpreted as 36 concurrent oscillators in `finale` mode across two back-to-back `scheduleLine` calls
`js/audio.js:174-177`, disclosed in tasks/progress-goty1.md deviation #3
`schedulePhrase('finale')` issues THEME_A (18 osc) immediately followed by
THEME_B one octave up (18 osc) starting exactly when THEME_A's scheduled
notes end (`t0 + a`) — but `breathNote`'s release tail extends
`dur + 0.45s` past each note's `when` (js/audio.js:103-126), so THEME_B's
first notes' oscillators start firing while THEME_A's final note's
release tail (and its `vib` LFO) are still ringing down. Concurrent live
oscillator count can transiently exceed 20 (up to ~20 overlap for a few
hundred ms) even though each `scheduleLine` call individually respects the
per-call ceiling. The progress log discloses this reading of the
constraint ("소절당" = per `scheduleLine` call, not per narrative "발화");
it's a defensible interpretation but is the kind of undeclared trade-off
the plan's CPU-safety intent ("오실레이터 ≤ 20개, 누수 금지") was likely
trying to bound at the true concurrent-voice level, not the call-count
level. No functional bug (every oscillator still gets its `.stop()`
scheduled — verified in scheduleLine/breathNote/pluckNote — so there is no
leak), just a plan-conformance judgment call worth confirming with the
phase owner since `finale` is also the moment horns (`js/main.js:3637`)
are firing on the sfx bus concurrently, compounding total simultaneous
oscillator count across buses (not itself a webaudio limit issue —
modern engines handle hundreds of oscillators — but contradicts the
letter of the constraint).

### NOTE — `markerById['first-fire'].visited` / `['second-fire'].visited` drop the plan's optional chaining (`?.`) without being called out as a deviation
`js/main.js:3723-3724` vs plan `tasks/plan-goty1-score.md:95-96` (`markerById['first-fire']?.visited`)
Verified safe: `sites.js:118` and `sites.js:205` register `id: 'first-fire'`
/ `id: 'second-fire'` unconditionally, and `markerById` is populated for
every site at module init (`js/main.js:1131-1132`) before `musicMode()` can
ever be invoked (only called inside `animate()`, well after module load).
So there is no live NPE risk. Flagging only because the progress log
frames this as "계획의 분기 그대로" (line 31) when it's actually a
(harmless) deviation from the literal plan text that should have been
named as such per the workflow's "이탈 사항 declare" norm — process nit,
not a functional defect.

### NOTE — post-redemption night still renders as `jerusalem` (tense minor) rather than `dawn`
`js/main.js:3723-3728` (plan's own pseudocode, copied verbatim)
If `restored===true` but `duskW<0.3` (deep night after the second-fire
visit), the branch order falls through `restored && duskW>0.45` (false) to
`duskW<0.3` (true) → `'jerusalem'`. This means late at night after
Peter's restoration, the score reverts to the pre-redemption tense minor
mode rather than a "restored" flavor, which may or may not be the intended
emotional arc. This is inherited directly from the plan's own branch order
(not an implementer deviation), so it's a design question for the phase
owner, not a code defect.

## Regression checks performed
- `padDay`/`padNight`: confirmed zero diff lines touch these (grep of diff
  context only, js/audio.js — both `let` declarations appear unchanged).
- `audio.update(dt, o)` signature: single call site
  (`js/main.js:4240`), additive `music` field, no other consumers exist —
  backward compatible.
- Master mute: `music.connect(master)` (js/audio.js:466) confirmed —
  existing `setMuted` path silences music with no extra code, matches plan F.
- Node lifecycle: every oscillator created in `breathNote`/`pluckNote`/
  `scheduleLine`/`themeCall` has a matching `.stop()` scheduled
  (`o.stop`, `vib.stop`) — no leak found.
- `musicMode()` guarded by `state.started` before any narrative flags are
  read; `eclipse`/`sleepFx`/`sitting`/`finale`/`duskW` are all module-level
  and defined before `musicMode()`'s only call site (js/main.js:4245,
  inside `animate()`, which never runs meaningfully before those `let`s
  are initialized at module load). `node --check` passes on both files.
- Ducking: `musicDuck.gain` uses GainNode default (1.0), extended from the
  existing `o.ducked` branch — same pattern as ambience, no new race.
- `finale` horns use the separate `sfx` bus (`js/main.js:2498,3637` →
  `js/audio.js:406 horn()` → `sfx`), confirmed independent from `music` bus
  — finale's musical overlap-with-horns intent from the plan is satisfied.

## Verdict: FIX-THEN-SHIP

Ship blocker is the MAJOR themeCall/mode-change gain race (audibly wrong
bus loudness in a narrow but real window). The two MINORs (themeCall
possibly dropped on slow resume; finale's concurrent-oscillator reading of
the "≤20" constraint) are acceptable to ship as-is or fix at the
implementer's discretion — they don't produce audible defects on their own.
The two NOTEs are process/design flags only, no code change required.
