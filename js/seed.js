// Default state created on first launch or after storage is wiped.
// Keep this in sync with the real routine: it is the fallback if the phone loses the data.
import { EXERCISES } from "./exercises.js";

export function seedState() {
  return {
    version: 1,
    savedAt: null,
    lastBackupAt: null,
    workouts: [{
      id: "w_morning",
      name: "Morning",
      steps: EXERCISES.map(e => ({ exerciseId: e.id, seconds: e.defaultSeconds, restSeconds: e.defaultRestSeconds })),
    }],
  };
}
