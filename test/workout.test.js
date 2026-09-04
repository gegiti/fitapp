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
  assert.equal(t.rest, 50);
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
