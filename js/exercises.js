// The exercise bank. Adding an exercise = one entry here + two SVG figures in assets/figures
// (generate them with tools/figures.py + tools/render_figures.py), then bump VERSION in sw.js.
export const EXERCISES = [
  { id: "pushups",   name: "Push-ups",          type: "strength", sided: false, defaultSeconds: 60, defaultRestSeconds: 20, cue: "Elbows tucked, chest to floor" },
  { id: "jackknife", name: "Jackknife sit-ups", type: "strength", sided: false, defaultSeconds: 60, defaultRestSeconds: 20, cue: "Reach hands to feet, fold at the hips" },
  { id: "cat_cow",   name: "Cat / cow",         type: "stretch",  sided: false, defaultSeconds: 60, defaultRestSeconds: 10, cue: "Move with the breath" },
  { id: "cobra",     name: "Cobra",             type: "stretch",  sided: false, defaultSeconds: 60, defaultRestSeconds: 10, cue: "Hips down, shoulders away from ears" },
];

const byId = new Map(EXERCISES.map(e => [e.id, e]));

export function getExercise(id) {
  return byId.get(id) ?? null;
}

export function figureUrl(id, which) {
  return `assets/figures/${id}_${which}.svg`;
}
