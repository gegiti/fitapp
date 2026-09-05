// Default state created on first launch or after storage is wiped.
// Keep this in sync with the real routine: it is the fallback if the phone loses the data.
import { getExercise } from "./exercises.js";

const MORNING = ["pushups", "jackknife", "cat_cow", "cobra"];

export function seedState() {
  return {
    version: 1,
    savedAt: null,
    workouts: [{
      id: "w_morning",
      name: "Morning",
      steps: MORNING.map(id => { const e = getExercise(id); return { exerciseId: id, seconds: e.defaultSeconds, restSeconds: e.defaultRestSeconds }; }),
    }],
  };
}
