import test from "node:test";
import assert from "node:assert/strict";
import { EXERCISES, getExercise, figureUrl } from "../js/exercises.js";

test("bank has exactly the four v1 exercises with spec defaults", () => {
  assert.deepEqual(EXERCISES.map(e => [e.id, e.type, e.sided, e.defaultSeconds, e.defaultRestSeconds]), [
    ["pushups", "strength", false, 60, 20],
    ["jackknife", "strength", false, 60, 20],
    ["cat_cow", "stretch", false, 60, 10],
    ["cobra", "stretch", false, 60, 10],
  ]);
});

test("getExercise returns null for unknown ids", () => {
  assert.equal(getExercise("nope"), null);
  assert.equal(getExercise("cobra").name, "Cobra");
});

test("figureUrl is relative", () => {
  assert.equal(figureUrl("cobra", "flexed"), "assets/figures/cobra_flexed.svg");
});
