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

// ---------------------------------------------------------------- engine
import { createSync } from "../js/sync.js";
import { createStore } from "../js/store.js";
import { memoryAdapter } from "../js/kv.js";
import { getExercise } from "../js/exercises.js";
import { DropboxAuthError } from "../js/dropbox.js";

// In-memory Dropbox app folder. `failNext(n)` makes the next n calls throw.
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
    async flush() { for (const { fn } of q.splice(0)) await fn(); },   // only what was pending when called
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
  assert.equal(sync.syncedAt, store.state.savedAt);
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
  assert.equal(sync.status, "synced");
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
  dropbox.upload = async () => { dropbox.isConnected = () => false; throw new DropboxAuthError("gone"); };   // the real client forgets its tokens
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
  assert.equal(sync.status, "synced");
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

test("a missing-scope auth failure explains what to do", async () => {
  const { sync, dropbox, store, timers, toasts } = await setup({ syncRecord: { syncedSavedAt: "2026-09-05T07:00:00Z", remoteRev: "r1" } });
  dropbox.upload = async () => { dropbox.isConnected = () => false; throw new DropboxAuthError("missing scope", "missing_scope"); };
  store.state.workouts[0].name = "A"; await store.save();
  await timers.flush();
  assert.equal(sync.status, "off");
  assert.deepEqual(toasts, ["Dropbox app is missing permissions. Enable them in the Dropbox console, then connect again."]);
});
