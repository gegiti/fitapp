# Morning Fit — Dropbox sync design spec

Date: 2026-09-05
Status: proposed, awaiting approval.
Mocks: `docs/mocks/screens/S1_not_connected.png`, `S2_synced.png`, `S2b_states.png` (swatch, not a
screen), `S3_confirm.png`, `S4_config_list.png`, `S5_reinstall.png`, `S6_loaded.png`; contact sheet
`_sync_screens.png`; generator `tools/render_sync_mocks.py`. The mocks are the visual source of truth.

## 1. Goal

Replace the manual file Backup / Restore with a fully automatic backup of the workouts to a
single file in the user's Dropbox, `Dropbox/Apps/fitapp/fitapp.cfg`, with numbered `.bak`
copies that are never deleted. No new prompt is introduced on reinstall. The only new
prompt anywhere is the one the user asks for by tapping the sync line.

Why Dropbox: a web app on iOS cannot read or write a file in iCloud Drive without a tap
per operation (Safari has no file pickers, only the sandboxed Origin Private File System).
CloudKit needs the paid developer program. Dropbox supports browser-only OAuth with
refresh tokens, CORS on its API, and shows the file in the Dropbox app and in Files.

## 2. Scope

In:
- Dropbox app-folder connection with browser-only OAuth (PKCE, refresh token, no secret).
- Automatic push of every local save to `fitapp.cfg`, debounced.
- Reconcile on launch and on return to foreground; offline queueing.
- Archive rules that turn overwrites into `.bak.N` files.
- The sync line at the bottom of the Plan view; the saved-configurations sheet.
- Removal of the file Backup / Restore UI.

Out:
- Multi-device merge. Two devices editing at once is not supported; the archive rules
  merely guarantee nothing is lost.
- Pruning old `.bak` files. They accumulate; the user deletes them in Dropbox if wanted.
- Any other Dropbox content. The app-folder permission cannot see it.

## 3. Files in Dropbox

All paths are relative to the app folder, which Dropbox shows as `Dropbox/Apps/fitapp/`.

- `fitapp.cfg`: the active configuration. Always equals the phone's state after a
  successful push.
- `fitapp.cfg.bak.N`, N an integer starting at 1: archived configurations. A new archive
  always takes the lowest integer not currently in use. Files are never deleted or
  overwritten by the app; a rename or upload to a `.bak.N` name only happens after the
  app has listed the folder and picked an unused N.

File content is the same JSON document the app stores locally, pretty-printed:

```json
{
  "version": 1,
  "savedAt": "2026-09-05T07:12:03.120Z",
  "workouts": [ { "id": "w_ab12", "name": "Morning", "steps": [ { "exerciseId": "pushups", "seconds": 60, "restSeconds": 20 } ] } ]
}
```

`savedAt` inside the file is the only timestamp the app ever compares. Dropbox file
metadata (server_modified) is never used for decisions, only `rev` is used to detect that
the remote file changed since the app last saw it. `lastBackupAt` is dropped from the
state; the parser stays tolerant of it.

## 4. User-facing behaviour

### 4.1 The sync line

One line at the bottom of the Plan view, above the tab bar, below all content
(`margin-top: auto` in a flex column; it never overlaps the cards). It is a button in every
state. Texts:

| State | Text | Colour | Tap |
|---|---|---|---|
| off | "Connect Dropbox" plus sub-line "Workouts are only on this phone" | accent | starts the Dropbox login |
| synced | "Synced to Dropbox · today 07:12" (date shown for other days) | muted, chevron | opens the load prompt (4.3) |
| saving | "Saving to Dropbox…" | muted, chevron | opens the load prompt |
| offline | "Offline · will sync when online" | muted, chevron | toast "Dropbox is not reachable" |
| error | "Sync failed · tap to retry" | accent, chevron | retries the push |

The time shown is the `savedAt` of the last successful push.

### 4.2 Connecting

Tap "Connect Dropbox". The app navigates to the Dropbox authorization page (same window;
in the installed app iOS shows it as an in-app browser). Dropbox redirects back to the
app URL with `?code=`. The app exchanges the code for tokens, cleans the URL, and runs
the **connect procedure**:

1. List the app folder.
2. If `fitapp.cfg` exists: rename it to the next free `fitapp.cfg.bak.N`. Toast
   "Previous Dropbox config kept as fitapp.cfg.bak.N".
3. Push the phone's current state as the new `fitapp.cfg`. If step 2 did not run, toast
   "Connected to Dropbox".

This is the whole reinstall story: a fresh install boots on the seed as today, the user
taps Connect, the old file is archived, the seed becomes the active file, and the user
loads the old file whenever they want through 4.3. No prompt.

The same procedure runs on every connect, including a reconnect after Disconnect or after
Dropbox revoked the token.

### 4.3 Loading a saved configuration

Tap the sync line while connected and online.

1. Native confirm: "Load a saved configuration?" with the message "Your current workouts
   will be kept in Dropbox as a new .bak file first." Cancel does nothing.
2. Bottom sheet "Saved configurations", sub-title "Dropbox / Apps / fitapp". The app
   lists the folder, downloads every `fitapp.cfg` and `fitapp.cfg.bak.N`, and shows one row
   per file: name, "current" tag on `fitapp.cfg`, the file's `savedAt` formatted as
   "today 07:12" or "5 Sep 2026 06:58", and "3 workouts · Morning, Evening, Short" (names
   truncated with an ellipsis to fit one line). Order: `fitapp.cfg` first, then the rest by
   `savedAt` descending. A file that does not parse shows "unreadable" and is not tappable.
   Below the rows: a small muted "Disconnect Dropbox" link and a "Cancel" button. Cancel,
   the backdrop, and the grip all close the sheet with no effect.
3. Tapping a row:
   a. Upload the phone's current state to the next free `fitapp.cfg.bak.N`.
   b. Validate the chosen file with the existing backup validation (steps with unknown
      exercises are dropped, as with file restore).
   c. Replace the local state with it and push it as `fitapp.cfg`.
   d. Close the sheet. Toast "Loaded fitapp.cfg.bak.3 · 3 workouts".

Choosing `fitapp.cfg` itself is allowed: it archives the phone's state and re-applies the
remote file, which is the way to discard unsynced local edits.

"Disconnect Dropbox" asks "Disconnect Dropbox? Workouts stay on this phone and in Dropbox."
On confirm it forgets the tokens (and best-effort revokes them), and the line returns to
"Connect Dropbox". Nothing in Dropbox is touched.

### 4.4 Automatic sync in normal use

- **Every local save** marks the state dirty and schedules a push 1.5 s later (edits
  during that window are coalesced). The line shows "Saving to Dropbox…" then "Synced".
- **On launch and on return to foreground** (visibilitychange to visible), when connected
  and online, the app reconciles (section 5.2). If Dropbox is newer, the phone applies it
  and toasts "Updated from Dropbox".
- **Offline**: no network calls; the line shows "Offline · will sync when online". The
  `online` event triggers a reconcile.
- **Failures**: a failed push is retried after 5 s and again after 30 s. After that the
  line shows "Sync failed · tap to retry", and the next launch, foreground, or `online`
  event retries too. A 401 that survives one token refresh means the connection is gone:
  the line goes back to "Connect Dropbox" and a toast says "Dropbox disconnected, connect
  again".

There are no prompts in any of this.

### 4.5 What goes away

The Backup and Restore links, the hidden file input, and `lastBackupAt`. The README's
"Keeping your workouts safe" section is rewritten around Dropbox.

## 5. Sync rules

### 5.1 Persistent sync record

Stored in localStorage under `morningfit.sync.v1`:

```
{ refreshToken, accessToken, accessExpiresAt,   // OAuth
  syncedSavedAt,   // savedAt of the local state last known to equal fitapp.cfg
  remoteRev }      // Dropbox rev of fitapp.cfg after the last push or pull
```

"Dirty" means `state.savedAt !== syncedSavedAt`. The record is not in IndexedDB and is
not part of the config file.

### 5.2 Reconcile

Runs when connected and online, on launch, foreground, `online`, and after a connect.
Pure decision function `decide({ localSavedAt, syncedSavedAt, remoteRev, remote })` where
`remote` is `null` (no file) or `{ savedAt, rev }`:

| Situation | Action |
|---|---|
| remote missing | push |
| remote.savedAt === localSavedAt | nothing; record rev |
| remote newer, local not dirty | pull: apply remote, toast "Updated from Dropbox" |
| remote newer, local dirty | archive local (upload as next `.bak.N`), then pull |
| local newer, remote.rev === remoteRev | push |
| local newer, remote.rev !== remoteRev (someone else wrote it) | archive remote (rename to next `.bak.N`), then push |

Comparisons are string comparisons of ISO timestamps. "Newer" is strictly greater.

### 5.3 Push

Upload the pretty-printed state to `/fitapp.cfg` with mode `overwrite`. On success record
`syncedSavedAt = state.savedAt` and `remoteRev = result.rev`. If the state changed during
the upload (savedAt moved on), it is still dirty and another push is scheduled.

### 5.4 Next bak name

`nextBakName(names)`: from the folder listing, collect integers N from names matching
`^fitapp\.cfg\.bak\.(\d+)$`, return `fitapp.cfg.bak.` followed by the smallest integer ≥ 1
not in the set. Archive operations always list first, then act, and retry once with a
fresh listing if Dropbox reports a conflict on the target name.

## 6. Technical structure

### 6.1 New files

- `js/dropbox.js`: the Dropbox client. Plain `fetch`, no SDK. Exports
  `createDropbox({ appKey, redirectUri, storage, fetch })` with:
  `authorizeUrl()` (generates PKCE verifier, stores it, returns the URL),
  `finishAuth(code)`, `isConnected()`, `disconnect()`,
  `list()` → `[{ name, rev }]`, `download(name)` → `{ text, rev } | null`,
  `upload(name, text)` → `{ rev }`, `move(from, to)`.
  Handles the access-token refresh on 401 once; throws `DropboxAuthError` if the refresh
  fails, `DropboxError` otherwise. Endpoints: `www.dropbox.com/oauth2/authorize`,
  `api.dropboxapi.com/oauth2/token`, `/2/files/list_folder`, `/2/files/move_v2`,
  `/2/auth/token/revoke`, `content.dropboxapi.com/2/files/download` and `/2/files/upload`.
  App key `4rmxsnol2k5kibm` (public identifier). Redirect URI is the app's own URL without
  hash or query (`location.origin + location.pathname`), registered in the Dropbox console
  as `https://gegiti.github.io/fitapp/` and `http://localhost:8080/`.
- `js/sync.js`: the engine. Exports the pure functions `decide`, `nextBakName`,
  `describeConfig(text)` → `{ savedAt, count, names } | null`, `formatSyncTime(iso, now)`,
  and `createSync({ store, dropbox, storage, now, online, toast, getExercise })` with
  `status` (`off | synced | saving | offline | error`), `syncedAt`, `subscribe(fn)`,
  `connect()`, `handleRedirect(url)`, `reconcile()`, `pushSoon()`, `retry()`,
  `listConfigs()`, `loadConfig(name)`, `disconnect()`. It subscribes to the store to
  schedule pushes. All timers and network go through injected dependencies so tests run
  with fakes.
- `test/sync.test.js`, `test/dropbox.test.js`: node tests with a fake fetch and fake
  storage; cover every row of the decision table, bak numbering including gaps, the
  connect procedure with and without an existing file, load-config archiving order,
  offline queueing, retry and the 401 path.

### 6.2 Changed files

- `js/views/plan.js`: remove Backup / Restore; add the sync line and the saved-
  configurations sheet; subscribe to sync status.
- `js/app.js`: create the Dropbox client and sync engine; on boot, if the URL has
  `?code=`, finish auth and run the connect procedure, then clean the URL with
  `history.replaceState`; wire `online` and `visibilitychange`; pass `sync` to views.
- `js/store.js`: drop `markBackup` and `lastBackupAt` (parser stays tolerant).
- `css/app.css`: Plan view as a flex column with the sync line at the bottom; sheet rows
  for the config list; "current" tag.
- `sw.js`: add `js/dropbox.js` and `js/sync.js` to the precache list; bump `VERSION`. The
  existing `ignoreSearch` match already serves the cached shell for the `?code=` redirect.
  Cross-origin requests are not intercepted, so API calls bypass the cache.
- `README.md`: rewrite the backup section; add the Dropbox app setup notes.
- `tools/e2e/smoke.cjs`: screenshots of the Plan view keep working with the line in the
  off state; no Dropbox calls in e2e.

### 6.3 Error handling

- Network or 5xx during push: retry schedule in 4.4, then error state.
- 409 `path/not_found` on download: treated as "no file".
- 409 `path/conflict` on move or upload to a `.bak.N`: relist and retry once, then error.
- Unparseable `fitapp.cfg` on pull: not applied; toast "Dropbox file is unreadable, keeping
  phone workouts"; the phone's next push archives it (rule: rev unknown → archive, then
  push) so the bad file is preserved for inspection.
- Storage write failures for the sync record: the existing `saveError` notice covers it.

## 7. Risks and verification on the phone

- **The OAuth redirect in the installed app.** Expected: iOS opens dropbox.com in the in-app
  browser and closes it when Dropbox redirects back into the app's scope. If instead the
  redirect lands in Safari (separate storage), the connection would not reach the app.
  Fallback if that happens: add Dropbox's no-redirect flow, where the user copies a code
  shown by Dropbox and pastes it into the app. Not built unless needed.
- **Token lifetime.** Refresh tokens do not expire unless revoked; access tokens last four
  hours and are refreshed silently.
- **Clock.** `savedAt` comes from the phone clock; with one device this is safe.

Verification checklist after deploy: connect on the phone; edit a workout and see the file
change in the Dropbox app; kill and relaunch offline; go online and see the push; delete
the Home Screen icon, reinstall, connect, confirm the old file became `.bak.1` and load it.
