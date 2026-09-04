// Pure helpers for workouts and steps. No DOM, no storage.
import { getExercise } from "./exercises.js";

export function newId(prefix = "w") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function makeStep(exerciseId) {
  const ex = getExercise(exerciseId);
  if (!ex) throw new Error(`Unknown exercise: ${exerciseId}`);
  return { exerciseId, seconds: ex.defaultSeconds, restSeconds: ex.defaultRestSeconds };
}

export function makeWorkout(name, exerciseIds = []) {
  return { id: newId(), name, steps: exerciseIds.map(makeStep) };
}

// Seconds. `rest` excludes the last known step's rest because it is never run.
export function totals(workout, getEx = getExercise) {
  const known = workout.steps.filter(s => getEx(s.exerciseId));
  const t = { work: 0, rest: 0, total: 0, count: known.length, strength: 0, stretch: 0,
              missing: workout.steps.length - known.length };
  known.forEach((s, i) => {
    t.work += s.seconds;
    if (i < known.length - 1) t.rest += s.restSeconds;
    t[getEx(s.exerciseId).type] += 1;
  });
  t.total = t.work + t.rest;
  return t;
}

export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function summaryLine(t) {
  return `${t.strength} strength · ${t.stretch} stretch`;
}

export function moveStep(steps, from, to) {
  const out = steps.slice();
  const [item] = out.splice(from, 1);
  out.splice(to, 0, item);
  return out;
}

export function stepIncrement(exercise) { return exercise.sided ? 10 : 5; }
export function clampSeconds(value, exercise) { return Math.max(stepIncrement(exercise), value); }
export function clampRest(value) { return Math.max(0, value); }
