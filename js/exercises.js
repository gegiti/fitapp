// The exercise bank. Adding an exercise = one entry here + two SVG figures in assets/figures
// (generate them with tools/figures.py + tools/render_figures.py), add the id to FIGURE_IDS in sw.js,
// then bump VERSION in sw.js.
export const EXERCISES = [
  { id: "pushups",             name: "Push-ups",              type: "strength", sided: false, defaultSeconds: 60, defaultRestSeconds: 20, cue: "Elbows tucked, chest to floor" },
  { id: "jackknife",           name: "Jackknife sit-ups",     type: "strength", sided: false, defaultSeconds: 60, defaultRestSeconds: 20, cue: "Reach hands to feet, fold at the hips" },
  { id: "situps",              name: "Sit-ups",               type: "strength", sided: false, defaultSeconds: 60, defaultRestSeconds: 20, cue: "Curl up, keep the neck relaxed" },
  { id: "prisoner_squeeze",    name: "Prisoner squeeze",      type: "strength", sided: false, defaultSeconds: 60, defaultRestSeconds: 20, cue: "Elbows back, squeeze the shoulder blades" },
  { id: "bird_dog",            name: "Bird dog",              type: "strength", sided: true,  defaultSeconds: 90, defaultRestSeconds: 20, cue: "Opposite arm and leg, hips level" },
  { id: "superman",            name: "Superman",              type: "strength", sided: false, defaultSeconds: 60, defaultRestSeconds: 20, cue: "Lift arms and legs, lower slowly" },
  { id: "cat_cow",             name: "Cat / cow",             type: "stretch",  sided: false, defaultSeconds: 60, defaultRestSeconds: 10, cue: "Move with the breath" },
  { id: "cobra",               name: "Cobra",                 type: "stretch",  sided: false, defaultSeconds: 60, defaultRestSeconds: 10, cue: "Hips down, shoulders away from ears" },
  { id: "cow_child",           name: "Cow child",             type: "stretch",  sided: false, defaultSeconds: 60, defaultRestSeconds: 10, cue: "Sink hips to heels, then lift the chest" },
  { id: "squat_to_fold",       name: "Squat to fold",         type: "stretch",  sided: false, defaultSeconds: 60, defaultRestSeconds: 10, cue: "Reach up in the squat, then hips up, hands down" },
  { id: "dog_lunge_rotation",  name: "Dog to lunge rotation", type: "stretch",  sided: true,  defaultSeconds: 90, defaultRestSeconds: 10, cue: "Step the foot beside the hand, open to the sky" },
  { id: "seated_side_stretch", name: "Seated side stretch",   type: "stretch",  sided: true,  defaultSeconds: 90, defaultRestSeconds: 10, cue: "Reach over the head toward the foot" },
];

const byId = new Map(EXERCISES.map(e => [e.id, e]));

export function getExercise(id) {
  return byId.get(id) ?? null;
}

export function figureUrl(id, which) {
  return `assets/figures/${id}_${which}.svg`;
}
