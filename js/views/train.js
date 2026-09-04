import { el } from "../ui.js";
import { totals, formatDuration } from "../workout.js";
import { unlock } from "../audio.js";

export function render({ store, navigate }) {
  const st = store.state;
  const cards = st.workouts.filter(w => totals(w).count > 0).map(w => {
    const t = totals(w);
    return el("div", { class: "card" },
      el("div", { class: "row" }, el("span", { class: "name" }, w.name), el("span", { class: "dur" }, formatDuration(t.total))),
      el("div", { class: "sub", style: { marginBottom: "12px" } }, `${t.count} exercise${t.count === 1 ? "" : "s"}`),
      el("button", { class: "btn primary", onClick: () => { unlock(); navigate(`/train/session/${w.id}`); } }, "▶  Start"));
  });
  const root = el("div", {},
    el("div", { class: "header" }, el("h1", {}, "Train")),
    ...(cards.length ? cards : [el("div", { class: "empty" }, "No workouts with exercises yet. Build one in Plan.")]));
  return { el: root, tabs: "train" };
}
