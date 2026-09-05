import test from "node:test";
import assert from "node:assert/strict";
import { EXERCISES, getExercise, figureUrl } from "../js/exercises.js";

test("bank has the twelve exercises with their defaults", () => {
  assert.deepEqual(EXERCISES.map(e => [e.id, e.type, e.sided, e.defaultSeconds, e.defaultRestSeconds]), [
    ["pushups", "strength", false, 60, 20],
    ["jackknife", "strength", false, 60, 20],
    ["situps", "strength", false, 60, 20],
    ["prisoner_squeeze", "strength", false, 60, 20],
    ["bird_dog", "strength", true, 90, 20],
    ["superman", "strength", false, 60, 20],
    ["cat_cow", "stretch", false, 60, 10],
    ["cobra", "stretch", false, 60, 10],
    ["cow_child", "stretch", false, 60, 10],
    ["squat_to_fold", "stretch", false, 60, 10],
    ["dog_lunge_rotation", "stretch", true, 90, 10],
    ["seated_side_stretch", "stretch", true, 90, 10],
  ]);
  assert.ok(EXERCISES.every(e => e.name && e.cue && ["strength", "stretch"].includes(e.type)));
  assert.ok(EXERCISES.filter(e => e.sided).every(e => e.defaultSeconds % 2 === 0), "sided defaults split evenly per side");
});

test("every exercise ships both figure files and is precached by the service worker", async () => {
  const fs = await import("node:fs");
  for (const e of EXERCISES) for (const which of ["relaxed", "flexed"]) assert.ok(fs.existsSync(figureUrl(e.id, which)), `${e.id} ${which}`);
  const sw = fs.readFileSync("sw.js", "utf8");
  for (const e of EXERCISES) assert.ok(sw.includes(`"${e.id}"`), `${e.id} missing from sw.js FIGURE_IDS`);
});

test("seed workout only references known exercises", async () => {
  const { seedState } = await import("../js/seed.js");
  const st = seedState();
  assert.deepEqual(st.workouts[0].steps.map(s => s.exerciseId), ["pushups", "jackknife", "cat_cow", "cobra"]);
  assert.ok(st.workouts[0].steps.every(s => getExercise(s.exerciseId)));
});

test("getExercise returns null for unknown ids", () => {
  assert.equal(getExercise("nope"), null);
  assert.equal(getExercise("cobra").name, "Cobra");
});

test("figureUrl is relative", () => {
  assert.equal(figureUrl("cobra", "flexed"), "assets/figures/cobra_flexed.svg");
});
