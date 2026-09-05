# Dropbox Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the manual file Backup / Restore with automatic sync of the workouts to `Dropbox/Apps/fitapp/fitapp.cfg`, with numbered `.bak.N` archives and no prompt on reinstall.

**Architecture:** Two new modules. `js/dropbox.js` is a plain-fetch Dropbox client (PKCE OAuth, list / download / upload / move). `js/sync.js` holds pure decision functions plus an engine that subscribes to the store, debounces pushes, reconciles on launch, and archives before every overwrite. The Plan view gets a bottom sync line and a saved-configurations sheet. Everything network- or timer-related is injected so node tests run with fakes.

**Tech Stack:** Plain ES modules, no build step, no dependencies. `node --test` (Node 18+). Dropbox HTTP API v2.

**Spec:** `docs/superpowers/specs/2026-09-05-dropbox-sync-design.md`

## Global Constraints

- No framework, no build step, no npm dependencies. Tests: `npm test` runs `node --test test/`.
- App key `4rmxsnol2k5kibm`; redirect URI is `location.origin + location.pathname` (registered: `https://gegiti.github.io/fitapp/`, `http://localhost:8080/`).
- File names: `fitapp.cfg`, `fitapp.cfg.bak.N` with N the lowest unused integer ≥ 1. The app never deletes or overwrites a `.bak.N`.
- Only `savedAt` inside the file is compared. Dropbox `rev` is used only to detect "changed since we last saw it".
- No prompt on reinstall. The only new prompts: "Load a saved configuration?" and "Disconnect Dropbox?", both user-initiated.
- Sync line texts exactly as in spec 4.1. Toasts exactly as in spec 4.2 to 4.4.
- Bump `VERSION` in `sw.js` and add new JS files to its precache list.
- Commit with `-c user.name=Claude -c user.email=noreply@anthropic.com` and end messages with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

### Task 1: Store: `touch` option on save, drop `lastBackupAt`

**Files:**
- Modify: `js/store.js`
- Test: `test/store.test.js`

**Interfaces:**
- Produces: `store.save({ touch = true })`, `store.replace(state, { touch = true })`. With `touch: false` the state's `savedAt` is kept as is. `markBackup` and `lastBackupAt` are gone.

- [ ] **Step 1: Write the failing test** (append to `test/store.test.js`)

```js
test("replace with touch:false keeps the incoming savedAt", async () => {
  const store = createStore({ local: memoryAdapter(), idb: memoryAdapter(), now: () => "2026-09-05T09:00:00Z" });
  await store.load();
  await store.replace({ version: 1, savedAt: "2026-01-01T00:00:00Z", workouts: [] }, { touch: false });
  assert.equal(store.state.savedAt, "2026-01-01T00:00:00Z");
  await store.replace({ version: 1, savedAt: "2026-01-01T00:00:00Z", workouts: [] });
  assert.equal(store.state.savedAt, "2026-09-05T09:00:00Z");
});

test("state no longer carries lastBackupAt", () => {
  const st = parseState(JSON.stringify({ ...good, lastBackupAt: "2026-01-01T00:00:00Z" }));
  assert.equal("lastBackupAt" in st, false);
});
```

- [ ] **Step 2: Run to verify it fails**: `npm test` → the two new tests fail (`lastBackupAt` present; savedAt touched).

- [ ] **Step 3: Implement** in `js/store.js`: in `normalizeState` drop the `lastBackupAt` line; in `validateBackup` return `state: { version: 1, savedAt: null, workouts }`; replace `save`, `replace`, `markBackup` with:

```js
    async save({ touch = true } = {}) {
      if (touch || !store.state.savedAt) store.state.savedAt = now();
      const s = JSON.stringify(store.state);
      store.saveError = null;
      try { await local.set(s); } catch (e) { store.saveError = e; }
      await idb.set(s);
      subs.forEach(fn => fn(store.state));
    },

    async replace(state, opts) { store.state = state; await store.save(opts); },
```

- [ ] **Step 4: Run tests**: `npm test` → all pass.
- [ ] **Step 5: Commit**: `git add js/store.js test/store.test.js && git commit -m "refactor: store.save touch option, drop lastBackupAt"`

---

### Task 2: Dropbox client

**Files:**
- Create: `js/dropbox.js`
- Test: `test/dropbox.test.js`

**Interfaces:**
- Produces: `createDropbox({ appKey, redirectUri, storage, key?, fetch?, crypto?, now? })` returning
  `{ authorizeUrl(): Promise<string>, finishAuth(code, state): Promise<void>, isConnected(): boolean, disconnect(): Promise<void>, list(): Promise<{name, rev}[]>, download(name): Promise<{text, rev}|null>, upload(name, text): Promise<{rev}>, move(from, to): Promise<void> }`
  and classes `DropboxError { status, tag }`, `DropboxAuthError`.
- Storage record under key `morningfit.dropbox.v1`: `{ verifier, state, refreshToken, accessToken, expiresAt }`.

- [ ] **Step 1: Write the failing tests** in `test/dropbox.test.js`

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createDropbox, DropboxError, DropboxAuthError } from "../js/dropbox.js";

function fakeStorage() { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) }; }
function jsonRes(status, body, headers = {}) {
  return { ok: status < 300, status, headers: { get: h => headers[h] ?? null }, async json() { return body; }, async text() { return typeof body === "string" ? body : JSON.stringify(body); } };
}
// A scripted fetch: each call shifts the next response; records requests.
function fakeFetch(script) {
  const calls = [];
  const f = async (url, init = {}) => { calls.push({ url, init }); const r = script.shift(); if (!r) throw new Error("no scripted response for " + url); return typeof r === "function" ? r() : r; };
  f.calls = calls; return f;
}
const connected = () => JSON.stringify({ refreshToken: "R", accessToken: "A", expiresAt: Date.now() + 3600e3 });

test("authorizeUrl carries PKCE and offline access, and stores the verifier", async () => {
  const storage = fakeStorage();
  const db = createDropbox({ appKey: "KEY", redirectUri: "https://x/y/", storage, fetch: fakeFetch([]) });
  const url = new URL(await db.authorizeUrl());
  assert.equal(url.origin + url.pathname, "https://www.dropbox.com/oauth2/authorize");
  assert.equal(url.searchParams.get("client_id"), "KEY");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("token_access_type"), "offline");
  assert.equal(url.searchParams.get("redirect_uri"), "https://x/y/");
  const rec = JSON.parse(storage.getItem("morningfit.dropbox.v1"));
  assert.ok(rec.verifier.length >= 43);
  assert.equal(url.searchParams.get("state"), rec.state);
  assert.equal(db.isConnected(), false);
});

test("finishAuth exchanges the code with the verifier and stores tokens", async () => {
  const storage = fakeStorage();
  const fetch = fakeFetch([jsonRes(200, { access_token: "A", refresh_token: "R", expires_in: 14400 })]);
  const db = createDropbox({ appKey: "KEY", redirectUri: "https://x/y/", storage, fetch, now: () => 1000 });
  await db.authorizeUrl();
  const { verifier, state } = JSON.parse(storage.getItem("morningfit.dropbox.v1"));
  await db.finishAuth("CODE", state);
  const body = new URLSearchParams(fetch.calls[0].init.body);
  assert.equal(fetch.calls[0].url, "https://api.dropboxapi.com/oauth2/token");
  assert.deepEqual([body.get("code"), body.get("grant_type"), body.get("client_id"), body.get("code_verifier"), body.get("redirect_uri")], ["CODE", "authorization_code", "KEY", verifier, "https://x/y/"]);
  const rec = JSON.parse(storage.getItem("morningfit.dropbox.v1"));
  assert.deepEqual([rec.accessToken, rec.refreshToken, rec.expiresAt, rec.verifier], ["A", "R", 1000 + 14400e3, undefined]);
  assert.equal(db.isConnected(), true);
});

test("finishAuth rejects a state mismatch", async () => {
  const storage = fakeStorage();
  const db = createDropbox({ appKey: "KEY", redirectUri: "https://x/", storage, fetch: fakeFetch([]) });
  await db.authorizeUrl();
  await assert.rejects(db.finishAuth("CODE", "wrong"), DropboxAuthError);
});

test("list pages through list_folder and returns names and revs", async () => {
  const storage = fakeStorage(); storage.setItem("morningfit.dropbox.v1", connected());
  const fetch = fakeFetch([
    jsonRes(200, { entries: [{ ".tag": "file", name: "fitapp.cfg", rev: "r1" }, { ".tag": "folder", name: "junk" }], has_more: true, cursor: "C" }),
    jsonRes(200, { entries: [{ ".tag": "file", name: "fitapp.cfg.bak.1", rev: "r2" }], has_more: false }),
  ]);
  const db = createDropbox({ appKey: "KEY", redirectUri: "https://x/", storage, fetch });
  assert.deepEqual(await db.list(), [{ name: "fitapp.cfg", rev: "r1" }, { name: "fitapp.cfg.bak.1", rev: "r2" }]);
  assert.equal(fetch.calls[0].url, "https://api.dropboxapi.com/2/files/list_folder");
  assert.equal(JSON.parse(fetch.calls[0].init.body).path, "");
  assert.equal(fetch.calls[0].init.headers.Authorization, "Bearer A");
  assert.equal(fetch.calls[1].url, "https://api.dropboxapi.com/2/files/list_folder/continue");
  assert.equal(JSON.parse(fetch.calls[1].init.body).cursor, "C");
});

test("download returns text and rev, or null when the file is missing", async () => {
  const storage = fakeStorage(); storage.setItem("morningfit.dropbox.v1", connected());
  const fetch = fakeFetch([
    jsonRes(200, "{\"version\":1}", { "Dropbox-API-Result": JSON.stringify({ rev: "r9" }) }),
    jsonRes(409, { error_summary: "path/not_found/..", error: { ".tag": "path", path: { ".tag": "not_found" } } }),
  ]);
  const db = createDropbox({ appKey: "KEY", redirectUri: "https://x/", storage, fetch });
  assert.deepEqual(await db.download("fitapp.cfg"), { text: "{\"version\":1}", rev: "r9" });
  assert.equal(JSON.parse(fetch.calls[0].init.headers["Dropbox-API-Arg"]).path, "/fitapp.cfg");
  assert.equal(await db.download("fitapp.cfg"), null);
});

test("upload overwrites and returns the new rev; move posts from/to", async () => {
  const storage = fakeStorage(); storage.setItem("morningfit.dropbox.v1", connected());
  const fetch = fakeFetch([jsonRes(200, { rev: "r2" }), jsonRes(200, { metadata: {} })]);
  const db = createDropbox({ appKey: "KEY", redirectUri: "https://x/", storage, fetch });
  assert.deepEqual(await db.upload("fitapp.cfg", "{}"), { rev: "r2" });
  const arg = JSON.parse(fetch.calls[0].init.headers["Dropbox-API-Arg"]);
  assert.deepEqual([arg.path, arg.mode, arg.mute, fetch.calls[0].init.body], ["/fitapp.cfg", "overwrite", true, "{}"]);
  await db.move("fitapp.cfg", "fitapp.cfg.bak.1");
  assert.equal(fetch.calls[1].url, "https://api.dropboxapi.com/2/files/move_v2");
  assert.deepEqual(JSON.parse(fetch.calls[1].init.body), { from_path: "/fitapp.cfg", to_path: "/fitapp.cfg.bak.1", autorename: false });
});

test("a 401 refreshes the token once and retries; a failed refresh disconnects", async () => {
  const storage = fakeStorage(); storage.setItem("morningfit.dropbox.v1", connected());
  const fetch = fakeFetch([
    jsonRes(401, { error_summary: "expired_access_token/" }),
    jsonRes(200, { access_token: "A2", expires_in: 14400 }),
    jsonRes(200, { entries: [], has_more: false }),
    jsonRes(401, { error_summary: "expired_access_token/" }),
    jsonRes(400, { error: "invalid_grant" }),
  ]);
  const db = createDropbox({ appKey: "KEY", redirectUri: "https://x/", storage, fetch });
  assert.deepEqual(await db.list(), []);
  assert.equal(new URLSearchParams(fetch.calls[1].init.body).get("grant_type"), "refresh_token");
  assert.equal(fetch.calls[2].init.headers.Authorization, "Bearer A2");
  await assert.rejects(db.list(), DropboxAuthError);
  assert.equal(db.isConnected(), false);
});

test("an expired access token is refreshed before the call; other errors are DropboxError with a tag", async () => {
  const storage = fakeStorage();
  storage.setItem("morningfit.dropbox.v1", JSON.stringify({ refreshToken: "R", accessToken: "A", expiresAt: 5 }));
  const fetch = fakeFetch([jsonRes(200, { access_token: "A2", expires_in: 100 }), jsonRes(409, { error_summary: "to/conflict/file/..", error: {} })]);
  const db = createDropbox({ appKey: "KEY", redirectUri: "https://x/", storage, fetch, now: () => 1000 });
  await assert.rejects(db.move("a", "b"), e => e instanceof DropboxError && e.status === 409 && e.tag === "to/conflict/file");
  assert.equal(fetch.calls[0].url, "https://api.dropboxapi.com/oauth2/token");
});

test("disconnect revokes best-effort and forgets tokens", async () => {
  const storage = fakeStorage(); storage.setItem("morningfit.dropbox.v1", connected());
  const fetch = fakeFetch([() => { throw new Error("offline"); }]);
  const db = createDropbox({ appKey: "KEY", redirectUri: "https://x/", storage, fetch });
  await db.disconnect();
  assert.equal(db.isConnected(), false);
  assert.equal(storage.getItem("morningfit.dropbox.v1"), null);
});
```

- [ ] **Step 2: Run to verify it fails**: `node --test test/dropbox.test.js` → fails to import `../js/dropbox.js`.

- [ ] **Step 3: Implement** `js/dropbox.js`

```js
// Dropbox client for the app folder. Browser-only OAuth (PKCE + refresh token, no secret) and
// the four file calls the sync needs. Plain fetch; every dependency is injectable for tests.
const AUTH_URL = "https://www.dropbox.com/oauth2/authorize";
const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const API = "https://api.dropboxapi.com/2";
const CONTENT = "https://content.dropboxapi.com/2";

export class DropboxError extends Error {
  constructor(message, status, tag) { super(message); this.name = "DropboxError"; this.status = status; this.tag = tag; }
}
export class DropboxAuthError extends DropboxError {
  constructor(message) { super(message, 401, "auth"); this.name = "DropboxAuthError"; }
}

const b64url = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function createDropbox({ appKey, redirectUri, storage, key = "morningfit.dropbox.v1", fetch = globalThis.fetch, crypto = globalThis.crypto, now = () => Date.now() }) {
  const read = () => { try { return JSON.parse(storage.getItem(key)) || {}; } catch { return {}; } };
  const write = rec => storage.setItem(key, JSON.stringify(rec));
  const random = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

  async function tokenRequest(params) {
    const res = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: appKey, ...params }).toString() });
    if (!res.ok) throw new DropboxAuthError(`Token request failed (${res.status})`);
    const j = await res.json();
    const rec = { ...read(), accessToken: j.access_token, expiresAt: now() + (j.expires_in ?? 14400) * 1000 };
    if (j.refresh_token) rec.refreshToken = j.refresh_token;
    delete rec.verifier; delete rec.state;
    write(rec);
    return rec.accessToken;
  }

  async function refresh() {
    const { refreshToken } = read();
    if (!refreshToken) throw new DropboxAuthError("Not connected");
    try { return await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }); }
    catch (e) { storage.removeItem(key); throw e; }
  }

  async function accessToken() {
    const rec = read();
    if (rec.accessToken && rec.expiresAt > now() + 60_000) return rec.accessToken;
    return refresh();
  }

  async function throwFor(res) {
    let body = null;
    try { body = await res.json(); } catch { /* not json */ }
    const tag = typeof body?.error_summary === "string" ? body.error_summary.replace(/\/\.*$/, "").replace(/\/+$/, "") : null;
    throw new DropboxError(`Dropbox ${res.status}${tag ? ` ${tag}` : ""}`, res.status, tag);
  }

  // One authenticated call; on 401 refresh once and retry. isContent → content endpoint with Dropbox-API-Arg.
  async function call(url, { arg, body, contentType } = {}) {
    let token = await accessToken();
    for (let attempt = 0; ; attempt++) {
      const headers = { Authorization: `Bearer ${token}` };
      let payload;
      if (arg !== undefined) { headers["Dropbox-API-Arg"] = JSON.stringify(arg); headers["Content-Type"] = contentType ?? "application/octet-stream"; payload = body; }
      else { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body ?? null); }
      const res = await fetch(url, { method: "POST", headers, body: payload });
      if (res.status === 401 && attempt === 0) { token = await refresh(); continue; }
      if (!res.ok) await throwFor(res);
      return res;
    }
  }

  return {
    async authorizeUrl() {
      const verifier = random(), state = random();
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
      write({ ...read(), verifier, state });
      const q = new URLSearchParams({ client_id: appKey, response_type: "code", code_challenge: b64url(new Uint8Array(digest)), code_challenge_method: "S256", token_access_type: "offline", redirect_uri: redirectUri, state });
      return `${AUTH_URL}?${q}`;
    },
    async finishAuth(code, state) {
      const rec = read();
      if (!rec.verifier || rec.state !== state) throw new DropboxAuthError("Login state mismatch");
      await tokenRequest({ grant_type: "authorization_code", code, code_verifier: rec.verifier, redirect_uri: redirectUri });
    },
    isConnected() { return Boolean(read().refreshToken); },
    async disconnect() {
      try { await call(`${API}/auth/token/revoke`); } catch { /* best effort */ }
      storage.removeItem(key);
    },
    async list() {
      const out = [];
      let res = await call(`${API}/files/list_folder`, { body: { path: "" } });
      let j = await res.json();
      for (;;) {
        for (const e of j.entries) if (e[".tag"] === "file") out.push({ name: e.name, rev: e.rev });
        if (!j.has_more) return out;
        res = await call(`${API}/files/list_folder/continue`, { body: { cursor: j.cursor } });
        j = await res.json();
      }
    },
    async download(name) {
      try {
        const res = await call(`${CONTENT}/files/download`, { arg: { path: `/${name}` }, contentType: "text/plain" });
        const meta = JSON.parse(res.headers.get("Dropbox-API-Result") || "{}");
        return { text: await res.text(), rev: meta.rev };
      } catch (e) {
        if (e instanceof DropboxError && e.status === 409 && /not_found/.test(e.tag ?? "")) return null;
        throw e;
      }
    },
    async upload(name, text) {
      const res = await call(`${CONTENT}/files/upload`, { arg: { path: `/${name}`, mode: "overwrite", mute: true }, body: text });
      return { rev: (await res.json()).rev };
    },
    async move(from, to) {
      await call(`${API}/files/move_v2`, { body: { from_path: `/${from}`, to_path: `/${to}`, autorename: false } });
    },
  };
}
```

Note on `throwFor`: Dropbox `error_summary` looks like `path/not_found/..` or `to/conflict/file/..`; the regex strips the trailing `/..` and any trailing slashes so `tag` is `path/not_found` or `to/conflict/file`. The test for the expired token also sends `Content-Type: text/plain` on download because Safari rejects a JSON content type there.

- [ ] **Step 4: Run tests**: `node --test test/dropbox.test.js` → all pass. Then `npm test`.
- [ ] **Step 5: Commit**: `git add js/dropbox.js test/dropbox.test.js && git commit -m "feat: Dropbox client (PKCE OAuth, list/download/upload/move)"`

---

### Task 3: Sync pure functions

**Files:**
- Create: `js/sync.js` (pure part)
- Test: `test/sync.test.js`

**Interfaces:**
- Produces: `nextBakName(names: string[]): string`, `decide({ localSavedAt, syncedSavedAt, remoteRev, remote }): { action }` with actions `push | none | pull | archiveLocalThenPull | archiveRemoteThenPush`, `describeConfig(text): { savedAt, count, names } | null`, `configText(state): string`, `formatSyncTime(iso, now: Date): string`, `CFG = "fitapp.cfg"`, `isConfigName(name): boolean`.

- [ ] **Step 1: Write the failing tests** in `test/sync.test.js`

```js
import test from "node:test";
import assert from "node:assert/strict";
import { nextBakName, decide, describeConfig, configText, formatSyncTime, isConfigName, CFG } from "../js/sync.js";

test("nextBakName picks the lowest unused integer from 1", () => {
  assert.equal(nextBakName([]), "fitapp.cfg.bak.1");
  assert.equal(nextBakName(["fitapp.cfg", "fitapp.cfg.bak.1", "fitapp.cfg.bak.2"]), "fitapp.cfg.bak.3");
  assert.equal(nextBakName(["fitapp.cfg.bak.1", "fitapp.cfg.bak.3"]), "fitapp.cfg.bak.2");
  assert.equal(nextBakName(["fitapp.cfg.bak.02", "fitapp.cfg.bak.x", "other.bak.1"]), "fitapp.cfg.bak.1");
});

test("isConfigName accepts fitapp.cfg and numbered baks only", () => {
  assert.equal(isConfigName("fitapp.cfg"), true);
  assert.equal(isConfigName("fitapp.cfg.bak.12"), true);
  assert.equal(isConfigName("fitapp.cfg.bak."), false);
  assert.equal(isConfigName("fitapp.cfg.tmp"), false);
});

test("decide covers every row of the table", () => {
  const L = "2026-09-05T07:00:00Z", OLD = "2026-09-04T07:00:00Z", NEW = "2026-09-06T07:00:00Z";
  assert.equal(decide({ localSavedAt: L, syncedSavedAt: L, remoteRev: "r1", remote: null }).action, "push");
  assert.equal(decide({ localSavedAt: L, syncedSavedAt: L, remoteRev: "r1", remote: { savedAt: L, rev: "r1" } }).action, "none");
  assert.equal(decide({ localSavedAt: L, syncedSavedAt: L, remoteRev: "r1", remote: { savedAt: NEW, rev: "r2" } }).action, "pull");
  assert.equal(decide({ localSavedAt: L, syncedSavedAt: OLD, remoteRev: "r1", remote: { savedAt: NEW, rev: "r2" } }).action, "archiveLocalThenPull");
  assert.equal(decide({ localSavedAt: L, syncedSavedAt: OLD, remoteRev: "r1", remote: { savedAt: OLD, rev: "r1" } }).action, "push");
  assert.equal(decide({ localSavedAt: L, syncedSavedAt: OLD, remoteRev: "r1", remote: { savedAt: OLD, rev: "r7" } }).action, "archiveRemoteThenPush");
  // unreadable remote (savedAt null) with a foreign rev is archived, then overwritten
  assert.equal(decide({ localSavedAt: L, syncedSavedAt: L, remoteRev: "r1", remote: { savedAt: null, rev: "r7" } }).action, "archiveRemoteThenPush");
});

test("describeConfig summarises a file and rejects garbage", () => {
  const text = configText({ version: 1, savedAt: "2026-09-05T07:12:00Z", workouts: [{ id: "a", name: "Morning", steps: [] }, { id: "b", name: "Short", steps: [] }] });
  assert.ok(text.includes("\n  \"savedAt\""));   // pretty-printed
  assert.deepEqual(describeConfig(text), { savedAt: "2026-09-05T07:12:00Z", count: 2, names: ["Morning", "Short"] });
  assert.equal(describeConfig("nope"), null);
  assert.equal(describeConfig(JSON.stringify({ version: 2, workouts: [] })), null);
});

test("configText drops fields other than version, savedAt, workouts", () => {
  const t = configText({ version: 1, savedAt: "x", workouts: [], saveError: "no" });
  assert.deepEqual(Object.keys(JSON.parse(t)), ["version", "savedAt", "workouts"]);
});

test("formatSyncTime says today for the same local day, else a full date", () => {
  const now = new Date(2026, 8, 5, 9, 30);            // local time
  assert.equal(formatSyncTime(new Date(2026, 8, 5, 7, 5).toISOString(), now), "today 07:05");
  assert.equal(formatSyncTime(new Date(2026, 8, 4, 22, 15).toISOString(), now), "4 Sep 2026 22:15");
  assert.equal(formatSyncTime(null, now), "");
  assert.equal(CFG, "fitapp.cfg");
});
```

- [ ] **Step 2: Run to verify it fails**: `node --test test/sync.test.js` → cannot find module.

- [ ] **Step 3: Implement** the pure part of `js/sync.js`

```js
// Dropbox sync: pure rules first (tested without IO), then the engine that applies them.
import { parseState, validateBackup } from "./store.js";

export const CFG = "fitapp.cfg";
const BAK_RE = /^fitapp\.cfg\.bak\.(\d+)$/;

export const isConfigName = name => name === CFG || BAK_RE.test(name);

// Lowest unused integer from 1. Names with leading zeros are not ours and are ignored.
export function nextBakName(names) {
  const used = new Set();
  for (const n of names) { const m = BAK_RE.exec(n); if (m && String(Number(m[1])) === m[1]) used.add(Number(m[1])); }
  let i = 1;
  while (used.has(i)) i++;
  return `fitapp.cfg.bak.${i}`;
}

// The decision table of spec 5.2. Only savedAt (inside the file) decides direction; rev only
// tells whether someone else wrote the remote file since we last saw it.
export function decide({ localSavedAt, syncedSavedAt, remoteRev, remote }) {
  if (!remote) return { action: "push" };
  const r = remote.savedAt ?? "", l = localSavedAt ?? "";
  if (r === l) return { action: "none" };
  const dirty = localSavedAt !== syncedSavedAt;
  if (r > l) return { action: dirty ? "archiveLocalThenPull" : "pull" };
  return { action: remote.rev === remoteRev ? "push" : "archiveRemoteThenPush" };
}

export const configText = state => JSON.stringify({ version: 1, savedAt: state.savedAt, workouts: state.workouts }, null, 2);

export function describeConfig(text) {
  const st = parseState(text);
  if (!st) return null;
  return { savedAt: st.savedAt, count: st.workouts.length, names: st.workouts.map(w => w.name) };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const two = n => String(n).padStart(2, "0");
export function formatSyncTime(iso, now = new Date()) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hm = `${two(d.getHours())}:${two(d.getMinutes())}`;
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  return sameDay ? `today ${hm}` : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${hm}`;
}
```

- [ ] **Step 4: Run tests**: `node --test test/sync.test.js` → pass.
- [ ] **Step 5: Commit**: `git add js/sync.js test/sync.test.js && git commit -m "feat: sync rules (bak numbering, decision table, config summary)"`

---

### Task 4: Sync engine

**Files:**
- Modify: `js/sync.js` (append the engine)
- Test: `test/sync.test.js` (append)

**Interfaces:**
- Consumes: `createStore` API (`state`, `subscribe`, `replace(state, { touch })`), `createDropbox` API, `validateBackup(obj, getEx)`.
- Produces: `createSync({ store, dropbox, storage, key?, now?, online, go, toast, getExercise, timers? })` returning
  `{ status: "off"|"synced"|"saving"|"offline"|"error", syncedAt: string|null, subscribe(fn): unsubscribe, connect(): Promise<void>, finishConnect(code, state): Promise<void>, reconcile(): Promise<void>, pushSoon(), retry(): Promise<void>, listConfigs(): Promise<Row[]>, loadConfig(name): Promise<{ name, count }>, disconnect(): Promise<void> }`
  where `Row = { name, current: boolean, ok: boolean, savedAt, count, names }`.
- Storage record under `morningfit.sync.v1`: `{ syncedSavedAt, remoteRev }`.
- Timers: `timers = { setTimeout, clearTimeout }`. Debounce 1500 ms; retries at 5000 and 30000 ms; after the third failure status is `error`.

- [ ] **Step 1: Write the failing tests** (append to `test/sync.test.js`)

```js
import { createSync } from "../js/sync.js";
import { createStore } from "../js/store.js";
import { memoryAdapter } from "../js/kv.js";
import { getExercise } from "../js/exercises.js";

// In-memory Dropbox app folder. `fail` makes the next N calls throw.
function fakeDropbox(files = {}, { connected = true } = {}) {
  let rev = 100, fail = 0, auth = connected;
  const box = {
    files, calls: [], failNext: n => { fail = n; },
    isConnected: () => auth,
    async authorizeUrl() { return "https://dropbox/auth"; },
    async finishAuth() { auth = true; },
    async disconnect() { auth = false; },
    async list() { guard("list"); return Object.entries(files).map(([name, f]) => ({ name, rev: f.rev })); },
    async download(name) { guard("download " + name); return files[name] ? { ...files[name] } : null; },
    async upload(name, text) { guard("upload " + name); files[name] = { text, rev: "r" + (++rev) }; return { rev: files[name].rev }; },
    async move(from, to) { guard(`move ${from} ${to}`); if (files[to]) { const e = new Error("conflict"); e.status = 409; throw e; } files[to] = files[from]; delete files[from]; },
  };
  function guard(what) { box.calls.push(what); if (fail > 0) { fail--; throw new Error("network"); } }
  return box;
}
function fakeTimers() {
  const q = [];
  return {
    setTimeout: (fn, ms) => { const id = { fn, ms }; q.push(id); return id; },
    clearTimeout: id => { const i = q.indexOf(id); if (i >= 0) q.splice(i, 1); },
    async flush() { while (q.length) { const { fn } = q.shift(); await fn(); } },
    pending: () => q.map(t => t.ms),
  };
}
async function setup({ files, connected = true, online = true, stateSavedAt = "2026-09-05T07:00:00Z", syncRecord } = {}) {
  const local = memoryAdapter(), idb = memoryAdapter();
  const st = { version: 1, savedAt: stateSavedAt, workouts: [{ id: "w1", name: "Morning", steps: [{ exerciseId: "pushups", seconds: 60, restSeconds: 20 }] }] };
  await local.set(JSON.stringify(st));
  let clock = 1000;
  const now = () => new Date(2026, 8, 5, 8, 0, 0, clock++).toISOString();
  const store = createStore({ local, idb, now });
  await store.load();
  const storage = new Map(); const kv = { getItem: k => storage.get(k) ?? null, setItem: (k, v) => storage.set(k, v), removeItem: k => storage.delete(k) };
  if (syncRecord) kv.setItem("morningfit.sync.v1", JSON.stringify(syncRecord));
  const dropbox = fakeDropbox(files, { connected });
  const toasts = [], gone = [];
  const timers = fakeTimers();
  const sync = createSync({ store, dropbox, storage: kv, now, online: () => online, go: url => gone.push(url), toast: t => toasts.push(t), getExercise, timers });
  return { store, dropbox, sync, toasts, gone, timers, kv, setOnline: v => { online = v; } };
}
const cfg = (savedAt, names = ["Morning"]) => configText({ version: 1, savedAt, workouts: names.map((n, i) => ({ id: "w" + i, name: n, steps: [] })) });

test("status is off when not connected; connect navigates to the authorize URL", async () => {
  const { sync, gone } = await setup({ connected: false });
  assert.equal(sync.status, "off");
  await sync.connect();
  assert.deepEqual(gone, ["https://dropbox/auth"]);
});

test("finishConnect with no remote file pushes and toasts Connected", async () => {
  const { sync, dropbox, toasts, store } = await setup({ connected: false });
  await sync.finishConnect("code", "state");
  assert.equal(dropbox.files["fitapp.cfg"].text, configText(store.state));
  assert.deepEqual(toasts, ["Connected to Dropbox"]);
  assert.equal(sync.status, "synced");
  assert.equal(sync.syncedAt, store.state.savedAt);
});

test("finishConnect with an existing remote file archives it first (reinstall), no prompt", async () => {
  const files = { "fitapp.cfg": { text: cfg("2026-09-01T00:00:00Z", ["Old"]), rev: "r1" }, "fitapp.cfg.bak.1": { text: "x", rev: "r0" } };
  const { sync, dropbox, toasts, store } = await setup({ connected: false, files });
  await sync.finishConnect("code", "state");
  assert.equal(dropbox.files["fitapp.cfg.bak.2"].text, cfg("2026-09-01T00:00:00Z", ["Old"]));
  assert.equal(dropbox.files["fitapp.cfg"].text, configText(store.state));
  assert.deepEqual(toasts, ["Previous Dropbox config kept as fitapp.cfg.bak.2"]);
  assert.equal(store.state.workouts[0].name, "Morning");   // local untouched
});

test("a local save schedules a debounced push; edits within the window coalesce", async () => {
  const { sync, dropbox, store, timers } = await setup({ syncRecord: { syncedSavedAt: "2026-09-05T07:00:00Z", remoteRev: "r1" } });
  store.state.workouts[0].name = "A"; await store.save();
  store.state.workouts[0].name = "B"; await store.save();
  assert.equal(sync.status, "saving");
  assert.deepEqual(timers.pending(), [1500]);
  await timers.flush();
  assert.equal(dropbox.calls.filter(c => c.startsWith("upload")).length, 1);
  assert.equal(JSON.parse(dropbox.files["fitapp.cfg"].text).workouts[0].name, "B");
  assert.equal(sync.status, "synced");
  assert.equal(JSON.parse(sync._record().syncedSavedAt ? "1" : "0"), 1);
});

test("offline: no calls, status offline; going online reconciles and pushes", async () => {
  const { sync, dropbox, store, timers, setOnline } = await setup({ online: false, syncRecord: { syncedSavedAt: "2026-09-05T07:00:00Z", remoteRev: "r1" } });
  store.state.workouts[0].name = "A"; await store.save();
  await timers.flush();
  assert.equal(sync.status, "offline");
  assert.equal(dropbox.calls.length, 0);
  setOnline(true);
  await sync.reconcile();
  assert.equal(JSON.parse(dropbox.files["fitapp.cfg"].text).workouts[0].name, "A");
  assert.equal(sync.status, "synced");
});

test("reconcile: remote newer and local clean → pull without touching savedAt, toast Updated", async () => {
  const files = { "fitapp.cfg": { text: cfg("2026-09-06T00:00:00Z", ["Remote"]), rev: "r2" } };
  const { sync, store, toasts, timers } = await setup({ files, syncRecord: { syncedSavedAt: "2026-09-05T07:00:00Z", remoteRev: "r1" } });
  await sync.reconcile();
  await timers.flush();
  assert.equal(store.state.workouts[0].name, "Remote");
  assert.equal(store.state.savedAt, "2026-09-06T00:00:00Z");
  assert.deepEqual(toasts, ["Updated from Dropbox"]);
  assert.equal(sync.syncedAt, "2026-09-06T00:00:00Z");
  assert.equal(Object.keys(files).length, 1);   // no push, no archive
});

test("reconcile: remote newer and local dirty → local archived as bak, then pull", async () => {
  const files = { "fitapp.cfg": { text: cfg("2026-09-06T00:00:00Z", ["Remote"]), rev: "r2" } };
  const { sync, store } = await setup({ files, syncRecord: { syncedSavedAt: "2026-09-04T00:00:00Z", remoteRev: "r1" } });
  await sync.reconcile();
  assert.equal(JSON.parse(files["fitapp.cfg.bak.1"].text).workouts[0].name, "Morning");
  assert.equal(store.state.workouts[0].name, "Remote");
});

test("reconcile: local newer and remote rev unknown → remote archived, then push", async () => {
  const files = { "fitapp.cfg": { text: cfg("2026-09-01T00:00:00Z", ["Foreign"]), rev: "r9" } };
  const { sync, store } = await setup({ files, syncRecord: { syncedSavedAt: "2026-09-04T00:00:00Z", remoteRev: "r1" } });
  await sync.reconcile();
  assert.equal(JSON.parse(files["fitapp.cfg.bak.1"].text).workouts[0].name, "Foreign");
  assert.equal(files["fitapp.cfg"].text, configText(store.state));
});

test("reconcile: unreadable remote is kept as bak and reported", async () => {
  const files = { "fitapp.cfg": { text: "{broken", rev: "r9" } };
  const { sync, toasts } = await setup({ files, syncRecord: { syncedSavedAt: "2026-09-05T07:00:00Z", remoteRev: "r1" } });
  await sync.reconcile();
  assert.equal(files["fitapp.cfg.bak.1"].text, "{broken");
  assert.deepEqual(toasts, ["Dropbox file is unreadable, keeping phone workouts"]);
});

test("push failures retry at 5s and 30s, then error; retry() recovers", async () => {
  const { sync, dropbox, store, timers } = await setup({ syncRecord: { syncedSavedAt: "2026-09-05T07:00:00Z", remoteRev: "r1" } });
  dropbox.failNext(3);
  store.state.workouts[0].name = "A"; await store.save();
  await timers.flush();                       // 1500 → fail → schedules 5000
  assert.deepEqual(timers.pending(), [5000]);
  await timers.flush();                       // fail → 30000
  assert.deepEqual(timers.pending(), [30000]);
  await timers.flush();                       // fail → error
  assert.equal(sync.status, "error");
  assert.deepEqual(timers.pending(), []);
  await sync.retry();
  assert.equal(sync.status, "synced");
  assert.equal(JSON.parse(dropbox.files["fitapp.cfg"].text).workouts[0].name, "A");
});

test("an auth failure turns the status off and toasts", async () => {
  const { sync, dropbox, store, timers, toasts } = await setup({ syncRecord: { syncedSavedAt: "2026-09-05T07:00:00Z", remoteRev: "r1" } });
  const { DropboxAuthError } = await import("../js/dropbox.js");
  dropbox.upload = async () => { throw new DropboxAuthError("gone"); };
  store.state.workouts[0].name = "A"; await store.save();
  await timers.flush();
  assert.equal(sync.status, "off");
  assert.deepEqual(toasts, ["Dropbox disconnected, connect again"]);
});

test("listConfigs: current first, then by savedAt desc, unreadable flagged", async () => {
  const files = {
    "fitapp.cfg": { text: cfg("2026-09-05T07:12:00Z", ["Morning", "Evening", "Short"]), rev: "r1" },
    "fitapp.cfg.bak.1": { text: cfg("2026-09-04T18:40:00Z", ["A", "B"]), rev: "r2" },
    "fitapp.cfg.bak.2": { text: "junk", rev: "r3" },
    "fitapp.cfg.bak.3": { text: cfg("2026-09-05T06:58:00Z", ["Morning"]), rev: "r4" },
    "notes.txt": { text: "", rev: "r5" },
  };
  const { sync } = await setup({ files });
  const rows = await sync.listConfigs();
  assert.deepEqual(rows.map(r => r.name), ["fitapp.cfg", "fitapp.cfg.bak.3", "fitapp.cfg.bak.1", "fitapp.cfg.bak.2"]);
  assert.deepEqual(rows[0], { name: "fitapp.cfg", current: true, ok: true, savedAt: "2026-09-05T07:12:00Z", count: 3, names: ["Morning", "Evening", "Short"] });
  assert.deepEqual(rows[3], { name: "fitapp.cfg.bak.2", current: false, ok: false, savedAt: null, count: 0, names: [] });
});

test("loadConfig archives the phone state, applies the chosen file and pushes it as fitapp.cfg", async () => {
  const files = { "fitapp.cfg": { text: cfg("2026-09-05T07:12:00Z", ["Current"]), rev: "r1" }, "fitapp.cfg.bak.1": { text: cfg("2026-09-01T00:00:00Z", ["Old1", "Old2"]), rev: "r2" } };
  const { sync, store, timers } = await setup({ files });
  const r = await sync.loadConfig("fitapp.cfg.bak.1");
  await timers.flush();
  assert.deepEqual(r, { name: "fitapp.cfg.bak.1", count: 2 });
  assert.equal(JSON.parse(files["fitapp.cfg.bak.2"].text).workouts[0].name, "Morning");   // phone state archived
  assert.deepEqual(store.state.workouts.map(w => w.name), ["Old1", "Old2"]);
  assert.deepEqual(JSON.parse(files["fitapp.cfg"].text).workouts.map(w => w.name), ["Old1", "Old2"]);
  assert.equal(files["fitapp.cfg.bak.1"].text, cfg("2026-09-01T00:00:00Z", ["Old1", "Old2"]));   // untouched
  assert.equal(sync.status, "synced");
});

test("loadConfig rejects an unreadable file without archiving", async () => {
  const files = { "fitapp.cfg.bak.1": { text: "junk", rev: "r2" } };
  const { sync } = await setup({ files });
  await assert.rejects(sync.loadConfig("fitapp.cfg.bak.1"), /unreadable/i);
  assert.deepEqual(Object.keys(files), ["fitapp.cfg.bak.1"]);
});

test("disconnect forgets the sync record and turns the line off; subscribers are notified", async () => {
  const { sync, kv } = await setup({ syncRecord: { syncedSavedAt: "x", remoteRev: "r1" } });
  let n = 0; sync.subscribe(() => n++);
  await sync.disconnect();
  assert.equal(sync.status, "off");
  assert.equal(kv.getItem("morningfit.sync.v1"), null);
  assert.ok(n >= 1);
});
```

Note: the coalescing test uses `sync._record()`; expose it as a test-only accessor returning the persisted record.

- [ ] **Step 2: Run to verify it fails**: `node --test test/sync.test.js` → `createSync` is not exported.

- [ ] **Step 3: Implement** the engine (append to `js/sync.js`)

```js
import { DropboxAuthError } from "./dropbox.js";

const DEBOUNCE_MS = 1500;
const RETRY_MS = [5000, 30000];

export function createSync({ store, dropbox, storage, key = "morningfit.sync.v1", now = () => new Date().toISOString(), online = () => true, go, toast = () => {}, getExercise, timers = { setTimeout, clearTimeout } }) {
  const subs = new Set();
  const readRec = () => { try { return JSON.parse(storage.getItem(key)) || {}; } catch { return {}; } };
  const writeRec = rec => storage.setItem(key, JSON.stringify(rec));
  let inFlight = false, failures = 0, timer = null, pendingRetry = null, wantPush = false;

  const notify = () => subs.forEach(fn => fn(sync));
  const dirty = () => store.state.savedAt !== readRec().syncedSavedAt;

  function computeStatus() {
    if (!dropbox.isConnected()) return "off";
    if (!online()) return "offline";
    if (inFlight || timer || pendingRetry) return "saving";
    if (failures >= RETRY_MS.length + 1) return "error";
    return "synced";
  }

  function markSynced(savedAt, rev) { writeRec({ syncedSavedAt: savedAt, remoteRev: rev }); }

  function clearTimers() {
    if (timer) { timers.clearTimeout(timer); timer = null; }
    if (pendingRetry) { timers.clearTimeout(pendingRetry); pendingRetry = null; }
  }

  async function handleError(e) {
    if (e instanceof DropboxAuthError) {
      clearTimers(); failures = 0;
      toast("Dropbox disconnected, connect again");
      return;
    }
    failures++;
    const wait = RETRY_MS[failures - 1];
    if (wait != null) pendingRetry = timers.setTimeout(() => { pendingRetry = null; return push(); }, wait);
  }

  // Upload the phone state as fitapp.cfg. No-op when nothing changed since the last successful push.
  async function push() {
    if (!dropbox.isConnected() || !online()) { notify(); return; }
    if (inFlight) { wantPush = true; return; }
    if (!dirty()) { failures = 0; notify(); return; }
    inFlight = true; notify();
    try {
      const savedAt = store.state.savedAt;
      const { rev } = await dropbox.upload(CFG, configText(store.state));
      markSynced(savedAt, rev);
      failures = 0;
    } catch (e) { await handleError(e); }
    finally { inFlight = false; }
    if (wantPush || (dirty() && failures === 0)) { wantPush = false; return push(); }
    notify();
  }

  async function archiveText(text, names) {
    const bak = nextBakName(names);
    await dropbox.upload(bak, text);
    return bak;
  }

  async function archiveRemote() {
    const names = (await dropbox.list()).map(f => f.name);
    if (!names.includes(CFG)) return null;
    const bak = nextBakName(names);
    await dropbox.move(CFG, bak);
    return bak;
  }

  async function applyRemote(remote) {
    const st = parseState(remote.text);
    await store.replace(st, { touch: false });
    markSynced(st.savedAt, remote.rev);
  }

  const sync = {
    get status() { return computeStatus(); },
    get syncedAt() { return readRec().syncedSavedAt ?? null; },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    _record: readRec,

    async connect() { go(await dropbox.authorizeUrl()); },

    // After the OAuth redirect: archive any existing remote file, then push the phone state (spec 4.2).
    async finishConnect(code, state) {
      await dropbox.finishAuth(code, state);
      failures = 0; writeRec({});
      try {
        const bak = await archiveRemote();
        await push();
        toast(bak ? `Previous Dropbox config kept as ${bak}` : "Connected to Dropbox");
      } catch (e) { await handleError(e); }
      notify();
    },

    pushSoon() {
      if (!dropbox.isConnected()) return;
      if (timer) timers.clearTimeout(timer);
      timer = timers.setTimeout(() => { timer = null; return push(); }, DEBOUNCE_MS);
      notify();
    },

    async reconcile() {
      if (!dropbox.isConnected() || !online() || inFlight) { notify(); return; }
      try {
        const remote = await dropbox.download(CFG);
        const parsed = remote ? parseState(remote.text) : null;
        const rec = readRec();
        const d = decide({ localSavedAt: store.state.savedAt, syncedSavedAt: rec.syncedSavedAt, remoteRev: rec.remoteRev, remote: remote && { savedAt: parsed?.savedAt ?? null, rev: remote.rev } });
        if (remote && !parsed && d.action !== "none") toast("Dropbox file is unreadable, keeping phone workouts");
        switch (d.action) {
          case "none": markSynced(store.state.savedAt, remote.rev); failures = 0; break;
          case "push": await push(); break;
          case "pull": await applyRemote(remote); toast("Updated from Dropbox"); break;
          case "archiveLocalThenPull": {
            const names = (await dropbox.list()).map(f => f.name);
            await archiveText(configText(store.state), names);
            await applyRemote(remote); toast("Updated from Dropbox"); break;
          }
          case "archiveRemoteThenPush": await archiveRemote(); await push(); break;
        }
      } catch (e) { await handleError(e); }
      notify();
    },

    async retry() { clearTimers(); failures = 0; await sync.reconcile(); },

    async listConfigs() {
      const entries = (await dropbox.list()).filter(f => isConfigName(f.name));
      const rows = await Promise.all(entries.map(async f => {
        const file = await dropbox.download(f.name);
        const d = file && describeConfig(file.text);
        return { name: f.name, current: f.name === CFG, ok: Boolean(d), savedAt: d?.savedAt ?? null, count: d?.count ?? 0, names: d?.names ?? [] };
      }));
      rows.sort((a, b) => (b.current - a.current) || String(b.savedAt ?? "").localeCompare(String(a.savedAt ?? "")));
      return rows;
    },

    // Spec 4.3 step 3: archive the phone state, apply the chosen file, push it as fitapp.cfg.
    async loadConfig(name) {
      const chosen = await dropbox.download(name);
      const obj = (() => { try { return JSON.parse(chosen?.text ?? ""); } catch { return null; } })();
      const v = obj && validateBackup(obj, getExercise);
      if (!v?.ok) throw new Error(`${name} is unreadable`);
      const names = (await dropbox.list()).map(f => f.name);
      await archiveText(configText(store.state), names);
      clearTimers();
      await store.replace(v.state);           // touched: this load is a new save on the phone
      await push();
      notify();
      return { name, count: v.workouts };
    },

    async disconnect() {
      clearTimers(); failures = 0;
      await dropbox.disconnect();
      storage.removeItem(key);
      notify();
    },
  };

  store.subscribe(() => { if (dropbox.isConnected() && online()) sync.pushSoon(); else notify(); });
  return sync;
}
```

Notes for the implementer:
- `loadConfig` calls `store.replace(v.state)` which fires the store subscriber and schedules a debounced push; the immediate `push()` right after makes it a no-op because the state is no longer dirty. Tests flush timers to prove that.
- `reconcile` with `pull` uses `replace(st, { touch: false })` from Task 1 so the pulled `savedAt` is kept and no push follows.
- In `computeStatus`, `error` needs `failures` to have exceeded the retry list, which happens on the third consecutive failure.
- Move the `import { DropboxAuthError }` line to the top of the file with the other import.

- [ ] **Step 4: Run tests**: `npm test` → all pass.
- [ ] **Step 5: Commit**: `git add js/sync.js test/sync.test.js && git commit -m "feat: sync engine (debounced push, reconcile, archive rules, config list/load)"`

---

### Task 5: Plan view, CSS, app wiring, service worker

**Files:**
- Modify: `js/views/plan.js` (whole file), `css/app.css` (append), `js/app.js`, `sw.js`

**Interfaces:**
- Consumes: `sync` from Task 4, `formatSyncTime`, `confirmAsync`, `sheet`, `toast`, `el`, `replace`.
- Produces: views receive `{ store, sync, params, navigate }`. DOM: `.plan` root, `button.sync-line.<status>` with `.main`, optional `.sub`, `.chev`; sheet `.sheet` with `.cfg-row` buttons carrying `data-name`, `.cfg-row .tag`, `button.cfg-disconnect`, `button.btn.raised` Cancel.

- [ ] **Step 1: Rewrite `js/views/plan.js`**

```js
import { el, replace, toast, confirmAsync, sheet } from "../ui.js";
import { totals, formatDuration, summaryLine, makeWorkout } from "../workout.js";
import { EXERCISES } from "../exercises.js";
import { formatSyncTime } from "../sync.js";

const LINE_TEXT = { saving: "Saving to Dropbox…", offline: "Offline · will sync when online", error: "Sync failed · tap to retry" };

export function render({ store, sync, navigate }) {
  const root = el("div", { class: "plan" });
  const lineHost = el("div");
  draw();
  const unsub = sync.subscribe(() => replace(lineHost, syncLine()));
  return { el: root, tabs: "plan", destroy: unsub };

  function draw() {
    const st = store.state;
    const cards = st.workouts.length
      ? st.workouts.map(w => {
          const t = totals(w);
          return el("button", { class: "card", onClick: () => navigate(`/plan/workout/${w.id}`) },
            el("div", { class: "row" }, el("span", { class: "name" }, w.name), el("span", { class: "dur" }, formatDuration(t.total))),
            el("div", { class: "sub" }, summaryLine(t) + (t.missing ? ` · ${t.missing} missing` : "")));
        })
      : [el("div", { class: "empty" }, "No workouts yet. Tap + to create one.")];

    replace(lineHost, syncLine());
    replace(root,
      store.saveError ? el("div", { class: "notice warn" }, "Changes are not being saved: storage is unavailable or full.") : null,
      el("div", { class: "header" },
        el("h1", {}, "Plan"),
        el("button", { class: "plus", "aria-label": "New workout", onClick: async () => {
          const w = makeWorkout(`Workout ${st.workouts.length + 1}`);
          st.workouts.push(w);
          await store.save();
          navigate(`/plan/workout/${w.id}`);
        } }, "+")),
      el("div", { class: "section-label" }, "WORKOUTS"),
      ...cards,
      el("button", { class: "card", style: { marginTop: "12px" }, onClick: () => navigate("/plan/bank") },
        el("div", { class: "row" }, el("span", {}, "Exercise bank"), el("span", { class: "dur" }, `${EXERCISES.length}  ›`))),
      lineHost,
    );
  }

  function syncLine() {
    const s = sync.status;
    if (s === "off") {
      return el("button", { class: "sync-line off", onClick: () => sync.connect() },
        el("span", { class: "main" }, "Connect Dropbox"), el("span", { class: "sub" }, "Workouts are only on this phone"));
    }
    const text = s === "synced" ? (sync.syncedAt ? `Synced to Dropbox · ${formatSyncTime(sync.syncedAt)}` : "Connected to Dropbox") : LINE_TEXT[s];
    return el("button", { class: `sync-line ${s}`, onClick: onSyncTap }, el("span", { class: "main" }, text), el("span", { class: "chev" }, "›"));
  }

  async function onSyncTap() {
    const s = sync.status;
    if (s === "offline") { toast("Dropbox is not reachable"); return; }
    if (s === "error") { await sync.retry(); return; }
    if (!(await confirmAsync("Load a saved configuration?\nYour current workouts will be kept in Dropbox as a new .bak file first."))) return;
    openConfigs();
  }

  function openConfigs() {
    const list = el("div", { class: "cfg-list" }, el("div", { class: "sub" }, "Loading…"));
    const close = sheet(el("div", {},
      el("h2", {}, "Saved configurations"),
      el("div", { class: "type" }, "Dropbox / Apps / fitapp"),
      list,
      el("button", { class: "text-link block-btn cfg-disconnect sub", onClick: onDisconnect }, "Disconnect Dropbox"),
      el("button", { class: "btn raised", onClick: () => close() }, "Cancel")));

    sync.listConfigs().then(rows => {
      replace(list, rows.length ? rows.map(row) : el("div", { class: "sub" }, "No configurations in Dropbox yet."));
    }).catch(() => replace(list, el("div", { class: "sub" }, "Could not read Dropbox. Try again later.")));

    function row(r) {
      const when = r.ok ? formatSyncTime(r.savedAt) : "";
      const detail = r.ok ? `${r.count} workout${r.count === 1 ? "" : "s"}${r.names.length ? " · " + r.names.join(", ") : ""}` : "unreadable";
      return el("button", { class: "cfg-row", dataset: { name: r.name }, disabled: !r.ok, onClick: () => pick(r) },
        el("div", { class: "top" }, el("span", { class: "fname" }, r.name), r.current ? el("span", { class: "tag" }, "current") : null, el("span", { class: "when" }, when)),
        el("div", { class: "detail" }, detail));
    }

    async function pick(r) {
      try {
        const res = await sync.loadConfig(r.name);
        close();
        toast(`Loaded ${res.name} · ${res.count} workout${res.count === 1 ? "" : "s"}`);
        draw();
      } catch (e) { toast(`Could not load ${r.name}`, 4000); }
    }

    async function onDisconnect() {
      if (!(await confirmAsync("Disconnect Dropbox? Workouts stay on this phone and in Dropbox."))) return;
      await sync.disconnect();
      close();
      draw();
    }
  }
}
```

- [ ] **Step 2: Append CSS** to `css/app.css`

```css
/* Plan view: sync line pinned to the bottom, above the tab bar */
.plan { display:flex; flex-direction:column; min-height:calc(100dvh - var(--sat) - 12px - var(--tabs-h) - var(--sab) - 24px); }
.sync-line { margin-top:auto; padding-top:28px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:0 12px; min-height:44px; width:100%; font-size:15px; color:var(--muted); text-align:left; }
.sync-line.off, .sync-line.error { color:var(--accent); }
.sync-line .sub { flex-basis:100%; font-size:13px; margin-top:4px; }
.sync-line .chev { color:var(--muted); font-size:18px; }
.cfg-list { display:flex; flex-direction:column; gap:8px; margin-bottom:16px; }
.cfg-row { background:var(--raised); border-radius:14px; padding:12px 16px; width:100%; text-align:left; }
.cfg-row .top { display:flex; align-items:center; gap:10px; }
.cfg-row .fname { font-weight:700; font-size:16px; }
.cfg-row .tag { font-size:12px; font-weight:700; color:var(--stretch); background:var(--card); border-radius:6px; padding:3px 8px; }
.cfg-row .when { margin-left:auto; color:var(--muted); font-size:13px; font-variant-numeric:tabular-nums; }
.cfg-row .detail { color:var(--muted); font-size:13px; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.cfg-disconnect { color:var(--muted); font-size:14px; margin-bottom:8px; }
```

- [ ] **Step 3: Wire `js/app.js`**. Replace the imports and boot with:

```js
import { createStore } from "./store.js";
import { localAdapter, idbAdapter } from "./kv.js";
import { createDropbox } from "./dropbox.js";
import { createSync } from "./sync.js";
import { getExercise } from "./exercises.js";
import { startRouter, navigate } from "./router.js";
import { toast, closeSheets } from "./ui.js";
import * as plan from "./views/plan.js";
import * as workout from "./views/workout.js";
import * as bank from "./views/bank.js";
import * as train from "./views/train.js";
import * as session from "./views/session.js";
import * as done from "./views/done.js";

const KEY = "morningfit.v1";
const DROPBOX_APP_KEY = "4rmxsnol2k5kibm";   // public identifier of the "fitapp" Dropbox app (app-folder access)
const views = { plan, workout, bank, train, session, done };
const store = createStore({ local: localAdapter(localStorage, KEY), idb: idbAdapter() });
const dropbox = createDropbox({ appKey: DROPBOX_APP_KEY, redirectUri: location.origin + location.pathname, storage: localStorage });
const sync = createSync({ store, dropbox, storage: localStorage, online: () => navigator.onLine, go: url => { location.href = url; }, toast, getExercise });
let current = null;

async function boot() {
  const r = await store.load();
  if (r.seeded) toast("No saved workouts found, loaded defaults", 4000);
  else if (r.recovered) toast("Recovered workouts from the backup copy", 4000);
  navigator.storage?.persist?.().catch(() => {});

  // Returning from the Dropbox login: ?code=...&state=... (or ?error=...) on the app URL.
  const q = new URL(location.href).searchParams;
  if (q.has("code") || q.has("error")) {
    const code = q.get("code"), state = q.get("state"), err = q.get("error");
    history.replaceState(null, "", location.pathname + "#/plan");
    if (code) sync.finishConnect(code, state).catch(() => toast("Dropbox connection failed", 4000));
    else toast(err === "access_denied" ? "Dropbox connection cancelled" : "Dropbox connection failed", 4000);
  } else {
    sync.reconcile();
  }
  addEventListener("online", () => sync.reconcile());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sync.reconcile(); });

  startRouter(route => {
    closeSheets();
    current?.destroy?.();
    const out = views[route.name].render({ store, sync, params: route.params, navigate });
    current = out;
    const main = document.getElementById("view");
    main.replaceChildren(out.el);
    main.classList.toggle("no-tabs", !out.tabs);
    const tabs = document.getElementById("tabs");
    tabs.hidden = !out.tabs;
    tabs.querySelectorAll("a").forEach(a => a.classList.toggle("active", a.dataset.tab === out.tabs));
    window.scrollTo(0, 0);
  });
  // ... service worker registration unchanged
}
```

- [ ] **Step 4: Service worker**: in `sw.js` set `VERSION = "v1.2.0"` and add `"./js/dropbox.js", "./js/sync.js"` after `"./js/kv.js"` in `ASSETS`.

- [ ] **Step 5: Run the app in headless Chromium** and check the Plan view renders with the line at the bottom in the off state, and that tapping it navigates to the Dropbox authorize URL:

```bash
python3 -m http.server 8080 >/dev/null 2>&1 &
node -e '
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const errs = []; p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
  await p.goto("http://127.0.0.1:8080/#/plan"); await p.waitForSelector(".sync-line.off");
  console.log("line:", await p.locator(".sync-line").innerText());
  const box = await p.locator(".sync-line").boundingBox(); console.log("line bottom y:", box.y + box.height, "(tabs start at 788)");
  await p.screenshot({ path: "docs/screenshots/P1_plan.png" });
  await Promise.all([p.waitForURL(/dropbox\.com\/oauth2\/authorize/), p.click(".sync-line")]);
  console.log("navigated to:", p.url().split("?")[0]); console.log("errors:", errs); await b.close();
})();'
```

Expected: `line: Connect Dropbox\nWorkouts are only on this phone`, bottom y just above 788, navigation to the Dropbox authorize URL, no errors. (Playwright is optional; if it is not installed, `npm i --no-save playwright@1.47` first. Skip if unavailable and say so.)

- [ ] **Step 6: Commit**: `git add js/views/plan.js css/app.css js/app.js sw.js docs/screenshots/P1_plan.png && git commit -m "feat: Dropbox sync line and saved-configurations sheet on the Plan view"`

---

### Task 6: README, e2e smoke, final verification

**Files:**
- Modify: `README.md` (sections "Install on the iPhone" note, "Keeping your workouts safe", "Layout"), `tools/e2e/smoke.cjs` (only if it references Backup / Restore)

- [ ] **Step 1: README**. Replace the "Keeping your workouts safe" section with:

```markdown
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
"Allow public clients (PKCE)" is on. No secret is stored anywhere.
```

Also: in "Install on the iPhone", replace "Use Backup and Restore on the Plan screen to move it." with "Connect Dropbox in the installed app and load the configuration from there."; in "Layout", change the `js/store.js, kv.js` line to `js/store.js, kv.js          persistence and backup validation` and add `js/dropbox.js, sync.js      Dropbox client and the sync engine`; mention `tools/render_sync_mocks.py` under `tools/`.

- [ ] **Step 2: e2e smoke**: `grep -n "Backup\|Restore\|backed up" tools/e2e/smoke.cjs`. If any step asserts on those texts, change it to assert `.sync-line.off` contains "Connect Dropbox". Run the smoke test if Playwright is available: `node tools/e2e/smoke.cjs` with the static server up. Expected: all steps `ok`, screenshots refreshed.

- [ ] **Step 3: Full verification**: `npm test` (all green), `git status` clean except intended files, `grep -n "markBackup\|lastBackupAt" js/ test/` returns nothing.

- [ ] **Step 4: Commit**: `git add README.md tools/e2e/smoke.cjs docs/screenshots && git commit -m "docs: Dropbox sync in README; e2e smoke updated"`

- [ ] **Step 5: Mark the spec** `Status: approved and implemented` in `docs/superpowers/specs/2026-09-05-dropbox-sync-design.md`, commit, and push `main` to deploy (push only when the user has asked for deploy; the user asked to "go for it", which covers building on `main`, so push and report the deploy URL).
