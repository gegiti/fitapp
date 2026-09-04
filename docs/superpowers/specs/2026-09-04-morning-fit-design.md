# Morning Fit — v1 design spec

Date: 2026-09-04
Status: awaiting user review
Mocks: `docs/mocks/2026-09-04-v1-mockups.md` (rendered screens in `docs/mocks/screens/`,
figures in `docs/mocks/figures/`). The mocks are the visual source of truth; this spec
covers behaviour, data, and technical structure.

## 1. Goal

A single-user web app, installed on one iPhone from the Home Screen, that guides a short
morning routine of strength and stretching. Two tabs: **Plan** (build workouts from a
fixed exercise bank) and **Train** (run a workout with a countdown and two figures per
exercise). Starts minimal; features are added only when needed.

## 2. Scope of v1

In:
- Exercise bank of exactly four exercises, defined in code: push-ups, jackknife sit-ups,
  cat/cow, cobra. Each has a relaxed and a flexed SVG figure, a type, a default time,
  a default rest, and a cue line.
- Multiple workouts. Each workout is an ordered list of steps; a step is an exercise id,
  an exercise time, and a rest time.
- Train: pick a workout, run it phase by phase with a countdown, beeps, pause, skip, back.
- Installable PWA that works offline after first load.
- Backup and restore of workouts to and from a JSON file.

Out (explicitly not in v1):
- In-app exercise editing, custom images, uploads.
- History, streaks, statistics, calendar.
- Reps-based exercises. Everything is timed.
- Accounts, sync, multiple devices.
- Landscape layout, light theme, push notifications.

## 3. User-facing behaviour

### 3.1 Plan tab

**Workouts list.** Shows every workout with name, total duration (work plus rest,
excluding the last step's rest, which is never run), and a "N strength · M stretch" summary. "+" creates a
new workout named "Workout N" and opens it. Swipe left deletes after confirmation.
A row opens the exercise bank in browse mode. Small links: Backup, Restore.

**Workout editor.** Title is editable in place. Header shows total, work, and rest
time. Each step row shows a drag handle, index, flexed thumbnail, name, an "L/R" badge
if the exercise is sided, exercise time, and rest time greyed out ("+20s"). Tapping a row
opens the step sheet. Swipe left removes the step. Drag handle reorders.
"+ Add exercise" opens the bank in pick mode. "Delete workout" at the bottom, with confirm.

**Step sheet.** Two steppers. Exercise time: 5 s increments, minimum 5 s. For a sided
exercise the increment is 10 s so each side is a whole number, and the sheet shows
"x s per side". Rest after: 5 s increments, minimum 0. Under each stepper the exercise's
own default is shown ("default for this exercise: 60 s"). "Remove from workout". "Done".

**Exercise bank.** Filter chips All / Strength / Stretch. Rows grouped by type show
flexed thumbnail, name, L/R badge if sided, default time, default rest greyed.
- Browse mode (from workouts list): tapping a row opens a detail sheet with both figures,
  type, defaults, and the cue. The sheet has an "Add to workout…" button that lists
  workouts to add it to.
- Pick mode (from a workout editor): tapping a row adds a step with the exercise's default
  time and rest, and returns to the editor. Header reads "Add to <workout name>".

**Backup.** Downloads `morning-fit-backup-YYYY-MM-DD.json` containing all workouts.
**Restore.** Picks a JSON file, validates it, and replaces all workouts after confirmation.

### 3.2 Train tab

**Pick workout.** One card per workout with name, total, exercise count, and a large
Start button. Start shows a 3 second "Get ready" countdown, then the session.

**Session.** A workout expands into a flat list of phases:
for each step, an exercise phase, then a rest phase if the step's rest is above 0 and
the step is not the last one. **The last step's rest is never run**, whatever value is
stored for it: the session goes straight from the last exercise to Done. Workout totals
exclude it as well. The value stays on the step so that reordering keeps it. Sided
exercise phases are one phase with a side switch at the midpoint.

Screen layout (stacked): header with exit ✕, workout name and "i/N" where i counts
exercise phases only; overall progress bar; exercise name in caps; type line, with
"Left side" / "Right side" appended for sided phases; relaxed figure (muted);
large countdown with a per-phase draining bar; flexed figure (type colour); cue line;
"Next:" line; controls prev / pause / skip. No text labels under the figures.

Rest phase layout: "REST", "<rest>s · after <exercise>", large centred countdown,
"Next: <exercise> <time>s", and the next exercise's flexed figure as a preview.

Behaviour:
- Countdown counts whole seconds down to 0:00, then advances automatically.
- Sound: single beep at each phase end; short ticks at 3, 2, 1; a double beep at the
  midpoint of a sided phase. Vibration where the platform supports it (iOS Safari does not).
- Tap anywhere on the figures or timer area toggles pause. Paused state dims the screen
  and shows "Paused · tap anywhere to resume". The Pause button does the same.
- `‹‹`: restart the current phase. Pressed again within 2 seconds, go to the previous
  phase. `››`: next phase. During a sided phase, `››` first jumps to the second side.
- ✕ ends the session. If more than one exercise phase remains, confirm first.
- The screen stays awake during a session where Wake Lock is available.
- If the app is backgrounded, the timer resumes correctly on return because phase
  timing is based on timestamps, not tick counts. Audio cues missed while in the
  background are not replayed.
- The "Next:" line on an exercise phase reads "<exercise> <time>s" or
  "<exercise> <time>s (after <rest>s rest)" when a rest phase comes first.
  On the last exercise it reads "Last one".

**Done.** Check mark, "Nice work.", workout name and total, Done button back to pick.

### 3.3 First launch

If no data is stored, one workout named "Morning" is created with all four exercises
at their defaults, in bank order.

## 4. Data

### 4.1 Exercise (in code, not stored)

```
{ id: "pushups", name: "Push-ups", type: "strength" | "stretch", sided: false,
  defaultSeconds: 60, defaultRestSeconds: 20,
  cue: "Elbows tucked, chest to floor",
  relaxed: "assets/figures/pushups_relaxed.svg", flexed: "assets/figures/pushups_flexed.svg" }
```

Initial bank:

| id        | name              | type     | sided | time | rest |
|-----------|-------------------|----------|-------|------|------|
| pushups   | Push-ups          | strength | no    | 60   | 20   |
| jackknife | Jackknife sit-ups | strength | no    | 60   | 20   |
| cat_cow   | Cat / cow         | stretch  | no    | 60   | 10   |
| cobra     | Cobra             | stretch  | no    | 60   | 10   |

Adding an exercise later: add a pose to the figure generator, run it to emit the two
SVGs, add one entry to the bank list. No other change.

### 4.2 Stored state (localStorage, key `morningfit.v1`)

```
{ version: 1, savedAt: "2026-09-04T06:12:00Z",
  workouts: [ { id: "w_<random>", name: "Morning",
                steps: [ { exerciseId: "pushups", seconds: 60, restSeconds: 20 }, … ] } ] }
```

- Saved on every change, synchronously to localStorage and then to IndexedDB (see 4.4).
- On load, if parsing fails, the raw string is copied to `morningfit.v1.corrupt` and
  the app starts with the first-launch default.
- A step whose exerciseId is not in the bank is shown as "Missing exercise" in the editor
  (removable) and skipped when building session phases.

### 4.3 Backup file

Same shape as stored state. Restore accepts only `version: 1`, requires `workouts` to be
an array, drops steps with unknown exercise ids or non-numeric times, and shows a summary
("3 workouts, 1 step dropped") before replacing.

### 4.4 Data durability on iOS

What can wipe local data for a Home Screen web app, and what the design does about it.

**Where the data lives.** In the installed app's own storage container. Since iOS 16.4
a Home Screen web app has storage separate from Safari. Consequences:
- Workouts created in Safari before installing do not appear in the installed app,
  and vice versa. Backup and restore is the way to move data between them.
- Clearing Safari's history and website data does not touch the installed app's
  storage. Deleting the app icon from the Home Screen does.

**The 7-day rule.** Safari deletes script-writable storage (localStorage, IndexedDB,
Cache API, service worker registrations) for a site the user has not interacted with in
7 days of Safari use. Apple's stated policy is that Home Screen web apps are exempt:
their "days of use" counter is driven by use of the app itself, so an app that is
opened when it is used does not hit the rule. In practice this is the case people rely
on. It remains a policy, not a contract.

**Eviction under storage pressure.** Any browser may evict "best effort" storage when
the device is low on space. The app calls `navigator.storage.persist()` at startup,
which where honoured moves the origin to persistent storage. Support on iOS is limited,
so this is a belt, not the braces.

**Offline cache is separate from data.** Losing the service worker cache only means the
app needs network once to reload itself. It does not affect workouts.

**Mitigations in v1, in order of how much they matter:**
1. **Seed workouts live in code.** The default workout created on first launch is the
   user's real routine, kept in `js/seed.js`. If storage is ever wiped, the app comes back
   with the routine as last committed rather than empty. Keeping it current is a code
   edit, the same as changing an exercise.
2. **Detect and say so.** When the app has to seed because nothing was stored, it shows a
   one-line notice ("No saved workouts found, loaded defaults") so a wipe never goes
   unnoticed.
3. **Backup to a file** goes to Files or iCloud Drive via the share sheet. Restore reads
   it back. The workouts list shows the date of the last backup, greyed, as a nudge.
4. **Two copies in storage.** Every save writes the same JSON to localStorage and
   IndexedDB. On load, whichever parses and has the newer `savedAt` wins. This guards
   against a corrupted single write, not against an origin-wide wipe, which clears both.
5. `navigator.storage.persist()` as above.

Not doing in v1: a server or cloud sync. If wipes ever happen in practice, the next step
is automatic export to a tiny endpoint or a GitHub Gist, which is a small addition on top
of the backup format.

## 5. Technical design

### 5.1 Stack

- Plain HTML, CSS, and JavaScript ES modules. No framework, no bundler, no build step.
  The files served are the files in the repo.
- Node 18 built-in test runner (`node --test`) for the pure modules. No npm dependencies.
- Hosted as static files over HTTPS (GitHub Pages). All paths relative so the app works
  from a sub-path.

Why: the app is small, one user, and the strongest requirement is "start simple and
add only what is needed". A build step would be the largest piece of complexity in the
project.

### 5.2 Files

```
index.html                 shell: tab bar, one <main> the router renders into
manifest.webmanifest       name, icons, display: standalone, dark theme colour
sw.js                      service worker: precache app shell + figures, cache-first
assets/icons/              app icon (PNG 180 and 512) generated from an SVG
assets/figures/*.svg       the shipped exercise figures
css/app.css                tokens (colours, spacing), layout, components
js/app.js                  boot: register sw, load store, start router
js/router.js               hash routes → view functions; tab bar state
js/exercises.js            the bank (data only) + lookup helpers
js/store.js                load/save/seed, backup/restore serialisation + validation
js/workout.js              pure helpers: totals, summaries, step defaults, reorder
js/session.js              pure session engine (phases + state machine), no DOM/timers
js/clock.js                thin wrapper: now(), setTimeout/interval, wake lock
js/audio.js                Web Audio beeps, unlocked on first user tap
js/views/plan.js           workouts list
js/views/workout.js        workout editor + step sheet
js/views/bank.js           exercise bank (browse + pick) + detail sheet
js/views/train.js          pick workout
js/views/session.js        session screen, binds engine to DOM and audio
js/views/done.js           done screen
js/ui.js                   tiny DOM helpers (el(), sheet(), confirm())
tools/figures.py           pose definitions → assets/figures/*.svg (moved from docs/mocks/tools)
tools/render_mocks.py      mock screens for docs (kept, not shipped)
test/*.test.js             node --test files for workout.js, session.js, store.js
```

### 5.3 Session engine (js/session.js)

Pure and testable. Input: a workout and the bank. Output: phases and a state machine
driven by explicit calls.

```
buildPhases(workout, bank) →
  [ { kind: "exercise", stepIndex, exerciseId, seconds, sided, exerciseNo }, 
    { kind: "rest", stepIndex, seconds, afterExerciseId, nextExerciseId }, … ]

createSession(phases, now) → state
  state: { phaseIndex, phaseStartedAt, pausedAt | null, pausedTotal, finished }
  actions: tick(now), pause(now), resume(now), skip(now), back(now), end()
  derived: remaining(now), sideOf(now) ("left" | "right" | null), progress(now)
  events emitted from tick: "countdown" (3,2,1), "phase-end", "side-switch", "finished"
```

Time is computed as `now - phaseStartedAt - pausedTotal`, so a throttled or backgrounded
tab still lands on the right phase when it wakes. The view calls tick roughly 4 times a
second and renders the returned values. Audio and haptics react to emitted events.

### 5.4 PWA and iOS specifics

- `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style: black-translucent`,
  `viewport-fit=cover`, safe-area insets in CSS for the tab bar and top header.
- `apple-touch-icon` 180×180 so the Home Screen icon is correct.
- Service worker precaches the shell and figures with a version string in the cache name.
  Bumping the version invalidates old caches. Updates are picked up on next launch;
  a small "Updated, reload" toast is shown when a new worker takes over.
- Audio: iOS requires a user gesture before sound. The Start button creates and resumes
  the AudioContext. Beeps are short oscillator tones, no audio files.
- Wake Lock: `navigator.wakeLock.request("screen")` when the session starts, re-requested
  on `visibilitychange` back to visible. Silently skipped if unsupported.
- Vibration: `navigator.vibrate` where present. Not available on iOS; no fallback.
- Backup uses a Blob URL with a download attribute, which on iOS opens the share/save
  sheet. Restore uses `<input type="file" accept="application/json">`.
- Prevent double-tap zoom and text selection on the session screen.

### 5.5 Visual system

From the mocks: background `#0F1115`, card `#1C1F26`, raised `#262A33`, text `#F3F4F6`,
muted `#9AA0AB`, strength `#F5A524`, stretch `#2DD4BF`, relaxed figure `#7C8290`,
destructive `#F0645C`. System font stack. Timer uses `font-variant-numeric: tabular-nums`.
Minimum tap target 44 pt. Primary actions at the bottom of the screen.

## 6. Error handling

- Storage full or unavailable: show a persistent banner "Changes are not being saved";
  the app keeps working in memory.
- Restore with an invalid file: error message naming the problem, nothing replaced.
- Missing exercise in a workout: visible in the editor, skipped in the session, never crashes.
- Audio context fails to start: session runs silently; no error shown.
- Service worker registration fails (for example on plain http during local dev): app
  runs normally without offline support.

## 7. Testing

- `node --test` covers: phase building (rest always omitted after the last step and when 0, sided
  flag carried through, missing exercises skipped), totals and summaries, session state
  transitions (tick, pause/resume accounting, skip, back-twice rule, side switch event
  at the midpoint, finish), store load/seed/corrupt-fallback, newer-copy-wins merge, backup/restore validation.
- Manual checklist on the iPhone: install to Home Screen, run offline, sound after Start,
  screen stays on, backgrounding and returning mid-phase, backup to Files, restore.

## 8. Delivery

- Git repo in `/root/fitapp`, default branch `main`.
- Deployed by pushing to GitHub with Pages serving the repo root. The exact repo is the
  user's choice at build time.
- Local development: `python3 -m http.server` or any static server; open on the phone
  over the local network for real-device checks (no service worker over http, which is fine).
