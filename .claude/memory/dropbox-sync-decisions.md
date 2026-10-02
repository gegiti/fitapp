---
name: dropbox-sync-decisions
description: Dropbox app key and the user's decisions for the automatic backup (fitapp.cfg + .bak.N in Dropbox/Apps/fitapp), decided 2026-09-05
metadata:
  type: project
---

On 2026-09-05 the user replaced the manual file backup with automatic Dropbox sync; built, merged to main and pushed the same day (sw.js v1.2.0). Verified in Playwright WebKit (connect, edit, repeated redirect, load, reinstall) at v1.2.5; the real-phone connect was still being debugged at the end of 2026-09-05. Spec: `docs/superpowers/specs/2026-09-05-dropbox-sync-design.md`. Dropbox app "fitapp", App-folder permission, app key `4rmxsnol2k5kibm` (public identifier, fine to commit). Redirect URIs registered: `https://gegiti.github.io/fitapp/` and `http://localhost:8080/`.

**Why:** The user first asked for iCloud Drive; a web app on iOS cannot write files there silently, and CloudKit needs the paid developer program. They rejected GitHub as the store. They chose Dropbox because it gives a real single file they can see. Decisions they made explicitly: file lives at `Apps/fitapp/fitapp.cfg`; archives are `fitapp.cfg.bak.N` (lowest free integer from 1, never pruned); on reinstall no prompt ever, connecting archives the old file and pushes the phone state; the sync line at the bottom of the Plan view is a button that opens a "Load a saved configuration?" confirm then a list of all cfg files; loading first archives the current state; timestamps compared come from `savedAt` inside the file, never Dropbox metadata; file Export/Import dropped; Disconnect is a small link in the config list.

**How to apply:** Keep to these rules when touching sync. Do not add prompts on reinstall. If the OAuth redirect does not land in the installed app on the real phone, the agreed fallback is Dropbox's copy-the-code flow. Run `BROWSER=webkit node tools/e2e/smoke.cjs` as well as Chromium before deploying. Code: `js/dropbox.js` (client), `js/sync.js` (rules + engine), sync line in `js/views/plan.js`. See [[morning-fit-project]].
