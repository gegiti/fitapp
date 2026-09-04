import { el } from "../ui.js";
import { totals, formatDuration } from "../workout.js";

export function render({ store, params, navigate }) {
  const w = store.state.workouts.find(x => x.id === params.id);
  const root = el("div", { class: "done" },
    el("div", { class: "check" }, "✓"),
    el("h1", {}, "Nice work."),
    el("div", { class: "sub" }, w ? `${w.name} · ${formatDuration(totals(w).total)}` : ""),
    el("button", { class: "btn primary", onClick: () => navigate("/train") }, "Done"));
  return { el: root, tabs: null };
}
