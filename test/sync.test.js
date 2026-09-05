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
