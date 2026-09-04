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
  assert.equal(s.remaining(60_250), 19.75);
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
  s.skip(1_000);
  assert.equal(s.phase.kind, "rest");
  s.skip(2_000);
  assert.equal(s.phase.exerciseId, "jackknife");
  s.tick(12_000);
  s.back(12_000);
  assert.equal(s.phase.exerciseId, "jackknife");
  assert.equal(s.remainingWhole(12_000), 60);
  s.back(13_000);
  assert.equal(s.phase.exerciseId, "pushups");
  assert.equal(s.index, 0);
});

test("skip on the last phase finishes the session", () => {
  const s = new Session(buildPhases({ steps: [{ exerciseId: "cobra", seconds: 30, restSeconds: 10 }] }), 0);
  s.skip(1_000);
  assert.equal(s.finished, true);
});

test("sided phase: side switches at midpoint, skip jumps to second side first", () => {
  const phases = [{ kind: "exercise", stepIndex: 0, exerciseId: "x", seconds: 90, sided: true, exerciseNo: 1 }];
  const s = new Session(phases, 0);
  assert.equal(s.side(0), "left");
  assert.equal(s.remainingWhole(0), 45);
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
  for (let i = 0; i < 6; i++) s.skip(30_000);
  assert.equal(s.phase.exerciseId, "cobra");
  assert.equal(s.exerciseNo, 4);
  assert.equal(s.nextExercisePhase(), null);
  assert.equal(s.restBeforeNext(), 0);
});

test("actions while paused keep the session paused", () => {
  const s = new Session(buildPhases(W), 0);
  s.pause(5_000);
  s.skip(6_000);
  assert.equal(s.paused, true);
  assert.equal(s.phase.kind, "rest");
  assert.equal(s.remainingWhole(9_000), 20);
  s.resume(9_000);
  assert.equal(s.remainingWhole(10_000), 19);
});

test("end() finishes immediately; ticking after finish is a no-op", () => {
  const s = new Session(buildPhases(W), 0);
  s.end();
  assert.equal(s.finished, true);
  assert.deepEqual(s.tick(1000), []);
});
