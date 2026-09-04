import { el, replace, toast, confirmAsync } from "../ui.js";
import { totals, formatDuration, summaryLine, makeWorkout } from "../workout.js";
import { EXERCISES, getExercise } from "../exercises.js";
import { validateBackup } from "../store.js";

export function render({ store, navigate }) {
  const root = el("div");
  draw();
  return { el: root, tabs: "plan" };

  function draw() {
    const st = store.state;
    const cards = st.workouts.length
      ? st.workouts.map(w => {
          const t = totals(w);
          return el("button", { class: "card", onClick: () => navigate(`/plan/workout/${w.id}`) },
            el("div", { class: "row" }, el("span", { class: "name" }, w.name), el("span", { class: "dur" }, formatDuration(t.total))),
            el("div", { class: "sub" }, summaryLine(t) + (t.missing ? ` · ${t.missing} missing` : "")));
        })
      : [el("div", { class: "empty" }, "No workouts yet. Tap + to create one.")];

    const fileInput = el("input", { type: "file", accept: "application/json,.json", hidden: true, onChange: restore });
    replace(root,
      store.saveError ? el("div", { class: "notice warn" }, "Changes are not being saved: storage is unavailable or full.") : null,
      el("div", { class: "header" },
        el("h1", {}, "Plan"),
        el("button", { class: "plus", "aria-label": "New workout", onClick: async () => {
          const w = makeWorkout(`Workout ${st.workouts.length + 1}`);
          st.workouts.push(w);
          await store.save();
          navigate(`/plan/workout/${w.id}`);
        } }, "+")),
      el("div", { class: "section-label" }, "WORKOUTS"),
      ...cards,
      el("button", { class: "card", style: { marginTop: "12px" }, onClick: () => navigate("/plan/bank") },
        el("div", { class: "row" }, el("span", {}, "Exercise bank"), el("span", { class: "dur" }, `${EXERCISES.length}  ›`))),
      el("div", { class: "links" },
        el("button", { class: "text-link block-btn", onClick: backup }, "Backup"),
        el("span", { class: "sep" }, "·"),
        el("button", { class: "text-link block-btn", onClick: () => fileInput.click() }, "Restore"),
        el("span", { class: "sub" }, st.lastBackupAt ? `last backup ${st.lastBackupAt.slice(0, 10)}` : "never backed up")),
      fileInput,
    );
  }

  async function backup() {
    const st = store.state;
    const data = JSON.stringify({ version: 1, savedAt: st.savedAt, workouts: st.workouts }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: `morning-fit-backup-${new Date().toISOString().slice(0, 10)}.json` });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
    await store.markBackup();
    draw();
  }

  async function restore(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    let obj;
    try { obj = JSON.parse(await file.text()); } catch { toast("That file is not valid JSON"); return; }
    const r = validateBackup(obj, getExercise);
    if (!r.ok) { toast(r.error, 4000); return; }
    const dropped = r.dropped ? ` ${r.dropped} step(s) with unknown exercises will be dropped.` : "";
    if (!(await confirmAsync(`Replace all workouts with ${r.workouts} from the backup?${dropped}`))) return;
    await store.replace(r.state);
    toast("Workouts restored");
    draw();
  }
}
