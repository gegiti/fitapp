import { el, replace, sheet, toast, cap } from "../ui.js";
import { EXERCISES, figureUrl } from "../exercises.js";
import { makeStep } from "../workout.js";

export function render({ store, params, navigate }) {
  const st = store.state;
  const pickFor = params.pick ? st.workouts.find(w => w.id === params.pick) : null;
  if (params.pick && !pickFor) { navigate("/plan"); return { el: el("div"), tabs: "plan" }; }
  let filter = "all";
  const root = el("div");
  draw();
  return { el: root, tabs: "plan" };

  function draw() {
    const groups = [["strength", "STRENGTH"], ["stretch", "STRETCH"]].filter(([t]) => filter === "all" || filter === t);
    replace(root,
      el("div", { class: "header" },
        el("a", { class: "link", href: pickFor ? `#/plan/workout/${pickFor.id}` : "#/plan" }, pickFor ? "‹ Cancel" : "‹ Back"),
        el("span", { class: "title" }, pickFor ? `Add to ${pickFor.name}` : "Exercises"),
        el("span", { class: "link right" })),
      el("div", { class: "chips" }, ...[["all", "All"], ["strength", "Strength"], ["stretch", "Stretch"]].map(([k, label]) =>
        el("button", { class: `chip${filter === k ? " active" : ""}`, onClick: () => { filter = k; draw(); } }, label))),
      ...groups.flatMap(([type, label]) => [
        el("div", { class: "section-label" }, label),
        ...EXERCISES.filter(e => e.type === type).map(row),
      ]),
    );
  }

  function row(e) {
    return el("button", { class: "row-item", onClick: () => pickFor ? add(e, pickFor) : detail(e) },
      el("span", { class: "thumb" }, el("img", { src: figureUrl(e.id, "flexed"), alt: "" })),
      el("span", { class: "label" }, e.name),
      e.sided ? el("span", { class: "badge" }, "L/R") : null,
      el("span", { class: "time" }, `${e.defaultSeconds}s`),
      el("span", { class: "rest" }, `+${e.defaultRestSeconds}s`),
      el("span", { class: `chev${pickFor ? " text-link" : ""}` }, pickFor ? "+" : "›"));
  }

  async function add(e, target) {
    target.steps.push(makeStep(e.id));
    await store.save();
    navigate(`/plan/workout/${target.id}`);
  }

  function detail(e) {
    const restText = e.defaultRestSeconds ? `then ${e.defaultRestSeconds}s rest` : "no rest after";
    const body = el("div", {},
      el("h2", {}, e.name),
      el("div", { class: `type ${e.type}` }, `${cap(e.type)}${e.sided ? " · sided" : ""} · ${e.defaultSeconds}s · ${restText}`),
      el("div", { class: "figs" },
        el("div", { class: "fig" }, el("img", { src: figureUrl(e.id, "relaxed"), alt: "Relaxed" }), el("div", { class: "cap" }, "Relaxed")),
        el("div", { class: "fig" }, el("img", { src: figureUrl(e.id, "flexed"), alt: "Flexed" }), el("div", { class: "cap" }, "Flexed"))),
      el("div", { style: { marginBottom: "16px" } }, `${e.cue}.`),
      el("button", { class: "btn raised", onClick: () => chooseWorkout(e) }, "Add to workout…"));
    sheet(body);
  }

  function chooseWorkout(e) {
    if (!st.workouts.length) { toast("Create a workout first"); return; }
    const body = el("div", {},
      el("h2", {}, `Add ${e.name} to`),
      el("div", { style: { height: "12px" } }),
      ...st.workouts.map(w => el("button", { class: "card", onClick: () => add(e, w) }, el("div", { class: "name" }, w.name))));
    sheet(body);
  }
}
