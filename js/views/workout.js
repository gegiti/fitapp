import { el, replace, sheet, confirmAsync, cap } from "../ui.js";
import { totals, formatDuration, moveStep, stepIncrement, clampSeconds, clampRest } from "../workout.js";
import { getExercise, figureUrl } from "../exercises.js";

export function render({ store, params, navigate }) {
  const st = store.state;
  const w = st.workouts.find(x => x.id === params.id);
  if (!w) { navigate("/plan"); return { el: el("div"), tabs: "plan" }; }
  const root = el("div");
  draw();
  return { el: root, tabs: "plan" };

  function draw() {
    const t = totals(w);
    const title = el("input", { class: "title-input", value: w.name, "aria-label": "Workout name", enterkeyhint: "done",
      onChange: async e => { w.name = e.target.value.trim() || w.name; e.target.value = w.name; await store.save(); },
      onKeydown: e => { if (e.key === "Enter") e.target.blur(); } });
    replace(root,
      el("div", { class: "header" }, el("a", { class: "link", href: "#/plan" }, "‹ Plan"), title, el("span", { class: "link right" })),
      el("div", { class: "sub" }, `Total ${formatDuration(t.total)}  ·  ${formatDuration(t.work)} work + ${formatDuration(t.rest)} rest`),
      el("div", { class: "rows", id: "steps" }, ...w.steps.map(stepRow)),
      w.steps.length ? null : el("div", { class: "empty" }, "No exercises yet."),
      el("button", { class: "btn secondary", style: { marginTop: "16px" }, onClick: () => navigate(`/plan/bank/pick/${w.id}`) }, "+ Add exercise"),
      el("button", { class: "text-danger block-btn", style: { marginTop: "28px" }, onClick: async () => {
        if (!(await confirmAsync(`Delete "${w.name}"?`))) return;
        st.workouts = st.workouts.filter(x => x.id !== w.id);
        await store.save();
        navigate("/plan");
      } }, "Delete workout"),
    );
    enableDrag(root.querySelector("#steps"));
  }

  function stepRow(s, i) {
    const ex = getExercise(s.exerciseId);
    const last = i === w.steps.length - 1;
    return el("div", { class: "row-item", dataset: { index: i } },
      el("span", { class: "handle", "aria-label": "Drag to reorder" }, "≡"),
      el("span", { class: "idx" }, i + 1),
      el("span", { class: "thumb" }, ex ? el("img", { src: figureUrl(ex.id, "flexed"), alt: "" }) : null),
      el("button", { class: `label${ex ? "" : " muted"}`, onClick: () => openSheet(i) }, ex ? ex.name : "Missing exercise"),
      ex?.sided ? el("span", { class: "badge" }, "L/R") : null,
      el("span", { class: "time" }, `${s.seconds}s`),
      el("span", { class: `rest${last ? " inert" : ""}`, title: last ? "Rest after the last exercise is not run" : "" }, `+${s.restSeconds}s`),
      el("button", { class: "chev", "aria-label": "Edit step", onClick: () => openSheet(i) }, "›"),
    );
  }

  function openSheet(i) {
    const s = w.steps[i];
    const ex = getExercise(s.exerciseId);
    const inc = ex ? stepIncrement(ex) : 5;
    const body = el("div");
    const close = sheet(body, { onClose: async () => { await store.save(); draw(); } });
    const move = async (to) => { w.steps = moveStep(w.steps, i, to); close(); };
    const paint = () => body.replaceChildren(
      el("h2", {}, ex ? ex.name : "Missing exercise"),
      el("div", { class: `type ${ex?.type ?? ""}` }, ex ? `${cap(ex.type)}${ex.sided ? " · sided" : ""}` : "This exercise no longer exists in the app"),
      ex ? stepper("Exercise time", s.seconds, inc, v => { s.seconds = clampSeconds(v, ex); },
        `${ex.sided ? `${s.seconds / 2} s per side · ` : ""}default for this exercise: ${ex.defaultSeconds} s`) : null,
      ex ? stepper("Rest after", s.restSeconds, 5, v => { s.restSeconds = clampRest(v); },
        `default for this exercise: ${ex.defaultRestSeconds} s${i === w.steps.length - 1 ? " · not run after the last exercise" : ""}`, true) : null,
      el("div", { class: "move-row" },
        el("button", { class: "btn raised", disabled: i === 0, onClick: () => move(i - 1) }, "▲ Move up"),
        el("button", { class: "btn raised", disabled: i === w.steps.length - 1, onClick: () => move(i + 1) }, "▼ Move down")),
      el("button", { class: "text-danger block-btn", style: { margin: "0 0 12px" }, onClick: () => { w.steps.splice(i, 1); close(); } }, "Remove from workout"),
      el("button", { class: "btn primary", onClick: close }, "Done"),
    );
    function stepper(label, value, step, set, hint, small = false) {
      return el("div", { class: "stepper" },
        el("div", { class: "label" }, label),
        el("div", { class: "ctl" },
          el("button", { "aria-label": `Less ${label}`, onClick: () => { set(value - step); paint(); } }, "–"),
          el("span", { class: `val${small ? " small" : ""}` }, `${value} s`),
          el("button", { "aria-label": `More ${label}`, onClick: () => { set(value + step); paint(); } }, "+")),
        el("div", { class: "hint" }, hint));
    }
    paint();
  }

  function enableDrag(list) {
    if (!list) return;
    let dragging = null, startY = 0, from = -1, rowH = 0;
    list.querySelectorAll(".handle").forEach(h => h.addEventListener("pointerdown", e => {
      dragging = h.closest(".row-item");
      from = +dragging.dataset.index;
      startY = e.clientY;
      rowH = dragging.offsetHeight;
      dragging.classList.add("dragging");
      h.setPointerCapture(e.pointerId);
      e.preventDefault();
    }));
    list.addEventListener("pointermove", e => {
      if (!dragging) return;
      dragging.style.transform = `translateY(${e.clientY - startY}px)`;
    });
    const finish = async e => {
      if (!dragging) return;
      const delta = Math.round((e.clientY - startY) / rowH);
      const to = Math.max(0, Math.min(w.steps.length - 1, from + delta));
      dragging.style.transform = "";
      dragging.classList.remove("dragging");
      dragging = null;
      if (to !== from) { w.steps = moveStep(w.steps, from, to); await store.save(); }
      draw();
    };
    list.addEventListener("pointerup", finish);
    list.addEventListener("pointercancel", finish);
  }
}
