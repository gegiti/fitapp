# Morning Fit v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build the installable iPhone web app described in `docs/superpowers/specs/2026-09-04-morning-fit-design.md`: Plan tab (workouts built from a four-exercise bank) and Train tab (guided countdown session with two figures per exercise), offline-capable, with local persistence and file backup.

**Architecture:** Static site with no build step. Pure logic modules (`workout.js`, `session.js`, `store.js`) are framework-free and covered by `node --test`. Views are small DOM-building functions rendered by a hash router into one `<main>`. A service worker precaches the shell and figures. State is one JSON document saved to localStorage and IndexedDB on every change.

**Tech Stack:** HTML, CSS, JavaScript ES modules (browser native), Node 18 built-in test runner, Python 3 + cairosvg for generating figure SVGs and icons (tooling only).

## Global Constraints

- No npm dependencies. No bundler. `package.json` exists only for `"type": "module"` and the `test` script.
- All URLs relative (no leading `/`) so the app works from a GitHub Pages sub-path.
- Storage key `morningfit.v1`; corrupt copy key `morningfit.v1.corrupt`; state shape `{ version: 1, savedAt, workouts }`.
- Bank is exactly: pushups (60/20), jackknife (60/20), cat_cow (60/10), cobra (60/10). All strength/stretch as in spec 4.1. None sided.
- The last step's rest is never run and never counted in totals.
- Exercise time stepper: 5 s increments, min 5; sided exercises 10 s increments. Rest stepper: 5 s increments, min 0.
- Colours: bg `#0F1115`, card `#1C1F26`, raised `#262A33`, text `#F3F4F6`, muted `#9AA0AB`, strength `#F5A524`, stretch `#2DD4BF`, relaxed figure `#7C8290`, destructive `#F0645C`.
- Minimum tap target 44 px. Timer digits use `font-variant-numeric: tabular-nums`.
- Commit after every task with a conventional message.

---

## File map

| File | Responsibility |
|---|---|
| `package.json` | `"type": "module"`, `npm test` → `node --test test/` |
| `index.html` | Shell: `<main id="view">`, `<nav id="tabs">`, loads `js/app.js`, PWA meta |
| `manifest.webmanifest` | Name, icons, standalone display, colours |
| `sw.js` | Precache + cache-first for same-origin GETs, versioned cache |
| `assets/figures/*.svg` | 8 figure files (copied from `docs/mocks/figures`) |
| `assets/icons/icon.svg`, `icon-180.png`, `icon-512.png` | App icon |
| `css/app.css` | Tokens, layout, components |
| `js/exercises.js` | Bank data + `getExercise`, `figureUrl` |
| `js/seed.js` | `seedState()` → default state with the "Morning" workout |
| `js/workout.js` | Pure helpers: ids, steps, totals, formatting, reorder, clamps |
| `js/session.js` | Pure: `buildPhases`, `Session` state machine |
| `js/kv.js` | Storage adapters: `localAdapter`, `idbAdapter`, `memoryAdapter` |
| `js/store.js` | `parseState`, `validateBackup`, `createStore` |
| `js/clock.js` | `now()`, wake lock helpers |
| `js/audio.js` | Web Audio beeps + vibrate |
| `js/ui.js` | `el`, `sheet`, `toast`, `confirmAsync` |
| `js/router.js` | `parseRoute(hash)`, `startRouter(handler)`, `navigate(path)` |
| `js/app.js` | Boot: store load, router start, tab bar, SW registration |
| `js/views/plan.js` | Workouts list + backup/restore |
| `js/views/workout.js` | Workout editor + step sheet + drag reorder |
| `js/views/bank.js` | Bank list (browse/pick) + detail sheet |
| `js/views/train.js` | Pick workout + get-ready overlay |
| `js/views/session.js` | Session screen bound to `Session` |
| `js/views/done.js` | Done screen |
| `tools/figures.py`, `tools/render_mocks.py`, `tools/icon.py` | Generators (not shipped) |
| `test/workout.test.js`, `test/session.test.js`, `test/store.test.js` | Unit tests |

---

### Task 1: Project scaffold, bank data, seed

**Files:**
- Create: `package.json`, `.gitignore`, `js/exercises.js`, `js/seed.js`, `assets/figures/*.svg`, `tools/figures.py`, `tools/render_mocks.py`
- Test: `test/exercises.test.js`

**Interfaces:**
- Produces: `EXERCISES` (array), `getExercise(id) → exercise|null`, `figureUrl(id, "relaxed"|"flexed") → string`, `seedState() → { version: 1, savedAt: null, workouts: [...] }`.

- [x] **Step 1: package.json and gitignore**

```json
{
  "name": "morning-fit",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": { "test": "node --test test/" }
}
```

`.gitignore`: `__pycache__/`, `.DS_Store`.

- [x] **Step 2: Move the generators and emit figures into assets**

```bash
mkdir -p tools assets/figures
git mv docs/mocks/tools/figures.py tools/figures.py
git mv docs/mocks/tools/render_figures.py tools/render_figures.py
git mv docs/mocks/tools/render_screens.py tools/render_mocks.py
```

Edit `tools/render_figures.py` so `out = "../assets/figures"` when run from `tools/`, and keep the contact sheet going to `../docs/mocks/figures/`. Edit `tools/render_mocks.py` `out = "../docs/mocks/screens"`. Run both from `tools/` and confirm `assets/figures/` has 8 `.svg` files (PNGs are not needed in assets; delete them there).

- [x] **Step 3: Failing test for the bank**

`test/exercises.test.js`:
```js
import test from "node:test";
import assert from "node:assert/strict";
import { EXERCISES, getExercise, figureUrl } from "../js/exercises.js";

test("bank has exactly the four v1 exercises with spec defaults", () => {
  assert.deepEqual(EXERCISES.map(e => [e.id, e.type, e.sided, e.defaultSeconds, e.defaultRestSeconds]), [
    ["pushups", "strength", false, 60, 20],
    ["jackknife", "strength", false, 60, 20],
    ["cat_cow", "stretch", false, 60, 10],
    ["cobra", "stretch", false, 60, 10],
  ]);
});

test("getExercise returns null for unknown ids", () => {
  assert.equal(getExercise("nope"), null);
  assert.equal(getExercise("cobra").name, "Cobra");
});

test("figureUrl is relative", () => {
  assert.equal(figureUrl("cobra", "flexed"), "assets/figures/cobra_flexed.svg");
});
```

- [x] **Step 4: Run, expect failure** — `npm test` → "Cannot find module".

- [x] **Step 5: Implement `js/exercises.js`**

```js
export const EXERCISES = [
  { id: "pushups",   name: "Push-ups",          type: "strength", sided: false, defaultSeconds: 60, defaultRestSeconds: 20, cue: "Elbows tucked, chest to floor" },
  { id: "jackknife", name: "Jackknife sit-ups", type: "strength", sided: false, defaultSeconds: 60, defaultRestSeconds: 20, cue: "Reach hands to feet, fold at the hips" },
  { id: "cat_cow",   name: "Cat / cow",         type: "stretch",  sided: false, defaultSeconds: 60, defaultRestSeconds: 10, cue: "Move with the breath" },
  { id: "cobra",     name: "Cobra",             type: "stretch",  sided: false, defaultSeconds: 60, defaultRestSeconds: 10, cue: "Hips down, shoulders away from ears" },
];
const byId = new Map(EXERCISES.map(e => [e.id, e]));
export function getExercise(id) { return byId.get(id) ?? null; }
export function figureUrl(id, which) { return `assets/figures/${id}_${which}.svg`; }
```

- [x] **Step 6: `js/seed.js`**

```js
import { EXERCISES } from "./exercises.js";
export function seedState() {
  return {
    version: 1,
    savedAt: null,
    workouts: [{
      id: "w_morning",
      name: "Morning",
      steps: EXERCISES.map(e => ({ exerciseId: e.id, seconds: e.defaultSeconds, restSeconds: e.defaultRestSeconds })),
    }],
  };
}
```

- [x] **Step 7: Run tests, expect pass. Commit** `feat: scaffold, exercise bank, seed, shipped figures`.

---

### Task 2: workout.js (pure helpers)

**Files:** Create `js/workout.js`; Test `test/workout.test.js`.

**Interfaces (produces):**
- `newId(prefix = "w") → string`
- `makeStep(exerciseId) → { exerciseId, seconds, restSeconds }` (throws if unknown)
- `makeWorkout(name, exerciseIds = []) → workout`
- `totals(workout, getEx = getExercise) → { work, rest, total, count, strength, stretch, missing }` — seconds; `rest` excludes the last known step's rest; `missing` counts steps with unknown exercise.
- `formatDuration(seconds) → "m:ss"`
- `summaryLine(t) → "2 strength · 2 stretch"`
- `moveStep(steps, from, to) → steps'` (new array)
- `stepIncrement(exercise) → 5 | 10`
- `clampSeconds(value, exercise) → number` (min = increment)
- `clampRest(value) → number` (min 0)

- [x] **Step 1: Failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { makeStep, makeWorkout, totals, formatDuration, summaryLine, moveStep, stepIncrement, clampSeconds, clampRest } from "../js/workout.js";

test("makeStep copies defaults from the bank", () => {
  assert.deepEqual(makeStep("cobra"), { exerciseId: "cobra", seconds: 60, restSeconds: 10 });
  assert.throws(() => makeStep("nope"));
});

test("totals exclude the last step's rest and count types", () => {
  const w = makeWorkout("A", ["pushups", "jackknife", "cat_cow", "cobra"]);
  const t = totals(w);
  assert.equal(t.work, 240);
  assert.equal(t.rest, 50);          // 20 + 20 + 10, cobra's 10 excluded
  assert.equal(t.total, 290);
  assert.deepEqual([t.count, t.strength, t.stretch, t.missing], [4, 2, 2, 0]);
});

test("totals skip missing exercises, and last-known rest is excluded", () => {
  const w = { id: "x", name: "x", steps: [
    { exerciseId: "pushups", seconds: 60, restSeconds: 20 },
    { exerciseId: "gone", seconds: 60, restSeconds: 20 },
  ]};
  const t = totals(w);
  assert.deepEqual([t.work, t.rest, t.count, t.missing], [60, 0, 1, 1]);
});

test("formatDuration and summaryLine", () => {
  assert.equal(formatDuration(290), "4:50");
  assert.equal(formatDuration(5), "0:05");
  assert.equal(summaryLine({ strength: 2, stretch: 1 }), "2 strength · 1 stretch");
});

test("moveStep reorders without mutating", () => {
  const steps = ["a", "b", "c"].map(id => ({ exerciseId: id }));
  const moved = moveStep(steps, 0, 2);
  assert.deepEqual(moved.map(s => s.exerciseId), ["b", "c", "a"]);
  assert.deepEqual(steps.map(s => s.exerciseId), ["a", "b", "c"]);
});

test("increments and clamps", () => {
  assert.equal(stepIncrement({ sided: false }), 5);
  assert.equal(stepIncrement({ sided: true }), 10);
  assert.equal(clampSeconds(0, { sided: false }), 5);
  assert.equal(clampSeconds(0, { sided: true }), 10);
  assert.equal(clampRest(-5), 0);
});
```

- [x] **Step 2: Run, expect failure.**
- [x] **Step 3: Implement**

```js
import { getExercise } from "./exercises.js";

export function newId(prefix = "w") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}
export function makeStep(exerciseId) {
  const ex = getExercise(exerciseId);
  if (!ex) throw new Error(`Unknown exercise: ${exerciseId}`);
  return { exerciseId, seconds: ex.defaultSeconds, restSeconds: ex.defaultRestSeconds };
}
export function makeWorkout(name, exerciseIds = []) {
  return { id: newId(), name, steps: exerciseIds.map(makeStep) };
}
export function totals(workout, getEx = getExercise) {
  const known = workout.steps.filter(s => getEx(s.exerciseId));
  const t = { work: 0, rest: 0, total: 0, count: known.length, strength: 0, stretch: 0,
              missing: workout.steps.length - known.length };
  known.forEach((s, i) => {
    t.work += s.seconds;
    if (i < known.length - 1) t.rest += s.restSeconds;
    t[getEx(s.exerciseId).type] += 1;
  });
  t.total = t.work + t.rest;
  return t;
}
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
export function summaryLine(t) { return `${t.strength} strength · ${t.stretch} stretch`; }
export function moveStep(steps, from, to) {
  const out = steps.slice();
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}
export function stepIncrement(exercise) { return exercise.sided ? 10 : 5; }
export function clampSeconds(value, exercise) { return Math.max(stepIncrement(exercise), value); }
export function clampRest(value) { return Math.max(0, value); }
```

- [x] **Step 4: Run, expect pass. Commit** `feat: workout helpers`.

---

### Task 3: session.js (phases + state machine)

**Files:** Create `js/session.js`; Test `test/session.test.js`.

**Interfaces (produces):**
- `buildPhases(workout, getEx = getExercise) → Phase[]`
  - exercise phase: `{ kind: "exercise", stepIndex, exerciseId, seconds, sided, exerciseNo }`
  - rest phase: `{ kind: "rest", stepIndex, seconds, afterExerciseId, nextExerciseId }`
- `class Session` constructed with `(phases, nowMs)`:
  - `phase`, `index`, `finished`, `paused`, `exerciseCount`, `exerciseNo`
  - `elapsed(now)`, `remaining(now)`, `remainingWhole(now)`, `phaseProgress(now)`, `progress(now)`, `side(now)`
  - `pause(now)`, `resume(now)`, `toggle(now)`, `skip(now)`, `back(now)`, `end()`
  - `tick(now) → Event[]` where Event is `{ type: "countdown", value }`, `{ type: "side-switch" }`, `{ type: "phase-end" }`, `{ type: "finished" }`
  - `nextExercisePhase()` → next exercise phase after current index or null; `restBeforeNext()` → seconds of rest phase immediately following current exercise phase, else 0.

Time rules: all times in ms; elapsed = `now - startedAt - pausedTotal - (paused ? now - pausedAt : 0)`. On phase end, the overshoot carries into the next phase so long background gaps advance several phases in one tick.

- [x] **Step 1: Failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { buildPhases, Session } from "../js/session.js";
import { makeWorkout } from "../js/workout.js";

const W = makeWorkout("A", ["pushups", "jackknife", "cat_cow", "cobra"]);

test("buildPhases inserts rest after every step except the last, skips zero rest and missing", () => {
  const p = buildPhases(W);
  assert.deepEqual(p.map(x => x.kind), ["exercise","rest","exercise","rest","exercise","rest","exercise"]);
  assert.equal(p[1].seconds, 20);
  assert.equal(p[1].nextExerciseId, "jackknife");
  assert.equal(p[6].exerciseNo, 4);
  const w2 = { steps: [{ exerciseId: "pushups", seconds: 30, restSeconds: 0 }, { exerciseId: "gone", seconds: 9, restSeconds: 9 }, { exerciseId: "cobra", seconds: 30, restSeconds: 99 }] };
  assert.deepEqual(buildPhases(w2).map(x => x.kind), ["exercise", "exercise"]);
});

test("counts down, emits 3-2-1 once each, advances with carry-over", () => {
  const s = new Session(buildPhases(W), 0);
  assert.equal(s.remainingWhole(0), 60);
  assert.deepEqual(s.tick(57_000), [{ type: "countdown", value: 3 }]);
  assert.deepEqual(s.tick(57_500), []);
  assert.deepEqual(s.tick(58_000), [{ type: "countdown", value: 2 }]);
  assert.deepEqual(s.tick(59_000), [{ type: "countdown", value: 1 }]);
  assert.deepEqual(s.tick(60_250), [{ type: "phase-end" }]);
  assert.equal(s.index, 1);
  assert.equal(s.phase.kind, "rest");
  assert.equal(s.remaining(60_250), 19.75);   // 250 ms overshoot carried
});

test("a long gap advances several phases and finishes", () => {
  const s = new Session(buildPhases(W), 0);
  const ev = s.tick(10 * 60_000);
  assert.equal(s.finished, true);
  assert.equal(ev.at(-1).type, "finished");
});

test("pause stops the clock; resume continues", () => {
  const s = new Session(buildPhases(W), 0);
  s.tick(10_000);
  s.pause(10_000);
  assert.equal(s.paused, true);
  assert.deepEqual(s.tick(20_000), []);
  assert.equal(s.remainingWhole(20_000), 50);
  s.resume(20_000);
  assert.equal(s.remainingWhole(25_000), 45);
});

test("skip goes to next phase; back restarts, back twice within 2s goes to previous exercise", () => {
  const s = new Session(buildPhases(W), 0);
  s.skip(1_000);                       // → rest
  assert.equal(s.phase.kind, "rest");
  s.skip(2_000);                       // → jackknife
  assert.equal(s.phase.exerciseId, "jackknife");
  s.tick(12_000);
  s.back(12_000);                      // restart jackknife
  assert.equal(s.phase.exerciseId, "jackknife");
  assert.equal(s.remainingWhole(12_000), 60);
  s.back(13_000);                      // within 2 s → previous exercise (pushups), skipping the rest
  assert.equal(s.phase.exerciseId, "pushups");
  assert.equal(s.index, 0);
});

test("sided phase: side switches at midpoint, skip jumps to second side first", () => {
  const phases = [{ kind: "exercise", stepIndex: 0, exerciseId: "x", seconds: 90, sided: true, exerciseNo: 1 }];
  const s = new Session(phases, 0);
  assert.equal(s.side(0), "left");
  assert.equal(s.remainingWhole(0), 45);          // per-side countdown
  assert.deepEqual(s.tick(45_000), [{ type: "side-switch" }]);
  assert.equal(s.side(45_000), "right");
  assert.equal(s.remainingWhole(45_000), 45);
  const s2 = new Session(phases, 0);
  s2.skip(5_000);
  assert.equal(s2.side(5_000), "right");
  assert.equal(s2.finished, false);
  s2.skip(6_000);
  assert.equal(s2.finished, true);
});

test("progress, exerciseNo and next lookups", () => {
  const s = new Session(buildPhases(W), 0);
  assert.equal(s.exerciseCount, 4);
  assert.equal(s.exerciseNo, 1);
  assert.equal(s.nextExercisePhase().exerciseId, "jackknife");
  assert.equal(s.restBeforeNext(), 20);
  s.tick(30_000);
  assert.ok(Math.abs(s.progress(30_000) - 30 / 290) < 1e-9);
  s.skip(30_000); s.skip(30_000); s.skip(30_000); s.skip(30_000); s.skip(30_000); s.skip(30_000);
  assert.equal(s.phase.exerciseId, "cobra");
  assert.equal(s.nextExercisePhase(), null);
  assert.equal(s.restBeforeNext(), 0);
});

test("end() finishes immediately; ticking after finish is a no-op", () => {
  const s = new Session(buildPhases(W), 0);
  s.end();
  assert.equal(s.finished, true);
  assert.deepEqual(s.tick(1000), []);
});
```

- [x] **Step 2: Run, expect failure.**
- [x] **Step 3: Implement `js/session.js`**

```js
import { getExercise } from "./exercises.js";

export function buildPhases(workout, getEx = getExercise) {
  const steps = workout.steps.filter(s => getEx(s.exerciseId));
  const phases = [];
  steps.forEach((s, i) => {
    const ex = getEx(s.exerciseId);
    phases.push({ kind: "exercise", stepIndex: i, exerciseId: s.exerciseId, seconds: s.seconds, sided: !!ex.sided, exerciseNo: i + 1 });
    const last = i === steps.length - 1;
    if (!last && s.restSeconds > 0) {
      phases.push({ kind: "rest", stepIndex: i, seconds: s.restSeconds, afterExerciseId: s.exerciseId, nextExerciseId: steps[i + 1].exerciseId });
    }
  });
  return phases;
}

const BACK_WINDOW_MS = 2000;

export class Session {
  constructor(phases, now) {
    this.phases = phases;
    this.finished = phases.length === 0;
    this.totalSeconds = phases.reduce((a, p) => a + p.seconds, 0);
    this.lastBackAt = null;
    this._enter(0, now, false);
  }
  _enter(index, now, keepPaused) {
    this.index = index;
    this.startedAt = now;
    this.pausedTotal = 0;
    this.pausedAt = keepPaused ? now : null;
    this.sideSwitched = false;
    this.lastWhole = null;
  }
  get phase() { return this.phases[this.index]; }
  get paused() { return this.pausedAt != null; }
  get exerciseCount() { return this.phases.filter(p => p.kind === "exercise").length; }
  get exerciseNo() {
    let n = 0;
    for (let i = 0; i <= this.index && i < this.phases.length; i++) if (this.phases[i].kind === "exercise") n++;
    return n;
  }
  elapsed(now) {
    if (this.finished) return 0;
    const pausedNow = this.paused ? now - this.pausedAt : 0;
    return Math.max(0, (now - this.startedAt - this.pausedTotal - pausedNow) / 1000);
  }
  remaining(now) {
    if (this.finished) return 0;
    const p = this.phase;
    const e = this.elapsed(now);
    if (p.sided) { const half = p.seconds / 2; return Math.max(0, e < half ? half - e : p.seconds - e); }
    return Math.max(0, p.seconds - e);
  }
  remainingWhole(now) { return Math.ceil(this.remaining(now) - 1e-9); }
  side(now) {
    const p = this.phase;
    if (!p || !p.sided) return null;
    return this.elapsed(now) < p.seconds / 2 ? "left" : "right";
  }
  phaseProgress(now) { return this.finished ? 1 : Math.min(1, this.elapsed(now) / this.phase.seconds); }
  progress(now) {
    if (this.finished) return 1;
    let done = 0;
    for (let i = 0; i < this.index; i++) done += this.phases[i].seconds;
    done += Math.min(this.elapsed(now), this.phase.seconds);
    return this.totalSeconds ? done / this.totalSeconds : 1;
  }
  nextExercisePhase() {
    for (let i = this.index + 1; i < this.phases.length; i++) if (this.phases[i].kind === "exercise") return this.phases[i];
    return null;
  }
  restBeforeNext() {
    const n = this.phases[this.index + 1];
    return n && n.kind === "rest" ? n.seconds : 0;
  }
  pause(now) { if (!this.finished && !this.paused) this.pausedAt = now; }
  resume(now) { if (this.paused) { this.pausedTotal += now - this.pausedAt; this.pausedAt = null; } }
  toggle(now) { this.paused ? this.resume(now) : this.pause(now); }
  _setElapsed(now, seconds) {
    const keepPaused = this.paused;
    this.pausedTotal = 0;
    this.startedAt = now - seconds * 1000;
    this.pausedAt = keepPaused ? now : null;
  }
  _advance(now, overshootSeconds, events) {
    if (this.index + 1 >= this.phases.length) {
      this.finished = true;
      events.push({ type: "finished" });
      return;
    }
    const keepPaused = this.paused;
    this._enter(this.index + 1, now - overshootSeconds * 1000, keepPaused);
    if (keepPaused) this.pausedAt = now;
  }
  skip(now) {
    if (this.finished) return;
    const p = this.phase;
    if (p.sided && this.side(now) === "left") { this._setElapsed(now, p.seconds / 2); this.sideSwitched = true; return; }
    this._advance(now, 0, []);
  }
  back(now) {
    if (this.finished) return;
    const again = this.lastBackAt != null && now - this.lastBackAt < BACK_WINDOW_MS;
    this.lastBackAt = now;
    if (again) {
      for (let i = this.index - 1; i >= 0; i--) {
        if (this.phases[i].kind === "exercise") { this._enter(i, now, this.paused); this.lastBackAt = null; return; }
      }
    }
    this._enter(this.index, now, this.paused);
  }
  end() { this.finished = true; }
  tick(now) {
    const events = [];
    if (this.finished || this.paused) return events;
    // side switch
    const p = this.phase;
    if (p.sided && !this.sideSwitched && this.elapsed(now) >= p.seconds / 2) {
      this.sideSwitched = true;
      events.push({ type: "side-switch" });
      this.lastWhole = null;
    }
    // phase end(s), with carry-over
    let guard = 0;
    while (!this.finished && this.elapsed(now) >= this.phase.seconds && guard++ < 1000) {
      const overshoot = this.elapsed(now) - this.phase.seconds;
      events.push({ type: "phase-end" });
      this._advance(now, overshoot, events);
    }
    if (this.finished) return events;
    const whole = this.remainingWhole(now);
    if (whole !== this.lastWhole) {
      this.lastWhole = whole;
      if (whole >= 1 && whole <= 3) events.push({ type: "countdown", value: whole });
    }
    return events;
  }
}
```

Note on the countdown test: at `now = 57_000` remaining is exactly 3.0 → `remainingWhole` = 3 → countdown 3. At 60_250 the phase ends; `lastWhole` resets on `_enter` so the next phase's 3-2-1 fires again.

- [x] **Step 4: Run, expect pass. Fix any off-by-one in `remainingWhole` with the `1e-9` epsilon. Commit** `feat: session engine`.

---

### Task 4: kv.js + store.js (persistence, backup, restore)

**Files:** Create `js/kv.js`, `js/store.js`; Test `test/store.test.js`.

**Interfaces (produces):**
- `kv.js`: `memoryAdapter()`, `localAdapter(storage, key)`, `idbAdapter(dbName = "morningfit", key = "state")` — each `{ get(): Promise<string|null>, set(str): Promise<void> }`.
- `store.js`:
  - `parseState(raw) → state | null` (structural validation; keeps unknown exerciseIds)
  - `validateBackup(obj, getEx) → { ok: true, state, dropped, workouts } | { ok: false, error }`
  - `createStore({ local, idb, now = () => new Date().toISOString(), seed = seedState }) → store`
  - `store.load() → Promise<{ seeded: boolean, recovered: boolean }>`, `store.state`, `store.save()` (writes `savedAt`, both adapters, returns Promise), `store.replace(state)`, `store.subscribe(fn) → unsubscribe`, `store.lastBackupAt` (persisted in state as `lastBackupAt`), `store.markBackup()`.

- [x] **Step 1: Failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { memoryAdapter } from "../js/kv.js";
import { parseState, validateBackup, createStore } from "../js/store.js";
import { getExercise } from "../js/exercises.js";

const good = { version: 1, savedAt: "2026-01-01T00:00:00Z", workouts: [{ id: "w1", name: "A", steps: [{ exerciseId: "pushups", seconds: 60, restSeconds: 20 }] }] };

test("parseState accepts valid state and rejects garbage", () => {
  assert.deepEqual(parseState(JSON.stringify(good)).workouts[0].id, "w1");
  assert.equal(parseState("not json"), null);
  assert.equal(parseState(JSON.stringify({ version: 2, workouts: [] })), null);
  assert.equal(parseState(JSON.stringify({ version: 1, workouts: "x" })), null);
  assert.equal(parseState(JSON.stringify({ version: 1, workouts: [{ id: "w", name: "A", steps: [{ exerciseId: 5 }] }] })), null);
});

test("validateBackup drops unknown exercises and reports counts", () => {
  const b = { version: 1, workouts: [{ id: "w1", name: "A", steps: [
    { exerciseId: "pushups", seconds: 60, restSeconds: 20 },
    { exerciseId: "gone", seconds: 60, restSeconds: 20 },
  ] }] };
  const r = validateBackup(b, getExercise);
  assert.equal(r.ok, true);
  assert.deepEqual([r.workouts, r.dropped], [1, 1]);
  assert.equal(r.state.workouts[0].steps.length, 1);
  assert.equal(validateBackup({ version: 3 }, getExercise).ok, false);
  assert.equal(validateBackup("nope", getExercise).ok, false);
});

test("load seeds when nothing is stored and saves to both adapters", async () => {
  const local = memoryAdapter(), idb = memoryAdapter();
  const store = createStore({ local, idb, now: () => "2026-09-04T00:00:00Z" });
  const r = await store.load();
  assert.equal(r.seeded, true);
  assert.equal(store.state.workouts[0].name, "Morning");
  assert.equal(JSON.parse(await local.get()).savedAt, "2026-09-04T00:00:00Z");
  assert.equal(await idb.get(), await local.get());
});

test("load picks the newer copy and recovers from a corrupt local copy", async () => {
  const local = memoryAdapter(), idb = memoryAdapter();
  await local.set("{corrupt");
  await idb.set(JSON.stringify(good));
  const store = createStore({ local, idb });
  const r = await store.load();
  assert.equal(r.seeded, false);
  assert.equal(r.recovered, true);
  assert.equal(store.state.workouts[0].name, "A");
  assert.equal(await local.get("morningfit.v1.corrupt"), undefined); // corrupt copy handled by localAdapter, not memory
});

test("newer savedAt wins", async () => {
  const local = memoryAdapter(), idb = memoryAdapter();
  await local.set(JSON.stringify({ ...good, savedAt: "2026-01-02T00:00:00Z", workouts: [{ id: "w2", name: "Newer", steps: [] }] }));
  await idb.set(JSON.stringify(good));
  const store = createStore({ local, idb });
  await store.load();
  assert.equal(store.state.workouts[0].name, "Newer");
});

test("save notifies subscribers and replace swaps state", async () => {
  const store = createStore({ local: memoryAdapter(), idb: memoryAdapter() });
  await store.load();
  let calls = 0; store.subscribe(() => calls++);
  store.state.workouts[0].name = "Renamed";
  await store.save();
  assert.equal(calls, 1);
  await store.replace({ version: 1, savedAt: null, workouts: [] });
  assert.equal(store.state.workouts.length, 0);
  assert.equal(calls, 2);
});
```

- [x] **Step 2: Run, expect failure.**
- [x] **Step 3: Implement `js/kv.js`**

```js
export function memoryAdapter() {
  let v = null;
  return { async get() { return v; }, async set(s) { v = s; } };
}
export function localAdapter(storage, key) {
  return {
    async get() { try { return storage.getItem(key); } catch { return null; } },
    async set(s) { storage.setItem(key, s); },              // may throw QuotaExceeded: caller handles
    async stash(suffix, s) { try { storage.setItem(key + suffix, s); } catch {} },
  };
}
export function idbAdapter(dbName = "morningfit", key = "state") {
  const STORE = "kv";
  function open() {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === "undefined") return reject(new Error("no idb"));
      const req = indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function tx(mode, fn) {
    return open().then(db => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const r = fn(t.objectStore(STORE));
      t.oncomplete = () => { db.close(); resolve(r.result ?? null); };
      t.onerror = () => { db.close(); reject(t.error); };
    }));
  }
  return {
    async get() { try { return await tx("readonly", s => s.get(key)); } catch { return null; } },
    async set(v) { try { await tx("readwrite", s => s.put(v, key)); } catch {} },
  };
}
```

- [x] **Step 4: Implement `js/store.js`**

```js
import { seedState } from "./seed.js";

const isNum = v => typeof v === "number" && Number.isFinite(v);

function normalizeStep(s) {
  if (!s || typeof s.exerciseId !== "string" || !isNum(s.seconds) || !isNum(s.restSeconds)) return null;
  return { exerciseId: s.exerciseId, seconds: Math.max(0, Math.round(s.seconds)), restSeconds: Math.max(0, Math.round(s.restSeconds)) };
}
function normalizeWorkout(w) {
  if (!w || typeof w.id !== "string" || typeof w.name !== "string" || !Array.isArray(w.steps)) return null;
  const steps = w.steps.map(normalizeStep);
  if (steps.includes(null)) return null;
  return { id: w.id, name: w.name, steps };
}
function normalizeState(obj) {
  if (!obj || obj.version !== 1 || !Array.isArray(obj.workouts)) return null;
  const workouts = obj.workouts.map(normalizeWorkout);
  if (workouts.includes(null)) return null;
  return { version: 1, savedAt: typeof obj.savedAt === "string" ? obj.savedAt : null,
           lastBackupAt: typeof obj.lastBackupAt === "string" ? obj.lastBackupAt : null, workouts };
}
export function parseState(raw) {
  if (typeof raw !== "string") return null;
  try { return normalizeState(JSON.parse(raw)); } catch { return null; }
}
export function validateBackup(obj, getEx) {
  if (!obj || typeof obj !== "object") return { ok: false, error: "Not a Morning Fit backup file." };
  if (obj.version !== 1) return { ok: false, error: `Unsupported backup version: ${obj.version}.` };
  if (!Array.isArray(obj.workouts)) return { ok: false, error: "Backup has no workouts list." };
  let dropped = 0;
  const workouts = [];
  for (const w of obj.workouts) {
    if (!w || typeof w.name !== "string" || !Array.isArray(w.steps)) continue;
    const steps = [];
    for (const s of w.steps) {
      const n = normalizeStep(s);
      if (n && getEx(n.exerciseId)) steps.push(n); else dropped++;
    }
    workouts.push({ id: typeof w.id === "string" ? w.id : `w_${Math.random().toString(36).slice(2, 10)}`, name: w.name, steps });
  }
  return { ok: true, dropped, workouts: workouts.length, state: { version: 1, savedAt: null, lastBackupAt: null, workouts } };
}

export function createStore({ local, idb, now = () => new Date().toISOString(), seed = seedState }) {
  const subs = new Set();
  const store = {
    state: null,
    saveError: null,
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    async load() {
      const [rawLocal, rawIdb] = await Promise.all([local.get(), idb.get()]);
      const candidates = [];
      let recovered = false;
      for (const [raw, adapter] of [[rawLocal, local], [rawIdb, idb]]) {
        if (raw == null) continue;
        const parsed = parseState(raw);
        if (parsed) candidates.push(parsed);
        else { recovered = true; if (adapter.stash) await adapter.stash(".corrupt", raw); }
      }
      candidates.sort((a, b) => String(b.savedAt ?? "").localeCompare(String(a.savedAt ?? "")));
      if (candidates.length) {
        store.state = candidates[0];
        if (recovered || candidates.length < 2) await store.save();
        return { seeded: false, recovered: recovered && candidates.length > 0 };
      }
      store.state = seed();
      await store.save();
      return { seeded: true, recovered: false };
    },
    async save() {
      store.state.savedAt = now();
      const s = JSON.stringify(store.state);
      store.saveError = null;
      try { await local.set(s); } catch (e) { store.saveError = e; }
      await idb.set(s);
      subs.forEach(fn => fn(store.state));
    },
    async replace(state) { store.state = state; await store.save(); },
    async markBackup() { store.state.lastBackupAt = now(); await store.save(); },
  };
  return store;
}
```

Adjust the "recovers from a corrupt local copy" test's last assertion: memoryAdapter has no `stash`, so simply assert `r.recovered === true` (remove the `.corrupt` line).

- [x] **Step 5: Run, expect pass. Commit** `feat: persistence with dual storage and backup validation`.

---

### Task 5: Shell, CSS, router, UI helpers, app boot (renders the Plan list read-only)

**Files:** Create `index.html`, `css/app.css`, `js/router.js`, `js/ui.js`, `js/app.js`, `js/views/plan.js` (list only for now).

**Interfaces (produces):**
- `router.js`: `parseRoute(hash) → { name, params }` with names `plan | workout | bank | train | session | done`; `navigate(path)` sets `location.hash`; `startRouter(onChange)`.
  - `#/plan` → plan; `#/plan/workout/:id` → workout `{id}`; `#/plan/bank` → bank `{}`; `#/plan/bank/pick/:workoutId` → bank `{pick: workoutId}`; `#/train` → train; `#/train/session/:id` → session `{id}`; `#/train/done/:id` → done `{id}`; anything else → plan.
- `ui.js`: `el(tag, attrs, ...children)` (attrs: `class`, `on:click` style handlers via `onClick` keys, `dataset`, plain attributes); `sheet(content, { onClose }) → close()`; `toast(text, ms = 2500)`; `confirmAsync(text) → Promise<boolean>` (wraps `window.confirm`).
- `app.js`: creates the store, loads, starts the router, renders a view for each route; views are `render({ store, params, navigate }) → { el, tabs: "plan" | "train" | null }`.

- [x] **Step 1: `index.html`**

```html
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Morning Fit</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
  <meta name="theme-color" content="#0F1115">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Morning Fit">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="apple-touch-icon" href="assets/icons/icon-180.png">
  <link rel="icon" href="assets/icons/icon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="css/app.css">
</head>
<body>
  <main id="view"></main>
  <nav id="tabs" hidden>
    <a href="#/plan" data-tab="plan"><span class="icon">☰</span><span>Plan</span></a>
    <a href="#/train" data-tab="train"><span class="icon">▶</span><span>Train</span></a>
  </nav>
  <div id="toast" hidden></div>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [x] **Step 2: `css/app.css`** — tokens and components (full file):

```css
:root {
  --bg:#0F1115; --card:#1C1F26; --raised:#262A33; --text:#F3F4F6; --muted:#9AA0AB; --line:#2E323B;
  --strength:#F5A524; --stretch:#2DD4BF; --relaxed:#7C8290; --danger:#F0645C; --accent:var(--strength);
  --sat:env(safe-area-inset-top,0px); --sab:env(safe-area-inset-bottom,0px);
  --tabs-h:56px; --radius:14px;
}
* { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
html,body { margin:0; background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif; font-size:17px; -webkit-text-size-adjust:100%; overscroll-behavior:none; }
body { min-height:100dvh; }
button { font:inherit; color:inherit; background:none; border:0; padding:0; cursor:pointer; }
a { color:inherit; text-decoration:none; }
input { font:inherit; color:inherit; }
#view { padding:calc(var(--sat) + 12px) 20px calc(var(--tabs-h) + var(--sab) + 24px); max-width:520px; margin:0 auto; }
#view.no-tabs { padding-bottom:calc(var(--sab) + 24px); }
#tabs { position:fixed; left:0; right:0; bottom:0; height:calc(var(--tabs-h) + var(--sab)); padding-bottom:var(--sab); display:flex; background:#14161C; border-top:1px solid var(--line); z-index:10; }
#tabs a { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; font-size:12px; color:var(--muted); }
#tabs a .icon { font-size:20px; }
#tabs a.active { color:var(--accent); font-weight:600; }
#tabs[hidden] { display:none; }

.header { display:flex; align-items:center; justify-content:space-between; min-height:44px; margin-bottom:12px; }
.header h1 { font-size:32px; margin:0; font-weight:700; }
.header .title { font-weight:700; font-size:17px; text-align:center; flex:1; }
.header .link { color:var(--accent); font-size:17px; min-width:44px; min-height:44px; display:flex; align-items:center; }
.header .link.right { justify-content:flex-end; }
.header .plus { font-size:30px; line-height:1; color:var(--accent); min-width:44px; min-height:44px; display:flex; align-items:center; justify-content:flex-end; }
.section-label { font-size:12px; font-weight:700; letter-spacing:.04em; color:var(--muted); margin:18px 0 8px; }
.sub { color:var(--muted); font-size:14px; }
.card { background:var(--card); border-radius:16px; padding:16px 18px; margin-bottom:12px; display:block; width:100%; text-align:left; }
.card .row { display:flex; justify-content:space-between; align-items:baseline; }
.card .name { font-size:19px; font-weight:700; }
.card .dur { color:var(--muted); }
.btn { display:flex; align-items:center; justify-content:center; min-height:48px; border-radius:12px; font-weight:700; font-size:16px; width:100%; }
.btn.primary { background:var(--accent); color:#111; }
.btn.secondary { background:var(--card); color:var(--accent); }
.btn.raised { background:var(--raised); color:var(--accent); }
.text-danger { color:var(--danger); }
.text-link { color:var(--accent); }
.center { text-align:center; }
.links { display:flex; gap:12px; margin-top:24px; font-size:14px; }
.links .sep { color:var(--muted); }
.notice { background:var(--raised); border-radius:12px; padding:10px 14px; font-size:14px; color:var(--text); margin-bottom:12px; }
.notice.warn { border-left:3px solid var(--danger); }

/* list rows */
.rows { display:flex; flex-direction:column; }
.row-item { display:flex; align-items:center; gap:12px; min-height:56px; padding:6px 0; border-bottom:1px solid var(--line); width:100%; text-align:left; }
.row-item .handle { color:var(--muted); font-size:18px; width:24px; touch-action:none; cursor:grab; }
.row-item .idx { color:var(--muted); font-size:15px; width:16px; }
.row-item .thumb { width:44px; height:44px; border-radius:10px; background:var(--raised); flex:none; }
.row-item .thumb img { width:100%; height:100%; display:block; }
.row-item .label { flex:1; font-size:17px; }
.row-item .label.muted { color:var(--muted); }
.row-item .badge { font-size:12px; font-weight:700; color:var(--stretch); background:var(--raised); border-radius:6px; padding:3px 6px; }
.row-item .time { font-size:16px; font-variant-numeric:tabular-nums; }
.row-item .rest { font-size:13px; color:var(--muted); opacity:.7; width:40px; text-align:right; font-variant-numeric:tabular-nums; }
.row-item .rest.inert { opacity:.35; }
.row-item .chev { color:var(--muted); font-size:18px; }
.row-item.dragging { opacity:.6; background:var(--card); }
.chips { display:flex; gap:8px; margin:8px 0 12px; }
.chip { padding:7px 14px; border-radius:16px; background:var(--card); font-size:14px; min-height:32px; }
.chip.active { background:var(--text); color:#111; font-weight:700; }

/* bottom sheet */
.sheet-backdrop { position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:20; }
.sheet { position:fixed; left:0; right:0; bottom:0; background:var(--card); border-radius:24px 24px 0 0; padding:12px 20px calc(var(--sab) + 16px); z-index:21; max-height:85dvh; overflow:auto; }
.sheet .grip { width:40px; height:5px; border-radius:3px; background:var(--line); margin:0 auto 20px; }
.sheet h2 { margin:0 0 4px; font-size:20px; }
.sheet .type { font-size:14px; margin-bottom:16px; }
.stepper { margin:12px 0 18px; }
.stepper .label { color:var(--muted); font-size:14px; margin-bottom:8px; }
.stepper .ctl { display:flex; align-items:center; justify-content:center; gap:20px; }
.stepper .ctl button { width:56px; height:56px; border-radius:28px; background:var(--raised); font-size:28px; }
.stepper .ctl .val { font-size:34px; font-weight:700; min-width:110px; text-align:center; font-variant-numeric:tabular-nums; }
.stepper .ctl .val.small { font-size:26px; color:var(--muted); }
.stepper .hint { text-align:center; color:var(--muted); font-size:13px; margin-top:8px; }
.figs { display:flex; gap:12px; margin:8px 0 16px; }
.figs .fig { flex:1; }
.figs img { width:100%; border-radius:16px; display:block; background:var(--raised); }
.figs .cap { text-align:center; color:var(--muted); font-size:13px; margin-top:6px; }
.strength { color:var(--strength); } .stretch { color:var(--stretch); }

/* session */
.session { display:flex; flex-direction:column; min-height:calc(100dvh - var(--sat) - 12px - var(--sab) - 24px); user-select:none; -webkit-user-select:none; }
.session .top { display:flex; justify-content:space-between; align-items:center; min-height:44px; }
.session .top .x { font-size:22px; color:var(--muted); min-width:44px; min-height:44px; display:flex; align-items:center; }
.session .top .where { color:var(--muted); font-size:14px; }
.bar { height:5px; border-radius:3px; background:var(--raised); overflow:hidden; }
.bar > div { height:100%; background:var(--accent); width:0; border-radius:3px; }
.bar.big { height:8px; border-radius:4px; margin:8px 60px 0; }
.session h1 { font-size:30px; margin:16px 0 2px; letter-spacing:.02em; }
.session .type { font-size:16px; margin-bottom:8px; }
.session .stage { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:space-evenly; }
.session .stage img { width:min(46vw, 180px); border-radius:20px; background:var(--card); display:block; }
.session .timer { font-size:84px; font-weight:700; line-height:1; font-variant-numeric:tabular-nums; text-align:center; }
.session .timer.huge { font-size:110px; }
.session .cue { color:var(--muted); font-size:14px; text-align:center; }
.session .next { font-size:14px; text-align:center; margin-top:4px; }
.session .next.big { font-size:18px; font-weight:700; }
.session .controls { display:flex; align-items:center; justify-content:space-between; padding:12px 30px 0; }
.session .controls .side { font-size:26px; color:var(--muted); min-width:44px; min-height:44px; display:flex; align-items:center; justify-content:center; }
.session .controls .pause { background:var(--card); border-radius:22px; min-width:140px; min-height:44px; font-weight:700; }
.session.rest .stage img { width:min(52vw, 200px); }
.overlay { position:fixed; inset:0; background:rgba(0,0,0,.86); z-index:30; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px; }
.overlay .big { font-size:60px; }
.overlay .title { font-size:30px; font-weight:700; }
.overlay .sub { color:var(--muted); }
.done { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:calc(100dvh - 60px); gap:10px; }
.done .check { width:108px; height:108px; border-radius:54px; background:var(--accent); color:#111; display:flex; align-items:center; justify-content:center; font-size:56px; font-weight:700; margin-bottom:24px; }
.done h1 { margin:0; font-size:30px; }
.done .btn { position:fixed; left:20px; right:20px; bottom:calc(var(--sab) + 32px); max-width:480px; margin:0 auto; }
#toast { position:fixed; left:50%; bottom:calc(var(--tabs-h) + var(--sab) + 20px); transform:translateX(-50%); background:var(--raised); color:var(--text); padding:10px 16px; border-radius:12px; font-size:14px; z-index:40; max-width:90vw; }
#toast[hidden] { display:none; }
.empty { color:var(--muted); text-align:center; padding:40px 0; }
```

- [x] **Step 3: `js/router.js`**

```js
export function parseRoute(hash) {
  const parts = (hash || "").replace(/^#\/?/, "").split("/").filter(Boolean);
  const [a, b, c, d] = parts;
  if (a === "plan" && b === "workout" && c) return { name: "workout", params: { id: c } };
  if (a === "plan" && b === "bank" && c === "pick" && d) return { name: "bank", params: { pick: d } };
  if (a === "plan" && b === "bank") return { name: "bank", params: {} };
  if (a === "train" && b === "session" && c) return { name: "session", params: { id: c } };
  if (a === "train" && b === "done" && c) return { name: "done", params: { id: c } };
  if (a === "train") return { name: "train", params: {} };
  return { name: "plan", params: {} };
}
export function navigate(path) { location.hash = path.startsWith("#") ? path : `#${path}`; }
export function startRouter(onChange) {
  const fire = () => onChange(parseRoute(location.hash));
  addEventListener("hashchange", fire);
  fire();
}
```

Add `test/router.test.js` with the seven route cases above plus a fallback case, and run it.

- [x] **Step 4: `js/ui.js`**

```js
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k === "html") node.innerHTML = v;
    else node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) node.append(c.nodeType ? c : document.createTextNode(String(c)));
  return node;
}
export function sheet(content, { onClose } = {}) {
  const backdrop = el("div", { class: "sheet-backdrop" });
  const panel = el("div", { class: "sheet" }, el("div", { class: "grip" }), content);
  const close = () => { backdrop.remove(); panel.remove(); onClose?.(); };
  backdrop.addEventListener("click", close);
  document.body.append(backdrop, panel);
  return close;
}
let toastTimer;
export function toast(text, ms = 2500) {
  const t = document.getElementById("toast");
  t.textContent = text; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}
export async function confirmAsync(text) { return window.confirm(text); }
```

- [x] **Step 5: `js/app.js`**

```js
import { createStore } from "./store.js";
import { localAdapter, idbAdapter } from "./kv.js";
import { startRouter, navigate } from "./router.js";
import { toast } from "./ui.js";
import * as plan from "./views/plan.js";
import * as workout from "./views/workout.js";
import * as bank from "./views/bank.js";
import * as train from "./views/train.js";
import * as session from "./views/session.js";
import * as done from "./views/done.js";

const KEY = "morningfit.v1";
const views = { plan, workout, bank, train, session, done };
const store = createStore({ local: localAdapter(localStorage, KEY), idb: idbAdapter() });
let current = null;   // { el, destroy? }

async function boot() {
  const r = await store.load();
  if (r.seeded) toast("No saved workouts found, loaded defaults", 4000);
  else if (r.recovered) toast("Recovered workouts from backup copy", 4000);
  navigator.storage?.persist?.().catch(() => {});
  startRouter(route => {
    current?.destroy?.();
    const view = views[route.name];
    const out = view.render({ store, params: route.params, navigate });
    current = out;
    const main = document.getElementById("view");
    main.replaceChildren(out.el);
    main.classList.toggle("no-tabs", !out.tabs);
    const tabs = document.getElementById("tabs");
    tabs.hidden = !out.tabs;
    tabs.querySelectorAll("a").forEach(a => a.classList.toggle("active", a.dataset.tab === out.tabs));
    window.scrollTo(0, 0);
  });
  if ("serviceWorker" in navigator && location.protocol === "https:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return; reloaded = true;
      toast("Updated. Reopen the app to use the new version.", 5000);
    });
  }
}
boot();
```

- [x] **Step 6: `js/views/plan.js` (list, no backup yet)**

```js
import { el } from "../ui.js";
import { totals, formatDuration, summaryLine, makeWorkout } from "../workout.js";
import { EXERCISES } from "../exercises.js";

export function render({ store, navigate }) {
  const st = store.state;
  const list = st.workouts.length
    ? st.workouts.map(w => {
        const t = totals(w);
        return el("button", { class: "card", onClick: () => navigate(`/plan/workout/${w.id}`) },
          el("div", { class: "row" }, el("span", { class: "name" }, w.name), el("span", { class: "dur" }, formatDuration(t.total))),
          el("div", { class: "sub" }, summaryLine(t) + (t.missing ? ` · ${t.missing} missing` : "")));
      })
    : [el("div", { class: "empty" }, "No workouts yet. Tap + to create one.")];
  const root = el("div", {},
    el("div", { class: "header" }, el("h1", {}, "Plan"),
      el("button", { class: "plus", "aria-label": "New workout", onClick: async () => {
        const w = makeWorkout(`Workout ${st.workouts.length + 1}`);
        st.workouts.push(w); await store.save(); navigate(`/plan/workout/${w.id}`);
      } }, "+")),
    el("div", { class: "section-label" }, "WORKOUTS"),
    ...list,
    el("button", { class: "card", onClick: () => navigate("/plan/bank") },
      el("div", { class: "row" }, el("span", {}, "Exercise bank"), el("span", { class: "dur" }, `${EXERCISES.length}  ›`))),
  );
  return { el: root, tabs: "plan" };
}
```

Create stub files for the other views so `app.js` imports resolve: each exports `render()` returning `{ el: el("div", {}, "TODO <name>"), tabs: "plan" | "train" }`. These stubs are replaced in Tasks 6–9.

- [x] **Step 7: Manual check** — `python3 -m http.server 8080` from repo root, open `http://localhost:8080/#/plan` in a desktop browser (or `curl` to check it serves). Confirm: Plan header, the seeded "Morning" workout at 4:50 with "2 strength · 2 stretch", bank row shows 4. Commit `feat: app shell, router, plan list`.

---

### Task 6: Workout editor (steps, step sheet, reorder, rename, delete)

**Files:** Create `js/views/workout.js`.

**Interfaces:** consumes `store`, `totals`, `formatDuration`, `moveStep`, `stepIncrement`, `clampSeconds`, `clampRest`, `getExercise`, `figureUrl`, `el`, `sheet`, `confirmAsync`.

- [x] **Step 1: Implement**

```js
import { el, sheet, confirmAsync } from "../ui.js";
import { totals, formatDuration, moveStep, stepIncrement, clampSeconds, clampRest } from "../workout.js";
import { getExercise, figureUrl } from "../exercises.js";

export function render({ store, params, navigate }) {
  const st = store.state;
  const w = st.workouts.find(x => x.id === params.id);
  if (!w) { navigate("/plan"); return { el: el("div"), tabs: "plan" }; }
  const root = el("div");
  draw();
  return { el: root, tabs: "plan" };

  function draw() {
    const t = totals(w);
    const title = el("input", { class: "title-input", value: w.name, "aria-label": "Workout name",
      onChange: async e => { w.name = e.target.value.trim() || w.name; e.target.value = w.name; await store.save(); } });
    const rows = w.steps.map((s, i) => stepRow(s, i));
    root.replaceChildren(
      el("div", { class: "header" }, el("a", { class: "link", href: "#/plan" }, "‹ Plan"), title, el("span", { class: "link right" })),
      el("div", { class: "sub" }, `Total ${formatDuration(t.total)}  ·  ${formatDuration(t.work)} work + ${formatDuration(t.rest)} rest`),
      el("div", { class: "rows", id: "steps" }, ...rows),
      el("button", { class: "btn secondary", style: "margin-top:16px", onClick: () => navigate(`/plan/bank/pick/${w.id}`) }, "+ Add exercise"),
      el("button", { class: "text-danger center", style: "display:block;margin:28px auto 0;min-height:44px", onClick: async () => {
        if (!(await confirmAsync(`Delete "${w.name}"?`))) return;
        st.workouts = st.workouts.filter(x => x.id !== w.id); await store.save(); navigate("/plan");
      } }, "Delete workout"),
    );
    enableDrag(root.querySelector("#steps"));
  }

  function stepRow(s, i) {
    const ex = getExercise(s.exerciseId);
    const last = i === w.steps.length - 1;
    return el("div", { class: "row-item", dataset: { index: i } },
      el("span", { class: "handle", "aria-label": "Drag to reorder" }, "≡"),
      el("span", { class: "idx" }, i + 1),
      el("span", { class: "thumb" }, ex ? el("img", { src: figureUrl(ex.id, "flexed"), alt: "" }) : null),
      el("button", { class: `label${ex ? "" : " muted"}`, onClick: () => openSheet(i) }, ex ? ex.name : "Missing exercise"),
      ex?.sided ? el("span", { class: "badge" }, "L/R") : null,
      el("span", { class: "time" }, `${s.seconds}s`),
      el("span", { class: `rest${last ? " inert" : ""}`, title: last ? "Rest after the last exercise is not run" : "" }, `+${s.restSeconds}s`),
      el("button", { class: "chev", onClick: () => openSheet(i), "aria-label": "Edit step" }, "›"),
    );
  }

  function openSheet(i) {
    const s = w.steps[i];
    const ex = getExercise(s.exerciseId);
    const inc = ex ? stepIncrement(ex) : 5;
    const body = el("div");
    const close = sheet(body, { onClose: draw });
    const paint = () => body.replaceChildren(
      el("h2", {}, ex ? ex.name : "Missing exercise"),
      el("div", { class: `type ${ex?.type ?? ""}` }, ex ? `${cap(ex.type)}${ex.sided ? " · sided" : ""}` : "This exercise no longer exists"),
      ex ? stepper("Exercise time", s.seconds, inc, v => { s.seconds = clampSeconds(v, ex); }, `${ex.sided ? `${s.seconds / 2} s per side · ` : ""}default for this exercise: ${ex.defaultSeconds} s`) : null,
      ex ? stepper("Rest after", s.restSeconds, 5, v => { s.restSeconds = clampRest(v); }, `default for this exercise: ${ex.defaultRestSeconds} s`, true) : null,
      el("div", { style: "display:flex;gap:12px;margin:4px 0 12px" },
        el("button", { class: "btn raised", disabled: i === 0, onClick: async () => { w.steps = moveStep(w.steps, i, i - 1); await store.save(); close(); } }, "▲ Move up"),
        el("button", { class: "btn raised", disabled: i === w.steps.length - 1, onClick: async () => { w.steps = moveStep(w.steps, i, i + 1); await store.save(); close(); } }, "▼ Move down")),
      el("button", { class: "text-danger", style: "min-height:44px;display:block", onClick: async () => { w.steps.splice(i, 1); await store.save(); close(); } }, "Remove from workout"),
      el("button", { class: "btn primary", style: "margin-top:8px", onClick: async () => { await store.save(); close(); } }, "Done"),
    );
    function stepper(label, value, step, set, hint, small = false) {
      return el("div", { class: "stepper" },
        el("div", { class: "label" }, label),
        el("div", { class: "ctl" },
          el("button", { onClick: () => { set(value - step); paint(); } }, "–"),
          el("span", { class: `val${small ? " small" : ""}` }, `${value} s`),
          el("button", { onClick: () => { set(value + step); paint(); } }, "+")),
        el("div", { class: "hint" }, hint));
    }
    paint();
  }

  function enableDrag(list) {
    let dragging = null, startY = 0, from = -1, rowH = 0;
    list.querySelectorAll(".handle").forEach(h => h.addEventListener("pointerdown", e => {
      dragging = h.closest(".row-item"); from = +dragging.dataset.index; startY = e.clientY; rowH = dragging.offsetHeight;
      dragging.classList.add("dragging"); h.setPointerCapture(e.pointerId); e.preventDefault();
    }));
    list.addEventListener("pointermove", e => {
      if (!dragging) return;
      dragging.style.transform = `translateY(${e.clientY - startY}px)`;
    });
    const finish = async e => {
      if (!dragging) return;
      const delta = Math.round((e.clientY - startY) / rowH);
      const to = Math.max(0, Math.min(w.steps.length - 1, from + delta));
      dragging.style.transform = ""; dragging.classList.remove("dragging"); dragging = null;
      if (to !== from) { w.steps = moveStep(w.steps, from, to); await store.save(); }
      draw();
    };
    list.addEventListener("pointerup", finish);
    list.addEventListener("pointercancel", finish);
  }
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
```

Add to `css/app.css`: `.title-input { flex:1; text-align:center; font-weight:700; font-size:17px; background:none; border:0; outline:none; min-height:44px; }`.

- [x] **Step 2: Manual check** in the browser: open the Morning workout, change a time via the sheet, move a step, remove a step, rename, delete a workout, verify totals and the greyed last rest. Reload the page and confirm changes persisted. Commit `feat: workout editor`.

---

### Task 7: Exercise bank (browse, detail sheet, pick mode)

**Files:** Create `js/views/bank.js`.

- [x] **Step 1: Implement**

```js
import { el, sheet, toast } from "../ui.js";
import { EXERCISES, figureUrl } from "../exercises.js";
import { makeStep } from "../workout.js";

export function render({ store, params, navigate }) {
  const st = store.state;
  const pickFor = params.pick ? st.workouts.find(w => w.id === params.pick) : null;
  if (params.pick && !pickFor) { navigate("/plan"); return { el: el("div"), tabs: "plan" }; }
  let filter = "all";
  const root = el("div");
  draw();
  return { el: root, tabs: "plan" };

  function draw() {
    const groups = [["strength", "STRENGTH"], ["stretch", "STRETCH"]].filter(([t]) => filter === "all" || filter === t);
    root.replaceChildren(
      el("div", { class: "header" },
        el("a", { class: "link", href: pickFor ? `#/plan/workout/${pickFor.id}` : "#/plan" }, pickFor ? "‹ Cancel" : "‹ Back"),
        el("span", { class: "title" }, pickFor ? `Add to ${pickFor.name}` : "Exercises"),
        el("span", { class: "link right" })),
      el("div", { class: "chips" }, ...[["all", "All"], ["strength", "Strength"], ["stretch", "Stretch"]].map(([k, label]) =>
        el("button", { class: `chip${filter === k ? " active" : ""}`, onClick: () => { filter = k; draw(); } }, label))),
      ...groups.flatMap(([type, label]) => [
        el("div", { class: "section-label" }, label),
        ...EXERCISES.filter(e => e.type === type).map(row),
      ]),
    );
  }
  function row(e) {
    return el("button", { class: "row-item", onClick: () => pickFor ? add(e) : detail(e) },
      el("span", { class: "thumb" }, el("img", { src: figureUrl(e.id, "flexed"), alt: "" })),
      el("span", { class: "label" }, e.name),
      e.sided ? el("span", { class: "badge" }, "L/R") : null,
      el("span", { class: "time" }, `${e.defaultSeconds}s`),
      el("span", { class: "rest" }, `+${e.defaultRestSeconds}s`),
      el("span", { class: `chev${pickFor ? " text-link" : ""}` }, pickFor ? "+" : "›"));
  }
  async function add(e, target = pickFor) {
    target.steps.push(makeStep(e.id));
    await store.save();
    navigate(`/plan/workout/${target.id}`);
  }
  function detail(e) {
    const body = el("div",
      el("h2", {}, e.name),
      el("div", { class: `type ${e.type}` }, `${e.type[0].toUpperCase()}${e.type.slice(1)}${e.sided ? " · sided" : ""} · ${e.defaultSeconds}s · ${e.defaultRestSeconds ? `then ${e.defaultRestSeconds}s rest` : "no rest after"}`),
      el("div", { class: "figs" },
        el("div", { class: "fig" }, el("img", { src: figureUrl(e.id, "relaxed"), alt: "Relaxed" }), el("div", { class: "cap" }, "Relaxed")),
        el("div", { class: "fig" }, el("img", { src: figureUrl(e.id, "flexed"), alt: "Flexed" }), el("div", { class: "cap" }, "Flexed"))),
      el("div", { style: "margin-bottom:16px" }, e.cue + "."),
      el("button", { class: "btn raised", onClick: () => chooseWorkout(e) }, "Add to workout…"));
    sheet(body);
  }
  function chooseWorkout(e) {
    if (!st.workouts.length) { toast("Create a workout first"); return; }
    const body = el("div", el("h2", {}, `Add ${e.name} to`),
      ...st.workouts.map(w => el("button", { class: "card", onClick: () => add(e, w) }, el("div", { class: "name" }, w.name))));
    sheet(body);
  }
}
```

Note: `el("div", child...)` requires attrs first; write `el("div", {}, ...)` everywhere (fix the two calls above accordingly when implementing).

- [x] **Step 2: Manual check** both modes. Commit `feat: exercise bank`.

---

### Task 8: Backup and restore on the Plan screen

**Files:** Modify `js/views/plan.js`.

- [x] **Step 1: Add below the bank card**

```js
import { validateBackup } from "../store.js";
import { getExercise } from "../exercises.js";
import { toast, confirmAsync } from "../ui.js";
// ...
const backupLine = el("div", { class: "links" },
  el("button", { class: "text-link", onClick: backup }, "Backup"),
  el("span", { class: "sep" }, "·"),
  el("button", { class: "text-link", onClick: () => fileInput.click() }, "Restore"),
  st.lastBackupAt ? el("span", { class: "sub" }, `last backup ${st.lastBackupAt.slice(0, 10)}`) : el("span", { class: "sub" }, "never backed up"));
const fileInput = el("input", { type: "file", accept: "application/json,.json", hidden: true, onChange: restore });
if (store.saveError) root.prepend(el("div", { class: "notice warn" }, "Changes are not being saved (storage unavailable or full)."));

async function backup() {
  const data = JSON.stringify({ version: 1, savedAt: st.savedAt, workouts: st.workouts }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: `morning-fit-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  await store.markBackup();
}
async function restore(e) {
  const file = e.target.files[0]; e.target.value = "";
  if (!file) return;
  let obj; try { obj = JSON.parse(await file.text()); } catch { toast("That file is not valid JSON"); return; }
  const r = validateBackup(obj, getExercise);
  if (!r.ok) { toast(r.error, 4000); return; }
  const ok = await confirmAsync(`Replace all workouts with ${r.workouts} from the backup?${r.dropped ? ` ${r.dropped} step(s) with unknown exercises will be dropped.` : ""}`);
  if (!ok) return;
  await store.replace(r.state);
  toast("Workouts restored");
  navigate("/plan"); // re-render
}
```

Append `backupLine` and `fileInput` to `root`. Because `navigate("/plan")` from `/plan` does not fire hashchange, call the view's own redraw instead: restructure `plan.js` like `workout.js` with a `draw()` function and call `draw()` after restore.

- [x] **Step 2: Manual check**: backup downloads a file; restoring it round-trips; restoring a bad file shows an error. Commit `feat: backup and restore`.

---

### Task 9: Train tab: pick, session, done, audio, clock, service worker, manifest, icons

**Files:** Create `js/clock.js`, `js/audio.js`, `js/views/train.js`, `js/views/session.js`, `js/views/done.js`, `manifest.webmanifest`, `sw.js`, `tools/icon.py`, `assets/icons/*`.

- [x] **Step 1: `js/clock.js`**

```js
export const now = () => Date.now();
let lock = null;
export async function keepAwake() {
  try { lock = await navigator.wakeLock?.request("screen"); } catch { lock = null; }
}
export function releaseAwake() { lock?.release().catch(() => {}); lock = null; }
export function reacquireOnVisible() {
  const h = () => { if (document.visibilityState === "visible" && lock === null) keepAwake(); };
  document.addEventListener("visibilitychange", h);
  return () => document.removeEventListener("visibilitychange", h);
}
```

- [x] **Step 2: `js/audio.js`**

```js
let ctx = null;
export function unlock() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = ctx || new AC();
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
}
function tone(freq, dur, delay = 0, gain = 0.25) {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = "sine"; o.frequency.value = freq;
  g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(gain, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(ctx.destination); o.start(t0); o.stop(t0 + dur + 0.05);
}
export const cues = {
  tick: () => { tone(880, 0.08); vibrate(30); },
  end: () => { tone(1320, 0.35); vibrate([80, 40, 80]); },
  sideSwitch: () => { tone(1320, 0.12); tone(1320, 0.12, 0.18); vibrate([60, 60, 60]); },
  finish: () => { tone(1046, 0.15); tone(1318, 0.15, 0.18); tone(1568, 0.3, 0.36); vibrate([80, 40, 80, 40, 160]); },
};
export function vibrate(p) { try { navigator.vibrate?.(p); } catch {} }
```

- [x] **Step 3: `js/views/train.js`**

```js
import { el } from "../ui.js";
import { totals, formatDuration } from "../workout.js";
import { unlock } from "../audio.js";

export function render({ store, navigate }) {
  const st = store.state;
  const cards = st.workouts.filter(w => totals(w).count > 0).map(w => {
    const t = totals(w);
    return el("div", { class: "card" },
      el("div", { class: "row" }, el("span", { class: "name" }, w.name), el("span", { class: "dur" }, formatDuration(t.total))),
      el("div", { class: "sub", style: "margin-bottom:12px" }, `${t.count} exercise${t.count === 1 ? "" : "s"}`),
      el("button", { class: "btn primary", onClick: () => { unlock(); navigate(`/train/session/${w.id}`); } }, "▶  Start"));
  });
  const root = el("div", {}, el("div", { class: "header" }, el("h1", {}, "Train")),
    ...(cards.length ? cards : [el("div", { class: "empty" }, "No workouts with exercises yet. Build one in Plan.")]));
  return { el: root, tabs: "train" };
}
```

- [x] **Step 4: `js/views/session.js`**

```js
import { el, confirmAsync } from "../ui.js";
import { buildPhases, Session } from "../session.js";
import { getExercise, figureUrl } from "../exercises.js";
import { totals } from "../workout.js";
import { now, keepAwake, releaseAwake, reacquireOnVisible } from "../clock.js";
import { cues, unlock } from "../audio.js";

const GET_READY_S = 3;

export function render({ store, params, navigate }) {
  const w = store.state.workouts.find(x => x.id === params.id);
  const phases = w ? buildPhases(w) : [];
  if (!phases.length) { navigate("/train"); return { el: el("div"), tabs: "train" }; }

  const root = el("div", { class: "session" });
  let session = null, timer = null, readyUntil = now() + GET_READY_S * 1000, lastReady = null;
  const ui = {};
  build();
  keepAwake();
  const stopVis = reacquireOnVisible();
  timer = setInterval(frame, 250);
  frame();
  return { el: root, tabs: null, destroy() { clearInterval(timer); stopVis(); releaseAwake(); } };

  function build() {
    ui.where = el("span", { class: "where" });
    ui.bar = el("div"); ui.h1 = el("h1"); ui.type = el("div", { class: "type" });
    ui.relaxed = el("img", { alt: "" }); ui.flexed = el("img", { alt: "" });
    ui.timer = el("div", { class: "timer" }); ui.phaseBar = el("div");
    ui.cue = el("div", { class: "cue" }); ui.next = el("div", { class: "next" });
    ui.stage = el("div", { class: "stage", onClick: () => { if (session) { session.toggle(now()); frame(); } } },
      ui.relaxed, el("div", { style: "width:100%" }, ui.timer, el("div", { class: "bar big" }, ui.phaseBar)), ui.flexed, el("div", {}, ui.cue, ui.next));
    ui.pauseBtn = el("button", { class: "pause", onClick: () => { session?.toggle(now()); frame(); } }, "▐▐  Pause");
    ui.overlay = el("div", { class: "overlay", hidden: true });
    root.replaceChildren(
      el("div", { class: "top" },
        el("button", { class: "x", "aria-label": "End session", onClick: exit }, "✕"), ui.where),
      el("div", { class: "bar" }, ui.bar),
      ui.h1, ui.type, ui.stage,
      el("div", { class: "controls" },
        el("button", { class: "side", onClick: () => { session?.back(now()); frame(); }, "aria-label": "Back" }, "‹‹"),
        ui.pauseBtn,
        el("button", { class: "side", onClick: () => { session?.skip(now()); frame(); }, "aria-label": "Skip" }, "››")),
      ui.overlay);
  }

  async function exit() {
    if (session && !session.finished) {
      const remainingExercises = session.exerciseCount - session.exerciseNo + 1;
      const wasPaused = session.paused; if (!wasPaused) session.pause(now());
      if (remainingExercises > 1 && !(await confirmAsync("End session?"))) { if (!wasPaused) session.resume(now()); return; }
    }
    navigate("/train");
  }

  function frame() {
    const t = now();
    if (!session) {
      const left = Math.ceil((readyUntil - t) / 1000);
      if (left > 0) {
        if (left !== lastReady) { lastReady = left; cues.tick(); }
        showOverlay(String(left), "Get ready", w.name);
        return;
      }
      unlock();
      session = new Session(phases, t);
      hideOverlay();
    }
    for (const ev of session.tick(t)) {
      if (ev.type === "countdown") cues.tick();
      else if (ev.type === "phase-end") cues.end();
      else if (ev.type === "side-switch") { cues.sideSwitch(); flash(); }
      else if (ev.type === "finished") cues.finish();
    }
    if (session.finished) { navigate(`/train/done/${w.id}`); return; }
    paint(t);
  }

  function paint(t) {
    const p = session.phase;
    const ex = getExercise(p.kind === "exercise" ? p.exerciseId : p.nextExerciseId);
    const type = p.kind === "exercise" ? ex.type : "rest";
    root.classList.toggle("rest", p.kind === "rest");
    root.style.setProperty("--accent", type === "rest" ? "var(--muted)" : `var(--${type})`);
    ui.where.textContent = `${w.name}  ${session.exerciseNo}/${session.exerciseCount}`;
    ui.bar.style.width = `${session.progress(t) * 100}%`;
    ui.phaseBar.style.width = `${(1 - session.phaseProgress(t)) * 100}%`;
    ui.timer.textContent = fmt(session.remainingWhole(t));
    ui.timer.classList.toggle("huge", p.kind === "rest");
    if (p.kind === "exercise") {
      ui.h1.textContent = ex.name.toUpperCase();
      const side = session.side(t);
      ui.type.textContent = cap(ex.type) + (side ? `  ·  ${cap(side)} side` : "");
      ui.type.className = `type ${ex.type}`;
      setSrc(ui.relaxed, figureUrl(ex.id, "relaxed")); ui.relaxed.hidden = false;
      setSrc(ui.flexed, figureUrl(ex.id, "flexed"));
      ui.cue.textContent = ex.cue;
      const nx = session.nextExercisePhase();
      const rest = session.restBeforeNext();
      ui.next.textContent = nx ? `Next: ${getExercise(nx.exerciseId).name} ${nx.seconds}s${rest ? ` (after ${rest}s rest)` : ""}` : "Last one";
      ui.next.className = "next";
    } else {
      const after = getExercise(p.afterExerciseId);
      ui.h1.textContent = "REST";
      ui.type.textContent = `${p.seconds}s · after ${after?.name ?? ""}`;
      ui.type.className = "type";
      ui.relaxed.hidden = true;
      setSrc(ui.flexed, figureUrl(ex.id, "flexed"));
      ui.cue.textContent = "";
      ui.next.textContent = `Next: ${ex.name} ${session.nextExercisePhase()?.seconds ?? ""}s`;
      ui.next.className = "next big";
    }
    ui.pauseBtn.textContent = session.paused ? "▶  Resume" : "▐▐  Pause";
    if (session.paused) showOverlay("▐▐", "Paused", "tap anywhere to resume", () => { session.resume(now()); frame(); });
    else hideOverlay();
  }

  function showOverlay(big, title, sub, onTap) {
    ui.overlay.replaceChildren(el("div", { class: "big" }, big), el("div", { class: "title" }, title), el("div", { class: "sub" }, sub));
    ui.overlay.onclick = onTap || null;
    ui.overlay.hidden = false;
  }
  function hideOverlay() { ui.overlay.hidden = true; }
  function flash() { root.animate([{ opacity: 1 }, { opacity: 0.3 }, { opacity: 1 }], { duration: 300 }); }
  function setSrc(img, src) { if (img.getAttribute("src") !== src) img.src = src; }
}
const fmt = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
```

- [x] **Step 5: `js/views/done.js`**

```js
import { el } from "../ui.js";
import { totals, formatDuration } from "../workout.js";
export function render({ store, params, navigate }) {
  const w = store.state.workouts.find(x => x.id === params.id);
  const root = el("div", { class: "done" },
    el("div", { class: "check" }, "✓"),
    el("h1", {}, "Nice work."),
    el("div", { class: "sub" }, w ? `${w.name} · ${formatDuration(totals(w).total)}` : ""),
    el("button", { class: "btn primary", onClick: () => navigate("/train") }, "Done"));
  return { el: root, tabs: null };
}
```

- [x] **Step 6: Manifest, icon, service worker**

`manifest.webmanifest`:
```json
{ "name": "Morning Fit", "short_name": "Morning Fit", "start_url": "./#/train", "scope": "./",
  "display": "standalone", "orientation": "portrait", "background_color": "#0F1115", "theme_color": "#0F1115",
  "icons": [ { "src": "assets/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
             { "src": "assets/icons/icon-180.png", "sizes": "180x180", "type": "image/png" } ] }
```

`tools/icon.py`: writes `assets/icons/icon.svg` (orange `#F5A524` rounded square, the cobra flexed figure in `#111` drawn with `figures.figure(COBRA, "#111", bg="#F5A524", floor=False)`), then `cairosvg.svg2png` to `icon-180.png` and `icon-512.png`.

`sw.js`:
```js
const VERSION = "v1.0.0";
const CACHE = `morningfit-${VERSION}`;
const ASSETS = [
  "./", "./index.html", "./manifest.webmanifest", "./css/app.css",
  "./js/app.js", "./js/router.js", "./js/ui.js", "./js/store.js", "./js/kv.js", "./js/seed.js", "./js/exercises.js",
  "./js/workout.js", "./js/session.js", "./js/clock.js", "./js/audio.js",
  "./js/views/plan.js", "./js/views/workout.js", "./js/views/bank.js", "./js/views/train.js", "./js/views/session.js", "./js/views/done.js",
  "./assets/icons/icon.svg", "./assets/icons/icon-180.png", "./assets/icons/icon-512.png",
  ...["pushups", "jackknife", "cat_cow", "cobra"].flatMap(id => [`./assets/figures/${id}_relaxed.svg`, `./assets/figures/${id}_flexed.svg`]),
];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET" || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
    const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return res;
  })));
});
```

- [x] **Step 7: Manual check** on desktop: start a session, watch the 3-2-1 get-ready, countdown, beeps, pause/resume, skip, back twice, rest phase preview, done screen. Run `npm test`. Commit `feat: train tab, session, PWA shell`.

---

### Task 10: Verification and hand-off

- [x] `npm test` passes; all tests listed in Tasks 1–5 exist.
- [x] `python3 -m http.server 8080` serves the app; every route renders without console errors (check with a headless fetch of each JS module for syntax: `node --check` each file, or `node -e "import('./js/session.js')"`).
- [x] README.md: what it is, how to run locally, how to deploy to GitHub Pages, how to add an exercise (pose in `tools/figures.py`, run `tools/render_figures.py`, add entry in `js/exercises.js`, bump `VERSION` in `sw.js`), backup and restore notes, iOS install steps.
- [x] Update `docs/superpowers/specs/...` status line to "implemented (v1)".
- [x] Commit `docs: README`.
