# Morning Fit

A small personal web app for a few minutes of morning strength and stretching. Installed on
an iPhone from the Home Screen, it runs full screen and offline. Two tabs:

- **Plan**: build workouts from a fixed bank of exercises. Each step has an exercise time and a
  rest time (the rest after the last exercise is never run).
- **Train**: pick a workout, get a 3-second "get ready", then a countdown per exercise with the
  relaxed and flexed figures, beeps at 3-2-1 and at the end of each phase, pause, skip, back.

No framework, no build step, no dependencies. Plain HTML, CSS and JavaScript modules.

## Run locally

```bash
python3 -m http.server 8080        # any static server works
open http://localhost:8080/
```

Tests for the pure logic (Node 18+, no install needed):

```bash
npm test
```

End-to-end smoke test with screenshots (optional, needs Playwright): see `tools/e2e/smoke.js`.

## Install on the iPhone

1. Host the files over HTTPS. GitHub Pages works: push the repo, enable Pages on the `main`
   branch, root folder. Everything is relative so a sub-path is fine.
2. Open the URL in Safari, tap Share, then **Add to Home Screen**.
3. Open it from the Home Screen icon. It runs full screen and, after the first load, offline.

Data created in Safari before installing is not shared with the installed app (iOS keeps them
separate). Connect Dropbox in the installed app and load the configuration from there.

## Keeping your workouts safe

Workouts are stored on the phone, in the app's own storage, in two copies (localStorage and
IndexedDB). They survive normal use. They are lost if you delete the icon or if iOS evicts the
storage. Mitigations:

- **The default workout lives in code** (`js/seed.js`). If storage is ever empty the app shows
  "No saved workouts found, loaded defaults" and recreates it.
- **Dropbox sync.** Tap "Connect Dropbox" at the bottom of the Plan screen. From then on every
  change is written to `Dropbox/Apps/fitapp/fitapp.cfg` (debounced, queued while offline). On
  every launch the app compares the `savedAt` inside the file with its own and takes the newer
  one. Before any overwrite the losing side is kept as `fitapp.cfg.bak.N` (lowest free N,
  never deleted).
- **After a reinstall** the app starts on the default workout. Tap "Connect Dropbox": the
  existing `fitapp.cfg` is renamed to the next `.bak.N` and the phone's state becomes the new
  `fitapp.cfg`. No prompt. Then tap the sync line, confirm "Load a saved configuration?", and
  pick the file to restore. Loading first archives the current state as another `.bak.N`.

The Dropbox app is registered as "fitapp" with app-folder access (it cannot see the rest of
your Dropbox). Its public app key is in `js/app.js`; the redirect URIs registered in the
Dropbox console are `https://gegiti.github.io/fitapp/` and `http://localhost:8080/`, and
"Allow public clients (PKCE)" is on. No secret is stored anywhere. Design:
`docs/superpowers/specs/2026-09-05-dropbox-sync-design.md`.

## Adding or changing an exercise

1. Add a pose (joint coordinates) in `tools/figures.py` and an entry in its `EXERCISES` list.
2. From `tools/`, run `python3 render_figures.py` (needs `pip install cairosvg`). It writes the
   two SVGs into `assets/figures/` and a contact sheet into `docs/mocks/figures/`.
3. Add the matching entry to `js/exercises.js` (id, name, type, sided, defaultSeconds,
   defaultRestSeconds, cue) and the two SVG paths to the `FIGURES` list in `sw.js`.
4. Bump `VERSION` in `sw.js` so installed phones pick up the new files.

## Layout

```
index.html, manifest.webmanifest, sw.js     shell, PWA manifest, offline cache
css/app.css                                 styles
js/app.js, router.js, ui.js                 boot, hash routing, DOM helpers
js/exercises.js, seed.js                    the bank and the default workout (code, not stored)
js/workout.js, session.js                   pure logic: totals, phases, countdown state machine
js/store.js, kv.js                          persistence and backup validation
js/dropbox.js, sync.js                      Dropbox client and the sync engine
js/clock.js, audio.js                       wall clock + wake lock, beeps
js/views/*.js                               one file per screen
assets/figures/*.svg, assets/icons/         shipped figures and app icon
tools/                                      generators (figures, icon, mock screens, sync mocks) and e2e test
docs/                                       mocks, spec, plan, screenshots of the real app
test/                                       node --test unit tests
```
