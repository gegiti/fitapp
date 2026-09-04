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

test("parseState keeps steps whose exercise is unknown (shown as missing in the editor)", () => {
  const st = parseState(JSON.stringify({ version: 1, workouts: [{ id: "w", name: "A", steps: [{ exerciseId: "gone", seconds: 10, restSeconds: 0 }] }] }));
  assert.equal(st.workouts[0].steps[0].exerciseId, "gone");
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

test("load recovers from a corrupt local copy using the idb copy", async () => {
  const local = memoryAdapter(), idb = memoryAdapter();
  await local.set("{corrupt");
  await idb.set(JSON.stringify(good));
  const store = createStore({ local, idb });
  const r = await store.load();
  assert.equal(r.seeded, false);
  assert.equal(r.recovered, true);
  assert.equal(store.state.workouts[0].name, "A");
  assert.equal(JSON.parse(await local.get()).workouts[0].name, "A"); // re-saved
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

test("a failing local write is recorded but idb still gets the data", async () => {
  const idb = memoryAdapter();
  const local = { async get() { return null; }, async set() { throw new Error("quota"); } };
  const store = createStore({ local, idb });
  await store.load();
  assert.ok(store.saveError);
  assert.ok(await idb.get());
});
